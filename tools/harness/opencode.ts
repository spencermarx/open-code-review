// -- OpenCode config surface projector.
// Generates opencode.json by merging generated keys from mcp-servers.json
// with hand-authored reserved keys from .opencode/opencode.reserved.jsonc.
// Reserved keys win on conflict; no key is dropped from either side.

import type { HarnessProjector } from "./adapter.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Strip // and /* */ comments from JSONC to produce parseable JSON.
function stripJsonc(raw: string): string {
  return raw
    .replace(/\/\/.*$/gm, "")           // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " "); // block comments
}

// Deep-merge source into target. Source wins on conflicts; never drops keys.
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const isObj = (v: unknown) =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    if (
      value &&
      result[key] &&
      isObj(value) &&
      isObj(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = value; // reserved wins
    }
  }
  return result;
}

// Build the generated config surface from mcp-servers.json.
function buildGenerated(mcpServers: Record<string, unknown>): Record<string, unknown> {
  const opencodeMcp: Record<string, unknown> = {};

  for (const [name, cfg] of Object.entries(mcpServers)) {
    const c = cfg as Record<string, unknown>;
    const args = Array.isArray(c.args) ? (c.args as string[]) : [];
    const command = c.command ? [String(c.command), ...args] : [...args];
    opencodeMcp[name] = {
      type: "remote",
      command,
      environment:
        typeof c.env === "object" && c.env !== null
          ? (c.env as Record<string, string>)
          : {},
      disabled: c.autoStart !== true,
    };
  }

  return {
    $schema: "https://opencode.ai/config/v1/schema.json",
    instructions: ["AGENTS.md"],
    mcp: { servers: opencodeMcp },
    agents: {},
    commands: ".opencode/commands",
    skills: [".claude/skills"],
  };
}

// The OpenCode config projector. Reads mcp-servers.json (canonical) and
// .opencode/opencode.reserved.jsonc (hand-authored overlay), deep-merges them,
// and produces a single opencode.json.
export class OpenCodeConfigProjector implements HarnessProjector {
  id = "opencode-config";
  reserved = [".opencode/opencode.reserved.jsonc", ".opencode/plugins/**"];

  project(mcpServers: Record<string, unknown>): Map<string, string> {
    // Build generated config from mcp-servers.json (passed in by index.ts)
    const generated = buildGenerated(mcpServers);

    // Read reserved overlay from disk (hand-authored)
    const cwd = process.cwd();
    const reservedPath = join(cwd, ".opencode/opencode.reserved.jsonc");
    let reserved: Record<string, unknown> = {};
    if (existsSync(reservedPath)) {
      const reservedRaw = readFileSync(reservedPath, "utf-8");
      reserved = JSON.parse(stripJsonc(reservedRaw)) as Record<string, unknown>;
    }

    // Deep merge: reserved wins on conflict, never drops keys from either side
    const merged = deepMerge(generated, reserved);

    return new Map([
      ["opencode.json", JSON.stringify(merged, null, 2)],
    ]);
  }
}
