/**
 * Types for OCR state management.
 */

export type WorkflowType = "review" | "map";

export type SessionStatus = "active" | "closed";

export type ReviewPhase =
  | "context"
  | "change-context"
  | "analysis"
  | "reviews"
  | "aggregation"
  | "discourse"
  | "synthesis"
  | "complete";

export type MapPhase =
  | "map-context"
  | "topology"
  | "flow-analysis"
  | "requirements-mapping"
  | "synthesis"
  | "complete";

export type InitParams = {
  sessionId: string;
  branch: string;
  workflowType: WorkflowType;
  sessionDir: string;
  ocrDir: string;
};

export type TransitionParams = {
  sessionId: string;
  phase: ReviewPhase | MapPhase;
  phaseNumber: number;
  round?: number;
  mapRun?: number;
  ocrDir: string;
};

export type CloseParams = {
  sessionId: string;
  ocrDir: string;
};

export type ShowResult = {
  session: {
    id: string;
    branch: string;
    status: SessionStatus;
    workflow_type: WorkflowType;
    current_phase: string;
    phase_number: number;
    current_round: number;
    current_map_run: number;
    started_at: string;
    updated_at: string;
  };
  events: Array<{
    id: number;
    event_type: string;
    phase: string | null;
    phase_number: number | null;
    round: number | null;
    metadata: string | null;
    created_at: string;
  }>;
};
