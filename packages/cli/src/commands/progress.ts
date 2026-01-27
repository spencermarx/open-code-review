import { Command } from "commander";
import chalk from "chalk";
import { watch } from "chokidar";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import logUpdate from "log-update";
import { requireOcrSetup, ensureSessionsDir } from "../lib/guards";

/**
 * Debounce function to prevent rapid successive calls
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Track last render state to detect context switches
 */
let lastRenderType: "progress" | "waiting" | null = null;
let lastLineCount = 0;

/**
 * Total number of phases in the OCR review workflow
 */
const TOTAL_PHASES = 8;

type ReviewPhase =
  | "waiting"
  | "context"
  | "change-context"
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

type RoundInfo = {
  round: number;
  isComplete: boolean;
  reviewers: string[];
};

type SessionState = {
  session: string;
  phase: ReviewPhase;
  phaseNumber: number;
  totalPhases: number;
  // Phase completion flags (derived from filesystem, not state.json)
  contextComplete: boolean;
  changeContextComplete: boolean;
  analysisComplete: boolean;
  reviewsComplete: boolean;
  aggregationComplete: boolean;
  discourseComplete: boolean;
  synthesisComplete: boolean;
  // Rounds
  currentRound: number;
  rounds: RoundInfo[];
  // Reviewers (current round)
  reviewers: ReviewerStatus[];
  // Timing
  startTime: number;
  complete: boolean;
};

/**
 * Check if a session is active (not closed or complete)
 */
function isSessionActive(sessionPath: string): boolean {
  const statePath = join(sessionPath, "state.json");
  if (!existsSync(statePath)) {
    return true; // No state.json = potentially new session, treat as active
  }

  try {
    const stateContent = readFileSync(statePath, "utf-8");
    const state: StateJson = JSON.parse(stateContent);
    // Session is NOT active if:
    // - status is "closed", OR
    // - current_phase is "complete" (handles legacy sessions without status field)
    if (state.status === "closed" || state.current_phase === "complete") {
      return false;
    }
    return true;
  } catch {
    return true; // Parse error = treat as active
  }
}

/**
 * Find the latest active session (status !== "closed")
 */
function findLatestActiveSession(sessionsDir: string): string | null {
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

  // Find first active session (most recent first)
  for (const session of sessions) {
    const sessionPath = join(sessionsDir, session);
    if (isSessionActive(sessionPath)) {
      return session;
    }
  }

  return null;
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

type SessionStatus = "active" | "closed";

type StateJson = {
  session_id: string;
  status?: SessionStatus;
  current_phase: ReviewPhase;
  phase_number: number;
  current_round?: number;
  started_at?: string;
  round_started_at?: string; // When current round began (for multi-round timing)
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
  // For multi-round sessions, prefer round_started_at over session started_at
  // This ensures the timer shows elapsed time for the current round, not the whole session
  const effectiveStartTime = state.round_started_at ?? state.started_at;
  const startTime =
    preservedStartTime ??
    (effectiveStartTime ? new Date(effectiveStartTime).getTime() : Date.now());

  const currentRound = state.current_round ?? 1;
  const roundsDir = join(sessionPath, "rounds");
  const currentRoundDir = join(roundsDir, `round-${currentRound}`);
  const reviewsDir = join(currentRoundDir, "reviews");

  // Derive rounds from filesystem (not from state.json)
  const rounds: RoundInfo[] = deriveRoundsFromFilesystem(roundsDir);

  // Parse reviewers from current round's reviews directory
  const reviewers: ReviewerStatus[] = [];

  if (existsSync(reviewsDir)) {
    const entries = readdirSync(reviewsDir);
    const reviewFiles = entries.filter((f) => f.endsWith(".md"));

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

  // Derive phase completion from filesystem (not from state.json)
  // Phase 1 (context): Creates discovered-standards.md
  const contextComplete = existsSync(
    join(sessionPath, "discovered-standards.md"),
  );
  // Phase 2 (change-context): Creates context.md with change summary
  const changeContextComplete = existsSync(join(sessionPath, "context.md"));
  // Phase 3 (analysis): Appends Tech Lead guidance to context.md
  // We can't distinguish Phase 2 vs 3 from filesystem alone - rely on state.json current_phase
  const analysisComplete = changeContextComplete;
  // Phase 4 (reviews): Complete when agent advances past phase 4
  const reviewsComplete = state.phase_number > 4;
  const discourseComplete = existsSync(join(currentRoundDir, "discourse.md"));
  const synthesisComplete = existsSync(join(currentRoundDir, "final.md"));

  return {
    session,
    phase: state.current_phase,
    phaseNumber: state.phase_number,
    totalPhases: TOTAL_PHASES,
    contextComplete,
    changeContextComplete,
    analysisComplete,
    reviewsComplete,
    aggregationComplete: reviewsComplete, // Aggregation is inline
    discourseComplete,
    synthesisComplete,
    currentRound,
    rounds,
    reviewers,
    startTime,
    complete: state.current_phase === "complete",
  };
}

/**
 * Derive round information from filesystem
 */
function deriveRoundsFromFilesystem(roundsDir: string): RoundInfo[] {
  if (!existsSync(roundsDir)) {
    return [];
  }

  const roundDirs = readdirSync(roundsDir)
    .filter((d) => d.match(/^round-\d+$/))
    .sort((a, b) => {
      const numA = parseInt(a.replace("round-", ""));
      const numB = parseInt(b.replace("round-", ""));
      return numA - numB;
    });

  return roundDirs.map((dir) => {
    const roundNum = parseInt(dir.replace("round-", ""));
    const roundPath = join(roundsDir, dir);
    const reviewsPath = join(roundPath, "reviews");
    const finalPath = join(roundPath, "final.md");

    // Get reviewers from reviews directory
    const reviewers: string[] = [];
    if (existsSync(reviewsPath)) {
      const files = readdirSync(reviewsPath).filter((f) => f.endsWith(".md"));
      reviewers.push(...files.map((f) => f.replace(".md", "")));
    }

    return {
      round: roundNum,
      isComplete: existsSync(finalPath),
      reviewers,
    };
  });
}

function formatDuration(ms: number): string {
  // Handle negative durations (future start times) gracefully
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let duration: string;
  if (hours > 0) {
    duration = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    duration = `${minutes}m ${seconds}s`;
  } else {
    duration = `${seconds}s`;
  }

  // Don't show negative sign - just show elapsed time
  return duration;
}

const PHASE_INFO: Array<{ key: ReviewPhase; label: string }> = [
  { key: "context", label: "Context Discovery" },
  { key: "change-context", label: "Change Context" },
  { key: "analysis", label: "Tech Lead Analysis" },
  { key: "reviews", label: "Parallel Reviews" },
  { key: "aggregation", label: "Aggregate Findings" },
  { key: "discourse", label: "Reviewer Discourse" },
  { key: "synthesis", label: "Final Synthesis" },
  { key: "complete", label: "Complete" },
];

function getPhaseStatus(isComplete: boolean, isCurrent: boolean): string {
  if (isComplete) return chalk.green("✓");
  if (isCurrent) return chalk.cyan("▸");
  return chalk.dim("·");
}

function renderProgressBar(
  current: number,
  total: number,
  label?: string,
): string {
  const width = 24;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green("━".repeat(filled)) + chalk.dim("─".repeat(empty));
  const percent = Math.round((current / total) * 100);
  const percentStr = chalk.bold.white(`${percent}%`);
  return label
    ? `${bar}  ${percentStr} ${chalk.dim("·")} ${chalk.cyan(label)}`
    : `${bar}  ${percentStr}`;
}

function renderProgress(state: SessionState): void {
  const lines: string[] = [];
  const log = (line: string = "") => lines.push(line);

  // Minimal header
  log();
  log(chalk.bold.white("  Open Code Review"));
  log();

  // Session + round + elapsed on one line
  const elapsed = Date.now() - state.startTime;
  const roundInfo =
    state.currentRound > 1
      ? chalk.cyan(` Round ${state.currentRound}`) + chalk.dim("  ·  ")
      : "";
  log(
    chalk.dim("  ") +
      chalk.white(state.session) +
      chalk.dim("  ·  ") +
      roundInfo +
      chalk.white(formatDuration(elapsed)),
  );
  log();

  // Progress bar with current phase inline
  const progressPhases = state.complete ? 8 : state.phaseNumber;
  const currentPhase = PHASE_INFO.find((p) => p.key === state.phase);
  const phaseLabel = state.complete ? "Done" : currentPhase?.label;
  log(`  ${renderProgressBar(progressPhases, 8, phaseLabel)}`);
  log();

  // Phase completion map
  const phaseCompletion: Record<ReviewPhase, boolean> = {
    waiting: false,
    context: state.contextComplete,
    "change-context": state.changeContextComplete,
    analysis: state.analysisComplete,
    reviews: state.reviewsComplete,
    aggregation: state.aggregationComplete,
    discourse: state.discourseComplete,
    synthesis: state.synthesisComplete,
    complete: state.complete,
  };

  // Compact phase list
  for (const phase of PHASE_INFO) {
    const isComplete = phaseCompletion[phase.key];
    const isCurrent = state.phase === phase.key && !state.complete;
    const status = getPhaseStatus(isComplete, isCurrent);

    let label: string;
    if (isCurrent) {
      label = chalk.cyan.bold(phase.label);
    } else if (isComplete) {
      label = chalk.white(phase.label);
    } else {
      label = chalk.dim(phase.label);
    }

    log(`  ${status} ${label}`);

    // Show reviewers inline under reviews phase
    if (phase.key === "reviews" && state.reviewers.length > 0) {
      // Show current round label if multiple rounds
      if (state.currentRound > 1) {
        log(chalk.dim("    ") + chalk.cyan(`Round ${state.currentRound}`));
      }
      const reviewerLine = state.reviewers
        .map((r) => {
          const icon =
            r.status === "complete" ? chalk.green("✓") : chalk.dim("○");
          const name = chalk.dim(r.displayName);
          const count =
            r.findings > 0 ? chalk.cyan(` ${r.findings}`) : chalk.dim(" 0");
          return `${icon} ${name}${count}`;
        })
        .join(chalk.dim("  │  "));
      log(chalk.dim("    ") + reviewerLine);

      // Show previous rounds summary if any
      if (state.rounds.length > 1) {
        const prevRounds = state.rounds.slice(0, -1);
        for (const round of prevRounds) {
          const roundLabel = chalk.dim(`    Round ${round.round}`);
          const reviewerCount = round.reviewers.length;
          const status = round.isComplete ? chalk.green("✓") : chalk.dim("○");
          log(
            `${roundLabel} ${status} ${chalk.dim(`${reviewerCount} reviewers`)}`,
          );
        }
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
    log(
      chalk.green.bold("  ✓ Complete") +
        chalk.dim(" · ") +
        chalk.white(
          `${totalFindings} finding${totalFindings !== 1 ? "s" : ""}`,
        ),
    );
    log(
      chalk.dim("    ") +
        chalk.dim("→ ") +
        chalk.white(
          `.ocr/sessions/${state.session}/rounds/round-${state.currentRound}/final.md`,
        ),
    );
  } else {
    log(chalk.dim("  Ctrl+C to exit"));
  }
  log();

  // Clear previous output if switching render types
  if (lastRenderType !== "progress") {
    logUpdate.clear();
  }
  lastRenderType = "progress";

  // Pad with empty lines if current render has fewer lines than previous
  // This prevents stale content from persisting in the terminal
  while (lines.length < lastLineCount) {
    lines.push("");
  }
  lastLineCount = lines.length;

  logUpdate(lines.join("\n"));
}

function renderWaiting(): void {
  const lines: string[] = [];
  const log = (line: string = "") => lines.push(line);

  log();
  log(chalk.bold.white("  Open Code Review"));
  log();
  log(chalk.dim("  Waiting for session..."));
  log();

  // Empty progress bar
  const bar = chalk.dim("─".repeat(24));
  log(`  ${bar}  ${chalk.dim("0%")}`);
  log();

  // Minimal instructions
  log(
    chalk.dim("  Run ") + chalk.white("/ocr-review") + chalk.dim(" to start"),
  );
  log();
  log(chalk.dim("  Ctrl+C to exit"));
  log();

  // Clear previous output if switching render types
  if (lastRenderType !== "waiting") {
    logUpdate.clear();
  }
  lastRenderType = "waiting";

  // Pad with empty lines if current render has fewer lines than previous
  while (lines.length < lastLineCount) {
    lines.push("");
  }
  lastLineCount = lines.length;

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

      // Depth 3 needed to detect files at rounds/round-{n}/reviews/*.md
      const watcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 3,
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
    let currentSession = findLatestActiveSession(sessionsDir);
    let currentSessionPath = currentSession
      ? join(sessionsDir, currentSession)
      : null;
    let sessionWatcher: ReturnType<typeof watch> | null = null;
    let preservedStartTime: number | undefined;

    const updateDisplayImpl = () => {
      // Re-check for latest active session if current session is complete/closed or doesn't exist
      if (
        !currentSessionPath ||
        !existsSync(currentSessionPath) ||
        !isSessionActive(currentSessionPath)
      ) {
        const latestActive = findLatestActiveSession(sessionsDir);
        if (latestActive && latestActive !== currentSession) {
          currentSession = latestActive;
          currentSessionPath = join(sessionsDir, latestActive);
          preservedStartTime = undefined; // Reset for new session
          watchSession(currentSessionPath);
        } else if (!latestActive) {
          currentSession = null;
          currentSessionPath = null;
          preservedStartTime = undefined;
        }
      }

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

    // Debounce updateDisplay to prevent rapid successive renders
    const updateDisplay = debounce(updateDisplayImpl, 50);

    const watchSession = (sessionPath: string) => {
      if (sessionWatcher) {
        sessionWatcher.close();
      }
      // Depth 3 needed to detect files at rounds/round-{n}/reviews/*.md
      sessionWatcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 3,
      });
      sessionWatcher.on("all", updateDisplay);
    };

    // Initial display (call impl directly, not debounced)
    updateDisplayImpl();

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
