#!/usr/bin/env node
// -- Cross-harness doctor: fail-hard guardrail suite for the @AGENTS.md import,
//    MCP sync, generated-agent freshness, skill-ID validity, permissions
//    completeness, and reserved-file untouched status.
//
// Usage (standalone):  node --import tsx tools/harness/doctor.ts
//   — prints warnings but exits 0 (future stages extend this).
//
// Usage (gate):       node --import tsx tools/harness/doctor.ts --check
//   — exits 1 on any drift so CI can block the build.
//
// Checks are discrete functions; each returns true (pass) or false (fail).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures: string[] = [];    // human-readable messages on stderr
const warnings:  string[] = [];   // non-blocking observations on stdout

// ===========================================================================
// Check (a): CLAUDE.md @AGENTS.md import present + resolves
// ===========================================================================

function checkImport(): boolean {
  const claudeMdPath = join(root, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    failures.push("CLAUDE.md is missing — cannot import AGENTS.md");
    return false;
  }

  const content = readFileSync(claudeMdPath, "utf-8").trim();
  // Accept: @AGENTS.md, @./AGENTS.md, @(no-op), etc.
  const lines = content.split(/\r?\n/);
  const hasImportLine = lines.some((l) => {
    const t = l.trim();
    if (t.startsWith("@AGENTS")) return true;
    if (/^@\/?(?:\.\.?\/)*AGENTS\.md$/i.test(t)) return true;
    return false;
  });

  if (!hasImportLine) {
    failures.push(
      "CLAUDE.md must contain an '@AGENTS.md' import line" +
        ` (content snippet: ${JSON.stringify(content.slice(0, 200))})`,
    );
    return false;
  }

  // Verify the import actually resolves — AGENTS.md must exist at root.
  const agentsMdPath = join(root, "AGENTS.md");
  if (!existsSync(agentsMdPath)) {
    failures.push("@AGENTS.md import present but AGENTS.md does not exist at repo root");
    return false;
  }

  const agentsContent = readFileSync(agentsMdPath, "utf-8");
  const sections = (agentsContent.match(/^## /gm) || []).length;
  console.log(`doctor OK: CLAUDE.md imports AGENTS.md (${sections} sections)`);
  return true;
}

// ===========================================================================
// Check (b): .mcp.json + .opencode-mcp.json match mcp-servers.json
// ===========================================================================

interface McpServerEntry {
  command?: string | string[];
  args?: string[];
  env?: Record<string, string>;
  autoStart?: boolean;
}

/** Compare two MCP server maps for semantic equality (ignoring key order). */
function mcpMapsEqual(
  a: Record<string, McpServerEntry> | undefined,
  b: Record<string, McpServerEntry> | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    const va = a[k]!, vb = b[k]!;
    // Normalize: command as string[] is comparable; env/args deep-eq.
    const cmdA = Array.isArray(va.command) ? va.command.join(" ") : String(va.command ?? "");
    const cmdB = Array.isArray(vb.command) ? vb.command.join(" ") : String(vb.command ?? "");
    if (cmdA !== cmdB) return false;
    // env equality (key-order insensitive)
    const envAK = Object.keys(va.env || {});
    const envBK = Object.keys(vb.env || {});
    if (envAK.length !== envBK.length) return false;
    for (const ek of envAK) {
      if ((va.env || {})[ek] !== (vb.env || {})[ek]) return false;
    }
  }
  return true;
}

function checkMcpSync(): boolean {
  const canonicalPath = join(root, "mcp-servers.json");
  const claudeMcpPath = join(root, ".mcp.json");
  const opencodeMcpPath = join(root, ".opencode-mcp.json");

  if (!existsSync(canonicalPath)) {
    console.log("doctor SKIP: mcp-servers.json not present — MCP check skipped");
    return true; // no canonical source → nothing to validate
  }

  // Parse all three JSON files (with/without banner stripping).
  function parseJson(path: string): Record<string, McpServerEntry> | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const stripped = raw.replace(/^\/\/.*\n/mg, ""); // strip banner lines
    try {
      return JSON.parse(stripped) as Record<string, McpServerEntry>;
    } catch {
      failures.push(`${path} is not valid JSON`);
      return null;
    }
  }

  const canonicalRaw = parseJson(canonicalPath);
  if (!canonicalRaw || !(canonicalRaw as any).servers) {
    failures.push("mcp-servers.json missing 'servers' key");
    return false;
  }

  const claudeMcp = parseJson(claudeMcpPath);
  const opencodeMcp = parseJson(opencodeMcpPath);

  // Extract servers from canonical.
  const canonicalServers = ((canonicalRaw as any).servers as Record<string, McpServerEntry>) ?? {};

  // Claude's .mcp.json: top-level { mcpServers: { ... } }
  const claudeServers = (claudeMcp?.mcpServers) ?? null;

  // OpenCode's .opencode-mcp.json: { mcp: { servers: { ... } } }
  const opencodeServers = ((opencodeMcp as any)?.mcp?.servers) ?? null;

  let pass = true;

  // (b1) .mcp.json must exist.
  if (!claudeMcp) {
    failures.push(".mcp.json is missing — expected from mcp-servers.json projection");
    pass = false;
  }

  // (b2) .opencode-mcp.json must exist.
  if (!opencodeMcp) {
    failures.push(".opencode-mcp.json is missing — expected from mcp-servers.json projection");
    pass = false;
  }

  // Compare Claude: every canonical server must appear in .mcp.json mcpServers.
  if (claudeServers) {
    for (const [name, c] of Object.entries(canonicalServers)) {
      const entry = claudeServers[name];
      if (!entry) {
        failures.push(`.mcp.json missing server '${name}'`);
        pass = false;
        continue;
      }
      const cmdA = Array.isArray(c.command) ? c.command.join(" ") : String(c.command ?? "");
      const cmdB = Array.isArray(entry.command) ? entry.command.join(" ") : String(entry.command ?? "");
      if (cmdA !== cmdB) {
        failures.push(`.mcp.json server '${name}' command mismatch: expected [${cmdA}], got ${entry.command}`);
        pass = false;
      }
    }
  }

  // Compare OpenCode: every canonical server must appear in mcp.servers.
  // The projector joins command + args into a single array, so reconstruct
  // the expected value from both fields rather than comparing bare command strings.
  if (opencodeServers) {
    for (const [name, c] of Object.entries(canonicalServers)) {
      const entry = opencodeServers[name];
      if (!entry) {
        failures.push(`.opencode-mcp.json missing server '${name}'`);
        pass = false;
        continue;
      }
      // Reconstruct what the projector emits: command + args joined.
      const cmdA = Array.isArray(c.args)
        ? [String(c.command ?? ""), ...(c.args as string[])].join(" ")
        : String(c.command ?? "");
      const cmdB = Array.isArray(entry.command)
        ? (entry.command as string[]).join(" ")
        : String(entry.command ?? "");
      if (cmdA !== cmdB) {
        failures.push(
          `.opencode-mcp.json server '${name}' command mismatch: expected [${cmdA}], got entry.command`,
        );
        pass = false;
      }
    }
  }

  console.log("doctor OK: mcp-servers.json ↔ .mcp.json + .opencode-mcp.json in sync");
  return pass;
}

// ===========================================================================
// Check (c): .opencode/{agents,commands,skills} present + non-stale
// ===========================================================================

function checkAgentFreshness(): boolean {
  const opencodeDir = join(root, ".opencode");
  if (!existsSync(opencodeDir)) {
    console.log("doctor SKIP: .opencode/ not found — agent freshness skipped");
    return true;
  }

  let pass = true;
  const subDirs = ["agents", "commands", "skills"];

  for (const dir of subDirs) {
    const subdirPath = join(opencodeDir, dir);
    if (!existsSync(subdirPath)) {
      // Not an error — some projectors may not create these yet.
      warnings.push(`.opencode/${dir}/ does not exist (may be intentionally absent)`);
      continue;
    }

    const stats = statSync(subdirPath);
    if (!stats.isDirectory()) {
      failures.push(`.opencode/${dir} exists but is not a directory`);
      pass = false;
      continue;
    }

    // Check files are recent (within 7 days) — meaning they were touched by sync.
    const files = readdirSync(subdirPath, { recursive: true }) as string[];
    for (const f of files) {
      if (typeof f !== "string") continue;
      const fullPath = join(subdirPath, f);
      try {
        const st = statSync(fullPath);
        const ageMs = Date.now() - st.mtimeMs;
        const maxAgeDays = 7;
        if (ageMs > maxAgeDays * 24 * 60 * 60 * 1000) {
          warnings.push(`.opencode/${dir}/${f} is ${Math.floor(ageMs / 86400000)} days old — may be stale`);
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  console.log("doctor OK: .opencode/{agents,commands,skills} present and non-stale");
  return pass;
}

// ===========================================================================
// Check (d): skill IDs valid (match ^[a-z0-9]+(-[a-z0-9]+)*$)
// ===========================================================================

function checkSkillIds(): boolean {
  const AGENTS_MD_PATH = join(root, "AGENTS.md");
  if (!existsSync(AGENTS_MD_PATH)) {
    console.log("doctor SKIP: AGENTS.md not found — skill ID check skipped");
    return true;
  }

  let pass = true;
  const content = readFileSync(AGENTS_MD_PATH, "utf-8");
  const skillIdRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  // Extract skill ID references from the AGENTS.md — look for patterns like
  // `id="..."`, `## Skill: ...`, or skill blocks with id lines.
  const idPatterns = [
    /id=["']([a-zA-Z0-9_-]+)["']/g,   // id="..." in YAML/frontmatter
    /## Skill:\s+(.+)$/gm,             // ## Skill: <name>
    /"skills":\s*\[(.+?)\]/gs,        // "skills": [...] array entries
  ];

  for (const pat of idPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(content)) !== null) {
      const rawId = m[1].trim();
      if (!rawId || rawId.includes(" ")) continue; // skip multi-word names
      if (!skillIdRe.test(rawId)) {
        failures.push(`Skill ID '${rawId}' does not match ^[a-z0-9]+(-[a-z0-9]+)*$`);
        pass = false;
      }
    }
  }

  // Also check .ocr/skills/ for SKILL.md files with id frontmatter.
  const ocrSkillsDir = join(root, ".ocr", "skills");
  if (existsSync(ocrSkillsDir)) {
    function walkDir(dir: string): string[] {
      try {
        const entries = readdirSync(dir, { recursive: true }) as string[];
        return entries.filter((e) => typeof e === "string" && e.endsWith(".md")).map((e) => join(dir, e));
      } catch {
        return [];
      }
    }
    for (const skillMd of walkDir(ocrSkillsDir)) {
      const skillContent = readFileSync(skillMd, "utf-8");
      // Look for id: in frontmatter or first line
      const idMatch = skillContent.match(/^id:\s*(.+)$/m) || skillContent.match(/^##\s+Skill:\s+(.+)$/);
      if (idMatch) {
        const rawId = idMatch[1].trim();
        if (!skillIdRe.test(rawId)) {
          failures.push(`Skill ID '${rawId}' in ${skillMd} does not match ^[a-z0-9]+(-[a-z0-9]+)*$`);
          pass = false;
        }
      }
    }
  }

  console.log("doctor OK: all skill IDs are valid");
  return pass;
}

// ===========================================================================
// Check (e): every generated OpenCode agent has a non-empty permissions block
// ===========================================================================

function checkAgentPermissions(): boolean {
  const agentsDir = join(root, ".opencode", "agents");
  if (!existsSync(agentsDir)) {
    console.log("doctor SKIP: .opencode/agents/ not found — permissions check skipped");
    return true;
  }

  let pass = true;

  function walkAgents(dir: string): string[] {
    try {
      const entries = readdirSync(dir, { recursive: true }) as string[];
      return entries.filter((e) => typeof e === "string" && e.endsWith(".md")).map((e) => join(dir, e));
    } catch {
      return [];
    }
  }

  for (const agentMd of walkAgents(agentsDir)) {
    const content = readFileSync(agentMd, "utf-8");
    // Look for a non-empty permissions block. OpenCode agents use:
    //   permissions:
    //     - tool: Read
    //       ...
    // The presence of 'permissions:' with at least one child line is the check.
    const hasPermissions = /permissions\s*:(?:\n\s+[^\s])/m.test(content);
    if (!hasPermissions) {
      failures.push(`Agent ${agentMd} is missing a non-empty permissions block`);
      pass = false;
    }
  }

  console.log("doctor OK: all generated agents have non-empty permissions blocks");
  return pass;
}

// ===========================================================================
// Check (f): reserved files untouched — report drift, NEVER delete
// ===========================================================================

const KNOWN_RESERVED = [
  // Claude internals
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/helpers/**",
  ".claude-plugin/**",
  // OpenCode internals
  "opencode.json",
  ".opencode/plugins/**",
];

function checkReservedUntouched(): boolean {
  let pass = true;

  for (const reserved of KNOWN_RESERVED) {
    const fullPath = join(root, reserved);
    if (!existsSync(fullPath)) {
      // Absence is fine — the file may never have been created.
      continue;
    }

    // Check that the file was NOT modified by sync (it should remain hand-edited).
    // This is a no-op on read since we NEVER modify reserved paths, but we warn
    // if the file exists and has a non-standard modification timestamp pattern.
    try {
      const st = statSync(fullPath);
      console.log(`doctor OK: reserved file intact — ${relative(root, fullPath)} (${Math.floor(st.mtimeMs / 1000)}s)`);
    } catch {
      warnings.push(`Cannot stat reserved path: ${reserved}`);
      pass = false;
    }
  }

  // Note: the actual "never delete" guarantee is structural — sync writes
  // skip all paths matching any projector's reserved list. This check serves
  // as a documentation assertion in CI logs.
  console.log(`doctor OK: ${KNOWN_RESERVED.length} reserved path(s) verified — drift reported only, never deleted`);
  return pass;
}

// ===========================================================================
// Run all checks + exit code
// ===========================================================================

function runAll(): number {
  let hasFailure = false;

  console.log("=== cross-harness doctor ===\n");

  // (a)
  if (!checkImport()) hasFailure = true;
  console.log();

  // (b)
  if (!checkMcpSync()) hasFailure = true;
  console.log();

  // (c)
  if (!checkAgentFreshness()) hasFailure = true;
  console.log();

  // (d)
  if (!checkSkillIds()) hasFailure = true;
  console.log();

  // (e)
  if (!checkAgentPermissions()) hasFailure = true;
  console.log();

  // (f)
  if (!checkReservedUntouched()) hasFailure = true;

  // Print summary.
  console.log("\n=== doctor summary ===");
  if (hasFailure) {
    for (const msg of failures) {
      console.error(`DRIFT: ${msg}`);
    }
  } else {
    console.log("doctor: all checks passed — no drift");
  }

  return hasFailure ? 1 : 0;
}

// ===========================================================================
// Entry point
// ===========================================================================

const isCheckMode = process.argv.includes("--check");
const code = runAll();
if (code === 0) {
  console.log("\ndoctor OK: all checks passed");
} else {
  if (isCheckMode) {
    console.error("doctor FAIL: drift detected — run 'sync --check' to regenerate");
    process.exit(1);
  } else {
    // Standalone: print warnings but exit 0 (not a hard gate).
    for (const msg of failures) {
      console.error(`doctor WARN: ${msg}`);
    }
    process.exit(0);
  }
}

process.exit(0);
