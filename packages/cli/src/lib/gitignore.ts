/**
 * Managed .gitignore for the .ocr/ directory.
 *
 * Uses a marker-delimited block (like injector.ts does for CLAUDE.md)
 * so that `ocr init` and `ocr update` can refresh OCR-owned entries
 * without clobbering user customizations.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_MARKER =
  "# OCR:START — managed by open-code-review (do not edit this block)";
const END_MARKER = "# OCR:END";

const MANAGED_ENTRIES = ["sessions/", "data/", "*.db-shm", "*.db-wal"];

/**
 * Lines from previous OCR-generated defaults that are now superseded
 * by the managed block. Stripped during migration so users don't end
 * up with duplicates.
 */
const LEGACY_LINES = new Set([
  "# OCR session files",
  "sessions/",
  "data",
  "data/",
]);

function buildManagedBlock(): string {
  return [START_MARKER, ...MANAGED_ENTRIES, END_MARKER].join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove lines that were part of the old OCR-generated defaults,
 * now covered by the managed block.
 */
function stripLegacyLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !LEGACY_LINES.has(line.trim()))
    .join("\n");
}

/**
 * Ensure `.ocr/.gitignore` contains the current managed block.
 *
 * - If the file doesn't exist, creates it with just the managed block.
 * - If it exists with a managed block, replaces the block contents.
 * - If it exists without a managed block, strips legacy defaults and
 *   appends the managed block.
 *
 * User-added lines outside the block are always preserved.
 */
export function ensureGitignore(ocrDir: string): void {
  const gitignorePath = join(ocrDir, ".gitignore");
  const block = buildManagedBlock();

  let content = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";

  const blockRegex = new RegExp(
    `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
    "g",
  );

  if (blockRegex.test(content)) {
    // Replace existing managed block
    content = content.replace(
      new RegExp(
        `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
        "g",
      ),
      block + "\n",
    );
  } else {
    // Strip legacy OCR defaults before appending managed block
    content = stripLegacyLines(content).trimEnd();
    if (content.length > 0) {
      content += "\n\n";
    }
    content += block + "\n";
  }

  writeFileSync(gitignorePath, content);
}
