import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

export type OcrSetupStatus = {
  valid: boolean;
  ocrDir: string;
  skillsDir: string;
  sessionsDir: string;
  hasSkills: boolean;
  hasSessions: boolean;
};

/**
 * Check if OCR is properly set up in the target directory
 */
export function checkOcrSetup(targetDir: string): OcrSetupStatus {
  const ocrDir = join(targetDir, ".ocr");
  const skillsDir = join(ocrDir, "skills");
  const sessionsDir = join(ocrDir, "sessions");

  const hasOcrDir = existsSync(ocrDir);
  const hasSkills = existsSync(skillsDir);
  const hasSessions = existsSync(sessionsDir);

  return {
    valid: hasOcrDir && hasSkills,
    ocrDir,
    skillsDir,
    sessionsDir,
    hasSkills,
    hasSessions,
  };
}

/**
 * Guard that requires OCR to be set up. Exits with helpful message if not.
 * Use at the start of commands that require OCR to be initialized.
 */
export function requireOcrSetup(targetDir: string): OcrSetupStatus {
  const status = checkOcrSetup(targetDir);

  if (!status.valid) {
    console.log();
    console.log(chalk.red.bold("  ✗ OCR is not set up in this directory"));
    console.log();

    if (!existsSync(status.ocrDir)) {
      console.log(chalk.dim("  The .ocr directory was not found."));
    } else if (!status.hasSkills) {
      console.log(chalk.dim("  The .ocr/skills directory is missing."));
      console.log(chalk.dim("  OCR may have been partially installed."));
    }

    console.log();
    console.log(chalk.dim("  To set up OCR, run:"));
    console.log();
    console.log(chalk.white("    ocr init"));
    console.log();
    console.log(chalk.dim("  Or with npx:"));
    console.log();
    console.log(chalk.white("    npx @open-code-review/cli init"));
    console.log();

    process.exit(1);
  }

  return status;
}

/**
 * Ensure the sessions directory exists, creating it JIT if needed.
 * Returns the sessions directory path.
 */
export function ensureSessionsDir(targetDir: string): string {
  const sessionsDir = join(targetDir, ".ocr", "sessions");

  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  return sessionsDir;
}

/**
 * Ensure a specific session directory exists, creating it JIT if needed.
 * Returns the session directory path.
 */
export function ensureSessionDir(targetDir: string, sessionId: string): string {
  const sessionDir = join(targetDir, ".ocr", "sessions", sessionId);

  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  // Also ensure reviews subdirectory
  const reviewsDir = join(sessionDir, "reviews");
  if (!existsSync(reviewsDir)) {
    mkdirSync(reviewsDir, { recursive: true });
  }

  return sessionDir;
}

/**
 * Generate a session ID based on current date and branch name
 */
export function generateSessionId(branchName?: string): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const branch = branchName?.replace(/\//g, "-") ?? "main";
  return `${date}-${branch}`;
}
