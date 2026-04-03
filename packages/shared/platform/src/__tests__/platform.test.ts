import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, afterAll } from "vitest";
import { importModule, execBinary, execBinaryAsync } from "../index.js";

/**
 * Behavioral tests for platform utilities.
 *
 * These test observable behavior — not implementation details.
 * Cross-platform coverage (Windows vs POSIX) is verified by the
 * GitHub Actions OS matrix, not by mocking process.platform.
 */

// Create a temp module for importModule tests
const tmpDir = realpathSync(mkdtempSync(resolve(tmpdir(), "ocr-platform-test-")));
const tmpModule = resolve(tmpDir, "test-module.mjs");
writeFileSync(tmpModule, "export const greeting = 'hello from module';");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("importModule", () => {
  it("dynamically imports a module from an absolute file path", async () => {
    const mod = await importModule<{ greeting: string }>(tmpModule);
    expect(mod.greeting).toBe("hello from module");
  });

  it("resolves named exports from the imported module", async () => {
    const multiExportPath = resolve(tmpDir, "multi.mjs");
    writeFileSync(
      multiExportPath,
      "export const a = 1; export const b = 2;",
    );

    const mod = await importModule<{ a: number; b: number }>(multiExportPath);
    expect(mod.a).toBe(1);
    expect(mod.b).toBe(2);
  });

  it("rejects with an error for a non-existent path", async () => {
    await expect(
      importModule("/tmp/does-not-exist-abcdef.mjs"),
    ).rejects.toThrow();
  });
});

describe("execBinary", () => {
  it("executes a binary and returns its stdout", () => {
    const output = execBinary("git", ["--version"], { encoding: "utf-8" });
    expect(output).toMatch(/git version \d+\.\d+/);
  });

  it("passes arguments correctly to the binary", () => {
    const output = execBinary("node", ["-e", "console.log('hello')"], {
      encoding: "utf-8",
    });
    expect(output.trim()).toBe("hello");
  });

  it("throws when the binary does not exist", () => {
    expect(() =>
      execBinary("nonexistent-binary-xyz", ["--version"], {
        encoding: "utf-8",
        timeout: 2000,
      }),
    ).toThrow();
  });
});

describe("execBinaryAsync", () => {
  it("executes a binary and resolves with its stdout", async () => {
    const { stdout } = await execBinaryAsync("node", ["-e", "console.log('async')"], {
      encoding: "utf-8",
    });
    expect(stdout.trim()).toBe("async");
  });

  it("rejects when the binary does not exist", async () => {
    await expect(
      execBinaryAsync("nonexistent-binary-xyz", ["--version"], {
        encoding: "utf-8",
        timeout: 2000,
      }),
    ).rejects.toThrow();
  });
});

describe("spawnBinary", () => {
  // spawnBinary returns a ChildProcess — we verify it spawns
  // correctly by reading stdout from a known command.
  it("spawns a process that produces output", async () => {
    const { spawnBinary } = await import("../index.js");

    const proc = spawnBinary("node", ["-e", "console.log('spawned')"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = await new Promise<string>((resolve, reject) => {
      let data = "";
      proc.stdout!.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      proc.on("close", () => resolve(data.trim()));
      proc.on("error", reject);
    });

    expect(output).toBe("spawned");
  });

  it("passes cwd option to the spawned process", async () => {
    const { spawnBinary } = await import("../index.js");

    const proc = spawnBinary("node", ["-e", "console.log(process.cwd())"], {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = await new Promise<string>((resolve, reject) => {
      let data = "";
      proc.stdout!.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      proc.on("close", () => resolve(data.trim()));
      proc.on("error", reject);
    });

    expect(output).toBe(tmpDir);
  });
});
