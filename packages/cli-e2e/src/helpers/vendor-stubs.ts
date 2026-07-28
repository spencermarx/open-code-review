/**
 * Stub vendor binaries (`claude` / `opencode`) for model-enumeration e2e.
 *
 * Each stub is a generated Node script fronted by a `#!/bin/sh` wrapper
 * (POSIX) and a one-line `.cmd` shim (Windows). Both shims are written on
 * every OS so the Windows branch cannot rot unseen — PR CI runs e2e on
 * ubuntu only; the OS matrix runs on push to main. All behavior lives in
 * the cross-platform script; the shims only forward argv.
 *
 * Stubs are argv-STRICT: `--version` answers, the vendor's exact
 * enumeration argv answers, anything else exits 1 with stderr — mirroring
 * how the real CLIs reject unknown flags. That strictness is the point:
 * reintroducing a wrong probe (the `models --json` regression of issue #39)
 * makes the native-success tests fail loudly instead of silently falling
 * back to the bundled list.
 *
 * The returned `env` prepends the stub dir to PATH (resolving the existing
 * PATH key case-insensitively — Windows commonly has `Path`), so the stubs
 * shadow any real CLI installed on the machine and the tests stay
 * deterministic on dev laptops and every CI runner.
 *
 * NOTE: kept in lockstep with
 * packages/dashboard-api-e2e/src/helpers/vendor-stubs.ts — test-only
 * duplication; the two e2e packages have no shared test library.
 */

import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, resolve } from "node:path";
import { tmpdir } from "node:os";

export type StubBehavior =
  | {
      kind: "native";
      /** Lines printed by the enumeration argv (e.g. `models`). */
      ids: string[];
      /** Line ending — exercise CRLF on every OS, not just Windows. */
      lineEnding?: "\n" | "\r\n";
    }
  | {
      /** Enumeration prints non-model noise and exits 0 (malformed output). */
      kind: "garbage";
    }
  | {
      /** Every invocation exits 127 — shadows a real CLI to simulate "not installed". */
      kind: "absent";
    }
  | {
      /**
       * Answers `--version`, and would happily answer the enumeration argv —
       * but records the invocation in `markerPath` first. Used to pin that a
       * declared-unsupported strategy (claude) never spawns a probe.
       */
      kind: "tripwire";
      markerPath: string;
    }
  | {
      /**
       * Answers `--version`; ANY other argv dumps the stub's own
       * `process.env` as JSON to `dumpPath` and exits 3. Lets an e2e observe
       * exactly what environment a dashboard-spawned child inherited
       * (child-env posture coverage), and the nonzero exit exercises the
       * failure-hint surface.
       */
      kind: "env-dump";
      dumpPath: string;
    };

export type VendorStubs = {
  dir: string;
  /** Merge over the child env (spawnCli does this) to put stubs first on PATH. */
  env: Record<string, string>;
  cleanup: () => void;
};

const STUB_VERSION = "0.0.0-stub";

function stubScript(behavior: StubBehavior): string {
  if (behavior.kind === "absent") {
    return "process.exit(127);\n";
  }
  const lines: string[] = [
    'const argv = process.argv.slice(2).join(" ");',
    'if (argv === "--version") {',
    `  console.log(${JSON.stringify(STUB_VERSION)});`,
    "  process.exit(0);",
    "}",
  ];
  if (behavior.kind === "env-dump") {
    // Any non-version argv: dump the inherited environment and fail.
    lines.push(
      'require("node:fs").writeFileSync(' +
        `${JSON.stringify(behavior.dumpPath)}, JSON.stringify(process.env));`,
      "process.exit(3);",
    );
    return lines.join("\n") + "\n";
  }
  if (behavior.kind === "native") {
    const ending = behavior.lineEnding ?? "\n";
    lines.push(
      'if (argv === "models") {',
      `  process.stdout.write(${JSON.stringify(behavior.ids.join(ending) + ending)});`,
      "  process.exit(0);",
      "}",
    );
  } else if (behavior.kind === "garbage") {
    lines.push(
      'if (argv === "models") {',
      '  console.log("error: model registry exploded");',
      '  console.log("(this is not a model id)");',
      "  process.exit(0);",
      "}",
    );
  } else {
    // tripwire
    lines.push(
      'if (argv === "models") {',
      '  require("node:fs").writeFileSync(' +
        `${JSON.stringify(behavior.markerPath)}, "probed");`,
      '  console.log("stub/model-a");',
      "  process.exit(0);",
      "}",
    );
  }
  lines.push(
    "process.stderr.write(`stub: unexpected argv: ${argv}\\n`);",
    "process.exit(1);",
  );
  return lines.join("\n") + "\n";
}

/**
 * Writes stub binaries for the given vendors into a fresh temp dir and
 * returns env vars that put them first on PATH.
 */
export function createVendorStubs(
  spec: Record<string, StubBehavior>,
): VendorStubs {
  const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "ocr-stubs-")));

  for (const [binary, behavior] of Object.entries(spec)) {
    const scriptName = `${binary}-stub.cjs`;
    writeFileSync(resolve(dir, scriptName), stubScript(behavior), "utf-8");
    // POSIX wrapper — extensionless, executable, LF endings.
    writeFileSync(
      resolve(dir, binary),
      `#!/bin/sh\nexec node "$(dirname "$0")/${scriptName}" "$@"\n`,
      "utf-8",
    );
    chmodSync(resolve(dir, binary), 0o755);
    // Windows shim — resolved via PATH + PATHEXT by cross-spawn inside the
    // platform wrappers (no shell involved). `%~dp0` is quoted so temp
    // paths with spaces are safe.
    writeFileSync(
      resolve(dir, `${binary}.cmd`),
      `@node "%~dp0${scriptName}" %*\r\n`,
      "utf-8",
    );
  }

  // Windows env keys are case-insensitive but JS objects are not — override
  // the EXISTING key (often `Path`) or spawn gets two conflicting entries.
  const pathKey =
    Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";

  return {
    dir,
    env: { [pathKey]: `${dir}${delimiter}${process.env[pathKey] ?? ""}` },
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}
