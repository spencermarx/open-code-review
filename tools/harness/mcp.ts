// -- MCP surface projector: reads mcp-servers.json (canonical) and produces
//    both .mcp.json (Claude native) and the opencode.json mcp.servers block.
//
// Mapping:
//   Claude  → .mcp.json       { mcpServers: { name: { command, args, env }, … } }
//   OpenCode → opencode.json → mcp.servers   { servers: { name: { type, command, environment, disabled }, … } }

import type { NativeArtifact, HarnessProjector } from "./adapter";
import { writeGenerated, BANNER } from "./adapter";

export class McpProjector implements HarnessProjector {
  id = "mcp";
  reserved = [".mcp.json"]; // the existing Claude file — never clobbered

  /** Build both .mcp.json and opencode.json mcp block from canonical source. */
  project(servers: Record<string, unknown>): NativeArtifact[] {
    const entries = Object.entries(servers);
    if (entries.length === 0) return [];

    // --- Claude: .mcp.json ---
    const claudeServers: Record<string, unknown> = {};
    for (const [name, cfg] of entries) {
      const c = cfg as Record<string, unknown>;
      claudeServers[name] = {
        command: String(c.command ?? "npx"),
        args: Array.isArray(c.args) ? (c.args as string[]) : [],
        env: typeof c.env === "object" && c.env !== null
          ? (c.env as Record<string, string>)
          : {},
        autoStart: c.autoStart === true, // preserve as-is
      };
    }
    const mcpJsonContent = JSON.stringify(
      { mcpServers: claudeServers },
      null,
      2,
    );

    // --- OpenCode: opencode.json → mcp.servers ---
    //   args → appended to command[]; env → environment; autoStart:false → disabled:true;
    const opencodeServers: Record<string, unknown> = {};
    for (const [name, cfg] of entries) {
      const c = cfg as Record<string, unknown>;
      const args = Array.isArray(c.args) ? (c.args as string[]) : [];
      const command = c.command
        ? [String(c.command), ...args]
        : [...args];
      opencodeServers[name] = {
        type: "remote" as const,
        command,
        environment: typeof c.env === "object" && c.env !== null
          ? (c.env as Record<string, string>)
          : {},
        disabled: c.autoStart !== true, // autoStart false → disabled true
      };
    }
    const opencodeMcpContent = JSON.stringify(
      { mcp: { servers: opencodeServers } },
      null,
      2,
    );

    return [
      {
        path: ".mcp.json",
        content: BANNER + mcpJsonContent,
      },
      {
        path: ".opencode-mcp.json",
        content: BANNER + opencodeMcpContent,
      },
    ];
  }
}
