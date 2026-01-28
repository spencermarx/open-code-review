import {
  existsSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import type { AIToolConfig } from "./config.js";

const require = createRequire(import.meta.url);

export type InstallResult = {
  tool: AIToolConfig;
  success: boolean;
  error?: string;
};

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getAgentsPackagePath(): string {
  try {
    const agentsPath = require.resolve("@open-code-review/agents/package.json");
    return dirname(agentsPath);
  } catch {
    const localPath = join(process.cwd(), "packages", "agents");
    if (existsSync(localPath)) {
      return localPath;
    }
    throw new Error(
      "Could not find @open-code-review/agents package. Run from OCR repo or install the package.",
    );
  }
}

function copyDirSafe(src: string, dest: string): boolean {
  try {
    ensureDir(dirname(dest));
    cpSync(src, dest, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function copyFileSafe(src: string, dest: string): boolean {
  try {
    ensureDir(dirname(dest));
    const content = readFileSync(src);
    writeFileSync(dest, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a reference file that points to the central .ocr/commands/ location
 */
function generateCommandReference(
  commandName: string,
  description: string,
): string {
  const baseName = commandName.replace(/\.md$/, "").replace(/^ocr-/, "");
  return `---
description: ${description}
---

# OCR: ${baseName.charAt(0).toUpperCase() + baseName.slice(1)}

This command is managed by Open Code Review.

**Execute this command by reading and following:** \`.ocr/commands/${baseName}.md\`
`;
}

/**
 * Extract description from command frontmatter
 */
function extractDescription(content: string): string {
  const match = content.match(/^---[\s\S]*?description:\s*(.+?)\n/m);
  return match?.[1]?.trim() ?? "OCR command";
}

/**
 * Install commands to central .ocr/commands/ and create references in tool directories
 * - Central: .ocr/commands/review.md (full command)
 * - Tool refs: .claude/commands/ocr/review.md (pointer to central)
 */
function installCommandsForTool(
  tool: AIToolConfig,
  commandsSource: string,
  targetDir: string,
): boolean {
  const toolCommandsDir = join(targetDir, tool.commandsDir);
  const centralCommandsDir = join(targetDir, ".ocr", "commands");

  ensureDir(toolCommandsDir);
  ensureDir(centralCommandsDir);

  try {
    const commandFiles = readdirSync(commandsSource).filter((f) =>
      f.endsWith(".md"),
    );

    // First, install all commands to central .ocr/commands/
    for (const file of commandFiles) {
      const srcPath = join(commandsSource, file);
      // Normalize name (remove ocr- prefix if present)
      const normalizedName = file.replace(/^ocr-/, "");
      const centralPath = join(centralCommandsDir, normalizedName);
      if (!copyFileSafe(srcPath, centralPath)) {
        return false;
      }
    }

    // Then, create reference files in tool-specific directories
    if (tool.commandStrategy === "subdirectory") {
      // Create ocr/ subdirectory with reference files
      // Files: .claude/commands/ocr/review.md → references .ocr/commands/review.md
      const ocrSubdir = join(toolCommandsDir, "ocr");
      ensureDir(ocrSubdir);

      for (const file of commandFiles) {
        const srcPath = join(commandsSource, file);
        const content = readFileSync(srcPath, "utf-8");
        const description = extractDescription(content);
        const normalizedName = file.replace(/^ocr-/, "");
        const refContent = generateCommandReference(
          normalizedName,
          description,
        );
        const destPath = join(ocrSubdir, normalizedName);
        writeFileSync(destPath, refContent);
      }
    } else {
      // flat-prefixed: Create reference files with ocr- prefix
      // Files: .windsurf/workflows/ocr-review.md → references .ocr/commands/review.md
      for (const file of commandFiles) {
        const srcPath = join(commandsSource, file);
        const content = readFileSync(srcPath, "utf-8");
        const description = extractDescription(content);
        const normalizedName = file.replace(/^ocr-/, "");
        const destName = `ocr-${normalizedName}`;
        const refContent = generateCommandReference(
          normalizedName,
          description,
        );
        const destPath = join(toolCommandsDir, destName);
        writeFileSync(destPath, refContent);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function installForTool(
  tool: AIToolConfig,
  targetDir: string,
): InstallResult {
  const agentsPath = getAgentsPackagePath();
  // Skills are now at skills/ocr/ for Claude Code plugin compatibility
  const ocrSkillsSource = join(agentsPath, "skills", "ocr");
  const commandsSource = join(agentsPath, "commands");

  const ocrDir = join(targetDir, ".ocr");
  const ocrSkillsDest = join(ocrDir, "skills");

  ensureDir(ocrDir);
  ensureDir(join(ocrDir, "sessions"));

  const gitignoreContent = `# OCR session files
sessions/
`;
  const gitignorePath = join(ocrDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, gitignoreContent);
  }

  // Preserve user-customized config.yaml if it exists
  const configPath = join(ocrDir, "config.yaml");
  let existingConfig: Buffer | null = null;
  if (existsSync(configPath)) {
    try {
      existingConfig = readFileSync(configPath);
    } catch {
      // Ignore read errors - will use fresh template
    }
  }

  // Preserve existing reviewers directory (users may have customized or added reviewers)
  const reviewersDir = join(ocrSkillsDest, "references", "reviewers");
  const existingReviewers: Map<string, Buffer> = new Map();
  if (existsSync(reviewersDir)) {
    try {
      const reviewerFiles = readdirSync(reviewersDir).filter((f) =>
        f.endsWith(".md"),
      );
      for (const file of reviewerFiles) {
        const filePath = join(reviewersDir, file);
        existingReviewers.set(file, readFileSync(filePath));
      }
    } catch {
      // Ignore read errors - will use fresh templates
    }
  }

  // Install skills to .ocr/skills/
  const skillsOk = copyDirSafe(ocrSkillsSource, ocrSkillsDest);

  if (!skillsOk) {
    return {
      tool,
      success: false,
      error: "Failed to install OCR skills to .ocr/",
    };
  }

  // Install config.yaml to .ocr/config.yaml (if not already customized)
  const configSource = join(ocrSkillsSource, "assets", "config.yaml");
  if (existingConfig) {
    // Restore user's customized config
    try {
      writeFileSync(configPath, existingConfig);
    } catch {
      // Ignore write errors
    }
  } else if (existsSync(configSource)) {
    // Install fresh config template
    copyFileSafe(configSource, configPath);
  }

  // Remove duplicate config.yaml from skills/assets/ (source template, not needed in target)
  const duplicateConfig = join(ocrSkillsDest, "assets", "config.yaml");
  if (existsSync(duplicateConfig)) {
    try {
      unlinkSync(duplicateConfig);
    } catch {
      // Ignore deletion errors
    }
  }

  // Restore preserved reviewers (all reviewers are preserved during updates)
  if (existingReviewers.size > 0) {
    ensureDir(reviewersDir);
    for (const [file, content] of existingReviewers) {
      try {
        writeFileSync(join(reviewersDir, file), content);
      } catch {
        // Ignore write errors
      }
    }
  }

  // Install commands using tool-specific strategy
  const commandsOk = installCommandsForTool(tool, commandsSource, targetDir);

  if (!commandsOk) {
    return {
      tool,
      success: false,
      error: `Failed to install OCR commands to ${tool.commandsDir}`,
    };
  }

  return {
    tool,
    success: true,
  };
}

/**
 * Detect which AI tools are installed based on their config directories.
 * Uses smarter detection for tools with ambiguous config directories.
 */
export function detectInstalledTools(
  targetDir: string,
  tools: AIToolConfig[],
): AIToolConfig[] {
  return tools.filter((tool) => {
    const configPath = join(targetDir, tool.configDir);

    // Special case: GitHub Copilot uses .github/ which exists in all GitHub repos
    // Check for copilot-instructions.md or .github/copilot/ as actual Copilot indicators
    if (tool.id === "github-copilot") {
      const copilotInstructions = join(
        targetDir,
        ".github",
        "copilot-instructions.md",
      );
      const copilotDir = join(targetDir, ".github", "copilot");
      const copilotCommands = join(targetDir, ".github", "commands");
      return (
        existsSync(copilotInstructions) ||
        existsSync(copilotDir) ||
        existsSync(copilotCommands)
      );
    }

    return existsSync(configPath);
  });
}
