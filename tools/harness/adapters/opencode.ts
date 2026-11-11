// -- OpenCode adapter (minimal scaffold).
// Fills in stages 3-6: MCP projection, agent bridge, commands, skills.
// For now, delegates to the MCP projector and provides reserved file awareness.

import type { HarnessProjector, NativeArtifact } from "../adapter";

const opencodeReserved = [
  "opencode.json", // hand-authored keys (permissions/policies/plugins/model/default_agent)
  ".opencode/plugins/**",
];

export class OpenCodeAdapter implements HarnessProjector {
  id = "opencode";
  reserved = opencodeReserved;

  // Minimal: delegates MCP to the shared projector.
  project(_src): NativeArtifact[] {
    return []; // will fill in stages 3-6
  }
}
