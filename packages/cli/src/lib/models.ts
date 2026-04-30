/**
 * Model discovery helpers shared across the CLI surface.
 *
 * `ocr models list` uses these to enumerate models that the user's host AI
 * CLI is willing to accept. Identifiers are vendor-native — OCR does not
 * coin its own logical names. When the underlying CLI lacks a `models`
 * subcommand, we fall back to a small bundled known-good list per vendor.
 * The user can always type any string the CLI accepts; bundled lists are
 * convenience, not a gate.
 */

import { execBinary } from "@open-code-review/platform";

export type ModelDescriptor = {
  id: string;
  displayName?: string;
  provider?: string;
  tags?: string[];
};

export type ModelVendor = "claude" | "opencode";

const BUNDLED_CLAUDE_MODELS: ModelDescriptor[] = [
  { id: "claude-opus-4-7", displayName: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5" },
];

const BUNDLED_OPENCODE_MODELS: ModelDescriptor[] = [
  { id: "anthropic/claude-opus-4-7", provider: "anthropic" },
  { id: "anthropic/claude-sonnet-4-6", provider: "anthropic" },
  { id: "anthropic/claude-haiku-4-5-20251001", provider: "anthropic" },
];

/**
 * Detects which supported AI CLI is on PATH. Returns the first one found
 * via `<binary> --version` exiting cleanly. Returns `null` if neither
 * `claude` nor `opencode` is available.
 */
export function detectActiveVendor(): ModelVendor | null {
  for (const vendor of ["claude", "opencode"] as const) {
    try {
      execBinary(vendor, ["--version"], {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return vendor;
    } catch {
      // try next
    }
  }
  return null;
}

function tryNativeEnumeration(vendor: ModelVendor): ModelDescriptor[] | null {
  try {
    const output = execBinary(vendor, ["models", "--json"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed)) return null;

    const models: ModelDescriptor[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        models.push({ id: item });
      } else if (
        typeof item === "object" &&
        item !== null &&
        "id" in (item as Record<string, unknown>) &&
        typeof (item as Record<string, unknown>).id === "string"
      ) {
        const obj = item as Record<string, unknown>;
        const desc: ModelDescriptor = { id: obj.id as string };
        if (typeof obj.displayName === "string") desc.displayName = obj.displayName;
        if (typeof obj.provider === "string") desc.provider = obj.provider;
        if (Array.isArray(obj.tags)) {
          desc.tags = obj.tags.filter((t): t is string => typeof t === "string");
        }
        models.push(desc);
      }
    }
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

function bundledForVendor(vendor: ModelVendor): ModelDescriptor[] {
  if (vendor === "claude") return BUNDLED_CLAUDE_MODELS;
  return BUNDLED_OPENCODE_MODELS;
}

export type ModelListResult = {
  vendor: ModelVendor;
  source: "native" | "bundled";
  models: ModelDescriptor[];
};

/**
 * Returns the model list for the given vendor, preferring native CLI
 * enumeration and falling back to the bundled known-good list. Used by
 * `ocr models list`.
 */
export function listModelsForVendor(vendor: ModelVendor): ModelListResult {
  const native = tryNativeEnumeration(vendor);
  if (native) {
    return { vendor, source: "native", models: native };
  }
  return { vendor, source: "bundled", models: bundledForVendor(vendor) };
}
