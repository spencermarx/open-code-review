/**
 * FilesystemSync service — parses markdown artifacts from `.ocr/sessions/`
 * into granular SQLite tables. Works both standalone (for `ocr state sync`)
 * and as part of the dashboard server with Socket.IO event emission.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename, relative } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { Database } from 'sql.js'
import type { Server as SocketIOServer } from 'socket.io'
import { parseMapMd } from './parsers/map-parser.js'
import { parseReviewerOutput } from './parsers/reviewer-parser.js'
import { parseFinalMd } from './parsers/final-parser.js'

// ── Types ──

type ArtifactType =
  | 'reviewer-output'
  | 'final'
  | 'final-human'
  | 'discourse'
  | 'map'
  | 'flow-analysis'
  | 'topology'
  | 'requirements-mapping'
  | 'context'
  | 'discovered-standards'

type ArtifactEvent = {
  sessionId: string
  artifactType: ArtifactType
  roundNumber?: number
  filePath: string
}

// ── Helpers ──

function sqlNow(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

function queryFirst(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): Record<string, string | number | null> | undefined {
  const result = db.exec(sql, params)
  if (result.length === 0 || !result[0] || result[0].values.length === 0) {
    return undefined
  }
  const columns = result[0].columns
  const values = result[0].values[0]
  if (!values) return undefined
  const obj: Record<string, string | number | null> = {}
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i] as string] = values[i] as string | number | null
  }
  return obj
}

function queryScalar(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): string | number | null {
  const result = db.exec(sql, params)
  if (result.length === 0 || !result[0] || result[0].values.length === 0) {
    return null
  }
  return (result[0].values[0]?.[0] as string | number | null) ?? null
}

// ── Main Service ──

export class FilesystemSync {
  private watcher: FSWatcher | null = null
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private onSync?: () => void

  constructor(
    private db: Database,
    private sessionsDir: string,
    private io?: SocketIOServer,
    onSync?: () => void,
  ) {
    this.onSync = onSync
  }

  // ── 6.1: Full Scan ──

  fullScan(): void {
    if (!existsSync(this.sessionsDir)) return

    const entries = readdirSync(this.sessionsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionId = entry.name
      const sessionDir = join(this.sessionsDir, sessionId)
      this.syncSession(sessionId, sessionDir)
    }
  }

  private syncSession(sessionId: string, sessionDir: string): void {
    // Ensure session row exists using filesystem metadata
    this.ensureSessionRow(sessionId, sessionDir)

    // Scan rounds for reviewer outputs and final.md
    const roundsDir = join(sessionDir, 'rounds')
    if (existsSync(roundsDir)) {
      const rounds = readdirSync(roundsDir, { withFileTypes: true })
      for (const roundEntry of rounds) {
        if (!roundEntry.isDirectory()) continue
        const roundMatch = roundEntry.name.match(/^round-(\d+)$/)
        if (!roundMatch) continue
        const roundNumber = parseInt(roundMatch[1] ?? '0', 10)
        const roundDir = join(roundsDir, roundEntry.name)

        // Reviewer outputs
        const reviewsDir = join(roundDir, 'reviews')
        if (existsSync(reviewsDir)) {
          const reviewFiles = readdirSync(reviewsDir).filter((f) => f.endsWith('.md'))
          for (const reviewFile of reviewFiles) {
            const filePath = join(reviewsDir, reviewFile)
            this.processReviewerOutput(sessionId, roundNumber, filePath, reviewFile)
          }
        }

        // Final.md
        const finalPath = join(roundDir, 'final.md')
        if (existsSync(finalPath)) {
          this.processFinalMd(sessionId, roundNumber, finalPath)
        }

        // final-human.md (human-voice rewrite)
        const finalHumanPath = join(roundDir, 'final-human.md')
        if (existsSync(finalHumanPath)) {
          this.processGenericArtifact(sessionId, 'final-human', finalHumanPath, roundNumber)
        }

        // Discourse.md
        const discoursePath = join(roundDir, 'discourse.md')
        if (existsSync(discoursePath)) {
          this.processGenericArtifact(sessionId, 'discourse', discoursePath, roundNumber)
        }
      }
    }

    // Scan map runs
    const mapDir = join(sessionDir, 'map', 'runs')
    if (existsSync(mapDir)) {
      const runs = readdirSync(mapDir, { withFileTypes: true })
      for (const runEntry of runs) {
        if (!runEntry.isDirectory()) continue
        const runMatch = runEntry.name.match(/^run-(\d+)$/)
        if (!runMatch) continue
        const runNumber = parseInt(runMatch[1] ?? '0', 10)
        const runDir = join(mapDir, runEntry.name)

        // map.md
        const mapPath = join(runDir, 'map.md')
        if (existsSync(mapPath)) {
          this.processMapMd(sessionId, runNumber, mapPath)
        }

        // Other map artifacts
        const mapArtifacts: [string, ArtifactType][] = [
          ['flow-analysis.md', 'flow-analysis'],
          ['topology.md', 'topology'],
          ['requirements-mapping.md', 'requirements-mapping'],
        ]
        for (const [fileName, artifactType] of mapArtifacts) {
          const filePath = join(runDir, fileName)
          if (existsSync(filePath)) {
            this.processGenericArtifact(sessionId, artifactType, filePath, undefined, runNumber)
          }
        }
      }
    }

    // Session-level artifacts
    const sessionArtifacts: [string, ArtifactType][] = [
      ['context.md', 'context'],
      ['discovered-standards.md', 'discovered-standards'],
    ]
    for (const [fileName, artifactType] of sessionArtifacts) {
      const filePath = join(sessionDir, fileName)
      if (existsSync(filePath)) {
        this.processGenericArtifact(sessionId, artifactType, filePath)
      }
    }
  }

  // ── Session Backfill ──

  private ensureSessionRow(sessionId: string, sessionDir: string): void {
    // Extract branch from session ID pattern: YYYY-MM-DD-branch-name
    const branchMatch = sessionId.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)
    const branch = branchMatch?.[1] ?? 'unknown'

    // Derive metadata from filesystem artifacts
    const hasRoundsDir = existsSync(join(sessionDir, 'rounds'))
    const hasMapDir = existsSync(join(sessionDir, 'map'))
    const workflowType = hasMapDir && !hasRoundsDir ? 'map' : 'review'

    // Count rounds/runs from filesystem
    let currentRound = 1
    if (hasRoundsDir) {
      const roundDirs = readdirSync(join(sessionDir, 'rounds'))
        .filter((d) => d.match(/^round-\d+$/))
      currentRound = Math.max(1, roundDirs.length)
    }

    let currentMapRun = 1
    const mapRunsDir = join(sessionDir, 'map', 'runs')
    if (existsSync(mapRunsDir)) {
      const runDirs = readdirSync(mapRunsDir)
        .filter((d) => d.match(/^run-\d+$/))
      currentMapRun = Math.max(1, runDirs.length)
    }

    // Derive phase/status from filesystem artifacts
    let phase = 'context'
    let phaseNumber = 1
    let status: 'active' | 'closed' = 'active'

    if (workflowType === 'review' && hasRoundsDir) {
      const roundDir = join(sessionDir, 'rounds', `round-${currentRound}`)
      if (existsSync(join(roundDir, 'final.md'))) {
        phase = 'complete'
        phaseNumber = 8
        status = 'closed'
      } else if (existsSync(join(roundDir, 'discourse.md'))) {
        phase = 'synthesis'
        phaseNumber = 7
      } else if (existsSync(join(roundDir, 'reviews')) &&
        readdirSync(join(roundDir, 'reviews')).filter((f) => f.endsWith('.md')).length > 0) {
        phase = 'reviews'
        phaseNumber = 4
      } else if (existsSync(join(sessionDir, 'context.md'))) {
        phase = 'analysis'
        phaseNumber = 3
      } else if (existsSync(join(sessionDir, 'discovered-standards.md'))) {
        phase = 'change-context'
        phaseNumber = 2
      }
    } else if (workflowType === 'map' && hasMapDir) {
      const runDir = join(mapRunsDir, `run-${currentMapRun}`)
      if (existsSync(join(runDir, 'map.md'))) {
        phase = 'complete'
        phaseNumber = 6
        status = 'closed'
      } else if (existsSync(join(runDir, 'requirements-mapping.md'))) {
        phase = 'synthesis'
        phaseNumber = 5
      } else if (existsSync(join(runDir, 'flow-analysis.md'))) {
        phase = 'requirements-mapping'
        phaseNumber = 4
      } else if (existsSync(join(runDir, 'topology.md'))) {
        phase = 'flow-analysis'
        phaseNumber = 3
      } else if (existsSync(join(sessionDir, 'discovered-standards.md'))) {
        phase = 'topology'
        phaseNumber = 2
      }
    }

    const existing = queryFirst(this.db, 'SELECT id FROM sessions WHERE id = ?', [sessionId])

    if (existing) {
      // The CLI's DB is authoritative for phase/status — DbSyncWatcher handles
      // syncing those fields. FilesystemSync only updates round/run counts
      // (derived from directory structure) to keep those in sync.
      this.db.run(
        `UPDATE sessions SET current_round = ?, current_map_run = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [currentRound, currentMapRun, sessionId],
      )
    } else {
      this.db.run(
        `INSERT INTO sessions (id, branch, workflow_type, current_phase, phase_number, current_round, current_map_run, session_dir, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, branch, workflowType, phase, phaseNumber, currentRound, currentMapRun, sessionDir, status],
      )
      this.io?.emit('session:created', { id: sessionId, branch, workflow_type: workflowType, status, current_phase: phase })
    }

    this.onSync?.()
  }

  // ── Mtime Skip Check ──

  private shouldSkip(filePath: string, existingParsedAt: string | number | null): boolean {
    if (!existingParsedAt) return false
    try {
      const mtime = statSync(filePath).mtime
      const parsedAt = new Date(existingParsedAt as string)
      return mtime <= parsedAt
    } catch {
      return false
    }
  }

  // ── 6.5: Markdown Artifact Storage ──

  private upsertMarkdownArtifact(
    sessionId: string,
    artifactType: ArtifactType,
    filePath: string,
    content: string,
    roundNumber?: number,
  ): 'created' | 'updated' {
    const relPath = relative(this.sessionsDir, filePath)

    const existing = queryScalar(
      this.db,
      'SELECT id FROM markdown_artifacts WHERE session_id = ? AND artifact_type = ? AND round_number IS ? AND file_path = ?',
      [sessionId, artifactType, roundNumber ?? null, relPath],
    )

    const isUpdate = existing !== null

    this.db.run(
      `INSERT OR REPLACE INTO markdown_artifacts (session_id, artifact_type, round_number, file_path, content, parsed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [sessionId, artifactType, roundNumber ?? null, relPath, content],
    )

    return isUpdate ? 'updated' : 'created'
  }

  // ── 6.7: Socket.IO Emission ──

  private emitArtifactEvent(
    action: 'created' | 'updated',
    event: ArtifactEvent,
  ): void {
    if (!this.io) return
    this.io.to(`session:${event.sessionId}`).emit(`artifact:${action}`, event)
  }

  // ── 6.2: Map Parser Integration ──

  private processMapMd(
    sessionId: string,
    runNumber: number,
    filePath: string,
  ): void {
    // Check mtime — skip if file hasn't changed since last parse
    const existingRun = queryFirst(
      this.db,
      'SELECT id, parsed_at FROM map_runs WHERE session_id = ? AND run_number = ?',
      [sessionId, runNumber],
    )
    if (existingRun && this.shouldSkip(filePath, existingRun['parsed_at'] ?? null)) return

    const content = readFileSync(filePath, 'utf-8')
    const parsed = parseMapMd(content)

    // Upsert map_run
    this.db.run(
      `INSERT OR REPLACE INTO map_runs (session_id, run_number, file_count, map_md_path, parsed_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, runNumber, parsed.sections.reduce((sum, s) => sum + s.files.length, 0), filePath, sqlNow()],
    )

    // Get map_run ID
    const runRow = queryFirst(
      this.db,
      'SELECT id FROM map_runs WHERE session_id = ? AND run_number = ?',
      [sessionId, runNumber],
    )
    const mapRunId = runRow?.['id'] as number | undefined
    if (!mapRunId) return

    // Stash user progress before delete (cascade will destroy it)
    const stashedFileProgress = new Map<string, { isReviewed: number; reviewedAt: string | null }>()
    const progressResult = this.db.exec(
      `SELECT mf.file_path, ufp.is_reviewed, ufp.reviewed_at
       FROM user_file_progress ufp
       JOIN map_files mf ON mf.id = ufp.map_file_id
       JOIN map_sections ms ON ms.id = mf.section_id
       WHERE ms.map_run_id = ?`,
      [mapRunId],
    )
    if (progressResult[0]) {
      for (const row of progressResult[0].values) {
        const fp = row[0] as string
        stashedFileProgress.set(fp, {
          isReviewed: row[1] as number,
          reviewedAt: row[2] as string | null,
        })
      }
    }

    // Clean old sections/files for this run (parser may have changed)
    const oldSections = this.db.exec(
      'SELECT id FROM map_sections WHERE map_run_id = ?',
      [mapRunId],
    )
    if (oldSections[0]) {
      for (const row of oldSections[0].values) {
        this.db.run('DELETE FROM map_files WHERE section_id = ?', [row[0] as number])
      }
    }
    this.db.run('DELETE FROM map_sections WHERE map_run_id = ?', [mapRunId])

    // Insert sections and files
    for (const section of parsed.sections) {
      this.db.run(
        `INSERT OR REPLACE INTO map_sections (map_run_id, section_number, title, description, file_count, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [mapRunId, section.sectionNumber, section.title, section.description, section.files.length, section.sectionNumber],
      )

      const sectionRow = queryFirst(
        this.db,
        'SELECT id FROM map_sections WHERE map_run_id = ? AND section_number = ?',
        [mapRunId, section.sectionNumber],
      )
      const sectionId = sectionRow?.['id'] as number | undefined
      if (!sectionId) continue

      for (let fi = 0; fi < section.files.length; fi++) {
        const file = section.files[fi]
        if (!file) continue
        this.db.run(
          `INSERT OR REPLACE INTO map_files (section_id, file_path, role, lines_added, lines_deleted, display_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sectionId, file.filePath, file.role, file.linesAdded, file.linesDeleted, fi],
        )

        // Restore stashed user progress for this file
        const stashed = stashedFileProgress.get(file.filePath)
        if (stashed) {
          const newFileRow = queryFirst(
            this.db,
            'SELECT id FROM map_files WHERE section_id = ? AND file_path = ?',
            [sectionId, file.filePath],
          )
          if (newFileRow) {
            this.db.run(
              `INSERT OR REPLACE INTO user_file_progress (map_file_id, is_reviewed, reviewed_at)
               VALUES (?, ?, ?)`,
              [newFileRow['id'] as number, stashed.isReviewed, stashed.reviewedAt],
            )
          }
        }
      }
    }

    // Safety net: if map.md exists but the session is stuck at an earlier phase,
    // advance to "complete". Handles cases where the AI agent wrote map.md
    // but crashed or was cancelled before calling `ocr state transition`.
    const session = queryFirst(
      this.db,
      'SELECT current_phase, workflow_type FROM sessions WHERE id = ?',
      [sessionId],
    )
    if (session && session['workflow_type'] === 'map' && session['current_phase'] !== 'complete') {
      this.db.run(
        `UPDATE sessions SET current_phase = 'complete', phase_number = 6, status = 'closed', updated_at = datetime('now')
         WHERE id = ?`,
        [sessionId],
      )
      this.io?.emit('session:updated', {
        id: sessionId,
        status: 'closed',
        current_phase: 'complete',
        phase_number: 6,
      })
    }

    // Store raw markdown
    const action = this.upsertMarkdownArtifact(sessionId, 'map', filePath, content, undefined)
    this.emitArtifactEvent(action, {
      sessionId,
      artifactType: 'map',
      filePath,
    })
  }

  // ── 6.3: Reviewer Output Integration ──

  private processReviewerOutput(
    sessionId: string,
    roundNumber: number,
    filePath: string,
    fileName: string,
  ): void {
    // Ensure review_round exists
    this.db.run(
      `INSERT OR IGNORE INTO review_rounds (session_id, round_number)
       VALUES (?, ?)`,
      [sessionId, roundNumber],
    )

    const roundRow = queryFirst(
      this.db,
      'SELECT id FROM review_rounds WHERE session_id = ? AND round_number = ?',
      [sessionId, roundNumber],
    )
    const roundId = roundRow?.['id'] as number | undefined
    if (!roundId) return

    // Parse reviewer type and instance from filename (e.g., "principal-1.md")
    const nameMatch = fileName.replace(/\.md$/, '').match(/^(.+?)-(\d+)$/)
    const reviewerType = nameMatch?.[1] ?? fileName.replace(/\.md$/, '')
    const instanceNumber = nameMatch?.[2] ? parseInt(nameMatch[2], 10) : 1

    // Check mtime — skip if file hasn't changed since last parse
    const existingOutput = queryFirst(
      this.db,
      'SELECT id, parsed_at FROM reviewer_outputs WHERE round_id = ? AND reviewer_type = ? AND instance_number = ?',
      [roundId, reviewerType, instanceNumber],
    )
    if (existingOutput && this.shouldSkip(filePath, existingOutput['parsed_at'] ?? null)) return

    const content = readFileSync(filePath, 'utf-8')
    const parsed = parseReviewerOutput(content)

    // Upsert reviewer_output
    this.db.run(
      `INSERT OR REPLACE INTO reviewer_outputs (round_id, reviewer_type, instance_number, file_path, finding_count, parsed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [roundId, reviewerType, instanceNumber, filePath, parsed.findings.length, sqlNow()],
    )

    const outputRow = queryFirst(
      this.db,
      'SELECT id FROM reviewer_outputs WHERE round_id = ? AND reviewer_type = ? AND instance_number = ?',
      [roundId, reviewerType, instanceNumber],
    )
    const outputId = outputRow?.['id'] as number | undefined
    if (!outputId) return

    // Stash user progress before delete (cascade will destroy it)
    const stashedFindingProgress = new Map<string, { status: string; updatedAt: string | null }>()
    const findingProgressResult = this.db.exec(
      `SELECT rf.title, rf.severity, rf.file_path, ufp.status, ufp.updated_at
       FROM user_finding_progress ufp
       JOIN review_findings rf ON rf.id = ufp.finding_id
       WHERE rf.reviewer_output_id = ?`,
      [outputId],
    )
    if (findingProgressResult[0]) {
      for (const row of findingProgressResult[0].values) {
        const key = `${row[0] as string}|${row[1] as string}|${row[2] as string}`
        stashedFindingProgress.set(key, {
          status: row[3] as string,
          updatedAt: row[4] as string | null,
        })
      }
    }

    // Delete existing findings for this output (they get replaced on re-parse)
    this.db.run('DELETE FROM review_findings WHERE reviewer_output_id = ?', [outputId])

    // Insert findings
    for (const finding of parsed.findings) {
      this.db.run(
        `INSERT INTO review_findings (reviewer_output_id, title, severity, file_path, line_start, line_end, summary, is_blocker, parsed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          outputId,
          finding.title,
          finding.severity,
          finding.filePath,
          finding.lineStart,
          finding.lineEnd,
          finding.summary,
          finding.isBlocker ? 1 : 0,
          sqlNow(),
        ],
      )

      // Restore stashed user progress for this finding
      const key = `${finding.title}|${finding.severity}|${finding.filePath ?? ''}`
      const stashed = stashedFindingProgress.get(key)
      if (stashed) {
        const newFindingRow = queryFirst(
          this.db,
          'SELECT id FROM review_findings WHERE reviewer_output_id = ? AND title = ? AND severity = ? AND file_path IS ?',
          [outputId, finding.title, finding.severity, finding.filePath ?? null],
        )
        if (newFindingRow) {
          this.db.run(
            `INSERT OR REPLACE INTO user_finding_progress (finding_id, status, updated_at)
             VALUES (?, ?, ?)`,
            [newFindingRow['id'] as number, stashed.status, stashed.updatedAt],
          )
        }
      }
    }

    // Store raw markdown
    const action = this.upsertMarkdownArtifact(sessionId, 'reviewer-output', filePath, content, roundNumber)
    this.emitArtifactEvent(action, {
      sessionId,
      artifactType: 'reviewer-output',
      roundNumber,
      filePath,
    })
  }

  // ── 6.4: Final.md Integration ──

  private processFinalMd(
    sessionId: string,
    roundNumber: number,
    filePath: string,
  ): void {
    // Ensure review_round exists
    this.db.run(
      `INSERT OR IGNORE INTO review_rounds (session_id, round_number)
       VALUES (?, ?)`,
      [sessionId, roundNumber],
    )

    // Check mtime
    const existingRound = queryFirst(
      this.db,
      'SELECT parsed_at FROM review_rounds WHERE session_id = ? AND round_number = ?',
      [sessionId, roundNumber],
    )
    if (existingRound && this.shouldSkip(filePath, existingRound['parsed_at'] ?? null)) return

    const content = readFileSync(filePath, 'utf-8')
    const parsed = parseFinalMd(content)

    // Update the round row with parsed final data
    this.db.run(
      `UPDATE review_rounds SET verdict = ?, blocker_count = ?, suggestion_count = ?, should_fix_count = ?, final_md_path = ?, parsed_at = ?
       WHERE session_id = ? AND round_number = ?`,
      [
        parsed.verdict,
        parsed.blockerCount,
        parsed.suggestionCount,
        parsed.shouldFixCount,
        filePath,
        sqlNow(),
        sessionId,
        roundNumber,
      ],
    )

    // Recount blockers from actual findings (the LLM text in final.md may be inaccurate)
    const actualBlockers = queryScalar(
      this.db,
      `SELECT COUNT(*) FROM review_findings rf
       JOIN reviewer_outputs ro ON rf.reviewer_output_id = ro.id
       WHERE ro.round_id = (SELECT id FROM review_rounds WHERE session_id = ? AND round_number = ?)
         AND rf.is_blocker = 1`,
      [sessionId, roundNumber],
    ) as number | null
    if (actualBlockers !== null && actualBlockers !== parsed.blockerCount) {
      this.db.run(
        'UPDATE review_rounds SET blocker_count = ? WHERE session_id = ? AND round_number = ?',
        [actualBlockers, sessionId, roundNumber],
      )
    }

    // Safety net: if final.md exists but the session is stuck at an earlier phase,
    // advance to "complete". This handles cases where the AI agent wrote final.md
    // but crashed or was cancelled before calling `ocr state transition`.
    const session = queryFirst(
      this.db,
      'SELECT current_phase, phase_number, status FROM sessions WHERE id = ?',
      [sessionId],
    )
    if (session && session['current_phase'] !== 'complete') {
      this.db.run(
        `UPDATE sessions SET current_phase = 'complete', phase_number = 8, status = 'closed', updated_at = datetime('now')
         WHERE id = ?`,
        [sessionId],
      )
      this.io?.emit('session:updated', {
        id: sessionId,
        status: 'closed',
        current_phase: 'complete',
        phase_number: 8,
      })
    }

    // Store raw markdown
    const action = this.upsertMarkdownArtifact(sessionId, 'final', filePath, content, roundNumber)
    this.emitArtifactEvent(action, {
      sessionId,
      artifactType: 'final',
      roundNumber,
      filePath,
    })
  }

  // ── Generic artifact (discourse, topology, etc.) ──

  private processGenericArtifact(
    sessionId: string,
    artifactType: ArtifactType,
    filePath: string,
    roundNumber?: number,
    _runNumber?: number,
  ): void {
    // Check mtime via markdown_artifacts table
    const relPath = relative(this.sessionsDir, filePath)
    const existing = queryFirst(
      this.db,
      'SELECT parsed_at FROM markdown_artifacts WHERE session_id = ? AND artifact_type = ? AND file_path = ?',
      [sessionId, artifactType, relPath],
    )
    if (existing && this.shouldSkip(filePath, existing['parsed_at'] ?? null)) return

    const content = readFileSync(filePath, 'utf-8')

    const action = this.upsertMarkdownArtifact(sessionId, artifactType, filePath, content, roundNumber)
    this.emitArtifactEvent(action, {
      sessionId,
      artifactType,
      roundNumber,
      filePath,
    })
  }

  // ── 6.6: Chokidar Watcher ──

  startWatching(): void {
    if (this.watcher) return

    this.watcher = watch(this.sessionsDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 10,
      ignored: [
        // Only ignore entries whose own name starts with a dot — the old regex
        // /(^|[/\\])\../ matched `.ocr` in the parent path, silencing ALL events.
        (filePath: string) => basename(filePath).startsWith('.'),
        /node_modules/,
        /\.db$/,
      ],
    })

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath))
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath))
  }

  stopWatching(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private handleFileChange(filePath: string): void {
    if (!filePath.endsWith('.md')) return

    // Debounce: wait 100ms after last change
    const existing = this.debounceTimers.get(filePath)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath)
        try {
          this.processChangedFile(filePath)
          this.onSync?.()
        } catch (err) {
          console.error(`[FilesystemSync] Error processing ${filePath}:`, err)
        }
      }, 100),
    )
  }

  private processChangedFile(filePath: string): void {
    // Determine session from path
    const relFromSessions = relative(this.sessionsDir, filePath)
    const parts = relFromSessions.split('/')
    const sessionId = parts[0]
    if (!sessionId) return

    const sessionDir = join(this.sessionsDir, sessionId)

    // Ensure session row exists before processing artifacts
    // (handles sessions created after server startup)
    this.ensureSessionRow(sessionId, sessionDir)

    // Determine artifact type from path structure
    const fileName = basename(filePath)

    // rounds/round-N/reviews/*.md -> reviewer output
    const reviewerMatch = relFromSessions.match(/rounds\/round-(\d+)\/reviews\/(.+\.md)$/)
    if (reviewerMatch) {
      const roundNumber = parseInt(reviewerMatch[1] ?? '0', 10)
      this.processReviewerOutput(sessionId, roundNumber, filePath, reviewerMatch[2] ?? '')
      return
    }

    // rounds/round-N/final.md
    const finalMatch = relFromSessions.match(/rounds\/round-(\d+)\/final\.md$/)
    if (finalMatch) {
      const roundNumber = parseInt(finalMatch[1] ?? '0', 10)
      this.processFinalMd(sessionId, roundNumber, filePath)
      return
    }

    // rounds/round-N/final-human.md
    const finalHumanMatch = relFromSessions.match(/rounds\/round-(\d+)\/final-human\.md$/)
    if (finalHumanMatch) {
      const roundNumber = parseInt(finalHumanMatch[1] ?? '0', 10)
      this.processGenericArtifact(sessionId, 'final-human', filePath, roundNumber)
      return
    }

    // rounds/round-N/discourse.md
    const discourseMatch = relFromSessions.match(/rounds\/round-(\d+)\/discourse\.md$/)
    if (discourseMatch) {
      const roundNumber = parseInt(discourseMatch[1] ?? '0', 10)
      this.processGenericArtifact(sessionId, 'discourse', filePath, roundNumber)
      return
    }

    // map/runs/run-N/map.md
    const mapMatch = relFromSessions.match(/map\/runs\/run-(\d+)\/map\.md$/)
    if (mapMatch) {
      const runNumber = parseInt(mapMatch[1] ?? '0', 10)
      this.processMapMd(sessionId, runNumber, filePath)
      return
    }

    // map/runs/run-N/<artifact>.md
    const mapArtifactMatch = relFromSessions.match(/map\/runs\/run-(\d+)\/(.+)\.md$/)
    if (mapArtifactMatch) {
      const runNumber = parseInt(mapArtifactMatch[1] ?? '0', 10)
      const artifactName = mapArtifactMatch[2] ?? ''
      const typeMap: Record<string, ArtifactType> = {
        'flow-analysis': 'flow-analysis',
        'topology': 'topology',
        'requirements-mapping': 'requirements-mapping',
      }
      const artifactType = typeMap[artifactName]
      if (artifactType) {
        this.processGenericArtifact(sessionId, artifactType, filePath, undefined, runNumber)
      }
      return
    }

    // Session-level artifacts
    if (fileName === 'context.md') {
      this.processGenericArtifact(sessionId, 'context', filePath)
      return
    }
    if (fileName === 'discovered-standards.md') {
      this.processGenericArtifact(sessionId, 'discovered-standards', filePath)
      return
    }
  }
}
