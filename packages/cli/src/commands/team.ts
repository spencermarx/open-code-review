/**
 * OCR Team Command
 *
 * Reads and writes the team composition stored at `.ocr/config.yaml >
 * default_team`. The AI calls `ocr team resolve` in Phase 4 of the
 * review workflow to learn which reviewers to spawn and which model
 * each instance should run on. The dashboard's team panel uses
 * `ocr team set` to persist user-edited compositions.
 *
 * Subcommands:
 *   resolve  — Print the resolved ReviewerInstance[] (human or JSON)
 *   set      — Persist a new ReviewerInstance[] (JSON on stdin) to config.yaml
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  parseDocument,
  isMap,
  isScalar,
  Scalar,
  type Pair,
  type YAMLMap,
} from "yaml";
import { requireOcrSetup } from "../lib/guards.js";
import {
  loadTeamConfig,
  resolveTeamComposition,
  type ReviewerInstance,
} from "../lib/team-config.js";
import { generateReviewersMeta } from "../lib/installer.js";

// ── Helpers ──

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

function fail(message: string): never {
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
}

function parseSessionOverride(raw: string): ReviewerInstance[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(
      `--session-override could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    fail("--session-override must be a JSON array of ReviewerInstance objects");
  }
  const result: ReviewerInstance[] = [];
  for (const entry of parsed as unknown[]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail("Each session-override entry must be an object");
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj["persona"] !== "string") {
      fail("Each session-override entry must have a string 'persona'");
    }
    if (
      typeof obj["instance_index"] !== "number" ||
      !Number.isInteger(obj["instance_index"]) ||
      obj["instance_index"] < 1
    ) {
      fail("Each session-override entry must have integer 'instance_index' >= 1");
    }
    if (typeof obj["name"] !== "string") {
      fail("Each session-override entry must have a string 'name'");
    }
    const model = obj["model"];
    if (model !== null && typeof model !== "string") {
      fail("Session-override 'model' must be a string or null");
    }
    result.push({
      persona: obj["persona"] as string,
      instance_index: obj["instance_index"] as number,
      name: obj["name"] as string,
      model: (model as string | null) ?? null,
    });
  }
  return result;
}

// ── resolve ──

const resolveSubcommand = new Command("resolve")
  .description("Resolve and print the team composition for the active workspace")
  .option(
    "--session-override <json>",
    "JSON array of ReviewerInstance overrides applied on top of disk config",
  )
  .option("--session-override-stdin", "Read --session-override JSON from stdin")
  .option("--json", "Emit JSON for programmatic consumption (the AI workflow uses this)")
  .action(
    async (options: {
      sessionOverride?: string;
      sessionOverrideStdin?: boolean;
      json?: boolean;
    }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);
      const ocrDir = join(targetDir, ".ocr");

      try {
        const { team } = loadTeamConfig(ocrDir);

        let override: ReviewerInstance[] | undefined;
        if (options.sessionOverride) {
          override = parseSessionOverride(options.sessionOverride);
        } else if (options.sessionOverrideStdin) {
          const raw = await readStdin();
          if (raw.length > 0) {
            override = parseSessionOverride(raw);
          }
        }

        const resolved = resolveTeamComposition(team, override);

        if (options.json) {
          console.log(JSON.stringify(resolved, null, 2));
          return;
        }

        if (resolved.length === 0) {
          console.log(chalk.dim("No team composition resolved (default_team is empty or absent)."));
          return;
        }

        console.log(chalk.bold("Resolved team composition"));
        for (const inst of resolved) {
          const model = inst.model ?? chalk.dim("(default)");
          console.log(
            `  ${inst.name.padEnd(28)} ${inst.persona.padEnd(16)} ${String(model)}`,
          );
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : "Failed to resolve team");
      }
    },
  );

// ── set ──

const setSubcommand = new Command("set")
  .description("Persist a new default_team composition (JSON ReviewerInstance[] on stdin)")
  .option("--stdin", "Required — JSON ReviewerInstance[] is read from stdin")
  .action(async (options: { stdin?: boolean }) => {
    if (!options.stdin) {
      fail("--stdin is required. Pipe a JSON ReviewerInstance[] to this command.");
    }

    const targetDir = process.cwd();
    requireOcrSetup(targetDir);
    const ocrDir = join(targetDir, ".ocr");
    const configPath = join(ocrDir, "config.yaml");

    try {
      const raw = await readStdin();
      const team = parseSessionOverride(raw); // same shape

      // Group instances by persona to decide which form to emit per entry.
      const byPersona = new Map<string, ReviewerInstance[]>();
      for (const inst of team) {
        const list = byPersona.get(inst.persona) ?? [];
        list.push(inst);
        byPersona.set(inst.persona, list);
      }

      // Read the existing config as a Document so comments — both the
      // top-of-file blocks (REVIEW RULES, REVIEWER TEAM dividers, etc.)
      // and the inline comments next to each team entry — survive the
      // round-trip. Only the entries that actually changed get rewritten.
      const doc = existsSync(configPath)
        ? parseDocument(readFileSync(configPath, "utf-8"))
        : new Document({});

      applyDefaultTeamSurgically(doc, byPersona);

      const yamlOutput = doc.toString({ lineWidth: 0 });
      writeFileSync(configPath, yamlOutput, "utf-8");

      // Regenerate `.ocr/reviewers-meta.json` so `is_default` flags reflect
      // the new composition immediately. Without this step, on-disk metadata
      // stays stale until the user runs `/ocr:sync-reviewers`, and any
      // dashboard surface or external tool reading the meta file directly
      // would show the previous default-team membership. The dashboard's
      // file watcher fires on this write and emits `reviewers:updated`,
      // refreshing every consumer that subscribes.
      const reviewersDir = join(ocrDir, "skills", "references", "reviewers");
      const metaPath = join(ocrDir, "reviewers-meta.json");
      let metaWritten = false;
      try {
        const meta = generateReviewersMeta(reviewersDir, configPath);
        if (meta) {
          writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
          metaWritten = true;
        }
      } catch (err) {
        // Non-fatal — the config write succeeded. Surface the failure on
        // stderr so the caller knows the meta is stale, but don't fail
        // the command. The user can recover by running `/ocr:sync-reviewers`.
        console.error(
          chalk.yellow(
            `Warning: wrote config but failed to regenerate reviewers-meta.json: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }

      console.log(
        chalk.green(
          `Wrote ${team.length} reviewer instance(s) to ${configPath}${
            metaWritten ? " and refreshed reviewers-meta.json" : ""
          }`,
        ),
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : "Failed to set team");
    }
  });

/**
 * Encodes a persona's instance list into the most compact form that
 * preserves all per-instance information.
 */
function encodeTeamEntry(instances: ReviewerInstance[]): unknown {
  if (instances.length === 0) return 0;

  const allModels = instances.map((i) => i.model);
  const allHaveDefaultName = instances.every(
    (inst, idx) => inst.name === `${inst.persona}-${idx + 1}`,
  );

  const uniqueModels = new Set(allModels);

  // Form 1: shorthand. count >= 1, no model, default names.
  if (uniqueModels.size === 1 && allModels[0] === null && allHaveDefaultName) {
    return instances.length;
  }

  // Form 2: object. count >= 1, single model, default names.
  if (uniqueModels.size === 1 && allHaveDefaultName) {
    const model = allModels[0]!;
    return { count: instances.length, model };
  }

  // Form 3: list of instance configs (per-instance models or custom names).
  return instances.map((inst, idx) => {
    const entry: Record<string, unknown> = {};
    if (inst.model !== null) entry["model"] = inst.model;
    if (inst.name !== `${inst.persona}-${idx + 1}`) entry["name"] = inst.name;
    return entry;
  });
}

/**
 * Mutate `doc.default_team` in place so unrelated comments and entries
 * survive. Strategy:
 *   - If a persona's encoded form is identical to its current node,
 *     leave the node untouched (keeps the trailing inline comment).
 *   - If only a scalar value changed (e.g. `principal: 2 → 3`), mutate
 *     the existing Scalar in place — `yaml` keeps trailing/leading
 *     comments attached to the Scalar through value mutation.
 *   - If the form changed (scalar → map, scalar → seq, or vice versa),
 *     replace the pair's value. The inline comment on that pair is
 *     unavoidably lost — comparable to a hand-edit.
 *   - Personas absent from `byPersona` are deleted.
 *   - New personas are appended at the end, preserving prior ordering.
 */
function applyDefaultTeamSurgically(
  doc: Document,
  byPersona: Map<string, ReviewerInstance[]>,
): void {
  let teamNode = doc.get("default_team", true);

  if (!isMap(teamNode)) {
    // default_team missing or not a map — create a fresh one.
    const fresh: Record<string, unknown> = {};
    for (const [persona, instances] of byPersona) {
      fresh[persona] = encodeTeamEntry(instances);
    }
    doc.set("default_team", fresh);
    return;
  }

  const map = teamNode as YAMLMap;
  const incomingKeys = new Set(byPersona.keys());

  // Remove personas that left the team. Scan backwards so splice indices
  // stay valid.
  for (let i = map.items.length - 1; i >= 0; i--) {
    const pair = map.items[i] as Pair<unknown, unknown>;
    const key = pairKey(pair);
    if (key !== null && !incomingKeys.has(key)) {
      map.items.splice(i, 1);
    }
  }

  // Update existing personas + append new ones.
  for (const [persona, instances] of byPersona) {
    const encoded = encodeTeamEntry(instances);
    const existing = map.items.find(
      (p) => pairKey(p as Pair<unknown, unknown>) === persona,
    ) as Pair<unknown, unknown> | undefined;

    if (!existing) {
      map.set(persona, encoded);
      continue;
    }

    // Same scalar value? No-op preserves the inline comment perfectly.
    if (
      typeof encoded === "number" &&
      isScalar(existing.value) &&
      (existing.value as Scalar).value === encoded
    ) {
      continue;
    }

    // Scalar → scalar: mutate the Scalar's value, comments survive.
    if (typeof encoded === "number" && isScalar(existing.value)) {
      (existing.value as Scalar).value = encoded;
      continue;
    }

    // Form change or non-scalar replacement.
    existing.value = doc.createNode(encoded);
  }
}

function pairKey(pair: Pair<unknown, unknown>): string | null {
  const k = pair.key;
  if (typeof k === "string") return k;
  if (isScalar(k)) {
    const v = (k as Scalar).value;
    return typeof v === "string" ? v : null;
  }
  return null;
}

// ── Main team command ──

export const teamCommand = new Command("team")
  .description("Resolve and persist team composition")
  .addCommand(resolveSubcommand)
  .addCommand(setSubcommand);
