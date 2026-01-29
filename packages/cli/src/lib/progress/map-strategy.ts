/**
 * Map Workflow Progress Strategy
 *
 * Tracks progress for the 6-phase Code Review Map workflow.
 * Progress is derived deterministically from filesystem artifacts.
 */

import chalk from "chalk";
import logUpdate from "log-update";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { WorkflowProgressStrategy } from "./strategy";
import type {
  PhaseInfo,
  MapWorkflowState,
  MapRunInfo,
  AgentStatus,
  StateJson,
} from "./types";
import {
  formatDuration,
  renderProgressBar,
  getPhaseStatus,
  clearForRenderType,
  padLines,
} from "./render-utils";

type MapPhase =
  | "waiting"
  | "map-context"
  | "topology"
  | "flow-analysis"
  | "requirements-mapping"
  | "synthesis"
  | "complete";

const MAP_PHASES: PhaseInfo[] = [
  { key: "map-context", label: "Context Discovery" },
  { key: "topology", label: "Topology Analysis" },
  { key: "flow-analysis", label: "Flow Tracing" },
  { key: "requirements-mapping", label: "Requirements Mapping" },
  { key: "synthesis", label: "Map Synthesis" },
  { key: "complete", label: "Complete" },
];

function deriveRunsFromFilesystem(mapDir: string): MapRunInfo[] {
  const runsDir = join(mapDir, "runs");
  if (!existsSync(runsDir)) {
    return [];
  }

  const runDirs = readdirSync(runsDir)
    .filter((d) => d.match(/^run-\d+$/))
    .sort((a, b) => {
      const numA = parseInt(a.replace("run-", ""));
      const numB = parseInt(b.replace("run-", ""));
      return numA - numB;
    });

  return runDirs.map((dir) => {
    const runNum = parseInt(dir.replace("run-", ""));
    const runPath = join(runsDir, dir);
    const mapPath = join(runPath, "map.md");

    // Count files from topology.md if it exists
    let fileCount = 0;
    const topologyPath = join(runPath, "topology.md");
    if (existsSync(topologyPath)) {
      const content = readFileSync(topologyPath, "utf-8");
      // Count lines in canonical file list section
      const fileListMatch = content.match(
        /## Canonical File List[\s\S]*?```([\s\S]*?)```/,
      );
      if (fileListMatch && fileListMatch[1]) {
        fileCount = fileListMatch[1].trim().split("\n").filter(Boolean).length;
      }
    }

    return {
      run: runNum,
      isComplete: existsSync(mapPath),
      fileCount,
    };
  });
}

export class MapProgressStrategy implements WorkflowProgressStrategy {
  readonly workflowType = "map" as const;
  readonly phases = MAP_PHASES;
  readonly totalPhases = 6;

  parseState(
    sessionPath: string,
    preservedStartTime?: number,
  ): MapWorkflowState | null {
    const session = basename(sessionPath);
    const statePath = join(sessionPath, "state.json");

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const stateContent = readFileSync(statePath, "utf-8");
      const state: StateJson = JSON.parse(stateContent);

      // Only parse if this is a map workflow
      if (state.workflow_type !== "map") {
        return null;
      }

      return this.parseFromStateJson(
        session,
        state,
        sessionPath,
        preservedStartTime,
      );
    } catch {
      return null;
    }
  }

  private parseFromStateJson(
    session: string,
    state: StateJson,
    sessionPath: string,
    preservedStartTime?: number,
  ): MapWorkflowState {
    // Prefer map_started_at over started_at (started_at may be from review workflow)
    const effectiveStartTime = state.map_started_at ?? state.started_at;
    const startTime =
      preservedStartTime ??
      (effectiveStartTime
        ? new Date(effectiveStartTime).getTime()
        : Date.now());

    const mapDir = join(sessionPath, "map");
    const runs = deriveRunsFromFilesystem(mapDir);

    const highestExistingRun =
      runs.length > 0 ? Math.max(...runs.map((r) => r.run)) : 1;
    const stateRun = state.current_map_run ?? 1;
    const currentRun = Math.min(stateRun, highestExistingRun);
    const currentRunDir = join(mapDir, "runs", `run-${currentRun}`);

    // Derive phase completion from filesystem artifacts
    const contextComplete = existsSync(
      join(sessionPath, "discovered-standards.md"),
    );
    const topologyComplete = existsSync(join(currentRunDir, "topology.md"));
    const flowAnalysisComplete = existsSync(
      join(currentRunDir, "flow-analysis.md"),
    );
    const requirementsMappingComplete = existsSync(
      join(currentRunDir, "requirements-mapping.md"),
    );
    const synthesisComplete = existsSync(join(currentRunDir, "map.md"));

    // Check if requirements were provided
    const hasRequirements = existsSync(join(sessionPath, "requirements.md"));

    // Derive agent status from artifacts (simplified - we can't track individual agents easily)
    const flowAnalysts: AgentStatus[] = flowAnalysisComplete
      ? [
          {
            name: "flow-analyst",
            displayName: "Flow Analysts",
            status: "complete",
          },
        ]
      : [];
    const requirementsMappers: AgentStatus[] =
      requirementsMappingComplete && hasRequirements
        ? [
            {
              name: "req-mapper",
              displayName: "Requirements Mappers",
              status: "complete",
            },
          ]
        : [];

    return {
      workflowType: "map",
      session,
      phase: state.current_phase as MapPhase,
      phaseNumber: state.phase_number,
      totalPhases: this.totalPhases,
      contextComplete,
      topologyComplete,
      flowAnalysisComplete,
      requirementsMappingComplete,
      synthesisComplete,
      currentRun,
      runs,
      flowAnalysts,
      requirementsMappers,
      hasRequirements,
      startTime,
      complete: state.current_phase === "complete",
    };
  }

  render(state: MapWorkflowState): void {
    const lines: string[] = [];
    const log = (line: string = "") => lines.push(line);

    log();
    log(chalk.bold.white("  Open Code Review") + chalk.cyan(" · Map"));
    log();

    // Clamp elapsed to 0 if startTime is in the future (defensive: bad timestamp in state.json)
    const elapsed = Math.max(0, Date.now() - state.startTime);
    const runInfo =
      state.currentRun > 1
        ? chalk.cyan(` Run ${state.currentRun}`) + chalk.dim("  ·  ")
        : "";
    log(
      chalk.dim("  ") +
        chalk.white(state.session) +
        chalk.dim("  ·  ") +
        runInfo +
        chalk.white(formatDuration(elapsed)),
    );
    log();

    // File count if available
    const currentRunInfo = state.runs.find((r) => r.run === state.currentRun);
    if (currentRunInfo && currentRunInfo.fileCount > 0) {
      log(
        chalk.dim("  ") +
          chalk.white(`${currentRunInfo.fileCount} files`) +
          chalk.dim(" in changeset"),
      );
      log();
    }

    const progressPhases = state.complete ? 6 : state.phaseNumber;
    const currentPhase = this.phases.find((p) => p.key === state.phase);
    const phaseLabel = state.complete ? "Done" : currentPhase?.label;
    log(`  ${renderProgressBar(progressPhases, 6, phaseLabel)}`);
    log();

    const phaseCompletion: Record<string, boolean> = {
      "map-context": state.contextComplete,
      topology: state.topologyComplete,
      "flow-analysis": state.flowAnalysisComplete,
      "requirements-mapping": state.requirementsMappingComplete,
      synthesis: state.synthesisComplete,
      complete: state.complete,
    };

    for (const phase of this.phases) {
      // Skip requirements-mapping if no requirements provided
      if (phase.key === "requirements-mapping" && !state.hasRequirements) {
        continue;
      }

      const isComplete = phaseCompletion[phase.key] ?? false;
      const isCurrent = state.phase === phase.key && !state.complete;
      const status = getPhaseStatus(isComplete, isCurrent);

      let label: string;
      if (isCurrent) {
        label = chalk.cyan.bold(phase.label);
      } else if (isComplete) {
        label = chalk.white(phase.label);
      } else {
        label = chalk.dim(phase.label);
      }

      log(`  ${status} ${label}`);

      // Show agent info for flow analysis
      if (phase.key === "flow-analysis" && state.flowAnalysts.length > 0) {
        const agentLine = state.flowAnalysts
          .map((a) => {
            const icon =
              a.status === "complete" ? chalk.green("✓") : chalk.dim("○");
            return `${icon} ${chalk.dim(a.displayName)}`;
          })
          .join(chalk.dim("  │  "));
        log(chalk.dim("    ") + agentLine);
      }

      // Show agent info for requirements mapping
      if (
        phase.key === "requirements-mapping" &&
        state.requirementsMappers.length > 0
      ) {
        const agentLine = state.requirementsMappers
          .map((a) => {
            const icon =
              a.status === "complete" ? chalk.green("✓") : chalk.dim("○");
            return `${icon} ${chalk.dim(a.displayName)}`;
          })
          .join(chalk.dim("  │  "));
        log(chalk.dim("    ") + agentLine);
      }
    }

    log();

    if (state.complete) {
      log(chalk.green.bold("  ✓ Map Complete"));
      log(
        chalk.dim("    ") +
          chalk.dim("→ ") +
          chalk.white(
            `.ocr/sessions/${state.session}/map/runs/run-${state.currentRun}/map.md`,
          ),
      );
    } else {
      log(chalk.dim("  Ctrl+C to exit"));
    }
    log();

    clearForRenderType("map-progress");
    logUpdate(padLines(lines).join("\n"));
  }

  renderWaiting(): void {
    const lines: string[] = [];
    const log = (line: string = "") => lines.push(line);

    log();
    log(chalk.bold.white("  Open Code Review") + chalk.cyan(" · Map"));
    log();
    log(chalk.dim("  Waiting for session..."));
    log();

    const bar = chalk.dim("─".repeat(24));
    log(`  ${bar}  ${chalk.dim("0%")}`);
    log();

    log(chalk.dim("  Run ") + chalk.white("/ocr-map") + chalk.dim(" to start"));
    log();
    log(chalk.dim("  Ctrl+C to exit"));
    log();

    clearForRenderType("map-waiting");
    logUpdate(padLines(lines).join("\n"));
  }
}

export const mapStrategy = new MapProgressStrategy();
