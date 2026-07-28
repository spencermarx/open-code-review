/**
 * Child-env posture end-to-end test.
 *
 * Drives the REAL pipeline the dashboard child-process environment spec
 * describes: built server (dev-direct-run snapshot) → socket `command:run`
 * → AI CLI adapter spawn → actual child process — and observes the
 * environment that child inherited by stubbing `claude` with a binary that
 * dumps its own `process.env` and exits nonzero.
 *
 * Covers, end to end, with no mocks inside the server:
 *  - shell-parity inheritance (an arbitrary exported variable reaches the child)
 *  - the internal denylist (`OCR_*` and `NODE_OPTIONS` do NOT reach the child)
 *  - the closed inject channel (`OCR_DASHBOARD_EXECUTION_UID` arrives per-spawn)
 *  - names-only observability: the per-execution log header and the
 *    failure-time hint (incl. NODE_OPTIONS causality) on a nonzero exit.
 *
 * Khorikov classical school: real server child, real spawn, real disk.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as socketClient, type Socket } from "socket.io-client";
import {
  startTestServer,
  type ServerInstance,
} from "./helpers/server-harness.js";
import { createVendorStubs, type VendorStubs } from "./helpers/vendor-stubs.js";

let server: ServerInstance;
let stubs: VendorStubs;
let dumpDir: string;
let dumpPath: string;
let socket: Socket;

beforeAll(async () => {
  dumpDir = realpathSync(mkdtempSync(resolve(tmpdir(), "ocr-env-dump-")));
  dumpPath = resolve(dumpDir, "child-env-dump.json");

  stubs = createVendorStubs({
    claude: { kind: "env-dump", dumpPath },
    // Shadow any real opencode on the machine so adapter selection is
    // deterministic (claude wins under `auto`).
    opencode: { kind: "absent" },
  });

  server = await startTestServer({
    env: {
      ...stubs.env,
      // Arbitrary user variable — must flow through (shell parity).
      CHILD_ENV_E2E_MARKER: "inherited-yes",
      // Denied: OCR namespace (ambient) and NODE_OPTIONS (stability hazard).
      OCR_E2E_STALE: "must-not-leak",
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
  });

  // The AI command path reads `.ocr/commands/<cmd>.md` for the prompt.
  mkdirSync(resolve(server.ocrDir, "commands"), { recursive: true });
  writeFileSync(
    resolve(server.ocrDir, "commands", "review.md"),
    "# Review\nStub prompt for child-env e2e.\n",
  );
}, 30_000);

afterAll(async () => {
  socket?.disconnect();
  await server?.cleanup();
  stubs?.cleanup();
  try {
    rmSync(dumpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    /* best-effort cleanup */
  }
});

describe("dashboard child-process environment (e2e)", () => {
  it("spawns children with the shell snapshot minus the denylist plus the inject channel, and surfaces the failure hint", async () => {
    let outputBuffer = "";

    const finished = new Promise<{ exitCode: number }>((resolveDone, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`command did not finish; output so far:\n${outputBuffer}`)),
        25_000,
      );
      socket = socketClient(server.baseUrl, {
        auth: { token: server.token },
        transports: ["websocket"],
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on("command:error", (e: unknown) => {
        clearTimeout(timer);
        reject(new Error(`command:error ${JSON.stringify(e)}`));
      });
      socket.on("command:output", (m: { content?: string }) => {
        outputBuffer += m.content ?? "";
      });
      socket.on("command:finished", (m: { exitCode: number }) => {
        clearTimeout(timer);
        resolveDone({ exitCode: m.exitCode });
      });
      socket.on("connect", () => {
        socket.emit("command:run", { command: "ocr review" });
      });
    });

    const { exitCode } = await finished;
    expect(exitCode).toBe(3);

    // ── What the child actually inherited ──
    const childEnv = JSON.parse(readFileSync(dumpPath, "utf-8")) as Record<
      string,
      string
    >;
    // Shell parity: arbitrary exported variable flows through.
    expect(childEnv.CHILD_ENV_E2E_MARKER).toBe("inherited-yes");
    // Denylist: ambient OCR_* and NODE_OPTIONS are removed.
    expect(childEnv).not.toHaveProperty("OCR_E2E_STALE");
    expect(childEnv).not.toHaveProperty("NODE_OPTIONS");
    // Closed inject channel: the per-spawn execution UID arrives.
    expect(typeof childEnv.OCR_DASHBOARD_EXECUTION_UID).toBe("string");
    expect(childEnv.OCR_DASHBOARD_EXECUTION_UID!.length).toBeGreaterThan(0);
    // PATH survived (the stub itself resolved through it).
    expect(childEnv.PATH ?? childEnv.Path).toBeTruthy();

    // ── Failure-time hint on the error surface (names only) ──
    expect(outputBuffer).toContain("child env: shell snapshot");
    expect(outputBuffer).toContain("removed:");
    expect(outputBuffer).toContain("NODE_OPTIONS");
    expect(outputBuffer).toContain("restart 'ocr dashboard'");
    expect(outputBuffer).toContain(
      "your shell sets NODE_OPTIONS; dashboard children run without it.",
    );
    // Names only — the denied variable's VALUE must never surface.
    expect(outputBuffer).not.toContain("must-not-leak");
    expect(outputBuffer).not.toContain("--max-old-space-size=4096");

    // ── Per-execution log header, from the same builder call ──
    const execLogsDir = resolve(server.ocrDir, "data", "exec-logs");
    const logFiles = readdirSync(execLogsDir).filter((f) => f.endsWith(".log"));
    expect(logFiles.length).toBeGreaterThan(0);
    const logContent = logFiles
      .map((f) => readFileSync(resolve(execLogsDir, f), "utf-8"))
      .join("\n");
    expect(logContent).toContain("env: shell snapshot");
    expect(logContent).toMatch(/minus \[[^\]]*NODE_OPTIONS[^\]]*\]/);
    expect(logContent).toContain("plus [OCR_DASHBOARD_EXECUTION_UID]");
    expect(logContent).not.toContain("must-not-leak");
  }, 40_000);
});
