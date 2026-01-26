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

/**
 * Check if a session is active (not closed)
 */
function isSessionActive(sessionPath: string): boolean {
  const statePath = join(sessionPath, "state.json");
  if (!existsSync(statePath)) {
    return true; // No state.json = potentially new session, treat as active
  }

  try {
    const stateContent = readFileSync(statePath, "utf-8");
    const state: StateJson = JSON.parse(stateContent);
    // Sessions without status field are treated as active (backwards compatibility)
    // Sessions with status: "closed" are not active
    return state.status !== "closed";
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
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

const PHASE_INFO: Array<{ key: ReviewPhase; label: string }> = [
  { key: "context", label: "Context Discovery" },
  { key: "requirements", label: "Requirements Gathering" },
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

  // Session + elapsed on one line
  const elapsed = Date.now() - state.startTime;
  log(
    chalk.dim("  ") +
      chalk.white(state.session) +
      chalk.dim("  ·  ") +
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
    requirements: state.requirementsComplete,
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
        chalk.white(`.ocr/sessions/${state.session}/final.md`),
    );
  } else {
    log(chalk.dim("  Ctrl+C to exit"));
  }
  log();

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
    let currentSession = findLatestActiveSession(sessionsDir);
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
