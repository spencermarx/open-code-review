/**
 * OCR Models Command
 *
 * Surfaces the model identifiers the user's host AI CLI is willing to
 * accept. Strings are vendor-native — OCR does not coin its own logical
 * names. When the underlying CLI lacks a `models` subcommand, the output
 * is sourced from a small bundled known-good list (best-effort, may go
 * stale). Free-text input remains the canonical bypass.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  detectActiveVendor,
  listModelsForVendor,
  type ModelVendor,
} from "../lib/models.js";

const listSubcommand = new Command("list")
  .description("List models the active AI CLI is willing to accept")
  .option(
    "--vendor <vendor>",
    "Override autodetection (claude | opencode)",
  )
  .option("--json", "Emit JSON for programmatic consumption")
  .action(async (options: { vendor?: string; json?: boolean }) => {
    let vendor: ModelVendor | null;
    if (options.vendor) {
      if (options.vendor !== "claude" && options.vendor !== "opencode") {
        console.error(
          chalk.red(
            `Invalid --vendor: "${options.vendor}". Must be "claude" or "opencode".`,
          ),
        );
        process.exit(1);
      }
      vendor = options.vendor;
    } else {
      vendor = detectActiveVendor();
      if (!vendor) {
        if (options.json) {
          console.log("[]");
          return;
        }
        console.error(
          chalk.yellow(
            "No supported AI CLI detected on PATH. Install Claude Code or OpenCode, or pass --vendor explicitly.",
          ),
        );
        process.exit(1);
      }
    }

    const { source, models } = listModelsForVendor(vendor);

    if (options.json) {
      console.log(JSON.stringify(models, null, 2));
      return;
    }

    console.log(chalk.bold(`Models for ${vendor} (${source})`));
    if (source === "bundled") {
      console.log(
        chalk.dim(
          "  Note: bundled fallback list — may be stale. Free-text input is always accepted.",
        ),
      );
    }
    for (const model of models) {
      const label = model.displayName ? ` — ${model.displayName}` : "";
      const provider = model.provider ? chalk.dim(` [${model.provider}]`) : "";
      const tags =
        model.tags && model.tags.length > 0
          ? chalk.dim(` (${model.tags.join(", ")})`)
          : "";
      console.log(`  ${model.id}${label}${provider}${tags}`);
    }
  });

export const modelsCommand = new Command("models")
  .description("Inspect models available to the active AI CLI")
  .addCommand(listSubcommand);
