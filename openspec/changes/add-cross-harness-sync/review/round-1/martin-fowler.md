# Martin Fowler Review — Round 1

## Scope
Cross-harness-sync: design simplicity, code smells, refactoring clarity, patterns vs over-engineering, evolutionary design.

---

### CRITICAL

**None.** The architecture is lean: three concepts that do real work (canonical source, adapter, sync+doctor). No unnecessary abstraction layers. The "add a harness = one adapter" promise is testable and the model supports it. Good restraint on what's deferred.

---

### IMPORTANT

**1. Over-naming risk: `HarnessAdapter` interface vs. implementation.** The name `HarnessAdapter` suggests a GoF Adapter pattern — translating between two interfaces. But what we're describing is a *projection strategy* (source → target rendering), not an adapter per se. A more precise name would be `HarnessProjector` or simply `Harness` (with a `project()` method). "Adapter" misleads readers into expecting a `target` interface to adapt *to*.
- **Location:** design.md lines 106–136; spec "Harness-Adapter Extension Model"
- **Impact:** Low for correctness, but the name shapes how maintainers reason about the code. If someone reads "adapter" they'll look for a `from`/`to` interface that doesn't exist here. The method is `project(src)`, not `adapt()`.
- **Suggestion:** Keep it simple — rename to `HarnessProjector` (clear intent: project source to target artifacts), or even just `Harness` since the only method is `project`. Both are shorter and more honest about what the type does.

**2. Doctor doing triple duty.** Doctor verifies three unrelated things: (a) import presence, (b) MCP consistency, (c) generated file freshness + permissions + reserved file untouchedness. This violates single-responsibility: it's a linter, a diff checker, and an auditor all in one function/class.
- **Location:** design.md lines 139–148; tasks.md 6.2
- **Impact:** Medium. As-is it works (the feature is small), but the next person to add a fourth check will be puzzled by the structure. The CI gate (6.3) adds another concern on top.
- **Suggestion:** Split doctor's internal checks into named functions (`checkImport`, `checkMcpSync`, `checkAgentPermissions`, `checkReservedUntouched`) and have one orchestrator run them all. The CI gate should be a separate thin wrapper around doctor's exit code. This is purely structural — no behavioral change.

**3. Task ordering gap: tasks 4 (OpenCode config) and 5 (agent bridge) are interdependent but listed sequentially.** Task 4 generates `opencode.json` with generated keys; task 5 generates `.opencode/agents/**` with permissions. But `opencode.json` needs to reference the agents directory (`"agents": ".opencode/agents"`), which only exists after task 5 runs. If task 4 writes before task 5, it either omits the reference (broken) or hardcodes it (works but fragile).
- **Location:** tasks.md lines 29–40
- **Impact:** Medium — the build sequence should reflect this dependency explicitly (e.g., "generate agent files first, then write opencode.json with updated references").
- **Suggestion:** Swap 4.1 and 5.1 in priority: agents directory must exist before `opencode.json` can reference it, OR task 4.1 writes the full `opencode.json` including `"agents": ".opencode/agents"` as a literal string (which is fine since it's generated content).

---

### CONSIDERATION

**4. `mcp-servers.json` as greenfield JSON vs. extending existing `.mcp.json`.** The design introduces an entirely new file (`mcp-servers.json`) rather than extracting the common shape from the existing `.mcp.json`. This is a net-new schema that no consumer tool (yet) reads directly — only the two adapters read it. Consider: could we instead *convert* the existing `.mcp.json` into the canonical format and deprecate it? That would eliminate one source file at the cost of an initial migration.
- **Location:** design.md D2; spec "Single Source For MCP Servers"
- **Impact:** Very low — this is a style question. The new-file approach is cleaner (no in-place mutation risk).

**5. Test strategy for projections is thin.** Task 3.4 says "both outputs parse, are semantically equal" and "preserve current `.mcp.json` byte-for-byte on first run." But task 4.4's OpenCode config test only checks file existence + schema validation against a remote URL — it doesn't verify the content actually maps correctly from the canonical source.
- **Location:** tasks.md lines 26, 33–34
- **Impact:** Low-medium — the "semantic equality" claim for MCP is stated but not tested for OpenCode config. Add a test that `opencode.json`'s `mcp.servers` matches `mcp-servers.json`.

**6. The "blocking from day one" CI gate (decision #4) is bold but justified.** A warn-then-block transition would let stale projections accumulate, making it impossible to tell when you're actually in-sync. Blocking from the start ensures the invariant holds for every commit. This is a good call.

**7. `reserved.jsonc` with comments is the right pattern.** Using JSONC (comments + trailing commas) for the hand-authored reserved input is practical: humans can comment why they set certain keys, and the generator merges on top without losing those comments. The `.jsonc` extension signals "this file has human edits" without requiring a special format.

---

## Martin Fowler Verdict
**APPROVE WITH CHANGES.** The design is lean, purposeful, and avoids over-engineering (three concepts only, defer the policy layer). The main issues are naming precision (#1) and internal structure of doctor (#2) — both refactorings that don't change behavior. The task ordering gap (#3) should be fixed during implementation.
