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

// ── Round Meta (orchestrator-first structured data) ──

export type FindingCategory = "blocker" | "should_fix" | "suggestion" | "style";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type RoundMetaFinding = {
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  summary: string;
  flagged_by?: string[];
};

export type RoundMetaReviewer = {
  type: string;
  instance: number;
  /** Informational — not used for counting. Counts are derived from findings[].category. */
  severity_high?: number;
  /** Informational — not used for counting. */
  severity_medium?: number;
  /** Informational — not used for counting. */
  severity_low?: number;
  /** Informational — not used for counting. */
  severity_info?: number;
  findings: RoundMetaFinding[];
};

/**
 * Explicit post-synthesis counts set by the orchestrator.
 * These reflect the deduplicated, final counts from `final.md` and take
 * precedence over the per-reviewer derived counts (which double-count
 * findings flagged by multiple reviewers).
 */
export type SynthesisCounts = {
  blockers: number;
  should_fix: number;
  suggestions: number;
};

export type RoundMeta = {
  schema_version: number;
  verdict: string;
  reviewers: RoundMetaReviewer[];
  /** Post-synthesis counts matching final.md. Preferred over derived counts. */
  synthesis_counts?: SynthesisCounts;
};

export type RoundCompleteParams =
  | {
      source: "file";
      ocrDir: string;
      sessionId?: string;
      round?: number;
      filePath: string;
    }
  | {
      source: "stdin";
      ocrDir: string;
      sessionId?: string;
      round?: number;
      data: string;
    };

export type RoundCompleteResult = {
  sessionId: string;
  round: number;
  metaPath?: string;
};

// ── Map Meta (structured map data) ──

export type MapMetaFile = {
  file_path: string;
  role: string;
  lines_added: number;
  lines_deleted: number;
};

export type MapMetaSection = {
  section_number: number;
  title: string;
  description?: string;
  files: MapMetaFile[];
};

export type MapMetaDependency = {
  from_section: number;
  from_title: string;
  to_section: number;
  to_title: string;
  relationship: string;
};

export type MapMeta = {
  schema_version: number;
  sections: MapMetaSection[];
  dependencies?: MapMetaDependency[];
};

export type MapCompleteParams =
  | {
      source: "file";
      ocrDir: string;
      sessionId?: string;
      mapRun?: number;
      filePath: string;
    }
  | {
      source: "stdin";
      ocrDir: string;
      sessionId?: string;
      mapRun?: number;
      data: string;
    };

export type MapCompleteResult = {
  sessionId: string;
  mapRun: number;
  metaPath?: string;
};

// ── Reviewers Meta (structured reviewer catalog for dashboard) ──

export type ReviewerTier = "holistic" | "specialist" | "persona" | "custom";

export type ReviewerMeta = {
  id: string;
  name: string;
  tier: ReviewerTier;
  icon: string;
  description: string;
  focus_areas: string[];
  is_default: boolean;
  is_builtin: boolean;
  known_for?: string;
  philosophy?: string;
};

export type ReviewersMeta = {
  schema_version: number;
  generated_at: string;
  reviewers: ReviewerMeta[];
};

// ── Show Result ──

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
