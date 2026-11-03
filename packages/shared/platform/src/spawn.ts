/**
 * Process-spawn wrappers — the ONLY sanctioned way OCR production code
 * starts child processes (a repo-invariant test enforces this).
 *
 * Arguments are passed VERBATIM as argv on every platform — never through
 * an interpreting shell. Windows `.cmd`/`.bat` shim resolution (npm-installed
 * binaries like `claude`, `opencode`, `ocr`, `gh`) is handled by cross-spawn,
 * which spawns cmd.exe itself with Microsoft-rules argument quoting plus
 * cmd-metacharacter escaping. The previous implementation passed
 * `shell: true` on Windows, which made every argv string part of one
 * cmd.exe command line — Node does not escape arguments under `shell:
 * true`, so config- or UI-sourced strings (model ids, prompts) became a
 * command-injection surface (issue #43). Plain shell-less spawning of
 * `.cmd` is not an option either: Node rejects it with EINVAL since
 * CVE-2024-27980.
 *
 * Exec semantics (throw-on-failure, the async `{ code, stderr, killed }`
 * rejection shape, timeout kills, the 1 MiB default maxBuffer) are
 * re-created here on top of cross-spawn — it only provides spawn/spawn.sync
 * — and are pinned by contract tests in `__tests__/platform.test.ts`
 * against this real implementation. `describeProbeFailure` in the CLI's
 * model discovery is the canonical consumer of the rejection shape.
 *
 * Residual caveat (defense-in-depth rationale for the parse-boundary
 * model-id validation): argument handling inside a `.cmd` shim itself is
 * only as good as the shim; `%VAR%`-expansion corner cases are the
 * historically weakest spot of cmd escaping, which is why the validation
 * layer excludes `%` from the vendor-id syntax class.
 *
 * One Windows case defeats that cmd.exe wrapper entirely — see
 * {@link resolveDetachedWindowsTarget}: a DETACHED spawn of a `.cmd` shim
 * loses the child's stdio and returns before the real program has run.
 */

import crossSpawn from "cross-spawn";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve as resolvePath } from "node:path";
import type {
  ExecFileOptions,
  SpawnOptions,
  SpawnSyncOptions,
  ExecFileSyncOptions,
  ChildProcess,
} from "node:child_process";

/** execFile's historical default — re-created because spawn has no maxBuffer. */
const DEFAULT_MAX_BUFFER = 1024 * 1024;

/**
 * The options {@link execBinaryAsync} actually honors — a deliberately narrow
 * subset of `ExecFileOptions`. The previous signature advertised the full
 * `ExecFileOptions` (`input`, `signal`, `stdio`, `killSignal`, …) while the
 * body forwarded only these, silently dropping the rest. Narrowing makes the
 * contract honest so a caller can't pass `input`/`signal` and expect them to
 * take effect (issue #43 review, should-fix). To honor more, widen this type
 * AND forward the new field in the body — keep the two in lockstep.
 */
export type ExecBinaryAsyncOptions = {
  encoding: BufferEncoding;
  cwd?: ExecFileOptions["cwd"];
  env?: ExecFileOptions["env"];
  /** Kill the child and reject with `killed: true` after this many ms. */
  timeout?: number;
  /** Reject (after killing) once buffered stdout/stderr exceeds this. */
  maxBuffer?: number;
};

/**
 * The rejection shape of {@link execBinary} and {@link execBinaryAsync}.
 * Consumers (model discovery's `describeProbeFailure`, the dashboard team
 * route) should narrow a caught error with `as ExecError` rather than
 * re-declaring the shape inline. Every field is optional: which ones are
 * present depends on the failure class (ENOENT vs non-zero exit vs timeout).
 */
export type ExecError = Error & {
  /** Numeric exit code, or `"ENOENT"` when the binary is missing. */
  code?: number | string;
  /** spawnSync's numeric exit status (sync path only). */
  status?: number | null;
  /** Signal that terminated the child (e.g. on timeout/overflow kill). */
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  /** True when the child was killed by our timeout/maxBuffer guard. */
  killed?: boolean;
  pid?: number;
};

/**
 * Execute a binary synchronously. Throws on any failure — missing binary
 * (`code: "ENOENT"` on every platform), non-zero exit (`status`/`code` =
 * the numeric exit code, with `stdout`/`stderr`/`signal` attached), or
 * timeout. Returns the child's stdout decoded with `opts.encoding`.
 * `input`, `stdio`, `timeout`, `cwd`, `env`, and `maxBuffer` pass through
 * to spawnSync.
 */
export function execBinary(
  binary: string,
  args: string[],
  opts: ExecFileSyncOptions & { encoding: BufferEncoding },
): string {
  const result = crossSpawn.sync(binary, args, {
    maxBuffer: DEFAULT_MAX_BUFFER,
    ...opts,
  } as SpawnSyncOptions);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(
      new Error(
        `Command failed: ${binary} ${args.join(" ")}\n${String(result.stderr ?? "")}`,
      ),
      {
        status: result.status,
        code: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        pid: result.pid,
      },
    );
  }
  return result.stdout as unknown as string;
}

/**
 * Execute a binary asynchronously. Resolves `{ stdout, stderr }` on exit 0.
 * Rejects with an Error carrying `{ code: number | "ENOENT", stderr,
 * stdout, killed, signal }`:
 *   - missing binary → `code: "ENOENT"` (cross-spawn's enoent shim makes
 *     this true on Windows too — previously cmd.exe reported exit 1 and
 *     the "not installed" branch of probe-failure reporting could never
 *     fire there);
 *   - non-zero exit → `code` is the numeric exit code, `killed: false`;
 *   - timeout or maxBuffer overflow → the child is killed and
 *     `killed: true` (mirroring promisified execFile, which model
 *     discovery's `describeProbeFailure` keys on).
 */
export async function execBinaryAsync(
  binary: string,
  args: string[],
  opts: ExecBinaryAsyncOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = crossSpawn(binary, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
    });

    const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
    let stdout = "";
    let stderr = "";
    // Load-bearing initial value: `killed` stays false unless OUR timeout /
    // maxBuffer guard kills the child, which is exactly how consumers
    // (describeProbeFailure) tell an our-kill timeout from an ENOENT/exit. Do
    // not initialize it lazily or derive it from the close signal.
    let killed = false;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    const overflow = (): void => {
      // Mirror execFile: kill and report killed=true; the close handler
      // rejects once the process is gone.
      killed = true;
      child.kill();
    };

    child.stdout?.setEncoding(opts.encoding);
    child.stderr?.setEncoding(opts.encoding);
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) overflow();
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) overflow();
    });

    const timer = opts.timeout
      ? setTimeout(() => {
          killed = true;
          child.kill();
        }, opts.timeout)
      : undefined;

    // ENOENT (and other spawn-layer failures) arrive here — including on
    // Windows, via cross-spawn's enoent shim. `close` may still follow;
    // the settled flag keeps the first verdict.
    child.on("error", (err) => {
      settle(() =>
        rejectPromise(Object.assign(err, { stdout, stderr, killed })),
      );
    });

    child.on("close", (code, signal) => {
      settle(() => {
        if (code === 0 && !killed) {
          resolvePromise({ stdout, stderr });
          return;
        }
        rejectPromise(
          Object.assign(
            new Error(
              `Command failed: ${binary} ${args.join(" ")}\n${stderr}`,
            ),
            {
              code: code ?? undefined,
              signal,
              stdout,
              stderr,
              killed,
            },
          ),
        );
      });
    });
  });
}

// ── Windows detached-spawn shim resolution ──

/** What cross-spawn's `isExecutableRegExp` treats as needing no cmd.exe. */
const WINDOWS_NATIVE_EXE = /\.(?:com|exe)$/i;
/** The batch shims that DO force cross-spawn's cmd.exe wrapper. */
const WINDOWS_BATCH_SHIM = /\.(?:cmd|bat)$/i;
/** Node entry points an npm batch shim can delegate to. */
const NODE_ENTRY = /\.(?:c|m)?js$/i;
/** which@2's fallback when PATHEXT is unset. */
const DEFAULT_PATHEXT = ".EXE;.CMD;.BAT;.COM";
/**
 * Windows' PATH/PATHEXT separator, hard-coded rather than taken from
 * `node:path`'s host-dependent `delimiter`: this code only ever runs for
 * `platform === "win32"`, and a host-dependent delimiter would make the OS
 * seam below untestable from POSIX CI runs (`:` would split neither a
 * Windows PATH nor PATHEXT correctly).
 */
const WINDOWS_PATH_DELIMITER = ";";

/** PATH is case-insensitive on Windows (`Path`, `PATH`, `path` all occur). */
function pathValueOf(env: NodeJS.ProcessEnv): string {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") {
      const value = env[key];
      if (value) return value;
    }
  }
  return "";
}

/**
 * Locate `command` the way cross-spawn does, so we inspect the SAME file it
 * would have spawned. Mirrors which@2 `getPathInfo`: cwd first on Windows,
 * then PATH entries (quoted entries unquoted), directory-major with PATHEXT
 * tried in order within each directory. PATHEXT is read from `process.env`
 * because which only consults `opt.pathExt`, which cross-spawn leaves unset
 * on its first resolution attempt.
 *
 * Only which's FIRST attempt is mirrored: the bare-name fallback can never
 * yield a batch shim, which is the only thing this resolver acts on.
 */
function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): string | null {
  const dirs = [cwd, ...pathValueOf(env).split(WINDOWS_PATH_DELIMITER)];
  const exts = (process.env["PATHEXT"] || DEFAULT_PATHEXT).split(
    WINDOWS_PATH_DELIMITER,
  );
  for (const rawDir of dirs) {
    if (!rawDir) continue;
    const dir = /^".*"$/.test(rawDir) ? rawDir.slice(1, -1) : rawDir;
    for (const ext of exts) {
      if (!ext) continue;
      const candidate = resolvePath(dir, command + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Read an npm-generated `.cmd`/`.bat` shim and recover the program it runs.
 *
 * Both npm shim shapes reference their payload as `"%dp0%\<relative path>"`
 * (`%dp0%` being the shim's own directory):
 *
 *   native:  "%dp0%\node_modules\<pkg>\bin\tool.exe"   %*
 *   node:    ... "%_prog%"  "%dp0%\node_modules\<pkg>\dist\index.js" %*
 *
 * A JS payload wins over a native one when both are referenced: the node
 * shim names `%dp0%\node.exe` (an optional npm-bundled node) BEFORE its
 * script, and returning that bare interpreter would drop the script and run
 * node against the caller's argv. Prefer the shim's own bundled node when it
 * exists, else this process's node — matching the shim's `_prog` fallback.
 *
 * Returns `null` for anything that does not match exactly; the caller then
 * leaves the spawn alone.
 */
function readBatchShimTarget(
  shimPath: string,
): { command: string; prefixArgs: string[] } | null {
  let text: string;
  try {
    text = readFileSync(shimPath, "utf8");
  } catch {
    return null;
  }
  const shimDir = dirname(shimPath);
  const referenced = [...text.matchAll(/"%dp0%[\\/]([^"\r\n]+)"/gi)]
    .map((match) => resolvePath(shimDir, match[1]!))
    .filter((candidate) => existsSync(candidate));

  const script = referenced.find((candidate) => NODE_ENTRY.test(candidate));
  if (script) {
    const bundledNode = referenced.find(
      (candidate) => basename(candidate).toLowerCase() === "node.exe",
    );
    return { command: bundledNode ?? process.execPath, prefixArgs: [script] };
  }

  const exe = referenced.find((candidate) => WINDOWS_NATIVE_EXE.test(candidate));
  return exe ? { command: exe, prefixArgs: [] } : null;
}

/**
 * Rewrite a DETACHED Windows spawn of a `.cmd`/`.bat` shim into a direct
 * spawn of the program that shim runs.
 *
 * Why this exists: cross-spawn runs a batch shim as
 * `cmd.exe /d /s /c "tool.cmd …"`. Under `detached: true` Node adds
 * `DETACHED_PROCESS`, so that cmd.exe gets no console — and a console-less
 * cmd.exe returns immediately WITHOUT propagating its inherited stdout/stderr
 * handles to the program it launches. The caller sees a near-instant exit
 * code and an empty log while the real work never reports anything. Verified
 * as a two-variable interaction: a native `.exe` detached works, and the same
 * shim NOT detached works; only the combination fails.
 *
 * Deliberately scoped to `detached` spawns. Non-detached shim spawns work
 * correctly through cmd.exe today and are left byte-identical — this is a
 * fix for a specific defect, not a general re-plumbing of Windows spawning.
 * An explicit path or an already-native binary is left alone, and every
 * failure to match returns `null` so the behavior falls back to cross-spawn.
 *
 * `platform` is an OS seam so the Windows rules are testable from POSIX runs
 * (same convention as `buildChildEnvForPlatform`); it is not a policy lever.
 */
export function resolveDetachedWindowsTarget(
  platform: NodeJS.Platform,
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): { command: string; args: string[] } | null {
  if (platform !== "win32") return null;
  // An explicit path is the caller's choice; a native binary needs no help.
  if (/[\\/]/.test(binary)) return null;
  if (WINDOWS_NATIVE_EXE.test(binary)) return null;

  const resolved = findOnPath(binary, env, cwd);
  if (!resolved || !WINDOWS_BATCH_SHIM.test(resolved)) return null;

  const target = readBatchShimTarget(resolved);
  if (!target) return null;

  return { command: target.command, args: [...target.prefixArgs, ...args] };
}

/**
 * Spawn a child process. `.cmd`/`.bat` shims resolve on Windows without a
 * shell; arguments are passed verbatim; `windowsHide` prevents a console
 * window from flashing (important combined with `detached: true`).
 *
 * Detached Windows spawns of a batch shim are redirected to the shim's real
 * target first — see {@link resolveDetachedWindowsTarget} for why cmd.exe
 * cannot be used there.
 */
export function spawnBinary(
  binary: string,
  args: string[],
  opts?: SpawnOptions,
): ChildProcess {
  const direct = opts?.detached
    ? resolveDetachedWindowsTarget(
        process.platform,
        binary,
        args,
        opts.env ?? process.env,
        typeof opts.cwd === "string" ? opts.cwd : process.cwd(),
      )
    : null;

  return crossSpawn(direct?.command ?? binary, direct?.args ?? args, {
    ...opts,
    windowsHide: true,
  });
}
