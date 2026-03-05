// Shared types between dashboard client and server
// Socket.IO event types, API response types, etc.

export type SessionStatus = 'active' | 'closed'
export type WorkflowType = 'review' | 'map'
export type FindingTriage = 'unread' | 'read' | 'acknowledged' | 'fixed' | 'wont_fix'
export type RoundTriage = 'needs_review' | 'in_progress' | 'changes_made' | 'acknowledged' | 'dismissed'
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type NoteTargetType = 'session' | 'round' | 'finding' | 'run' | 'section' | 'file'
export type ChatTargetType = 'map_run' | 'review_round'
