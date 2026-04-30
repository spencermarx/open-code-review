/**
 * Create temporary project directories for e2e tests.
 *
 * Many OCR commands require a git repo and/or an initialized `.ocr/`
 * directory. These helpers set up the minimal structure needed.
 */

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

export type TempProject = {
  dir: string;
  cleanup: () => void;
};

/**
 * Create a temp directory with a git repo (required by most OCR commands).
 */
export function createTempProject(): TempProject {
  const dir = realpathSync(
    mkdtempSync(resolve(tmpdir(), "ocr-e2e-")),
  );

  // Initialize git repo — many commands require this
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  // Set identity for the temp repo (CI runners don't have global git config)
  execFileSync("git", ["config", "user.email", "test@ocr.dev"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "OCR Test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
    stdio: "ignore",
  });

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create a temp project with `.ocr/` initialized (satisfies `requireOcrSetup`).
 */
export function createInitializedProject(): TempProject {
  const project = createTempProject();

  mkdirSync(resolve(project.dir, ".ocr", "skills"), { recursive: true });
  mkdirSync(resolve(project.dir, ".ocr", "sessions"), { recursive: true });

  return project;
}

/**
 * Write a `default_team` block to the project's `.ocr/config.yaml`.
 *
 * Helper for tests that need to verify the three-form schema behavior end
 * to end — they read the resolved composition back via `ocr team resolve`.
 */
export function writeConfigYaml(project: TempProject, yamlBody: string): void {
  const configPath = resolve(project.dir, ".ocr", "config.yaml");
  writeFileSync(configPath, yamlBody, "utf-8");
}
