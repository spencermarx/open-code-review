/**
 * Workflow Type Detection
 *
 * Deterministically detects which workflow type is active in a session.
 * Priority order:
 * 1. CLI flag (explicit user override)
 * 2. SQLite session data
 * 3. Filesystem artifact detection (map/ vs rounds/)
 */

import { existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { WorkflowType } from "./types";
import { getProgressDb } from "./session-reader";

/**
 * Detect workflow type from a session directory
 *
 * @param sessionPath - Path to the session directory
 * @param explicitType - Optional explicit type from CLI flag
 * @returns Detected workflow type or null if cannot determine
 */
export function detectWorkflowType(
  sessionPath: string,
  explicitType?: WorkflowType,
): WorkflowType | null {
  // Priority 1: Explicit CLI flag
  if (explicitType) {
    return explicitType;
  }

  // Priority 2: Check SQLite for workflow type
  const db = getProgressDb();
  if (db) {
    try {
      const sessionId = basename(sessionPath);
      const result = db.exec(
        "SELECT workflow_type FROM sessions WHERE id = ?",
        [sessionId],
      );
      const row0 = result[0];
      if (row0 && row0.values.length > 0) {
        const wt = row0.values[0]?.[0] as string;
        if (wt === "review" || wt === "map") return wt;
      }
    } catch {
      // SQLite read failed, continue to filesystem detection
    }
  }

  // Priority 3: Filesystem artifact detection
  const hasMapDir = existsSync(join(sessionPath, "map"));
  const hasRoundsDir = existsSync(join(sessionPath, "rounds"));

  // Map workflow has map/ directory
  if (hasMapDir && !hasRoundsDir) {
    return "map";
  }

  // Review workflow has rounds/ directory
  if (hasRoundsDir && !hasMapDir) {
    return "review";
  }

  // Both exist - check SQLite for current_phase to disambiguate
  if (hasMapDir && hasRoundsDir) {
    if (db) {
      try {
        const sessionId = basename(sessionPath);
        const result = db.exec(
          "SELECT current_phase FROM sessions WHERE id = ?",
          [sessionId],
        );
        const phaseRow0 = result[0];
        if (phaseRow0 && phaseRow0.values.length > 0) {
          const phase = phaseRow0.values[0]?.[0] as string;
          if (
            phase.startsWith("map-") ||
            phase === "topology" ||
            phase === "flow-analysis" ||
            phase === "requirements-mapping"
          ) {
            return "map";
          }
          return "review";
        }
      } catch {
        return "review";
      }
    }
  }

  // No artifacts yet - default to review
  return "review";
}

/**
 * Check if a session is active (not closed or complete)
 */
export function isSessionActive(sessionPath: string): boolean {
  const db = getProgressDb();
  if (db) {
    try {
      const sessionId = basename(sessionPath);
      const result = db.exec(
        "SELECT status, current_phase FROM sessions WHERE id = ?",
        [sessionId],
      );
      const statusRow0 = result[0];
      if (statusRow0 && statusRow0.values.length > 0) {
        const row = statusRow0.values[0];
        const status = row?.[0] as string;
        const phase = row?.[1] as string;
        if (status === "closed" || phase === "complete") {
          return false;
        }
        return true;
      }
    } catch {
      // Fall through
    }
  }
  // No SQLite data — assume active (new session)
  return true;
}

/**
 * Check if a session is a map workflow
 */
export function isMapWorkflow(sessionPath: string): boolean {
  return detectWorkflowType(sessionPath) === "map";
}

/**
 * Check if a session is a review workflow
 */
export function isReviewWorkflow(sessionPath: string): boolean {
  return detectWorkflowType(sessionPath) === "review";
}

/**
 * Detect all active workflows in a session
 * Returns an array of workflow types that are currently active (not complete)
 */
export function detectActiveWorkflows(sessionPath: string): WorkflowType[] {
  const activeWorkflows: WorkflowType[] = [];

  // Check for review workflow artifacts
  const hasRoundsDir = existsSync(join(sessionPath, "rounds"));
  if (hasRoundsDir) {
    // Check if review is complete by looking for final.md in latest round
    const roundsDir = join(sessionPath, "rounds");
    const rounds = existsSync(roundsDir)
      ? readdirSync(roundsDir)
          .filter((d) => d.match(/^round-\d+$/))
          .sort()
      : [];

    if (rounds.length > 0) {
      const latestRound = rounds[rounds.length - 1]!;
      const finalPath = join(roundsDir, latestRound, "final.md");
      // Review is active if no final.md in latest round
      if (!existsSync(finalPath)) {
        activeWorkflows.push("review");
      }
    } else {
      // Rounds dir exists but no rounds yet - review is starting
      activeWorkflows.push("review");
    }
  }

  // Check for map workflow artifacts
  const hasMapDir = existsSync(join(sessionPath, "map"));
  if (hasMapDir) {
    // Check if map is complete by looking for map.md in latest run
    const runsDir = join(sessionPath, "map", "runs");
    const runs = existsSync(runsDir)
      ? readdirSync(runsDir)
          .filter((d) => d.match(/^run-\d+$/))
          .sort()
      : [];

    if (runs.length > 0) {
      const latestRun = runs[runs.length - 1]!;
      const mapPath = join(runsDir, latestRun, "map.md");
      // Map is active if no map.md in latest run
      if (!existsSync(mapPath)) {
        activeWorkflows.push("map");
      }
    } else {
      // Map dir exists but no runs yet - map is starting
      activeWorkflows.push("map");
    }
  }

  // If no artifacts detected, check SQLite for workflow_type
  if (activeWorkflows.length === 0) {
    const db = getProgressDb();
    if (db) {
      try {
        const sessionId = basename(sessionPath);
        const result = db.exec(
          "SELECT workflow_type, current_phase FROM sessions WHERE id = ?",
          [sessionId],
        );
        const wtRow0 = result[0];
        if (wtRow0 && wtRow0.values.length > 0) {
          const row = wtRow0.values[0];
          const wt = row?.[0] as string;
          const phase = row?.[1] as string;
          if ((wt === "review" || wt === "map") && phase !== "complete") {
            activeWorkflows.push(wt as WorkflowType);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return activeWorkflows;
}

/**
 * Check if both review and map workflows are active simultaneously
 */
export function hasBothWorkflowsActive(sessionPath: string): boolean {
  const active = detectActiveWorkflows(sessionPath);
  return active.includes("review") && active.includes("map");
}
