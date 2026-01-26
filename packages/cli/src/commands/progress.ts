import { Command } from "commander";
import chalk from "chalk";
import { watch } from "chokidar";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import logUpdate from "log-update";
import { requireOcrSetup, ensureSessionsDir } from "../lib/guards";

/**
 * Total number of phases in the OCR review workflow
 */
const TOTAL_PHASES = 8;

type ReviewPhase =
  | "waiting"
  | "context"
  | "requirements"
  | "analysis"
  | "reviews"
  | "aggregation"
  | "discourse"
  | "synthesis"
  | "complete";

type ReviewerStatus = {
  name: string;
  displayName: string;
  status: "pending" | "in_progress" | "complete";
  findings: number;
};

type SessionState = {
  session: string;
  phase: ReviewPhase;
  phaseNumber: number;
  totalPhases: number;
  // Phase completion flags
  contextComplete: boolean;
  requirementsComplete: boolean;
  analysisComplete: boolean;
  reviewsComplete: boolean;
  aggregationComplete: boolean;
  discourseComplete: boolean;
  synthesisComplete: boolean;
  // Reviewers
  reviewers: ReviewerStatus[];
  // Timing
  startTime: number;
  complete: boolean;
};

function getSessionsDir(targetDir: string): string {
  return join(targetDir, ".ocr", "sessions");
}

function findLatestSession(sessionsDir: string): string | null {
  if (!existsSync(sessionsDir)) {
    return null;
  }

  const sessions = readdirSync(sessionsDir)
    .filter((name) => {
      const sessionPath = join(sessionsDir, name);
      return statSync(sessionPath).isDirectory();
    })
    .sort()
    .reverse();

  return sessions[0] ?? null;
}

function countFindings(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }

  const content = readFileSync(filePath, "utf-8");
  const findingMatches = content.match(/^##\s+(Finding|Issue|Suggestion)/gm);
  return findingMatches?.length ?? 0;
}

function formatReviewerName(filename: string): string {
  // Convert "principal-1" to "Principal #1"
  const base = filename.replace(".md", "");
  const match = base.match(/^(.+)-(\d+)$/);
  if (match && match[1] && match[2]) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} #${match[2]}`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

type StateJson = {
  session_id: string;
  current_phase: ReviewPhase;
  phase_number: number;
  completed_phases: string[];
  reviewers?: {
    assigned: string[];
    complete: string[];
  };
  started_at?: string;
  updated_at?: string;
};

function parseSessionState(
  sessionPath: string,
  preservedStartTime?: number,
): SessionState | null {
  const session = basename(sessionPath);
  const statePath = join(sessionPath, "state.json");

  // state.json is REQUIRED - no fallback to file existence
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const stateContent = readFileSync(statePath, "utf-8");
    const state: StateJson = JSON.parse(stateContent);
    return parseFromStateJson(session, state, sessionPath, preservedStartTime);
  } catch {
    // Invalid JSON or read error - treat as no valid state
    return null;
  }
}

function parseFromStateJson(
  session: string,
  state: StateJson,
  sessionPath: string,
  preservedStartTime?: number,
): SessionState {
  const startTime =
    preservedStartTime ??
    (state.started_at ? new Date(state.started_at).getTime() : Date.now());

  const completed = new Set(state.completed_phases);
  const reviewsDir = join(sessionPath, "reviews");

  // Parse reviewers from directory (more accurate than state file)
  const reviewers: ReviewerStatus[] = [];
  if (existsSync(reviewsDir)) {
    const reviewFiles = readdirSync(reviewsDir).filter((f) =>
      f.endsWith(".md"),
    );
    for (const file of reviewFiles) {
      const reviewPath = join(reviewsDir, file);
      const findings = countFindings(reviewPath);
      reviewers.push({
        name: file.replace(".md", ""),
        displayName: formatReviewerName(file),
        status: "complete",
        findings,
      });
    }
  }

  return {
    session,
    phase: state.current_phase,
    phaseNumber: state.phase_number,
    totalPhases: TOTAL_PHASES,
    contextComplete: completed.has("context"),
    requirementsComplete: completed.has("requirements"),
    analysisComplete: completed.has("analysis"),
    reviewsComplete: completed.has("reviews"),
    aggregationComplete: completed.has("aggregation"),
    discourseComplete: completed.has("discourse"),
    synthesisComplete: completed.has("synthesis"),
    reviewers,
    startTime,
    complete: state.current_phase === "complete",
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const PHASE_INFO: Array<{ key: ReviewPhase; label: string; icon: string }> = [
  { key: "context", label: "Context Discovery", icon: "📋" },
  { key: "requirements", label: "Requirements Gathering", icon: "📝" },
  { key: "analysis", label: "Tech Lead Analysis", icon: "🔍" },
  { key: "reviews", label: "Parallel Reviews", icon: "👥" },
  { key: "aggregation", label: "Aggregate Findings", icon: "📊" },
  { key: "discourse", label: "Reviewer Discourse", icon: "💬" },
  { key: "synthesis", label: "Final Synthesis", icon: "✨" },
  { key: "complete", label: "Review Complete", icon: "🎉" },
];

function getPhaseIcon(
  phaseKey: ReviewPhase,
  isComplete: boolean,
  isCurrent: boolean,
): string {
  if (isComplete) return chalk.green("✓");
  if (isCurrent) return chalk.yellow("●");
  return chalk.dim("○");
}

function renderProgressBar(current: number, total: number): string {
  const width = 20;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  const percent = Math.round((current / total) * 100);
  return `${bar} ${percent}%`;
}

function renderProgress(state: SessionState): void {
  // Collect output lines for log-update
  const lines: string[] = [];
  const log = (line: string = "") => lines.push(line);

  // Header
  const title = "Open Code Review - Live Progress";
  const boxWidth = title.length + 4;
  const border = "─".repeat(boxWidth);
  log(chalk.bold.cyan(`  ┌${border}┐`));
  log(
    chalk.bold.cyan("  │") + chalk.bold(`  ${title}  `) + chalk.bold.cyan("│"),
  );
  log(chalk.bold.cyan(`  └${border}┘`));
  log();

  // Session info
  const elapsed = Date.now() - state.startTime;
  log(chalk.dim(`  Session:  `) + chalk.white(state.session));
  log(chalk.dim(`  Elapsed:  `) + chalk.white(formatDuration(elapsed)));
  log();

  // Progress bar
  const progressPhases = state.complete ? 8 : state.phaseNumber;
  log(`  ${renderProgressBar(progressPhases, 8)}`);
  log();

  // Current phase highlight
  const currentPhase = PHASE_INFO.find((p) => p.key === state.phase);
  if (currentPhase && !state.complete) {
    log(
      chalk.bold(`  ${currentPhase.icon} `) +
        chalk.bold.yellow(currentPhase.label) +
        chalk.yellow(" in progress..."),
    );
    log();
  }

  // Phase checklist
  log(chalk.dim("  ─── Workflow Phases ───"));
  log();

  const phaseCompletion: Record<ReviewPhase, boolean> = {
    waiting: false,
    context: state.contextComplete,
    requirements: state.requirementsComplete,
    analysis: state.analysisComplete,
    reviews: state.reviewsComplete,
    aggregation: state.aggregationComplete,
    discourse: state.discourseComplete,
    synthesis: state.synthesisComplete,
    complete: state.complete,
  };

  for (const phase of PHASE_INFO) {
    const isComplete = phaseCompletion[phase.key];
    const isCurrent = state.phase === phase.key && !state.complete;
    const icon = getPhaseIcon(phase.key, isComplete, isCurrent);

    let label = phase.label;
    if (isCurrent) {
      label = chalk.yellow(label);
    } else if (isComplete) {
      label = chalk.white(label);
    } else {
      label = chalk.dim(label);
    }

    log(`  ${icon} ${label}`);

    // Show reviewers under the reviews phase
    if (phase.key === "reviews" && state.reviewers.length > 0) {
      for (const reviewer of state.reviewers) {
        const reviewerIcon =
          reviewer.status === "complete" ? chalk.green("✓") : chalk.dim("○");
        const findings =
          reviewer.findings > 0
            ? chalk.cyan(
                ` → ${reviewer.findings} finding${reviewer.findings > 1 ? "s" : ""}`,
              )
            : "";
        log(
          chalk.dim(`     └─ `) +
            `${reviewerIcon} ${chalk.dim(reviewer.displayName)}${findings}`,
        );
      }
    }
  }

  log();

  // Footer
  if (state.complete) {
    const totalFindings = state.reviewers.reduce(
      (sum, r) => sum + r.findings,
      0,
    );
    log(chalk.green.bold("  ✅ Review Complete!"));
    if (totalFindings > 0) {
      log(
        chalk.dim(
          `     ${totalFindings} total finding${totalFindings > 1 ? "s" : ""} identified`,
        ),
      );
    }
    log();
    log(
      chalk.dim("  Results saved to: ") +
        chalk.white(`.ocr/sessions/${state.session}/final.md`),
    );
  } else {
    log(chalk.dim("  Press Ctrl+C to exit"));
  }
  log();

  // Use log-update for flicker-free terminal updates
  logUpdate(lines.join("\n"));
}

function renderWaiting(): void {
  // Collect output lines for log-update
  const lines: string[] = [];
  const log = (line: string = "") => lines.push(line);

  // Header (matching the main progress UI)
  const title = "Open Code Review - Live Progress";
  const boxWidth = title.length + 4;
  const border = "─".repeat(boxWidth);
  log(chalk.bold.cyan(`  ┌${border}┐`));
  log(
    chalk.bold.cyan("  │") + chalk.bold(`  ${title}  `) + chalk.bold.cyan("│"),
  );
  log(chalk.bold.cyan(`  └${border}┘`));
  log();

  // Waiting state
  log(chalk.dim("  Session:  ") + chalk.yellow("Waiting for session..."));
  log();

  // Progress bar (empty)
  const bar = chalk.dim("░".repeat(20));
  log(`  ${bar} 0%`);
  log();

  // Instructions
  log(chalk.yellow("  ⏳ Waiting for a code review to begin..."));
  log();
  log(chalk.dim("  ─── How to Start ───"));
  log();
  log(
    chalk.dim("  Run ") +
      chalk.white("/ocr-review") +
      chalk.dim(" in your AI assistant to begin"),
  );
  log(chalk.dim("  This display will update automatically"));
  log();
  log(chalk.dim("  Press Ctrl+C to exit"));
  log();

  // Use log-update for flicker-free terminal updates
  logUpdate(lines.join("\n"));
}

export const progressCommand = new Command("progress")
  .description("Watch real-time progress of a code review session")
  .option("-s, --session <name>", "Specify session name")
  .action(async (options: { session?: string }) => {
    const targetDir = process.cwd();

    // Guard: Require OCR to be set up
    requireOcrSetup(targetDir);

    // Ensure sessions directory exists (JIT bootstrap)
    const sessionsDir = ensureSessionsDir(targetDir);
    const ocrDir = join(targetDir, ".ocr");

    // If specific session requested, error if not found
    if (options.session) {
      const sessionPath = join(sessionsDir, options.session);
      if (!existsSync(sessionPath)) {
        console.log(chalk.red(`Session not found: ${options.session}`));
        process.exit(1);
      }

      let state = parseSessionState(sessionPath);
      if (!state) {
        console.log(
          chalk.red(
            `Session ${options.session} has no state.json - cannot track progress`,
          ),
        );
        console.log(
          chalk.dim(
            `The orchestrating agent must create state.json for progress tracking.`,
          ),
        );
        process.exit(1);
      }
      let preservedStartTime = state.startTime;
      renderProgress(state);

      // Periodic timer update (every second)
      const timerInterval = setInterval(() => {
        const newState = parseSessionState(sessionPath, preservedStartTime);
        if (newState) {
          state = newState;
          renderProgress(state);
        }
      }, 1000);

      const watcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 2,
      });

      watcher.on("all", () => {
        const newState = parseSessionState(sessionPath, preservedStartTime);
        if (newState) {
          state = newState;
          renderProgress(state);
        }
      });

      process.on("SIGINT", () => {
        clearInterval(timerInterval);
        watcher.close();
        logUpdate.done(); // Persist final output
        process.exit(0);
      });

      return;
    }

    // Auto-detect mode: watch for sessions
    let currentSession = findLatestSession(sessionsDir);
    let currentSessionPath = currentSession
      ? join(sessionsDir, currentSession)
      : null;
    let sessionWatcher: ReturnType<typeof watch> | null = null;
    let preservedStartTime: number | undefined;

    const updateDisplay = () => {
      if (currentSessionPath && existsSync(currentSessionPath)) {
        const state = parseSessionState(currentSessionPath, preservedStartTime);
        if (state) {
          // Preserve start time on first parse
          if (!preservedStartTime) {
            preservedStartTime = state.startTime;
          }
          renderProgress(state);
        } else {
          // No state.json yet - show waiting
          renderWaiting();
        }
      } else {
        preservedStartTime = undefined;
        renderWaiting();
      }
    };

    const watchSession = (sessionPath: string) => {
      if (sessionWatcher) {
        sessionWatcher.close();
      }
      sessionWatcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 2,
      });
      sessionWatcher.on("all", updateDisplay);
    };

    // Initial display
    updateDisplay();

    if (currentSessionPath) {
      watchSession(currentSessionPath);
    }

    // Periodic timer update (every second)
    const timerInterval = setInterval(updateDisplay, 1000);

    // Watch for new sessions in .ocr directory (or parent if .ocr doesn't exist)
    const watchDir = existsSync(ocrDir) ? ocrDir : targetDir;
    const dirWatcher = watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
    });

    dirWatcher.on("addDir", (dirPath) => {
      // Only treat direct children of sessions/ as new sessions
      // Ignore subdirectories like reviews/ inside existing sessions
      const parentDir = join(dirPath, "..");
      const isDirectChild =
        parentDir.endsWith("sessions") ||
        parentDir.endsWith(join(".ocr", "sessions"));

      if (isDirectChild && !dirPath.endsWith("sessions")) {
        const newSession = basename(dirPath);
        currentSession = newSession;
        currentSessionPath = dirPath;
        preservedStartTime = undefined; // Reset for new session
        watchSession(dirPath);
        updateDisplay();
      }
    });

    dirWatcher.on("add", updateDisplay);
    dirWatcher.on("change", updateDisplay);

    process.on("SIGINT", () => {
      clearInterval(timerInterval);
      dirWatcher.close();
      if (sessionWatcher) sessionWatcher.close();
      logUpdate.done(); // Persist final output
      process.exit(0);
    });
  });
