// -- Windsurf adapter (minimal scaffold).
// Generates .windsurfrules from the canonical AGENTS.md source.
//
// Strategy: extract shared sections (Code Conventions, Release Process,
// OCR managed blocks) and produce plaintext-wrapped output — no @-import
// pointer here; all content is inlined as full text.

import type { HarnessProjector, NativeArtifact } from "../adapter";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const windsurfReserved: string[] = []; // no reserved paths — .windsurfrules is generated

/**
 * Extract non-harness-specific content from AGENTS.md.
 * Returns everything except the "Harness Compatibility" section and
 * any harness-native management blocks (OPENSPEC, OCR).
 */
function extractSharedContent(agentsMd: string): string {
  const lines = agentsMd.split("\n");
  const parts: string[] = [];
  let inHarnessSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect harness section boundaries
    if (/^## Harness Compatibility/.test(line)) {
      inHarnessSection = true;
      continue;
    }
    // Stop capturing when we hit another top-level ## (end of harness section)
    if (!inHarnessSection && /^## /.test(line)) {
      parts.push(line);
      continue;
    }
    if (/^## [A-Z]/.test(line) && inHarnessSection) {
      break; // end of all shared content
    }
    if (inHarnessSection) continue; // skip harness compatibility section

    // Include non-harness lines
    parts.push(line);
  }

  return parts.join("\n");
}

/**
 * Produce .windsurfrules from the canonical AGENTS.md.
 * Windsurf reads `.windsurfrules` as plaintext — all content inlined, no @-import.
 */
function buildWindsurfRules(agentsMd: string): NativeArtifact {
  const shared = extractSharedContent(agentsMd);

  return {
    path: ".windsurfrules",
    content: `# OCR:START\n${shared}\n# OCR:END\n`,
  };
}

export class WindsurfAdapter implements HarnessProjector {
  id = "windsurf";
  reserved = windsurfReserved;

  project(_src): NativeArtifact[] {
    const root = process.cwd();
    const agentsMdPath = join(root, "AGENTS.md");

    if (!existsSync(agentsMdPath)) {
      return []; // no canonical source → nothing to project
    }

    const agentsMd = readFileSync(agentsMdPath, "utf-8");
    return [buildWindsurfRules(agentsMd)];
  }
}
