/**
 * Shared rendering utilities for progress strategies
 */

import chalk from "chalk";
import logUpdate from "log-update";

/**
 * Track last render state to detect context switches
 */
let lastRenderType: string | null = null;
let lastLineCount = 0;

/**
 * Format a duration in milliseconds to human-readable string.
 * Negative values are clamped to 0 (caller should prevent negative elapsed times).
 */
export function formatDuration(ms: number): string {
  const clampedMs = Math.max(0, ms);
  const totalSeconds = Math.floor(clampedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Render a progress bar with optional label
 */
export function renderProgressBar(
  current: number,
  total: number,
  label?: string,
): string {
  const width = 24;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green("━".repeat(filled)) + chalk.dim("─".repeat(empty));
  const percent = Math.round((current / total) * 100);
  const percentStr = chalk.bold.white(`${percent}%`);
  return label
    ? `${bar}  ${percentStr} ${chalk.dim("·")} ${chalk.cyan(label)}`
    : `${bar}  ${percentStr}`;
}

/**
 * Get the status icon for a phase
 */
export function getPhaseStatus(
  isComplete: boolean,
  isCurrent: boolean,
): string {
  if (isComplete) return chalk.green("✓");
  if (isCurrent) return chalk.cyan("▸");
  return chalk.dim("·");
}

/**
 * Clear previous output if switching render types
 */
export function clearForRenderType(renderType: string): void {
  if (lastRenderType !== renderType) {
    logUpdate.clear();
  }
  lastRenderType = renderType;
}

/**
 * Pad lines to prevent stale content from persisting
 */
export function padLines(lines: string[]): string[] {
  while (lines.length < lastLineCount) {
    lines.push("");
  }
  lastLineCount = lines.length;
  return lines;
}

/**
 * Reset render state (useful for testing)
 */
export function resetRenderState(): void {
  lastRenderType = null;
  lastLineCount = 0;
}
