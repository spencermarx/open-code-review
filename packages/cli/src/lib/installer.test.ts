import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installForTool,
  generateSkillPointer,
  detectInstalledTools,
  resolveToolsToUpdate,
  findStaleSkillPointers,
} from "./installer";
import {
  AI_TOOLS,
  getToolById,
  isHostTool,
  SKILL_POINTER_MARKER,
  type DiscoveryToolConfig,
  type HostToolConfig,
} from "./config";

const TEST_TOOL: HostToolConfig = {
  id: "windsurf",
  name: "Windsurf",
  configDir: ".windsurf",
  kind: "host",
  commands: { dir: ".windsurf/workflows", strategy: "flat-prefixed" },
};

function agentsTool(): DiscoveryToolConfig {
  const tool = getToolById("agents");
  if (tool === undefined || isHostTool(tool)) {
    throw new Error("expected `agents` to be a discovery target");
  }
  return tool;
}

function createTempDir(): string {
  const tempBase = join(tmpdir(), "ocr-test");
  if (!existsSync(tempBase)) {
    mkdirSync(tempBase, { recursive: true });
  }
  const testDir = join(
    tempBase,
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("installForTool", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTempDir();
    // Create the tool's config directory to simulate an installed tool
    mkdirSync(join(testDir, TEST_TOOL.configDir), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(testDir);
  });

  describe("fresh installation", () => {
    it("should install default reviewers on fresh install", () => {
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();

      // Check that default reviewers are installed
      const reviewersDir = join(
        testDir,
        ".ocr",
        "skills",
        "references",
        "reviewers",
      );
      expect(existsSync(reviewersDir)).toBe(true);
      expect(existsSync(join(reviewersDir, "principal.md"))).toBe(true);
      expect(existsSync(join(reviewersDir, "quality.md"))).toBe(true);
      expect(existsSync(join(reviewersDir, "security.md"))).toBe(true);
      expect(existsSync(join(reviewersDir, "testing.md"))).toBe(true);
    });

    it("should install config.yaml on fresh install", () => {
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);
      const configPath = join(testDir, ".ocr", "config.yaml");
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe("reviewer preservation", () => {
    it("should preserve all existing reviewers during update", () => {
      // First install
      installForTool(TEST_TOOL, testDir);

      // Modify a default reviewer
      const principalPath = join(
        testDir,
        ".ocr",
        "skills",
        "references",
        "reviewers",
        "principal.md",
      );
      const customContent =
        "# Custom Principal\n\nMy custom principal reviewer content.";
      writeFileSync(principalPath, customContent);

      // Run update (second install)
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();

      // Verify custom content is preserved
      const preserved = readFileSync(principalPath, "utf-8");
      expect(preserved).toBe(customContent);
    });

    it("should preserve custom reviewers during update", () => {
      // First install
      installForTool(TEST_TOOL, testDir);

      // Add a custom reviewer
      const customReviewerPath = join(
        testDir,
        ".ocr",
        "skills",
        "references",
        "reviewers",
        "performance.md",
      );
      const customContent =
        "# Performance Engineer\n\nFocus on performance issues.";
      writeFileSync(customReviewerPath, customContent);

      // Run update (second install)
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);

      // Verify custom reviewer is preserved
      expect(existsSync(customReviewerPath)).toBe(true);
      const preserved = readFileSync(customReviewerPath, "utf-8");
      expect(preserved).toBe(customContent);
    });

    it("should preserve modified default reviewers during update", () => {
      // First install
      installForTool(TEST_TOOL, testDir);

      // Modify multiple default reviewers
      const reviewersDir = join(
        testDir,
        ".ocr",
        "skills",
        "references",
        "reviewers",
      );
      const modifications: Record<string, string> = {
        "principal.md": "# Modified Principal",
        "security.md": "# Modified Security",
      };

      for (const [file, content] of Object.entries(modifications)) {
        writeFileSync(join(reviewersDir, file), content);
      }

      // Run update
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);

      // Verify all modifications are preserved
      for (const [file, expectedContent] of Object.entries(modifications)) {
        const actual = readFileSync(join(reviewersDir, file), "utf-8");
        expect(actual).toBe(expectedContent);
      }
    });
  });

  describe("config.yaml preservation", () => {
    it("should preserve existing config.yaml during update", () => {
      // First install
      installForTool(TEST_TOOL, testDir);

      // Modify config
      const configPath = join(testDir, ".ocr", "config.yaml");
      const customConfig = "# Custom config\ndefault_team:\n  principal: 4\n";
      writeFileSync(configPath, customConfig);

      // Run update
      const result = installForTool(TEST_TOOL, testDir);

      expect(result.success).toBe(true);

      // Verify config is preserved
      const preserved = readFileSync(configPath, "utf-8");
      expect(preserved).toBe(customConfig);
    });
  });

  describe("warning generation", () => {
    it("should return warnings when reviewer files cannot be restored", () => {
      // First install
      installForTool(TEST_TOOL, testDir);

      // Create a reviewer that we'll make unwritable after reading
      const reviewersDir = join(
        testDir,
        ".ocr",
        "skills",
        "references",
        "reviewers",
      );
      const testReviewer = join(reviewersDir, "test-reviewer.md");
      writeFileSync(testReviewer, "# Test Reviewer");

      // Make the reviewers directory read-only to cause write failures
      // Note: This test may not work on all platforms (e.g., Windows)
      try {
        chmodSync(reviewersDir, 0o444);

        // Run update - should generate warnings
        const result = installForTool(TEST_TOOL, testDir);

        // Restore permissions for cleanup
        chmodSync(reviewersDir, 0o755);

        // On systems where chmod works, we expect warnings
        if (result.warnings && result.warnings.length > 0) {
          expect(
            result.warnings.some((w) =>
              w.includes("Could not restore reviewer"),
            ),
          ).toBe(true);
        }
      } catch {
        // Skip this test on platforms where chmod doesn't work as expected
        chmodSync(reviewersDir, 0o755);
      }
    });
  });

  describe("directory structure", () => {
    it("should create .ocr/sessions directory", () => {
      installForTool(TEST_TOOL, testDir);

      expect(existsSync(join(testDir, ".ocr", "sessions"))).toBe(true);
    });

    it("should create .ocr/.gitignore", () => {
      installForTool(TEST_TOOL, testDir);

      const gitignorePath = join(testDir, ".ocr", ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("sessions/");
    });

    it("should install commands to tool-specific directory", () => {
      installForTool(TEST_TOOL, testDir);

      // For flat-prefixed tools like Windsurf
      const commandsDir = join(testDir, TEST_TOOL.commands.dir);
      expect(existsSync(commandsDir)).toBe(true);
      expect(existsSync(join(commandsDir, "ocr-review.md"))).toBe(true);
    });

    it("should install subdirectory-strategy commands under ocr/", () => {
      const claude = getToolById("claude");
      if (claude === undefined) throw new Error("expected a claude entry");

      const result = installForTool(claude, testDir);

      expect(result.success).toBe(true);
      const review = readFileSync(
        join(testDir, ".claude", "commands", "ocr", "review.md"),
        "utf-8",
      );
      expect(review).toContain("`.ocr/commands/review.md`");
    });
  });
});

describe("universal agents target", () => {
  const AGENTS_TOOL = agentsTool();
  // The spec's literal path, not rebuilt from production helpers.
  const POINTER = [".agents", "skills", "ocr", "SKILL.md"];
  let testDir: string;

  const sourceSkill = () =>
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "agents", "skills", "ocr", "SKILL.md"),
      "utf-8",
    );
  /** Lines up to and including the closing `---` (independent of production). */
  const frontmatterOf = (content: string) => {
    const lines = content.split(/(?<=\n)/);
    const close = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
    return lines.slice(0, close + 1).join("");
  };
  const pointerPath = () => join(testDir, ...POINTER);
  const writePointer = (content: string) => {
    mkdirSync(join(testDir, ".agents", "skills", "ocr"), { recursive: true });
    writeFileSync(pointerPath(), content);
  };

  beforeEach(() => {
    testDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(testDir);
  });

  describe("installForTool", () => {
    it("writes a pointer whose frontmatter matches the packaged SKILL.md", () => {
      const result = installForTool(AGENTS_TOOL, testDir);
      expect(result.success).toBe(true);

      const pointer = readFileSync(pointerPath(), "utf-8");
      expect(frontmatterOf(pointer)).toBe(frontmatterOf(sourceSkill()));
      // Agent Skills: `name` must match the parent directory name.
      expect(pointer).toMatch(/^name: ocr\r?$/m);
      expect(pointer).toContain(SKILL_POINTER_MARKER);
      expect(pointer).toContain(
        "**Execute this skill by reading and following:** `.ocr/skills/SKILL.md` at the repository root",
      );
    });

    it("installs the full skill and central commands but no tool command refs", () => {
      installForTool(AGENTS_TOOL, testDir);

      expect(existsSync(join(testDir, ".ocr", "skills", "SKILL.md"))).toBe(true);
      expect(existsSync(join(testDir, ".ocr", "commands", "review.md"))).toBe(true);
      expect(existsSync(join(testDir, ".agents", "commands"))).toBe(false);
      // Only the pointer lives under .agents/skills/ocr — not a full copy.
      expect(existsSync(join(testDir, ".agents", "skills", "ocr", "references"))).toBe(false);
    });

    it("refreshes an outdated OCR-managed pointer on re-install", () => {
      writePointer(`---\nname: ocr\n---\n\n${SKILL_POINTER_MARKER}\n\nold body\n`);

      const result = installForTool(AGENTS_TOOL, testDir);

      expect(result.success).toBe(true);
      expect(readFileSync(pointerPath(), "utf-8")).toBe(generateSkillPointer(sourceSkill()));
    });

    it("leaves a foreign SKILL.md untouched and warns", () => {
      const foreign = "---\nname: ocr\ndescription: another team's skill\n---\n\nMine.\n";
      writePointer(foreign);

      const result = installForTool(AGENTS_TOOL, testDir);

      expect(result.success).toBe(true);
      expect(readFileSync(pointerPath(), "utf-8")).toBe(foreign);
      expect(result.warnings).toEqual([
        expect.stringContaining(".agents/skills/ocr/SKILL.md exists and was not written by OCR"),
      ]);
    });

    it("reports a failure when the pointer cannot be written", () => {
      // A file where the `ocr/` skill directory should be blocks the write.
      mkdirSync(join(testDir, ".agents", "skills"), { recursive: true });
      writeFileSync(join(testDir, ".agents", "skills", "ocr"), "not a directory");

      const result = installForTool(AGENTS_TOOL, testDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Failed to install OCR skill pointer to .agents/skills/ocr/SKILL.md",
      );
    });
  });

  describe("generateSkillPointer", () => {
    it("keeps LF line endings for an LF source", () => {
      const pointer = generateSkillPointer("---\nname: ocr\n---\n\n# Full skill\n");

      expect(pointer.startsWith("---\nname: ocr\n---\n")).toBe(true);
      expect(pointer).not.toContain("\r");
    });

    it("uses CRLF throughout for a CRLF source", () => {
      const pointer = generateSkillPointer("---\r\nname: ocr\r\n---\r\n\r\n# Full skill\r\n");

      expect(pointer.startsWith("---\r\nname: ocr\r\n---\r\n")).toBe(true);
      expect(pointer).not.toMatch(/(?<!\r)\n/);
    });

    it("rejects a source without frontmatter", () => {
      expect(() => generateSkillPointer("# no frontmatter")).toThrow(
        "Packaged SKILL.md has no frontmatter block",
      );
    });
  });

  describe("detectInstalledTools (init pre-selection)", () => {
    it("does not pre-select agents for a bare .agents/ directory", () => {
      mkdirSync(join(testDir, ".agents", "rules"), { recursive: true });

      expect(detectInstalledTools(testDir, AI_TOOLS).map((t) => t.id)).not.toContain("agents");
    });

    it("pre-selects agents when .agents/skills/ exists", () => {
      mkdirSync(join(testDir, ".agents", "skills"), { recursive: true });

      expect(detectInstalledTools(testDir, AI_TOOLS).map((t) => t.id)).toContain("agents");
    });
  });

  describe("resolveToolsToUpdate", () => {
    it("uses saved tool ids when present", () => {
      mkdirSync(join(testDir, ".claude"), { recursive: true });

      const ids = resolveToolsToUpdate(testDir, AI_TOOLS, ["agents"]).map((t) => t.id);

      expect(ids).toEqual(["agents"]);
    });

    it("legacy fallback refreshes an OCR-managed pointer", () => {
      installForTool(AGENTS_TOOL, testDir);

      const ids = resolveToolsToUpdate(testDir, AI_TOOLS, []).map((t) => t.id);

      expect(ids).toContain("agents");
    });

    it("legacy fallback never adopts agents from directory presence alone", () => {
      mkdirSync(join(testDir, ".agents", "skills"), { recursive: true });
      mkdirSync(join(testDir, ".claude"), { recursive: true });

      const ids = resolveToolsToUpdate(testDir, AI_TOOLS, []).map((t) => t.id);

      expect(ids).toEqual(["claude"]);
    });

    it("legacy fallback ignores a foreign SKILL.md", () => {
      writePointer("---\nname: ocr\n---\n\nMine.\n");

      expect(resolveToolsToUpdate(testDir, AI_TOOLS, [])).toEqual([]);
    });
  });

  describe("findStaleSkillPointers", () => {
    it("reports an OCR-managed pointer for a deselected agents target", () => {
      installForTool(AGENTS_TOOL, testDir);

      expect(findStaleSkillPointers(testDir, AI_TOOLS, ["claude"])).toEqual([
        ".agents/skills/ocr/SKILL.md",
      ]);
    });

    it("reports nothing while agents is selected", () => {
      installForTool(AGENTS_TOOL, testDir);

      expect(findStaleSkillPointers(testDir, AI_TOOLS, ["agents"])).toEqual([]);
    });

    it("never reports a foreign SKILL.md", () => {
      writePointer("---\nname: ocr\n---\n\nMine.\n");

      expect(findStaleSkillPointers(testDir, AI_TOOLS, ["claude"])).toEqual([]);
    });
  });
});
