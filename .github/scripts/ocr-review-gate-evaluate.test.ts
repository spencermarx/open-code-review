import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { GateComment, GateInput, GatePullRequest, GateResult, RenderContext } from './ocr-review-gate-evaluate.ts'
import {
  LABELS,
  STICKY_MARKER,
  collectTrustedMarkers,
  evaluateGate,
  isTrustedComment,
  nextPageUrl,
  pickStickyComment,
  parseCommentMarker,
  parseMarkerLine,
  renderStickyComment,
  renderSummary,
} from './ocr-review-gate-evaluate.ts'

const HEAD = 'a'.repeat(40)
const OLD = 'b'.repeat(40)
const AUTHOR = 'contributor'

let nextId = 1
function comment(body: string, overrides: Partial<GateComment> = {}): GateComment {
  const id = nextId++
  return {
    id,
    authorLogin: AUTHOR,
    authorAssociation: 'CONTRIBUTOR',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
    body,
    ...overrides,
  }
}

function review(round: number, verdict: string, personas: string, sha = HEAD): string {
  return `<!-- ocr-review-loop:review round=${round} verdict=${verdict} personas=${personas} sha=${sha} -->\n🤖 **OCR multi-agent review — Round ${round}**`
}

function address(round: number | 'final', sha = HEAD): string {
  return `<!-- ocr-review-loop:address round=${round} sha=${sha} -->\n## 🔧 OCR Address`
}

function pr(overrides: Partial<GatePullRequest> = {}): GatePullRequest {
  return {
    number: 7,
    state: 'open',
    draft: false,
    authorLogin: AUTHOR,
    authorType: 'User',
    headSha: HEAD,
    labels: [],
    ...overrides,
  }
}

function evaluate(input: Partial<GateInput> & { pr?: GatePullRequest } = {}): GateResult {
  return evaluateGate({ pr: input.pr ?? pr(), comments: input.comments ?? [] })
}

function reasonCodes(result: GateResult): string[] {
  return result.status === 'fail' ? result.reasons.map((r) => r.code) : []
}

const ctx: RenderContext = {
  repoUrl: 'https://github.com/spencermarx/open-code-review',
  defaultBranch: 'main',
  authorLogin: AUTHOR,
}

describe('parseMarkerLine', () => {
  it('parses a well-formed review marker', () => {
    assert.deepEqual(parseMarkerLine(`<!-- ocr-review-loop:review round=2 verdict=APPROVE personas=principal,quality sha=${HEAD} -->`), {
      kind: 'review',
      round: 2,
      verdict: 'APPROVE',
      personas: ['principal', 'quality'],
      sha: HEAD,
    })
  })

  it('parses numbered and final address markers', () => {
    assert.deepEqual(parseMarkerLine(`<!-- ocr-review-loop:address round=1 sha=${HEAD} -->`), { kind: 'address', round: 1, sha: HEAD })
    assert.deepEqual(parseMarkerLine(`<!-- ocr-review-loop:address round=final sha=${HEAD} -->`), { kind: 'address', round: 'final', sha: HEAD })
  })

  it('accepts abbreviated SHAs and up to three spaces of indent', () => {
    assert.equal(parseMarkerLine(`   <!-- ocr-review-loop:address round=1 sha=abcdef1 -->`)?.sha, 'abcdef1')
  })

  it('deduplicates personas', () => {
    const m = parseMarkerLine(`<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=principal,principal,quality sha=${HEAD} -->`)
    assert.deepEqual(m?.kind === 'review' && m.personas, ['principal', 'quality'])
  })

  it('accepts fields in any order', () => {
    const m = parseMarkerLine(`<!-- ocr-review-loop:review sha=${HEAD} personas=a,b verdict=REQUEST_CHANGES round=3 -->`)
    assert.equal(m?.kind === 'review' && m.verdict, 'REQUEST_CHANGES')
  })

  const invalid: Record<string, string> = {
    'unknown verdict': `<!-- ocr-review-loop:review round=1 verdict=LGTM personas=a,b sha=${HEAD} -->`,
    'verdict with a space': `<!-- ocr-review-loop:review round=1 verdict=REQUEST CHANGES personas=a,b sha=${HEAD} -->`,
    'lowercase verdict': `<!-- ocr-review-loop:review round=1 verdict=approve personas=a,b sha=${HEAD} -->`,
    'review round=final': `<!-- ocr-review-loop:review round=final verdict=APPROVE personas=a,b sha=${HEAD} -->`,
    'four-digit round': `<!-- ocr-review-loop:address round=1000 sha=${HEAD} -->`,
    'negative round': `<!-- ocr-review-loop:address round=-1 sha=${HEAD} -->`,
    'short sha': `<!-- ocr-review-loop:address round=1 sha=abc12 -->`,
    'uppercase sha': `<!-- ocr-review-loop:address round=1 sha=${'A'.repeat(40)} -->`,
    'over-long sha': `<!-- ocr-review-loop:address round=1 sha=${'a'.repeat(41)} -->`,
    'non-hex sha': `<!-- ocr-review-loop:address round=1 sha=${'g'.repeat(40)} -->`,
    'uppercase persona': `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=Principal,quality sha=${HEAD} -->`,
    'persona starting with dash': `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=-x,quality sha=${HEAD} -->`,
    'empty persona list entry': `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=principal,,quality sha=${HEAD} -->`,
    'over-long persona': `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=${'p'.repeat(65)},quality sha=${HEAD} -->`,
    'missing field': `<!-- ocr-review-loop:review round=1 verdict=APPROVE sha=${HEAD} -->`,
    'duplicate field': `<!-- ocr-review-loop:address round=1 round=2 sha=${HEAD} -->`,
    'unknown field': `<!-- ocr-review-loop:address round=1 sha=${HEAD} note=hi -->`,
    'review field on address': `<!-- ocr-review-loop:address round=1 verdict=APPROVE sha=${HEAD} -->`,
    'bare token': `<!-- ocr-review-loop:address round=1 sha=${HEAD} approved -->`,
    'unknown kind': `<!-- ocr-review-loop:approve round=1 sha=${HEAD} -->`,
    'quoted reply': `> <!-- ocr-review-loop:address round=1 sha=${HEAD} -->`,
    'four-space indent (code block)': `    <!-- ocr-review-loop:address round=1 sha=${HEAD} -->`,
    'trailing text after comment': `<!-- ocr-review-loop:address round=1 sha=${HEAD} --> extra`,
    'unterminated comment': `<!-- ocr-review-loop:address round=1 sha=${HEAD}`,
  }
  for (const [name, line] of Object.entries(invalid)) {
    it(`rejects ${name}`, () => assert.equal(parseMarkerLine(line), null))
  }

  it('rejects over-long lines without heavy work', () => {
    const line = `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=${'a,'.repeat(5000)}b sha=${HEAD} -->`
    assert.equal(parseMarkerLine(line), null)
  })
})

describe('parseCommentMarker', () => {
  it('finds a marker anywhere in the body', () => {
    assert.equal(parseCommentMarker(`Some text\n\n${address(1)}`)?.kind, 'address')
  })

  it('ignores markers inside fenced code blocks', () => {
    const body = ['Here is the format:', '```markdown', `<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=a,b sha=${HEAD} -->`, '```'].join('\n')
    assert.equal(parseCommentMarker(body), null)
  })

  it('ignores markers inside tilde fences and resumes after the fence closes', () => {
    const body = ['~~~~', address(1, OLD), '~~~~', address(2)].join('\n')
    assert.deepEqual(parseCommentMarker(body), { kind: 'address', round: 2, sha: HEAD })
  })

  it('keeps a fence open until a matching closing fence', () => {
    const body = ['````', '```', address(1), '````'].join('\n')
    assert.equal(parseCommentMarker(body), null)
  })

  it('uses only the first valid marker in a comment', () => {
    const body = [`<!-- ocr-review-loop:review round=1 verdict=nope personas=a,b sha=${HEAD} -->`, review(1, 'REQUEST_CHANGES', 'a,b'), review(1, 'APPROVE', 'a,b')].join('\n')
    const m = parseCommentMarker(body)
    assert.equal(m?.kind === 'review' && m.verdict, 'REQUEST_CHANGES')
  })

  it('handles CRLF line endings', () => {
    assert.equal(parseCommentMarker(`hello\r\n${address(1)}\r\n`)?.kind, 'address')
  })
})

describe('collectTrustedMarkers', () => {
  it('trusts the PR author (case-insensitively) and maintainers, but nobody else', () => {
    const comments = [
      comment(address(1), { authorLogin: 'Contributor' }),
      comment(address(2), { authorLogin: 'maint', authorAssociation: 'MEMBER' }),
      comment(address(3), { authorLogin: 'owner', authorAssociation: 'OWNER' }),
      comment(address(4), { authorLogin: 'collab', authorAssociation: 'COLLABORATOR' }),
      comment(address(5), { authorLogin: 'drive-by', authorAssociation: 'CONTRIBUTOR' }),
      comment(address(6), { authorLogin: 'stranger', authorAssociation: 'NONE' }),
      comment(address(7), { authorLogin: 'github-actions[bot]', authorAssociation: 'NONE' }),
    ]
    assert.deepEqual(
      collectTrustedMarkers(comments, AUTHOR).markers.map((m) => m.round),
      [1, 2, 3, 4],
    )
  })

  it('orders by creation time, then id', () => {
    const later = comment(address(2), { createdAt: '2026-10-02T00:00:00Z' })
    const earlier = comment(address(1), { createdAt: '2026-10-01T00:00:00Z' })
    const tieA = comment(address(3), { id: 1000, createdAt: '2026-10-03T00:00:00Z' })
    const tieB = comment(address(4), { id: 1001, createdAt: '2026-10-03T00:00:00Z' })
    assert.deepEqual(
      collectTrustedMarkers([tieB, later, tieA, earlier], AUTHOR).markers.map((m) => m.round),
      [1, 2, 3, 4],
    )
  })
})

describe('evaluateGate: review loop', () => {
  it('fails with no-review when nothing has been posted', () => {
    assert.deepEqual(reasonCodes(evaluate()), ['no-review'])
  })

  it('passes on an approved round with two personas covering head', () => {
    const result = evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality'))] })
    assert.equal(result.status, 'pass')
  })

  it('passes the full loop: request changes, address, approve, final address after approve', () => {
    const result = evaluate({
      comments: [
        comment(review(1, 'REQUEST_CHANGES', 'principal,quality,security', OLD)),
        comment(address(1, 'c'.repeat(40))),
        comment(review(2, 'APPROVE', 'principal,quality,security', 'c'.repeat(40))),
        comment(address('final', HEAD)),
      ],
    })
    assert.equal(result.status, 'pass')
    assert.equal(result.status === 'pass' && result.evidence.latestReview?.round, 2)
  })

  it('uses the latest review verdict, not any earlier APPROVE', () => {
    const result = evaluate({
      comments: [comment(review(1, 'APPROVE', 'principal,quality')), comment(review(2, 'REQUEST_CHANGES', 'principal,quality'))],
    })
    assert.deepEqual(reasonCodes(result), ['not-approved'])
  })

  it('treats NEEDS_DISCUSSION as not approved', () => {
    const result = evaluate({ comments: [comment(review(1, 'NEEDS_DISCUSSION', 'principal,quality'))] })
    assert.equal(result.status === 'fail' && result.reasons[0]?.code === 'not-approved' && result.reasons[0].verdict, 'NEEDS_DISCUSSION')
  })

  it('requires at least two distinct personas', () => {
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal'))] })), ['too-few-personas'])
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,principal'))] })), ['too-few-personas'])
  })

  it('counts instance names as their persona, so two instances of one persona are still one', () => {
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal-1,principal-2'))] })), ['too-few-personas'])
    assert.equal(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal-1,quality-2'))] }).status, 'pass')
    assert.equal(evaluate({ comments: [comment(review(1, 'APPROVE', 'martin-fowler,quality'))] }).status, 'pass')
  })

  it('does not count ephemeral reviewers as a persona', () => {
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,ephemeral-1'))] })), ['too-few-personas'])
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,ephemeral'))] })), ['too-few-personas'])
  })

  it('ignores an earlier-round address marker posted after the approving review', () => {
    const result = evaluate({
      comments: [comment(review(3, 'APPROVE', 'principal,quality', OLD)), comment(address(1, HEAD))],
    })
    assert.deepEqual(reasonCodes(result), ['head-not-covered'])
  })

  it('accepts a same-or-later-round address marker after the approving review', () => {
    const result = evaluate({
      comments: [comment(review(2, 'APPROVE', 'principal,quality', OLD)), comment(address(2, HEAD))],
    })
    assert.equal(result.status, 'pass')
  })

  it('judges coverage only once a review exists', () => {
    assert.deepEqual(reasonCodes(evaluate({ comments: [comment(address(1, OLD))] })), ['no-review'])
  })

  it('fails when commits were pushed after the loop', () => {
    const result = evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality', OLD))] })
    assert.deepEqual(reasonCodes(result), ['head-not-covered'])
  })

  it('fails when a later address round covers head but the approving review predates it', () => {
    const result = evaluate({
      comments: [comment(review(1, 'APPROVE', 'principal,quality', OLD)), comment(address(2, OLD))],
    })
    assert.deepEqual(reasonCodes(result), ['head-not-covered'])
  })

  it('fails when the latest marker is a stale address pass even if an earlier marker matched head', () => {
    const result = evaluate({
      comments: [comment(review(1, 'APPROVE', 'principal,quality', HEAD)), comment(address('final', OLD))],
    })
    assert.deepEqual(reasonCodes(result), ['head-not-covered'])
  })

  it('accepts an abbreviated SHA that prefixes head', () => {
    const result = evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality', HEAD.slice(0, 7)))] })
    assert.equal(result.status, 'pass')
  })

  it('ignores an APPROVE posted by an untrusted commenter', () => {
    const result = evaluate({
      comments: [
        comment(review(1, 'REQUEST_CHANGES', 'principal,quality')),
        comment(review(2, 'APPROVE', 'principal,quality'), { authorLogin: 'mallory', authorAssociation: 'NONE' }),
      ],
    })
    assert.deepEqual(reasonCodes(result), ['not-approved'])
  })

  it('counts maintainer-posted rounds (e.g. a maintainer running the loop for a contributor)', () => {
    const result = evaluate({
      comments: [comment(review(1, 'APPROVE', 'principal,quality'), { authorLogin: 'maint', authorAssociation: 'OWNER' })],
    })
    assert.equal(result.status, 'pass')
  })

  it('reports every failing condition at once', () => {
    const result = evaluate({ comments: [comment(review(1, 'REQUEST_CHANGES', 'principal', OLD))] })
    assert.deepEqual(reasonCodes(result), ['not-approved', 'too-few-personas', 'head-not-covered'])
  })
})

describe('API helpers', () => {
  const api = 'https://api.github.com'

  it('follows only next links on the same API origin', () => {
    assert.equal(nextPageUrl(`<${api}/x?page=2>; rel="next", <${api}/x?page=9>; rel="last"`, api), `${api}/x?page=2`)
    assert.equal(nextPageUrl(`<https://evil.example/x?page=2>; rel="next"`, api), null)
    assert.equal(nextPageUrl(`<${api}.evil.example/x>; rel="next"`, api), null)
    assert.equal(nextPageUrl(`<${api}/x?page=9>; rel="last"`, api), null)
    assert.equal(nextPageUrl(null, api), null)
  })

  it('picks only the Actions bot comment that carries the gate marker', () => {
    const comments = [
      { id: 1, body: `${STICKY_MARKER}\nfake`, user: { login: 'mallory', type: 'User' } },
      { id: 2, body: `${STICKY_MARKER}\nfake`, user: { login: 'github-actions[bot]', type: 'User' } },
      { id: 3, body: 'no marker', user: { login: 'github-actions[bot]', type: 'Bot' } },
      { id: 4, body: `${STICKY_MARKER}\nreal`, user: { login: 'github-actions[bot]', type: 'Bot' } },
    ]
    assert.equal(pickStickyComment(comments, 'github-actions[bot]')?.id, 4)
    assert.equal(pickStickyComment(comments.slice(0, 3), 'github-actions[bot]'), undefined)
  })
})

describe('workflow and repo contracts', () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

  it("keeps the gate workflow's comment filter in step with isTrustedComment", () => {
    const workflow = read('.github/workflows/ocr-review-gate.yml')
    assert.match(workflow, /github\.event\.comment\.user\.login == github\.event\.issue\.user\.login/)
    const associations = JSON.parse(/fromJSON\('(\[[^\]]*\])'\)/.exec(workflow)?.[1] ?? '[]') as string[]
    assert.deepEqual([...associations].sort(), ['COLLABORATOR', 'MEMBER', 'OWNER'])
    for (const association of associations) {
      assert.ok(isTrustedComment(comment('x', { authorLogin: 'someone', authorAssociation: association }), AUTHOR))
    }
    assert.ok(!isTrustedComment(comment('x', { authorLogin: 'someone', authorAssociation: 'CONTRIBUTOR' }), AUTHOR))
  })

  it('stale-closes only needs-ocr-review PRs and never an exempt one', () => {
    const reminders = read('.github/workflows/ocr-review-reminders.yml')
    assert.match(reminders, new RegExp(`only-pr-labels: ${LABELS.needsReview}\\n`))
    assert.match(reminders, new RegExp(`exempt-pr-labels: .*${LABELS.exempt}`))
  })

  it('refuses redirects on every API call', () => {
    const runner = read('.github/scripts/ocr-review-gate.ts')
    assert.equal(runner.match(/\bfetch\(/g)?.length, 1, 'every API call goes through request()')
    // Every `redirect` property (or shorthand) at the start of a code line.
    assert.deepEqual([...runner.matchAll(/^\s+redirect\b(?:\s*:\s*([^,\s}]*))?/gm)].map((m) => m[1]), ["'error'"])
  })
})

describe('rejected markers', () => {
  it('counts trusted comments whose marker the gate could not use', () => {
    const result = evaluate({
      comments: [
        comment(`<!-- ocr-review-loop:review round=1 verdict=APPROVED personas=principal,quality sha=${HEAD} -->`),
        comment(`<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=principal, quality sha=${HEAD} -->`),
        comment(`<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=principal,quality sha=${HEAD} -->`, { authorLogin: 'stranger', authorAssociation: 'NONE' }),
        comment(['```', `<!-- ocr-review-loop:address round=1 sha=${HEAD} -->`, '```'].join('\n')),
        comment('just chatting'),
      ],
    })
    assert.equal(result.status === 'fail' && result.evidence.rejectedMarkers, 2)
    const body = renderStickyComment(result, ctx) ?? ''
    assert.match(body, /2 comments have an `ocr-review-loop:` marker I couldn't use/)
    assert.ok(!body.includes('APPROVED'))
  })

  it('clears the count once a corrected marker is posted in a new comment', () => {
    const result = evaluate({
      comments: [
        comment(`<!-- ocr-review-loop:review round=1 verdict=APPROVED personas=principal,quality sha=${HEAD} -->`),
        comment(review(1, 'REQUEST_CHANGES', 'principal,quality')),
      ],
    })
    assert.equal(result.status === 'fail' && result.evidence.rejectedMarkers, 0)
  })

  it('does not count a comment whose marker was accepted', () => {
    const result = evaluate({ comments: [comment(review(1, 'REQUEST_CHANGES', 'principal,quality'))] })
    assert.equal(result.status === 'fail' && result.evidence.rejectedMarkers, 0)
    assert.ok(!(renderStickyComment(result, ctx) ?? '').includes("couldn't use"))
  })
})

describe('evaluateGate: exemptions and skips', () => {
  it('skips closed and draft PRs', () => {
    assert.deepEqual(evaluate({ pr: pr({ state: 'closed' }) }), { status: 'skip', why: 'closed' })
    assert.deepEqual(evaluate({ pr: pr({ draft: true }) }), { status: 'skip', why: 'draft' })
  })

  it('exempts bot authors', () => {
    assert.deepEqual(evaluate({ pr: pr({ authorLogin: 'dependabot[bot]', authorType: 'Bot' }) }), { status: 'exempt', why: 'bot' })
    assert.deepEqual(evaluate({ pr: pr({ authorLogin: 'renovate[bot]', authorType: 'User' }) }), { status: 'exempt', why: 'bot' })
  })

  it('exempts PRs with the exempt label', () => {
    assert.deepEqual(evaluate({ pr: pr({ labels: [LABELS.exempt] }) }), { status: 'exempt', why: 'label' })
  })

  it('does not exempt maintainers by default', () => {
    assert.equal(evaluate({ pr: pr({ authorLogin: 'spencermarx' }) }).status, 'fail')
  })

  it('does not exempt a look-alike label', () => {
    assert.equal(evaluate({ pr: pr({ labels: ['ocr-review-exempt-please'] }) }).status, 'fail')
  })
})

describe('rendering', () => {
  it('starts the sticky comment with the gate marker and lists reasons', () => {
    const result = evaluate({ comments: [comment(review(2, 'REQUEST_CHANGES', 'principal,quality'))] })
    const body = renderStickyComment(result, ctx) ?? ''
    assert.ok(body.startsWith(STICKY_MARKER))
    assert.match(body, /round 2\) is \*\*REQUEST_CHANGES\*\*/)
    assert.match(body, /Hi @contributor/)
    assert.match(body, /14 days/)
  })

  it('renders a pass update and an exempt note', () => {
    const pass = renderStickyComment(evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality'))] }), ctx) ?? ''
    assert.match(pass, /complete ✅/)
    assert.match(pass, /`principal`, `quality`/)
    const exempt = renderStickyComment(evaluate({ pr: pr({ labels: [LABELS.exempt] }) }), ctx) ?? ''
    assert.match(exempt, /exempt/)
  })

  it('renders nothing for skipped PRs except a summary', () => {
    const result = evaluate({ pr: pr({ draft: true }) })
    assert.equal(renderStickyComment(result, ctx), null)
    assert.match(renderSummary(result, ctx), /Skipped: the PR is draft/)
  })

  it('never echoes attacker-controlled text into the bot comment', () => {
    const payload = '@everyone <img src=x onerror=alert(1)> [click](https://evil.example) $(curl evil)'
    const result = evaluate({
      comments: [
        comment(`${payload}\n<!-- ocr-review-loop:review round=1 verdict=APPROVE personas=principal,<script> sha=${HEAD} -->`),
        comment(`<!-- ocr-review-loop:review round=1 verdict=APPROVE`),
        comment(`<!-- ocr-review-loop:review round=9 verdict=REQUEST_CHANGES personas=principal,quality sha=${HEAD} --><script>alert(1)</script>`),
        comment(review(4, 'REQUEST_CHANGES', 'principal,quality')),
      ],
    })
    const body = renderStickyComment(result, ctx) ?? ''
    for (const needle of ['@everyone', '<img', '<script', 'evil', '$(curl', 'round 9']) {
      assert.ok(!body.includes(needle), `bot comment must not contain ${needle}`)
    }
    assert.match(body, /round 4/)
  })

  it('does not @mention an author login that fails validation', () => {
    const body = renderStickyComment(evaluate(), { ...ctx, authorLogin: 'bad login @everyone' }) ?? ''
    assert.ok(!body.includes('@everyone'))
    assert.match(body, /^Thanks for contributing/m)
  })

  it('renders a specific message for every failure reason', () => {
    const cases: [GateResult, RegExp][] = [
      [evaluate(), /couldn't find an OCR review round with an `ocr-review-loop:` marker .* `\/ocr:post` doesn't add the marker/],
      [evaluate({ comments: [comment(review(1, 'NEEDS_DISCUSSION', 'principal,quality'))] }), /round 1\) ended in \*\*NEEDS_DISCUSSION\*\*/],
      [evaluate({ comments: [comment(review(1, 'APPROVE', 'principal'))] }), /Round 1 used 1 distinct reviewer persona \(`principal`\); the loop needs at least 2/],
      [evaluate({ comments: [comment(review(1, 'APPROVE', 'ephemeral-1,ephemeral-2'))] }), /Round 1 didn't list any reviewer personas \(ephemeral/],
      [evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality', OLD))] }), /covers `bbbbbbb`, but the PR head is now `aaaaaaa`\. Commits pushed after the loop need another review round/],
    ]
    for (const [result, pattern] of cases) assert.match(renderStickyComment(result, ctx) ?? '', pattern)
  })

  it('says accurately when it re-checks, and how inactivity works', () => {
    const body = renderStickyComment(evaluate(), ctx) ?? ''
    assert.match(body, /re-check automatically when you push or comment here/)
    assert.ok(!body.includes('edit the PR'))
    assert.match(body, /### OCR review loop: not complete yet/)
    assert.match(body, /\*\*How to finish\*\*/)
    assert.match(body, /14 days/)
  })

  it('suggests an issue for bigger changes only as advice, and only before the first round', () => {
    const hint = /\[starting with one\]\(\S+CONTRIBUTING\.md#start-with-an-issue\)/
    const fresh = renderStickyComment(evaluate(), ctx) ?? ''
    assert.match(fresh, hint)
    assert.match(fresh, /not something I check/)
    for (const result of [
      evaluate({ comments: [comment(review(1, 'REQUEST_CHANGES', 'principal,quality'))] }),
      evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality'))] }),
      evaluate({ pr: pr({ labels: [LABELS.exempt] }) }),
    ]) {
      assert.doesNotMatch(renderStickyComment(result, ctx) ?? '', /start-with-an-issue/)
    }
  })

  it('names both command styles for non-Claude-Code tools', () => {
    assert.match(renderStickyComment(evaluate(), ctx) ?? '', /`\/ocr:review` and `\/ocr:address` \(`\/ocr-review` and `\/ocr-address`/)
  })

  it('links only to CONTRIBUTING.md headings that exist', () => {
    const contributing = readFileSync(new URL('../../CONTRIBUTING.md', import.meta.url), 'utf8')
    const slugs = new Set(
      [...contributing.matchAll(/^#{1,6} (.+)$/gm)].map((m) =>
        (m[1] ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-'),
      ),
    )
    const rendered = [evaluate(), evaluate({ comments: [comment(`<!-- ocr-review-loop:review round=1 -->`)] })].map((r) => renderStickyComment(r, ctx) ?? '')
    const anchors = new Set(rendered.flatMap((body) => [...body.matchAll(/CONTRIBUTING\.md#([a-z0-9-]+)/g)].map((m) => m[1] ?? '')))
    assert.ok(anchors.size >= 3)
    for (const anchor of anchors) assert.ok(slugs.has(anchor), `CONTRIBUTING.md has no heading for #${anchor}`)
  })

  it('accepts the example marker documented in CONTRIBUTING.md', () => {
    const contributing = readFileSync(new URL('../../CONTRIBUTING.md', import.meta.url), 'utf8')
    const example = contributing.split('\n').find((line) => line.startsWith('<!-- ocr-review-loop:review round=2'))
    assert.ok(example, 'CONTRIBUTING.md lost its example review marker')
    assert.deepEqual(parseMarkerLine(example)?.kind, 'review')
  })

  it('never emits a loop marker of its own, so the bot cannot feed the gate', () => {
    for (const result of [evaluate(), evaluate({ comments: [comment(review(1, 'APPROVE', 'principal,quality'))] })]) {
      assert.equal(parseCommentMarker(renderStickyComment(result, ctx) ?? ''), null)
    }
  })
})
