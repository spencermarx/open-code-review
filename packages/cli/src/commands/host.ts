/**
 * OCR Host Command
 *
 * Surfaces host (AI CLI) capabilities so the review skill can choose a
 * host-neutral Phase 4 strategy. The skill calls `ocr host capabilities
 * --tool <id>` to learn whether its host can spawn sub-agents and vary the
 * model per task — never assuming a Claude-style Task tool exists.
 *
 * Subcommands:
 *   capabilities  — Print host capabilities (human table or JSON)
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  AI_TOOLS,
  getToolById,
  getHostCapabilities,
  getToolIds,
  isHostTool,
  type AIToolId,
  type HostCapabilities,
} from "../lib/config.js";

type HostCapabilityRow = {
  id: AIToolId;
  name: string;
  /** The Phase-4 strategy implied by the capabilities. */
  phase4: "parallel-subagents" | "sequential";
} & HostCapabilities;

function describeRow(id: AIToolId): HostCapabilityRow {
  const tool = getToolById(id);
  const caps = getHostCapabilities(id);
  return {
    id,
    name: tool?.name ?? id,
    subagentSpawn: caps.subagentSpawn,
    perTaskModel: caps.perTaskModel,
    phase4: caps.subagentSpawn ? "parallel-subagents" : "sequential",
  };
}

const capabilitiesSubcommand = new Command("capabilities")
  .description("Print host (AI CLI) Phase-4 capabilities")
  .option("--tool <id>", "Show capabilities for a single tool id")
  .option("--json", "Output JSON")
  .action((options: { tool?: string; json?: boolean }) => {
    if (options.tool) {
      const id = options.tool.trim().toLowerCase();
      if (!getToolIds().includes(id as AIToolId)) {
        console.error(
          chalk.red(
            `Error: unknown tool id "${options.tool}". Valid ids: ${getToolIds().join(", ")}`,
          ),
        );
        process.exit(1);
      }
      const row = describeRow(id as AIToolId);
      if (options.json) {
        console.log(JSON.stringify(row, null, 2));
      } else {
        printRows([row]);
      }
      return;
    }

    // Passive discovery targets (e.g. `agents`) are not hosts — omit them.
    const rows = AI_TOOLS.filter(isHostTool).map((t) => describeRow(t.id));
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      printRows(rows);
    }
  });

function printRows(rows: HostCapabilityRow[]): void {
  const yn = (v: boolean) => (v ? chalk.green("yes") : chalk.dim("no"));
  for (const row of rows) {
    console.log(
      `${chalk.bold(row.name.padEnd(20))} ` +
        `subagentSpawn=${yn(row.subagentSpawn)}  ` +
        `perTaskModel=${yn(row.perTaskModel)}  ` +
        `→ ${chalk.cyan(row.phase4)}`,
    );
  }
}

export const hostCommand = new Command("host")
  .description("Inspect host (AI CLI) capabilities")
  .addCommand(capabilitiesSubcommand);
