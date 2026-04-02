import chalk from "chalk";
import { execBinary } from "@open-code-review/platform";

// ── Types ──

export type DepCheck = {
  name: string;
  binary: string;
  found: boolean;
  version?: string;
  required: boolean;
  installHint?: string;
  category: DepCategory;
};

export type Capabilities = {
  /** Always true when OCR is installed */
  ideCommands: boolean;
  /** Always true when OCR is installed */
  dashboardViewer: boolean;
  /** True if Claude Code OR OpenCode is found */
  dashboardAi: boolean;
  /** True if gh CLI is found */
  githubPost: boolean;
};

export type DepCheckResult = {
  checks: DepCheck[];
  allRequiredFound: boolean;
  capabilities: Capabilities;
};

type DepCategory = "core" | "ai-cli" | "github";

type DepSpec = {
  name: string;
  binary: string;
  required: boolean;
  installHint: string;
  category: DepCategory;
};

// ── Category metadata ──

const CATEGORY_ORDER: DepCategory[] = ["core", "ai-cli", "github"];

const CATEGORY_INFO: Record<DepCategory, { label: string; hint: string }> = {
  core: { label: "Core", hint: "" },
  "ai-cli": {
    label: "AI CLI",
    hint: "powers dashboard commands + chat",
  },
  github: {
    label: "GitHub Integration",
    hint: "post reviews to PRs",
  },
};

// ── Dependency definitions ──

const DEPS: DepSpec[] = [
  {
    name: "git",
    binary: "git",
    required: true,
    installHint: "https://git-scm.com",
    category: "core",
  },
  {
    name: "Claude Code",
    binary: "claude",
    required: false,
    installHint:
      "https://docs.anthropic.com/en/docs/claude-code/getting-started",
    category: "ai-cli",
  },
  {
    name: "OpenCode",
    binary: "opencode",
    required: false,
    installHint: "https://opencode.ai",
    category: "ai-cli",
  },
  {
    name: "GitHub CLI",
    binary: "gh",
    required: false,
    installHint: "https://cli.github.com",
    category: "github",
  },
];

// ── Helpers ──

function parseVersion(output: string): string | undefined {
  const match = output.match(/\d+\.\d+[\.\d]*/);
  return match?.[0];
}

function checkBinary(spec: DepSpec): DepCheck {
  try {
    const output = execBinary(spec.binary, ["--version"], {
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

// ── Public API ──

/**
 * Check for required and optional external dependencies.
 * Returns checks grouped by category plus computed capability flags.
 */
export function checkDependencies(): DepCheckResult {
  const checks = DEPS.map(checkBinary);
  const allRequiredFound = checks
    .filter((c) => c.required)
    .every((c) => c.found);

  const aiCliChecks = checks.filter((c) => c.category === "ai-cli");
  const hasAiCli = aiCliChecks.some((c) => c.found);
  const hasGh = checks.some((c) => c.binary === "gh" && c.found);

  return {
    checks,
    allRequiredFound,
    capabilities: {
      ideCommands: true,
      dashboardViewer: true,
      dashboardAi: hasAiCli,
      githubPost: hasGh,
    },
  };
}

/**
 * Print the environment check block grouped by category.
 *
 * Output:
 *   Environment
 *
 *     Core
 *     ✓ git                  2.43.0
 *
 *     AI CLI (powers dashboard commands + chat)
 *     ✓ Claude Code          1.0.33
 *     ✗ OpenCode             not found
 *
 * @param suppressWarnings - If true, skip the warning block for missing
 *   required deps (useful when the caller handles warnings separately).
 */
export function printDepChecks(
  result: DepCheckResult,
  { suppressWarnings = false }: { suppressWarnings?: boolean } = {},
): void {
  console.log(chalk.bold("  Environment"));
  console.log();

  // Column-align names within each category
  const maxNameLen = Math.max(...result.checks.map((c) => c.name.length));

  for (const category of CATEGORY_ORDER) {
    const categoryChecks = result.checks.filter(
      (c) => c.category === category,
    );
    if (categoryChecks.length === 0) continue;

    const info = CATEGORY_INFO[category];
    const header = info.hint
      ? `${info.label} ${chalk.dim(`(${info.hint})`)}`
      : info.label;
    console.log(`    ${chalk.bold(header)}`);

    for (const check of categoryChecks) {
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
          `    ${chalk.dim("✗")} ${chalk.dim(paddedName)} ${chalk.dim("not found")}`,
        );
      }
    }

    console.log();
  }

  if (suppressWarnings) return;

  // Print warning blocks for missing required deps
  const missingRequired = result.checks.filter(
    (c) => c.required && !c.found,
  );

  if (missingRequired.length > 0) {
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

/**
 * Print the "What you can do" capability summary.
 * Translates dependency presence into user-facing feature availability.
 */
export function printCapabilities(result: DepCheckResult): void {
  const caps = result.capabilities;

  console.log(
    chalk.dim("  ─────────────────────────────────────────"),
  );
  console.log();
  console.log(chalk.bold("  What you can do"));
  console.log();

  type CapItem = { ok: boolean; label: string; detail?: string };

  const items: CapItem[] = [
    {
      ok: true,
      label: "IDE slash commands",
      detail: "/ocr:review, /ocr:map, /ocr:post",
    },
    {
      ok: true,
      label: "Dashboard viewer",
      detail: "ocr dashboard — browse sessions, reviews, maps",
    },
    {
      ok: caps.dashboardAi,
      label: "Dashboard commands",
      detail: caps.dashboardAi
        ? "Command Center, Ask the Team chat"
        : "Install Claude Code or OpenCode to enable",
    },
    {
      ok: caps.githubPost,
      label: "Post to GitHub",
      detail: caps.githubPost
        ? "Post reviews to GitHub PRs"
        : "Install gh CLI → https://cli.github.com",
    },
  ];

  // Align labels
  const maxLabelLen = Math.max(...items.map((i) => i.label.length));

  for (const item of items) {
    const paddedLabel = item.label.padEnd(maxLabelLen + 3);
    const detail = item.detail ? chalk.dim(item.detail) : "";

    if (item.ok) {
      console.log(`    ${chalk.green("✓")} ${paddedLabel} ${detail}`);
    } else {
      console.log(
        `    ${chalk.dim("✗")} ${chalk.dim(paddedLabel)} ${detail}`,
      );
    }
  }
}
