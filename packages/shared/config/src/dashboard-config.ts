/**
 * Dashboard settings from `.ocr/config.yaml`, parsed with the real YAML
 * parser (replacing the dashboard app's historical regex over raw YAML for
 * `dashboard.ai_cli`). Parsing approach salvaged from PR #56 (@thunderock).
 *
 * Deliberately narrow: the dashboard's child-process environment posture has
 * NO config surface (children inherit the launch shell's environment — see
 * the platform `child-env` module). The retired `env_passthrough` key from
 * unmerged PR #56 is surfaced only as a boolean so the caller can print a
 * one-time "no longer needed" notice; it must never appear in the config
 * type or cause an error — a config file must not brick the dashboard.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export type AiCliPreference = "auto" | "claude" | "opencode" | "off";

export type DashboardConfig = {
  aiCli: AiCliPreference;
  /**
   * True when the config file contains the retired
   * `dashboard.env_passthrough` key. Raw-YAML peek only — the key's contents
   * are never read or represented; children inherit the shell environment
   * regardless.
   */
  sawRetiredEnvPassthrough: boolean;
};

function defaultDashboardConfig(): DashboardConfig {
  return { aiCli: "auto", sawRetiredEnvPassthrough: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAiCliPreference(value: unknown): AiCliPreference {
  if (
    value === "claude" ||
    value === "opencode" ||
    value === "off" ||
    value === "auto"
  ) {
    return value;
  }
  return "auto";
}

/**
 * Read dashboard settings from `.ocr/config.yaml`. Never throws: a missing
 * file, missing section, or malformed YAML falls back to defaults (with a
 * names-only stderr notice for the malformed case — file contents are never
 * echoed).
 */
export function readDashboardConfig(ocrDir: string): DashboardConfig {
  const configPath = join(ocrDir, "config.yaml");
  if (!existsSync(configPath)) return defaultDashboardConfig();

  try {
    const parsed: unknown = parseYaml(readFileSync(configPath, "utf-8"));
    if (!isRecord(parsed) || !isRecord(parsed.dashboard)) {
      return defaultDashboardConfig();
    }

    return {
      aiCli: parseAiCliPreference(parsed.dashboard.ai_cli),
      sawRetiredEnvPassthrough: "env_passthrough" in parsed.dashboard,
    };
  } catch {
    process.stderr.write(
      "[ocr] Failed to parse dashboard configuration; using defaults.\n",
    );
    return defaultDashboardConfig();
  }
}
