/**
 * SQLite database access for the dashboard server.
 *
 * Opens the existing `.ocr/data/ocr.db` created by the CLI,
 * applies pragmas, and provides typed query helpers for all tables.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database } from 'sql.js'

// ── Types ──

export type SessionRow = {
  id: string
  branch: string
  status: 'active' | 'closed'
  workflow_type: 'review' | 'map'
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
  map_md_path: string | null
  parsed_at: string | null
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

function locateWasm(): string {
  const require = createRequire(import.meta.url)
  const sqlJsPath = require.resolve('sql.js')
  return join(dirname(sqlJsPath), 'sql-wasm.wasm')
}

function applyPragmas(db: Database): void {
  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA foreign_keys = ON;')
  db.run('PRAGMA busy_timeout = 5000;')
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
  ensureSchema(db)
  cachedDb = db
  cachedDbPath = dbPath

  return db
}

/**
 * Ensures the database has the required schema.
 * Checks for the sessions table — if missing, runs the full v1 schema.
 */
function ensureSchema(db: Database): void {
  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
  )
  if (tables.length > 0 && tables[0]?.values.length !== 0) {
    // Schema exists — apply any incremental migrations
    applyMigrations(db)
    return
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
      workflow_type TEXT NOT NULL CHECK(workflow_type IN ('review', 'map')),
      current_phase TEXT NOT NULL DEFAULT 'context',
      phase_number INTEGER NOT NULL DEFAULT 1,
      current_round INTEGER NOT NULL DEFAULT 1,
      current_map_run INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_dir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orchestration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      phase TEXT,
      phase_number INTEGER,
      round INTEGER,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      verdict TEXT,
      blocker_count INTEGER DEFAULT 0,
      suggestion_count INTEGER DEFAULT 0,
      should_fix_count INTEGER DEFAULT 0,
      final_md_path TEXT,
      parsed_at TEXT,
      UNIQUE(session_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS reviewer_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
      reviewer_type TEXT NOT NULL,
      instance_number INTEGER NOT NULL DEFAULT 1,
      file_path TEXT NOT NULL,
      finding_count INTEGER DEFAULT 0,
      parsed_at TEXT,
      UNIQUE(round_id, reviewer_type, instance_number)
    );

    CREATE TABLE IF NOT EXISTS review_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_output_id INTEGER NOT NULL REFERENCES reviewer_outputs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
      file_path TEXT,
      line_start INTEGER,
      line_end INTEGER,
      summary TEXT,
      is_blocker INTEGER NOT NULL DEFAULT 0,
      parsed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS markdown_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL,
      round_number INTEGER,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, artifact_type, round_number, file_path)
    );

    CREATE TABLE IF NOT EXISTS map_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      run_number INTEGER NOT NULL,
      file_count INTEGER DEFAULT 0,
      map_md_path TEXT,
      parsed_at TEXT,
      UNIQUE(session_id, run_number)
    );

    CREATE TABLE IF NOT EXISTS map_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_run_id INTEGER NOT NULL REFERENCES map_runs(id) ON DELETE CASCADE,
      section_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_count INTEGER DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(map_run_id, section_number)
    );

    CREATE TABLE IF NOT EXISTS map_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES map_sections(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      role TEXT,
      lines_added INTEGER DEFAULT 0,
      lines_deleted INTEGER DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(section_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS user_file_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_file_id INTEGER NOT NULL REFERENCES map_files(id) ON DELETE CASCADE,
      is_reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT,
      UNIQUE(map_file_id)
    );

    CREATE TABLE IF NOT EXISTS user_finding_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id INTEGER NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acknowledged', 'fixed', 'wont_fix')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(finding_id)
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('session', 'round', 'finding', 'run', 'section', 'file')),
      target_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS command_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL,
      args TEXT,
      exit_code INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      output TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('map_run', 'review_round')),
      target_id INTEGER NOT NULL,
      claude_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO schema_version (version, description)
    VALUES (1, 'Initial schema — sessions, events, artifacts, user state');
  `)

  applyMigrations(db)
}

/**
 * Applies incremental schema migrations for existing databases.
 */
function applyMigrations(db: Database): void {
  // Migration v2: Add chat tables
  const chatTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_conversations'"
  )
  if (chatTable.length === 0 || chatTable[0]?.values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('map_run', 'review_round')),
        target_id INTEGER NOT NULL,
        claude_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO schema_version (version, description)
      VALUES (2, 'Add chat_conversations and chat_messages tables');
    `)
  }

  // Migration v3: Add user_round_progress table
  const roundProgressTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_round_progress'"
  )
  if (roundProgressTable.length === 0 || roundProgressTable[0]?.values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS user_round_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'needs_review'
          CHECK(status IN ('needs_review', 'in_progress', 'changes_made', 'acknowledged', 'dismissed')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(round_id)
      );

      INSERT OR IGNORE INTO schema_version (version, description)
      VALUES (3, 'Add user_round_progress table for round-level triage');
    `)
  }
}

/**
 * Saves the in-memory database state to disk.
 */
export function saveDb(db: Database, ocrDir: string): void {
  const dbPath = join(ocrDir, 'data', 'ocr.db')
  const data = db.export()
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(dbPath, Buffer.from(data))
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

// ── Generic query helpers ──

type SqlValue = string | number | null

function resultToRows<T>(
  result: ReturnType<Database['exec']>
): T[] {
  if (result.length === 0 || !result[0]) {
    return []
  }
  const { columns, values } = result[0]
  return values.map((row) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i]
    }
    return obj as T
  })
}

function resultToRow<T>(
  result: ReturnType<Database['exec']>
): T | undefined {
  const rows = resultToRows<T>(result)
  return rows[0]
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

export interface StatsResult {
  total_sessions: number
  active_sessions: number
  completed_reviews: number
  total_map_runs: number
  total_files_tracked: number
  unresolved_blockers: number
}

export function getStats(db: Database): StatsResult {
  const totalSessions = resultToRow<{ c: number }>(
    db.exec('SELECT COUNT(*) as c FROM sessions')
  )?.c ?? 0

  const activeSessions = resultToRow<{ c: number }>(
    db.exec("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
  )?.c ?? 0

  const completedReviews = resultToRow<{ c: number }>(
    db.exec('SELECT COUNT(*) as c FROM review_rounds WHERE verdict IS NOT NULL')
  )?.c ?? 0

  const totalMapRuns = resultToRow<{ c: number }>(
    db.exec('SELECT COUNT(*) as c FROM map_runs')
  )?.c ?? 0

  const totalFilesTracked = resultToRow<{ c: number }>(
    db.exec('SELECT COUNT(*) as c FROM map_files')
  )?.c ?? 0

  const unresolvedBlockers = resultToRow<{ c: number }>(
    db.exec(
      `SELECT COUNT(*) as c FROM review_findings rf
       LEFT JOIN user_finding_progress ufp ON ufp.finding_id = rf.id
       WHERE rf.is_blocker = 1
         AND (ufp.status IS NULL OR ufp.status NOT IN ('fixed', 'wont_fix'))`
    )
  )?.c ?? 0

  return {
    total_sessions: totalSessions,
    active_sessions: activeSessions,
    completed_reviews: completedReviews,
    total_map_runs: totalMapRuns,
    total_files_tracked: totalFilesTracked,
    unresolved_blockers: unresolvedBlockers,
  }
}
