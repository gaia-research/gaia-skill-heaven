// PR4: the summon MCP server is bundled INTO the plugin
// (plugins/skill-heaven/mcp/skill-summon.mjs, committed to git) so an
// installed user needs no npx, no sibling gaia-skill-heaven checkout, and no
// external binary. This is the unit-level coverage: cheap, static checks on
// the shape of .mcp.json, plugin.json's userConfig, and the committed bundle
// itself. scripts/verify-marketplace-install.mjs (test/verify-marketplace-install.test.ts)
// carries the heavier functional proof — actually booting the bundle over
// stdio on plain node with no node_modules reachable.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_GENERIC_REGISTRY_URL, DEFAULT_NAMED_REGISTRY_URL } from "skill-summon";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "skill-heaven");

describe(".mcp.json — the summon MCP server declaration", () => {
  const mcpConfig = JSON.parse(readFileSync(join(PLUGIN, ".mcp.json"), "utf-8"));

  it("declares exactly one server, skill-summon", () => {
    expect(Object.keys(mcpConfig.mcpServers)).toEqual(["skill-summon"]);
  });

  it("runs on plain node — no npx, no external binary", () => {
    expect(mcpConfig.mcpServers["skill-summon"].command).toBe("node");
  });

  it("points at the bundle committed inside the plugin, via ${CLAUDE_PLUGIN_ROOT}", () => {
    expect(mcpConfig.mcpServers["skill-summon"].args).toEqual([
      "${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs",
    ]);
  });

  it("wires TREE_URL / TREE_NAMED_URL to userConfig — the real env vars source.ts reads", () => {
    // packages/skill-summon/src/data/source.ts reads process.env.TREE_URL and
    // process.env.TREE_NAMED_URL (HttpGaiaRegistrySource construction in
    // src/bin/skill-summon-mcp.ts) — these must be the exact names, or the
    // configured tree_url/tree_named_url userConfig silently does nothing.
    expect(mcpConfig.mcpServers["skill-summon"].env).toEqual({
      TREE_URL: "${user_config.tree_url}",
      TREE_NAMED_URL: "${user_config.tree_named_url}",
    });
  });
});

describe("plugin.json — userConfig", () => {
  const pluginJson = JSON.parse(
    readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf-8"),
  );

  it("declares exactly tree_url, tree_named_url, zero_cuts", () => {
    expect(Object.keys(pluginJson.userConfig).sort()).toEqual(
      ["tree_named_url", "tree_url", "zero_cuts"].sort(),
    );
  });

  // Claude Code's userConfig schema (docs.claude.com/en/docs/claude-code/plugins-reference)
  // supports only type: string | number | boolean | directory | file — there
  // is no enum type. Every option here must be type "string" with `type`,
  // `title`, and `description` all present (title/description are required).
  for (const key of ["tree_url", "tree_named_url", "zero_cuts"]) {
    it(`${key} is a well-formed string option (type, title, description all present)`, () => {
      const option = pluginJson.userConfig[key];
      expect(option.type).toBe("string");
      expect(typeof option.title).toBe("string");
      expect(option.title.length).toBeGreaterThan(0);
      expect(typeof option.description).toBe("string");
      expect(option.description.length).toBeGreaterThan(0);
    });
  }

  it("tree_url defaults to the same URL source.ts hardcodes as DEFAULT_GENERIC_REGISTRY_URL", () => {
    expect(pluginJson.userConfig.tree_url.default).toBe(DEFAULT_GENERIC_REGISTRY_URL);
  });

  it("tree_named_url defaults to the same URL source.ts hardcodes as DEFAULT_NAMED_REGISTRY_URL", () => {
    expect(pluginJson.userConfig.tree_named_url.default).toBe(DEFAULT_NAMED_REGISTRY_URL);
  });

  it('zero_cuts defaults to "automatic" — N13\'s product floor (cut automatic summoning only)', () => {
    expect(pluginJson.userConfig.zero_cuts.default).toBe("automatic");
  });
});

describe("plugins/skill-heaven/mcp/skill-summon.mjs — the committed bundle", () => {
  const bundlePath = join(PLUGIN, "mcp", "skill-summon.mjs");
  const bundle = existsSync(bundlePath) ? readFileSync(bundlePath, "utf-8") : "";

  it("exists and is non-trivial (esbuild actually bundled something in)", () => {
    expect(existsSync(bundlePath)).toBe(true);
    expect(bundle.length).toBeGreaterThan(100_000); // @modelcontextprotocol/sdk + zod inlined
  });

  it("carries the generated-file header naming its source and rebuild command", () => {
    expect(bundle).toContain("packages/skill-summon/src/bin/skill-summon-mcp.ts");
    expect(bundle).toContain("npm run build:mcp");
  });

  it("has no live require( of a bare package name — zero runtime deps by construction", () => {
    // Strip string/template literal CONTENTS first. @modelcontextprotocol/sdk
    // pulls in ajv, whose runtime code-generator embeds strings like
    // `require("ajv/dist/runtime/uri").default` as inert source-code text (it
    // builds validator functions via `new Function`, not real requires) — a
    // naive scan over the raw bundle text flags those as false positives.
    // Stripping quoted/backtick literal contents before scanning removes them
    // without needing a real JS parser.
    const stripped = bundle
      .replace(/`(?:[^`\\]|\\.)*`/g, "``")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");
    const bareRequire = /\brequire\(\s*["'][a-zA-Z@][^"']*["']/;
    const match = stripped.match(bareRequire);
    expect(match, `found what looks like a live require() of a bare package: ${match?.[0]}`).toBeNull();
  });

  it("has no relative import reaching outside the bundle (e.g. back into packages/)", () => {
    // A path traversal like `../../../packages/skill-summon/...` surviving
    // into the output would mean esbuild left something unbundled instead of
    // inlining it — this is the same "no runtime deps by construction" claim
    // from a different angle.
    expect(bundle).not.toMatch(/from\s+["']\.\.\/\.\.\//);
  });
});
