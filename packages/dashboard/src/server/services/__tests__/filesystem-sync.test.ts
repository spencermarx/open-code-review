import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import initSqlJs, { type Database } from 'sql.js'
import { FilesystemSync } from '../filesystem-sync.js'

// Inline migration SQL for test isolation (mirrors packages/cli/src/lib/db/migrations.ts)
const SCHEMA_SQL = `
  CREATE TABLE sessions (
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

  CREATE TABLE review_rounds (
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

  CREATE TABLE reviewer_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
    reviewer_type TEXT NOT NULL,
    instance_number INTEGER NOT NULL DEFAULT 1,
    file_path TEXT NOT NULL,
    finding_count INTEGER DEFAULT 0,
    parsed_at TEXT,
    UNIQUE(round_id, reviewer_type, instance_number)
  );

  CREATE TABLE review_findings (
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

  CREATE TABLE markdown_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    round_number INTEGER,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, artifact_type, round_number, file_path)
  );

  CREATE TABLE map_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    run_number INTEGER NOT NULL,
    file_count INTEGER DEFAULT 0,
    map_md_path TEXT,
    parsed_at TEXT,
    UNIQUE(session_id, run_number)
  );

  CREATE TABLE map_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_run_id INTEGER NOT NULL REFERENCES map_runs(id) ON DELETE CASCADE,
    section_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_count INTEGER DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(map_run_id, section_number)
  );

  CREATE TABLE map_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES map_sections(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    role TEXT,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(section_id, file_path)
  );

  CREATE TABLE orchestration_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    phase TEXT,
    phase_number INTEGER,
    round INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE user_file_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_file_id INTEGER NOT NULL REFERENCES map_files(id) ON DELETE CASCADE,
    is_reviewed INTEGER NOT NULL DEFAULT 0,
    reviewed_at TEXT,
    UNIQUE(map_file_id)
  );

  CREATE TABLE user_finding_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_id INTEGER NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unread',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(finding_id)
  );

  CREATE TABLE user_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

let db: Database
let tmpDir: string
let sessionsDir: string

async function createDb(): Promise<Database> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run('PRAGMA foreign_keys = ON;')
  database.run(SCHEMA_SQL)
  return database
}

function queryAll(database: Database, sql: string, params: (string | number | null)[] = []) {
  const result = database.exec(sql, params)
  if (result.length === 0 || !result[0]) return []
  const columns = result[0].columns
  return result[0].values.map((row) => {
    const obj: Record<string, string | number | null> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i] as string | number | null
    }
    return obj
  })
}

function queryOne(database: Database, sql: string, params: (string | number | null)[] = []) {
  const rows = queryAll(database, sql, params)
  return rows[0]
}

beforeEach(async () => {
  db = await createDb()
  tmpDir = join(tmpdir(), `ocr-test-${randomUUID()}`)
  sessionsDir = join(tmpDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
})

afterEach(() => {
  db.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('FilesystemSync', () => {
  describe('fullScan', () => {
    it('backfills session from filesystem', async () => {
      const sessionId = '2026-01-01-main'
      const sessionDir = join(sessionsDir, sessionId)
      mkdirSync(sessionDir, { recursive: true })

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [sessionId])
      expect(session).toBeDefined()
      expect(session?.['branch']).toBe('main')
      expect(session?.['workflow_type']).toBe('review')
    })

    it('parses reviewer outputs into findings', async () => {
      const sessionId = '2026-01-01-feature'
      const sessionDir = join(sessionsDir, sessionId)
      const reviewsDir = join(sessionDir, 'rounds', 'round-1', 'reviews')
      mkdirSync(reviewsDir, { recursive: true })

      writeFileSync(
        join(reviewsDir, 'principal-1.md'),
        `# Principal-1 Review

## Finding: Bad Import
**Severity**: medium
**File**: \`src/index.ts\`
**Lines**: 10-15

Needs fixing.

## Finding: Security Issue
**Severity**: critical
**File**: \`src/auth.ts\`
**Lines**: 42

SQL injection risk.
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const findings = queryAll(db, 'SELECT * FROM review_findings ORDER BY id')
      expect(findings).toHaveLength(2)
      expect(findings[0]?.['title']).toBe('Bad Import')
      expect(findings[0]?.['severity']).toBe('medium')
      expect(findings[0]?.['is_blocker']).toBe(0)
      expect(findings[1]?.['title']).toBe('Security Issue')
      expect(findings[1]?.['severity']).toBe('critical')
      expect(findings[1]?.['is_blocker']).toBe(1)

      // Check reviewer_outputs
      const outputs = queryAll(db, 'SELECT * FROM reviewer_outputs')
      expect(outputs).toHaveLength(1)
      expect(outputs[0]?.['reviewer_type']).toBe('principal')
      expect(outputs[0]?.['instance_number']).toBe(1)
      expect(outputs[0]?.['finding_count']).toBe(2)
    })

    it('parses final.md into review_rounds', async () => {
      const sessionId = '2026-01-01-test'
      const sessionDir = join(sessionsDir, sessionId)
      const roundDir = join(sessionDir, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(
        join(roundDir, 'final.md'),
        `# Final Review Synthesis

## Verdict: APPROVE

**Blockers**: 0
**Should Fix**: 2
**Suggestions**: 3
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round).toBeDefined()
      expect(round?.['verdict']).toBe('APPROVE')
      expect(round?.['blocker_count']).toBe(0)
      expect(round?.['should_fix_count']).toBe(2)
      expect(round?.['suggestion_count']).toBe(3)
    })

    it('parses map.md into map_sections and map_files', async () => {
      const sessionId = '2026-01-01-map-test'
      const sessionDir = join(sessionsDir, sessionId)
      const runDir = join(sessionDir, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      writeFileSync(
        join(runDir, 'map.md'),
        `# Code Review Map

## Section 1: Database

Database changes.

| File | Role | +/- |
|------|------|-----|
| src/db.ts | Schema | +10/-2 |
| src/migrate.ts | Migrations | +5/-0 |

## Section 2: API

API updates.

| File | Role | +/- |
|------|------|-----|
| src/api.ts | Routes | +20/-5 |
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const runs = queryAll(db, 'SELECT * FROM map_runs WHERE session_id = ?', [sessionId])
      expect(runs).toHaveLength(1)
      expect(runs[0]?.['file_count']).toBe(3)

      const sections = queryAll(db, 'SELECT * FROM map_sections ORDER BY section_number')
      expect(sections).toHaveLength(2)
      expect(sections[0]?.['title']).toBe('Database')
      expect(sections[1]?.['title']).toBe('API')

      const files = queryAll(db, 'SELECT * FROM map_files ORDER BY display_order')
      expect(files).toHaveLength(3)
      expect(files[0]?.['file_path']).toBe('src/db.ts')
      expect(files[0]?.['lines_added']).toBe(10)
    })

    it('stores markdown artifacts', async () => {
      const sessionId = '2026-01-01-artifact-test'
      const sessionDir = join(sessionsDir, sessionId)
      mkdirSync(sessionDir, { recursive: true })

      writeFileSync(join(sessionDir, 'context.md'), '# Context\n\nSome context.')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const artifacts = queryAll(
        db,
        'SELECT * FROM markdown_artifacts WHERE session_id = ? AND artifact_type = ?',
        [sessionId, 'context'],
      )
      expect(artifacts).toHaveLength(1)
      expect(artifacts[0]?.['content']).toBe('# Context\n\nSome context.')
    })

    it('is idempotent — second scan produces same results', async () => {
      const sessionId = '2026-01-01-idempotent'
      const sessionDir = join(sessionsDir, sessionId)
      const reviewsDir = join(sessionDir, 'rounds', 'round-1', 'reviews')
      mkdirSync(reviewsDir, { recursive: true })

      writeFileSync(
        join(reviewsDir, 'principal-1.md'),
        `# Review\n\n## Finding: Bug\n**Severity**: high\n\nDescription.`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const findingsAfterFirst = queryAll(db, 'SELECT * FROM review_findings')
      expect(findingsAfterFirst).toHaveLength(1)

      // Second scan
      await sync.fullScan()

      const findingsAfterSecond = queryAll(db, 'SELECT * FROM review_findings')
      expect(findingsAfterSecond).toHaveLength(1)

      // Session should still be single row
      const sessions = queryAll(db, 'SELECT * FROM sessions')
      expect(sessions).toHaveLength(1)
    })

    it('handles multiple sessions', async () => {
      for (const id of ['2026-01-01-session-a', '2026-01-02-session-b']) {
        const dir = join(sessionsDir, id)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'context.md'), `# Context for ${id}`)
      }

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const sessions = queryAll(db, 'SELECT * FROM sessions')
      expect(sessions).toHaveLength(2)

      const artifacts = queryAll(db, 'SELECT * FROM markdown_artifacts')
      expect(artifacts).toHaveLength(2)
    })

    it('handles empty sessions directory', async () => {
      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const sessions = queryAll(db, 'SELECT * FROM sessions')
      expect(sessions).toHaveLength(0)
    })

    it('handles non-existent sessions directory', async () => {
      const sync = new FilesystemSync(db, join(tmpDir, 'nonexistent'))
      await sync.fullScan()

      const sessions = queryAll(db, 'SELECT * FROM sessions')
      expect(sessions).toHaveLength(0)
    })

    it('detects map workflow from filesystem structure', async () => {
      const sessionId = '2026-01-01-map-detect'
      const sessionDir = join(sessionsDir, sessionId)
      mkdirSync(join(sessionDir, 'map', 'runs', 'run-1'), { recursive: true })

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [sessionId])
      expect(session?.['workflow_type']).toBe('map')
    })
  })

  describe('Socket.IO emission', () => {
    it('emits artifact:created when io is provided', async () => {
      const sessionId = '2026-01-01-emit-test'
      const sessionDir = join(sessionsDir, sessionId)
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(join(sessionDir, 'context.md'), '# Context')

      const emitted: { event: string; data: unknown }[] = []
      const mockIo = {
        emit: (event: string, data: unknown) => {
          emitted.push({ event, data })
        },
      } as unknown as import('socket.io').Server

      const sync = new FilesystemSync(db, sessionsDir, mockIo)
      await sync.fullScan()

      expect(emitted.length).toBeGreaterThan(0)
      const contextEvent = emitted.find(
        (e) => e.event === 'artifact:created' && (e.data as { artifactType: string }).artifactType === 'context',
      )
      expect(contextEvent).toBeDefined()
    })
  })

  describe('watcher', () => {
    it('starts and stops without errors', () => {
      const sync = new FilesystemSync(db, sessionsDir)
      sync.startWatching()
      sync.stopWatching()
    })
  })
})
