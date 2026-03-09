/**
 * SQLite database access for the dashboard server.
 *
 * Opens the existing `.ocr/data/ocr.db` created by the CLI,
 * applies pragmas, and provides typed query helpers for all tables.
 */

/**
 * ## Dual-Writer Ownership Model
 *
 * Two processes can write to `ocr.db`:
 *
 * - **CLI** (`ocr state init/transition/close`) — owns workflow state:
 *   `sessions`, `orchestration_events`. Writes happen during review/map
 *   workflows when the AI agent calls `ocr state` commands.
 *
 * - **Dashboard** (this server) — owns user-interaction tables:
 *   `user_file_progress`, `user_finding_progress`, `user_round_progress`,
 *   `user_notes`, `command_executions`, `chat_conversations`, `chat_messages`.
 *   Also writes parsed artifact data: `review_rounds`, `reviewer_outputs`,
 *   `review_findings`, `map_runs`, `map_sections`, `map_files`,
 *   `markdown_artifacts`.
 *
 * Concurrency is managed via:
 * 1. **Atomic writes** — temp file + rename prevents partial reads
 * 2. **Merge-before-write** — dashboard calls `DbSyncWatcher.syncFromDisk()`
 *    before saving to pull in CLI changes
 * 3. **File watching** — `DbSyncWatcher` detects external writes and reloads
 *
 * Both processes use sql.js (in-memory WASM SQLite), so there is no
 * file-level locking. The merge-before-write pattern prevents data loss
 * under normal usage but is not a full MVCC solution.
 */

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import {
  runMigrations,
  locateWasm,
  applyPragmas,
  resultToRows,
  resultToRow,
  type WorkflowType,
  type SessionStatus,
} from '@open-code-review/cli/db'

// ── Types ──

export type SessionRow = {
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
  session_dir: string
}

export type EventRow = {
  id: number
  session_id: string
  event_type: string
  phase: string | null
  phase_number: number | null
  round: number | null
  metadata: string | null
  created_at: string
}

export type ReviewRoundRow = {
  id: number
  session_id: string
  round_number: number
  verdict: string | null
  blocker_count: number
  suggestion_count: number
  should_fix_count: number
  final_md_path: string | null
  parsed_at: string | null
  source: string | null
  reviewer_count: number
  total_finding_count: number
}

export type ReviewerOutputRow = {
  id: number
  round_id: number
  reviewer_type: string
  instance_number: number
  file_path: string
  finding_count: number
  parsed_at: string | null
}

export type FindingRow = {
  id: number
  reviewer_output_id: number
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  file_path: string | null
  line_start: number | null
  line_end: number | null
  summary: string | null
  is_blocker: number
  parsed_at: string | null
}

export type ArtifactRow = {
  id: number
  session_id: string
  artifact_type: string
  round_number: number | null
  file_path: string
  content: string
  parsed_at: string
}

export type MapRunRow = {
  id: number
  session_id: string
  run_number: number
  file_count: number
  section_count: number
  map_md_path: string | null
  parsed_at: string | null
  source: string | null
}

export type MapSectionRow = {
  id: number
  map_run_id: number
  section_number: number
  title: string
  description: string | null
  file_count: number
  display_order: number
}

export type MapFileRow = {
  id: number
  section_id: number
  file_path: string
  role: string | null
  lines_added: number
  lines_deleted: number
  display_order: number
}

export type FileProgressRow = {
  id: number
  map_file_id: number
  is_reviewed: number
  reviewed_at: string | null
}

export type FindingProgressRow = {
  id: number
  finding_id: number
  status: 'unread' | 'read' | 'acknowledged' | 'fixed' | 'wont_fix'
  updated_at: string
}

export type RoundProgressRow = {
  id: number
  round_id: number
  status: 'needs_review' | 'in_progress' | 'changes_made' | 'acknowledged' | 'dismissed'
  updated_at: string
}

export type NoteRow = {
  id: number
  target_type: 'session' | 'round' | 'finding' | 'run' | 'section' | 'file'
  target_id: string
  content: string
  created_at: string
  updated_at: string
}

export type CommandExecutionRow = {
  id: number
  command: string
  args: string | null
  pid: number | null
  is_detached: number
  exit_code: number | null
  started_at: string
  finished_at: string | null
  output: string | null
}

export type ChatConversationRow = {
  id: string
  session_id: string
  target_type: 'map_run' | 'review_round'
  target_id: number
  claude_session_id: string | null
  status: 'active' | 'expired'
  created_at: string
  last_active_at: string
}

export type ChatMessageRow = {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// ── Connection ──

let cachedDb: Database | null = null
let cachedDbPath: string | null = null

// ── Pre/post-save hooks ──
// Registered once at startup by index.ts so every saveDb() call
// automatically merges CLI changes before writing (pre) and
// marks its own write to avoid re-triggering the file watcher (post).

let preSaveHook: (() => void) | null = null
let postSaveHook: (() => void) | null = null

/**
 * Register hooks that run around every saveDb() call.
 *
 * - `preSave`: merge external (CLI) changes before overwriting — prevents data loss.
 * - `postSave`: mark own write so the file watcher doesn't re-trigger.
 */
export function registerSaveHooks(
  preSave: () => void,
  postSave: () => void,
): void {
  preSaveHook = preSave
  postSaveHook = postSave
}

/**
 * Opens the OCR database at the given `.ocr/` directory path.
 * Caches the connection for reuse.
 */
export async function openDb(ocrDir: string): Promise<Database> {
  const dbPath = join(ocrDir, 'data', 'ocr.db')

  if (cachedDb && cachedDbPath === dbPath) {
    return cachedDb
  }

  const wasmBuffer = readFileSync(locateWasm())
  const wasmBinary = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength
  )

  const SQL = await initSqlJs({ wasmBinary })

  let db: Database
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    const dataDir = dirname(dbPath)
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    db = new SQL.Database()
  }

  applyPragmas(db)
  runMigrations(db)
  cachedDb = db
  cachedDbPath = dbPath

  return db
}

/**
 * Saves the in-memory database state to disk.
 *
 * Automatically calls registered pre-save and post-save hooks:
 * - Pre-save: merges external (CLI) changes before overwriting (merge-before-write).
 * - Post-save: marks own write so the file watcher doesn't re-trigger.
 *
 * Hooks are registered once at startup via `registerSaveHooks()`.
 *
 * Uses atomic write (temp file + rename) to prevent partial reads
 * by concurrent processes.
 */
export function saveDb(db: Database, ocrDir: string): void {
  preSaveHook?.()
  const dbPath = join(ocrDir, 'data', 'ocr.db')
  const data = db.export()
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const tmpPath = dbPath + '.tmp'
  writeFileSync(tmpPath, Buffer.from(data))
  renameSync(tmpPath, dbPath)
  postSaveHook?.()
}

/**
 * Closes the cached database connection.
 */
export function closeDb(): void {
  if (cachedDb) {
    cachedDb.close()
    cachedDb = null
    cachedDbPath = null
  }
}

// ── Sessions queries ──

export function getAllSessions(db: Database): SessionRow[] {
  return resultToRows<SessionRow>(
    db.exec('SELECT * FROM sessions ORDER BY updated_at DESC')
  )
}

export function getSession(db: Database, id: string): SessionRow | undefined {
  return resultToRow<SessionRow>(
    db.exec('SELECT * FROM sessions WHERE id = ?', [id])
  )
}

// ── Events queries ──

export function getEventsForSession(db: Database, sessionId: string): EventRow[] {
  return resultToRows<EventRow>(
    db.exec(
      'SELECT * FROM orchestration_events WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    )
  )
}

// ── Review rounds queries ──

export function getAllRounds(db: Database): ReviewRoundRow[] {
  return resultToRows<ReviewRoundRow>(
    db.exec('SELECT * FROM review_rounds ORDER BY parsed_at DESC, id DESC')
  )
}

export function getRoundsForSession(db: Database, sessionId: string): ReviewRoundRow[] {
  return resultToRows<ReviewRoundRow>(
    db.exec(
      'SELECT * FROM review_rounds WHERE session_id = ? ORDER BY round_number ASC',
      [sessionId]
    )
  )
}

export function getRound(
  db: Database,
  sessionId: string,
  roundNumber: number
): ReviewRoundRow | undefined {
  return resultToRow<ReviewRoundRow>(
    db.exec(
      'SELECT * FROM review_rounds WHERE session_id = ? AND round_number = ?',
      [sessionId, roundNumber]
    )
  )
}

// ── Reviewer outputs queries ──

export function getReviewerOutputsForRound(db: Database, roundId: number): ReviewerOutputRow[] {
  return resultToRows<ReviewerOutputRow>(
    db.exec(
      'SELECT * FROM reviewer_outputs WHERE round_id = ? ORDER BY reviewer_type ASC, instance_number ASC',
      [roundId]
    )
  )
}

export function getReviewerOutput(
  db: Database,
  roundId: number,
  reviewerId: number
): ReviewerOutputRow | undefined {
  return resultToRow<ReviewerOutputRow>(
    db.exec('SELECT * FROM reviewer_outputs WHERE round_id = ? AND id = ?', [roundId, reviewerId])
  )
}

// ── Findings queries ──

export function getFindingsForRound(db: Database, roundId: number): FindingRow[] {
  return resultToRows<FindingRow>(
    db.exec(
      `SELECT rf.* FROM review_findings rf
       JOIN reviewer_outputs ro ON rf.reviewer_output_id = ro.id
       WHERE ro.round_id = ?
       ORDER BY
         CASE rf.severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           WHEN 'info' THEN 5
         END ASC`,
      [roundId]
    )
  )
}

export function getFindingsForReviewerOutput(
  db: Database,
  reviewerOutputId: number
): FindingRow[] {
  return resultToRows<FindingRow>(
    db.exec(
      'SELECT * FROM review_findings WHERE reviewer_output_id = ? ORDER BY id ASC',
      [reviewerOutputId]
    )
  )
}

export function getFinding(db: Database, findingId: number): FindingRow | undefined {
  return resultToRow<FindingRow>(
    db.exec('SELECT * FROM review_findings WHERE id = ?', [findingId])
  )
}

// ── Artifacts queries ──

export function getArtifact(
  db: Database,
  sessionId: string,
  artifactType: string
): ArtifactRow | undefined {
  return resultToRow<ArtifactRow>(
    db.exec(
      'SELECT * FROM markdown_artifacts WHERE session_id = ? AND artifact_type = ? ORDER BY parsed_at DESC LIMIT 1',
      [sessionId, artifactType]
    )
  )
}

export function getArtifactsForSession(db: Database, sessionId: string): ArtifactRow[] {
  return resultToRows<ArtifactRow>(
    db.exec(
      'SELECT * FROM markdown_artifacts WHERE session_id = ? ORDER BY parsed_at ASC',
      [sessionId]
    )
  )
}

// ── Map runs queries ──

export function getMapRunsForSession(db: Database, sessionId: string): MapRunRow[] {
  return resultToRows<MapRunRow>(
    db.exec(
      'SELECT * FROM map_runs WHERE session_id = ? ORDER BY run_number ASC',
      [sessionId]
    )
  )
}

export function getMapRun(
  db: Database,
  sessionId: string,
  runNumber: number
): MapRunRow | undefined {
  return resultToRow<MapRunRow>(
    db.exec(
      'SELECT * FROM map_runs WHERE session_id = ? AND run_number = ?',
      [sessionId, runNumber]
    )
  )
}

// ── Map sections queries ──

export function getSectionsForRun(db: Database, mapRunId: number): MapSectionRow[] {
  return resultToRows<MapSectionRow>(
    db.exec(
      'SELECT * FROM map_sections WHERE map_run_id = ? ORDER BY display_order ASC',
      [mapRunId]
    )
  )
}

// ── Map files queries ──

export function getFilesForSection(db: Database, sectionId: number): MapFileRow[] {
  return resultToRows<MapFileRow>(
    db.exec(
      'SELECT * FROM map_files WHERE section_id = ? ORDER BY display_order ASC',
      [sectionId]
    )
  )
}

export function getMapFile(db: Database, fileId: number): MapFileRow | undefined {
  return resultToRow<MapFileRow>(
    db.exec('SELECT * FROM map_files WHERE id = ?', [fileId])
  )
}

// ── User file progress queries ──

export function getFileProgress(
  db: Database,
  mapFileId: number
): FileProgressRow | undefined {
  return resultToRow<FileProgressRow>(
    db.exec('SELECT * FROM user_file_progress WHERE map_file_id = ?', [mapFileId])
  )
}

export function upsertFileProgress(
  db: Database,
  mapFileId: number,
  isReviewed: boolean
): void {
  db.run(
    `INSERT INTO user_file_progress (map_file_id, is_reviewed, reviewed_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(map_file_id)
     DO UPDATE SET is_reviewed = ?, reviewed_at = datetime('now')`,
    [mapFileId, isReviewed ? 1 : 0, isReviewed ? 1 : 0]
  )
}

export function deleteFileProgress(db: Database, mapFileId: number): void {
  db.run('DELETE FROM user_file_progress WHERE map_file_id = ?', [mapFileId])
}

// ── User finding progress queries ──

export function getFindingProgress(
  db: Database,
  findingId: number
): FindingProgressRow | undefined {
  return resultToRow<FindingProgressRow>(
    db.exec('SELECT * FROM user_finding_progress WHERE finding_id = ?', [findingId])
  )
}

export function upsertFindingProgress(
  db: Database,
  findingId: number,
  status: FindingProgressRow['status']
): void {
  db.run(
    `INSERT INTO user_finding_progress (finding_id, status, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(finding_id)
     DO UPDATE SET status = ?, updated_at = datetime('now')`,
    [findingId, status, status]
  )
}

export function deleteFindingProgress(db: Database, findingId: number): void {
  db.run('DELETE FROM user_finding_progress WHERE finding_id = ?', [findingId])
}

// ── User round progress queries ──

export function getRoundById(db: Database, id: number): ReviewRoundRow | undefined {
  return resultToRow<ReviewRoundRow>(
    db.exec('SELECT * FROM review_rounds WHERE id = ?', [id])
  )
}

export function getRoundProgress(
  db: Database,
  roundId: number
): RoundProgressRow | undefined {
  return resultToRow<RoundProgressRow>(
    db.exec('SELECT * FROM user_round_progress WHERE round_id = ?', [roundId])
  )
}

export function upsertRoundProgress(
  db: Database,
  roundId: number,
  status: RoundProgressRow['status']
): void {
  db.run(
    `INSERT INTO user_round_progress (round_id, status, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(round_id)
     DO UPDATE SET status = ?, updated_at = datetime('now')`,
    [roundId, status, status]
  )
}

export function deleteRoundProgress(db: Database, roundId: number): void {
  db.run('DELETE FROM user_round_progress WHERE round_id = ?', [roundId])
}

// ── Notes queries ──

export function getNotes(
  db: Database,
  targetType: NoteRow['target_type'],
  targetId: string
): NoteRow[] {
  return resultToRows<NoteRow>(
    db.exec(
      'SELECT * FROM user_notes WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC',
      [targetType, targetId]
    )
  )
}

export function getNote(db: Database, noteId: number): NoteRow | undefined {
  return resultToRow<NoteRow>(
    db.exec('SELECT * FROM user_notes WHERE id = ?', [noteId])
  )
}

export function insertNote(
  db: Database,
  targetType: NoteRow['target_type'],
  targetId: string,
  content: string
): number {
  db.run(
    `INSERT INTO user_notes (target_type, target_id, content)
     VALUES (?, ?, ?)`,
    [targetType, targetId, content]
  )
  const result = db.exec('SELECT last_insert_rowid() as id')
  const row = resultToRow<{ id: number }>(result)
  return row?.id ?? 0
}

export function updateNote(db: Database, noteId: number, content: string): void {
  db.run(
    `UPDATE user_notes SET content = ?, updated_at = datetime('now') WHERE id = ?`,
    [content, noteId]
  )
}

export function deleteNote(db: Database, noteId: number): void {
  db.run('DELETE FROM user_notes WHERE id = ?', [noteId])
}

// ── Command execution queries ──

export function getCommandHistory(db: Database, limit = 50): CommandExecutionRow[] {
  return resultToRows<CommandExecutionRow>(
    db.exec(
      'SELECT * FROM command_executions ORDER BY started_at DESC LIMIT ?',
      [limit]
    )
  )
}

// ── Chat queries ──

export function getConversation(
  db: Database,
  conversationId: string
): ChatConversationRow | undefined {
  return resultToRow<ChatConversationRow>(
    db.exec('SELECT * FROM chat_conversations WHERE id = ?', [conversationId])
  )
}

export function getConversationsForSession(
  db: Database,
  sessionId: string
): ChatConversationRow[] {
  return resultToRows<ChatConversationRow>(
    db.exec(
      'SELECT * FROM chat_conversations WHERE session_id = ? ORDER BY last_active_at DESC',
      [sessionId]
    )
  )
}

export function upsertConversation(
  db: Database,
  id: string,
  sessionId: string,
  targetType: ChatConversationRow['target_type'],
  targetId: number,
  claudeSessionId?: string | null
): void {
  db.run(
    `INSERT INTO chat_conversations (id, session_id, target_type, target_id, claude_session_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id)
     DO UPDATE SET claude_session_id = COALESCE(?, claude_session_id),
                   last_active_at = datetime('now')`,
    [id, sessionId, targetType, targetId, claudeSessionId ?? null, claudeSessionId ?? null]
  )
}

export function updateConversationClaudeSession(
  db: Database,
  conversationId: string,
  claudeSessionId: string
): void {
  db.run(
    `UPDATE chat_conversations SET claude_session_id = ?, last_active_at = datetime('now') WHERE id = ?`,
    [claudeSessionId, conversationId]
  )
}

export function updateConversationStatus(
  db: Database,
  conversationId: string,
  status: ChatConversationRow['status']
): void {
  db.run(
    `UPDATE chat_conversations SET status = ? WHERE id = ?`,
    [status, conversationId]
  )
}

export function getMessages(
  db: Database,
  conversationId: string
): ChatMessageRow[] {
  return resultToRows<ChatMessageRow>(
    db.exec(
      'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC',
      [conversationId]
    )
  )
}

export function insertMessage(
  db: Database,
  conversationId: string,
  role: ChatMessageRow['role'],
  content: string
): number {
  db.run(
    `INSERT INTO chat_messages (conversation_id, role, content)
     VALUES (?, ?, ?)`,
    [conversationId, role, content]
  )
  const result = db.exec('SELECT last_insert_rowid() as id')
  const row = resultToRow<{ id: number }>(result)
  return row?.id ?? 0
}

export function deleteConversation(db: Database, conversationId: string): void {
  db.run('DELETE FROM chat_conversations WHERE id = ?', [conversationId])
}

// ── Stats queries ──

export type StatsResult = {
  total_sessions: number
  active_sessions: number
  completed_reviews: number
  total_map_runs: number
  total_files_tracked: number
  unresolved_blockers: number
}

export function getStats(db: Database): StatsResult {
  const row = resultToRow<StatsResult>(
    db.exec(
      `SELECT
        (SELECT COUNT(*) FROM sessions) as total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions,
        (SELECT COUNT(*) FROM review_rounds WHERE verdict IS NOT NULL) as completed_reviews,
        (SELECT COUNT(*) FROM map_runs) as total_map_runs,
        (SELECT COUNT(*) FROM map_files) as total_files_tracked,
        (SELECT COUNT(*) FROM review_findings rf
         LEFT JOIN user_finding_progress ufp ON ufp.finding_id = rf.id
         WHERE rf.is_blocker = 1
           AND (ufp.status IS NULL OR ufp.status NOT IN ('fixed', 'wont_fix'))
        ) as unresolved_blockers`
    )
  )

  return {
    total_sessions: row?.total_sessions ?? 0,
    active_sessions: row?.active_sessions ?? 0,
    completed_reviews: row?.completed_reviews ?? 0,
    total_map_runs: row?.total_map_runs ?? 0,
    total_files_tracked: row?.total_files_tracked ?? 0,
    unresolved_blockers: row?.unresolved_blockers ?? 0,
  }
}
