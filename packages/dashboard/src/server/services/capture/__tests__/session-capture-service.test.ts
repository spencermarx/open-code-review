/**
 * Characterization tests for SessionCaptureService.
 *
 * These lock in the current behavior of session-id capture and resume-
 * context resolution before downstream call sites are migrated. They
 * exercise the service against a real sql.js database (Khorikov classical
 * school — no internal mocks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { insertSession } from '@open-code-review/cli/db'
import { openDb } from '../../../db.js'
import type { AiCliAdapter, AiCliService } from '../../ai-cli/index.js'
import { createSessionCaptureService } from '../session-capture-service.js'

let workspace: string
let ocrDir: string

beforeEach(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'capture-svc-'))
  ocrDir = join(workspace, '.ocr')
  mkdirSync(join(ocrDir, 'data'), { recursive: true })
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

/**
 * Hand-rolled stub adapter — only the surface SessionCaptureService
 * touches. Stays tiny on purpose; the real adapters are exercised by
 * their own unit tests + the dashboard-api-e2e suite.
 */
function stubAdapter(
  binary: string,
  resumeCommand: (sid: string) => string,
): AiCliAdapter {
  return {
    name: binary,
    binary,
    supportsPerTaskModel: false,
    // The adapter contract requires both the argv form (canonical
    // for spawn) and the string form (for panel display). Tests
    // exercise `buildResumeCommand` mostly; we derive args from a
    // naive split so the surface is type-complete without the
    // shared `vendor-resume.ts` helper's shell-quoting machinery.
    buildResumeArgs: (sid: string) => resumeCommand(sid).split(/\s+/).slice(1),
    buildResumeCommand: resumeCommand,
    detect: () => ({ found: true }),
    spawn: () => {
      throw new Error('not used in tests')
    },
    createParser: () => ({ parseLine: () => [] }),
    parseLine: () => [],
    listModels: async () => [],
  }
}

function stubAiCliService(adapters: Record<string, AiCliAdapter>): AiCliService {
  return {
    getAdapterByBinary: (vendor: string) => adapters[vendor] ?? null,
    // Cached startup detection equivalent — registered adapters are
    // treated as available so `resolveResumeContext` can reach the
    // resumable path under test. Tests that need the unavailable case
    // simply don't register the vendor.
    isAdapterAvailable: (vendor: string) => Boolean(adapters[vendor]),
  } as unknown as AiCliService
}

async function setup(adapters?: Record<string, AiCliAdapter>) {
  const db = await openDb(ocrDir)
  const aiCliService = stubAiCliService(
    adapters ?? {
      claude: stubAdapter('claude', (sid) => `claude --resume ${sid}`),
    },
  )
  const svc = createSessionCaptureService({ db, ocrDir, aiCliService })
  return { db, svc, aiCliService }
}

function seedDashboardRow(
  db: Awaited<ReturnType<typeof openDb>>,
  uid: string,
): number {
  db.run(
    `INSERT INTO command_executions
       (uid, command, args, started_at, vendor, last_heartbeat_at)
     VALUES (?, 'review', '[]', datetime('now'), 'claude', datetime('now'))`,
    [uid],
  )
  const result = db.exec('SELECT last_insert_rowid() as id')
  return result[0]?.values[0]?.[0] as number
}

describe('SessionCaptureService — recordSessionId', () => {
  it('writes the vendor session id to the parent execution row', async () => {
    const { db, svc } = await setup()
    const id = seedDashboardRow(db, 'uid-1')

    svc.recordSessionId(id, 'vendor-abc-123')

    const result = db.exec(
      'SELECT vendor_session_id FROM command_executions WHERE id = ?',
      [id],
    )
    expect(result[0]?.values[0]?.[0]).toBe('vendor-abc-123')
  })

  it('is idempotent — second call with a different id is a COALESCE no-op', async () => {
    const { db, svc } = await setup()
    const id = seedDashboardRow(db, 'uid-2')

    svc.recordSessionId(id, 'first')
    svc.recordSessionId(id, 'second-should-not-overwrite')

    const result = db.exec(
      'SELECT vendor_session_id FROM command_executions WHERE id = ?',
      [id],
    )
    expect(result[0]?.values[0]?.[0]).toBe('first')
  })

  // Round-2 SF3b: pin the warn-once-per-execution drift behavior.
  // Vendors emit `session_id` on every stream message — without
  // gating, a single drift event would log dozens of times.
  it('logs vendor session id drift exactly once per execution', async () => {
    const { db, svc } = await setup()
    const id = seedDashboardRow(db, 'uid-drift')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      svc.recordSessionId(id, 'first-captured')
      // Subsequent drift calls — should warn ONCE total.
      svc.recordSessionId(id, 'drift-1')
      svc.recordSessionId(id, 'drift-2')
      svc.recordSessionId(id, 'drift-3')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/vendor session id drift/)
      expect(warnSpy.mock.calls[0]?.[0]).toContain('first-captured')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT warn on idempotent same-id repeats (only on actual drift)', async () => {
    const { db, svc } = await setup()
    const id = seedDashboardRow(db, 'uid-no-drift')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      svc.recordSessionId(id, 'sid-x')
      svc.recordSessionId(id, 'sid-x') // same id, repeated
      svc.recordSessionId(id, 'sid-x')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('SessionCaptureService — linkInvocationToWorkflow', () => {
  it('sets workflow_id on the matching dashboard row by uid', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-3')
    insertSession(db, {
      id: '2026-05-01-test',
      branch: 'feat/test',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/2026-05-01-test'),
    })

    svc.linkInvocationToWorkflow('uid-3', '2026-05-01-test')

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['uid-3'],
    )
    expect(result[0]?.values[0]?.[0]).toBe('2026-05-01-test')
  })

  it('does not overwrite an already-linked workflow_id', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-4')
    insertSession(db, {
      id: 'pre-existing',
      branch: 'feat/pre',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/pre-existing'),
    })
    db.run(
      `UPDATE command_executions SET workflow_id = 'pre-existing' WHERE uid = 'uid-4'`,
    )

    svc.linkInvocationToWorkflow('uid-4', 'something-else')

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['uid-4'],
    )
    expect(result[0]?.values[0]?.[0]).toBe('pre-existing')
  })

  it('is a silent no-op when the uid does not match a row', async () => {
    const { svc } = await setup()
    expect(() =>
      svc.linkInvocationToWorkflow('nonexistent-uid', 'wf-1'),
    ).not.toThrow()
  })
})

describe('SessionCaptureService — autoLinkPendingDashboardExecution', () => {
  it('links the most recent unlinked dashboard execution to a new workflow', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-auto',
      branch: 'feat/auto',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-auto'),
    })
    // Seed a dashboard-spawned execution: command starts with `ocr review`,
    // last_heartbeat_at set, no workflow_id yet.
    db.run(
      `INSERT INTO command_executions
         (uid, command, args, started_at, vendor, last_heartbeat_at)
       VALUES (?, ?, '[]', datetime('now'), 'claude', datetime('now'))`,
      ['dashboard-uid-auto', 'ocr review --team [...] --requirements ...'],
    )

    svc.autoLinkPendingDashboardExecution('wf-auto')

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['dashboard-uid-auto'],
    )
    expect(result[0]?.values[0]?.[0]).toBe('wf-auto')
  })

  it('skips agent-session rows (command does not match the dashboard prefix)', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-skip',
      branch: 'feat/skip',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-skip'),
    })
    db.run(
      `INSERT INTO command_executions
         (uid, command, args, started_at, vendor, last_heartbeat_at)
       VALUES (?, ?, '[]', datetime('now'), 'claude', datetime('now'))`,
      ['agent-uid', 'session-instance:principal-1'],
    )

    svc.autoLinkPendingDashboardExecution('wf-skip')

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['agent-uid'],
    )
    expect(result[0]?.values[0]?.[0]).toBeNull()
  })

  it('does not relink rows that already have a workflow_id', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-existing',
      branch: 'feat/existing',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-existing'),
    })
    insertSession(db, {
      id: 'wf-fresh',
      branch: 'feat/fresh',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-fresh'),
    })
    db.run(
      `INSERT INTO command_executions
         (uid, command, args, started_at, vendor, last_heartbeat_at, workflow_id)
       VALUES (?, ?, '[]', datetime('now'), 'claude', datetime('now'), ?)`,
      ['already-linked-uid', 'ocr review --foo', 'wf-existing'],
    )

    svc.autoLinkPendingDashboardExecution('wf-fresh')

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['already-linked-uid'],
    )
    // Untouched — pre-existing linkage takes precedence.
    expect(result[0]?.values[0]?.[0]).toBe('wf-existing')
  })

  it('is a silent no-op when there is no candidate row', async () => {
    const { svc } = await setup()
    expect(() => svc.autoLinkPendingDashboardExecution('wf-none')).not.toThrow()
  })
})

describe('SessionCaptureService — linkExecutionToActiveSession', () => {
  it('links the calling execution to the most-recent active session', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-active',
      branch: 'feat/active',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-active'),
    })
    // Push the session's started_at slightly into the future so the
    // post-spawn comparison succeeds (test rows can be inserted on the
    // same clock tick as the dashboard execution row).
    seedDashboardRow(db, 'uid-active')

    const linked = svc.linkExecutionToActiveSession('uid-active')
    expect(linked).toBe(true)

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['uid-active'],
    )
    expect(result[0]?.values[0]?.[0]).toBe('wf-active')
  })

  it('returns true (no-op) when the execution already has a workflow_id', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-pre',
      branch: 'feat/pre',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-pre'),
    })
    seedDashboardRow(db, 'uid-pre')
    db.run(
      `UPDATE command_executions SET workflow_id = 'wf-pre' WHERE uid = 'uid-pre'`,
    )

    expect(svc.linkExecutionToActiveSession('uid-pre')).toBe(true)
  })

  it('returns false when the execution row does not exist', async () => {
    const { svc } = await setup()
    expect(svc.linkExecutionToActiveSession('nonexistent-uid')).toBe(false)
  })

  it('returns false when no recent session is available', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-orphan')
    // Session exists but its started_at predates the execution; the
    // comparator should reject it. We force a stale started_at.
    db.run(
      `INSERT INTO sessions (id, branch, status, workflow_type, current_phase, phase_number, current_round, current_map_run, started_at, updated_at, session_dir)
       VALUES ('stale', 'feat/stale', 'active', 'review', 'phase-0', 0, 0, 0, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', ?)`,
      [resolve(ocrDir, 'sessions/stale')],
    )

    expect(svc.linkExecutionToActiveSession('uid-orphan')).toBe(false)
  })

  // Round-2 SF3a: concurrent-review SQL filter regression. The
  // round-1 fix added `status='active'` + 30-min upper window. Without
  // those, an unrelated review's session created long after this
  // execution's spawn would be silently bound here.
  it('rejects an out-of-window concurrent session in favor of the in-window one', async () => {
    const { db, svc } = await setup()
    // Dashboard execution: started "now" — its started_at sets the
    // window for the SQL match.
    seedDashboardRow(db, 'uid-window')
    insertSession(db, {
      id: 'in-window-session',
      branch: 'feat/in-window',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/in-window-session'),
    })
    // Force the in-window session's started_at to match the dashboard
    // execution's spawn time so the OR clause picks it up.
    db.run(
      `UPDATE sessions SET started_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-window'),
                           updated_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-window')
       WHERE id = 'in-window-session'`,
    )
    // Out-of-window session — created an hour later than the spawn.
    db.run(
      `INSERT INTO sessions (id, branch, status, workflow_type, current_phase, phase_number, current_round, current_map_run, started_at, updated_at, session_dir)
       VALUES ('out-of-window', 'feat/out', 'active', 'review', 'phase-0', 0, 0, 0,
               datetime((SELECT started_at FROM command_executions WHERE uid = 'uid-window'), '+1 hour'),
               datetime((SELECT started_at FROM command_executions WHERE uid = 'uid-window'), '+1 hour'), ?)`,
      [resolve(ocrDir, 'sessions/out-of-window')],
    )

    expect(svc.linkExecutionToActiveSession('uid-window')).toBe(true)

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['uid-window'],
    )
    // The 30-minute upper bound rejects the out-of-window session;
    // only the in-window session is bindable.
    expect(result[0]?.values[0]?.[0]).toBe('in-window-session')
  })

  it('rejects a closed session even if its updated_at is in window', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-status')
    insertSession(db, {
      id: 'closed-session',
      branch: 'feat/closed',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/closed-session'),
    })
    // Force the session into closed state but with fresh updated_at —
    // the previous unbounded query would have matched this; the
    // round-1 SF3 fix's `status='active'` filter rejects it.
    db.run(
      `UPDATE sessions
         SET status = 'closed',
             started_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-status'),
             updated_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-status')
       WHERE id = 'closed-session'`,
    )

    expect(svc.linkExecutionToActiveSession('uid-status')).toBe(false)
  })

  // Round-3 Suggestion 1: pin the precedence rule when two ACTIVE
  // sessions are both in window. The previous tests prove the
  // upper-bound (out-of-window) and the status-filter (closed)
  // rejections, but neither exercises ORDER BY's tiebreak. This
  // documents the rule (newest `updated_at` wins) for future
  // maintainers.
  it('picks the freshest session when two are both in window and active', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-tiebreak')
    insertSession(db, {
      id: 'older-session',
      branch: 'feat/older',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/older-session'),
    })
    insertSession(db, {
      id: 'fresher-session',
      branch: 'feat/fresher',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/fresher-session'),
    })
    // Both sessions: started_at and updated_at at-or-after the
    // execution's spawn (in window), status=active. Differ only by
    // updated_at — fresher-session was touched later (e.g. by a
    // phase transition).
    db.run(
      `UPDATE sessions SET
         started_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-tiebreak'),
         updated_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-tiebreak')
       WHERE id = 'older-session'`,
    )
    db.run(
      `UPDATE sessions SET
         started_at = (SELECT started_at FROM command_executions WHERE uid = 'uid-tiebreak'),
         updated_at = datetime((SELECT started_at FROM command_executions WHERE uid = 'uid-tiebreak'), '+1 minute')
       WHERE id = 'fresher-session'`,
    )

    expect(svc.linkExecutionToActiveSession('uid-tiebreak')).toBe(true)

    const result = db.exec(
      'SELECT workflow_id FROM command_executions WHERE uid = ?',
      ['uid-tiebreak'],
    )
    expect(result[0]?.values[0]?.[0]).toBe('fresher-session')
  })
})

describe('SessionCaptureService — resolveResumeContext', () => {
  it('returns workflow-not-found for an unknown workflow id', async () => {
    const { svc } = await setup()
    const outcome = svc.resolveResumeContext('does-not-exist')
    expect(outcome.kind).toBe('unresumable')
    if (outcome.kind === 'unresumable') {
      expect(outcome.reason).toBe('workflow-not-found')
    }
  })

  it('returns no-session-id-captured when the workflow exists but no row has vendor_session_id', async () => {
    const { db, svc } = await setup()
    seedDashboardRow(db, 'uid-no-vendor')
    insertSession(db, {
      id: 'wf-no-vendor',
      branch: 'feat/no-vendor',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-no-vendor'),
    })
    db.run(
      `UPDATE command_executions SET workflow_id = 'wf-no-vendor' WHERE uid = 'uid-no-vendor'`,
    )

    const outcome = svc.resolveResumeContext('wf-no-vendor')
    expect(outcome.kind).toBe('unresumable')
    if (outcome.kind === 'unresumable') {
      // host-binary-missing wins over no-session-id-captured ONLY when
      // we have a row to probe. With no captured session id, we report
      // no-session-id-captured first.
      expect(outcome.reason).toBe('no-session-id-captured')
    }
  })

  // ── B3: real diagnostics counts (not hardcoded zeros) ──

  it('reports real invocationsForWorkflow + sessionIdEventsObserved counts in diagnostics', async () => {
    const { db, svc } = await setup()
    insertSession(db, {
      id: 'wf-counts',
      branch: 'feat/counts',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-counts'),
    })
    // Seed 3 command_executions rows linked to this workflow.
    seedDashboardRow(db, 'uid-counts-1')
    seedDashboardRow(db, 'uid-counts-2')
    seedDashboardRow(db, 'uid-counts-3')
    db.run(
      `UPDATE command_executions SET workflow_id = 'wf-counts' WHERE uid LIKE 'uid-counts-%'`,
    )

    const outcome = svc.resolveResumeContext('wf-counts')
    expect(outcome.kind).toBe('unresumable')
    if (outcome.kind === 'unresumable') {
      // The hardcoded `0` placeholder previously made the panel lie.
      // We now count rows; with 3 invocations and zero session_id
      // events on disk, the diagnostics tell the truth.
      expect(outcome.diagnostics.invocationsForWorkflow).toBe(3)
      expect(outcome.diagnostics.sessionIdEventsObserved).toBe(0)
    }
  })

  // ── B2: vendor command construction comes from the adapter ──

  it('returns resumable using the vendor adapter buildResumeCommand (no service-level vendor switch)', async () => {
    // Stub a fake vendor whose name is not in the previous hardcoded
    // VENDOR_BINARIES map — this proves the service reads the command
    // from the adapter, not from any internal vendor table.
    const { db, svc } = await setup({
      'fake-vendor': stubAdapter(
        // Use 'echo' as the binary so probeBinary --version actually
        // exits 0 on a sane PATH (we just need ANY working binary).
        'echo',
        (sid) => `fake-vendor resume --id=${sid}`,
      ),
    })

    insertSession(db, {
      id: 'wf-adapter',
      branch: 'feat/adapter',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-adapter'),
    })
    seedDashboardRow(db, 'uid-adapter')
    db.run(
      `UPDATE command_executions
         SET workflow_id = 'wf-adapter',
             vendor = 'fake-vendor',
             vendor_session_id = 'sid-from-adapter'
       WHERE uid = 'uid-adapter'`,
    )

    const outcome = svc.resolveResumeContext('wf-adapter')
    expect(outcome.kind).toBe('resumable')
    if (outcome.kind === 'resumable') {
      expect(outcome.vendor).toBe('fake-vendor')
      expect(outcome.vendorCommand).toBe('fake-vendor resume --id=sid-from-adapter')
    }
  })

  it('returns host-binary-missing when no adapter is registered for the captured vendor', async () => {
    const { db, svc } = await setup({
      claude: stubAdapter('claude', (sid) => `claude --resume ${sid}`),
    })

    insertSession(db, {
      id: 'wf-unknown-vendor',
      branch: 'feat/unknown',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-unknown-vendor'),
    })
    seedDashboardRow(db, 'uid-unknown')
    db.run(
      `UPDATE command_executions
         SET workflow_id = 'wf-unknown-vendor',
             vendor = 'gemini-cli',
             vendor_session_id = 'sid-gemini'
       WHERE uid = 'uid-unknown'`,
    )

    const outcome = svc.resolveResumeContext('wf-unknown-vendor')
    expect(outcome.kind).toBe('unresumable')
    if (outcome.kind === 'unresumable') {
      expect(outcome.reason).toBe('host-binary-missing')
      expect(outcome.diagnostics.vendor).toBe('gemini-cli')
    }
  })
})
