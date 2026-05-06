/**
 * OCR Review Command
 *
 * Today this is a thin pipe: `--resume <workflow-id>` looks up the vendor
 * session id captured for that workflow's most recent `agent_sessions` row
 * and execs the corresponding AI CLI with its native resume flag. The AI
 * picks up the conversation where it left off; the user can then continue
 * the OCR review workflow naturally.
 *
 * A full `ocr review` flow (target args, `--fresh`, `--team`, `--reviewer`)
 * is the dashboard's job; this command exists to back the "Pick up in
 * terminal" handoff (Spec 5) and the dashboard's "Continue here" affordance.
 */

import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { requireOcrSetup } from "../lib/guards.js";
import {
  ensureDatabase,
  getLatestAgentSessionWithVendorId,
  getSession,
} from "../lib/db/index.js";
import {
  VENDOR_BINARIES,
  buildResumeArgs,
} from "../lib/vendor-resume.js";

function fail(message: string): never {
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
}

export const reviewCommand = new Command("review")
  .description("Run or resume an OCR review")
  .option("--resume <workflow-id>", "Resume a prior review by its workflow session id")
  .action(async (options: { resume?: string }) => {
    if (!options.resume) {
      console.error(
        chalk.yellow(
          "Running a fresh review from the CLI is not yet supported — start one from your AI CLI's `/ocr-review` slash command or from the dashboard.",
        ),
      );
      console.error(
        chalk.dim("Use `ocr review --resume <workflow-id>` to resume a prior review."),
      );
      process.exit(1);
    }

    const targetDir = process.cwd();
    requireOcrSetup(targetDir);
    const ocrDir = join(targetDir, ".ocr");
    const db = await ensureDatabase(ocrDir);

    const session = getSession(db, options.resume);
    if (!session) {
      fail(`Workflow session not found: ${options.resume}`);
    }

    const latest = getLatestAgentSessionWithVendorId(db, options.resume);
    if (!latest || !latest.vendor_session_id) {
      fail(
        `No vendor session id has been captured for workflow ${options.resume}. ` +
          `Resume requires at least one journaled agent session with a bound ` +
          `vendor id. Start a fresh review with \`ocr review\` (no --resume).`,
      );
    }

    const binary = VENDOR_BINARIES[latest.vendor as keyof typeof VENDOR_BINARIES];
    if (!binary) {
      fail(
        `Unknown vendor "${latest.vendor}" recorded for workflow ${options.resume}. ` +
          `OCR knows how to resume Claude Code and OpenCode; this workflow used ` +
          `something else.`,
      );
    }

    let args: string[];
    try {
      args = buildResumeArgs(latest.vendor, latest.vendor_session_id);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }

    console.error(
      chalk.dim(
        `Resuming workflow ${session.id} on branch ${session.branch} via ${binary}…`,
      ),
    );

    // Hand control to the vendor CLI with stdio inherited so the user
    // interacts with it directly. We exit when it exits.
    const child = spawn(binary, args, {
      stdio: "inherit",
      cwd: targetDir,
    });
    child.on("error", (err) => {
      fail(`Failed to spawn ${binary}: ${err.message}`);
    });
    child.on("close", (code) => {
      process.exit(code ?? 0);
    });
  });
