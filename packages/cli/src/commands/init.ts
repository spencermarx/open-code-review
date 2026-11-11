import { Command } from "commander";
import { checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import {
  AI_TOOLS,
  getToolIds,
  isHostTool,
  parseToolsArg,
  type AIToolConfig,
  type AIToolId,
} from "../lib/config.js";
import {
  installForTool,
  detectInstalledTools,
  findStaleSkillPointers,
  type InstallResult,
} from "../lib/installer.js";
import {
  injectIntoProjectFiles,
  findStaleInstructionFiles,
  formatStaleWarnings,
} from "../lib/injector.js";
import { printBanner } from "../lib/banner.js";
import { setConfiguredToolIds, stampCliVersion } from "../lib/cli-config.js";
import { CLI_VERSION } from "../lib/version.js";
import {
  checkDependencies,
  printDepChecks,
  printCapabilities,
} from "../lib/deps.js";

export const initCommand = new Command("init")
  .description("Set up OCR for AI coding environments")
  .option(
    "-t, --tools <tools>",
    `Comma-separated tool IDs or "all" (${getToolIds().join(", ")})`,
  )
  .option("--no-inject", "Skip injecting instructions into project instruction files (AGENTS.md + each tool's native file)")
  .action(async (options: { tools?: string; inject: boolean }) => {
    printBanner();

    const depResult = checkDependencies();
    printDepChecks(depResult);
    printCapabilities(depResult);
    console.log();

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
        console.error();
        console.error(
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

      // Save configured tools and stamp CLI version for drift detection
      const successfulToolIds = successful.map((r) => r.tool.id);
      setConfiguredToolIds(targetDir, successfulToolIds);
      stampCliVersion(targetDir, CLI_VERSION);
    }

    if (failed.length > 0) {
      console.log();
      console.error(chalk.red("✗ Some installations failed:"));
      for (const result of failed) {
        console.error(`  ${chalk.red("✗")} ${result.tool.name}: ${result.error}`);
      }
    }

    // Display warnings from preservation failures (relevant for re-init scenarios)
    const allWarnings = results.flatMap((r) => r.warnings ?? []);
    if (allWarnings.length > 0) {
      console.log();
      console.error(chalk.yellow("⚠ Warnings:"));
      for (const warning of allWarnings) {
        console.error(`  ${chalk.yellow("⚠")} ${warning}`);
      }
    }

    const stalePointers = findStaleSkillPointers(
      targetDir,
      AI_TOOLS,
      successful.map((r) => r.tool.id),
    );
    for (const path of stalePointers) {
      console.log(
        chalk.yellow(
          `  ⚠ ${path} is an OCR skill pointer for a tool that is no longer selected — delete it if unwanted`,
        ),
      );
    }

    if (options.inject && successful.length > 0) {
      console.log();
      const injectSpinner = ora(
        "Injecting OCR instructions into project files...",
      ).start();

      const installedTools = successful.map((r) => r.tool);
      const injectResults = injectIntoProjectFiles(targetDir, installedTools);
      injectSpinner.stop();

      if (injectResults.written.length > 0) {
        console.log(chalk.green("✓ OCR instructions injected"));
        for (const path of injectResults.written) {
          console.log(`  ${chalk.green("✓")} ${path}`);
        }
      }

      const stale = findStaleInstructionFiles(targetDir, injectResults.written);
      for (const warning of formatStaleWarnings(stale, "init")) {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
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
        "     Add project context, review rules, and customize settings.",
      ),
    );
    console.log();
    // Discovery-only installs (e.g. just `agents`) get no slash commands; the
    // agent picks up the `ocr` skill from its skills directory instead.
    const hasHost = successful.some((r) => isHostTool(r.tool));
    console.log(
      hasHost
        ? `  ${chalk.cyan("2.")} Run ${chalk.yellow("/ocr:review")} in your IDE to start a code review.`
        : `  ${chalk.cyan("2.")} Ask your agent to ${chalk.yellow("review my changes")} — it loads the ${chalk.yellow("ocr")} skill.`,
    );
    console.log();
    console.log(
      `  ${chalk.cyan("3.")} Run ${chalk.yellow("ocr dashboard")} to open the web dashboard.`,
    );
    if (depResult.capabilities.dashboardAi) {
      console.log(
        chalk.dim("     Command Center and Ask the Team are ready."),
      );
    } else {
      console.log(
        chalk.dim(
          "     Read-only mode — install Claude Code or OpenCode for full features.",
        ),
      );
    }
    console.log();
  });
