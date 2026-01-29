/**
 * Progress Command
 *
 * Watch real-time progress of OCR workflows (review or map).
 * Uses strategy pattern for workflow-specific progress tracking.
 */

import { Command } from "commander";
import chalk from "chalk";
import { watch } from "chokidar";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import logUpdate from "log-update";
import { requireOcrSetup, ensureSessionsDir } from "../lib/guards.js";
import {
  getStrategy,
  detectWorkflowType,
  detectActiveWorkflows,
  isSessionActive,
  type WorkflowType,
  type WorkflowState,
  type WorkflowProgressStrategy,
} from "../lib/progress/index.js";

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

  for (const session of sessions) {
    const sessionPath = join(sessionsDir, session);
    if (isSessionActive(sessionPath)) {
      return session;
    }
  }

  return null;
}

/**
 * Get the appropriate strategy for a session
 */
function getStrategyForSession(
  sessionPath: string,
  explicitWorkflow?: WorkflowType,
): WorkflowProgressStrategy | null {
  const workflowType = detectWorkflowType(sessionPath, explicitWorkflow);
  if (!workflowType) {
    return null;
  }
  return getStrategy(workflowType) ?? null;
}

type ProgressOptions = {
  session?: string;
  workflow?: WorkflowType;
};

export const progressCommand = new Command("progress")
  .description("Watch real-time progress of a code review or map session")
  .option("-s, --session <name>", "Specify session name")
  .option(
    "-w, --workflow <type>",
    "Specify workflow type (review or map)",
    (value: string) => {
      if (value !== "review" && value !== "map") {
        throw new Error(
          `Invalid workflow type: ${value}. Use 'review' or 'map'.`,
        );
      }
      return value as WorkflowType;
    },
  )
  .action(async (options: ProgressOptions) => {
    const targetDir = process.cwd();

    // Guard: Require OCR to be set up
    requireOcrSetup(targetDir);

    // Ensure sessions directory exists
    const sessionsDir = ensureSessionsDir(targetDir);
    const ocrDir = join(targetDir, ".ocr");

    // If specific session requested, error if not found
    if (options.session) {
      const sessionPath = join(sessionsDir, options.session);
      if (!existsSync(sessionPath)) {
        console.log(chalk.red(`Session not found: ${options.session}`));
        process.exit(1);
      }

      const strategy = getStrategyForSession(sessionPath, options.workflow);
      if (!strategy) {
        console.log(
          chalk.red(
            `Cannot determine workflow type for session ${options.session}`,
          ),
        );
        console.log(
          chalk.dim(`Try specifying --workflow review or --workflow map`),
        );
        process.exit(1);
      }

      let state = strategy.parseState(sessionPath);
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
      strategy.render(state);

      // Periodic timer update
      const timerInterval = setInterval(() => {
        const newState = strategy.parseState(sessionPath, preservedStartTime);
        if (newState) {
          state = newState;
          strategy.render(state);
        }
      }, 1000);

      // Watch for file changes
      const watcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 4, // map/runs/run-{n}/*.md
      });

      watcher.on("all", () => {
        const newState = strategy.parseState(sessionPath, preservedStartTime);
        if (newState) {
          state = newState;
          strategy.render(state);
        }
      });

      process.on("SIGINT", () => {
        clearInterval(timerInterval);
        watcher.close();
        logUpdate.done();
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
    // Track start times PER WORKFLOW TYPE to handle simultaneous workflows
    const preservedStartTimes: Record<WorkflowType, number | undefined> = {
      review: undefined,
      map: undefined,
    };
    let currentStrategy: WorkflowProgressStrategy | null = null;

    const updateDisplayImpl = () => {
      // Re-check for latest active session
      if (
        !currentSessionPath ||
        !existsSync(currentSessionPath) ||
        !isSessionActive(currentSessionPath)
      ) {
        const latestActive = findLatestActiveSession(sessionsDir);
        if (latestActive && latestActive !== currentSession) {
          currentSession = latestActive;
          currentSessionPath = join(sessionsDir, latestActive);
          preservedStartTimes.review = undefined;
          preservedStartTimes.map = undefined;
          currentStrategy = null;
          watchSession(currentSessionPath);
        } else if (!latestActive) {
          currentSession = null;
          currentSessionPath = null;
          preservedStartTimes.review = undefined;
          preservedStartTimes.map = undefined;
          currentStrategy = null;
        }
      }

      if (currentSessionPath && existsSync(currentSessionPath)) {
        // Check for simultaneous workflows (unless user specified one)
        if (!options.workflow) {
          const activeWorkflows = detectActiveWorkflows(currentSessionPath);

          if (activeWorkflows.length > 1) {
            // Both workflows active - render combined view
            renderCombinedProgress(currentSessionPath, preservedStartTimes);
            return;
          }
        }

        // Single workflow mode
        if (!currentStrategy) {
          currentStrategy = getStrategyForSession(
            currentSessionPath,
            options.workflow,
          );
        }

        if (currentStrategy) {
          const workflowType = currentStrategy.workflowType;
          const state = currentStrategy.parseState(
            currentSessionPath,
            preservedStartTimes[workflowType],
          );
          if (state) {
            if (!preservedStartTimes[workflowType]) {
              preservedStartTimes[workflowType] = state.startTime;
            }
            currentStrategy.render(state);
          } else {
            currentStrategy.renderWaiting();
          }
        } else {
          // No strategy yet - show generic waiting
          renderGenericWaiting();
        }
      } else {
        preservedStartTimes.review = undefined;
        preservedStartTimes.map = undefined;
        renderGenericWaiting();
      }
    };

    const updateDisplay = debounce(updateDisplayImpl, 50);

    const watchSession = (sessionPath: string) => {
      if (sessionWatcher) {
        sessionWatcher.close();
      }
      sessionWatcher = watch(sessionPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 4,
      });
      sessionWatcher.on("all", updateDisplay);
    };

    // Initial display
    updateDisplayImpl();

    if (currentSessionPath) {
      watchSession(currentSessionPath);
    }

    // Periodic timer update
    const timerInterval = setInterval(updateDisplay, 1000);

    // Watch for new sessions
    const watchDir = existsSync(ocrDir) ? ocrDir : targetDir;
    const dirWatcher = watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
    });

    dirWatcher.on("addDir", (dirPath) => {
      const parentDir = join(dirPath, "..");
      const isDirectChild =
        parentDir.endsWith("sessions") ||
        parentDir.endsWith(join(".ocr", "sessions"));

      if (isDirectChild && !dirPath.endsWith("sessions")) {
        const newSession = basename(dirPath);
        currentSession = newSession;
        currentSessionPath = dirPath;
        preservedStartTimes.review = undefined;
        preservedStartTimes.map = undefined;
        currentStrategy = null;
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
      logUpdate.done();
      process.exit(0);
    });
  });

/**
 * Render generic waiting state when workflow type is unknown
 */
function renderGenericWaiting(): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.bold.white("  Open Code Review"));
  lines.push("");
  lines.push(chalk.dim("  Waiting for session..."));
  lines.push("");
  lines.push(`  ${chalk.dim("─".repeat(24))}  ${chalk.dim("0%")}`);
  lines.push("");
  lines.push(
    chalk.dim("  Run ") +
      chalk.white("/ocr-review") +
      chalk.dim(" or ") +
      chalk.white("/ocr-map") +
      chalk.dim(" to start"),
  );
  lines.push("");
  lines.push(chalk.dim("  Ctrl+C to exit"));
  lines.push("");
  logUpdate(lines.join("\n"));
}

/**
 * Render combined progress when both review and map workflows are active
 */
function renderCombinedProgress(
  sessionPath: string,
  preservedStartTimes: Record<WorkflowType, number | undefined>,
): void {
  const lines: string[] = [];
  const session = basename(sessionPath);

  lines.push("");
  lines.push(
    chalk.bold.white("  Open Code Review") +
      chalk.yellow(" · Parallel Workflows"),
  );
  lines.push("");
  lines.push(chalk.dim("  ") + chalk.white(session));
  lines.push("");

  // Get both strategies
  const reviewStrategy = getStrategy("review");
  const mapStrategy = getStrategy("map");

  // Render review progress (compact)
  if (reviewStrategy) {
    const reviewState = reviewStrategy.parseState(
      sessionPath,
      preservedStartTimes.review,
    );
    if (reviewState) {
      const reviewPercent = Math.round(
        (reviewState.phaseNumber / reviewStrategy.totalPhases) * 100,
      );
      const reviewBar =
        chalk.blue("━".repeat(Math.round(reviewPercent / 10))) +
        chalk.dim("─".repeat(10 - Math.round(reviewPercent / 10)));
      const currentPhase = reviewStrategy.phases.find(
        (p) => p.key === reviewState.phase,
      );
      lines.push(
        chalk.blue("  ◉ Review") +
          chalk.dim("  ") +
          reviewBar +
          chalk.dim("  ") +
          chalk.white(`${reviewPercent}%`) +
          chalk.dim(" · ") +
          chalk.cyan(currentPhase?.label ?? reviewState.phase),
      );
    } else {
      lines.push(chalk.blue("  ◉ Review") + chalk.dim("  ─────────  0%"));
    }
  }

  // Render map progress (compact)
  if (mapStrategy) {
    const mapState = mapStrategy.parseState(
      sessionPath,
      preservedStartTimes.map,
    );
    if (mapState) {
      const mapPercent = Math.round(
        (mapState.phaseNumber / mapStrategy.totalPhases) * 100,
      );
      const mapBar =
        chalk.green("━".repeat(Math.round(mapPercent / 10))) +
        chalk.dim("─".repeat(10 - Math.round(mapPercent / 10)));
      const currentPhase = mapStrategy.phases.find(
        (p) => p.key === mapState.phase,
      );
      lines.push(
        chalk.green("  ◉ Map") +
          chalk.dim("     ") +
          mapBar +
          chalk.dim("  ") +
          chalk.white(`${mapPercent}%`) +
          chalk.dim(" · ") +
          chalk.cyan(currentPhase?.label ?? mapState.phase),
      );
    } else {
      lines.push(chalk.green("  ◉ Map") + chalk.dim("     ─────────  0%"));
    }
  }

  lines.push("");
  lines.push(
    chalk.dim("  Use ") +
      chalk.white("--workflow review") +
      chalk.dim(" or ") +
      chalk.white("--workflow map") +
      chalk.dim(" for details"),
  );
  lines.push("");
  lines.push(chalk.dim("  Ctrl+C to exit"));
  lines.push("");

  logUpdate(lines.join("\n"));
}
