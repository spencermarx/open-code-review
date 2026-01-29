/**
 * Workflow Type Detection
 *
 * Deterministically detects which workflow type is active in a session.
 * Priority order:
 * 1. CLI flag (explicit user override)
 * 2. state.json workflow_type field
 * 3. Filesystem artifact detection (map/ vs rounds/)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowType, StateJson } from "./types";

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

  // Priority 2: Check state.json workflow_type
  const statePath = join(sessionPath, "state.json");
  if (existsSync(statePath)) {
    try {
      const content = readFileSync(statePath, "utf-8");
      const state: StateJson = JSON.parse(content);
      if (state.workflow_type) {
        return state.workflow_type;
      }
    } catch {
      // Continue to filesystem detection
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

  // Both exist - check which has more recent activity
  if (hasMapDir && hasRoundsDir) {
    // This is unusual but could happen if user runs both workflows
    // Default to the one with state.json current_phase
    if (existsSync(statePath)) {
      try {
        const content = readFileSync(statePath, "utf-8");
        const state: StateJson = JSON.parse(content);
        // Map phases start with "map-" or are "topology", "flow-analysis", etc.
        const phase = state.current_phase;
        if (
          phase.startsWith("map-") ||
          phase === "topology" ||
          phase === "flow-analysis" ||
          phase === "requirements-mapping"
        ) {
          return "map";
        }
        return "review";
      } catch {
        // Default to review
        return "review";
      }
    }
  }

  // No artifacts yet - cannot determine, default to review
  // (Most common workflow, will auto-correct when artifacts appear)
  return "review";
}

/**
 * Check if a session is active (not closed or complete)
 */
export function isSessionActive(sessionPath: string): boolean {
  const statePath = join(sessionPath, "state.json");
  if (!existsSync(statePath)) {
    return true; // No state.json = potentially new session
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    const state: StateJson = JSON.parse(content);
    if (state.status === "closed" || state.current_phase === "complete") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
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

  // If no artifacts detected, check state.json for workflow_type
  if (activeWorkflows.length === 0) {
    const statePath = join(sessionPath, "state.json");
    if (existsSync(statePath)) {
      try {
        const content = readFileSync(statePath, "utf-8");
        const state: StateJson = JSON.parse(content);
        if (state.workflow_type && state.current_phase !== "complete") {
          activeWorkflows.push(state.workflow_type);
        }
      } catch {
        // Ignore parse errors
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
