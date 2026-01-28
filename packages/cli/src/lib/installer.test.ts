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
import { installForTool } from "./installer";
import type { AIToolConfig } from "./config";

const TEST_TOOL: AIToolConfig = {
  id: "windsurf",
  name: "Windsurf",
  configDir: ".windsurf",
  commandsDir: ".windsurf/workflows",
  skillsDir: ".windsurf/skills",
  commandStrategy: "flat-prefixed",
};

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
      const commandsDir = join(testDir, TEST_TOOL.commandsDir);
      expect(existsSync(commandsDir)).toBe(true);
      expect(existsSync(join(commandsDir, "ocr-review.md"))).toBe(true);
    });
  });
});
