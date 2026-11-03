/**
 * Id-preserving ingestion of a reviewer output's findings.
 *
 * `user_finding_progress` hangs off `review_findings.id` with ON DELETE CASCADE,
 * so re-ingesting a reviewer output (server restart, rescan, file touched) must
 * UPDATE rows in place and delete only what disappeared from the source —
 * never delete-and-reinsert, which hands every finding a new id.
 */

import type { Database } from '@open-code-review/persistence'

export type IncomingFinding = {
  title: string
  severity: string
  filePath: string | null
  lineStart: number | null
  lineEnd: number | null
  summary: string | null
  isBlocker: boolean
}

type ExistingRow = {
  id: number
  title: string
  filePath: string | null
  lineStart: number | null
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** `./src/a.ts` and `src/a.ts` are the same file. */
const normPath = (p: string | null): string => (p ?? '').replace(/^(\.\/)+/, '')

const strongKey = (title: string, file: string | null, line: number | null): string =>
  `${norm(title)}|${normPath(file)}|${line ?? ''}`
const weakKey = (title: string, file: string | null): string => `${norm(title)}|${normPath(file)}`

const lineDistance = (a: number | null, b: number | null): number =>
  a === null && b === null ? 0 : a === null || b === null ? Infinity : Math.abs(a - b)

/** The only element at the minimum distance, or undefined on a tie / no candidates. */
function uniqueClosest<T>(items: T[], distance: (item: T) => number): T | undefined {
  const dist = items.map(distance)
  const best = Math.min(...dist)
  const closest = items.filter((_, k) => dist[k] === best)
  return closest.length === 1 ? closest[0] : undefined
}

/**
 * Pair each incoming finding with an existing row: title+file+line first, then
 * title+file between MUTUAL nearest neighbours only (the row chosen for incoming
 * `i` is the unique closest to `i`, and `i` is the unique closest to that row
 * among the still-unmatched incoming findings). A tie on either side inserts a
 * new row, so a user's triage never moves to another finding by input order.
 */
function matchRows(existing: ExistingRow[], incoming: IncomingFinding[]): Map<number, ExistingRow> {
  const matches = new Map<number, ExistingRow>()
  const used = new Set<number>()
  const claim = (i: number, row: ExistingRow): void => {
    matches.set(i, row)
    used.add(row.id)
  }

  incoming.forEach((f, i) => {
    const key = strongKey(f.title, f.filePath, f.lineStart)
    const row = existing.find((e) => !used.has(e.id) && strongKey(e.title, e.filePath, e.lineStart) === key)
    if (row) claim(i, row)
  })

  // Snapshot both sides after the strong pass; the weak pass only pairs what is left.
  const pending = incoming.map((f, i) => ({ f, i })).filter(({ i }) => !matches.has(i))
  const free = existing.filter((e) => !used.has(e.id))
  for (const { f, i } of pending) {
    const key = weakKey(f.title, f.filePath)
    const row = uniqueClosest(
      free.filter((e) => !used.has(e.id) && weakKey(e.title, e.filePath) === key),
      (e) => lineDistance(e.lineStart, f.lineStart),
    )
    if (!row) continue
    const rival = uniqueClosest(
      pending.filter((p) => !matches.has(p.i) && weakKey(p.f.title, p.f.filePath) === key),
      (p) => lineDistance(row.lineStart, p.f.lineStart),
    )
    if (rival?.i === i) claim(i, row)
  }
  return matches
}

/**
 * Bring the findings of `outputId` in line with `incoming`: update matched rows,
 * insert new ones, delete the ones that left the source. `now` stamps `parsed_at`.
 */
export function reconcileFindings(
  db: Database,
  outputId: number,
  incoming: IncomingFinding[],
  now: string,
): void {
  const res = db.exec(
    'SELECT id, title, file_path, line_start FROM review_findings WHERE reviewer_output_id = ? ORDER BY id',
    [outputId],
  )
  const existing: ExistingRow[] = (res[0]?.values ?? []).map((r) => ({
    id: r[0] as number,
    title: r[1] as string,
    filePath: r[2] as string | null,
    lineStart: r[3] as number | null,
  }))
  const matches = matchRows(existing, incoming)

  incoming.forEach((f, i) => {
    const row = matches.get(i)
    if (row) {
      db.run(
        `UPDATE review_findings
         SET title = ?, severity = ?, file_path = ?, line_start = ?, line_end = ?, summary = ?, is_blocker = ?, parsed_at = ?
         WHERE id = ?`,
        [f.title, f.severity, f.filePath, f.lineStart, f.lineEnd, f.summary, f.isBlocker ? 1 : 0, now, row.id],
      )
    } else {
      db.run(
        `INSERT INTO review_findings (reviewer_output_id, title, severity, file_path, line_start, line_end, summary, is_blocker, parsed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [outputId, f.title, f.severity, f.filePath, f.lineStart, f.lineEnd, f.summary, f.isBlocker ? 1 : 0, now],
      )
    }
  })

  const kept = new Set([...matches.values()].map((r) => r.id))
  for (const e of existing) {
    if (!kept.has(e.id)) db.run('DELETE FROM review_findings WHERE id = ?', [e.id])
  }
}
