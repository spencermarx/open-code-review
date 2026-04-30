# Issue #27 — Per-Persona Model Selection (Problem Space)

> Source: [#27 feat: per-persona model selection for AI CLI adapters](https://github.com/spencermarx/open-code-review/issues/27)
> Reporter: Johannes Engler (`johannes-engler-mw`)
> Status as of 2026-04-29: Backlog, no comments
>
> This document captures **the user's underlying problem and the contextual details we'll need to design our own solution**. It deliberately avoids endorsing the reporter's proposed implementation so we can choose an approach that fits OCR's broader vision.

---

## 1. The Problem the User Has

Today every reviewer in an OCR review runs against the same model. The user wants to **mix model tiers within a single review** so that:

- Heavyweight personas (e.g. `principal`, `architect`, `staff-engineer`) can use a stronger reasoning model for the hard, holistic judgments OCR is built around.
- Lightweight or narrowly scoped personas (e.g. `quality`, `docs-writer`, lint-flavored specialists) can use a faster/cheaper model.
- The cost/quality tradeoff becomes a **per-team configuration choice**, not an all-or-nothing decision baked into one CLI flag.

The user's frustration is that the underlying CLIs (Claude Code, OpenCode) already expose `--model` per invocation, but OCR collapses everything into a single AI process and therefore inherits a single model. The capability exists at the CLI layer but is invisible at the OCR layer.

## 2. Why This Matters for OCR

OCR's value proposition is **multi-perspective review**, where each reviewer is a deliberately distinct point of view. Two facts make per-persona model selection structurally interesting (not just a cost knob):

1. **Reviewer personas are not interchangeable.** A `principal` weighing system-level tradeoffs and a `quality` reviewer flagging readability nits are doing fundamentally different cognitive work. Forcing them onto the same model means we either over-pay for the cheap reviews or under-power the expensive ones.
2. **OCR is positioned as a *team* of reviewers, not a single linter.** A real engineering team mixes seniorities. Modeling that explicitly — including in compute budget — is on-brand. It strengthens the metaphor users are already buying into.

So this isn't merely a config-surface request. It's a question about whether OCR's persona model is **load-bearing** in the architecture or just a prompt-construction detail.

## 3. Where the Problem Lives in the Code

Quick map of the blockers, derived from the current source:

| Concern | File | Current state |
|---|---|---|
| Spawn options carry no `model` | `packages/dashboard/src/server/services/ai-cli/types.ts` | `SpawnOptions` has `prompt`, `cwd`, `mode`, `maxTurns`, `allowedTools`, `resumeSessionId` — no model field |
| Adapters never pass `--model` | `packages/dashboard/src/server/services/ai-cli/{claude-adapter,opencode-adapter}.ts` | Both spawn the CLI with no model flag, so the CLI's own default model wins |
| Workflow runs as a single process | `packages/dashboard/src/server/socket/command-runner.ts` | One spawn covers the entire 8-phase review; reviewers are sub-tasks of that one process and share its model |
| Config has no model surface | `.ocr/config.yaml` (`default_team`) | `default_team` is `id: count` only — there is no place to attach a model to a persona |
| Skill instructions assume Tech-Lead self-spawning | `.ocr/skills/references/workflow.md` (Phase 4) | The skill tells the Tech Lead to spawn reviewers itself via the host CLI's `Task` tool |

The reporter's proposal collapses these into: add `model` to `SpawnOptions`, pass `--model`, extend `default_team` schema, and **change the orchestrator to spawn one process per Phase-4 reviewer**. That last item is the architecturally significant change — everything else is plumbing.

## 4. What We Need to Decide (Before Picking a Solution)

These are the open design questions we should answer deliberately rather than inheriting from the reporter's proposal.

### 4.1 Where does model selection belong conceptually?

Three plausible homes, each with different downstream consequences:

- **Per persona definition** (model is a property of the reviewer file in `.ocr/skills/references/reviewers/`). Pros: travels with the persona; a `principal` is *intrinsically* a heavy-model role. Cons: couples our shipped personas to specific vendor model names.
- **Per team composition** (model is set in `default_team` / team config). Pros: keeps personas portable; teams pick their own budget. This is what the reporter proposes. Cons: model decisions get scattered across team configs.
- **Per tier** (model is a property of `holistic | specialist | persona | custom`, defined once). Pros: small surface area; matches our existing tier classification in `installer.ts`. Cons: less granular; a user who wants `architect` on a strong model and `staff-engineer` on a cheap one can't express it.

A hybrid (tier default + per-persona override + per-team override) is probably what we end up with. We should pick the layering order explicitly.

### 4.2 One process per reviewer, or persona-aware single process?

The reporter's design assumes Phase 4 fan-out into N processes. That's powerful but expensive in complexity:

- State transitions (`ocr state transition`) must work across processes.
- Each child process needs the Tech Lead's context (discovered standards, requirements, guidance) without sharing conversation history.
- Failure isolation gets better; debuggability of a single review session gets worse.
- We lose the "Tech Lead orchestrating its own team" narrative that the current single-process design gives us.

Alternative: keep one parent process, but let it spawn child CLIs explicitly when it hits Phase 4 (rather than via the host's internal `Task` tool). This preserves the Tech Lead metaphor while still allowing per-reviewer `--model`.

We should decide whether the per-persona-process change is **required by per-persona models**, or whether it's a separate architectural shift that the reporter has bundled in.

### 4.3 What's the user-facing model identifier?

OCR currently sits *above* the AI CLI it spawns. Models are referenced in vendor-native strings:

- Claude Code: `--model claude-sonnet-4-20250514` (Anthropic-native)
- OpenCode: `--model anthropic/claude-sonnet-4-20250514` (provider-prefixed)

If a config says `model: anthropic/claude-sonnet-4-20250514`, do we:
- Pass it through verbatim and let the wrong-CLI fail loudly?
- Translate it per adapter?
- Define our own logical names (`fast | balanced | strong`) and have each adapter resolve them?

The third option is the most aligned with OCR's posture as a CLI-agnostic layer. The first is the cheapest. This is a vision-level choice.

### 4.4 Backwards compatibility

`default_team: { principal: 2 }` (count-only) is in the wild today. Any new schema must keep that working. The reporter's `principal: { count: 2, model: "..." }` shape is backwards-compatible by union; we should validate that's still true if we choose a different shape.

### 4.5 Defaults and discoverability

If we accept this feature, what's a sensible **shipped default**? Options:

- No default — every persona inherits the CLI default, same as today (zero behavior change unless opted in).
- Tier-based default — holistic personas get `strong`, specialists get `balanced`, etc.
- Documented examples in `config.yaml` comments only — feature is invisible until the user reads docs.

This decides whether we're shipping a feature or shipping an opinion.

## 5. Out of Scope (For This Doc)

- The actual schema syntax. We'll pick that once §4 is decided.
- The `Task`-tool vs explicit-CLI-spawn debate beyond noting that it's coupled to §4.2.
- Cost reporting / token accounting per persona. Likely a follow-up once per-persona model selection lands, because then it actually has a reason to exist.
- Telemetry on which model produced which finding. Same — meaningful only after the feature ships.

## 6. Acceptance Signals (What "Solved" Looks Like)

Whatever solution we land on should make all of these true:

- A user can configure at least one OCR-shipped persona to run on a different model than the rest, in a single edit to one file.
- Existing `default_team: { name: count }` configs keep working with no migration step.
- The configured model is visibly applied — i.e. either the dashboard or the session output makes clear which model produced which review.
- A review with mixed models still produces a coherent synthesis; reviewer outputs are not tagged as second-class because they ran on a cheaper model.
- The change does not require the user to know the difference between Claude Code's and OpenCode's `--model` flag syntax (or, if it does, that requirement is documented and intentional per §4.3).

## 7. Suggested Next Step

Open a discovery thread on §4.1, §4.2, and §4.3 before scaffolding an OpenSpec change proposal. Those three answers determine the shape of every other decision; everything else is implementation detail downstream of them.
