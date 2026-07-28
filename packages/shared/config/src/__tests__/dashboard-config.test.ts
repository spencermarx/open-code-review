import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDashboardConfig } from "../dashboard-config.js";

/**
 * Pins the config spec's "Dashboard Settings Parsing" requirement: typed
 * `ai_cli` with safe fallbacks, never-throws behavior on malformed input,
 * and the retired `env_passthrough` key surfaced only as a boolean (its
 * contents are never read — children inherit the shell env regardless).
 */
let tmpDir: string;
let ocrDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ocr-dashboard-config-test-"));
  ocrDir = join(tmpDir, ".ocr");
  mkdirSync(ocrDir, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readDashboardConfig", () => {
  it("returns defaults when config.yaml does not exist", () => {
    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "auto",
      sawRetiredEnvPassthrough: false,
    });
  });

  it("reads the AI CLI preference", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      ["dashboard:", "  ai_cli: opencode", ""].join("\n"),
    );
    expect(readDashboardConfig(ocrDir).aiCli).toBe("opencode");
  });

  it("falls back to auto for an invalid ai_cli value", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      ["dashboard:", "  ai_cli: copilot", ""].join("\n"),
    );
    expect(readDashboardConfig(ocrDir).aiCli).toBe("auto");
  });

  it("flags the retired env_passthrough key without reading its contents", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      [
        "dashboard:",
        "  ai_cli: claude",
        "  env_passthrough:",
        "    - AWS_REGION",
        "",
      ].join("\n"),
    );
    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "claude",
      sawRetiredEnvPassthrough: true,
    });
  });

  it("falls back on malformed YAML with a notice that excludes file contents", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    writeFileSync(join(ocrDir, "config.yaml"), "dashboard: [\n");

    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "auto",
      sawRetiredEnvPassthrough: false,
    });
    expect(stderr).toHaveBeenCalledWith(
      "[ocr] Failed to parse dashboard configuration; using defaults.\n",
    );
  });

  it("ignores a non-mapping dashboard section", () => {
    writeFileSync(join(ocrDir, "config.yaml"), "dashboard: off\n");
    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "auto",
      sawRetiredEnvPassthrough: false,
    });
  });
});
