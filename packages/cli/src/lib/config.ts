import {
  hostCapabilitiesFor,
  type HostCapabilities,
} from "@open-code-review/platform";

// Re-export so consumers (the skill via `getHostCapabilities`, tests) have one
// import surface; the canonical capability data lives in the platform kernel.
export {
  hostCapabilitiesFor,
  DEFAULT_HOST_CAPABILITIES,
  type HostCapabilities,
} from "@open-code-review/platform";

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
  | "windsurf"
  | "agents";

/**
 * Command installation strategy:
 * - 'subdirectory': Creates `ocr/` folder with unprefixed files → `/ocr:doctor`
 * - 'flat-prefixed': Copies files with `ocr-` prefix directly → `/ocr-doctor`
 */
export type CommandStrategy = "subdirectory" | "flat-prefixed";

/**
 * How the OCR managed block is wrapped inside an instruction file:
 * - 'markdown'  → HTML-comment markers (CLAUDE.md, AGENTS.md, GEMINI.md, …)
 * - 'plaintext' → line-comment markers for non-markdown files (.windsurfrules)
 */
export type InstructionFileFormat = "markdown" | "plaintext";

/**
 * One native instruction-file target for a tool, relative to the project root.
 * `AGENTS.md` is written universally by the injector and is intentionally NOT
 * listed here — only the tool-specific file(s) that differ from AGENTS.md.
 */
export type InstructionFileTarget = {
  path: string;
  format: InstructionFileFormat;
};

/** Where a host's OCR command reference files go, and how they are named. */
export type CommandsConfig = {
  dir: string;
  strategy: CommandStrategy;
};

type BaseToolConfig = {
  id: AIToolId;
  name: string;
  configDir: string;
  /**
   * The tool's NATIVE instruction file(s), beyond the universal `AGENTS.md`.
   * Omitted ⇒ the tool reads `AGENTS.md` natively (Codex, OpenCode, Cursor,
   * Amazon Q, …) and needs no extra file.
   */
  instructionFiles?: InstructionFileTarget[];
  /**
   * The spawnable agentic CLI binary for this tool, if any. Joins this
   * install-time entry to the dashboard's runtime adapter registry. Absent for
   * editors that consume OCR skills but have no OCR-spawnable agentic CLI.
   */
  vendorBinary?: string;
};

/**
 * An agentic host: an AI coding environment that runs OCR. Hosts receive
 * command reference files and are listed by `ocr host capabilities`.
 */
export type HostToolConfig = BaseToolConfig & {
  kind: "host";
  commands: CommandsConfig;
};

/**
 * A passive skills-discovery target (e.g. the vendor-neutral `.agents/`
 * root). It is not a host: it receives only a thin `ocr/SKILL.md` pointer to
 * `.ocr/skills/SKILL.md`, no commands, and no extra instruction file.
 */
export type DiscoveryToolConfig = BaseToolConfig & {
  kind: "discovery";
  /** Skills root that receives the pointer, e.g. `.agents/skills`. */
  skillPointerDir: string;
};

export type AIToolConfig = HostToolConfig | DiscoveryToolConfig;

/**
 * First body line of every OCR-generated skill pointer. Its presence is what
 * marks a pointer as OCR-managed: a `SKILL.md` without it was written by
 * someone else and must never be overwritten or treated as configured.
 */
export const SKILL_POINTER_MARKER = "This skill is managed by Open Code Review.";

/**
 * Project-relative path (forward slashes) of a discovery target's pointer
 * skill, e.g. `.agents/skills/ocr/SKILL.md`. The single source of this layout.
 */
export function skillPointerPath(tool: DiscoveryToolConfig): string {
  return `${tool.skillPointerDir}/ocr/SKILL.md`;
}

// NOTE on splitting AIToolConfig (watch-list): the install-time fields and the
// runtime cluster (`vendorBinary`) are not a Data Clump today. Consider splitting
// when ANY of: (a) the runtime cluster grows a third field, (b) a function takes
// `Pick<AIToolConfig, 'vendorBinary' | ...>`, (c) a non-CLI package imports
// `AIToolConfig` to read a runtime field. Host capabilities are resolved by
// binary/id from the platform kernel, so the dashboard never imports this type.

export const AI_TOOLS: AIToolConfig[] = [
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    configDir: ".aws/amazonq",
    kind: "host",
    commands: { dir: ".aws/amazonq/commands", strategy: "subdirectory" },
  },
  {
    id: "augment",
    name: "Augment (Auggie)",
    configDir: ".augment",
    kind: "host",
    commands: { dir: ".augment/commands", strategy: "subdirectory" },
  },
  {
    id: "claude",
    name: "Claude Code",
    configDir: ".claude",
    kind: "host",
    commands: { dir: ".claude/commands", strategy: "subdirectory" },
    instructionFiles: [{ path: "CLAUDE.md", format: "markdown" }],
    vendorBinary: "claude",
  },
  {
    id: "cline",
    name: "Cline",
    configDir: ".cline",
    kind: "host",
    commands: { dir: ".cline/commands", strategy: "subdirectory" },
  },
  {
    id: "codex",
    name: "Codex",
    configDir: ".codex",
    kind: "host",
    commands: { dir: ".codex/commands", strategy: "subdirectory" },
    // Codex reads AGENTS.md natively — no extra instruction file.
    vendorBinary: "codex",
  },
  {
    id: "continue",
    name: "Continue",
    configDir: ".continue",
    kind: "host",
    commands: { dir: ".continue/commands", strategy: "subdirectory" },
  },
  {
    id: "cursor",
    name: "Cursor",
    configDir: ".cursor",
    kind: "host",
    commands: { dir: ".cursor/commands", strategy: "subdirectory" },
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    configDir: ".gemini",
    kind: "host",
    commands: { dir: ".gemini/commands", strategy: "subdirectory" },
    instructionFiles: [{ path: "GEMINI.md", format: "markdown" }],
    vendorBinary: "gemini",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    configDir: ".github",
    kind: "host",
    commands: { dir: ".github/commands", strategy: "subdirectory" },
    instructionFiles: [
      { path: ".github/copilot-instructions.md", format: "markdown" },
    ],
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    configDir: ".kilocode",
    kind: "host",
    commands: { dir: ".kilocode/commands", strategy: "subdirectory" },
  },
  {
    id: "opencode",
    name: "OpenCode",
    configDir: ".opencode",
    kind: "host",
    commands: { dir: ".opencode/commands", strategy: "subdirectory" },
    // OpenCode reads AGENTS.md natively — no extra instruction file.
    vendorBinary: "opencode",
  },
  {
    id: "qoder",
    name: "Qoder",
    configDir: ".qoder",
    kind: "host",
    commands: { dir: ".qoder/commands", strategy: "subdirectory" },
  },
  {
    id: "roo-code",
    name: "RooCode",
    configDir: ".roo",
    kind: "host",
    commands: { dir: ".roo/commands", strategy: "subdirectory" },
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configDir: ".windsurf",
    kind: "host",
    commands: { dir: ".windsurf/workflows", strategy: "flat-prefixed" },
    instructionFiles: [{ path: ".windsurfrules", format: "plaintext" }],
  },
  {
    // Vendor-neutral Agent Skills root, read by many agents. Mirrors OpenSpec's
    // `agents` target: skills only, no commands, no extra instruction file
    // (the universal AGENTS.md is written by the injector regardless).
    id: "agents",
    name: "Universal (.agents)",
    configDir: ".agents",
    kind: "discovery",
    skillPointerDir: ".agents/skills",
  },
];

/**
 * Is this entry an agentic host (something that runs OCR), as opposed to a
 * passive discovery target like `agents`? Declared explicitly via `kind`.
 */
export function isHostTool(tool: AIToolConfig): tool is HostToolConfig {
  return tool.kind === "host";
}

export function getToolById(id: AIToolId): AIToolConfig | undefined {
  return AI_TOOLS.find((tool) => tool.id === id);
}

/**
 * Resolve a host's Phase-4 capabilities, derived from the single platform
 * authority (`hostCapabilitiesFor`). Unknown/editor tools fall back to the
 * conservative default. The tool id equals the vendor binary for the spawnable
 * agentic CLIs, so this and the dashboard adapters resolve from the same table.
 */
export function getHostCapabilities(id: AIToolId): HostCapabilities {
  return hostCapabilitiesFor(id);
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
