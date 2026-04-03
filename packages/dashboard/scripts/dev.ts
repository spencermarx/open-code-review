/**
 * Dev startup script — starts server and Vite client in sequence.
 *
 * Replaces `concurrently "server" "sleep 2 && client"` to eliminate
 * the port race condition. The server may auto-increment its port if
 * the default (4173) is in use. This script waits for the server to
 * write .ocr/data/server-port, then starts Vite with the correct
 * PORT env var so the proxy always targets the right address.
 */

import { spawnBinary } from "@open-code-review/platform";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

function findPortFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const portFile = join(dir, ".ocr", "data", "server-port");
    if (existsSync(join(dir, ".ocr"))) return portFile;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function waitForPortFile(
  portFile: string,
  startTime: number,
  timeoutMs: number,
): Promise<number> {
  const deadline = startTime + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      try {
        const stat = statSync(portFile);
        // Only accept the file if it was written after we started
        if (stat.mtimeMs >= startTime) {
          const port = parseInt(readFileSync(portFile, "utf-8").trim(), 10);
          if (!isNaN(port)) return port;
        }
      } catch {
        // File may be in the process of being written
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error(
    `Server did not write port file within ${timeoutMs}ms.\n` +
      `  Expected at: ${portFile}\n` +
      `  Check the server logs above for errors.`,
  );
}

async function main(): Promise<void> {
  const portFile = findPortFile();
  if (!portFile) {
    console.error(
      "Error: Could not find .ocr/ directory. Run `ocr init` first.",
    );
    process.exit(1);
  }

  // Capture timestamp BEFORE spawning so a fast server write isn't missed
  const startTime = Date.now();

  // Start the server (tsx watch for hot reload)
  const server = spawnBinary("pnpm", ["dev:server"], {
    stdio: "inherit",
  });

  // Wait for the server to bind and write its port
  let port: number;
  try {
    port = await waitForPortFile(portFile, startTime, 30_000);
  } catch (err) {
    console.error(String(err));
    server.kill();
    process.exit(1);
  }

  console.log(`\n  Vite proxy → http://127.0.0.1:${port}\n`);

  // Start Vite with the confirmed port
  const client = spawnBinary("pnpm", ["dev:client"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
  });

  // Forward exit signals
  let shuttingDown = false;
  const cleanup = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.kill();
    client.kill();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Exit when either process exits
  const onExit = (name: string) => (code: number | null) => {
    console.log(`\n  ${name} exited (code ${code})`);
    cleanup();
    process.exit(code ?? 1);
  };

  server.on("exit", onExit("server"));
  client.on("exit", onExit("client"));
}

main();
