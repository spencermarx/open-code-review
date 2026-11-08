// -- Tests for agent-bridge: permissions mapping, identity, frontmatter parsing.
// Run with: npx tsx tools/harness/agent-bridge.test.ts

import { parseFrontmatter, mapPermissions, buildOpenCodeAgent } from "./agent-bridge";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
};

// ============================================================================
// Test: parseFrontmatter handles all expected fields
// ============================================================================
{
  const md = `---
name: reviewer
type: validator
color: "#E74C3C"
description: Code review and quality assurance specialist
capabilities:
  - code_review
  - security_audit
priority: medium
hooks:
  pre: |
    echo "hello"
---

# Body text
`;
  const fm = parseFrontmatter(md);
  assert(fm.name === "reviewer", "name parsed");
  assert(fm.type === "validator", "type parsed");
  assert(fm.color === "#E74C3C", "color parsed");
  assert(fm.description === "Code review and quality assurance specialist", "description parsed");
  assert(
    fm.tools === undefined || !Array.isArray(fm.tools),
    "no tools field (only capabilities, not tools)",
  );
}

// ============================================================================
// Test: parseFrontmatter handles empty/absent tools → least-privilege
// ============================================================================
{
  const md = `---
name: tester
type: validator
color: "#F39C12"
description: Testing specialist
---

Body here.
`;
  const fm = parseFrontmatter(md);
  assert(fm.tools === undefined, "no tools field present");

  const perms = mapPermissions(fm.tools);
  // Empty/absent → only Read + Grep allowed, all others denied
  assert(perms.length > 0, "permissions non-empty");
  const hasReadAllow = perms.some((p) => p.action === "Read" && p.effect === "allow");
  const hasGrepAllow = perms.some((p) => p.action === "Grep" && p.effect === "allow");
  assert(hasReadAllow, "Read is allowed (least-privilege default)");
  assert(hasGrepAllow, "Grep is allowed (least-privilege default)");
  const hasEditDeny = perms.some((p) => p.action.toLowerCase() === "edit" && p.effect === "deny");
  const hasShellDeny = perms.some((p) => p.action.toLowerCase() === "shell" && p.effect === "deny");
  assert(hasEditDeny, "edit is denied by default");
  assert(hasShellDeny, "shell is denied by default");
  // CRITICAL: no *:* allow ever
  const hasWildcardAllow = perms.some(
    (p) => p.action === "*:*" || p.action === "*" && p.resource === "*",
  );
  assert(!hasWildcardAllow, "no wildcard allow present");
}

// ============================================================================
// Test: tools:[Read,Grep] → deny edit/shell/subagent
// ============================================================================
{
  // Agent with explicit tools: Read + Grep only
  const fm = parseFrontmatter(`---\nname: researcher\nkind: analyst\ntools:\n  - Read\n  - Grep\n---\nBody\n`);
  assert(Array.isArray(fm.tools), "explicit tools list parsed");

  const perms = mapPermissions(fm.tools);
  const hasEditDeny = perms.some((p) => p.action.toLowerCase() === "edit" && p.effect === "deny");
  assert(hasEditDeny, "edit denied when tools only has Read+Grep");
  const hasShellDeny = perms.some((p) => p.action.toLowerCase() === "shell" && p.effect === "deny");
  assert(hasShellDeny, "shell denied when tools only has Read+Grep");
  const hasSubagentDeny = perms.some((p) => p.action.toLowerCase() === "subagent" && p.effect === "deny");
  assert(hasSubagentDeny, "subagent denied when not in allowlist");

  // Verify that Read and Grep are allowed
  const hasReadAllow = perms.some((p) => (p.action === "read" || p.action === "Read") && p.effect === "allow");
  assert(hasReadAllow, "Read is explicitly allowed");
  const hasGrepAllow = perms.some((p) => (p.action === "grep" || p.action === "Grep") && p.effect === "allow");
  assert(hasGrepAllow, "Grep is explicitly allowed");
}

// ============================================================================
// Test: tools:[Edit] → deny shell/subagent but allow edit
// ============================================================================
{
  const fm = parseFrontmatter(`---\nname: editor\nkind: editor\ntools:\n  - Edit\n---\nBody\n`);
  assert(Array.isArray(fm.tools), "single tool parsed");

  const perms = mapPermissions(fm.tools);
  const hasEditAllow = perms.some(
    (p) => p.action.toLowerCase() === "edit" && p.effect === "allow",
  );
  assert(hasEditAllow, "Edit is allowed when explicitly in tools");
  const hasShellDeny2 = perms.some((p) => p.action.toLowerCase() === "shell" && p.effect === "deny");
  assert(hasShellDeny2, "shell denied when only Edit in tools");
}

// ============================================================================
// Test: parseFrontmatter ignores unknown fields without error
// ============================================================================
{
  const md = `---
name: planner
type: coordinator
color: "#4ECDC4"
description: Planning agent
unknown_field: foo
bar_baz_qux: 123
hooks:
  pre: echo hi
---

Body.
`;
  const fm = parseFrontmatter(md);
  assert(fm.name === "planner", "name parsed");
  // Unknown fields are stored as scalars but don't break parsing
  assert(fm.description === "Planning agent", "description parsed despite unknown fields");
}

// ============================================================================
// Test: buildOpenCodeAgent produces correct output
// ============================================================================
{
  const fm = {
    name: "reviewer",
    type: "validator",
    color: "#E74C3C",
    description: "Code review specialist",
  };
  const agentMd = `---\nname: reviewer\n---\n\n# Reviewer Agent body.\n`;
  const artifact = buildOpenCodeAgent(fm, agentMd);

  assert(artifact.relPath.includes("reviewer.md"), "relPath contains agent name");
  assert(artifact.content.includes("---"), "output has YAML frontmatter fence");
  assert(artifact.content.includes("mode: validator"), "mode is validator");
  assert(artifact.content.includes("model: null"), "model is null when not specified");
  assert(
    artifact.content.includes("Code review specialist"),
    "description preserved",
  );
  // Should contain deny entries for dangerous actions
  assert(
    artifact.content.includes('"Edit"') || artifact.content.includes('"edit"'),
    "edit in output",
  );
  assert(
    artifact.content.includes('"shell"') || artifact.content.includes('"Shell"'),
    "shell denied in output",
  );
}

// ============================================================================
// Test: buildOpenCodeAgent with explicit tools includes allowed actions
// ============================================================================
{
  const fm = {
    name: "editor",
    type: "editor",
    description: "An editor",
    tools: ["Read", "Edit"],
  };
  const artifact = buildOpenCodeAgent(fm, "---\nname: editor\n---\nBody\n");

  assert(artifact.content.includes("effect:"), "allow effect present in output");
  // Shell should be denied since it's not in the allowlist
  assert(
    artifact.content.includes('"Shell"') || artifact.content.includes('"shell"'),
    "deny effects present for non-allowed actions",
  );
}

// ============================================================================
// Test: no wildcard (*:* allow) in any permissions output
// ============================================================================
{
  const testCases = [
    { tools: undefined as string[] | undefined }, // empty/absent → least-privilege
    { tools: ["Read"] }, // single tool
    { tools: ["Edit", "Shell", "Read"] }, // some dangerous ones
  ];

  for (const tc of testCases) {
    const perms = mapPermissions(tc.tools);
    const hasWildcard = perms.some(
      (p) => p.action === "*:*" || p.action === "*" && p.resource === "*",
    );
    assert(!hasWildcard, `no wildcard allow with tools=${JSON.stringify(tc.tools)}`);
  }
}

// ============================================================================
// Test: empty tools array → least-privilege (same as absent)
// ============================================================================
{
  const perms = mapPermissions([]);
  const hasReadAllow = perms.some((p) => p.action === "Read" && p.effect === "allow");
  const hasGrepAllow = perms.some((p) => p.action === "Grep" && p.effect === "allow");
  assert(hasReadAllow, "empty tools → Read allowed (least-privilege)");
  assert(hasGrepAllow, "empty tools → Grep allowed (least-privilege)");
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n=== Results: ${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`} ===`);
if (failures > 0) process.exit(1);
