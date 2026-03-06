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
  resolveActiveSession,
} from "../lib/state/index.js";
import type { WorkflowType } from "../lib/state/types.js";

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

      try {
        const sessionId = options.sessionId
          ?? (await resolveActiveSession(ocrDir)).id;

        await stateTransition({
          sessionId,
          phase: options.phase as import("../lib/state/types.js").ReviewPhase | import("../lib/state/types.js").MapPhase,
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
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Failed to sync"}`,
        ),
      );
      process.exit(1);
    }
  });

// ── Main state command ──

export const stateCommand = new Command("state")
  .description("Manage OCR session state")
  .addCommand(initSubcommand)
  .addCommand(transitionSubcommand)
  .addCommand(closeSubcommand)
  .addCommand(showSubcommand)
  .addCommand(syncSubcommand);
