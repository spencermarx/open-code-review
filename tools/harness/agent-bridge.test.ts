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
// Test: empty/absent tools → default to Read + Grep
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
  // Empty/absent → mirror Claude's base permissions: Read + Grep
  assert(perms.length > 0, "permissions non-empty");
  const hasReadAllow = perms.some((p) => p.action.toLowerCase() === "read" && p.effect === "allow");
  const hasGrepAllow = perms.some((p) => p.action.toLowerCase() === "grep" && p.effect === "allow");
  assert(hasReadAllow, "Read is allowed (base permissions default)");
  assert(hasGrepAllow, "Grep is allowed (base permissions default)");
}

// ============================================================================
// Test: tools:[Read,Grep] → mirror those exactly
// ============================================================================
{
  // Agent with explicit tools: Read + Grep only
  const fm = parseFrontmatter(`---\nname: researcher\nkind: analyst\ntools:\n  - Read\n  - Grep\n---\nBody\n`);
  assert(Array.isArray(fm.tools), "explicit tools list parsed");

  const perms = mapPermissions(fm.tools!);
  // Mirror exactly what's listed — no arbitrary deny entries
  const hasReadAllow = perms.some((p) => p.action.toLowerCase() === "read" && p.effect === "allow");
  const hasGrepAllow = perms.some((p) => p.action.toLowerCase() === "grep" && p.effect === "allow");
  assert(hasReadAllow, "Read is allowed (mirrored from tools)");
  assert(hasGrepAllow, "Grep is allowed (mirrored from tools)");

  // No extra deny entries — we mirror, we don't constrain
  const hasDenyEntries = perms.some((p) => p.effect === "deny");
  assert(!hasDenyEntries, "no arbitrary deny entries");
}

// ============================================================================
// Test: tools:[Edit] → allow edit, nothing extra
// ============================================================================
{
  const fm = parseFrontmatter(`---\nname: editor\nkind: editor\ntools:\n  - Edit\n---\nBody\n`);
  assert(Array.isArray(fm.tools), "single tool parsed");

  const perms = mapPermissions(fm.tools!);
  const hasEditAllow = perms.some((p) => p.action.toLowerCase() === "edit" && p.effect === "allow");
  assert(hasEditAllow, "Edit is allowed when in tools");
  // No extra deny entries — we mirror Claude's setup, not add constraints
  const hasDenyEntries = perms.some((p) => p.effect === "deny");
  assert(!hasDenyEntries, "no arbitrary deny entries for unsupported actions");
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
}

// ============================================================================
// Test: buildOpenCodeAgent with explicit tools mirrors them
// ============================================================================
{
  const fm = {
    name: "editor",
    type: "editor",
    description: "An editor",
    tools: ["Read", "Edit"],
  };
  const artifact = buildOpenCodeAgent(fm, "---\nname: editor\n---\nBody\n");

  // Should contain allow entries for both Read and Edit
  assert(artifact.content.includes("effect:"), "allow effect present in output");
  // The bridge mirrors — no arbitrary deny constraints
}

// ============================================================================
// Test: no wildcard (*:* allow) in any permissions output
// ============================================================================
{
  const testCases = [
    { tools: undefined as string[] | undefined }, // empty/absent → base perms
    { tools: ["Read"] }, // single tool
    { tools: ["Edit", "Shell", "Read"] }, // multiple tools
  ];

  for (const tc of testCases) {
    const perms = mapPermissions(tc.tools);
    const hasWildcard = perms.some(
      (p) => p.action === "*:*" || (p.action === "*" && p.resource === "*"),
    );
    assert(!hasWildcard, `no wildcard allow with tools=${JSON.stringify(tc.tools)}`);
  }
}

// ============================================================================
// Test: empty tools array → base permissions (same as absent)
// ============================================================================
{
  const perms = mapPermissions([]);
  const hasReadAllow = perms.some((p) => p.action.toLowerCase() === "read" && p.effect === "allow");
  const hasGrepAllow = perms.some((p) => p.action.toLowerCase() === "grep" && p.effect === "allow");
  assert(hasReadAllow, "empty tools → Read allowed (base permissions)");
  assert(hasGrepAllow, "empty tools → Grep allowed (base permissions)");
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n=== Results: ${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`} ===`);
if (failures > 0) process.exit(1);
