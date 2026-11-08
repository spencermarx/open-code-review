# Architect Review — Round 1

## Scope
Cross-harness-sync: three-concept architecture (canonical source, HarnessAdapter, sync+doctor), decoupled tooling in `tools/harness/`, shared-vs-reserved split.

---

### CRITICAL

**1. Missing CLI contract.** The spec and design reference `sync --check` (blocking CI gate) but define no CLI surface at all: subcommands (`sync`, `doctor`), flags (`--dry-run`, `--all`, `--force`, `--check`), exit codes, stdout/stderr behavior, and what happens when one adapter's projection fails vs. the whole run.
- **Location:** tasks.md throughout; design.md "sync + doctor" section
- **Impact:** Without a contract, implementation is guesswork and CI gate integration (tasks 6.1–6.3) is fragile. Every task that invokes `sync` or `doctor` silently depends on an undefined interface.
- **Suggestion:** Add one paragraph to design.md under "CLI Contract" listing: commands (`sync [--dry-run] [--force]`, `doctor`, `sync --check`), exit codes (0 = in-sync, 1 = doctor report / out-of-sync), stdout behavior (summary lines per adapter + summary), stderr for errors. This is one small paragraph; it doesn't change the architecture.

---

### IMPORTANT

**2. `project()` return value is ambiguous about mutation vs. creation.** `HarnessAdapter.project(src)` returns `NativeArtifact[]` — but does each call produce a full set of files for that source, or is it per-source (one `project()` call = all files)? And what happens when a canonical source file is deleted: does the adapter remove projections?
- **Location:** design.md lines 108–115; spec "Harness-Adapter Extension Model" scenario
- **Impact:** The idempotency and "never clobber reserved" invariants depend on knowing whether `project()` is full-set or incremental. Without clarity, the default renderer's behavior under change is undefined.
- **Suggestion:** Clarify: each `project(src)` call returns the *complete* set of artifacts for that one source; sync iterates all sources × all adapters. Deletion is not supported (additive only; doctor reports orphan projections). This makes the invariant easy to reason about and keeps `project()` simple.

**3. Agent bridge test in task 5.4 is under-scoped.** `tools:[Read, Grep] → permissions denying edit/shell/subagent` is necessary but insufficient. OpenCode's permission model uses `{action, resource, effect}` ordered rules; "deny the rest" needs to enumerate *all known* actions (Edit, Shell, Bash, Agent, Read, Write, Filesystem, etc.) as deny rules or else miss some.
- **Location:** tasks.md lines 36–40; spec "Sub-Agent Bridge" requirement
- **Impact:** If only a few deny rules are emitted and OpenCode adds an action later, the agent silently gains it. The bridge is the *only* security control in this change.
- **Suggestion:** State that the bridge uses a "deny-all-default" approach: emit `allow` for each listed tool's action, then emit an explicit catch-all deny (or enumerate all known actions as deny). This is implementation detail but should be called out since it's the security boundary.

**4. The "curated allowlist" in D2/C3 has no concrete list.** Task 5.3 says "default to a curated allowlist of OCR-invoked agents" — what agents? How does one know which ones are "OCR-invoked"? This is a real behavioral decision that affects the output.
- **Location:** tasks.md line 39; design.md D2 (agent bridge) and proposal "What Changes" section
- **Impact:** Without knowing the default list, reviewers can't assess whether it's safe or whether `--all` is meaningful. If it's empty, every agent gets no permissions (broken); if too broad, same security issue as #3.
- **Suggestion:** Either reference a concrete file (`.claude/agents/**` filtered by some heuristic, or list the names) or state that the default list starts as *all agents from `.claude/agents/**` with `--all` flag having no effect* until someone curates. The latter is simpler and safer (never break existing agents).

**5. Default renderer's "reported" projection is unspecified.** Design says "a valid, *reported* projection, never a silent omission or broken file." What does a "reported" projection look like? A markdown file with "This harness doesn't support X" text? A JSON with `{ "_meta": { "unresolved": true } }`? The shape matters for both the sync output and doctor validation.
- **Location:** design.md lines 130–136; spec "Unhandled surface degrades safely" scenario
- **Impact:** Without a concrete shape, the default renderer is either a no-op (broken) or generates meaningless files.
- **Suggestion:** Define it as: for an unsupported surface, create a `.README` or companion file with a short markdown note like `<!-- auto-generated: this harness does not support <surface> -->` plus a link back to the canonical source. This is discoverable and non-destructive.

---

### CONSIDERATION

**6. Task 2.5's decoupling guard test may be over-scoped for scaffolding.** Asserting `release.projects` matches no `tools/**` path is valuable but should be a *root-level* integration test, not inside `tools/harness/`'s unit tests. It belongs in the repo's CI matrix, not in the harness package.
- **Location:** tasks.md line 19
- **Impact:** Low — just placement.

**7. Reserved merge strategy for OpenCode is underspecified.** Design says `.opencode/opencode.reserved.jsonc` "the generator merges into generated `opencode.json`". How? Deep merge? Key conflict resolution (generator vs reserved wins or fails)? A concrete example would help (e.g., if both generate and reserved define `mcp`, does the merge replace or nest?).
- **Location:** design.md D6 lines 257–262
- **Impact:** Medium — the generator's correctness depends on knowing the merge semantics.

**8. `mcp-servers.json` schema is a greenfield.** The spec says it's the single source but doesn't define its shape. What keys? Transport fields (`url`, `command`, `args`)? Environment? Disabled? This needs at least an example object to ground both adapter implementations.
- **Location:** design.md D2 lines 203–212; spec "Single Source For MCP Servers"
- **Impact:** Medium — adapters need to know the input schema.

---

## Architect Verdict
**APPROVE WITH CHANGES.** Core architecture is sound: three concepts, decoupled tooling home, shared-vs-reserved split, agent bridge with explicit permissions. The missing CLI contract (#1) is the only true blocker for implementation. Issues #2–#5 are important clarifications that should be addressed before coding begins.
