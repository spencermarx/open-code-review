import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AIToolId } from "./config.js";

/**
 * CLI configuration stored in .ocr/cli-config.json
 * Persists user preferences across CLI commands
 */
export type CLIConfig = {
  /** Tools the user has chosen to configure OCR for */
  configuredTools: AIToolId[];
  /** Version of the CLI that created this config */
  cliVersion?: string;
  /** Timestamp of last update */
  lastUpdated?: string;
};

const CLI_CONFIG_FILE = "cli-config.json";

/**
 * Get the path to the CLI config file
 */
export function getCliConfigPath(targetDir: string): string {
  return join(targetDir, ".ocr", CLI_CONFIG_FILE);
}

/**
 * Load CLI config from .ocr/cli-config.json
 * Returns null if file doesn't exist or is invalid
 */
export function loadCliConfig(targetDir: string): CLIConfig | null {
  const configPath = getCliConfigPath(targetDir);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as CLIConfig;
  } catch {
    return null;
  }
}

/**
 * Save CLI config to .ocr/cli-config.json
 */
export function saveCliConfig(targetDir: string, config: CLIConfig): boolean {
  const configPath = getCliConfigPath(targetDir);

  try {
    const configWithMeta: CLIConfig = {
      ...config,
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(configPath, JSON.stringify(configWithMeta, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get configured tools from CLI config, or empty array if not set
 */
export function getConfiguredToolIds(targetDir: string): AIToolId[] {
  const config = loadCliConfig(targetDir);
  return config?.configuredTools ?? [];
}

/**
 * Update configured tools in CLI config
 */
export function setConfiguredToolIds(
  targetDir: string,
  toolIds: AIToolId[],
): boolean {
  const existing = loadCliConfig(targetDir) ?? { configuredTools: [] };
  return saveCliConfig(targetDir, {
    ...existing,
    configuredTools: toolIds,
  });
}
