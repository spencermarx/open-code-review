import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterAll } from "vitest";
import { resolveDetachedWindowsTarget } from "../index.js";

/**
 * Pins the Windows detached-spawn shim redirect in `spawn.ts`.
 *
 * The defect: cross-spawn runs a `.cmd`/`.bat` shim as
 * `cmd.exe /d /s /c "tool.cmd …"`, and under `detached: true` Node adds
 * `DETACHED_PROCESS` — a console-less cmd.exe returns immediately without
 * propagating its inherited stdout/stderr to the program it launches. The
 * caller saw a near-instant exit code and an empty log. It is a two-variable
 * interaction: a native `.exe` detached works, and the same shim
 * NOT detached works; only the combination fails.
 *
 * These tests drive the `platform` OS seam rather than mocking
 * `process.platform`, so the Windows rules are covered on every CI OS (same
 * convention as `buildChildEnvForPlatform`). Shims are real files with the
 * exact text npm generates.
 */

const tmpDir = realpathSync(mkdtempSync(resolve(tmpdir(), "ocr-shim-test-")));
const binDir = join(tmpDir, "npm-global");
mkdirSync(binDir, { recursive: true });

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** A real npm shim whose payload is a native executable (e.g. `claude`). */
function writeNativeShim(name: string, exeRelPath: string): void {
  writeFileSync(
    join(binDir, `${name}.cmd`),
    [
      "@ECHO off",
      "GOTO start",
      ":find_dp0",
      "SET dp0=%~dp0",
      "EXIT /b",
      ":start",
      "SETLOCAL",
      "CALL :find_dp0",
      `"%dp0%\\${exeRelPath}"   %*`,
      "",
    ].join("\r\n"),
  );
}

/** A real npm shim whose payload is a JS entry point (e.g. `ocr`, `npx`). */
function writeNodeShim(name: string, jsRelPath: string): void {
  writeFileSync(
    join(binDir, `${name}.cmd`),
    [
      "@ECHO off",
      "GOTO start",
      ":find_dp0",
      "SET dp0=%~dp0",
      "EXIT /b",
      ":start",
      "SETLOCAL",
      "CALL :find_dp0",
      "",
      'IF EXIST "%dp0%\\node.exe" (',
      '  SET "_prog=%dp0%\\node.exe"',
      ") ELSE (",
      '  SET "_prog=node"',
      ")",
      "",
      `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${jsRelPath}" %*`,
      "",
    ].join("\r\n"),
  );
}

function touch(relPath: string): string {
  const full = join(binDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
  return full;
}

const env = () => ({ PATH: binDir });
const call = (binary: string, args: string[] = []) =>
  resolveDetachedWindowsTarget("win32", binary, args, env(), tmpDir);

describe("resolveDetachedWindowsTarget — native-executable shims", () => {
  it("redirects a shim to the .exe it launches, preserving argv", () => {
    const exe = touch("node_modules/@vendor/tool/bin/tool.exe");
    writeNativeShim("tool", "node_modules\\@vendor\\tool\\bin\\tool.exe");

    expect(call("tool", ["--model", "a b", "-p"])).toEqual({
      command: exe,
      args: ["--model", "a b", "-p"],
    });
  });

  it("returns null when the shim's target does not exist on disk", () => {
    writeNativeShim("missing-target", "node_modules\\gone\\bin\\gone.exe");
    expect(call("missing-target")).toBeNull();
  });
});

describe("resolveDetachedWindowsTarget — node-script shims", () => {
  it("runs this process's node against the script when no node is bundled", () => {
    const script = touch("node_modules/@scope/cli/dist/index.js");
    writeNodeShim("scripted", "node_modules\\@scope\\cli\\dist\\index.js");

    expect(call("scripted", ["review", "--resume", "sid"])).toEqual({
      command: process.execPath,
      args: [script, "review", "--resume", "sid"],
    });
  });

  it("prefers the shim's own bundled node.exe when it exists", () => {
    const bundled = touch("node.exe");
    const script = touch("node_modules/bundled-cli/cli.js");
    writeNodeShim("bundled", "node_modules\\bundled-cli\\cli.js");

    expect(call("bundled", ["x"])).toEqual({
      command: bundled,
      args: [script, "x"],
    });
    // Regression guard: `%dp0%\node.exe` is referenced BEFORE the script in
    // the shim, so a naive "first existing reference wins" would return the
    // bare interpreter and silently drop the script.
    rmSync(bundled);
  });
});

describe("resolveDetachedWindowsTarget — cases it must leave alone", () => {
  it("does nothing off Windows", () => {
    touch("node_modules/@vendor/tool/bin/tool.exe");
    writeNativeShim("tool", "node_modules\\@vendor\\tool\\bin\\tool.exe");

    for (const platform of ["linux", "darwin"] as NodeJS.Platform[]) {
      expect(
        resolveDetachedWindowsTarget(platform, "tool", [], env(), tmpDir),
      ).toBeNull();
    }
  });

  it("respects an explicit path instead of searching PATH", () => {
    expect(call("./local/tool")).toBeNull();
    expect(call(".\\local\\tool")).toBeNull();
  });

  it("leaves an already-native binary name alone", () => {
    expect(call("tool.exe")).toBeNull();
  });

  it("returns null for a binary that is not on PATH at all", () => {
    expect(call("definitely-not-installed")).toBeNull();
  });

  it("returns null when PATH resolution lands on a native .exe", () => {
    touch("direct.exe");
    // PATHEXT puts .EXE before .CMD, so `direct` resolves to the .exe and
    // cross-spawn already skips the cmd.exe wrapper — nothing to rewrite.
    expect(call("direct")).toBeNull();
  });

  it("returns null for a batch file that is not an npm shim", () => {
    writeFileSync(join(binDir, "hand-written.cmd"), "@echo hello\r\n");
    expect(call("hand-written")).toBeNull();
  });
});

describe("resolveDetachedWindowsTarget — PATH handling", () => {
  it("accepts any casing of the PATH key", () => {
    const exe = touch("node_modules/@vendor/cased/bin/cased.exe");
    writeNativeShim("cased", "node_modules\\@vendor\\cased\\bin\\cased.exe");

    for (const key of ["PATH", "Path", "path"]) {
      expect(
        resolveDetachedWindowsTarget("win32", "cased", [], { [key]: binDir }, tmpDir),
      ).toEqual({ command: exe, args: [] });
    }
  });

  it("unquotes quoted PATH entries and skips empty ones", () => {
    const exe = touch("node_modules/@vendor/quoted/bin/quoted.exe");
    writeNativeShim("quoted", "node_modules\\@vendor\\quoted\\bin\\quoted.exe");

    expect(
      resolveDetachedWindowsTarget(
        "win32",
        "quoted",
        [],
        { PATH: `;"${binDir}";` },
        tmpDir,
      ),
    ).toEqual({ command: exe, args: [] });
  });

  it("searches the spawn cwd before PATH, as cmd.exe and which do", () => {
    const exe = touch("node_modules/@vendor/incwd/bin/incwd.exe");
    writeNativeShim("incwd", "node_modules\\@vendor\\incwd\\bin\\incwd.exe");

    // Empty PATH — only the cwd lookup can find the shim.
    expect(
      resolveDetachedWindowsTarget("win32", "incwd", [], { PATH: "" }, binDir),
    ).toEqual({ command: exe, args: [] });
  });
});
