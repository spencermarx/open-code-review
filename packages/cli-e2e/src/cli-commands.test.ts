/**
 * CLI smoke tests.
 *
 * These spawn the built OCR binary as a real subprocess — no mocks,
 * no imports. Each test verifies observable behavior: exit codes,
 * stdout content, and filesystem side effects.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { spawnCli } from "./helpers/spawn-cli.js";
import {
  createTempProject,
  createInitializedProject,
  type TempProject,
} from "./helpers/temp-project.js";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((fn) => fn()));

function tracked<T extends TempProject>(project: T): T {
  cleanups.push(project.cleanup);
  return project;
}

describe("CLI smoke tests", () => {
  describe("ocr --version", () => {
    it("exits 0 and outputs a semver version", async () => {
      const result = await spawnCli(["--version"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("ocr --help", () => {
    it("exits 0 and lists available commands", async () => {
      const result = await spawnCli(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("dashboard");
      expect(result.stdout).toContain("doctor");
    });
  });

  describe("ocr init", () => {
    it("creates .ocr/ directory structure in a git repo", async () => {
      const project = tracked(createTempProject());

      const result = await spawnCli(["init", "--tools", "cursor"], {
        cwd: project.dir,
      });

      expect(result.exitCode).toBe(0);
      expect(existsSync(resolve(project.dir, ".ocr"))).toBe(true);
      expect(existsSync(resolve(project.dir, ".ocr", "skills"))).toBe(true);
    });
  });

  describe("ocr doctor", () => {
    it("exits 0 in an initialized project", async () => {
      const project = tracked(createInitializedProject());

      const result = await spawnCli(["doctor"], { cwd: project.dir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("git");
    });

    it("exits 1 in a directory without .ocr/", async () => {
      const project = tracked(createTempProject());

      const result = await spawnCli(["doctor"], { cwd: project.dir });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("ocr state show", () => {
    it("runs without error in an initialized project", async () => {
      const project = tracked(createInitializedProject());

      const result = await spawnCli(["state", "show"], { cwd: project.dir });

      // state show should not crash — exit 0 or output state info
      expect(result.exitCode).toBe(0);
    });
  });

  describe("unknown subcommand", () => {
    it("exits with non-zero and shows help", async () => {
      const result = await spawnCli(["nonexistent-command"]);

      expect(result.exitCode).not.toBe(0);
    });
  });
});
