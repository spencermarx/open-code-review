import { Command } from "commander";
import { initCommand } from "./commands/init";
import { progressCommand } from "./commands/progress";
import { stateCommand } from "./commands/state";
import { updateCommand } from "./commands/update";
import { dashboardCommand } from "./commands/dashboard";
import { doctorCommand } from "./commands/doctor";

const program = new Command();

program
  .name("ocr")
  .description("Open Code Review - AI-powered multi-agent code review")
  .version("1.0.0");

program.addCommand(initCommand);
program.addCommand(progressCommand);
program.addCommand(stateCommand);
program.addCommand(updateCommand);
program.addCommand(dashboardCommand);
program.addCommand(doctorCommand);

program.parse();
