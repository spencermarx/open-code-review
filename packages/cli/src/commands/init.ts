import { Command } from "commander";
import { checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import {
  AI_TOOLS,
  parseToolsArg,
  type AIToolConfig,
  type AIToolId,
} from "../lib/config.js";
import {
  installForTool,
  detectInstalledTools,
  type InstallResult,
} from "../lib/installer.js";
import { injectIntoProjectFiles } from "../lib/injector.js";
import { printBanner } from "../lib/banner.js";
import { setConfiguredToolIds } from "../lib/cli-config.js";

export const initCommand = new Command("init")
  .description("Set up OCR for AI coding environments")
  .option("-t, --tools <tools>", 'Comma-separated tool IDs or "all"')
  .option("--no-inject", "Skip injecting instructions into AGENTS.md/CLAUDE.md")
  .action(async (options: { tools?: string; inject: boolean }) => {
    printBanner();

    const targetDir = process.cwd();
    let selectedTools: AIToolConfig[];

    if (options.tools) {
      try {
        const toolIds = parseToolsArg(options.tools);
        selectedTools = toolIds
          .map((id) => AI_TOOLS.find((t) => t.id === id))
          .filter((t): t is AIToolConfig => t !== undefined);
      } catch (error) {
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Invalid tools argument"}`,
          ),
        );
        console.log();
        console.log(
          chalk.dim(`Valid tool IDs: ${AI_TOOLS.map((t) => t.id).join(", ")}`),
        );
        process.exit(1);
      }
    } else {
      const installedTools = detectInstalledTools(targetDir, AI_TOOLS);

      const choices = AI_TOOLS.map((tool) => {
        const isInstalled = installedTools.some((t) => t.id === tool.id);
        return {
          name: isInstalled
            ? `${tool.name} ${chalk.dim("(detected)")}`
            : tool.name,
          value: tool.id,
          checked: isInstalled,
        };
      });

      try {
        const selectedIds = await checkbox<AIToolId>({
          message: "Select AI tools to configure",
          choices,
          pageSize: 15,
        });

        if (selectedIds.length === 0) {
          console.log(chalk.yellow("No tools selected. Exiting."));
          process.exit(0);
        }

        selectedTools = selectedIds
          .map((id) => AI_TOOLS.find((t) => t.id === id))
          .filter((t): t is AIToolConfig => t !== undefined);
      } catch {
        console.log(chalk.yellow("\nOperation cancelled."));
        process.exit(0);
      }
    }

    console.log();
    const spinner = ora("Installing OCR...").start();

    const results: InstallResult[] = [];
    for (const tool of selectedTools) {
      spinner.text = `Installing for ${tool.name}...`;
      const result = installForTool(tool, targetDir);
      results.push(result);
    }

    spinner.stop();

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length > 0) {
      console.log(chalk.green("✓ OCR installed successfully"));
      console.log();

      for (const result of successful) {
        console.log(`  ${chalk.green("✓")} ${result.tool.name}`);
      }

      // Save configured tools to CLI config for future commands
      const successfulToolIds = successful.map((r) => r.tool.id);
      setConfiguredToolIds(targetDir, successfulToolIds);
    }

    if (failed.length > 0) {
      console.log();
      console.log(chalk.red("✗ Some installations failed:"));
      for (const result of failed) {
        console.log(`  ${chalk.red("✗")} ${result.tool.name}: ${result.error}`);
      }
    }

    if (options.inject && successful.length > 0) {
      console.log();
      const injectSpinner = ora(
        "Injecting OCR instructions into project files...",
      ).start();

      const injectResults = injectIntoProjectFiles(targetDir);
      injectSpinner.stop();

      if (injectResults.agentsMd || injectResults.claudeMd) {
        console.log(chalk.green("✓ OCR instructions injected"));
        if (injectResults.agentsMd) {
          console.log(`  ${chalk.green("✓")} AGENTS.md`);
        }
        if (injectResults.claudeMd) {
          console.log(`  ${chalk.green("✓")} CLAUDE.md`);
        }
      }
    }

    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log();
    console.log(
      `  ${chalk.cyan("1.")} Review ${chalk.yellow(".ocr/config.yaml")}`,
    );
    console.log(
      chalk.dim(
        "     Add project context, review rules, and customize discovery settings.",
      ),
    );
    console.log();
    console.log(
      `  ${chalk.cyan("2.")} Run ${chalk.yellow("/ocr-review")} to start a code review session.`,
    );
    console.log();
  });
