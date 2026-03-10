import { createRequire } from "node:module";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { progressCommand } from "./commands/progress";
import { stateCommand } from "./commands/state";
import { updateCommand } from "./commands/update";
import { dashboardCommand } from "./commands/dashboard";
import { doctorCommand } from "./commands/doctor";
import { reviewersCommand } from "./commands/reviewers";
import { checkForUpdate, printUpdateNotification } from "./lib/update-check.js";

// Injected at build time by esbuild `define`. Falls back to package.json
// for dev (tsx) where the define is not applied.
declare const __CLI_VERSION__: string;
const cliVersion =
  typeof __CLI_VERSION__ !== "undefined"
    ? __CLI_VERSION__
    : (createRequire(import.meta.url)("../package.json") as { version: string }).version;

// Only check for updates on human-facing commands (not AI-invoked ones like `state`)
const HUMAN_COMMANDS = new Set(["init", "update", "doctor", "dashboard", "progress"]);
const subcommand = process.argv[2];
const updateCheck = subcommand && HUMAN_COMMANDS.has(subcommand)
  ? checkForUpdate(cliVersion)
  : null;

const program = new Command();

program
  .name("ocr")
  .description("Open Code Review - AI-powered multi-agent code review")
  .version(cliVersion);

program.addCommand(initCommand);
program.addCommand(progressCommand);
program.addCommand(stateCommand);
program.addCommand(updateCommand);
program.addCommand(dashboardCommand);
program.addCommand(doctorCommand);
program.addCommand(reviewersCommand);

await program.parseAsync();

if (updateCheck) {
  const updateResult = await Promise.race([
    updateCheck,
    new Promise<null>((r) => setTimeout(() => r(null), 500)),
  ]);
  if (updateResult?.updateAvailable) {
    printUpdateNotification(updateResult);
  }
}
