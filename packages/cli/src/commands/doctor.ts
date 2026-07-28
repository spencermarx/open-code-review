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
import { probeEngine, probeWrite } from "@open-code-review/persistence";
import { describeChildEnvPosture } from "@open-code-review/platform";

/**
 * Print the Storage Engine section and return whether the engine is healthy.
 * Shared by the full doctor run and `--engine-only` (the release install gate),
 * so the engine verdict is computed in exactly one place.
 */
function printStorageEngine(probeWriteEnabled: boolean): boolean {
  console.log();
  console.log(chalk.bold("  Storage Engine"));
  console.log();
  const engine = probeEngine();
  if (!engine.ok) {
    console.log(`    ${chalk.red("✗")} node:sqlite unavailable`);
    console.log(`      ${chalk.dim(engine.error)}`);
    console.log(
      `      ${chalk.dim(
        "OCR requires Node >= 22.5 (node:sqlite). Upgrade Node, then re-run `ocr doctor`.",
      )}`,
    );
    return false;
  }
  console.log(
    `    ${chalk.green("✓")} node:sqlite (SQLite ${engine.version}, WAL)`,
  );
  if (probeWriteEnabled) {
    const write = probeWrite();
    if (!write.ok) {
      console.log(`    ${chalk.red("✗")} write probe failed`);
      console.log(`      ${chalk.dim(write.error)}`);
      return false;
    }
    console.log(
      `    ${chalk.green("✓")} write probe (on-disk WAL transaction round-trip)`,
    );
  }
  return true;
}

export const doctorCommand = new Command("doctor")
  .description("Check OCR installation and verify all dependencies")
  .option(
    "--probe-write",
    "additionally exercise an on-disk WAL transaction round-trip (used by the release install gate)",
  )
  .option(
    "--engine-only",
    "check ONLY the storage engine and exit on its result — skips project/tool checks (used by the release install gate, which runs from a non-initialized dir with no AI tools)",
  )
  .action((options: { probeWrite?: boolean; engineOnly?: boolean }) => {
    printHeader();

    // Engine-only mode: the install gate runs from a clean consumer install
    // dir (no `.ocr/`, no AI CLI, no gh). A full doctor run would exit 1 on
    // those expected gaps before reaching the engine. Here we verify only the
    // engine and exit on THAT, so the gate's assertions are meaningful.
    if (options.engineOnly) {
      const ok = printStorageEngine(options.probeWrite ?? false);
      console.log();
      process.exit(ok ? 0 : 1);
    }

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

    // ── Storage engine ──
    // The SQLite engine is Node's built-in `node:sqlite` (no native module).
    // Probe it so a too-old runtime or a disabled built-in surfaces clearly.
    if (!printStorageEngine(options.probeWrite ?? false)) {
      hasIssues = true;
    }

    // ── Dashboard child environment ──
    // Generated from the same constants that drive the spawn-time builder,
    // so this prose can never drift from behavior.

    console.log();
    console.log(chalk.bold("  Dashboard Child Environment"));
    console.log();
    for (const line of describeChildEnvPosture()) {
      console.log(`    ${chalk.dim(line)}`);
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
