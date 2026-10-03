// Issue #143 — unit coverage for the door's MCP declaration resolver.
//
// The resolver is the whole fix: `--strict-mcp-config` suppresses plugin-declared
// MCP, so the door has to hand claude a FULLY RESOLVED one-server declaration
// (absolute bundle path + concrete source), because claude does not interpolate
// plugin placeholders in an externally supplied `--mcp-config` file — measured
// on 2.1.288, see packages/claude-zero/PROBE.md.
//
// Every case here runs against a disposable fixture plugin in a temp dir. No
// real plugin, no real ~/.claude, no network, and nothing is executed: node is
// never spawned by these tests.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSkillSourceUrl, resolveDoorMcpConfig } from "../src/mcp.js";
import { SHIPPED_SKILL_URL_DEFAULT, writeDoorPluginFixture, type DoorPluginFixtureOptions } from "./door-plugin-fixture.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ch-mcp-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a fresh fixture plugin under this test's temp root and return its dir. */
const plugin = (name = "door", options: DoorPluginFixtureOptions = {}) =>
  writeDoorPluginFixture(join(root, name), options);

describe("resolveDoorMcpConfig — the happy path", () => {
  it("resolves the shipped declaration to ONE stdio server with an absolute bundle path and a concrete source", () => {
    const dir = plugin();
    const config = resolveDoorMcpConfig({ pluginDir: dir });
    expect(Object.keys(config.mcpServers)).toEqual(["skill-summon"]);
    const server = config.mcpServers["skill-summon"];
    expect(server.type).toBe("stdio");
    expect(server.command).toBe("node");
    expect(server.args).toEqual([join(dir, "mcp", "skill-summon.mjs")]);
    expect(server.env).toEqual({ SKILL_SOURCE: SHIPPED_SKILL_URL_DEFAULT });
    // The whole point: nothing Claude would have to interpolate survives.
    expect(JSON.stringify(config)).not.toMatch(/\$\{/);
  });

  it("takes an explicit source override ahead of the plugin manifest default", () => {
    const dir = plugin();
    const override = "https://github.com/example/skills";
    expect(resolveDoorMcpConfig({ pluginDir: dir, skillSource: override }).mcpServers["skill-summon"].env)
      .toEqual({ SKILL_SOURCE: override });
    // ...and with no override, the manifest default is what is used.
    expect(resolveDoorMcpConfig({ pluginDir: dir }).mcpServers["skill-summon"].env).toEqual({
      SKILL_SOURCE: SHIPPED_SKILL_URL_DEFAULT,
    });
  });

  it("keeps a plugin path containing spaces as ONE argv element (an argv array, never a shell string)", () => {
    const dir = plugin("door with spaces");
    const server = resolveDoorMcpConfig({ pluginDir: dir }).mcpServers["skill-summon"];
    expect(server.args).toHaveLength(1);
    expect(server.args[0]).toBe(join(dir, "mcp", "skill-summon.mjs"));
    expect(server.args[0]).toContain("door with spaces");
  });

  it("reads the plugin dir but never writes to it (resolution is a read-only operation)", () => {
    const dir = plugin();
    const before = readFileSync(join(dir, ".mcp.json"), "utf-8");
    resolveDoorMcpConfig({ pluginDir: dir, skillSource: "https://skills.example/tree" });
    expect(readFileSync(join(dir, ".mcp.json"), "utf-8")).toBe(before);
  });
});

describe("resolveDoorMcpConfig — refuses rather than admitting something it should not", () => {
  const message = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("expected a throw, got none");
  };

  it("rejects a missing or non-directory plugin dir", () => {
    expect(message(() => resolveDoorMcpConfig({ pluginDir: join(root, "absent") }))).toMatch(/not a directory/);
    const file = join(root, "file.json");
    writeFileSync(file, "{}\n");
    expect(message(() => resolveDoorMcpConfig({ pluginDir: file }))).toMatch(/not a directory/);
  });

  it("rejects a relative plugin dir rather than resolving it against the cwd", () => {
    expect(message(() => resolveDoorMcpConfig({ pluginDir: "plugins/skill-heaven" }))).toMatch(/absolute/);
  });

  it("rejects a missing .mcp.json, and one with no mcpServers map", () => {
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("no-mcp", { omitMcpJson: true }) }))).toMatch(
      /cannot read the door plugin's \.mcp\.json/,
    );
    expect(
      message(() => resolveDoorMcpConfig({ pluginDir: plugin("empty-mcp", { mcpJson: { nothing: true } }) })),
    ).toMatch(/declares no mcpServers object/);
  });

  // The plugin ALSO ships a generic agent-plugins `mcp.json` (different
  // vocabulary: ${PLUGIN_ROOT}, not ${CLAUDE_PLUGIN_ROOT}). It is NOT a claude
  // config — loading it as one would hand node an unresolvable path, which is
  // exactly the failure measured on 2.1.288 (PROBE.md row 2). Refusing here is
  // what stops a future "fix" from quietly substituting the wrong manifest.
  it("refuses a plugin that ships only the generic mcp.json", () => {
    const dir = plugin("generic-only", { omitMcpJson: true });
    rmSync(join(dir, ".mcp.json"), { force: true });
    writeFileSync(
      join(dir, "mcp.json"),
      `${JSON.stringify({ mcpServers: { "skill-summon": { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/mcp/skill-summon.mjs"] } } })}\n`,
    );
    expect(message(() => resolveDoorMcpConfig({ pluginDir: dir }))).toMatch(/\.mcp\.json/);
  });

  it("rejects extra server declarations rather than admitting them by accident", () => {
    const withExtra = {
      mcpServers: {
        "skill-summon": {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
          env: { SKILL_SOURCE: "${user_config.skill_url}" },
        },
        somethingElse: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/mcp/other.mjs"] },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("two", { mcpJson: withExtra }) }))).toMatch(
      /must declare exactly one server/,
    );
    expect(
      message(() => resolveDoorMcpConfig({ pluginDir: plugin("none", { mcpJson: { mcpServers: {} } }) })),
    ).toMatch(/must declare exactly one server/);
    expect(
      message(() => resolveDoorMcpConfig({ pluginDir: plugin("renamed", { mcpJson: { mcpServers: { summon: {} } } }) })),
    ).toMatch(/must declare exactly one server/);
  });

  it("rejects an unknown argv placeholder and a foreign bundle path", () => {
    const unknown = {
      mcpServers: {
        "skill-summon": { command: "node", args: ["${PLUGIN_ROOT}/mcp/skill-summon.mjs"] },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("ph", { mcpJson: unknown }) }))).toMatch(
      /unknown placeholder/,
    );
    const foreign = {
      mcpServers: {
        "skill-summon": { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/mcp/somebody-elses.mjs"] },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("foreign", { mcpJson: foreign }) }))).toMatch(
      /must point at its own bundle/,
    );
  });

  it("rejects a non-node command and a malformed argv", () => {
    const npx = {
      mcpServers: {
        "skill-summon": {
          command: "npx",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
          env: { SKILL_SOURCE: "${user_config.skill_url}" },
        },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("npx", { mcpJson: npx }) }))).toMatch(/plain node/);
    const twoArgs = {
      mcpServers: {
        "skill-summon": {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs", "--stdio"],
          env: { SKILL_SOURCE: "${user_config.skill_url}" },
        },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("twoargs", { mcpJson: twoArgs }) }))).toMatch(
      /exactly one argv entry/,
    );
  });

  it("rejects an env block that is not exactly SKILL_SOURCE=${user_config.skill_url}", () => {
    const wrongKey = {
      mcpServers: {
        "skill-summon": {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
          env: { SOME_TOKEN: "${user_config.skill_url}" },
        },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("envkey", { mcpJson: wrongKey }) }))).toMatch(
      /may carry only SKILL_SOURCE/,
    );
    const hardcoded = {
      mcpServers: {
        "skill-summon": {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
          env: { SKILL_SOURCE: "https://elsewhere.example" },
        },
      },
    };
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("envlit", { mcpJson: hardcoded }) }))).toMatch(
      /user_config\.skill_url/,
    );
  });

  it("refuses to admit a server whose bundle is not on disk — a doorless floor is not a fallback", () => {
    expect(message(() => resolveDoorMcpConfig({ pluginDir: plugin("nobundle", { omitBundle: true }) }))).toMatch(
      /does not ship its summon server bundle/,
    );
  });

  it("refuses when the manifest carries no usable skill_url default and none is passed", () => {
    expect(
      message(() => resolveDoorMcpConfig({ pluginDir: plugin("nodefault", { omitSkillUrlDefault: true }) })),
    ).toMatch(/no userConfig\.skill_url\.default/);
    // ...and the explicit override is a real escape hatch for exactly that case.
    const config = resolveDoorMcpConfig({
      pluginDir: plugin("nodefault2", { omitSkillUrlDefault: true }),
      skillSource: "https://skills.example",
    });
    expect(config.mcpServers["skill-summon"].env).toEqual({ SKILL_SOURCE: "https://skills.example" });
  });

  it("rejects a source that is not an absolute http(s) URL", () => {
    const dir = plugin();
    for (const bad of [
      "not-a-url",
      "/local/path",
      "file:///tmp/skills",
      "ftp://skills.example",
      "https://ok.example/${x}",
    ]) {
      expect(message(() => resolveDoorMcpConfig({ pluginDir: dir, skillSource: bad })), JSON.stringify(bad)).toMatch(
        /skill source|http or https/,
      );
    }
    // A BLANK override means "unset", not "malformed": `SKILL_SOURCE=` in a
    // shell must still launch, on the manifest default.
    for (const blank of ["", "   "]) {
      expect(resolveDoorMcpConfig({ pluginDir: dir, skillSource: blank }).mcpServers["skill-summon"].env).toEqual({
        SKILL_SOURCE: SHIPPED_SKILL_URL_DEFAULT,
      });
    }
    for (const good of [
      "https://gaiaskilltree.com",
      "http://localhost:8080/tree",
      "https://github.com/example/skills",
    ]) {
      expect(resolveDoorMcpConfig({ pluginDir: dir, skillSource: good }).mcpServers["skill-summon"].env).toEqual({
        SKILL_SOURCE: good,
      });
    }
  });
});

describe("assertSkillSourceUrl", () => {
  it("is the same contract the resolver applies, exported for direct checks", () => {
    expect(assertSkillSourceUrl("https://skills.example/tree")).toBe("https://skills.example/tree");
    expect(() => assertSkillSourceUrl("https://skills.example/${user_config.skill_url}")).toThrow(/unresolved/);
    expect(() => assertSkillSourceUrl("ssh://git@example.com/x")).toThrow(/http or https/);
  });
});