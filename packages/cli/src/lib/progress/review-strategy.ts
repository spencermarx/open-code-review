/**
 * Review Workflow Progress Strategy
 *
 * Tracks progress for the 8-phase code review workflow.
 * Progress is derived deterministically from filesystem artifacts.
 */

import chalk from "chalk";
import logUpdate from "log-update";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { WorkflowProgressStrategy } from "./strategy";
import type {
  PhaseInfo,
  ReviewWorkflowState,
  RoundInfo,
  ReviewerStatus,
  StateJson,
} from "./types";
import {
  formatDuration,
  renderProgressBar,
  getPhaseStatus,
  clearForRenderType,
  padLines,
} from "./render-utils";

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

const REVIEW_PHASES: PhaseInfo[] = [
  { key: "context", label: "Context Discovery" },
  { key: "change-context", label: "Change Context" },
  { key: "analysis", label: "Tech Lead Analysis" },
  { key: "reviews", label: "Parallel Reviews" },
  { key: "aggregation", label: "Aggregate Findings" },
  { key: "discourse", label: "Reviewer Discourse" },
  { key: "synthesis", label: "Final Synthesis" },
  { key: "complete", label: "Complete" },
];

function countFindings(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }
  const content = readFileSync(filePath, "utf-8");
  const findingMatches = content.match(/^##\s+(Finding|Issue|Suggestion)/gm);
  return findingMatches?.length ?? 0;
}

function formatReviewerName(filename: string): string {
  const base = filename.replace(".md", "");
  const match = base.match(/^(.+)-(\d+)$/);
  if (match && match[1] && match[2]) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} #${match[2]}`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

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

export class ReviewProgressStrategy implements WorkflowProgressStrategy {
  readonly workflowType = "review" as const;
  readonly phases = REVIEW_PHASES;
  readonly totalPhases = 8;

  parseState(
    sessionPath: string,
    preservedStartTime?: number,
  ): ReviewWorkflowState | null {
    const session = basename(sessionPath);
    const statePath = join(sessionPath, "state.json");

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const stateContent = readFileSync(statePath, "utf-8");
      const state: StateJson = JSON.parse(stateContent);
      return this.parseFromStateJson(
        session,
        state,
        sessionPath,
        preservedStartTime,
      );
    } catch {
      return null;
    }
  }

  private parseFromStateJson(
    session: string,
    state: StateJson,
    sessionPath: string,
    preservedStartTime?: number,
  ): ReviewWorkflowState {
    const effectiveStartTime = state.round_started_at ?? state.started_at;
    const startTime =
      preservedStartTime ??
      (effectiveStartTime
        ? new Date(effectiveStartTime).getTime()
        : Date.now());

    const roundsDir = join(sessionPath, "rounds");
    const rounds = deriveRoundsFromFilesystem(roundsDir);

    const highestExistingRound =
      rounds.length > 0 ? Math.max(...rounds.map((r) => r.round)) : 1;
    const stateRound = state.current_round ?? 1;
    const currentRound = Math.min(stateRound, highestExistingRound);
    const currentRoundDir = join(roundsDir, `round-${currentRound}`);
    const reviewsDir = join(currentRoundDir, "reviews");

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

    // Derive phase completion from filesystem
    const contextComplete = existsSync(
      join(sessionPath, "discovered-standards.md"),
    );
    const changeContextComplete = existsSync(join(sessionPath, "context.md"));
    const analysisComplete = changeContextComplete;
    const reviewsComplete = state.phase_number > 4;
    const discourseComplete = existsSync(join(currentRoundDir, "discourse.md"));
    const synthesisComplete = existsSync(join(currentRoundDir, "final.md"));

    return {
      workflowType: "review",
      session,
      phase: state.current_phase as ReviewPhase,
      phaseNumber: state.phase_number,
      totalPhases: this.totalPhases,
      contextComplete,
      changeContextComplete,
      analysisComplete,
      reviewsComplete,
      aggregationComplete: reviewsComplete,
      discourseComplete,
      synthesisComplete,
      currentRound,
      rounds,
      reviewers,
      startTime,
      complete: state.current_phase === "complete",
    };
  }

  render(state: ReviewWorkflowState): void {
    const lines: string[] = [];
    const log = (line: string = "") => lines.push(line);

    log();
    log(chalk.bold.white("  Open Code Review"));
    log();

    // Clamp elapsed to 0 if startTime is in the future (defensive: bad timestamp in state.json)
    const elapsed = Math.max(0, Date.now() - state.startTime);
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

    const progressPhases = state.complete ? 8 : state.phaseNumber;
    const currentPhase = this.phases.find((p) => p.key === state.phase);
    const phaseLabel = state.complete ? "Done" : currentPhase?.label;
    log(`  ${renderProgressBar(progressPhases, 8, phaseLabel)}`);
    log();

    const phaseCompletion: Record<string, boolean> = {
      context: state.contextComplete,
      "change-context": state.changeContextComplete,
      analysis: state.analysisComplete,
      reviews: state.reviewsComplete,
      aggregation: state.aggregationComplete,
      discourse: state.discourseComplete,
      synthesis: state.synthesisComplete,
      complete: state.complete,
    };

    for (const phase of this.phases) {
      const isComplete = phaseCompletion[phase.key] ?? false;
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

      if (phase.key === "reviews" && state.reviewers.length > 0) {
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

        if (state.rounds.length > 1) {
          const prevRounds = state.rounds.slice(0, -1);
          for (const round of prevRounds) {
            const roundLabel = chalk.dim(`    Round ${round.round}`);
            const reviewerCount = round.reviewers.length;
            const rstatus = round.isComplete
              ? chalk.green("✓")
              : chalk.dim("○");
            log(
              `${roundLabel} ${rstatus} ${chalk.dim(`${reviewerCount} reviewers`)}`,
            );
          }
        }
      }
    }

    log();

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

    clearForRenderType("review-progress");
    logUpdate(padLines(lines).join("\n"));
  }

  renderWaiting(): void {
    const lines: string[] = [];
    const log = (line: string = "") => lines.push(line);

    log();
    log(chalk.bold.white("  Open Code Review"));
    log();
    log(chalk.dim("  Waiting for session..."));
    log();

    const bar = chalk.dim("─".repeat(24));
    log(`  ${bar}  ${chalk.dim("0%")}`);
    log();

    log(
      chalk.dim("  Run ") + chalk.white("/ocr-review") + chalk.dim(" to start"),
    );
    log();
    log(chalk.dim("  Ctrl+C to exit"));
    log();

    clearForRenderType("review-waiting");
    logUpdate(padLines(lines).join("\n"));
  }
}

export const reviewStrategy = new ReviewProgressStrategy();
