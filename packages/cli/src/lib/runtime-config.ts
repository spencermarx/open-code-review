/**
 * Runtime configuration helpers.
 *
 * Reads `.ocr/config.yaml` for runtime tunables that affect how the CLI and
 * dashboard reason about agent-session liveness. Phase 1 only needs the
 * `runtime.agent_heartbeat_seconds` knob; a full YAML parser will arrive
 * with the Phase 4 team-config rewrite.
 *
 * Until then we use targeted regex extraction (matching the existing
 * convention in `installer.ts`) to avoid pulling in a YAML dependency for
 * this narrow read.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_AGENT_HEARTBEAT_SECONDS = 60;

/**
 * Returns the configured agent-session heartbeat threshold, in seconds.
 *
 * Resolution order:
 *  1. `runtime.agent_heartbeat_seconds` from `.ocr/config.yaml`, if a valid
 *     positive integer.
 *  2. {@link DEFAULT_AGENT_HEARTBEAT_SECONDS}.
 *
 * Invalid or non-numeric values fall through to the default and emit a
 * warning on stderr — never throw, so liveness sweeps are never blocked
 * by a bad config.
 */
export function getAgentHeartbeatSeconds(ocrDir: string): number {
  const configPath = join(ocrDir, "config.yaml");
  if (!existsSync(configPath)) {
    return DEFAULT_AGENT_HEARTBEAT_SECONDS;
  }

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    return DEFAULT_AGENT_HEARTBEAT_SECONDS;
  }

  // Match either:
  //   runtime:
  //     agent_heartbeat_seconds: 120
  // …or the inline form:
  //   runtime: { agent_heartbeat_seconds: 120 }
  const blockMatch = content.match(
    /^runtime:\s*\n(?:\s+[^\n]*\n)*?\s+agent_heartbeat_seconds:\s*([^\s#\n]+)/m,
  );
  const inlineMatch = content.match(
    /^runtime:\s*\{[^}]*\bagent_heartbeat_seconds:\s*([^\s,}]+)/m,
  );
  const raw = blockMatch?.[1] ?? inlineMatch?.[1];
  if (!raw) {
    return DEFAULT_AGENT_HEARTBEAT_SECONDS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    process.stderr.write(
      `[ocr] runtime.agent_heartbeat_seconds is not a positive integer (got "${raw}"); falling back to ${DEFAULT_AGENT_HEARTBEAT_SECONDS}s.\n`,
    );
    return DEFAULT_AGENT_HEARTBEAT_SECONDS;
  }

  return parsed;
}
