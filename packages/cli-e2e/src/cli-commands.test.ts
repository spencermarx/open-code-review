/**
 * CLI smoke tests.
 *
 * These spawn the built OCR binary as a real subprocess — no mocks,
 * no imports. Each test verifies observable behavior: exit codes,
 * stdout content, and filesystem side effects.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

  describe("ocr doctor — storage engine", () => {
    it("loads node:sqlite and does NOT leak the experimental warning to stderr", async () => {
      // `doctor` probes the engine, which loads node:sqlite. The runtime guard
      // must suppress its one-line ExperimentalWarning so the engine load is
      // honest + clean (the machine-readable stdout contract stays untouched).
      const result = await spawnCli(["doctor"]);

      expect(result.stdout).toContain("node:sqlite");
      expect(result.stdout).not.toContain("failed");
      expect(result.stderr).not.toMatch(/experimental/i);
    });

    it("--engine-only --probe-write exits 0 from a non-OCR dir (the install-gate condition)", async () => {
      // The release install gate runs from a bare consumer dir (no .ocr/, no AI
      // CLI). A full `doctor` exits 1 on those expected gaps; --engine-only
      // checks only the engine + write probe and exits on THAT — so the gate's
      // assertions are reachable under `set -o pipefail`.
      const bare = tracked(createTempProject()); // git repo, NOT `ocr init`'d
      const result = await spawnCli(["doctor", "--engine-only", "--probe-write"], {
        cwd: bare.dir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("node:sqlite");
      expect(result.stdout).toContain("write probe");
      expect(result.stdout).not.toContain("OCR Installation");
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
      expect(
        existsSync(resolve(project.dir, ".cursor", "commands", "ocr", "review.md")),
      ).toBe(true);
      expect(result.stderr).not.toContain("Some installations failed");
    });
  });

  describe("universal agents target", () => {
    const pointerOf = (dir: string) =>
      resolve(dir, ".agents", "skills", "ocr", "SKILL.md");

    it("ocr init --tools agents writes only the skill pointer", async () => {
      const project = tracked(createTempProject());

      const result = await spawnCli(["init", "--tools", "agents"], {
        cwd: project.dir,
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(pointerOf(project.dir), "utf-8")).toContain(
        "`.ocr/skills/SKILL.md` at the repository root",
      );
      expect(existsSync(resolve(project.dir, ".ocr", "skills", "SKILL.md"))).toBe(true);
      expect(existsSync(resolve(project.dir, ".agents", "commands"))).toBe(false);
      // No slash commands were installed, so Next steps does not advertise them.
      const nextSteps = result.stdout.split("Next steps:")[1] ?? "";
      expect(nextSteps).toContain("review my changes");
      expect(nextSteps).not.toContain("/ocr:review");
    });

    it("ocr update --dry-run lists the pointer among files it would update", async () => {
      const project = tracked(createTempProject());
      await spawnCli(["init", "--tools", "agents"], { cwd: project.dir });

      const result = await spawnCli(["update", "--dry-run"], { cwd: project.dir });

      expect(result.exitCode).toBe(0);
      const wouldUpdate = result.stdout.split("Preserved (not modified):")[0] ?? "";
      expect(wouldUpdate).toContain(".agents/skills/ocr/SKILL.md (skill pointer)");
    });

    it("ocr update refreshes an outdated OCR-managed pointer", async () => {
      const project = tracked(createTempProject());
      await spawnCli(["init", "--tools", "agents"], { cwd: project.dir });
      const fresh = readFileSync(pointerOf(project.dir), "utf-8");
      writeFileSync(
        pointerOf(project.dir),
        "---\nname: ocr\n---\n\nThis skill is managed by Open Code Review.\n\nold\n",
      );

      const result = await spawnCli(["update"], { cwd: project.dir });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(pointerOf(project.dir), "utf-8")).toBe(fresh);
    });

    it("ocr host capabilities omits agents but --tool agents resolves the default", async () => {
      const all = await spawnCli(["host", "capabilities", "--json"]);
      const single = await spawnCli(["host", "capabilities", "--tool", "agents", "--json"]);

      expect(all.exitCode).toBe(0);
      const ids = (JSON.parse(all.stdout) as { id: string }[]).map((row) => row.id);
      expect(ids).toContain("claude");
      expect(ids).not.toContain("agents");
      expect(single.exitCode).toBe(0);
      expect(JSON.parse(single.stdout)).toMatchObject({
        id: "agents",
        subagentSpawn: false,
        perTaskModel: false,
      });
    });

    it("ocr init --help lists the valid tool ids", async () => {
      const result = await spawnCli(["init", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("agents");
      expect(result.stdout).toContain("claude");
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

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No active session");
    });
  });

  describe("unknown subcommand", () => {
    it("exits with non-zero and shows help", async () => {
      const result = await spawnCli(["nonexistent-command"]);

      expect(result.exitCode).not.toBe(0);
    });
  });
});
