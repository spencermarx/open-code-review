import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDashboardConfig } from "../dashboard-config.js";

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
      envPassthrough: [],
    });
  });

  it("reads the AI CLI preference and environment passthrough list", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      [
        "dashboard:",
        "  ai_cli: opencode",
        "  env_passthrough:",
        "    - AWS_BEARER_TOKEN_BEDROCK",
        "    - AWS_REGION",
        "",
      ].join("\n"),
    );

    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "opencode",
      envPassthrough: ["AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION"],
    });
  });

  it("supports inline YAML and removes duplicate names", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      "dashboard: { ai_cli: claude, env_passthrough: [AWS_REGION, AWS_REGION] }\n",
    );

    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "claude",
      envPassthrough: ["AWS_REGION"],
    });
  });

  it("ignores invalid environment variable names", () => {
    writeFileSync(
      join(ocrDir, "config.yaml"),
      [
        "dashboard:",
        "  env_passthrough:",
        "    - AWS_REGION",
        "    - 123",
        "    - INVALID-NAME",
        "    - valid_but_lowercase",
        "",
      ].join("\n"),
    );

    expect(readDashboardConfig(ocrDir).envPassthrough).toEqual([
      "AWS_REGION",
      "valid_but_lowercase",
    ]);
  });

  it("falls back without exposing malformed YAML", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    writeFileSync(join(ocrDir, "config.yaml"), "dashboard: [\n");

    expect(readDashboardConfig(ocrDir)).toEqual({
      aiCli: "auto",
      envPassthrough: [],
    });
    expect(stderr).toHaveBeenCalledWith(
      "[ocr] Failed to parse dashboard configuration; using defaults.\n",
    );
  });
});
