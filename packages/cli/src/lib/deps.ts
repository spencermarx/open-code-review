import { execFileSync } from "node:child_process";
import chalk from "chalk";

export type DepCheck = {
  name: string;
  binary: string;
  found: boolean;
  version?: string;
  required: boolean;
  installHint?: string;
};

export type DepCheckResult = {
  checks: DepCheck[];
  allRequiredFound: boolean;
};

type DepSpec = {
  name: string;
  binary: string;
  required: boolean;
  installHint: string;
};

const DEPS: DepSpec[] = [
  {
    name: "git",
    binary: "git",
    required: true,
    installHint: "https://git-scm.com",
  },
  {
    name: "Claude Code",
    binary: "claude",
    required: true,
    installHint:
      "https://docs.anthropic.com/en/docs/claude-code/getting-started",
  },
  {
    name: "GitHub CLI",
    binary: "gh",
    required: false,
    installHint: "https://cli.github.com",
  },
];

function parseVersion(output: string): string | undefined {
  const match = output.match(/\d+\.\d+[\.\d]*/);
  return match?.[0];
}

function checkBinary(spec: DepSpec): DepCheck {
  try {
    const output = execFileSync(spec.binary, ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const version = parseVersion(output);
    return { ...spec, found: true, version };
  } catch {
    return { ...spec, found: false };
  }
}

/**
 * Check for required and optional external dependencies.
 */
export function checkDependencies(): DepCheckResult {
  const checks = DEPS.map(checkBinary);
  const allRequiredFound = checks
    .filter((c) => c.required)
    .every((c) => c.found);
  return { checks, allRequiredFound };
}

/**
 * Print a compact preflight check block to the console.
 * Shows found/missing status for each dependency with version info.
 *
 * @param suppressWarnings - If true, only prints the status table without
 *   the warning block for missing required deps (useful when the caller
 *   handles warnings in its own summary section).
 */
export function printDepChecks(
  result: DepCheckResult,
  { suppressWarnings = false }: { suppressWarnings?: boolean } = {},
): void {
  console.log(chalk.bold("  Preflight"));
  console.log();

  // Column-align names: pad to longest name length
  const maxNameLen = Math.max(...result.checks.map((c) => c.name.length));

  for (const check of result.checks) {
    const paddedName = check.name.padEnd(maxNameLen + 2);

    if (check.found) {
      console.log(
        `    ${chalk.green("✓")} ${paddedName} ${chalk.dim(check.version ?? "")}`,
      );
    } else if (check.required) {
      console.log(
        `    ${chalk.red("✗")} ${paddedName} ${chalk.dim("not found")}`,
      );
    } else {
      console.log(
        `    ${chalk.dim("✗")} ${chalk.dim(paddedName)} ${chalk.dim("not found (optional)")}`,
      );
    }
  }

  if (suppressWarnings) return;

  // Print warning blocks for missing required deps
  const missingRequired = result.checks.filter(
    (c) => c.required && !c.found,
  );

  if (missingRequired.length > 0) {
    console.log();
    for (const dep of missingRequired) {
      console.log(
        `  ${chalk.yellow("⚠")} ${chalk.yellow(`${dep.name} was not found in PATH.`)}`,
      );
      if (dep.installHint) {
        console.log(
          `    ${chalk.dim("Install:")} ${chalk.white(dep.installHint)}`,
        );
      }
      console.log(
        `    ${chalk.dim("Verify:")}  ${chalk.white(`${dep.binary} --version`)}`,
      );
    }
  }
}
