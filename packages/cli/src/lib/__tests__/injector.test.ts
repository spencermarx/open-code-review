import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  injectOcrInstructions,
  injectIntoProjectFiles,
  hasOcrInstructions,
} from "../injector.js";

describe("injector", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "ocr-injector-test-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function read(name: string): string {
    return readFileSync(join(projectDir, name), "utf-8");
  }

  function write(name: string, content: string): void {
    writeFileSync(join(projectDir, name), content);
  }

  describe("OCR_INSTRUCTION_BLOCK content", () => {
    it("uses h2 (##) for the heading, not h1 (#)", () => {
      const path = join(projectDir, "CLAUDE.md");
      injectOcrInstructions(path);

      const content = read("CLAUDE.md");
      expect(content).toContain("## Open Code Review Instructions");
      // Guard against regression to h1 (a line starting with `# ` not `## `)
      expect(content).not.toMatch(/^# Open Code Review Instructions$/m);
    });

    it("uses backticks around `ocr init`, not single quotes", () => {
      const path = join(projectDir, "CLAUDE.md");
      injectOcrInstructions(path);

      const content = read("CLAUDE.md");
      expect(content).toContain("`ocr init`");
      expect(content).not.toContain("'ocr init'");
    });

    it("includes the start and end markers", () => {
      const path = join(projectDir, "CLAUDE.md");
      injectOcrInstructions(path);

      const content = read("CLAUDE.md");
      expect(content).toContain("<!-- OCR:START -->");
      expect(content).toContain("<!-- OCR:END -->");
    });
  });

  describe("injectOcrInstructions", () => {
    it("creates a file with the managed block when none exists", () => {
      const path = join(projectDir, "CLAUDE.md");
      const result = injectOcrInstructions(path);

      expect(result).toBe(true);
      expect(existsSync(path)).toBe(true);
      const content = read("CLAUDE.md");
      expect(content).toContain("<!-- OCR:START -->");
      expect(content).toContain(".ocr/skills/SKILL.md");
    });

    it("appends managed block while preserving existing content", () => {
      write("CLAUDE.md", "# My Project\n\nSome instructions here.\n");

      injectOcrInstructions(join(projectDir, "CLAUDE.md"));

      const content = read("CLAUDE.md");
      expect(content).toContain("# My Project");
      expect(content).toContain("Some instructions here.");
      expect(content).toContain("<!-- OCR:START -->");
    });

    it("replaces existing managed block on re-inject (idempotent)", () => {
      const path = join(projectDir, "CLAUDE.md");

      injectOcrInstructions(path);
      const first = read("CLAUDE.md");

      injectOcrInstructions(path);
      const second = read("CLAUDE.md");

      expect(second).toBe(first);
      expect(second.match(/<!-- OCR:START -->/g)?.length).toBe(1);
      expect(second.match(/<!-- OCR:END -->/g)?.length).toBe(1);
    });

    it("replaces a stale managed block with the current template", () => {
      write(
        "CLAUDE.md",
        [
          "# My Project",
          "",
          "<!-- OCR:START -->",
          "# Old Heading",
          "stale content",
          "<!-- OCR:END -->",
        ].join("\n") + "\n",
      );

      injectOcrInstructions(join(projectDir, "CLAUDE.md"));

      const content = read("CLAUDE.md");
      expect(content).toContain("# My Project");
      expect(content).not.toContain("# Old Heading");
      expect(content).not.toContain("stale content");
      expect(content).toContain("## Open Code Review Instructions");
      expect(content.match(/<!-- OCR:START -->/g)?.length).toBe(1);
    });
  });

  describe("injectIntoProjectFiles", () => {
    it("injects into both AGENTS.md and CLAUDE.md", () => {
      const result = injectIntoProjectFiles(projectDir);

      expect(result.agentsMd).toBe(true);
      expect(result.claudeMd).toBe(true);
      expect(read("AGENTS.md")).toContain("<!-- OCR:START -->");
      expect(read("CLAUDE.md")).toContain("<!-- OCR:START -->");
    });
  });

  describe("hasOcrInstructions", () => {
    it("returns false when the file does not exist", () => {
      expect(hasOcrInstructions(join(projectDir, "CLAUDE.md"))).toBe(false);
    });

    it("returns false when the file exists but lacks markers", () => {
      write("CLAUDE.md", "# My Project\n");
      expect(hasOcrInstructions(join(projectDir, "CLAUDE.md"))).toBe(false);
    });

    it("returns true when both markers are present", () => {
      const path = join(projectDir, "CLAUDE.md");
      injectOcrInstructions(path);
      expect(hasOcrInstructions(path)).toBe(true);
    });
  });
});
