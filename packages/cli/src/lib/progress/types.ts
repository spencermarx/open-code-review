/**
 * Progress tracking types - shared across workflow strategies
 */

export type WorkflowType = "review" | "map";

export type PhaseStatus = "pending" | "in_progress" | "complete";

export type PhaseInfo = {
  key: string;
  label: string;
};

export type SessionStatus = "active" | "closed";

/**
 * Base state shared by all workflow types
 */
export type BaseWorkflowState = {
  workflowType: WorkflowType;
  session: string;
  phase: string;
  phaseNumber: number;
  totalPhases: number;
  startTime: number;
  complete: boolean;
};

/**
 * Review workflow specific state
 */
export type ReviewWorkflowState = BaseWorkflowState & {
  workflowType: "review";
  // Phase completion flags (derived from filesystem)
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
};

export type RoundInfo = {
  round: number;
  isComplete: boolean;
  reviewers: string[];
};

export type ReviewerStatus = {
  name: string;
  displayName: string;
  status: PhaseStatus;
  findings: number;
};

/**
 * Map workflow specific state
 */
export type MapWorkflowState = BaseWorkflowState & {
  workflowType: "map";
  // Phase completion flags (derived from filesystem)
  contextComplete: boolean;
  topologyComplete: boolean;
  flowAnalysisComplete: boolean;
  requirementsMappingComplete: boolean;
  synthesisComplete: boolean;
  // Run info
  currentRun: number;
  runs: MapRunInfo[];
  // Agent stats
  flowAnalysts: AgentStatus[];
  requirementsMappers: AgentStatus[];
  // Requirements provided?
  hasRequirements: boolean;
};

export type MapRunInfo = {
  run: number;
  isComplete: boolean;
  fileCount: number;
};

export type AgentStatus = {
  name: string;
  displayName: string;
  status: PhaseStatus;
};

/**
 * Union type for all workflow states
 */
export type WorkflowState = ReviewWorkflowState | MapWorkflowState;

/**
 * State.json structure (workflow-agnostic parts)
 */
export type StateJson = {
  session_id: string;
  status?: SessionStatus;
  workflow_type?: WorkflowType;
  current_phase: string;
  phase_number: number;
  started_at?: string;
  updated_at?: string;
  // Review-specific
  current_round?: number;
  round_started_at?: string;
  // Map-specific
  current_map_run?: number;
  map_started_at?: string; // When current map run started (for timing)
};
