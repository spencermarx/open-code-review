// -- Claude adapter (minimal scaffold).
// Fills in stages 3-6: MCP projection, agent bridge, commands, skills.
// For now, delegates to the MCP projector and provides reserved file awareness.

import type { HarnessProjector, NativeArtifact } from "../adapter";
import { McpProjector } from "../mcp";
import { defaultRenderer } from "../renderer";

const claudeReserved = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/helpers/**",
  ".claude-plugin/**",
];

export class ClaudeAdapter implements HarnessProjector {
  id = "claude";
  reserved = claudeReserved;

  // Minimal: delegates MCP to the shared projector.
  project(_src): NativeArtifact[] {
    return []; // will fill in stages 3-6
  }
}
