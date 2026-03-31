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
      writeFileSync(join(sessionDir, 'context.md'), '# Context\n')

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
      const runDir = join(sessionDir, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })
      writeFileSync(join(runDir, 'topology.md'), '# Topology\n')

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

  describe('round-meta.json (orchestrator-first)', () => {
    function makeRoundMeta(overrides?: Record<string, unknown>) {
      return {
        schema_version: 1,
        verdict: 'REQUEST CHANGES',
        reviewers: [
          {
            type: 'principal',
            instance: 1,
            severity_high: 1,
            severity_medium: 1,
            severity_low: 0,
            severity_info: 0,
            findings: [
              {
                title: 'SQL Injection',
                category: 'blocker',
                severity: 'high',
                file_path: 'src/auth.ts',
                line_start: 42,
                line_end: 45,
                summary: 'User input passed to query',
                flagged_by: ['@principal-1'],
              },
              {
                title: 'Missing validation',
                category: 'should_fix',
                severity: 'medium',
                summary: 'No input validation',
              },
            ],
          },
          {
            type: 'quality',
            instance: 1,
            findings: [
              {
                title: 'Use caching',
                category: 'suggestion',
                severity: 'low',
                summary: 'Consider adding cache',
              },
            ],
          },
        ],
        ...overrides,
      }
    }

    it('processRoundMeta populates review_rounds with derived counts', async () => {
      const sessionId = '2026-01-01-round-meta-test'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(makeRoundMeta()))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round).toBeDefined()
      expect(round?.['verdict']).toBe('REQUEST CHANGES')
      expect(round?.['blocker_count']).toBe(1)
      expect(round?.['should_fix_count']).toBe(1)
      expect(round?.['suggestion_count']).toBe(1)
      expect(round?.['reviewer_count']).toBe(2)
      expect(round?.['total_finding_count']).toBe(3)
      expect(round?.['source']).toBe('orchestrator')
    })

    it('processRoundMeta populates reviewer_outputs and review_findings', async () => {
      const sessionId = '2026-01-01-findings-meta'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(makeRoundMeta()))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const outputs = queryAll(db, 'SELECT * FROM reviewer_outputs ORDER BY reviewer_type')
      expect(outputs).toHaveLength(2)
      expect(outputs[0]?.['reviewer_type']).toBe('principal')
      expect(outputs[0]?.['finding_count']).toBe(2)
      expect(outputs[1]?.['reviewer_type']).toBe('quality')
      expect(outputs[1]?.['finding_count']).toBe(1)

      const findings = queryAll(db, 'SELECT * FROM review_findings ORDER BY id')
      expect(findings).toHaveLength(3)
      expect(findings[0]?.['title']).toBe('SQL Injection')
      expect(findings[0]?.['is_blocker']).toBe(1)
      expect(findings[0]?.['file_path']).toBe('src/auth.ts')
      expect(findings[1]?.['title']).toBe('Missing validation')
      expect(findings[1]?.['is_blocker']).toBe(0)
      expect(findings[2]?.['title']).toBe('Use caching')
    })

    it('processFinalMd defers to orchestrator when source=orchestrator', async () => {
      const sessionId = '2026-01-01-defer-test'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      // Write round-meta.json first (orchestrator)
      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(makeRoundMeta()))

      // Write final.md with DIFFERENT counts (parser would produce different numbers)
      writeFileSync(
        join(roundDir, 'final.md'),
        `# Final Review

## Verdict: APPROVE

**Blockers**: 5
**Should Fix**: 10
**Suggestions**: 20
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      // Should have orchestrator's counts, NOT the parser's
      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round?.['verdict']).toBe('REQUEST CHANGES') // from round-meta.json, not final.md
      expect(round?.['blocker_count']).toBe(1)  // orchestrator derived, not 5
      expect(round?.['should_fix_count']).toBe(1) // orchestrator derived, not 10
      expect(round?.['suggestion_count']).toBe(1) // orchestrator derived, not 20
      expect(round?.['source']).toBe('orchestrator')
      expect(round?.['final_md_path']).toBeTruthy() // still stores the path
    })

    it('processFinalMd falls back to parser when no orchestrator data', async () => {
      const sessionId = '2026-01-01-fallback-test'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      // Only final.md, no round-meta.json (legacy session)
      writeFileSync(
        join(roundDir, 'final.md'),
        `# Final Review

## Verdict: APPROVE

**Blockers**: 0
**Should Fix**: 2
**Suggestions**: 3
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round?.['verdict']).toBe('APPROVE')
      expect(round?.['blocker_count']).toBe(0)
      expect(round?.['should_fix_count']).toBe(2)
      expect(round?.['suggestion_count']).toBe(3)
      expect(round?.['source']).toBe('parser')
    })

    it('processReviewerOutput skips findings when source=orchestrator', async () => {
      const sessionId = '2026-01-01-skip-reviewer'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      const reviewsDir = join(roundDir, 'reviews')
      mkdirSync(reviewsDir, { recursive: true })

      // Write round-meta.json (orchestrator has 3 findings)
      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(makeRoundMeta()))

      // Write reviewer .md with DIFFERENT findings (parser would produce different data)
      writeFileSync(
        join(reviewsDir, 'principal-1.md'),
        `# Principal-1 Review

## Finding: Totally Different
**Severity**: low

A different finding from the parser.

## Finding: Another One
**Severity**: info

Info level.
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      // Should have orchestrator's findings (3), not the parser's (2)
      const findings = queryAll(db, 'SELECT * FROM review_findings')
      expect(findings).toHaveLength(3)
      expect(findings[0]?.['title']).toBe('SQL Injection') // from orchestrator

      // But the raw markdown should still be stored
      const artifacts = queryAll(
        db,
        'SELECT * FROM markdown_artifacts WHERE artifact_type = ?',
        ['reviewer-output'],
      )
      expect(artifacts).toHaveLength(1) // markdown stored for chat context
    })

    it('handles invalid round-meta.json gracefully', async () => {
      const sessionId = '2026-01-01-invalid-meta'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(join(roundDir, 'round-meta.json'), '{ invalid json }')

      const sync = new FilesystemSync(db, sessionsDir)
      // Should not throw
      await sync.fullScan()

      // No orchestrator data populated — any row that exists should NOT have source='orchestrator'
      const rounds = queryAll(db, 'SELECT * FROM review_rounds WHERE session_id = ? AND source = ?', [sessionId, 'orchestrator'])
      expect(rounds).toHaveLength(0)
    })
  })

  describe('map-meta.json (orchestrator-first)', () => {
    function makeMapMeta(overrides?: Record<string, unknown>) {
      return {
        schema_version: 1,
        sections: [
          {
            section_number: 1,
            title: 'Database Layer',
            description: 'Schema and migrations',
            files: [
              { file_path: 'src/db.ts', role: 'Schema', lines_added: 10, lines_deleted: 2 },
              { file_path: 'src/migrate.ts', role: 'Migration', lines_added: 5, lines_deleted: 0 },
            ],
          },
          {
            section_number: 2,
            title: 'API Layer',
            description: 'HTTP routes',
            files: [
              { file_path: 'src/api.ts', role: 'Routes', lines_added: 20, lines_deleted: 5 },
            ],
          },
        ],
        dependencies: [
          { from_section: 2, from_title: 'API Layer', to_section: 1, to_title: 'Database Layer', relationship: 'imports' },
        ],
        ...overrides,
      }
    }

    it('processMapMeta populates map_runs with derived counts', async () => {
      const sessionId = '2026-01-01-map-meta-test'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      writeFileSync(join(runDir, 'map-meta.json'), JSON.stringify(makeMapMeta()))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const run = queryOne(db, 'SELECT * FROM map_runs WHERE session_id = ?', [sessionId])
      expect(run).toBeDefined()
      expect(run?.['file_count']).toBe(3)
      expect(run?.['section_count']).toBe(2)
      expect(run?.['source']).toBe('orchestrator')
    })

    it('processMapMeta populates map_sections and map_files', async () => {
      const sessionId = '2026-01-01-map-sections-test'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      writeFileSync(join(runDir, 'map-meta.json'), JSON.stringify(makeMapMeta()))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const sections = queryAll(db, 'SELECT * FROM map_sections ORDER BY section_number')
      expect(sections).toHaveLength(2)
      expect(sections[0]?.['title']).toBe('Database Layer')
      expect(sections[0]?.['file_count']).toBe(2)
      expect(sections[1]?.['title']).toBe('API Layer')
      expect(sections[1]?.['file_count']).toBe(1)

      const files = queryAll(db, 'SELECT * FROM map_files ORDER BY id')
      expect(files).toHaveLength(3)
      expect(files[0]?.['file_path']).toBe('src/db.ts')
      expect(files[0]?.['role']).toBe('Schema')
      expect(files[0]?.['lines_added']).toBe(10)
      expect(files[1]?.['file_path']).toBe('src/migrate.ts')
      expect(files[2]?.['file_path']).toBe('src/api.ts')
    })

    it('processMapMd defers to orchestrator when source=orchestrator', async () => {
      const sessionId = '2026-01-01-map-defer-test'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      // Write map-meta.json first (orchestrator)
      writeFileSync(join(runDir, 'map-meta.json'), JSON.stringify(makeMapMeta()))

      // Write map.md with DIFFERENT data (parser would produce different sections)
      writeFileSync(
        join(runDir, 'map.md'),
        `# Code Review Map

## Section 1: Only One Section

| File | Role | +/- |
|------|------|-----|
| src/single.ts | Single | +1/-0 |
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      // Should have orchestrator's counts (3 files, 2 sections), not parser's (1 file, 1 section)
      const run = queryOne(db, 'SELECT * FROM map_runs WHERE session_id = ?', [sessionId])
      expect(run?.['file_count']).toBe(3)
      expect(run?.['section_count']).toBe(2)
      expect(run?.['source']).toBe('orchestrator')

      const sections = queryAll(db, 'SELECT * FROM map_sections')
      expect(sections).toHaveLength(2) // orchestrator's 2, not parser's 1

      // But raw markdown should still be stored
      const artifacts = queryAll(
        db,
        'SELECT * FROM markdown_artifacts WHERE artifact_type = ?',
        ['map'],
      )
      expect(artifacts).toHaveLength(1)
    })

    it('processMapMd falls back to parser when no orchestrator data', async () => {
      const sessionId = '2026-01-01-map-fallback'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      // Only map.md, no map-meta.json (legacy session)
      writeFileSync(
        join(runDir, 'map.md'),
        `# Code Review Map

## Section 1: Database

Database changes.

| File | Role | +/- |
|------|------|-----|
| src/db.ts | Schema | +10/-2 |
`,
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const run = queryOne(db, 'SELECT * FROM map_runs WHERE session_id = ?', [sessionId])
      expect(run?.['file_count']).toBe(1)
      expect(run?.['source']).toBe('parser')
    })

    it('preserves user file progress across re-import', async () => {
      const sessionId = '2026-01-01-map-progress'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      writeFileSync(join(runDir, 'map-meta.json'), JSON.stringify(makeMapMeta()))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      // Mark a file as reviewed
      const file = queryOne(db, "SELECT id FROM map_files WHERE file_path = 'src/db.ts'")
      expect(file).toBeDefined()
      db.run(
        `INSERT INTO user_file_progress (map_file_id, is_reviewed, reviewed_at)
         VALUES (?, 1, datetime('now'))`,
        [file!['id'] as number],
      )

      // Re-scan — should stash and restore user progress
      await sync.fullScan()

      const progress = queryAll(db, 'SELECT * FROM user_file_progress')
      expect(progress).toHaveLength(1)
      expect(progress[0]?.['is_reviewed']).toBe(1)
    })

    it('handles invalid map-meta.json gracefully', async () => {
      const sessionId = '2026-01-01-invalid-map-meta'
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })

      writeFileSync(join(runDir, 'map-meta.json'), '{ broken json }')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const runs = queryAll(db, "SELECT * FROM map_runs WHERE session_id = ? AND source = 'orchestrator'", [sessionId])
      expect(runs).toHaveLength(0)
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
