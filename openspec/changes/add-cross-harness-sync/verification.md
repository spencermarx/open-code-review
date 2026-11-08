# Verification: cross-harness behavior (OpenCode V2 + Claude Code)

All behavioral claims in this change were verified against primary docs via a
research subagent. Verdicts: **CONFIRMED** / **REFUTED** / **UNCERTAIN**. Where a
claim forced a design change, it is noted.

Sources: OpenCode V2 `opencode.ai/v2/docs/*`; Claude Code `code.claude.com/docs/en/*`.

## OpenCode V2

| # | Claim | Verdict | Note |
|---|---|---|---|
| 1 | Reads `AGENTS.md` only; no `CLAUDE.md` fallback | **CONFIRMED** | `instructions`: *"V2 recognizes `AGENTS.md` only. It does not use `CLAUDE.md` as a fallback."* |
| 2 | Auto-discovers `.claude/skills` + `.agents/skills` as compat skill sources | **CONFIRMED** | Skills "Discovery" table: project compat = `.claude/skills`, `.agents/skills`. |
| 3 | Does NOT auto-discover `.claude/commands` / `.claude/agents` | **CONFIRMED** | Commands/agents enumerate only OpenCode-native locations; skills are the *only* `.claude`/`.agents` compat surface. |
| 4 | Config = `opencode.json(c)` or `.opencode/opencode.json(c)`, both merged | **CONFIRMED** | Every `.opencode` config overrides every direct config. |
| 5 | Agents at `.opencode/agents/<name>.md`; nested → `parent/name`; fields description/mode/model/permissions/color/steps/hidden; body = system | **CONFIRMED** | Identity = **path**. |
| 6 | Commands at `.opencode/commands/<name>.md`; nested → **slash** `/team/review`; `$ARGUMENTS`/`$1..$2`; fields description/agent/model/subagent | **CONFIRMED** | Slash separator (vs Claude's colon). |
| 7 | Skills at `.opencode/skills/<id>/SKILL.md`; dir = ID; kebab `^[a-z0-9]+(-[a-z0-9]+)*$` ≤64 recommended; description advertises | **CONFIRMED (not runtime-enforced in V2)** | A recommendation, not a hard check. |
| 8 | MCP under `mcp.servers`; local `{type:"local",command[],environment,disabled,cwd}`; remote `{type:"remote",url,headers,oauth}`; ≠ Claude `.mcp.json` | **CONFIRMED** | Genuinely different shape. |
| 9 | Permissions = ordered `{action,resource,effect}`; policies distinct; **empty ⇒ `*:* allow` (full access)**; subagent perms not a subset of parent's | **CONFIRMED (default is permissive)** | Forces explicit deny-rules in the agent bridge. |
| 10 | No in-file `@`-include (commands don't expand `@path`; includes are config-driven: `instructions` array, `references`, `{file:}`/`{env:}`) | **REFUTED (no `@`-include)** | So `opencode.json`/`.opencode/*` must be full content. |

## Claude Code

| # | Claim | Verdict | Note |
|---|---|---|---|
| 11 | Reads `CLAUDE.md` (project + `.claude/CLAUDE.md` + `CLAUDE.local.md` + global `~/.claude/CLAUDE.md`) | **CONFIRMED** | |
| 12 | Natively reads `AGENTS.md` since v2.1.277, **but suppressed by a coexisting `CLAUDE.md`** (default `claude-md-or-agents-md`) | **CONFIRMED (with caveat)** | To read both, set `claude-md-and-agents-md` **or** `@AGENTS.md`-import in `CLAUDE.md`. |
| 13 | `@path` import in `CLAUDE.md` is harness-resolved into context (4-hop depth; same-dir needs no approval; backticked/quoted = literal) | **CONFIRMED** | **Changes design:** `CLAUDE.md` can be a literal `@AGENTS.md` pointer. |
| 14 | Agents at `.claude/agents/**/*.md`; identity = **`name` frontmatter** (nested dirs organizational); fields name/description/tools/disallowedTools/model/color/maxTurns/skills/hooks/… | **CONFIRMED (identity nuance)** | `name` vs OpenCode's path identity — converter must map `name`→filename. |
| 15 | Commands at `.claude/commands/**/*.md`; nested → **colon** `/frontend:component`; `$ARGUMENTS`/`$ARGUMENTS[n]`; fields description/argument-hint/model/allowed-tools/… | **CONFIRMED (colon separator)** | Colon vs OpenCode's slash. |
| 16 | MCP = `.mcp.json` root, top-level `mcpServers` `{command,args,env,…}` | **CONFIRMED** | Remote needs explicit `type: http\|sse\|ws`. |
| 17 | Settings `.claude/settings.json`: hooks (event→matcher→handlers), permissions (`allow`/`ask`/`deny`, order deny→ask→allow), statusLine, env, per-project `settings.local.json` | **CONFIRMED** | |
| 18 | Agent Skills standard shared; `.claude/skills` loadable by OpenCode; but Claude-only frontmatter (`allowed-tools`, `when_to_use`, `argument-hint`, `context`, `hooks`, `paths`, …) NOT interpreted by OpenCode; `disable-model-invocation` honored by both | **CONFIRMED (with field differences)** | Tool gating must be projected, not left in SKILL.md. |

## Bottom line (design impact)

1. `AGENTS.md` is the natural single source of truth; today the two harnesses
   consume **different** content (each ignores the other's file) — the problem this
   change solves.
2. `CLAUDE.md` becomes a literal `@AGENTS.md` **pointer** (Claude resolves the
   import cross-platform; required because a coexisting `CLAUDE.md` otherwise
   suppresses `AGENTS.md`). `AGENTS.md` itself must stay full content (OpenCode
   can't follow `@`).
3. `opencode.json` and `.mcp.json` are full generated content (no include;
   incompatible shapes).
4. Commands are model-followed pointers; note the `/` vs `:` namespace divergence
   (`/ocr/review` OpenCode vs `/ocr:review` Claude).
5. The agent bridge **must emit explicit OpenCode `permissions`** — the empty
   default is `*:* allow`, not locked-down; skill `allowed-tools` doesn't carry
   over.
6. **No symlinks**: confirmed non-OS-agnostic and Claude refuses to Edit/Write
   through them; the `@`-import is the cross-platform pointer.
