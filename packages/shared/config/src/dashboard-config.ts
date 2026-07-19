/**
 * Dashboard configuration helpers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type AiCliPreference = "auto" | "claude" | "opencode" | "off";

export type DashboardConfig = {
  aiCli: AiCliPreference;
  envPassthrough: string[];
};

const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  aiCli: "auto",
  envPassthrough: [],
};

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

function parseEnvPassthrough(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const names = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && ENV_NAME_PATTERN.test(entry)) {
      names.add(entry);
    }
  }
  return [...names];
}

/** Read dashboard settings from `.ocr/config.yaml`. */
export function readDashboardConfig(ocrDir: string): DashboardConfig {
  const configPath = join(ocrDir, "config.yaml");
  if (!existsSync(configPath)) return { ...DEFAULT_DASHBOARD_CONFIG };

  try {
    const parsed: unknown = parseYaml(readFileSync(configPath, "utf-8"));
    if (!isRecord(parsed) || !isRecord(parsed.dashboard)) {
      return { ...DEFAULT_DASHBOARD_CONFIG };
    }

    return {
      aiCli: parseAiCliPreference(parsed.dashboard.ai_cli),
      envPassthrough: parseEnvPassthrough(
        parsed.dashboard.env_passthrough,
      ),
    };
  } catch {
    process.stderr.write(
      "[ocr] Failed to parse dashboard configuration; using defaults.\n",
    );
    return { ...DEFAULT_DASHBOARD_CONFIG };
  }
}
