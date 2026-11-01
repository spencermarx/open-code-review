import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
// Raw spawn here is TEST SCAFFOLDING for the process fixtures below — the
// APIs under test are isProcessAlive/descendantPids/reapTree, not the spawn
// wrappers, and `process.execPath` + script files sidestep PATH/PATHEXT and
// shell quoting entirely (no `sleep` binary exists on Windows).
import { spawn, type ChildProcess } from "node:child_process";
import { describe, it, expect, afterAll, vi } from "vitest";
import {
  importModule,
  execBinary,
  execBinaryAsync,
  defaultIconFor,
  killErrorMeansDead,
  isProcessAlive,
  descendantPids,
  reapTree,
  killTreeNow,
  BUILTIN_ICON_MAP,
} from "../index.js";

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

describe("defaultIconFor", () => {
  it("returns the mapped glyph for a built-in reviewer id", () => {
    expect(defaultIconFor("architect", "holistic")).toBe("blocks");
    expect(defaultIconFor("security", "specialist")).toBe("shield-alert");
    expect(defaultIconFor("docs-writer", "specialist")).toBe("file-text");
  });

  it("falls back to 'brain' for an unknown persona", () => {
    expect(defaultIconFor("unknown-persona", "persona")).toBe("brain");
  });

  it("falls back to 'user' for an unknown non-persona reviewer", () => {
    expect(defaultIconFor("my-custom-reviewer", "custom")).toBe("user");
    expect(defaultIconFor("whatever", "specialist")).toBe("user");
  });

  it("never returns an empty string", () => {
    for (const id of ["", "x", "architect", ...Object.keys(BUILTIN_ICON_MAP)]) {
      for (const tier of ["holistic", "specialist", "persona", "custom"]) {
        expect(defaultIconFor(id, tier).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("killErrorMeansDead", () => {
  // The errno contract behind isProcessAlive (and the CLI's defaultIsAlive):
  // only ESRCH is positive evidence of death. Tested synthetically so the
  // contract is pinned deterministically on every OS — manufacturing a real
  // EPERM requires platform-specific pids (pid 1 does not exist on Windows).
  it("treats ESRCH as proof of death", () => {
    expect(killErrorMeansDead(Object.assign(new Error("kill ESRCH"), { code: "ESRCH" }))).toBe(true);
  });

  it("treats EPERM as alive (exists but not ours to signal)", () => {
    expect(killErrorMeansDead(Object.assign(new Error("kill EPERM"), { code: "EPERM" }))).toBe(false);
  });

  it("treats unknown errors and non-Errors as alive (conservative)", () => {
    expect(killErrorMeansDead(new Error("no code"))).toBe(false);
    expect(killErrorMeansDead("not an error")).toBe(false);
    expect(killErrorMeansDead(undefined)).toBe(false);
  });
});

describe("isProcessAlive", () => {
  it("treats an EPERM probe failure as alive (wiring to the classifier)", () => {
    const spy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
    });
    try {
      expect(isProcessAlive(424242)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("process-tree reaping", () => {
  const isWindows = process.platform === "win32";

  // Node script fixtures replace the previous `sleep`-binary children:
  // `sleep` does not exist on Windows (the old test only "passed" there by
  // watching the cmd.exe wrapper that shell:true interposed). Spawning
  // `process.execPath` on a script file is PATH- and quoting-proof on
  // every OS.
  const longLivedFixture = resolve(tmpDir, "long-lived.cjs");
  writeFileSync(longLivedFixture, "setInterval(() => {}, 1 << 30);\n");
  const parentFixture = resolve(tmpDir, "parent.cjs");
  writeFileSync(
    parentFixture,
    [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, [process.argv[2]], { stdio: 'ignore' });",
      // pid handshake: the test learns the grandchild pid from stdout instead
      // of racing a fixed sleep against process startup.
      "console.log(String(child.pid));",
      "setInterval(() => {}, 1 << 30);",
      "",
    ].join("\n"),
  );

  /** Poll `cond` until true or the deadline passes. */
  async function eventually(cond: () => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return cond();
  }

  /** Read the first stdout line (the grandchild pid handshake). */
  function firstLine(proc: ChildProcess): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      let buf = "";
      proc.stdout?.setEncoding("utf-8");
      proc.stdout?.on("data", (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl >= 0) resolvePromise(buf.slice(0, nl).trim());
      });
      proc.on("error", reject);
      setTimeout(() => reject(new Error("no pid handshake within 5s")), 5000);
    });
  }

  it("isProcessAlive reflects a real process's liveness", async () => {
    const proc = spawn(process.execPath, [longLivedFixture], { stdio: "ignore" });
    await eventually(() => proc.pid !== undefined, 1000);
    expect(isProcessAlive(proc.pid!)).toBe(true);
    proc.kill("SIGKILL");
    // Windows handle teardown can lag TerminateProcess — poll, don't sleep.
    expect(await eventually(() => !isProcessAlive(proc.pid!), 3000)).toBe(true);
  });

  it("reapTree kills the whole tree; enumeration matches the per-platform contract", async () => {
    // Parent stays alive until reaped (taskkill /T cannot enumerate orphans),
    // and prints its child's pid so the kill is observable on Windows even
    // though descendantPids is documented to return [] there.
    const parent = spawn(process.execPath, [parentFixture, longLivedFixture], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const grandchildPid = Number(await firstLine(parent));
    expect(Number.isInteger(grandchildPid)).toBe(true);
    expect(isProcessAlive(grandchildPid)).toBe(true);

    const kids = descendantPids(parent.pid!);
    const result = reapTree(parent.pid!, 200);

    if (isWindows) {
      // Documented Windows contract (asserted, not skipped): no `ps`-based
      // enumeration — reaping is delegated to `taskkill /T /F` on the root.
      expect(kids).toEqual([]);
      expect(result).toEqual({ signaled: 1, psAvailable: false });
    } else {
      expect(kids).toContain(grandchildPid);
      // SIGTERM phase covered root + descendants, with `ps` available.
      expect(result.signaled).toBeGreaterThanOrEqual(kids.length + 1);
      expect(result.psAvailable).toBe(true);
    }

    // The platform-neutral observable contract: after reap + grace, the
    // whole tree is dead — on every OS.
    expect(await eventually(() => !isProcessAlive(parent.pid!), 4000)).toBe(true);
    expect(await eventually(() => !isProcessAlive(grandchildPid), 4000)).toBe(true);
  });

  it("killTreeNow kills the whole tree", async () => {
    const parent = spawn(process.execPath, [parentFixture, longLivedFixture], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const grandchildPid = Number(await firstLine(parent));
    expect(isProcessAlive(grandchildPid)).toBe(true);

    killTreeNow(parent.pid!);

    expect(await eventually(() => !isProcessAlive(parent.pid!), 4000)).toBe(true);
    expect(await eventually(() => !isProcessAlive(grandchildPid), 4000)).toBe(true);
  });

  it.skipIf(isWindows)("killTreeNow doesn't wait for a process that ignores SIGTERM", async () => {
    const stubborn = spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    await firstLine(stubborn);

    killTreeNow(stubborn.pid!);

    // Well inside reapTree's default 5s grace, so it can only be a SIGKILL.
    expect(await eventually(() => !isProcessAlive(stubborn.pid!), 2000)).toBe(true);
  });

  it("killTreeNow tolerates a process that is already gone", async () => {
    const proc = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    await new Promise((done) => proc.on("exit", done));
    expect(() => killTreeNow(proc.pid!)).not.toThrow();
  });
});

describe("spawn wrapper contracts", () => {
  // Pinned against the REAL implementation (not consumer-side mocks): the
  // CLI's describeProbeFailure and its hermetic tests assume this exact
  // failure shape, and these contracts are what make the cross-spawn
  // internals swappable. Fixtures use process.execPath — PATH-proof and
  // metacharacter-free on every OS.
  const node = process.execPath;

  it("execBinary returns stdout on success", () => {
    const out = execBinary(node, ["-e", "process.stdout.write('out')"], {
      encoding: "utf-8",
    });
    expect(out).toBe("out");
  });

  it("execBinary passes argv VERBATIM — shell metacharacters are data, not syntax", () => {
    // THE issue-#43 regression pin. Under the old `shell: true` Windows
    // path this argument would have been interpreted by cmd.exe.
    const hostile = 'sonnet & calc.exe | echo "%PATH%" > x';
    const out = execBinary(
      node,
      ["-e", "process.stdout.write(process.argv[1])", hostile],
      { encoding: "utf-8" },
    );
    expect(out).toBe(hostile);
  });

  it("execBinary passes stdin input through", () => {
    const out = execBinary(node, ["-e", "process.stdin.pipe(process.stdout)"], {
      encoding: "utf-8",
      input: "hello",
    });
    expect(out).toBe("hello");
  });

  it("execBinary throws on non-zero exit with the exit code attached", () => {
    let caught: unknown;
    try {
      execBinary(node, ["-e", "console.error('boom'); process.exit(3)"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const e = caught as Error & { status?: number; code?: number; stderr?: string };
    expect(e.status).toBe(3);
    expect(e.code).toBe(3);
    expect(String(e.stderr)).toContain("boom");
  });

  it("execBinary throws ENOENT for a missing binary", () => {
    let caught: unknown;
    try {
      execBinary("definitely-not-a-real-binary-xyz", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: unknown }).code).toBe("ENOENT");
  });

  it("execBinaryAsync resolves stdout and stderr", async () => {
    const { stdout, stderr } = await execBinaryAsync(
      node,
      ["-e", "console.log('o'); console.error('e')"],
      { encoding: "utf-8" },
    );
    expect(stdout.trim()).toBe("o");
    expect(stderr.trim()).toBe("e");
  });

  it("execBinaryAsync rejects non-zero exit with { code, stderr, killed: false }", async () => {
    let caught: unknown;
    try {
      await execBinaryAsync(node, ["-e", "console.error('nope'); process.exit(2)"], {
        encoding: "utf-8",
      });
    } catch (err) {
      caught = err;
    }
    const e = caught as Error & { code?: unknown; stderr?: string; killed?: boolean };
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(2);
    expect(String(e.stderr)).toContain("nope");
    expect(e.killed).toBe(false);
  });

  it("execBinaryAsync rejects ENOENT for a missing binary", async () => {
    let caught: unknown;
    try {
      await execBinaryAsync("definitely-not-a-real-binary-xyz", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as { code?: unknown }).code).toBe("ENOENT");
  });

  it("execBinaryAsync kills on timeout and reports killed: true", async () => {
    let caught: unknown;
    try {
      await execBinaryAsync(node, ["-e", "setInterval(() => {}, 1 << 30)"], {
        encoding: "utf-8",
        timeout: 300,
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as { killed?: boolean }).killed).toBe(true);
  });

  it("execBinaryAsync kills on maxBuffer overflow and reports killed: true", async () => {
    let caught: unknown;
    try {
      // Default maxBuffer is 1 MiB (execFile's historical default) — write 2 MiB.
      await execBinaryAsync(
        node,
        ["-e", "process.stdout.write('x'.repeat(2 * 1024 * 1024))"],
        { encoding: "utf-8", timeout: 10_000 },
      );
    } catch (err) {
      caught = err;
    }
    expect((caught as { killed?: boolean }).killed).toBe(true);
  });
});
