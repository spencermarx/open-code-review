import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_MARKER = "<!-- OCR:START -->";
const END_MARKER = "<!-- OCR:END -->";

const OCR_INSTRUCTION_BLOCK = `${START_MARKER}
# Open Code Review Instructions

These instructions are for AI assistants handling code review in this project.

Always open \`.ocr/skills/SKILL.md\` when the request:
- Asks for code review, PR review, or feedback on changes
- Mentions "review my code" or similar phrases
- Wants multi-perspective analysis of code quality
- Asks to map, organize, or navigate a large changeset

Use \`.ocr/skills/SKILL.md\` to learn:
- How to run the 8-phase review workflow
- How to generate a Code Review Map for large changesets
- Available reviewer personas and their focus areas
- Session management and output format

Keep this managed block so 'ocr init' can refresh the instructions.

${END_MARKER}`;

export function injectOcrInstructions(filePath: string): boolean {
  try {
    let content = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";

    const regex = new RegExp(
      `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
      "g",
    );
    content = content.replace(regex, "");

    content = content.trim();
    if (content.length > 0) {
      content += "\n\n";
    }
    content += OCR_INSTRUCTION_BLOCK + "\n";

    writeFileSync(filePath, content);
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function injectIntoProjectFiles(targetDir: string): {
  agentsMd: boolean;
  claudeMd: boolean;
} {
  const agentsMdPath = join(targetDir, "AGENTS.md");
  const claudeMdPath = join(targetDir, "CLAUDE.md");

  const agentsMd = injectOcrInstructions(agentsMdPath);
  const claudeMd = injectOcrInstructions(claudeMdPath);

  return { agentsMd, claudeMd };
}

export function hasOcrInstructions(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  return content.includes(START_MARKER) && content.includes(END_MARKER);
}
