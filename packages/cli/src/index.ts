import { createRequire } from "node:module";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { progressCommand } from "./commands/progress";
import { stateCommand } from "./commands/state";
import { updateCommand } from "./commands/update";
import { dashboardCommand } from "./commands/dashboard";
import { doctorCommand } from "./commands/doctor";

const require = createRequire(import.meta.url);
const { version: cliVersion } = require("../package.json") as { version: string };

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

program.parse();
