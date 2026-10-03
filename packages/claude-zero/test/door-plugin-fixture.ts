// A MINIMAL, disposable door-plugin fixture for claude-zero tests.
//
// #143 makes product-floor resolve the door's own bundled MCP server from the
// plugin dir it mounts, so the door-level tests can no longer stand in a
// nonexistent path: a real (tiny) plugin on disk is what the resolver reads.
// This writes exactly the three files that contract requires —
// `.mcp.json`, `.claude-plugin/plugin.json`, and the `mcp/skill-summon.mjs`
// bundle STUB — into a caller-supplied temp dir. Never the real plugin, never
// the founder's ~/.claude.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The shipped shape, byte-for-byte what plugins/skill-heaven declares. */
export const SHIPPED_MCP_DECLARATION = {
  mcpServers: {
    "skill-summon": {
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
      env: { SKILL_SOURCE: "${user_config.skill_url}" },
    },
  },
};

export const SHIPPED_SKILL_URL_DEFAULT = "https://gaiaskilltree.com";

export interface DoorPluginFixtureOptions {
  /** Overrides `userConfig.skill_url.default` in the plugin manifest. */
  skillUrlDefault?: string;
  /** Writes a completely different `.mcp.json` (for rejection tests). */
  mcpJson?: unknown;
  /** Omits `.mcp.json` entirely. */
  omitMcpJson?: boolean;
  /** Omits the `mcp/skill-summon.mjs` bundle. */
  omitBundle?: boolean;
  /** Omits `userConfig.skill_url` from the plugin manifest. */
  omitSkillUrlDefault?: boolean;
}

/** Materialize the fixture under `dir` and return `dir`. */
export function writeDoorPluginFixture(dir: string, options: DoorPluginFixtureOptions = {}): string {
  mkdirSync(dir, { recursive: true });
  if (!options.omitMcpJson) {
    writeFileSync(
      join(dir, ".mcp.json"),
      `${JSON.stringify(options.mcpJson ?? SHIPPED_MCP_DECLARATION, null, 2)}\n`,
    );
  }
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(
      {
        name: "fixture-door",
        description: "minimal door plugin fixture",
        version: "0.0.0",
        ...(options.omitSkillUrlDefault
          ? {}
          : {
              userConfig: {
                skill_url: {
                  type: "string",
                  title: "Skill URL",
                  description: "one source URL",
                  default: options.skillUrlDefault ?? SHIPPED_SKILL_URL_DEFAULT,
                },
              },
            }),
      },
      null,
      2,
    )}\n`,
  );
  if (!options.omitBundle) {
    mkdirSync(join(dir, "mcp"), { recursive: true });
    // A stub, not the real bundle: the resolver only checks that the file
    // EXISTS (node is never spawned by these tests).
    writeFileSync(join(dir, "mcp", "skill-summon.mjs"), "// fixture stub — never executed by tests\n");
  }
  return dir;
}