import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_AGENT_HEARTBEAT_SECONDS,
  getAgentHeartbeatSeconds,
} from "../runtime-config.js";

let tmpDir: string;
let ocrDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ocr-runtime-config-test-"));
  ocrDir = join(tmpDir, ".ocr");
  mkdirSync(ocrDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("getAgentHeartbeatSeconds", () => {
  it("returns the default when config.yaml does not exist", () => {
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(
      DEFAULT_AGENT_HEARTBEAT_SECONDS,
    );
  });

  it("returns the default when runtime block is absent", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `default_team:\n  principal: 2\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(
      DEFAULT_AGENT_HEARTBEAT_SECONDS,
    );
  });

  it("reads block-form runtime.agent_heartbeat_seconds", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime:\n  agent_heartbeat_seconds: 120\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(120);
  });

  it("reads inline runtime block", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime: { agent_heartbeat_seconds: 90 }\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(90);
  });

  it("falls back to default for non-numeric values", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime:\n  agent_heartbeat_seconds: "not-a-number"\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(
      DEFAULT_AGENT_HEARTBEAT_SECONDS,
    );
  });

  it("falls back to default for non-positive values", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime:\n  agent_heartbeat_seconds: 0\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(
      DEFAULT_AGENT_HEARTBEAT_SECONDS,
    );
  });

  it("falls back to default for non-integer values", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime:\n  agent_heartbeat_seconds: 60.5\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(
      DEFAULT_AGENT_HEARTBEAT_SECONDS,
    );
  });

  it("ignores trailing comments", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      `runtime:\n  agent_heartbeat_seconds: 45 # configured for slow models\n`,
    );
    expect(getAgentHeartbeatSeconds(ocrDir)).toBe(45);
  });
});
