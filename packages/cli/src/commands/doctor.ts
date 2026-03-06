import { existsSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { printHeader } from "../lib/banner.js";
import { checkOcrSetup } from "../lib/guards.js";
import {
  checkDependencies,
  printDepChecks,
  printCapabilities,
} from "../lib/deps.js";

export const doctorCommand = new Command("doctor")
  .description("Check OCR installation and verify all dependencies")
  .action(() => {
    printHeader();

    const targetDir = process.cwd();
    let hasIssues = false;

    // ── Environment checks ──

    const depResult = checkDependencies();
    printDepChecks(depResult, { suppressWarnings: true });

    if (!depResult.allRequiredFound) {
      hasIssues = true;
    }

    // ── OCR installation checks ──

    console.log();
    console.log(chalk.bold("  OCR Installation"));
    console.log();

    const ocrStatus = checkOcrSetup(targetDir);
    const configPath = join(targetDir, ".ocr", "config.yaml");
    const dbPath = join(targetDir, ".ocr", "data", "ocr.db");
    const hasConfig = existsSync(configPath);
    const hasDb = existsSync(dbPath);

    const ocrChecks: { label: string; ok: boolean; hint?: string }[] = [
      { label: ".ocr/skills/", ok: ocrStatus.hasSkills },
      { label: ".ocr/sessions/", ok: ocrStatus.hasSessions },
      { label: ".ocr/config.yaml", ok: hasConfig },
      {
        label: ".ocr/data/ocr.db",
        ok: hasDb,
        hint: "created on first review",
      },
    ];

    for (const check of ocrChecks) {
      if (check.ok) {
        console.log(`    ${chalk.green("✓")} ${check.label}`);
      } else {
        const suffix = check.hint
          ? chalk.dim(` (${check.hint})`)
          : "";
        console.log(`    ${chalk.dim("✗")} ${chalk.dim(check.label)}${suffix}`);
      }
    }

    if (!ocrStatus.valid) {
      hasIssues = true;
    }

    // ── Capabilities ──

    console.log();
    printCapabilities(depResult);

    // ── Summary ──

    console.log();

    if (hasIssues) {
      console.error(chalk.red("  ✗ Issues found"));
      console.error();

      if (!depResult.allRequiredFound) {
        const missing = depResult.checks.filter(
          (c) => c.required && !c.found,
        );
        for (const dep of missing) {
          console.error(
            `    ${chalk.yellow("⚠")} ${chalk.yellow(`${dep.name} was not found in PATH.`)}`,
          );
          if (dep.installHint) {
            console.error(
              `      ${chalk.dim("Install:")} ${chalk.white(dep.installHint)}`,
            );
          }
        }
      }

      if (!ocrStatus.valid) {
        console.error(
          `    ${chalk.yellow("⚠")} ${chalk.yellow("OCR is not initialized in this directory.")}`,
        );
        console.error(
          `      ${chalk.dim("Run:")} ${chalk.white("ocr init")}`,
        );
      }

      console.error();
      process.exit(1);
    }

    const caps = depResult.capabilities;
    if (caps.dashboardAi && caps.githubPost) {
      console.log(chalk.green("  ✓ All features available"));
    } else if (caps.dashboardAi) {
      console.log(chalk.green("  ✓ Ready for code review"));
      console.log(
        chalk.dim("    Install gh for GitHub PR posting"),
      );
    } else {
      console.log(chalk.green("  ✓ Ready for code review"));
      console.log(
        chalk.dim(
          "    Install Claude Code or OpenCode for dashboard commands",
        ),
      );
    }
    console.log();
  });
