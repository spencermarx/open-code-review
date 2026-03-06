import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  X,
  Loader2,
  Check,
  ExternalLink,
  RefreshCw,
  Save,
  Eye,
  Edit3,
  Github,
  FileText,
  User,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Search,
  BookOpen,
  Brain,
  Wrench,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { MarkdownRenderer } from "../../../components/markdown/markdown-renderer";
import { usePostReview, type ActivityLogEntry } from "../hooks/use-post-review";

type PostReviewDialogProps = {
  sessionId: string;
  roundNumber: number;
  finalContent: string;
  savedHumanReview?: string;
}

function formatElapsedTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function generationPhaseLabel(
  hasTools: boolean,
  hasContent: boolean,
  currentTool?: string,
): string {
  if (currentTool === "Write") return "Rewriting as your voice";
  if (hasContent) return "Writing review";
  if (hasTools) return "Analyzing source material";
  return "Starting up";
}

function ActivityIcon({ tool }: { tool: string }) {
  switch (tool) {
    case "Read":
      return <BookOpen className="h-3 w-3 shrink-0" />;
    case "Glob":
    case "Grep":
      return <Search className="h-3 w-3 shrink-0" />;
    case "thinking":
      return <Brain className="h-3 w-3 shrink-0" />;
    default:
      return <Wrench className="h-3 w-3 shrink-0" />;
  }
}

export function PostReviewDialog({
  sessionId,
  roundNumber,
  finalContent,
  savedHumanReview,
}: PostReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const {
    step,
    checkResult,
    streamingContent,
    generatedContent,
    toolStatus,
    activityLog,
    elapsedSeconds,
    postResult,
    error,
    checkGitHub,
    generate,
    cancelGeneration,
    saveDraft,
    submitToGitHub,
    reset,
    setStep,
  } = usePostReview();
  const [activityExpanded, setActivityExpanded] = useState(true);
  const hasAutoCollapsed = useRef(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setEditMode(false);
    setEditContent("");
    reset();
  }, [reset]);

  // Open and trigger gh check
  const handleOpen = useCallback(() => {
    setOpen(true);
    checkGitHub(sessionId);
  }, [sessionId, checkGitHub]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "generating") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close, step]);

  // Auto-collapse activity log once streaming text begins
  useEffect(() => {
    if (
      step === "generating" &&
      streamingContent &&
      !hasAutoCollapsed.current
    ) {
      hasAutoCollapsed.current = true;
      setActivityExpanded(false);
    }
  }, [step, streamingContent]);

  // Reset collapse flag when a new generation starts
  useEffect(() => {
    if (step === "generating") {
      hasAutoCollapsed.current = false;
      setActivityExpanded(true);
    }
  }, [step]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (step === "generating") {
      streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingContent, step]);

  // The content to post — either edited, generated, saved human review, or original final
  const getPostContent = (): string => {
    if (editMode && editContent) return editContent;
    if (generatedContent) return generatedContent;
    if (savedHumanReview) return savedHumanReview;
    return finalContent;
  };

  const prNumber = checkResult?.prNumber ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <Send className="h-3.5 w-3.5" />
        Post to GitHub
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={step !== "generating" ? close : undefined}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-review-title"
            tabIndex={-1}
            className="relative z-10 flex w-full max-w-4xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            style={{ maxHeight: "85vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3
                id="post-review-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {step === "posted" ? "Review Posted" : "Post Review to GitHub"}
              </h3>
              <button
                onClick={close}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Checking step */}
              {step === "checking" && (
                <div className="flex items-center justify-center gap-3 py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Checking GitHub CLI...
                  </p>
                </div>
              )}

              {/* Ready step — choose post mode */}
              {step === "ready" && checkResult && (
                <div className="space-y-4">
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      <Github className="mr-1.5 inline h-4 w-4" />
                      PR #{checkResult.prNumber} on branch{" "}
                      <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">
                        {checkResult.branch}
                      </code>
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Post team review directly */}
                    <button
                      onClick={() => submitToGitHub(prNumber, finalContent)}
                      className="group rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-zinc-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-zinc-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          Post Team Review
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Post the original multi-reviewer synthesis as-is.
                      </p>
                    </button>

                    {/* Generate human review */}
                    <button
                      onClick={() => generate(sessionId, roundNumber)}
                      className="group rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <User className="h-5 w-5 text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          Generate Human Review
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Rewrite as a single human voice — sounds like you wrote
                        it.
                      </p>
                    </button>
                  </div>

                  {/* Saved human review option */}
                  {savedHumanReview && (
                    <button
                      onClick={() => {
                        setEditContent(savedHumanReview);
                        setStep("preview");
                      }}
                      className="w-full rounded-lg border border-dashed border-zinc-300 p-3 text-left text-sm text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
                    >
                      <Save className="mr-1.5 inline h-3.5 w-3.5" />
                      Use previously saved human review
                    </button>
                  )}
                </div>
              )}

              {/* Generating step — phase-aware progress + activity feed */}
              {step === "generating" && (
                <div className="space-y-4">
                  {/* Progress header — phase label + elapsed timer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex h-8 w-8 items-center justify-center">
                        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
                        <User className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {generationPhaseLabel(
                            activityLog.length > 0,
                            !!streamingContent,
                            toolStatus?.tool,
                          )}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          All findings preserved — just the tone changes
                        </p>
                      </div>
                    </div>
                    <span className="tabular-nums text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      {formatElapsedTime(elapsedSeconds)}
                    </span>
                  </div>

                  {/* Activity feed — collapsible under-the-hood view */}
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <button
                      type="button"
                      onClick={() => setActivityExpanded((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      <Loader2 className="h-3 w-3 animate-spin shrink-0 text-emerald-500" />
                      <span className="flex-1 truncate text-left font-medium">
                        {toolStatus?.detail ?? "Reading review files..."}
                      </span>
                      {activityLog.length > 0 && (
                        <span className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500">
                          <span className="tabular-nums">
                            {activityLog.length}
                          </span>
                          {activityExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </button>
                    {activityExpanded && activityLog.length > 0 && (
                      <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-700">
                        <div className="max-h-32 space-y-1 overflow-y-auto">
                          {activityLog.map((entry, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-500"
                            >
                              <ActivityIcon tool={entry.tool} />
                              <span className="truncate">{entry.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Streaming markdown preview (only if AI outputs text directly) */}
                  {streamingContent && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <Edit3 className="h-3 w-3" />
                        <span className="font-medium">Generated Review</span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownRenderer content={streamingContent} />
                      </div>
                    </>
                  )}
                  <div ref={streamEndRef} />
                </div>
              )}

              {/* Preview step — show generated/edited content */}
              {step === "preview" && (
                <div className="space-y-3">
                  {/* Tab bar */}
                  <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700">
                    <button
                      onClick={() => setEditMode(false)}
                      className={cn(
                        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                        !editMode
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300",
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(true);
                        if (!editContent) {
                          setEditContent(
                            generatedContent ||
                              savedHumanReview ||
                              finalContent,
                          );
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                        editMode
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300",
                      )}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>

                  {/* Content */}
                  {editMode ? (
                    <textarea
                      value={
                        editContent ||
                        generatedContent ||
                        savedHumanReview ||
                        finalContent
                      }
                      onChange={(e) => setEditContent(e.target.value)}
                      className="h-96 w-full rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownRenderer content={getPostContent()} />
                    </div>
                  )}
                </div>
              )}

              {/* Posting step */}
              {step === "posting" && (
                <div className="flex items-center justify-center gap-3 py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Posting to GitHub...
                  </p>
                </div>
              )}

              {/* Posted step */}
              {step === "posted" && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Review posted to GitHub
                  </p>
                  {postResult?.commentUrl && (
                    <a
                      href={postResult.commentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      View comment
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* Error step */}
              {step === "error" && (
                <div className="space-y-4 py-4">
                  <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              {/* Generating footer — cancel button */}
              {step === "generating" && (
                <button
                  onClick={() => cancelGeneration(sessionId, roundNumber)}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              )}

              {/* Preview footer — regenerate, save, post */}
              {step === "preview" && (
                <>
                  <button
                    onClick={() => generate(sessionId, roundNumber)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </button>
                  <button
                    onClick={() => {
                      saveDraft(sessionId, roundNumber, getPostContent());
                      setDraftSaved(true);
                      setTimeout(() => setDraftSaved(false), 2000);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      draftSaved
                        ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
                    )}
                  >
                    {draftSaved ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {draftSaved ? "Saved!" : "Save Draft"}
                  </button>
                  <button
                    onClick={() => {
                      const content = getPostContent();
                      saveDraft(sessionId, roundNumber, content);
                      submitToGitHub(prNumber, content);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Post to GitHub
                  </button>
                </>
              )}

              {/* Error footer — retry or close */}
              {step === "error" && (
                <>
                  <button
                    onClick={() => checkGitHub(sessionId)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  <button
                    onClick={close}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </>
              )}

              {/* Posted footer — close */}
              {step === "posted" && (
                <button
                  onClick={close}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
