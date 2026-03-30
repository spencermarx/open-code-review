/**
 * OCR State Command
 *
 * Manages workflow session state exclusively through SQLite.
 *
 * Subcommands:
 *   init       — Create a new session
 *   transition — Move session to a new phase
 *   close      — Mark session as closed
 *   show       — Display current session state
 *   sync       — Rebuild session state from filesystem artifacts
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireOcrSetup } from "../lib/guards.js";
import {
  stateInit,
  stateTransition,
  stateClose,
  stateShow,
  stateSync,
  stateRoundComplete,
  stateMapComplete,
  resolveActiveSession,
} from "../lib/state/index.js";
import type { WorkflowType, ReviewPhase, MapPhase, RoundCompleteResult, MapCompleteResult } from "../lib/state/types.js";
import { replayCommandLog } from "../lib/db/command-log.js";
import { getDb, saveDatabase } from "../lib/db/index.js";

// ── Helpers ──

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks).toString("utf-8").trim();
  if (data.length === 0) {
    throw new Error("No data received on stdin");
  }
  return data;
}

// ── init ──

const initSubcommand = new Command("init")
  .description("Initialize a new OCR session")
  .requiredOption("--session-id <id>", "Session ID")
  .requiredOption("--branch <branch>", "Branch name")
  .requiredOption(
    "--workflow-type <type>",
    "Workflow type (review or map)",
    (value: string) => {
      if (value !== "review" && value !== "map") {
        throw new Error(
          `Invalid workflow type: "${value}". Must be "review" or "map".`,
        );
      }
      return value as WorkflowType;
    },
  )
  .option("--session-dir <dir>", "Session directory path (auto-resolved if omitted)")
  .action(
    async (options: {
      sessionId: string;
      branch: string;
      workflowType: WorkflowType;
      sessionDir?: string;
    }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);
      const ocrDir = join(targetDir, ".ocr");

      const sessionDir =
        options.sessionDir ?? join(ocrDir, "sessions", options.sessionId);

      if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
      }

      try {
        const sessionId = await stateInit({
          sessionId: options.sessionId,
          branch: options.branch,
          workflowType: options.workflowType,
          sessionDir,
          ocrDir,
        });

        console.log(sessionId);
      } catch (error) {
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Failed to initialize session"}`,
          ),
        );
        process.exit(1);
      }
    },
  );

// ── transition ──

const transitionSubcommand = new Command("transition")
  .description("Transition session to a new phase")
  .option("--session-id <id>", "Session ID (auto-detects latest active if omitted)")
  .requiredOption("--phase <phase>", "Target phase name")
  .requiredOption("--phase-number <number>", "Phase number", parseInt)
  .option("--current-round <number>", "Round number", parseInt)
  .option("--current-map-run <number>", "Map run number", parseInt)
  .action(
    async (options: {
      sessionId?: string;
      phase: string;
      phaseNumber: number;
      currentRound?: number;
      currentMapRun?: number;
    }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);
      const ocrDir = join(targetDir, ".ocr");

      const VALID_PHASES = new Set<string>([
        "context", "change-context", "analysis", "reviews",
        "aggregation", "discourse", "synthesis", "complete",
        "map-context", "topology", "flow-analysis", "requirements-mapping",
      ]);
      if (!VALID_PHASES.has(options.phase)) {
        throw new Error(`Invalid phase: "${options.phase}". Must be one of: ${[...VALID_PHASES].join(", ")}`);
      }

      try {
        const sessionId = options.sessionId
          ?? (await resolveActiveSession(ocrDir)).id;

        await stateTransition({
          sessionId,
          phase: options.phase as ReviewPhase | MapPhase,
          phaseNumber: options.phaseNumber,
          round: options.currentRound,
          mapRun: options.currentMapRun,
          ocrDir,
        });

        console.log(
          `${sessionId}: ${options.phase} (phase ${options.phaseNumber})`,
        );
      } catch (error) {
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Failed to transition"}`,
          ),
        );
        process.exit(1);
      }
    },
  );

// ── close ──

const closeSubcommand = new Command("close")
  .description("Close a session")
  .option("--session-id <id>", "Session ID (auto-detects latest active if omitted)")
  .action(async (options: { sessionId?: string }) => {
    const targetDir = process.cwd();
    requireOcrSetup(targetDir);
    const ocrDir = join(targetDir, ".ocr");

    try {
      const sessionId = options.sessionId
        ?? (await resolveActiveSession(ocrDir)).id;

      await stateClose({
        sessionId,
        ocrDir,
      });

      console.log(`${sessionId}: closed`);
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Failed to close session"}`,
        ),
      );
      process.exit(1);
    }
  });

// ── show ──

const showSubcommand = new Command("show")
  .description("Show current session state")
  .option("--session-id <id>", "Session ID (defaults to latest active)")
  .option("--json", "Output as JSON")
  .action(async (options: { sessionId?: string; json?: boolean }) => {
    const targetDir = process.cwd();
    requireOcrSetup(targetDir);
    const ocrDir = join(targetDir, ".ocr");

    try {
      const result = await stateShow(ocrDir, options.sessionId);

      if (!result) {
        if (options.json) {
          console.log(JSON.stringify(null));
        } else {
          console.log(chalk.dim("No active session found."));
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const s = result.session;
      console.log();
      console.log(
        chalk.bold(`Session: ${s.id}`) +
          chalk.dim(` (${s.status})`),
      );
      console.log(
        chalk.dim("  Branch:    ") + chalk.white(s.branch),
      );
      console.log(
        chalk.dim("  Workflow:  ") + chalk.white(s.workflow_type),
      );
      console.log(
        chalk.dim("  Phase:     ") +
          chalk.cyan(s.current_phase) +
          chalk.dim(` (${s.phase_number})`),
      );
      if (s.workflow_type === "review") {
        console.log(
          chalk.dim("  Round:     ") + chalk.white(String(s.current_round)),
        );
      }
      if (s.workflow_type === "map") {
        console.log(
          chalk.dim("  Map Run:   ") + chalk.white(String(s.current_map_run)),
        );
      }
      console.log(
        chalk.dim("  Started:   ") + chalk.white(s.started_at),
      );
      console.log(
        chalk.dim("  Updated:   ") + chalk.white(s.updated_at),
      );

      if (result.events.length > 0) {
        console.log();
        console.log(chalk.dim("  Recent events:"));
        const recentEvents = result.events.slice(-5);
        for (const event of recentEvents) {
          const phaseInfo = event.phase ? chalk.dim(` [${event.phase}]`) : "";
          console.log(
            chalk.dim("    ") +
              chalk.white(event.event_type) +
              phaseInfo +
              chalk.dim(` at ${event.created_at}`),
          );
        }
      }
      console.log();
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Failed to show state"}`,
        ),
      );
      process.exit(1);
    }
  });

// ── sync ──

const syncSubcommand = new Command("sync")
  .description("Rebuild session state from filesystem artifacts")
  .action(async () => {
    const targetDir = process.cwd();
    requireOcrSetup(targetDir);
    const ocrDir = join(targetDir, ".ocr");

    try {
      const synced = await stateSync(ocrDir);
      console.log(`Synced ${synced} session${synced !== 1 ? "s" : ""} from filesystem.`);

      // Recover command history from JSONL backup if DB was recreated
      const db = await getDb(ocrDir);
      const countResult = db.exec("SELECT COUNT(*) as c FROM command_executions");
      const totalCmds = (countResult[0]?.values[0]?.[0] as number) ?? 0;
      if (totalCmds === 0) {
        const recovered = replayCommandLog(db, ocrDir);
        if (recovered > 0) {
          saveDatabase(db, join(ocrDir, "data", "ocr.db"));
          console.log(`Recovered ${recovered} command${recovered !== 1 ? "s" : ""} from backup log.`);
        }
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Failed to sync"}`,
        ),
      );
      process.exit(1);
    }
  });

// ── round-complete ──

const roundCompleteSubcommand = new Command("round-complete")
  .description("Import structured round data into SQLite")
  .option("--file <path>", "Path to round-meta.json")
  .option("--stdin", "Read round-meta JSON from stdin (recommended)")
  .option("--session-id <id>", "Session ID (auto-detects latest active if omitted)")
  .option("--round <number>", "Round number (auto-detects current if omitted)", parseInt)
  .action(
    async (options: {
      file?: string;
      stdin?: boolean;
      sessionId?: string;
      round?: number;
    }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);
      const ocrDir = join(targetDir, ".ocr");

      if (!options.file && !options.stdin) {
        console.error(chalk.red("Error: Provide either --file <path> or --stdin"));
        process.exit(1);
      }
      if (options.file && options.stdin) {
        console.error(chalk.red("Error: --file and --stdin are mutually exclusive"));
        process.exit(1);
      }

      try {
        let result: RoundCompleteResult;

        if (options.stdin) {
          const data = await readStdin();
          result = await stateRoundComplete({
            source: "stdin",
            ocrDir,
            data,
            sessionId: options.sessionId,
            round: options.round,
          });
        } else if (options.file) {
          result = await stateRoundComplete({
            source: "file",
            ocrDir,
            filePath: options.file,
            sessionId: options.sessionId,
            round: options.round,
          });
        } else {
          // Unreachable — mutual exclusion guard above ensures one is set
          process.exit(1);
        }

        console.log(chalk.green("Round data imported successfully."));
        if (result.metaPath) {
          console.log(chalk.dim(`Wrote ${result.metaPath}`));
        }
      } catch (error) {
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Failed to import round data"}`,
          ),
        );
        process.exit(1);
      }
    },
  );

// ── map-complete ──

const mapCompleteSubcommand = new Command("map-complete")
  .description("Import structured map run data into SQLite")
  .option("--file <path>", "Path to map-meta.json")
  .option("--stdin", "Read map-meta JSON from stdin (recommended)")
  .option("--session-id <id>", "Session ID (auto-detects latest active if omitted)")
  .option("--map-run <number>", "Map run number (auto-detects current if omitted)", parseInt)
  .action(
    async (options: {
      file?: string;
      stdin?: boolean;
      sessionId?: string;
      mapRun?: number;
    }) => {
      const targetDir = process.cwd();
      requireOcrSetup(targetDir);
      const ocrDir = join(targetDir, ".ocr");

      if (!options.file && !options.stdin) {
        console.error(chalk.red("Error: Provide either --file <path> or --stdin"));
        process.exit(1);
      }
      if (options.file && options.stdin) {
        console.error(chalk.red("Error: --file and --stdin are mutually exclusive"));
        process.exit(1);
      }

      try {
        let result: MapCompleteResult;

        if (options.stdin) {
          const data = await readStdin();
          result = await stateMapComplete({
            source: "stdin",
            ocrDir,
            data,
            sessionId: options.sessionId,
            mapRun: options.mapRun,
          });
        } else if (options.file) {
          result = await stateMapComplete({
            source: "file",
            ocrDir,
            filePath: options.file,
            sessionId: options.sessionId,
            mapRun: options.mapRun,
          });
        } else {
          // Unreachable — mutual exclusion guard above ensures one is set
          process.exit(1);
        }

        console.log(chalk.green("Map data imported successfully."));
        if (result.metaPath) {
          console.log(chalk.dim(`Wrote ${result.metaPath}`));
        }
      } catch (error) {
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Failed to import map data"}`,
          ),
        );
        process.exit(1);
      }
    },
  );

// ── Main state command ──

export const stateCommand = new Command("state")
  .description("Manage OCR session state")
  .addCommand(initSubcommand)
  .addCommand(transitionSubcommand)
  .addCommand(closeSubcommand)
  .addCommand(showSubcommand)
  .addCommand(syncSubcommand)
  .addCommand(roundCompleteSubcommand)
  .addCommand(mapCompleteSubcommand);
