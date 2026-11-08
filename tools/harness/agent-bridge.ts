// -- Agent Bridge: converts .claude/agents/**/*.md → .opencode/agents/**/*.md
//
// Stage 5 of the cross-harness sync plan.
// Reads Claude agent sources, maps frontmatter to OpenCode format,
// emits banner-stamped .opencode/agents/** output.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

// ===========================================================================
// Types
// ===========================================================================

/** Minimal shape of a Claude agent's YAML-style frontmatter. */
export interface ClaudeAgentFrontmatter {
  name?: string;
  type?: string;
  color?: string;
  description?: string;
  tools?: string[]; // [Read, Grep, ...] — absent → least-privilege
  maxTurns?: number;
  capabilities?: string[]; // Claude-only; IGNORED in output
}

/** Artifact emitted for each agent. */
export interface AgentArtifact {
  relPath: string; // e.g. ".opencode/agents/core/reviewer.md"
  content: string;   // .md file content
}

// All known dangerous OpenCode actions — always deny unless explicitly allowed.
const DANGEROUS_ACTIONS = [
  "Edit",
  "Shell",
  "Subagent",
  "Write",
  "MultiEdit",
  "Browser",
  "Fetch",
] as const;
type DangerousAction = (typeof DANGEROUS_ACTIONS)[number];

// ===========================================================================
// Claude agent YAML frontmatter parsing (no external dependency)
// ===========================================================================

/**
 * Parse the `---` delimited YAML-style frontmatter from a Claude agent .md.
 * Handles scalar fields, simple arrays, and nested key-value blocks.
 */
export function parseFrontmatter(md: string): ClaudeAgentFrontmatter {
  const trimmed = md.trimStart();
  const openIdx = trimmed.indexOf("---");
  if (openIdx < 0) return {};

  const bodyStart = openIdx + 3;
  const closeIdx = trimmed.indexOf("---", bodyStart);
  if (closeIdx < 0) return {};

  const raw = trimmed.slice(bodyStart, closeIdx).trim();
  const fm: ClaudeAgentFrontmatter = {};

  let i = 0;
  while (i < raw.length) {
    // Find next key line (skip blank/comment lines)
    const lineStart = raw.indexOf("\n", i);
    const endIdx = lineStart === -1 ? raw.length : lineStart;
    const lineText = raw.slice(i, endIdx).trim();

    if (!lineText || lineText.startsWith("#")) {
      i = endIdx + 1;
      continue;
    }

    // Scalar: `key: value`
    const scalarMatch = lineText.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (scalarMatch) {
      const [, key, val] = scalarMatch;
      const cleaned = val.replace(/^["']|["']$/g, "").trim();
      (fm as Record<string, unknown>)[key] = cleaned || undefined;
      i = endIdx + 1;
      continue;
    }

    // List key: `key:` followed by `- item` lines
    const listMatch = lineText.match(/^(\w[\w-]*)\s*:\s*$/);
    if (listMatch) {
      const [, key] = listMatch;
      const items: string[] = [];
      let j = endIdx + 1;
      while (j < raw.length) {
        const nl = raw.indexOf("\n", j);
        const nextEnd = nl === -1 ? raw.length : nl;
        const nextLine = raw.slice(j, nextEnd).trimStart();
        if (nextLine.startsWith("- ")) {
          items.push(
            nextLine
              .slice(2)
              .replace(/^["']|["']$/g, "")
              .trim(),
          );
          j = nextEnd + 1;
        } else break;
      }
      if (items.length > 0) {
        (fm as Record<string, unknown>)[key] = items;
      }
      i = j;
      continue;
    }

    i = endIdx + 1;
  }

  return fm;
}

// ===========================================================================
// Permission mapping (CRITICAL per D3)
// ===========================================================================

/**
 * Map Claude `tools` → OpenCode permissions.
 *
 * Rules:
 *   - Explicitly allow the listed tools.
 *   - Explicitly deny ALL dangerous actions not in the allowlist.
 *   - Empty/absent `tools` → least-privilege block (only Read + Grep).
 *   - NEVER emit `*:* allow`.
 */
export function mapPermissions(
  tools?: string[],
): Array<{ action: string; resource: string; effect: "allow" | "deny" }> {
  const allowed = new Set<string>();

  if (tools && tools.length > 0) {
    for (const t of tools) {
      allowed.add(normalizeToolName(t));
    }
  } else {
    // Empty/absent → explicit least-privilege: Read + Grep only.
    allowed.add("Read");
    allowed.add("Grep");
  }

  const perms: Array<{ action: string; resource: string; effect: "allow" | "deny" }> = [];

  // 1. Allow listed actions
  for (const tool of allowed) {
    const lower = tool.toLowerCase();
    if (lower === "read") {
      perms.push({ action: "Read", resource: "*", effect: "allow" });
    } else if (lower === "grep") {
      perms.push({ action: "Grep", resource: "*", effect: "allow" });
    } else {
      // Generic allow for any other tool type (e.g., Edit)
      perms.push({ action: lower, resource: "*", effect: "allow" });
    }
  }

  // 2. Explicitly deny all dangerous actions NOT in the allowlist
  for (const action of DANGEROUS_ACTIONS) {
    if (!allowed.has(action) && !allowed.has(action.toLowerCase())) {
      perms.push({ action, resource: "*", effect: "deny" });
    }
  }

  return perms;
}

function normalizeToolName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9]/g, "");
}

// ===========================================================================
// Curation allowlist
// ===========================================================================

/**
 * Curated agents that OCR's workflow actually invokes by default.
 * Edit this set to narrow the projection; `--all` flag includes every agent.
 */
const CURATED_AGENTS = new Set([
  "reviewer",
  "coder",
  "planner",
  "tester",
  "researcher",
  "doctor",
]);

/** Check if an agent name should be included in the default (curated) projection. */
export function isCurated(name: string | undefined): boolean {
  if (!name) return false;
  return CURATED_AGENTS.has(normalizeToolName(name));
}

// ===========================================================================
// OpenCode agent frontmatter generation
// ===========================================================================

/** Map Claude `type` → OpenCode `mode`. Falls back to "validator". */
const MODE_MAP: Record<string, string> = {
  validator: "validator",
  developer: "developer",
  coordinator: "coordinator",
  analyst: "analyst",
  editor: "editor",
};

/**
 * Build the OpenCode agent .md file content from a parsed Claude frontmatter
 * plus the raw source body. Optionally accepts an explicit output relPath
 * (e.g. ".opencode/agents/core/reviewer.md") for nested directory preservation.
 */
export function buildOpenCodeAgent(
  fm: ClaudeAgentFrontmatter,
  sourceContent: string,
  outRelPath?: string, // e.g. ".opencode/agents/core/reviewer.md"
): AgentArtifact {
  const name = (fm.name || "agent").replace(/[^a-zA-Z0-9_-]/g, "");
  const mode = MODE_MAP[fm.type ?? ""] || "validator";
  const color = fm.color ?? null;
  const description = fm.description || `${name} agent`;
  const tools = fm.tools as string[] | undefined;
  const maxTurns = fm.maxTurns;

  // Build the permissions block
  const perms = mapPermissions(tools);

  // Extract body (everything after the frontmatter closing ---)
  const body = extractBody(sourceContent);

  // Build .md file content with YAML frontmatter + body
  const parts: string[] = [];
  parts.push("---");
  parts.push(`description: "${escapeYaml(description)}"`);
  parts.push(`mode: ${mode}`);

  if (fm.model) {
    parts.push(`model: "${escapeYaml(String(fm.model))}"`);
  } else {
    parts.push("model: null");
  }

  // Emit explicit permissions — always, never skip.
  // Single `permissions:` block with all entries in one array.
  parts.push("permissions:");
  for (const p of perms) {
    const act = capitalizeAction(p.action);
    parts.push(`  - action: "${act}"`);
    parts.push(`    resource: "${p.resource}"`);
    parts.push(`    effect: ${p.effect}`);
  }

  if (color) {
    parts.push(`color: "${color}"`);
  }
  if (typeof maxTurns === "number" && maxTurns > 0) {
    parts.push(`steps: ${maxTurns}`);
  }
  parts.push("hidden: false");
  parts.push("---");
  parts.push("");
  parts.push(body);

  // Use provided relPath or flatten to name-based path.
  const relPath = outRelPath || `.opencode/agents/${name}.md`;

  return {
    relPath,
    content: parts.join("\n"),
  };
}

/** Extract body text after the closing `---` frontmatter fence. */
function extractBody(sourceContent: string): string {
  const trimmed = sourceContent.trimStart();
  const openIdx = trimmed.indexOf("---");
  if (openIdx < 0) return "";
  const closeIdx = trimmed.indexOf("---", openIdx + 3);
  if (closeIdx < 0) return trimmed.slice(openIdx).trimStart();
  return trimmed.slice(closeIdx + 3).trimStart();
}

/** Capitalize a permission action for OpenCode output. */
function capitalizeAction(action: string): string {
  // Keep known all-caps / TitleCase forms as-is; otherwise TitleCase.
  if (/^[A-Z][a-z]+$/.test(action) || /^[A-Z]+$/i.test(action)) return action;
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Escape a string for YAML double-quoted value. */
function escapeYaml(s: string): string {
  return s
    // Must be first — handle backslash before anything else
    .replace(/\\/g, "\\\\")
    // Then all special characters that need escaping in YAML double quotes
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"')
    .replace(/\0/g, "\\0");
}

// ===========================================================================
// Sync entry: walk .claude/agents/** and project
// ===========================================================================

export interface AgentBridgeOptions {
  /** Absolute path to the repo root. */
  root: string;
  /** When true, include ALL agents; when false, only curated ones. */
  all?: boolean;
}

/**
 * Walk .claude/agents/** for .md files, project each as an OpenCode agent,
 * and return artifacts ready for writeGenerated().
 */
export function getAgentArtifacts(opts: AgentBridgeOptions): Array<{
  relPath: string; // e.g. ".opencode/agents/core/reviewer.md"
  content: string;
}> {
  const { root, all } = opts;
  const agentsSrcDir = join(root, ".claude", "agents");

  try {
    statSync(agentsSrcDir);
  } catch {
    return []; // .claude/agents doesn't exist → nothing to project
  }

  const artifacts: Array<{ relPath: string; content: string }> = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        // Read and parse.
        const content = readFileSync(fullPath, "utf-8");
        const fm = parseFrontmatter(content);
        const agentName = fm.name || entry.name.replace(".md", "");

        // Curate check.
        if (!all && !isCurated(agentName)) continue;

        // Compute output path preserving nested directory structure.
        // .claude/agents/core/reviewer.md → .opencode/agents/core/reviewer.md
        const relFromAgents = relative(agentsSrcDir, fullPath);
        const outRelPath = join(".opencode", "agents", relFromAgents);

        // Build the OpenCode artifact with the correct output path.
        const agentArtifact = buildOpenCodeAgent(fm, content, outRelPath);

        artifacts.push({
          relPath: agentArtifact.relPath,
          content: agentArtifact.content,
        });
      }
    }
  }

  walk(agentsSrcDir);
  return artifacts;
}
