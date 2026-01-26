#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { progressCommand } from "./commands/progress";
import { updateCommand } from "./commands/update";

const program = new Command();

program
  .name("ocr")
  .description("Open Code Review - AI-powered multi-agent code review")
  .version("1.0.0");

program.addCommand(initCommand);
program.addCommand(progressCommand);
program.addCommand(updateCommand);

program.parse();
