/**
 * Three-form team-composition parser.
 *
 * `default_team` in `.ocr/config.yaml` accepts one of three shapes per
 * persona key, picked unambiguously by YAML type:
 *
 *   1. `principal: 2`                                    — shorthand (count)
 *   2. `principal: { count: 2, model: claude-opus-4-7 }` — object
 *   3. `principal: [{ model: a }, { model: b, name: x }]` — list of instances
 *
 * All three normalize to a single canonical `ReviewerInstance[]` shape that
 * downstream consumers (the dashboard, `ocr team resolve`, the CLI
 * command-runner) speak. Mixing forms within a single persona key is
 * rejected at parse time with a clear error.
 *
 * Optional sugar:
 *   models:
 *     aliases:
 *       workhorse: claude-sonnet-4-6
 *     default: claude-sonnet-4-6
 *
 * Aliases expand once at parse time. `models.default` fills in when an
 * instance has no explicit `model` and no team-level `model`. OCR ships
 * zero entries in `models.aliases`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export type ReviewerInstance = {
  persona: string;
  instance_index: number;
  name: string;
  /**
   * Resolved model id (alias-expanded), or `null` when no model is set
   * anywhere in the resolution chain — `null` means "do not pass --model;
   * let the host CLI's default apply".
   */
  model: string | null;
};

export type ParsedTeamConfig = {
  team: ReviewerInstance[];
  /** User-defined aliases, expanded into the team. Surfaced for tooling. */
  aliases: Record<string, string>;
  /** Workspace-level model default if set. */
  defaultModel: string | null;
};

/**
 * Reads `.ocr/config.yaml` and parses the team composition.
 * Returns an empty team when the config or `default_team` is absent.
 */
export function loadTeamConfig(ocrDir: string): ParsedTeamConfig {
  const configPath = join(ocrDir, "config.yaml");
  if (!existsSync(configPath)) {
    return { team: [], aliases: {}, defaultModel: null };
  }
  const content = readFileSync(configPath, "utf-8");
  return parseTeamConfigYaml(content);
}

/**
 * Parses team configuration from a YAML string. Exposed for tests and for
 * the dashboard's `--team` session-override flow, which serializes
 * overrides into a YAML-compatible payload.
 */
export function parseTeamConfigYaml(content: string): ParsedTeamConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    throw new Error(
      `Failed to parse .ocr/config.yaml: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { team: [], aliases: {}, defaultModel: null };
  }
  const root = parsed as Record<string, unknown>;

  const aliases = readAliases(root);
  const defaultModel = readDefaultModel(root);
  const teamEntries = root["default_team"];

  if (!teamEntries) {
    return { team: [], aliases, defaultModel };
  }
  if (typeof teamEntries !== "object" || Array.isArray(teamEntries)) {
    throw new Error("default_team must be a mapping of persona names to entries");
  }

  const team: ReviewerInstance[] = [];
  for (const [persona, entry] of Object.entries(teamEntries)) {
    const instances = parseEntry(persona, entry);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      const resolvedModel = resolveModel(
        inst.model,
        inst.teamModel ?? null,
        aliases,
        defaultModel,
      );
      team.push({
        persona,
        instance_index: i + 1,
        name: inst.name ?? `${persona}-${i + 1}`,
        model: resolvedModel,
      });
    }
  }

  return { team, aliases, defaultModel };
}

// ── Internal: form normalization ──

type IntermediateInstance = {
  /** Per-instance model from list-form or object-form (not alias-expanded). */
  model?: string | null;
  /** Team-level model (object-form `model:` field) — applies to all siblings. */
  teamModel?: string | null;
  name?: string;
};

function parseEntry(persona: string, entry: unknown): IntermediateInstance[] {
  // Form 1: number (shorthand)
  if (typeof entry === "number") {
    if (!Number.isInteger(entry) || entry < 1) {
      throw new Error(
        `default_team.${persona}: count must be a positive integer (got ${entry})`,
      );
    }
    return Array.from({ length: entry }, () => ({}));
  }

  // Form 3: array (per-instance configs)
  if (Array.isArray(entry)) {
    if (entry.length === 0) {
      throw new Error(
        `default_team.${persona}: list form must contain at least one instance`,
      );
    }
    return entry.map((item, idx) => parseListItem(persona, idx, item));
  }

  // Form 2: object (count + optional team-level model)
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const hasInstancesField = "instances" in obj;
    if (hasInstancesField) {
      throw new Error(
        `default_team.${persona}: 'instances' field is not allowed. ` +
          `Use the list form directly (e.g. ${persona}: [{ ... }, { ... }]) — ` +
          `mixing 'count' and 'instances' is rejected.`,
      );
    }
    if (!("count" in obj)) {
      throw new Error(
        `default_team.${persona}: object form requires a 'count' field`,
      );
    }
    const count = obj["count"];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
      throw new Error(
        `default_team.${persona}: count must be a positive integer (got ${String(count)})`,
      );
    }
    const teamModel = readOptionalString(obj, "model", `default_team.${persona}.model`);
    return Array.from({ length: count }, () => ({ teamModel }));
  }

  throw new Error(
    `default_team.${persona}: must be a number, object with 'count', or list of instance configs`,
  );
}

function parseListItem(
  persona: string,
  idx: number,
  item: unknown,
): IntermediateInstance {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(
      `default_team.${persona}[${idx}]: each instance must be an object (got ${typeof item})`,
    );
  }
  const obj = item as Record<string, unknown>;
  const result: IntermediateInstance = {};
  const model = readOptionalString(obj, "model", `default_team.${persona}[${idx}].model`);
  if (model !== null) {
    result.model = model;
  }
  const name = readOptionalString(obj, "name", `default_team.${persona}[${idx}].name`);
  if (name !== null) {
    result.name = name;
  }
  return result;
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  pathLabel: string,
): string | null {
  if (!(key in obj)) return null;
  const value = obj[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`${pathLabel}: must be a string (got ${typeof value})`);
  }
  return value;
}

// ── Internal: aliases & resolution ──

function readAliases(root: Record<string, unknown>): Record<string, string> {
  const models = root["models"];
  if (!models || typeof models !== "object" || Array.isArray(models)) return {};
  const aliasesRaw = (models as Record<string, unknown>)["aliases"];
  if (!aliasesRaw || typeof aliasesRaw !== "object" || Array.isArray(aliasesRaw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(aliasesRaw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function readDefaultModel(root: Record<string, unknown>): string | null {
  const models = root["models"];
  if (!models || typeof models !== "object" || Array.isArray(models)) return null;
  const value = (models as Record<string, unknown>)["default"];
  return typeof value === "string" ? value : null;
}

/**
 * Resolution chain: instance > teamModel > defaultModel > null.
 * Each level is alias-expanded if it matches a key in `aliases`.
 */
function resolveModel(
  instanceModel: string | null | undefined,
  teamModel: string | null,
  aliases: Record<string, string>,
  defaultModel: string | null,
): string | null {
  const candidate = instanceModel ?? teamModel ?? defaultModel ?? null;
  if (!candidate) return null;
  return aliases[candidate] ?? candidate;
}

// ── Override resolution (session-time overrides) ──

/**
 * Applies per-instance session overrides on top of a parsed team.
 *
 * Override matching is by `(persona, instance_index)`. Unmatched instances
 * are passed through unchanged. The override may also add new instances
 * (count grew) or replace personas entirely.
 *
 * Today this accepts only a `ReviewerInstance[]` directly. The dashboard
 * team panel and `ocr review --team <override>` build that array via the
 * same parser, so the override path stays consistent with disk config.
 */
export function resolveTeamComposition(
  team: ReviewerInstance[],
  override?: ReviewerInstance[],
): ReviewerInstance[] {
  if (!override || override.length === 0) return team;

  // Index existing team by (persona, instance_index)
  const byKey = new Map<string, ReviewerInstance>();
  for (const inst of team) {
    byKey.set(`${inst.persona}#${inst.instance_index}`, inst);
  }

  // Override entries replace existing ones; new entries are added
  const overridden = new Map<string, ReviewerInstance>();
  for (const inst of override) {
    overridden.set(`${inst.persona}#${inst.instance_index}`, inst);
  }

  // Personas referenced in the override take precedence; others fall through
  const overriddenPersonas = new Set([...overridden.keys()].map((k) => k.split("#")[0]));

  const result: ReviewerInstance[] = [];
  for (const inst of team) {
    if (overriddenPersonas.has(inst.persona)) continue;
    result.push(inst);
  }
  for (const inst of override) {
    result.push(inst);
  }
  return result;
}
