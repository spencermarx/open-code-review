import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  openDatabase,
  runMigrations,
  type Database,
} from '@open-code-review/persistence'
import { removeTempWorkspace } from '@open-code-review/persistence/test-support'
import { FilesystemSync } from '../filesystem-sync.js'

let db: Database
let tmpDir: string
let sessionsDir: string

async function createDb(dir: string): Promise<Database> {
  const database = await openDatabase(join(dir, 'test.db'))
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
  tmpDir = join(tmpdir(), `ocr-test-${randomUUID()}`)
  sessionsDir = join(tmpDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  db = await createDb(tmpDir)
})

afterEach(() => {
  removeTempWorkspace(tmpDir)
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

    it('skips empty session directories with no artifacts', async () => {
      const sessionId = '2026-01-01-empty-ghost'
      const sessionDir = join(sessionsDir, sessionId)
      mkdirSync(join(sessionDir, 'rounds', 'round-1', 'reviews'), { recursive: true })

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [sessionId])
      expect(session).toBeUndefined()
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

    it('normalizes a legacy off-vocabulary verdict to the canonical gate (accept_with_followups → APPROVE)', async () => {
      // The accept_with_followups bug: old rows carry a retired composite
      // verdict. Read-time normalization collapses it to its merge gate so the
      // banner renders APPROVE instead of an ambiguous "?".
      const sessionId = '2026-01-01-legacy-verdict'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(
        join(roundDir, 'round-meta.json'),
        JSON.stringify(makeRoundMeta({ verdict: 'accept_with_followups' })),
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round?.['verdict']).toBe('APPROVE')
    })

    it('stores an unmappable verdict verbatim (banner falls back to neutral)', async () => {
      // A value the normalizer can't confidently map is preserved raw rather
      // than coerced — the dashboard renders its neutral fallback for it.
      const sessionId = '2026-01-01-unknown-verdict'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })

      writeFileSync(
        join(roundDir, 'round-meta.json'),
        JSON.stringify(makeRoundMeta({ verdict: 'ship it maybe' })),
      )

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const round = queryOne(db, 'SELECT * FROM review_rounds WHERE session_id = ?', [sessionId])
      expect(round?.['verdict']).toBe('ship it maybe')
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

  describe('terminal completion is the CLI\'s, never fabricated from artifacts (D1)', () => {
    // Insert a session row + a round_completed event directly, mirroring what the
    // CLI's complete-round commits to the shared DB. Used to prove the safety net
    // closes WHEN (and only when) the CLI's terminal evidence exists.
    function seedSession(
      sessionId: string,
      opts: {
        status?: 'active' | 'closed'
        phase?: string
        phaseNumber?: number
        workflowType?: 'review' | 'map'
        round?: number
      } = {},
    ): void {
      const {
        status = 'active',
        phase = 'synthesis',
        phaseNumber = 7,
        workflowType = 'review',
        round = 1,
      } = opts
      db.run(
        `INSERT INTO sessions (id, branch, workflow_type, status, current_phase, phase_number, current_round, current_map_run, session_dir)
         VALUES (?, 'main', ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, workflowType, status, phase, phaseNumber, round, round, join(sessionsDir, sessionId)],
      )
      db.run(
        `INSERT INTO orchestration_events (session_id, event_type, phase, phase_number, round)
         VALUES (?, 'session_created', ?, 1, 1)`,
        [sessionId, phase],
      )
    }

    function addTerminalEvent(sessionId: string, eventType: 'round_completed' | 'map_completed', round = 1): void {
      db.run(
        `INSERT INTO orchestration_events (session_id, event_type, phase, phase_number, round)
         VALUES (?, ?, 'synthesis', 7, ?)`,
        [sessionId, eventType, round],
      )
    }

    it('a backfilled session with final.md but no round_completed event derives synthesis, stays open, and is not complete', async () => {
      // The accept-too-soon defect: final.md presence alone must NOT be read as
      // terminal completion. Such a round is at the synthesis phase, the session
      // stays open, and session_completeness must not report it complete.
      const sessionId = '2026-01-01-final-only'
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      writeFileSync(join(roundDir, 'final.md'), '# Final Review Synthesis\n\n## Verdict: APPROVE\n')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT * FROM sessions WHERE id = ?', [sessionId])
      expect(session).toBeDefined()
      expect(session?.['current_phase']).toBe('synthesis')
      expect(session?.['phase_number']).toBe(7)
      expect(session?.['status']).toBe('active')

      const completeness = queryOne(
        db,
        'SELECT completeness_state FROM session_completeness WHERE session_id = ?',
        [sessionId],
      )
      expect(completeness?.['completeness_state']).not.toBe('complete')

      // And no terminal artifact event was fabricated.
      const events = queryAll(
        db,
        "SELECT * FROM orchestration_events WHERE session_id = ? AND event_type = 'round_completed'",
        [sessionId],
      )
      expect(events).toHaveLength(0)
    })

    it('the final.md safety net does NOT close a session lacking the round_completed event', async () => {
      // A session stuck at synthesis with final.md on disk but no terminal event:
      // the reconciler must leave it open for the CLI's reconcile path, not close it.
      const sessionId = '2026-01-01-safety-net-no-event'
      seedSession(sessionId, { status: 'active', phase: 'synthesis', phaseNumber: 7 })
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      writeFileSync(join(roundDir, 'final.md'), '# Final\n\n## Verdict: APPROVE\n')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT status, current_phase FROM sessions WHERE id = ?', [sessionId])
      expect(session?.['status']).toBe('active')
      expect(session?.['current_phase']).not.toBe('complete')
    })

    it('the final.md safety net DOES close a session once the round_completed event exists', async () => {
      // The legitimate crashed-after-complete-round recovery: the CLI committed
      // the terminal event but the close never ran. With that evidence present,
      // the safety net completes the close.
      const sessionId = '2026-01-01-safety-net-with-event'
      seedSession(sessionId, { status: 'active', phase: 'synthesis', phaseNumber: 7 })
      addTerminalEvent(sessionId, 'round_completed', 1)
      const roundDir = join(sessionsDir, sessionId, 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      writeFileSync(join(roundDir, 'final.md'), '# Final\n\n## Verdict: APPROVE\n')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT status, current_phase, phase_number FROM sessions WHERE id = ?', [sessionId])
      expect(session?.['status']).toBe('closed')
      expect(session?.['current_phase']).toBe('complete')
      expect(session?.['phase_number']).toBe(8)

      const completeness = queryOne(
        db,
        'SELECT completeness_state FROM session_completeness WHERE session_id = ?',
        [sessionId],
      )
      expect(completeness?.['completeness_state']).toBe('complete')
    })

    it('the map.md safety net does NOT close a map session lacking the map_completed event', async () => {
      const sessionId = '2026-01-01-map-no-event'
      seedSession(sessionId, { status: 'active', phase: 'synthesis', phaseNumber: 5, workflowType: 'map' })
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })
      writeFileSync(join(runDir, 'map.md'), '# Code Review Map\n\n## Section 1: Core\n\nCore.\n')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT status, current_phase FROM sessions WHERE id = ?', [sessionId])
      expect(session?.['status']).toBe('active')
      expect(session?.['current_phase']).not.toBe('complete')
    })

    it('the map.md safety net DOES close a map session once the map_completed event exists', async () => {
      const sessionId = '2026-01-01-map-with-event'
      seedSession(sessionId, { status: 'active', phase: 'synthesis', phaseNumber: 5, workflowType: 'map' })
      addTerminalEvent(sessionId, 'map_completed', 1)
      const runDir = join(sessionsDir, sessionId, 'map', 'runs', 'run-1')
      mkdirSync(runDir, { recursive: true })
      writeFileSync(join(runDir, 'map.md'), '# Code Review Map\n\n## Section 1: Core\n\nCore.\n')

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()

      const session = queryOne(db, 'SELECT status, current_phase, phase_number FROM sessions WHERE id = ?', [sessionId])
      expect(session?.['status']).toBe('closed')
      expect(session?.['current_phase']).toBe('complete')
      expect(session?.['phase_number']).toBe(6)
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

  describe('finding identity across rescans', () => {
    const findingIds = () =>
      queryAll(db, 'SELECT id, title FROM review_findings ORDER BY id').map((r) => `${r['id']}:${r['title']}`)

    const markProgress = (title: string, status: string) => {
      const row = queryOne(db, 'SELECT id FROM review_findings WHERE title = ?', [title])
      db.run('INSERT INTO user_finding_progress (finding_id, status) VALUES (?, ?)', [row!['id'] as number, status])
    }

    it('keeps finding ids and user progress when a reviewer .md is re-parsed', async () => {
      const reviewsDir = join(sessionsDir, '2026-01-01-ids-md', 'rounds', 'round-1', 'reviews')
      mkdirSync(reviewsDir, { recursive: true })
      const file = join(reviewsDir, 'principal-1.md')
      const md = (extra = '') =>
        `# Review\n\n## Finding: Bad Import\n**Severity**: medium\n**File**: \`src/a.ts\`\n**Lines**: 10\n\nx\n\n` +
        `## Finding: Leak\n**Severity**: high\n**File**: \`src/b.ts\`\n**Lines**: 5\n\ny\n${extra}`
      writeFileSync(file, md())

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()
      const before = findingIds()
      const outputBefore = queryOne(db, 'SELECT id FROM reviewer_outputs')!['id']
      markProgress('Leak', 'fixed')

      // Touch the file into the future so shouldSkip() does not short-circuit the re-parse.
      for (let i = 1; i <= 2; i++) {
        const t = new Date(Date.now() + i * 60_000)
        writeFileSync(file, md(`\nnote ${i}\n`))
        utimesSync(file, t, t)
        await sync.fullScan()
      }

      expect(findingIds()).toEqual(before)
      expect(queryOne(db, 'SELECT id FROM reviewer_outputs')!['id']).toBe(outputBefore)
      const progress = queryAll(
        db,
        `SELECT rf.title, ufp.status FROM user_finding_progress ufp JOIN review_findings rf ON rf.id = ufp.finding_id`,
      )
      expect(progress).toEqual([{ title: 'Leak', status: 'fixed' }])
    })

    it('keeps finding ids and user progress when round-meta.json is re-ingested', async () => {
      const roundDir = join(sessionsDir, '2026-01-01-ids-meta', 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      const meta = {
        schema_version: 1,
        verdict: 'REQUEST CHANGES',
        reviewers: [
          {
            type: 'principal',
            instance: 1,
            findings: [
              { title: 'SQL Injection', category: 'blocker', severity: 'high', file_path: 'src/auth.ts', line_start: 42 },
              { title: 'Missing validation', category: 'should_fix', severity: 'medium', file_path: 'src/auth.ts', line_start: 7 },
            ],
          },
        ],
      }
      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(meta))

      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()
      const before = findingIds()
      markProgress('SQL Injection', 'acknowledged')

      await sync.fullScan()
      // A line shift of the same finding is still the same finding.
      meta.reviewers[0]!.findings[0]!.line_start = 44
      const t = new Date(Date.now() + 60_000)
      writeFileSync(join(roundDir, 'round-meta.json'), JSON.stringify(meta))
      utimesSync(join(roundDir, 'round-meta.json'), t, t)
      await sync.fullScan()

      expect(findingIds()).toEqual(before)
      const progress = queryAll(
        db,
        `SELECT rf.title, rf.line_start, ufp.status FROM user_finding_progress ufp JOIN review_findings rf ON rf.id = ufp.finding_id`,
      )
      expect(progress).toEqual([{ title: 'SQL Injection', line_start: 44, status: 'acknowledged' }])
    })

    it('deletes only findings that left the source and inserts new ones', async () => {
      const roundDir = join(sessionsDir, '2026-01-01-ids-gone', 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      const f = (title: string, line: number) => ({ title, category: 'should_fix', severity: 'low', file_path: 'src/x.ts', line_start: line })
      const write = (findings: unknown[], offsetMin: number) => {
        const p = join(roundDir, 'round-meta.json')
        writeFileSync(p, JSON.stringify({ schema_version: 1, verdict: 'APPROVE', reviewers: [{ type: 'quality', instance: 1, findings }] }))
        const t = new Date(Date.now() + offsetMin * 60_000)
        utimesSync(p, t, t)
      }
      write([f('Keep', 1), f('Drop', 2)], 1)
      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()
      const keepId = queryOne(db, "SELECT id FROM review_findings WHERE title = 'Keep'")!['id']

      write([f('Keep', 1), f('New', 3)], 2)
      await sync.fullScan()

      const rows = queryAll(db, 'SELECT id, title FROM review_findings ORDER BY id')
      expect(rows.map((r) => r['title'])).toEqual(['Keep', 'New'])
      expect(rows[0]?.['id']).toBe(keepId)
    })

    it('does not move progress between same-title findings when the match is ambiguous', async () => {
      const roundDir = join(sessionsDir, '2026-01-01-ids-tie', 'rounds', 'round-1')
      mkdirSync(roundDir, { recursive: true })
      const f = (line: number) => ({ title: 'Dup', category: 'should_fix', severity: 'low', file_path: 'src/x.ts', line_start: line })
      const write = (lines: number[], offsetMin: number) => {
        const p = join(roundDir, 'round-meta.json')
        writeFileSync(p, JSON.stringify({ schema_version: 1, verdict: 'APPROVE', reviewers: [{ type: 'quality', instance: 1, findings: lines.map(f) }] }))
        const t = new Date(Date.now() + offsetMin * 60_000)
        utimesSync(p, t, t)
      }
      write([10, 20], 1)
      const sync = new FilesystemSync(db, sessionsDir)
      await sync.fullScan()
      const old = queryOne(db, 'SELECT id FROM review_findings WHERE line_start = 10')!['id'] as number
      db.run("INSERT INTO user_finding_progress (finding_id, status) VALUES (?, 'fixed')", [old])

      // 15 is equidistant from the stored 10 and 20: a tie must insert, never guess.
      write([15], 2)
      await sync.fullScan()

      const rows = queryAll(db, 'SELECT id, line_start FROM review_findings')
      expect(rows).toHaveLength(1)
      expect(rows[0]?.['line_start']).toBe(15)
      expect(rows[0]?.['id']).not.toBe(old)
      expect(queryAll(db, 'SELECT * FROM user_finding_progress')).toHaveLength(0)
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
