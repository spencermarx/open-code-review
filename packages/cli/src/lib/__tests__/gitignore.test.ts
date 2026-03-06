import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureGitignore } from "../gitignore.js";

describe("ensureGitignore", () => {
  let ocrDir: string;

  beforeEach(() => {
    ocrDir = mkdtempSync(join(tmpdir(), "ocr-gitignore-test-"));
  });

  afterEach(() => {
    rmSync(ocrDir, { recursive: true, force: true });
  });

  function readGitignore(): string {
    return readFileSync(join(ocrDir, ".gitignore"), "utf-8");
  }

  function writeGitignore(content: string): void {
    writeFileSync(join(ocrDir, ".gitignore"), content);
  }

  it("creates .gitignore with managed block when file does not exist", () => {
    ensureGitignore(ocrDir);

    const content = readGitignore();
    expect(content).toContain("# OCR:START");
    expect(content).toContain("# OCR:END");
    expect(content).toContain("sessions/");
    expect(content).toContain("data/");
    expect(content).toContain("*.db-shm");
    expect(content).toContain("*.db-wal");
  });

  it("preserves user lines and appends managed block", () => {
    writeGitignore("# My custom ignores\ntmp/\n");

    ensureGitignore(ocrDir);

    const content = readGitignore();
    expect(content).toContain("# My custom ignores");
    expect(content).toContain("tmp/");
    expect(content).toContain("# OCR:START");
    expect(content).toContain("sessions/");
  });

  it("replaces existing managed block with updated entries", () => {
    writeGitignore(
      [
        "# user line",
        "# OCR:START — managed by open-code-review (do not edit this block)",
        "sessions/",
        "# OCR:END",
        "# another user line",
      ].join("\n") + "\n",
    );

    ensureGitignore(ocrDir);

    const content = readGitignore();
    // User lines preserved
    expect(content).toContain("# user line");
    expect(content).toContain("# another user line");
    // New entries present
    expect(content).toContain("data/");
    expect(content).toContain("*.db-shm");
    expect(content).toContain("*.db-wal");
    // Only one managed block
    expect(content.match(/# OCR:START/g)?.length).toBe(1);
    expect(content.match(/# OCR:END/g)?.length).toBe(1);
  });

  it("is idempotent — second run produces identical output", () => {
    ensureGitignore(ocrDir);
    const first = readGitignore();

    ensureGitignore(ocrDir);
    const second = readGitignore();

    expect(second).toBe(first);
  });

  it("strips legacy defaults and produces clean output for v1.4 content", () => {
    writeGitignore("# OCR session files\nsessions/\ndata\n");

    ensureGitignore(ocrDir);

    const content = readGitignore();
    // Legacy lines removed (now covered by managed block)
    expect(content).not.toContain("# OCR session files");
    // Only the managed block remains
    expect(content).toContain("# OCR:START");
    expect(content).toContain("sessions/");
    expect(content).toContain("data/");
    expect(content).toContain("*.db-wal");
  });

  it("strips legacy defaults but preserves user-added lines", () => {
    writeGitignore("# OCR session files\nsessions/\ndata\n# my custom rule\nlogs/\n");

    ensureGitignore(ocrDir);

    const content = readGitignore();
    // Legacy lines removed
    expect(content).not.toContain("# OCR session files");
    // User lines preserved
    expect(content).toContain("# my custom rule");
    expect(content).toContain("logs/");
    // Managed block present
    expect(content).toContain("# OCR:START");
  });

  it("ends with a trailing newline", () => {
    ensureGitignore(ocrDir);
    const content = readGitignore();
    expect(content.endsWith("\n")).toBe(true);
  });
});
