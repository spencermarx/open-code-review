import chalk from "chalk";

/**
 * ASCII art banner for Open Code Review CLI
 * Styled to match the OCR logo with blue gradient effect
 */
const LOGO_LINES = [
  "       ╭─────────────────────────╮",
  "       │      ◉ ─── ◉ ─── ◉      │",
  "       │      │ ╲   │   ╱ │      │",
  "       │      ◉ ─── O ─── ◉      │",
  "       │      │ ╱   │   ╲ │      │",
  "       │      ◉ ─── ◉ ─── ◉      │",
  "       ╰─────────────────────────╯",
];

const TITLE_LINES = [
  " ╔═══════════════════════════════════════╗",
  " ║   O P E N   C O D E   R E V I E W     ║",
  " ╚═══════════════════════════════════════╝",
];

/**
 * Print the OCR banner with blue styling
 */
export function printBanner(): void {
  console.log();

  // Logo section - lighter blue for the network visualization
  for (const line of LOGO_LINES) {
    // Highlight the central 'O' and connection nodes
    const styled = line
      .replace(/O/g, chalk.bold.white("O"))
      .replace(/◉/g, chalk.cyan("◉"));
    console.log(chalk.blue(styled));
  }

  console.log();

  // Title section - bold white "OPEN CODE" and blue "REVIEW"
  for (const line of TITLE_LINES) {
    console.log(chalk.blue(line));
  }

  console.log();
  console.log(chalk.dim("  Multi-agent code review for AI coding assistants"));
  console.log();
}

/**
 * Print a minimal header (for commands that don't need full banner)
 */
export function printHeader(): void {
  console.log();
  console.log(chalk.bold.white("  Open Code Review"));
  console.log(chalk.dim("  AI-powered multi-agent code review"));
  console.log();
}
