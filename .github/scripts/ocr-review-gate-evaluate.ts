// Pure evaluation logic for the OCR review gate (.github/workflows/ocr-review-gate.yml).
//
// Everything here is side-effect free so it can be unit tested without the
// GitHub API; ocr-review-gate.ts does the I/O. Comment bodies are
// attacker-controlled input: markers are validated field by field and only
// validated values (or values GitHub itself guarantees, like SHAs and logins
// from the API) are ever echoed back into the bot comment.
//
// The gate checks only the loop evidence. Whether a change is wanted is
// settled by people in an issue thread, never by this gate.

// `needsReview` is the one label the gate applies, and what the reminders
// workflow acts on.
export const LABELS = {
  needsReview: 'needs-ocr-review',
  exempt: 'ocr-review-exempt',
  stale: 'ocr-review-stale',
} as const

export const STICKY_MARKER = '<!-- ocr-review-gate -->'
export const MIN_DISTINCT_PERSONAS = 2

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'NEEDS_DISCUSSION'
const VERDICTS: ReadonlySet<string> = new Set<Verdict>(['APPROVE', 'REQUEST_CHANGES', 'NEEDS_DISCUSSION'])

const ROUND_RE = /^(\d{1,3}|final)$/
const PERSONA_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const SHA_RE = /^[0-9a-f]{7,40}$/
const MAX_PERSONAS = 32
// Real markers are ~200 chars. The cap bounds the work done on hostile input.
const MAX_MARKER_LINE = 1024

export interface ReviewMarker {
  kind: 'review'
  round: number
  verdict: Verdict
  personas: string[]
  sha: string
}

export interface AddressMarker {
  kind: 'address'
  round: number | 'final'
  sha: string
}

export type LoopMarker = ReviewMarker | AddressMarker

export interface GateComment {
  id: number
  authorLogin: string
  authorAssociation: string
  createdAt: string
  body: string
}

export interface GatePullRequest {
  number: number
  state: string
  draft: boolean
  authorLogin: string
  authorType: string
  headSha: string
  labels: string[]
}

export interface GateInput {
  pr: GatePullRequest
  comments: GateComment[]
}

export type GateReason =
  | { code: 'no-review' }
  | { code: 'not-approved'; round: number; verdict: Verdict }
  | { code: 'too-few-personas'; round: number; personas: string[] }
  | { code: 'head-not-covered'; markerSha: string; headSha: string }

export interface GateEvidence {
  headSha: string
  latestReview: ReviewMarker | null
  /** Trusted comments that contain a loop marker the gate could not use. */
  rejectedMarkers: number
}

export type GateResult =
  | { status: 'skip'; why: 'closed' | 'draft' }
  | { status: 'exempt'; why: 'bot' | 'label' }
  | { status: 'pass'; evidence: GateEvidence }
  | { status: 'fail'; reasons: GateReason[]; evidence: GateEvidence }

// ---------------------------------------------------------------------------
// Marker parsing
// ---------------------------------------------------------------------------

/**
 * Removes fenced code blocks so documentation that *shows* a marker (for
 * example a pasted CONTRIBUTING snippet) is never mistaken for evidence.
 */
export function stripFencedCode(body: string): string[] {
  const kept: string[] = []
  let fence: { char: string; length: number } | null = null
  for (const line of body.split(/\r?\n/)) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const fenceRun = open?.[1]
      if (fenceRun && fenceRun[0] === fence.char && fenceRun.length >= fence.length && line.trim() === fenceRun) {
        fence = null
      }
      continue
    }
    if (open?.[1]) {
      fence = { char: open[1][0] ?? '`', length: open[1].length }
      continue
    }
    kept.push(line)
  }
  return kept
}

/**
 * Parses one line as a loop marker. A marker must be the whole line (at most
 * three spaces of indent, so block-quoted replies like `> <!-- ... -->` never
 * count), have exactly the expected fields, and every value must pass its
 * strict pattern. Anything else returns null and is ignored.
 */
export function parseMarkerLine(line: string): LoopMarker | null {
  if (line.length > MAX_MARKER_LINE || !/^ {0,3}<!--/.test(line)) return null
  const trimmed = line.trim()
  if (!trimmed.endsWith('-->')) return null
  const inner = trimmed.slice('<!--'.length, -'-->'.length).trim()
  const [head, ...tokens] = inner.split(/[ \t]+/)

  let kind: LoopMarker['kind']
  if (head === 'ocr-review-loop:review') kind = 'review'
  else if (head === 'ocr-review-loop:address') kind = 'address'
  else return null

  const allowed = kind === 'review' ? ['round', 'verdict', 'personas', 'sha'] : ['round', 'sha']
  const fields = new Map<string, string>()
  for (const token of tokens) {
    const eq = token.indexOf('=')
    if (eq <= 0) return null
    const key = token.slice(0, eq)
    if (!allowed.includes(key) || fields.has(key)) return null
    fields.set(key, token.slice(eq + 1))
  }
  if (fields.size !== allowed.length) return null

  const round = fields.get('round') ?? ''
  const sha = fields.get('sha') ?? ''
  if (!ROUND_RE.test(round) || !SHA_RE.test(sha)) return null

  if (kind === 'address') {
    return { kind, round: round === 'final' ? 'final' : Number(round), sha }
  }

  // Only address passes can be "final"; a review round is always numbered.
  if (round === 'final') return null
  const verdict = fields.get('verdict') ?? ''
  if (!VERDICTS.has(verdict)) return null
  const personas = parsePersonas(fields.get('personas') ?? '')
  if (!personas) return null
  return { kind, round: Number(round), verdict: verdict as Verdict, personas, sha }
}

function parsePersonas(raw: string): string[] | null {
  const parts = raw.split(',')
  if (parts.length > MAX_PERSONAS) return null
  const distinct = new Set<string>()
  for (const part of parts) {
    if (!PERSONA_RE.test(part)) return null
    // Instance names (`principal-1`, `principal-2`) are what contributors see
    // in review file names; without this, two instances of one persona would
    // count as two personas. No shipped reviewer id ends in `-<digits>`.
    const persona = part.replace(/-\d+$/, '')
    // Ephemeral `--reviewer` reviewers have no persona of their own.
    if (persona !== 'ephemeral') distinct.add(persona)
  }
  return [...distinct]
}

/** A comment contributes at most one marker: its first valid one. */
export function parseCommentMarker(body: string): LoopMarker | null {
  for (const line of stripFencedCode(body)) {
    const marker = parseMarkerLine(line)
    if (marker) return marker
  }
  return null
}

// ---------------------------------------------------------------------------
// Trust and ordering
// ---------------------------------------------------------------------------

export function isTrustedComment(comment: GateComment, prAuthorLogin: string): boolean {
  if (comment.authorLogin.toLowerCase() === prAuthorLogin.toLowerCase()) return true
  return TRUSTED_ASSOCIATIONS.has(comment.authorAssociation)
}

const MARKER_LIKE_RE = /^ {0,3}<!--[ \t]*ocr-review-loop:/

/**
 * Trusted markers, oldest first, plus how many trusted comments since the last
 * accepted marker look like they carry one but have none the gate accepts (a
 * typo, a bad field). Re-posting a corrected marker clears the count. Only the
 * count is ever surfaced, never the rejected text.
 */
export function collectTrustedMarkers(
  comments: GateComment[],
  prAuthorLogin: string,
): { markers: LoopMarker[]; rejected: number } {
  const markers: LoopMarker[] = []
  let rejected = 0
  const trusted = comments
    .filter((c) => isTrustedComment(c, prAuthorLogin))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id)
  for (const comment of trusted) {
    const marker = parseCommentMarker(comment.body)
    if (marker) {
      markers.push(marker)
      rejected = 0
    } else if (stripFencedCode(comment.body).some((line) => MARKER_LIKE_RE.test(line))) rejected++
  }
  return { markers, rejected }
}

/**
 * The gate-managed label changes for a result. While the loop is open,
 * `ocr-review-stale` belongs to the reminders workflow, so the gate clears it
 * only once nothing is owed (pass or exempt).
 */
export function labelPlan(result: GateResult): { add: string[]; remove: string[] } {
  if (result.status === 'fail') return { add: [LABELS.needsReview], remove: [] }
  if (result.status === 'skip') return { add: [], remove: [] }
  return { add: [], remove: [LABELS.needsReview, LABELS.stale] }
}

export function isBotAuthor(pr: Pick<GatePullRequest, 'authorLogin' | 'authorType'>): boolean {
  return pr.authorType === 'Bot' || pr.authorLogin.endsWith('[bot]')
}

/** Marker SHAs may be abbreviated (>= 7 chars); the head SHA from the API is full. */
export function shaCovers(markerSha: string, headSha: string): boolean {
  return headSha.toLowerCase().startsWith(markerSha)
}

/**
 * The marker whose SHA must match the PR head. The final address pass
 * legitimately pushes after APPROVE, so an address marker posted after the
 * latest review covers the head, but only one that belongs to this point in the
 * loop (`final`, or a round no earlier than the review's). A stray address
 * marker from an earlier round can't vouch for later commits.
 */
export function coveringMarker(latestReview: ReviewMarker, after: LoopMarker[]): LoopMarker {
  const addresses = after.filter(
    (m): m is AddressMarker => m.kind === 'address' && (m.round === 'final' || m.round >= latestReview.round),
  )
  return addresses.at(-1) ?? latestReview
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateGate({ pr, comments }: GateInput): GateResult {
  if (pr.state !== 'open') return { status: 'skip', why: 'closed' }
  if (pr.draft) return { status: 'skip', why: 'draft' }
  if (isBotAuthor(pr)) return { status: 'exempt', why: 'bot' }
  if (pr.labels.includes(LABELS.exempt)) return { status: 'exempt', why: 'label' }

  const { markers, rejected } = collectTrustedMarkers(comments, pr.authorLogin)
  const reviewIndex = markers.findLastIndex((m) => m.kind === 'review')
  const latestReview = reviewIndex >= 0 ? (markers[reviewIndex] as ReviewMarker) : null
  const evidence: GateEvidence = { headSha: pr.headSha, latestReview, rejectedMarkers: rejected }

  const reasons: GateReason[] = []
  if (!latestReview) {
    reasons.push({ code: 'no-review' })
  } else {
    if (latestReview.verdict !== 'APPROVE') {
      reasons.push({ code: 'not-approved', round: latestReview.round, verdict: latestReview.verdict })
    }
    if (latestReview.personas.length < MIN_DISTINCT_PERSONAS) {
      reasons.push({ code: 'too-few-personas', round: latestReview.round, personas: latestReview.personas })
    }
    const covering = coveringMarker(latestReview, markers.slice(reviewIndex + 1))
    if (!shaCovers(covering.sha, pr.headSha)) {
      reasons.push({ code: 'head-not-covered', markerSha: covering.sha, headSha: pr.headSha })
    }
  }

  return reasons.length === 0 ? { status: 'pass', evidence } : { status: 'fail', reasons, evidence }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderContext {
  /** e.g. https://github.com/spencermarx/open-code-review (from the runner env, never from the PR). */
  repoUrl: string
  defaultBranch: string
  authorLogin: string
}

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/

function short(sha: string): string {
  return sha.slice(0, 7)
}

function docsLink(ctx: RenderContext, anchor: string): string {
  return `${ctx.repoUrl}/blob/${ctx.defaultBranch}/CONTRIBUTING.md#${anchor}`
}

function renderReason(reason: GateReason): string {
  switch (reason.code) {
    case 'no-review':
      return "I couldn't find an OCR review round with an `ocr-review-loop:` marker on this PR yet. Run the review loop and post each round here; `/ocr-review-loop` does this for you (OCR's `/ocr:post` doesn't add the marker)."
    case 'not-approved':
      return reason.verdict === 'NEEDS_DISCUSSION'
        ? `The latest review (round ${reason.round}) ended in **NEEDS_DISCUSSION**. Work through its open questions (feel free to ask us here), then run another round.`
        : `The latest review (round ${reason.round}) is **REQUEST_CHANGES**. Address the findings and keep looping until a round comes back **APPROVE**.`
    case 'too-few-personas': {
      const needed = `the loop needs at least ${MIN_DISTINCT_PERSONAS}, e.g. \`--team principal:2,quality:2\``
      if (reason.personas.length === 0) {
        return `Round ${reason.round} didn't list any reviewer personas (ephemeral \`--reviewer\` reviewers don't count); ${needed}.`
      }
      const team = reason.personas.map((p) => `\`${p}\``).join(', ')
      return `Round ${reason.round} used ${reason.personas.length} distinct reviewer persona${reason.personas.length === 1 ? '' : 's'} (${team}); ${needed}.`
    }
    case 'head-not-covered':
      return `The latest loop round covers \`${short(reason.markerSha)}\`, but the PR head is now \`${short(reason.headSha)}\`. Commits pushed after the loop need another review round (it's usually a quick one).`
  }
}

function renderRejectedHint(count: number, ctx: RenderContext): string {
  const what = count === 1 ? '1 comment has' : `${count} comments have`
  return `${what} an \`ocr-review-loop:\` marker I couldn't use. Markers are strict: check each field against the [format](${docsLink(ctx, 'other-ai-tools-manual-fallback')}) (case-sensitive, verdicts use underscores like \`REQUEST_CHANGES\`, no spaces after commas, full SHA). Fixing a typo in place is fine; I re-check when the comment is edited.`
}

export function renderStickyComment(result: GateResult, ctx: RenderContext): string | null {
  const greeting = LOGIN_RE.test(ctx.authorLogin) ? `Hi @${ctx.authorLogin}, thanks` : 'Thanks'
  const policy = docsLink(ctx, 'required-ocr-review-loop-before-maintainer-review')

  if (result.status === 'fail') {
    const reasons = result.reasons.map((r) => `- ${renderReason(r)}`)
    if (result.evidence.rejectedMarkers > 0) reasons.push(`- ${renderRejectedHint(result.evidence.rejectedMarkers, ctx)}`)
    // Advice only, and only before any round is posted (even one with a
    // malformed marker): once the loop is under way it's too late to help,
    // and whether a change needed an issue is a maintainer's call.
    const issueHint = result.evidence.latestReview || result.evidence.rejectedMarkers > 0
      ? []
      : [
          `Bigger change that hasn't been discussed in an issue yet? It's worth [starting with one](${docsLink(ctx, 'start-with-an-issue')}) so we can agree on the approach before you put more time in. That's a conversation with a maintainer, not something I check.`,
          '',
        ]
    return [
      STICKY_MARKER,
      '### OCR review loop: not complete yet',
      '',
      `${greeting} for contributing! Before a maintainer reviews a PR, we ask contributors to run OCR's own review loop on it and post the rounds here. It catches most issues before a human spends time on them, and it's how we [dogfood the tool](${policy}).`,
      '',
      "**What's still needed**",
      '',
      ...reasons,
      '',
      '**How to finish**',
      '',
      '- **Claude Code:** run `/ocr-review-loop` on this branch (`--team principal:2,quality:2,security:1` is a great choice). It posts every round for you.',
      `- **Other AI tools:** run \`/ocr:review\` and \`/ocr:address\` (\`/ocr-review\` and \`/ocr-address\` in Windsurf and other tools with flat command names) round by round, and post each round with the markers described in the [manual fallback](${docsLink(ctx, 'other-ai-tools-manual-fallback')}).`,
      `- **No AI tooling?** No problem. [Open an issue](${ctx.repoUrl}/issues/new/choose) describing the change and a maintainer can pick it up or exempt this PR.`,
      '',
      ...issueHint,
      `I re-check automatically when you push or comment here (comments from you or a maintainer). While \`${LABELS.needsReview}\` is on this PR it won't be queued for maintainer review. If it sits inactive for 14 days I'll send a friendly reminder, and 14 days after that it will be closed; it can be reopened any time once the loop is done.`,
      '',
      `<sub>Checked head \`${short(result.evidence.headSha)}\`. This is a label, not a required status check.</sub>`,
    ].join('\n')
  }

  if (result.status === 'pass') {
    const review = result.evidence.latestReview
    const personas = review ? review.personas.map((p) => `\`${p}\``).join(', ') : ''
    return [
      STICKY_MARKER,
      '### OCR review loop: complete ✅',
      '',
      `Thanks! Round ${review?.round ?? '?'} came back **APPROVE** (${personas}) and the loop covers head \`${short(result.evidence.headSha)}\`. A maintainer will take it from here.`,
    ].join('\n')
  }

  if (result.status === 'exempt') {
    const why = result.why === 'bot' ? 'it was opened by a bot' : `a maintainer applied \`${LABELS.exempt}\``
    return [STICKY_MARKER, '### OCR review loop: not required', '', `This PR is exempt from the review loop because ${why}.`].join('\n')
  }

  return null
}

// ---------------------------------------------------------------------------
// API helpers (pure, so the runner's trust-sensitive choices are testable)
// ---------------------------------------------------------------------------

/** The `rel="next"` URL from a Link header, followed only back to the same API origin. */
export function nextPageUrl(link: string | null, apiUrl: string): string | null {
  const match = link?.split(',').find((part) => part.includes('rel="next"'))?.match(/<([^>]+)>/)
  const url = match?.[1]
  return url && url.startsWith(`${apiUrl}/`) ? url : null
}

export interface StickyCandidate {
  id: number
  body: string | null
  user: { login: string; type: string } | null
}

/** The gate's own sticky comment: authored by the Actions bot and carrying the gate marker. */
export function pickStickyComment<T extends StickyCandidate>(comments: T[], botLogin: string): T | undefined {
  return comments.find((c) => c.user?.login === botLogin && c.user.type === 'Bot' && c.body?.includes(STICKY_MARKER))
}

export function renderSummary(result: GateResult, ctx: RenderContext): string {
  if (result.status === 'skip') return `## OCR review gate\n\nSkipped: the PR is ${result.why}.\n`
  const body = renderStickyComment(result, ctx) ?? ''
  return `## OCR review gate: ${result.status}\n\n${body.replace(STICKY_MARKER, '').trim()}\n`
}
