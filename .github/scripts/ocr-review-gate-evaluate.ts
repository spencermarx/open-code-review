// Pure evaluation logic for the OCR review gate (.github/workflows/ocr-review-gate.yml).
//
// Everything here is side-effect free so it can be unit tested without the
// GitHub API; ocr-review-gate.ts does the I/O. All PR titles, PR bodies and
// comment bodies are attacker-controlled input: markers are validated field by
// field and only validated values (or values GitHub itself guarantees, like
// SHAs and logins from the API) are ever echoed back into the bot comment.

export const LABELS = {
  needsReview: 'needs-ocr-review',
  exempt: 'ocr-review-exempt',
  accepted: 'accepted',
  stale: 'ocr-review-stale',
} as const

export const STICKY_MARKER = '<!-- ocr-review-gate -->'
export const MIN_DISTINCT_PERSONAS = 2

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

// Conventional-commit types that may skip the issue-first step. `!` (breaking)
// always requires an accepted issue, whatever the type.
const ISSUE_OPTIONAL_TYPES = new Set(['fix', 'docs', 'test', 'chore', 'ci', 'build', 'style', 'revert'])
const ISSUE_REQUIRED_TYPES = new Set(['feat', 'refactor', 'perf'])

export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'NEEDS_DISCUSSION'
const VERDICTS: ReadonlySet<string> = new Set<Verdict>(['APPROVE', 'REQUEST_CHANGES', 'NEEDS_DISCUSSION'])

const ROUND_RE = /^(\d{1,3}|final)$/
const PERSONA_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const SHA_RE = /^[0-9a-f]{7,40}$/
const MAX_PERSONAS = 32
// Real markers are ~200 chars. The cap bounds the work done on hostile input.
const MAX_MARKER_LINE = 1024
const MAX_CLOSING_REFS = 10

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
  title: string
  body: string
  headSha: string
  labels: string[]
}

export interface LinkedIssue {
  number: number
  labels: string[]
}

export interface GateInput {
  pr: GatePullRequest
  comments: GateComment[]
  /** Same-repository issues the PR links to, with their current labels. */
  linkedIssues: LinkedIssue[]
}

export type GateReason =
  | { code: 'no-review' }
  | { code: 'not-approved'; round: number; verdict: Verdict }
  | { code: 'too-few-personas'; round: number; personas: string[] }
  | { code: 'head-not-covered'; markerSha: string; headSha: string }
  | { code: 'unconventional-title' }
  | { code: 'issue-required'; type: string; breaking: boolean; linkedIssues: number[] }

export interface GateEvidence {
  headSha: string
  latestReview: ReviewMarker | null
  latestMarker: LoopMarker | null
  rounds: number
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
  if (parts.length === 0 || parts.length > MAX_PERSONAS) return null
  const distinct = new Set<string>()
  for (const part of parts) {
    if (!PERSONA_RE.test(part)) return null
    distinct.add(part)
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

/** Trusted markers, oldest first. */
export function collectTrustedMarkers(comments: GateComment[], prAuthorLogin: string): LoopMarker[] {
  return comments
    .filter((c) => isTrustedComment(c, prAuthorLogin))
    .slice()
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id)
    .map((c) => parseCommentMarker(c.body))
    .filter((m): m is LoopMarker => m !== null)
}

export function isBotAuthor(pr: Pick<GatePullRequest, 'authorLogin' | 'authorType'>): boolean {
  return pr.authorType === 'Bot' || pr.authorLogin.endsWith('[bot]')
}

/** Marker SHAs may be abbreviated (>= 7 chars); the head SHA from the API is full. */
export function shaCovers(markerSha: string, headSha: string): boolean {
  return headSha.toLowerCase().startsWith(markerSha)
}

// ---------------------------------------------------------------------------
// Issue-first
// ---------------------------------------------------------------------------

export type TitleRule =
  | { kind: 'unconventional' }
  | { kind: 'conventional'; type: string; breaking: boolean; requiresIssue: boolean }

export function classifyTitle(title: string): TitleRule {
  const match = /^([A-Za-z]+)(?:\([^()\r\n]{1,64}\))?(!)?: \S/.exec(title.trim())
  const type = match?.[1]?.toLowerCase()
  if (!type || !(ISSUE_OPTIONAL_TYPES.has(type) || ISSUE_REQUIRED_TYPES.has(type))) {
    return { kind: 'unconventional' }
  }
  const breaking = match?.[2] === '!'
  return { kind: 'conventional', type, breaking, requiresIssue: breaking || ISSUE_REQUIRED_TYPES.has(type) }
}

/**
 * Same-repository issue numbers referenced with a GitHub closing keyword
 * (`Closes #12`, `fixes #3`, ...). Cross-repo references are ignored on
 * purpose: an "accepted" label in someone else's repo means nothing here.
 */
export function parseClosingRefs(body: string): number[] {
  const refs = new Set<number>()
  const re = /(?:^|[^\w/#-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[ \t]*:?[ \t]+#(\d{1,7})\b/gi
  for (const line of stripFencedCode(body)) {
    for (const m of line.matchAll(re)) {
      refs.add(Number(m[1]))
      if (refs.size >= MAX_CLOSING_REFS) return [...refs]
    }
  }
  return [...refs]
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateGate({ pr, comments, linkedIssues }: GateInput): GateResult {
  if (pr.state !== 'open') return { status: 'skip', why: 'closed' }
  if (pr.draft) return { status: 'skip', why: 'draft' }
  if (isBotAuthor(pr)) return { status: 'exempt', why: 'bot' }
  if (pr.labels.includes(LABELS.exempt)) return { status: 'exempt', why: 'label' }

  const markers = collectTrustedMarkers(comments, pr.authorLogin)
  const reviews = markers.filter((m): m is ReviewMarker => m.kind === 'review')
  const latestReview = reviews.at(-1) ?? null
  const latestMarker = markers.at(-1) ?? null
  const evidence: GateEvidence = { headSha: pr.headSha, latestReview, latestMarker, rounds: reviews.length }

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
  }
  // The final address pass legitimately pushes after APPROVE, so coverage is
  // judged on the latest marker of either kind, not the latest review.
  if (latestMarker && !shaCovers(latestMarker.sha, pr.headSha)) {
    reasons.push({ code: 'head-not-covered', markerSha: latestMarker.sha, headSha: pr.headSha })
  }

  const title = classifyTitle(pr.title)
  if (title.kind === 'unconventional') {
    reasons.push({ code: 'unconventional-title' })
  } else if (title.requiresIssue && !linkedIssues.some((i) => i.labels.includes(LABELS.accepted))) {
    reasons.push({
      code: 'issue-required',
      type: title.type,
      breaking: title.breaking,
      linkedIssues: linkedIssues.map((i) => i.number),
    })
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

function renderReason(reason: GateReason, ctx: RenderContext): string {
  switch (reason.code) {
    case 'no-review':
      return "I couldn't find an OCR review round on this PR yet. Run the review loop and post each round here (the loop does this for you)."
    case 'not-approved':
      return reason.verdict === 'NEEDS_DISCUSSION'
        ? `The latest review (round ${reason.round}) ended in **NEEDS_DISCUSSION**. Work through its open questions (feel free to ask us here), then run another round.`
        : `The latest review (round ${reason.round}) is **REQUEST_CHANGES**. Address the findings and keep looping until a round comes back **APPROVE**.`
    case 'too-few-personas': {
      const team = reason.personas.map((p) => `\`${p}\``).join(', ')
      return `Round ${reason.round} used ${reason.personas.length} distinct reviewer persona (${team}); the loop needs at least ${MIN_DISTINCT_PERSONAS}, e.g. \`--team principal:2,quality:2\`.`
    }
    case 'head-not-covered':
      return `The latest loop round covers \`${short(reason.markerSha)}\`, but the PR head is now \`${short(reason.headSha)}\`. Commits pushed after the loop need another pass (it's usually a quick one).`
    case 'unconventional-title':
      return `The PR title doesn't start with a [Conventional Commits](https://www.conventionalcommits.org/) type (\`feat:\`, \`fix:\`, \`docs:\`, ...), so I can't tell whether an accepted issue is needed. Please retitle the PR.`
    case 'issue-required': {
      const kind = reason.breaking ? 'Breaking changes' : `\`${reason.type}:\` PRs`
      const linked =
        reason.linkedIssues.length > 0
          ? ` The linked issue${reason.linkedIssues.length > 1 ? 's' : ''} (${reason.linkedIssues.map((n) => `#${n}`).join(', ')}) ${reason.linkedIssues.length > 1 ? "don't" : "doesn't"} have the \`${LABELS.accepted}\` label yet.`
          : ` Link one with \`Closes #<number>\` in the description.`
      return `${kind} need a linked issue a maintainer has marked \`${LABELS.accepted}\` ([why](${docsLink(ctx, 'open-an-issue-first-for-non-trivial-changes')})).${linked}`
    }
  }
}

export function renderStickyComment(result: GateResult, ctx: RenderContext): string | null {
  const greeting = LOGIN_RE.test(ctx.authorLogin) ? `Hi @${ctx.authorLogin}, thanks` : 'Thanks'
  const policy = docsLink(ctx, 'required-ocr-review-loop-before-maintainer-review')

  if (result.status === 'fail') {
    const reasons = result.reasons.map((r) => `- ${renderReason(r, ctx)}`).join('\n')
    return [
      STICKY_MARKER,
      '### OCR review loop: not complete yet',
      '',
      `${greeting} for contributing! Before a maintainer reviews a PR, we ask contributors to run OCR's own review loop on it and post the rounds here. It catches most issues before a human spends time on them, and it's how we [dogfood the tool](${policy}).`,
      '',
      "**What's still needed**",
      '',
      reasons,
      '',
      '**How to finish**',
      '',
      '- **Claude Code:** run `/ocr-review-loop` on this branch (`--team principal:2,quality:2,security:1` is a great choice). It posts every round for you.',
      `- **Other AI tools:** run \`/ocr:review\` and \`/ocr:address\` round by round and post each round with the markers described in the [manual fallback](${docsLink(ctx, 'other-ai-tools-manual-fallback')}).`,
      `- **No AI tooling?** No problem. [Open an issue](${ctx.repoUrl}/issues/new/choose) describing the change and a maintainer can pick it up or exempt this PR.`,
      '',
      `I re-check automatically on every push and comment. While \`${LABELS.needsReview}\` is on this PR it won't be queued for maintainer review. If it sits inactive for 14 days I'll send a friendly reminder, and 14 days after that it will be closed; it can be reopened any time once the loop is done.`,
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

export function renderSummary(result: GateResult, ctx: RenderContext): string {
  if (result.status === 'skip') return `## OCR review gate\n\nSkipped: the PR is ${result.why}.\n`
  const body = renderStickyComment(result, ctx) ?? ''
  return `## OCR review gate: ${result.status}\n\n${body.replace(STICKY_MARKER, '').trim()}\n`
}
