/**
 * OCR Dashboard Command
 *
 * Starts a local HTTP + WebSocket server and opens the dashboard
 * in the user's default browser.
 *
 * The dashboard server module is dynamically imported to avoid
 * loading React, Socket.IO, and other heavy dependencies for
 * other CLI commands (init, progress, state, etc.).
 */

import { Command } from "commander";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { importModule } from "@open-code-review/platform";
import { requireOcrSetup } from "../lib/guards.js";
import { ensureDatabase, closeAllDatabases } from "../lib/db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves the path to the bundled dashboard server.
 * Exported for testing.
 */
export function resolveServerPath(): string {
  return join(__dirname, "dashboard", "server.js");
}

export const dashboardCommand = new Command("dashboard")
  .description("Start the OCR dashboard web interface")
  .option("-p, --port <port>", "Port to run the server on", "4173")
  .option("--no-open", "Don't open the browser automatically")
  .action(
    async (options: { port: string; open: boolean }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);

      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red(`Error: Invalid port "${options.port}". Must be 1-65535.`));
        process.exit(1);
      }

      const ocrDir = join(targetDir, ".ocr");

      // Ensure the SQLite database exists with full schema before
      // the dashboard server starts. This handles the case where
      // `.ocr/` exists but `.ocr/data/ocr.db` does not.
      try {
        await ensureDatabase(ocrDir);
        closeAllDatabases();
      } catch (err) {
        console.error(chalk.red("Error: Failed to initialize database."));
        console.error(
          chalk.dim(
            `  ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }

      // Resolve the dashboard server bundle path.
      // In production (published CLI): dist/dashboard/server.js
      // The __dirname at runtime is packages/cli/dist/ (since index.js is there).
      const serverPath = resolveServerPath();

      if (!existsSync(serverPath)) {
        console.error(chalk.red("Error: Dashboard server bundle not found."));
        console.error(
          chalk.dim(`  Expected at: ${serverPath}`),
        );
        console.error(
          chalk.dim("  This may indicate a broken installation. Try reinstalling:"),
        );
        console.error(chalk.white("    npm install -g @open-code-review/cli"));
        process.exit(1);
      }

      // Set NODE_ENV before importing — the server uses this for static file serving
      process.env.NODE_ENV = "production";

      console.log();
      console.log(chalk.bold("  OCR Dashboard"));
      console.log();

      // Dynamically import the dashboard server and call startServer().
      // This is the ONLY place where dashboard code is loaded.
      try {
        const { startServer } = await importModule<{ startServer: (opts: { port: number; open: boolean }) => Promise<void> }>(serverPath);
        await startServer({ port, open: options.open });
      } catch (err) {
        console.error(chalk.red("Error: Failed to start dashboard server."));
        console.error(
          chalk.dim(
            `  ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }

      console.log();
      console.log(chalk.dim("  Press Ctrl+C to stop"));
      console.log();
    },
  );
