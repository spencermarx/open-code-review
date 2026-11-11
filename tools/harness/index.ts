#!/usr/bin/env node
// -- Cross-harness sync orchestrator.
// Usage: node --import tsx tools/harness/index.ts [--check] [--dry-run] [--all]
//
// Runs all enabled projectors over canonical sources, writes generated files,
// and supports --check (fail on stale), --dry-run (show expected without
// writing), and --all (include all agents in agent-bridge projection).

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { HarnessProjector } from "./adapter";
import { writeGenerated, readGenerated } from "./adapter";
import { McpProjector } from "./mcp";
import { OpenCodeConfigProjector } from "./opencode";
import { getAgentArtifacts } from "./agent-bridge";
import { WindsurfAdapter } from "./adapters/windsurf";

const root = process.cwd();

// ===========================================================================
// Helpers
// ===========================================================================

/** Normalization: strip trailing whitespace, append exactly one \n. */
function normalize(c: string): string {
  return c.replace(/\s+$/, "") + "\n";
}

/** Argument parsing for --check / --dry-run / --all. */
function parseArgs(): { check: boolean; dryRun: boolean; all: boolean } {
  const args = process.argv.slice(2);
  return {
    check: args.includes("--check"),
    dryRun: args.includes("--dry-run"),
    all: args.includes("--all"),
  };
}

// ===========================================================================
// Projector orchestration — run ALL enabled projectors over ALL sources
// ===========================================================================

/** Run the MCP projector and collect artifacts. */
function runMcpProjector(): Map<string, string> {
  const mcpServersPath = join(root, "mcp-servers.json");
  if (!existsSync(mcpServersPath)) return new Map();

  const serversRaw = JSON.parse(
    readFileSync(mcpServersPath, "utf-8"),
  ) as Record<string, unknown>;
  const servers = (serversRaw.servers ?? {}) as Record<string, unknown>;
  const projector = new McpProjector();

  // project() returns NativeArtifact[] — iterate directly.
  return projector.project(servers).reduce((map, art) => {
    if (!art.path || !art.content) return map;
    // Skip reserved paths (e.g., .mcp.json is always reserved).
    if (art.path === ".mcp.json" && art.content.startsWith("// This file")) {
      console.error(`SYNC SKIP reserved: ${art.path}`);
      return map;
    }
    map.set(art.path, art.content);
    return map;
  }, new Map<string, string>());
}

/** Run the OpenCode config projector and collect artifacts. */
function runOpenCodeConfigProjector(): Map<string, string> {
  try {
    const mcpServersPath = join(root, "mcp-servers.json");
    if (!existsSync(mcpServersPath)) return new Map();

    const serversRaw = JSON.parse(
      readFileSync(mcpServersPath, "utf-8"),
    ) as Record<string, unknown>;
    const servers = (serversRaw.servers ?? {}) as Record<string, unknown>;
    const projector = new OpenCodeConfigProjector();
    return projector.project(servers);
  } catch (err) {
    console.error(
      `SYNC ERROR opencode config: ${(err as Error).message}`,
    );
    return new Map();
  }
}

/** Run the agent bridge and collect artifacts. */
function runAgentBridge(): Array<{ relPath: string; content: string }> {
  try {
    return getAgentArtifacts({ root, all: parseArgs().all });
  } catch (err) {
    console.error(`SYNC ERROR agent bridge: ${(err as Error).message}`);
    return [];
  }
}

/** Run the Windsurf adapter and collect artifacts. */
function runWindsurfAdapter(): Map<string, string> {
  const adp = new WindsurfAdapter();
  try {
    const artifacts = adp.project({});
    return artifacts.reduce((map, art) => {
      if (!art.path || !art.content) return map;
      // Skip reserved paths (e.g., .windsurfrules is hand-owned).
      const isReserved = adp.reserved.some(
        (r) => art.path === r || art.path.startsWith(r.replace(/\*\*$/, "")),
      );
      if (isReserved) {
        console.log(`SYNC SKIP reserved: ${art.path}`);
        return map;
      }
      map.set(art.path, art.content);
      return map;
    }, new Map<string, string>());
  } catch (err) {
    console.error(`SYNC ERROR windsurf adapter: ${(err as Error).message}`);
    return new Map();
  }
}

// ===========================================================================
// Full orchestrator — run projectors + write/dry-run/check
// ===========================================================================

/** Run ALL enabled projectors over ALL canonical sources. */
async function produceAll(): Promise<Map<string, string>> {
  const results = new Map<string, string>(); // path → expected content

  console.log("sync: loading projectors…");

  // (1) MCP projector — reads mcp-servers.json → .mcp.json + .opencode-mcp.json
  const mcpArtifacts = runMcpProjector();
  for (const [path, content] of mcpArtifacts) {
    results.set(path, content);
  }
  console.log(`sync: ✓ mcp projector (${mcpArtifacts.size} artifacts)`);

  // (2) OpenCode config projector — reads mcp-servers.json + reserved overlay
  const ocArtifacts = runOpenCodeConfigProjector();
  for (const [path, content] of ocArtifacts) {
    results.set(path, content);
  }
  console.log(
    `sync: ✓ opencode config projector (${ocArtifacts.size} artifacts)`,
  );

  // (3) Agent bridge — .claude/agents/** → .opencode/agents/**
  const agentArtifacts = runAgentBridge();
  for (const art of agentArtifacts) {
    results.set(art.relPath, art.content);
  }
  console.log(`sync: ✓ agent bridge (${agentArtifacts.length} artifacts)`);

  // (4) Windsurf adapter — AGENTS.md → .windsurfrules
  const wsArtifacts = runWindsurfAdapter();
  for (const [path, content] of wsArtifacts) {
    results.set(path, content);
  }
  console.log(`sync: ✓ windsurf adapter (${wsArtifacts.size} artifacts)`);

  // Summary
  console.log(
    `sync: done loading ${results.size} total artifact(s)`,
  );

  return results;
}

/** Write all non-reserved artifacts to disk. Returns { written, skipped, errors }. */
function writeArtifacts(
  artifacts: Map<string, string>,
): { written: number; skipped: string[]; errors: string[] } {
  let written = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const [path, content] of artifacts) {
    try {
      writeGenerated(root, path, content);
      written++;
    } catch (err) {
      errors.push(`${path}: ${(err as Error).message}`);
    }
  }

  return { written, skipped, errors };
}

/** Run the full sync: produce → write/check/dry-run. */
async function main(): Promise<number> {
  const opts = parseArgs();

  console.log(
    `sync${opts.check ? " --check" : ""}${opts.dryRun ? " --dry-run" : ""}: running cross-harness sync…`,
  );

  // Phase 1: produce expected artifacts from ALL projectors + projections
  const artifacts = await produceAll();

  // --- Command projection: .ocr/commands/* → .opencode/commands/ocr/* ---
  // OpenCode uses slash notation (/ocr/review) vs Claude's colon notation (/ocr:review).
  const ocrCommandsDir = join(root, ".ocr", "commands");
  if (existsSync(ocrCommandsDir)) {
    const commandsFiles = readdirSync(ocrCommandsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();

    for (const cmdFile of commandsFiles) {
      const commandName = cmdFile.replace(".md", "");
      const pointerContent = [
        `<!-- $REF: .ocr/commands/${cmdFile} -->`,
        `# /ocr/${commandName}`,
        "",
        "Pointer to the canonical OCR command. Slash notation (`/ocr/${commandName}`)",
        "maps to Claude's colon notation (`/ocr:${commandName}`).",
      ].join("\n");
      artifacts.set(
        `.opencode/commands/ocr/${cmdFile}`,
        pointerContent,
      );
    }
  }

  // --- Skill mirroring: .ocr/skills/* → .opencode/skills/ocr/* ---
  const ocrSkillsDir = join(root, ".ocr", "skills");
  if (existsSync(ocrSkillsDir)) {
    function collectFiles(
      src: string,
      relPrefix: string,
    ): Array<[string, string]> {
      let files: Array<[string, string]> = [];
      for (const entry of readdirSync(src)) {
        const srcPath = join(src, entry);
        const fileStat = statSync(srcPath);
        if (fileStat.isDirectory()) {
          files.push(
            ...collectFiles(srcPath, relPrefix + entry + "/"),
          );
        } else {
          const content = readFileSync(srcPath, "utf-8");
          files.push([relPrefix + entry, content]);
        }
      }
      return files;
    }

    const mirrorEntries = collectFiles(ocrSkillsDir, "");
    for (const [relName, content] of mirrorEntries) {
      artifacts.set(`.opencode/skills/ocr/${relName}`, content);
    }
  }

  // Phase 2a (--dry-run): compute and show diffs, do NOT write
  if (opts.dryRun) {
    console.log(
      `\n[DRY RUN] ${artifacts.size} artifact(s) would be produced:\n`,
    );
    for (const [path, expected] of artifacts) {
      const absPath = join(root, path);
      const exists = existsSync(absPath);
      const raw = exists ? readFileSync(absPath, "utf-8") : "";
      // Normalize both: strip trailing whitespace + append \n.
      // If normalized(raw) === normalize(expected), file is up-to-date.
      const diffLine =
        normalize(raw) === normalize(expected)
          ? "  up-to-date"
          : `  STALE — expected ${expected.length} bytes, found ${raw.length}`;
      console.log(`  [${diffLine}] ${path}`);
    }
    console.log("\n[DRY RUN] no files written");
    return 0;
  }

  // Phase 2b (--check): compare disk against expected WITHOUT writing.
  // Uses normalize() to ensure both values are in the same format
  // (stripped + final \n), making comparison stable regardless of how
  // many trailing newlines were in the source.
  if (opts.check) {
    let anyStale = false;
    for (const [path, expected] of artifacts) {
      const absPath = join(root, path);
      const exists = existsSync(absPath);
      const raw = exists ? readFileSync(absPath, "utf-8") : "";
      // normalize(raw) === normalize(expected) ensures both are in the same
      // format (stripped + exactly one trailing \n).
      const stale = normalize(raw) !== normalize(expected);

      if (stale) {
        console.error(`sync --check STALE: ${path}`);
        anyStale = true;
      } else {
        console.log(`sync --check OK: ${path}`);
      }
    }

    if (anyStale) {
      console.error("sync --check: some projections are stale");
      return 1;
    }
    console.log(
      `sync --check: all ${artifacts.size} artifact(s) up to date`,
    );
    return 0;
  }

  // Phase 2c (normal write mode): produce and write to disk
  const { written, skipped, errors } = writeArtifacts(artifacts);

  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`sync: SKIP reserved ${s}`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`sync ERROR: ${e}`);
    }
    return 1;
  }

  console.log(`sync: done (${written} artifacts written)`);
  return 0;
}

// ===========================================================================
// Entry point
// ===========================================================================

const code = main().then((c) => process.exit(c));
