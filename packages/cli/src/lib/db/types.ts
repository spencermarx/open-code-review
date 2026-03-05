/**
 * Database module types for OCR SQLite storage.
 */

// ── Session types ──

export type WorkflowType = "review" | "map";

export type SessionStatus = "active" | "closed";

export type SessionRow = {
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
  session_dir: string;
};

export type InsertSessionParams = {
  id: string;
  branch: string;
  workflow_type: WorkflowType;
  current_phase?: string;
  phase_number?: number;
  current_round?: number;
  current_map_run?: number;
  session_dir: string;
};

export type UpdateSessionParams = Partial<
  Pick<
    SessionRow,
    | "status"
    | "current_phase"
    | "phase_number"
    | "current_round"
    | "current_map_run"
    | "updated_at"
  >
>;

// ── Event types ──

export type EventRow = {
  id: number;
  session_id: string;
  event_type: string;
  phase: string | null;
  phase_number: number | null;
  round: number | null;
  metadata: string | null;
  created_at: string;
};

export type InsertEventParams = {
  session_id: string;
  event_type: string;
  phase?: string;
  phase_number?: number;
  round?: number;
  metadata?: string;
};

// ── Migration types ──

export type Migration = {
  version: number;
  description: string;
  sql: string;
};

export type SchemaVersionRow = {
  version: number;
  applied_at: string;
  description: string;
};
