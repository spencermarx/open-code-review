import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOLS, type AIToolConfig } from "../lib/config.js";
import {
  installForTool,
  detectInstalledTools,
  type InstallResult,
} from "../lib/installer.js";
import { injectIntoProjectFiles } from "../lib/injector.js";
import { requireOcrSetup } from "../lib/guards.js";

type UpdateOptions = {
  commands?: boolean;
  skills?: boolean;
  inject?: boolean;
  dryRun?: boolean;
};

/**
 * Detect which AI tools have OCR commands installed
 */
function detectConfiguredTools(targetDir: string): AIToolConfig[] {
  return AI_TOOLS.filter((tool) => {
    // Check if tool has OCR commands installed
    if (tool.commandStrategy === "subdirectory") {
      const ocrDir = join(targetDir, tool.commandsDir, "ocr");
      return existsSync(ocrDir);
    } else {
      // flat-prefixed: check for ocr-review.md
      const reviewCmd = join(targetDir, tool.commandsDir, "ocr-review.md");
      return existsSync(reviewCmd);
    }
  });
}

export const updateCommand = new Command("update")
  .description("Update OCR assets after package upgrade")
  .option("--commands", "Update only commands/workflows")
  .option(
    "--skills",
    "Update only skills (includes templates, references, assets)",
  )
  .option("--inject", "Update only AGENTS.md/CLAUDE.md injection")
  .option("--dry-run", "Preview changes without modifying files")
  .action(async (options: UpdateOptions) => {
    const targetDir = process.cwd();

    // Guard: Require OCR to be set up
    requireOcrSetup(targetDir);

    console.log();
    console.log(chalk.bold.cyan("  Open Code Review - Update"));
    console.log();

    // Detect configured tools
    const configuredTools = detectConfiguredTools(targetDir);
    const installedTools = detectInstalledTools(targetDir, AI_TOOLS);

    // Merge: tools with OCR commands OR tool config directories
    const toolsToUpdate = AI_TOOLS.filter(
      (tool) =>
        configuredTools.some((t) => t.id === tool.id) ||
        installedTools.some((t) => t.id === tool.id),
    );

    if (toolsToUpdate.length === 0) {
      console.log(chalk.yellow("  No configured AI tools found."));
      console.log(chalk.dim("  Run `ocr init` to set up OCR first."));
      console.log();
      process.exit(1);
    }

    // Determine what to update (default: all if no specific flag)
    const hasSpecificFlag =
      options.commands || options.skills || options.inject;
    const updateCommands = options.commands || !hasSpecificFlag;
    const updateSkills = options.skills || !hasSpecificFlag;
    const updateInject = options.inject || !hasSpecificFlag;

    if (options.dryRun) {
      console.log(chalk.yellow("  Dry run mode - no files will be modified"));
      console.log();
    }

    console.log(chalk.dim("  Detected tools:"));
    for (const tool of toolsToUpdate) {
      console.log(`    • ${tool.name}`);
    }
    console.log();

    // Update commands/skills (--commands or --skills both trigger this)
    if (updateCommands || updateSkills) {
      if (options.dryRun) {
        console.log(chalk.dim("  Would update:"));
        console.log(chalk.dim("    • .ocr/skills/SKILL.md (main skill)"));
        console.log(
          chalk.dim("    • .ocr/skills/references/ (workflow, reviewers)"),
        );
        console.log(chalk.dim("    • .ocr/skills/assets/reviewer-template.md"));
        console.log(
          chalk.dim("    • .ocr/config.yaml (preserved if customized)"),
        );
        for (const tool of toolsToUpdate) {
          if (tool.commandStrategy === "subdirectory") {
            console.log(chalk.dim(`    • ${tool.commandsDir}/ocr/ (commands)`));
          } else {
            console.log(
              chalk.dim(`    • ${tool.commandsDir}/ocr-*.md (commands)`),
            );
          }
        }
        console.log();
      } else {
        const spinner = ora("Updating OCR commands and skills...").start();

        const results: InstallResult[] = [];
        for (const tool of toolsToUpdate) {
          spinner.text = `Updating ${tool.name}...`;
          const result = installForTool(tool, targetDir);
          results.push(result);
        }

        spinner.stop();

        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        if (successful.length > 0) {
          console.log(chalk.green("  ✓ Commands and skills updated"));
          console.log(
            chalk.dim("    Including: SKILL.md, references/, assets/"),
          );
          for (const result of successful) {
            console.log(`    ${chalk.green("✓")} ${result.tool.name}`);
          }
        }

        if (failed.length > 0) {
          console.log();
          console.log(chalk.red("  ✗ Some updates failed:"));
          for (const result of failed) {
            console.log(
              `    ${chalk.red("✗")} ${result.tool.name}: ${result.error}`,
            );
          }
        }

        console.log();
      }
    }

    // Update AGENTS.md injection
    if (updateInject) {
      if (options.dryRun) {
        console.log(chalk.dim("  Would update:"));
        if (existsSync(join(targetDir, "AGENTS.md"))) {
          console.log(chalk.dim("    • AGENTS.md (OCR managed block)"));
        }
        if (existsSync(join(targetDir, "CLAUDE.md"))) {
          console.log(chalk.dim("    • CLAUDE.md (OCR managed block)"));
        }
        console.log();
      } else {
        const spinner = ora("Updating AGENTS.md/CLAUDE.md...").start();

        const injectResults = injectIntoProjectFiles(targetDir);
        spinner.stop();

        if (injectResults.agentsMd || injectResults.claudeMd) {
          console.log(chalk.green("  ✓ Instructions updated"));
          if (injectResults.agentsMd) {
            console.log(`    ${chalk.green("✓")} AGENTS.md`);
          }
          if (injectResults.claudeMd) {
            console.log(`    ${chalk.green("✓")} CLAUDE.md`);
          }
        } else {
          console.log(chalk.dim("  No instruction files to update"));
        }

        console.log();
      }
    }

    if (options.dryRun) {
      console.log(chalk.dim("  Run without --dry-run to apply changes."));
    } else {
      console.log(chalk.green("  ✓ Update complete"));
    }
    console.log();
  });
