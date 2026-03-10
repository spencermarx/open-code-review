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
import type { AIToolConfig } from "./config";
import { ensureGitignore } from "./gitignore.js";
import type { ReviewersMeta, ReviewerMeta, ReviewerTier } from "./state/types.js";

const require = createRequire(import.meta.url);

export type InstallResult = {
  tool: AIToolConfig;
  success: boolean;
  error?: string;
  warnings?: string[];
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

// ── Built-in reviewer metadata for static generation ──

const BUILTIN_ICON_MAP: Record<string, string> = {
  architect: "blocks",
  fullstack: "layers",
  reliability: "activity",
  "staff-engineer": "compass",
  principal: "crown",
  frontend: "layout",
  backend: "server",
  infrastructure: "cloud",
  performance: "gauge",
  accessibility: "accessibility",
  data: "database",
  devops: "rocket",
  dx: "terminal",
  mobile: "smartphone",
  security: "shield-alert",
  quality: "sparkles",
  testing: "test-tubes",
  ai: "bot",
  "docs-writer": "file-text",
};

const HOLISTIC_IDS = new Set(["architect", "fullstack", "reliability", "staff-engineer", "principal"]);
const SPECIALIST_IDS = new Set([
  "frontend", "backend", "infrastructure", "performance", "accessibility",
  "data", "devops", "dx", "mobile", "security", "quality", "testing", "ai", "docs-writer",
]);
const PERSONA_IDS = new Set([
  "martin-fowler", "kent-beck", "john-ousterhout", "anders-hejlsberg",
  "vladimir-khorikov", "kent-dodds", "tanner-linsley", "kamil-mysliwiec",
  "sandi-metz", "rich-hickey",
]);

function classifyTier(id: string): ReviewerTier {
  if (PERSONA_IDS.has(id)) return "persona";
  if (HOLISTIC_IDS.has(id)) return "holistic";
  if (SPECIALIST_IDS.has(id)) return "specialist";
  return "custom";
}

function extractReviewerName(content: string): string {
  const match = content.match(/^#\s+(.+?)(?:\s+—\s+Reviewer|\s+Reviewer)\s*$/m);
  if (match?.[1]) return match[1];
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.replace(/\s*Reviewer\s*$/, "").trim() ?? "Unknown";
}

function extractReviewerDescription(content: string): string {
  // First non-heading, non-blockquote paragraph
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue;
    if (trimmed.startsWith("You are a **") || trimmed.startsWith("You are reviewing")) {
      return trimmed.replace(/\*\*/g, "").replace(/^You are a /, "").replace(/^You are reviewing code through the lens of .*?\.\s*/, "").trim();
    }
  }
  return "";
}

function extractFocusAreas(content: string): string[] {
  const areas: string[] = [];
  const focusMatch = content.match(/## Your Focus Areas\n([\s\S]*?)(?=\n##|\n---|\z)/);
  if (focusMatch?.[1]) {
    const bullets = focusMatch[1].match(/- \*\*(.+?)\*\*/g);
    if (bullets) {
      for (const b of bullets) {
        const m = b.match(/- \*\*(.+?)\*\*/);
        if (m?.[1]) areas.push(m[1]);
      }
    }
  }
  return areas;
}

function extractPersonaFields(content: string): { known_for?: string; philosophy?: string } {
  const knownMatch = content.match(/>\s*\*\*Known for\*\*:\s*(.+)/);
  const philMatch = content.match(/>\s*\*\*Philosophy\*\*:\s*([\s\S]*?)(?=\n(?!>)|\n\n)/);

  const result: { known_for?: string; philosophy?: string } = {};
  if (knownMatch?.[1]) result.known_for = knownMatch[1].trim();
  if (philMatch?.[1]) {
    result.philosophy = philMatch[1]
      .split("\n")
      .map((l) => l.replace(/^>\s*/, "").trim())
      .join(" ")
      .trim();
  }
  return result;
}

export function generateReviewersMeta(
  reviewersDir: string,
  configPath: string,
): ReviewersMeta | null {
  if (!existsSync(reviewersDir)) return null;

  const files = readdirSync(reviewersDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return null;

  // Read default_team from config
  const defaultTeamIds = new Set<string>();
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, "utf-8");
      const teamMatch = configContent.match(/default_team:\s*\n((?:\s+\w[\w-]*:\s*\d+\s*(?:#[^\n]*)?\n?)*)/);
      if (teamMatch?.[1]) {
        const entries = teamMatch[1].matchAll(/\s+([\w-]+):\s*\d+/g);
        for (const entry of entries) {
          if (entry[1]) defaultTeamIds.add(entry[1]);
        }
      }
    } catch {
      // Ignore config parse errors
    }
  }

  const reviewers: ReviewerMeta[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    try {
      const content = readFileSync(join(reviewersDir, file), "utf-8");
      const tier = classifyTier(id);
      const isBuiltin = HOLISTIC_IDS.has(id) || SPECIALIST_IDS.has(id) || PERSONA_IDS.has(id);

      const reviewer: ReviewerMeta = {
        id,
        name: extractReviewerName(content),
        tier,
        icon: BUILTIN_ICON_MAP[id] ?? (tier === "persona" ? "brain" : "user"),
        description: extractReviewerDescription(content),
        focus_areas: extractFocusAreas(content),
        is_default: defaultTeamIds.has(id),
        is_builtin: isBuiltin,
      };

      if (tier === "persona") {
        const persona = extractPersonaFields(content);
        if (persona.known_for) reviewer.known_for = persona.known_for;
        if (persona.philosophy) reviewer.philosophy = persona.philosophy;
      }

      reviewers.push(reviewer);
    } catch {
      // Skip unreadable files
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    reviewers,
  };
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

  ensureGitignore(ocrDir);

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
  const warnings: string[] = [];
  if (existsSync(reviewersDir)) {
    try {
      const reviewerFiles = readdirSync(reviewersDir).filter((f) =>
        f.endsWith(".md"),
      );
      for (const file of reviewerFiles) {
        const filePath = join(reviewersDir, file);
        try {
          existingReviewers.set(file, readFileSync(filePath));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown error";
          warnings.push(`Could not read reviewer ${file}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      warnings.push(`Could not read reviewers directory: ${msg}`);
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        warnings.push(`Could not restore reviewer ${file}: ${msg}`);
      }
    }
  }

  // Generate reviewers-meta.json for dashboard (if not already present or if reviewers changed)
  const metaPath = join(ocrDir, "reviewers-meta.json");
  try {
    const meta = generateReviewersMeta(reviewersDir, configPath);
    if (meta) {
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    }
  } catch {
    // Non-fatal — user can run /ocr:sync-reviewers manually
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
    warnings: warnings.length > 0 ? warnings : undefined,
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
