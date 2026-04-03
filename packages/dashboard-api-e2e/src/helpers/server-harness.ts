/**
 * Dashboard server test harness.
 *
 * Starts the built dashboard server as a child process with a temp
 * .ocr directory, waits for readiness, and provides cleanup.
 */

import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SERVER_ENTRY = resolve(
  import.meta.dirname,
  "../../../../packages/cli/dist/dashboard/server.js",
);

export interface ServerInstance {
  port: number;
  baseUrl: string;
  token: string;
  ocrDir: string;
  process: ChildProcess;
  cleanup: () => Promise<void>;
}

let portCounter = 14_000 + Math.floor(Math.random() * 1000);

export interface StartOptions {
  /** Write a stale port file before starting the server (for testing port file cleanup). */
  stalePort?: number;
}

export async function startTestServer(opts?: StartOptions): Promise<ServerInstance> {
  const port = portCounter++;
  const tmpDir = realpathSync(
    mkdtempSync(resolve(tmpdir(), "ocr-dash-e2e-")),
  );

  // Set up minimal project structure
  execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
    cwd: tmpDir,
    stdio: "ignore",
  });
  mkdirSync(resolve(tmpDir, ".ocr", "skills"), { recursive: true });
  mkdirSync(resolve(tmpDir, ".ocr", "sessions"), { recursive: true });
  mkdirSync(resolve(tmpDir, ".ocr", "data"), { recursive: true });

  // Optionally write a stale port file to test cleanup behavior
  if (opts?.stalePort) {
    writeFileSync(
      resolve(tmpDir, ".ocr", "data", "server-port"),
      String(opts.stalePort),
    );
  }

  const child = fork(SERVER_ENTRY, [], {
    cwd: tmpDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      NO_COLOR: "1",
    },
    stdio: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Wait for server readiness
  await waitForHealth(baseUrl, 15_000);

  // Fetch auth token (available when NODE_ENV !== 'production')
  const tokenRes = await fetch(`${baseUrl}/auth/token`);
  const { token } = (await tokenRes.json()) as { token: string };

  return {
    port,
    baseUrl,
    token,
    ocrDir: resolve(tmpDir, ".ocr"),
    process: child,
    cleanup: async () => {
      child.kill();
      await new Promise<void>((r) => {
        child.on("exit", () => r());
        // Safety timeout — don't hang forever
        setTimeout(() => r(), 5_000);
      });
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Start a server but return immediately — before waiting for health.
 * Used to inspect the port file during the startup window.
 */
export function startServerEarly(opts?: StartOptions): {
  portFilePath: string;
  child: ChildProcess;
  port: number;
  tmpDir: string;
  waitForHealth: () => Promise<void>;
  cleanup: () => Promise<void>;
} {
  const port = portCounter++;
  const tmpDir = realpathSync(
    mkdtempSync(resolve(tmpdir(), "ocr-dash-e2e-")),
  );

  execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
    cwd: tmpDir,
    stdio: "ignore",
  });
  mkdirSync(resolve(tmpDir, ".ocr", "skills"), { recursive: true });
  mkdirSync(resolve(tmpDir, ".ocr", "sessions"), { recursive: true });
  mkdirSync(resolve(tmpDir, ".ocr", "data"), { recursive: true });

  const portFilePath = resolve(tmpDir, ".ocr", "data", "server-port");

  if (opts?.stalePort) {
    writeFileSync(portFilePath, String(opts.stalePort));
  }

  const child = fork(SERVER_ENTRY, [], {
    cwd: tmpDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      NO_COLOR: "1",
    },
    stdio: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    portFilePath,
    child,
    port,
    tmpDir,
    waitForHealth: () => waitForHealth(baseUrl, 15_000),
    cleanup: async () => {
      child.kill();
      await new Promise<void>((r) => {
        child.on("exit", () => r());
        setTimeout(() => r(), 5_000);
      });
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}
