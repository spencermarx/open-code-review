import { Command } from "commander";
import { initCommand } from "./commands/init";
import { progressCommand } from "./commands/progress";
import { stateCommand } from "./commands/state";
import { updateCommand } from "./commands/update";
import { dashboardCommand } from "./commands/dashboard";
import { doctorCommand } from "./commands/doctor";
import { reviewersCommand } from "./commands/reviewers";
import { checkForUpdate, printUpdateNotification } from "./lib/update-check.js";
import { checkLocalArtifactVersion, printLocalVersionHint } from "./lib/cli-config.js";
import { CLI_VERSION } from "./lib/version.js";

// Only check for updates on human-facing commands (not AI-invoked ones like `state`)
const HUMAN_COMMANDS = new Set(["init", "update", "doctor", "dashboard", "progress"]);
const subcommand = process.argv[2];
const updateCheck = subcommand && HUMAN_COMMANDS.has(subcommand)
  ? checkForUpdate(CLI_VERSION)
  : null;

const program = new Command();

program
  .name("ocr")
  .description("Open Code Review - AI-powered multi-agent code review")
  .version(CLI_VERSION);

program.addCommand(initCommand);
program.addCommand(progressCommand);
program.addCommand(stateCommand);
program.addCommand(updateCommand);
program.addCommand(dashboardCommand);
program.addCommand(doctorCommand);
program.addCommand(reviewersCommand);

await program.parseAsync();

// Check for local artifact version drift (fast, no network)
if (subcommand && HUMAN_COMMANDS.has(subcommand)) {
  const drift = checkLocalArtifactVersion(process.cwd(), CLI_VERSION);
  if (drift) {
    printLocalVersionHint(drift);
  }
}

if (updateCheck) {
  const updateResult = await Promise.race([
    updateCheck,
    new Promise<null>((r) => setTimeout(() => r(null), 500)),
  ]);
  if (updateResult?.updateAvailable) {
    printUpdateNotification(updateResult);
  }
}
