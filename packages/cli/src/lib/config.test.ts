import { describe, it, expect } from "vitest";
import {
  AI_TOOLS,
  getToolById,
  getHostCapabilities,
  getToolIds,
  DEFAULT_HOST_CAPABILITIES,
  parseToolsArg,
  isHostTool,
} from "./config.js";

describe("host capabilities (issue #28)", () => {
  it("declares explicit capabilities for the known agentic hosts", () => {
    expect(getHostCapabilities("claude")).toEqual({ subagentSpawn: true, perTaskModel: true });
    expect(getHostCapabilities("opencode")).toEqual({ subagentSpawn: true, perTaskModel: false });
    expect(getHostCapabilities("gemini")).toEqual({ subagentSpawn: false, perTaskModel: false });
    expect(getHostCapabilities("codex")).toEqual({ subagentSpawn: false, perTaskModel: false });
  });

  it("falls back to the conservative default for editor hosts (no Task tool assumed)", () => {
    // Cursor is an editor that consumes skills but declares no host capabilities.
    expect(getHostCapabilities("cursor")).toEqual(DEFAULT_HOST_CAPABILITIES);
    expect(DEFAULT_HOST_CAPABILITIES).toEqual({ subagentSpawn: false, perTaskModel: false });
  });

  it("resolves a complete capability descriptor for every tool — no host silently defaults to Claude", () => {
    for (const id of getToolIds()) {
      const caps = getHostCapabilities(id);
      expect(typeof caps.subagentSpawn).toBe("boolean");
      expect(typeof caps.perTaskModel).toBe("boolean");
    }
  });
});

describe("instruction-file mapping (issue #28)", () => {
  it("maps native files only where they differ from AGENTS.md", () => {
    expect(getToolById("claude")?.instructionFiles).toEqual([
      { path: "CLAUDE.md", format: "markdown" },
    ]);
    expect(getToolById("gemini")?.instructionFiles).toEqual([
      { path: "GEMINI.md", format: "markdown" },
    ]);
    expect(getToolById("github-copilot")?.instructionFiles).toEqual([
      { path: ".github/copilot-instructions.md", format: "markdown" },
    ]);
    expect(getToolById("windsurf")?.instructionFiles).toEqual([
      { path: ".windsurfrules", format: "plaintext" },
    ]);
  });

  it("declares no native file for AGENTS.md-native tools (no stray CLAUDE.md)", () => {
    for (const id of ["codex", "opencode", "cursor"] as const) {
      expect(getToolById(id)?.instructionFiles ?? []).toEqual([]);
    }
  });

  it("only the spawnable agentic CLIs declare a vendorBinary", () => {
    const withVendor = AI_TOOLS.filter((t) => t.vendorBinary).map((t) => t.id).sort();
    expect(withVendor).toEqual(["claude", "codex", "gemini", "opencode"]);
  });
});

describe("universal agents target", () => {
  it("is selectable by id and included in --tools all", () => {
    expect(parseToolsArg("agents")).toEqual(["agents"]);
    expect(parseToolsArg("all")).toContain("agents");
  });

  it("installs a skill pointer only — no commands, no instruction file, no vendor binary", () => {
    const agents = getToolById("agents");
    expect(agents?.configDir).toBe(".agents");
    expect(agents?.skillPointerDir).toBe(".agents/skills");
    expect(agents?.commandsDir).toBeUndefined();
    expect(agents?.instructionFiles).toBeUndefined();
    expect(agents?.vendorBinary).toBeUndefined();
  });

  it("only the agents target declares a skillPointerDir", () => {
    const withPointer = AI_TOOLS.filter((t) => t.skillPointerDir).map((t) => t.id);
    expect(withPointer).toEqual(["agents"]);
  });

  it("is the only registry entry that is not a host", () => {
    expect(AI_TOOLS.filter((t) => !isHostTool(t)).map((t) => t.id)).toEqual(["agents"]);
  });
});
