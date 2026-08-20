import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "skill-heaven");
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const SURFACES = ["summon", "skill-zero", "skill-heaven", "skill-hell", "skill-ultra"] as const;

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Agent Plugins 1.0.0 package", () => {
  const manifest = json(join(PLUGIN, "plugin.json"));
  const mcp = json(join(PLUGIN, "mcp.json"));

  it("ships the closed portable manifest at the plugin root", () => {
    expect(manifest.$schema).toBe(PLUGIN_SCHEMA);
    expect(manifest.name).toBe("skill-heaven");
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "$schema",
        "author",
        "description",
        "extensions",
        "homepage",
        "keywords",
        "license",
        "name",
        "repository",
        "version",
      ].sort(),
    );
    expect(manifest).not.toHaveProperty("displayName");
    expect(manifest).not.toHaveProperty("userConfig");
  });

  it("ships the portable MCP declaration with matching schema version", () => {
    expect(mcp.$schema).toBe(MCP_SCHEMA);
    expect(Object.keys(mcp).sort()).toEqual(["$schema", "mcpServers"].sort());
    const servers = mcp.mcpServers as Record<string, Record<string, unknown>>;
    expect(Object.keys(servers)).toEqual(["skill-summon"]);
    expect(servers["skill-summon"]).toMatchObject({
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/mcp/skill-summon.mjs"],
    });
    expect(existsSync(join(PLUGIN, "mcp", "skill-summon.mjs"))).toBe(true);
  });

  it.each(SURFACES)("discovers the immediate portable skill %s", (surface) => {
    const path = join(PLUGIN, "skills", surface, "SKILL.md");
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toMatch(new RegExp(`^---\\nname: ${surface}\\n`));
    expect(source).toMatch(/\ndescription: .+\n---\n/);
  });

  it("keeps Codex compatibility thin and rooted in the same bundled server", () => {
    const codexManifest = json(join(PLUGIN, ".codex-plugin", "plugin.json"));
    expect(codexManifest.name).toBe("skill-heaven");
    expect(codexManifest.skills).toBe("./skills/");
    expect(codexManifest.mcpServers).toBe("./.codex.mcp.json");

    const codexMcp = json(join(PLUGIN, ".codex.mcp.json"));
    const servers = codexMcp.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers["skill-summon"]).toMatchObject({
      command: "node",
      args: ["./mcp/skill-summon.mjs"],
      cwd: ".",
    });
  });

  it("keeps Pi compatibility namespaced and pointed at the portable components", () => {
    const extensions = manifest.extensions as Record<string, Record<string, unknown>>;
    expect(extensions["dev.skill-heaven.pi"]).toEqual({
      packageManifest: "./package.json",
      extension: "./dev.skill-heaven.pi/skill-heaven.ts",
      minimumClientVersion: "0.84.2",
    });

    const packageJson = json(join(PLUGIN, "package.json"));
    const pi = packageJson.pi as Record<string, string[]>;
    expect(pi.extensions).toEqual(["./dev.skill-heaven.pi/skill-heaven.ts"]);
    expect(pi.skills).toEqual(["./skills"]);

    const adapter = readFileSync(join(PLUGIN, "dev.skill-heaven.pi", "skill-heaven.ts"), "utf8");
    expect(adapter).toContain('name: "summon"');
    expect(adapter).toContain('join(PLUGIN_ROOT, "mcp.json")');
    for (const surface of SURFACES) expect(adapter).toContain(`["${surface}", "${surface}"`);
  });
});
