import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync as realExistsSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempWorkspace,
  removeTempWorkspace,
} from "@open-code-review/persistence/test-support";

/**
 * Pins the "Snapshot precedes dashboard mutation" spec scenario at the CLI
 * boundary: the child-env base handed to `startServer` is captured BEFORE
 * `process.env.NODE_ENV = "production"`, is frozen, and is tagged
 * `cli-launch` — while the server process itself still observes the mutated
 * value. This is the ordering an implementer could silently break without
 * any other test failing.
 */

const startServerMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@open-code-review/platform", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    importModule: vi.fn().mockImplementation(() =>
      Promise.resolve({ startServer: startServerMock }),
    ),
  };
});

// The server bundle does not exist in a source-tree test run; report it
// present (everything else uses the real fs so the DB bootstrap still works).
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    existsSync: (p: Parameters<typeof original.existsSync>[0]) =>
      String(p).endsWith(join("dashboard", "server.js")) ||
      original.existsSync(p),
  };
});

import { dashboardCommand } from "../dashboard.js";

let tmpDir: string;
let savedNodeEnv: string | undefined;

beforeEach(() => {
  tmpDir = makeTempWorkspace("ocr-dashboard-childenv-test-");
  mkdirSync(join(tmpDir, ".ocr", "skills"), { recursive: true });
  savedNodeEnv = process.env.NODE_ENV;
  startServerMock.mockClear();
});

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  removeTempWorkspace(tmpDir);
  vi.restoreAllMocks();
});

describe("dashboard command child-env snapshot", () => {
  it("captures the pre-mutation env, frozen and tagged cli-launch", async () => {
    delete process.env.NODE_ENV;
    process.env.CHILD_ENV_ORDER_TEST = "from-shell";

    let nodeEnvAtStartServerCall: string | undefined;
    startServerMock.mockImplementation(() => {
      nodeEnvAtStartServerCall = process.env.NODE_ENV;
      return Promise.resolve();
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;
    try {
      await dashboardCommand.parseAsync(["node", "dashboard", "--no-open"]);
    } finally {
      process.cwd = originalCwd;
      delete process.env.CHILD_ENV_ORDER_TEST;
    }

    expect(startServerMock).toHaveBeenCalledTimes(1);
    const opts = startServerMock.mock.calls[0][0] as {
      childEnvBase: {
        env: Readonly<NodeJS.ProcessEnv>;
        source: string;
        capturedAt: string;
      };
    };

    // The mutation happened for the server...
    expect(nodeEnvAtStartServerCall).toBe("production");
    // ...but the snapshot predates it and carries the shell's env.
    expect(opts.childEnvBase.env.NODE_ENV).toBeUndefined();
    expect(opts.childEnvBase.env.CHILD_ENV_ORDER_TEST).toBe("from-shell");
    expect(opts.childEnvBase.source).toBe("cli-launch");
    expect(Object.isFrozen(opts.childEnvBase.env)).toBe(true);
    expect(opts.childEnvBase.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Sanity: the temp workspace really exists on the real fs (the existsSync
    // override above is scoped to the server bundle path).
    expect(realExistsSync(join(tmpDir, ".ocr"))).toBe(true);
  });
});
