import type { SessionStatus, WorkflowType, FindingTriage, FindingSeverity, ChatTargetType, RoundTriage } from '../../shared/types'

export type { SessionStatus, WorkflowType, FindingTriage, FindingSeverity, ChatTargetType, RoundTriage }

export interface SessionSummary {
  id: string
  branch: string
  status: SessionStatus
  workflow_type: WorkflowType
  current_phase: string
  phase_number: number
  current_round: number
  current_map_run: number
  started_at: string
  updated_at: string
}

export interface OrchestrationEvent {
  id: number
  session_id: string
  event_type: string
  phase: string | null
  phase_number: number | null
  round: number | null
  metadata: string | null
  created_at: string
}

export interface DashboardStats {
  totalSessions: number
  activeSessions: number
  completedReviews: number
  completedMaps: number
  filesTracked: number
  unresolvedBlockers: number
}

export interface ReviewRound {
  id: number
  session_id: string
  round_number: number
  verdict: string | null
  blocker_count: number
  suggestion_count: number
  should_fix_count: number
  final_md_path: string | null
  parsed_at: string | null
  reviewer_outputs: ReviewerOutput[]
  progress?: RoundProgress | null
}

export interface ReviewerOutput {
  id: number
  round_id: number
  reviewer_type: string
  instance_number: number
  file_path: string
  finding_count: number
  parsed_at: string | null
}

export interface Finding {
  id: number
  reviewer_output_id: number
  title: string
  severity: FindingSeverity
  file_path: string | null
  line_start: number | null
  line_end: number | null
  summary: string | null
  is_blocker: number
  parsed_at: string | null
  progress?: FindingProgress | null
}

export interface FindingProgress {
  id: number
  finding_id: number
  status: FindingTriage
  updated_at: string
}

export interface RoundProgress {
  id: number
  round_id: number
  status: RoundTriage
  updated_at: string
}

export interface ReviewerOutputDetail extends ReviewerOutput {
  findings: Finding[]
}

export interface Artifact {
  id: number
  session_id: string
  artifact_type: string
  round_number: number | null
  file_path: string
  content: string
  parsed_at: string
}

export interface MapRun {
  id: number
  session_id: string
  run_number: number
  map_md_path: string | null
  parsed_at: string | null
  sections: MapSection[]
}

export interface MapSection {
  id: number
  map_run_id: number
  section_number: number
  title: string
  description: string | null
  file_count: number
  reviewed_count: number
  files: MapFile[]
}

export interface MapFile {
  id: number
  section_id: number
  file_path: string
  role: string | null
  lines_added: number
  lines_deleted: number
  display_order: number
  is_reviewed: boolean
  reviewed_at: string | null
}

export interface SectionDependency {
  fromSection: number
  fromTitle: string
  toSection: number
  toTitle: string
  relationship: string
}

export interface ChatConversation {
  id: string
  session_id: string
  target_type: ChatTargetType
  target_id: number
  status: 'active' | 'expired'
  created_at: string
  last_active_at: string
}

export interface ChatMessage {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatToolStatus {
  tool: string
  detail: string
  timestamp: number
}
