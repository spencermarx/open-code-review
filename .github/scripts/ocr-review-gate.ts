// I/O runner for the OCR review gate. Run by .github/workflows/ocr-review-gate.yml
// with Node's native type stripping: `node .github/scripts/ocr-review-gate.ts`.
//
// It only ever talks to the GitHub REST/GraphQL API with the workflow token. It
// never checks out, imports or executes anything from the PR. The only input
// taken from the triggering event is the PR number (via env), and everything
// else is re-fetched fresh so re-runs and comment events see current state.

import { appendFileSync } from 'node:fs'
import type { GateComment, GatePullRequest, GateResult, LinkedIssue, RenderContext } from './ocr-review-gate-evaluate.ts'
import {
  LABELS,
  classifyTitle,
  evaluateGate,
  gateLabels,
  nextPageUrl,
  parseClosingRefs,
  pickStickyComment,
  renderStickyComment,
  renderSummary,
} from './ocr-review-gate-evaluate.ts'

const BOT_LOGIN = 'github-actions[bot]'
const MAX_COMMENT_PAGES = 30

const LABEL_SPECS: Record<string, { color: string; description: string }> = {
  [LABELS.needsReview]: { color: 'fbca04', description: 'Waiting on an approved OCR review loop before maintainer review' },
  [LABELS.needsIssue]: { color: 'fef2c0', description: 'Waiting on a maintainer to accept the linked issue (issue-first)' },
  [LABELS.exempt]: { color: 'c5def5', description: 'Maintainer-applied: OCR review loop not required (typos, trivial docs)' },
  [LABELS.accepted]: { color: '0e8a16', description: 'Maintainer-accepted: ready for a pull request' },
  [LABELS.stale]: { color: 'd4c5f9', description: 'Reminder sent: OCR review loop still pending' },
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

const token = requireEnv('GITHUB_TOKEN')
const repo = requireEnv('GITHUB_REPOSITORY')
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const graphqlUrl = process.env.GITHUB_GRAPHQL_URL ?? `${apiUrl}/graphql`
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com'
const rawPrNumber = requireEnv('PR_NUMBER')
if (!/^\d{1,9}$/.test(rawPrNumber)) throw new Error('PR_NUMBER must be a positive integer')
const prNumber = Number(rawPrNumber)
const [owner, name] = repo.split('/') as [string, string]
// Local smoke testing: read everything, log the writes instead of making them.
const dryRun = process.env.OCR_GATE_DRY_RUN === '1'

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request(method: string, url: string, body?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'ocr-review-gate',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Never follow a redirect: e.g. a transferred issue would otherwise be read
    // from another repository and its labels trusted as if they were local.
    redirect: 'error',
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500)
    throw new HttpError(res.status, `${method} ${url} -> ${res.status}: ${detail}`)
  }
  return res
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (dryRun && method !== 'GET') {
    console.log(`[dry-run] ${method} ${path}${body === undefined ? '' : ` ${JSON.stringify(body)}`}`)
    return undefined as T
  }
  const res = await request(method, `${apiUrl}${path}`, body)
  return (res.status === 204 ? undefined : await res.json()) as T
}

interface ApiUser {
  login: string
  type: string
}
interface ApiLabel {
  name: string
}
interface ApiPull {
  number: number
  state: string
  draft: boolean
  title: string
  body: string | null
  user: ApiUser
  head: { sha: string }
  labels: ApiLabel[]
  base: { repo: { default_branch: string } }
}
interface ApiComment {
  id: number
  body: string | null
  created_at: string
  author_association: string
  user: ApiUser | null
}
interface ApiIssue {
  number: number
  labels: ApiLabel[]
  pull_request?: unknown
}

async function listAll<T>(path: string, maxPages: number): Promise<T[]> {
  const all: T[] = []
  let url: string | null = `${apiUrl}${path}${path.includes('?') ? '&' : '?'}per_page=100`
  for (let page = 0; url && page < maxPages; page++) {
    const res = await request('GET', url)
    all.push(...((await res.json()) as T[]))
    url = nextPageUrl(res.headers.get('link'), apiUrl)
  }
  return all
}

async function ensureLabels(): Promise<void> {
  // One listing instead of a GET per label keeps each run cheap on the
  // repository's shared GITHUB_TOKEN budget.
  const existing = new Set((await listAll<ApiLabel>(`/repos/${owner}/${name}/labels`, 10)).map((l) => l.name))
  for (const [label, spec] of Object.entries(LABEL_SPECS)) {
    if (existing.has(label)) continue
    try {
      await rest('POST', `/repos/${owner}/${name}/labels`, { name: label, ...spec })
      if (!dryRun) console.log(`Created label ${label}`)
    } catch (err) {
      // 422 = created concurrently by another run.
      if (!(err instanceof HttpError) || err.status !== 422) throw err
    }
  }
}

async function addLabel(current: string[], label: string): Promise<void> {
  if (current.includes(label)) return
  await rest('POST', `/repos/${owner}/${name}/issues/${prNumber}/labels`, { labels: [label] })
}

async function removeLabel(current: string[], label: string): Promise<void> {
  if (!current.includes(label)) return
  try {
    await rest('DELETE', `/repos/${owner}/${name}/issues/${prNumber}/labels/${encodeURIComponent(label)}`)
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err
  }
}

interface ClosingIssuesResponse {
  data?: {
    repository?: {
      pullRequest?: {
        closingIssuesReferences?: {
          nodes: { number: number; repository: { nameWithOwner: string }; labels: { nodes: ApiLabel[] } }[]
        }
      }
    }
  }
  errors?: unknown[]
}

/**
 * Linked same-repo issues from both GitHub's closing references (covers the
 * sidebar "Development" links) and `Closes #N` in the body (covers PRs whose
 * base isn't the default branch, where GitHub doesn't populate the former).
 */
async function linkedIssues(body: string): Promise<LinkedIssue[]> {
  const found = new Map<number, LinkedIssue>()
  const res = await request('POST', graphqlUrl, {
    query: `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          closingIssuesReferences(first: 10) {
            nodes { number repository { nameWithOwner } labels(first: 50) { nodes { name } } }
          }
        }
      }
    }`,
    variables: { owner, name, number: prNumber },
  })
  const json = (await res.json()) as ClosingIssuesResponse
  if (json.errors) console.log(`::warning::closingIssuesReferences query returned errors; falling back to the PR body`)
  for (const node of json.data?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? []) {
    if (node.repository.nameWithOwner.toLowerCase() !== repo.toLowerCase()) continue
    found.set(node.number, { number: node.number, labels: node.labels.nodes.map((l) => l.name) })
  }
  for (const number of parseClosingRefs(body)) {
    if (found.has(number)) continue
    try {
      const issue = await rest<ApiIssue>('GET', `/repos/${owner}/${name}/issues/${number}`)
      if (issue.pull_request) continue
      found.set(number, { number, labels: issue.labels.map((l) => l.name) })
    } catch (err) {
      if (!(err instanceof HttpError) || (err.status !== 404 && err.status !== 410)) throw err
    }
  }
  return [...found.values()]
}

async function syncStickyComment(comments: ApiComment[], body: string | null, allowCreate: boolean): Promise<void> {
  if (body === null) return
  const existing = pickStickyComment(comments, BOT_LOGIN)
  if (existing) {
    if (existing.body === body) return
    await rest('PATCH', `/repos/${owner}/${name}/issues/comments/${existing.id}`, { body })
  } else if (allowCreate) {
    await rest('POST', `/repos/${owner}/${name}/issues/${prNumber}/comments`, { body })
  }
}

function writeSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, markdown)
  else console.log(markdown)
}

async function main(): Promise<void> {
  const pull = await rest<ApiPull>('GET', `/repos/${owner}/${name}/pulls/${prNumber}`)
  const labels = pull.labels.map((l) => l.name)
  const pr: GatePullRequest = {
    number: pull.number,
    state: pull.state,
    draft: pull.draft,
    authorLogin: pull.user.login,
    authorType: pull.user.type,
    title: pull.title,
    body: pull.body ?? '',
    headSha: pull.head.sha,
    labels,
  }
  const ctx: RenderContext = {
    repoUrl: `${serverUrl}/${repo}`,
    defaultBranch: pull.base.repo.default_branch,
    authorLogin: pr.authorLogin,
  }

  // Short-circuit before any API writes for PRs the gate doesn't act on.
  const early = evaluateGate({ pr, comments: [], linkedIssues: [] })
  if (early.status === 'skip') {
    writeSummary(renderSummary(early, ctx))
    return
  }
  labelOnCrash = early.status !== 'exempt'

  await ensureLabels()
  const apiComments = await listAll<ApiComment>(`/repos/${owner}/${name}/issues/${prNumber}/comments`, MAX_COMMENT_PAGES)
  const comments: GateComment[] = apiComments
    .filter((c): c is ApiComment & { user: ApiUser } => c.user !== null)
    .map((c) => ({
      id: c.id,
      authorLogin: c.user.login,
      authorAssociation: c.author_association,
      createdAt: c.created_at,
      body: c.body ?? '',
    }))
  const title = classifyTitle(pr.title)
  const issues = title.kind === 'conventional' && title.requiresIssue ? await linkedIssues(pr.body) : []

  const result: GateResult = evaluateGate({ pr, comments, linkedIssues: issues })
  const sticky = renderStickyComment(result, ctx)

  const want = gateLabels(result)
  await (want.needsReview ? addLabel : removeLabel)(labels, LABELS.needsReview)
  await (want.needsIssue ? addLabel : removeLabel)(labels, LABELS.needsIssue)
  if (!want.needsReview) await removeLabel(labels, LABELS.stale)
  // Labels now reflect this evaluation; a later crash must not overwrite them.
  labelOnCrash = false
  // Never post a fresh comment just to say "pass"; only update one we left.
  await syncStickyComment(apiComments, sticky, result.status === 'fail')

  console.log(`OCR review gate for #${prNumber}: ${result.status}`)
  writeSummary(renderSummary(result, ctx))
}

// Set once the PR is known to be one the gate acts on (not skipped or exempt).
let labelOnCrash = false

main().catch(async (err: unknown) => {
  // A crash (API outage, bug) should be visible to maintainers, unlike a
  // gate "fail", which is just a label and always exits 0.
  const message = err instanceof Error ? err.message : String(err)
  console.log(`::error::OCR review gate crashed: ${message.replace(/[\r\n]+/g, ' ')}`)
  process.exitCode = 1
  // Fail closed: a PR the gate couldn't evaluate shouldn't look ready for
  // review. The next successful run removes the label if it isn't warranted.
  if (labelOnCrash) {
    try {
      await rest('POST', `/repos/${owner}/${name}/issues/${prNumber}/labels`, { labels: [LABELS.needsReview] })
    } catch {
      console.log('::warning::Could not apply needs-ocr-review after the crash')
    }
  }
})
