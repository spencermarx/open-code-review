export type AIToolId =
  | "amazon-q"
  | "augment"
  | "claude"
  | "cline"
  | "codex"
  | "continue"
  | "cursor"
  | "gemini"
  | "github-copilot"
  | "kilo-code"
  | "opencode"
  | "qoder"
  | "roo-code"
  | "windsurf";

/**
 * Command installation strategy:
 * - 'subdirectory': Creates `ocr/` folder with unprefixed files → `/ocr:doctor`
 * - 'flat-prefixed': Copies files with `ocr-` prefix directly → `/ocr-doctor`
 */
export type CommandStrategy = "subdirectory" | "flat-prefixed";

export type AIToolConfig = {
  id: AIToolId;
  name: string;
  configDir: string;
  commandsDir: string;
  skillsDir: string;
  commandStrategy: CommandStrategy;
};

export const AI_TOOLS: AIToolConfig[] = [
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    configDir: ".aws/amazonq",
    commandsDir: ".aws/amazonq/commands",
    skillsDir: ".aws/amazonq/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "augment",
    name: "Augment (Auggie)",
    configDir: ".augment",
    commandsDir: ".augment/commands",
    skillsDir: ".augment/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "claude",
    name: "Claude Code",
    configDir: ".claude",
    commandsDir: ".claude/commands",
    skillsDir: ".claude/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "cline",
    name: "Cline",
    configDir: ".cline",
    commandsDir: ".cline/commands",
    skillsDir: ".cline/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "codex",
    name: "Codex",
    configDir: ".codex",
    commandsDir: ".codex/commands",
    skillsDir: ".codex/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "continue",
    name: "Continue",
    configDir: ".continue",
    commandsDir: ".continue/commands",
    skillsDir: ".continue/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "cursor",
    name: "Cursor",
    configDir: ".cursor",
    commandsDir: ".cursor/commands",
    skillsDir: ".cursor/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    configDir: ".gemini",
    commandsDir: ".gemini/commands",
    skillsDir: ".gemini/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    configDir: ".github",
    commandsDir: ".github/commands",
    skillsDir: ".github/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    configDir: ".kilocode",
    commandsDir: ".kilocode/commands",
    skillsDir: ".kilocode/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "opencode",
    name: "OpenCode",
    configDir: ".opencode",
    commandsDir: ".opencode/commands",
    skillsDir: ".opencode/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "qoder",
    name: "Qoder",
    configDir: ".qoder",
    commandsDir: ".qoder/commands",
    skillsDir: ".qoder/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "roo-code",
    name: "RooCode",
    configDir: ".roo",
    commandsDir: ".roo/commands",
    skillsDir: ".roo/skills",
    commandStrategy: "subdirectory",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configDir: ".windsurf",
    commandsDir: ".windsurf/workflows",
    skillsDir: ".windsurf/skills",
    commandStrategy: "flat-prefixed",
  },
];

export function getToolById(id: AIToolId): AIToolConfig | undefined {
  return AI_TOOLS.find((tool) => tool.id === id);
}

export function getToolIds(): AIToolId[] {
  return AI_TOOLS.map((tool) => tool.id);
}

export function parseToolsArg(toolsArg: string): AIToolId[] {
  if (toolsArg === "all") {
    return getToolIds();
  }

  const requestedIds = toolsArg.split(",").map((s) => s.trim().toLowerCase());
  const validIds = getToolIds();
  const result: AIToolId[] = [];

  for (const id of requestedIds) {
    if (validIds.includes(id as AIToolId)) {
      result.push(id as AIToolId);
    } else {
      throw new Error(
        `Invalid tool ID: "${id}". Valid options: ${validIds.join(", ")}`,
      );
    }
  }

  return result;
}
