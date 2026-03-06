import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import initSqlJs, { type Database } from 'sql.js'
import { FilesystemSync } from '../filesystem-sync.js'
import { runMigrations, applyPragmas } from '@open-code-review/cli/db'

let db: Database
let tmpDir: string
let sessionsDir: string

async function createDb(): Promise<Database> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  applyPragmas(database)
  runMigrations(database)
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
      const emitFn = (event: string, data: unknown) => {
        emitted.push({ event, data })
      }
      const mockIo = {
        emit: emitFn,
        to: () => ({ emit: emitFn }),
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
