/**
 * Workflow Progress Strategy Interface
 *
 * Each workflow (review, map) implements this interface to provide
 * deterministic progress tracking based on filesystem artifacts.
 */

import type { WorkflowType, WorkflowState, PhaseInfo } from "./types";

export interface WorkflowProgressStrategy {
  /**
   * The workflow type this strategy handles
   */
  readonly workflowType: WorkflowType;

  /**
   * Ordered list of phases for this workflow
   */
  readonly phases: PhaseInfo[];

  /**
   * Total number of phases
   */
  readonly totalPhases: number;

  /**
   * Parse session state from filesystem artifacts.
   * This should be deterministic based on what files exist.
   *
   * @param sessionPath - Path to the session directory
   * @param preservedStartTime - Optional start time to preserve across re-parses
   * @returns Workflow state or null if session is invalid/not started
   */
  parseState(
    sessionPath: string,
    preservedStartTime?: number,
  ): WorkflowState | null;

  /**
   * Render the progress UI for this workflow
   */
  render(state: WorkflowState): void;

  /**
   * Render the waiting state (no active session)
   */
  renderWaiting(): void;
}

/**
 * Registry of workflow strategies
 */
const strategies = new Map<WorkflowType, WorkflowProgressStrategy>();

export function registerStrategy(strategy: WorkflowProgressStrategy): void {
  strategies.set(strategy.workflowType, strategy);
}

export function getStrategy(
  workflowType: WorkflowType,
): WorkflowProgressStrategy | undefined {
  return strategies.get(workflowType);
}

export function getAllStrategies(): WorkflowProgressStrategy[] {
  return Array.from(strategies.values());
}
