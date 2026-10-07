// Static checks for the Claude Code console mod (plugins/skill-heaven-console).
//
// The mod's behaviour is tested by the engine itself —
// `claude plugin test plugins/skill-heaven-console` — because it needs the
// engine's `claude-code/testing` kit. These checks hold what the repository can
// hold without Claude Code: the manifests, the marketplace listing, the module's
// import discipline, "observe only", copy rules, and that the committed model
// bundle is the one `scripts/build-status.mjs` builds.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const MOD = join(ROOT, "plugins", "skill-heaven-console");
const HOOKS = join(MOD, "hooks");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as any;
const text = (path: string) => readFileSync(path, "utf8");

/** The mod's own source files — not the generated bundle, not tests. */
const SOURCES = readdirSync(HOOKS)
  .filter((f) => /\.(tsx?|mjs)$/.test(f) && !f.endsWith(".d.mts") && f !== "status-model.mjs" && !f.includes(".test."))
  .map((f) => join(HOOKS, f));

describe("manifest", () => {
  const manifest = json(join(MOD, ".claude-plugin", "plugin.json"));

  test("names the plugin, its version, licence and homes", () => {
    expect(manifest.name).toBe("skill-heaven-console");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.license).toBe("MIT");
    expect(manifest.repository).toBe("https://github.com/gaia-research/gaia-skill-heaven");
    expect(manifest.homepage).toBe("https://gaia-research.github.io/gaia-skill-heaven/");
  });

  test("says it is an optional preview that observes and never changes summons", () => {
    expect(manifest.description).toMatch(/optional/i);
    expect(manifest.description).toMatch(/preview/i);
    expect(manifest.description).toMatch(/never changes/i);
  });

  test("declares its state contract and the status option (off | compact | full, default compact)", () => {
    expect(manifest.types).toBe("./types/index.d.ts");
    expect(manifest.userConfig.status.options).toEqual(["off", "compact", "full"]);
    expect(manifest.userConfig.status.default).toBe("compact");
  });

  test("the Trust section's version constants match the manifests", () => {
    const meta = text(join(HOOKS, "meta.ts"));
    expect(meta).toContain(`CONSOLE_VERSION = '${manifest.version}'`);
    const heaven = json(join(ROOT, "plugins", "skill-heaven", ".claude-plugin", "plugin.json"));
    expect(meta).toContain(`SKILL_HEAVEN_VERSION = '${heaven.version}'`);
  });
});

describe("marketplace", () => {
  const marketplace = json(join(ROOT, ".claude-plugin", "marketplace.json"));

  test("lists skill-heaven first and the console second", () => {
    expect(marketplace.plugins.map((p: { name: string }) => p.name)).toEqual(["skill-heaven", "skill-heaven-console"]);
    expect(marketplace.plugins[0].source).toBe("./plugins/skill-heaven");
    expect(marketplace.plugins[1].source).toBe("./plugins/skill-heaven-console");
  });

  test("describes the console as a preview", () => {
    expect(marketplace.plugins[1].description.startsWith("Preview —")).toBe(true);
  });
});

describe("hooks module", () => {
  test("hooks.json names exactly one module, and it exists", () => {
    const hooks = json(join(HOOKS, "hooks.json"));
    expect(hooks).toEqual({ modules: ["./register.tsx"] });
    expect(text(join(HOOKS, "register.tsx"))).toContain("export const register");
  });

  test("imports only plugin files and 'claude-code', all with static import declarations", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const file of SOURCES) {
      const source = text(file);
      expect(source, file).not.toMatch(/\bimport\s*\(/);
      expect(source, file).not.toMatch(/\brequire\s*\(/);
      for (const match of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gms)) {
        const spec = match[1]!;
        expect(spec === "claude-code" || spec.startsWith("./") || spec.startsWith("../"), `${file} imports ${spec}`).toBe(true);
        if (spec.startsWith(".")) expect(spec, `${file} imports ${spec}`).toMatch(/\.(tsx?|mjs)$|^\.\.\/types$/);
      }
    }
  });

  test("is observe-only: no tool.call hook refuses or rewrites a call", () => {
    for (const file of SOURCES) {
      const source = text(file);
      expect(source, file).not.toMatch(/\bdeny\s*:|\{\s*deny\b/);
      expect(source, file).not.toMatch(/\bnext\(\s*\{/);
    }
    const register = text(join(HOOKS, "register.tsx"));
    // every tool.call hook ends by returning what `next` returned
    const toolHooks = register.split("on('tool.call'").slice(1);
    expect(toolHooks).toHaveLength(3);
    for (const hook of toolHooks) {
      const body = hook.slice(0, hook.indexOf(".catch("));
      expect(body).toMatch(/\br = await next\(e\)/);
      expect(body).toMatch(/return r\n\s*}\)$/);
    }
  });

  test("the summon tool is matched by the same anchored pattern everywhere", () => {
    const model = text(join(HOOKS, "model.ts"));
    const register = text(join(HOOKS, "register.tsx"));
    const wanted = "^mcp__(?:plugin_skill-heaven_)?skill-summon__summon$";
    expect(model).toContain(`SUMMON_TOOL = /${wanted}/`);
    expect(register).toContain(`{ tool: /${wanted}/ }`);
    const re = new RegExp(wanted);
    expect(re.test("mcp__plugin_skill-heaven_skill-summon__summon")).toBe(true);
    expect(re.test("mcp__skill-summon__summon")).toBe(true);
    expect(re.test("mcp__evil-skill-summon__summon")).toBe(false);
    expect(re.test("mcp__skill-summon__summon__x")).toBe(false);
  });

  test("a button never wipes a draft", () => {
    expect(text(join(HOOKS, "register.tsx"))).not.toMatch(/mode:\s*'replace'/);
  });

  test("writes nothing: no filesystem, process, network, store or settings calls", () => {
    for (const file of SOURCES) {
      expect(text(file), file).not.toMatch(/\$\.(fs|process|http|store|settings|env)\b/);
    }
  });

  test("never presents the deferred host, npm routes or banned words", () => {
    for (const file of [...SOURCES, join(MOD, "README.md")]) {
      const source = text(file);
      expect(source, file).not.toContain("skill-heaven.dev");
      expect(source, file).not.toMatch(/\bnpx\b|npm install/);
      expect(source, file).not.toMatch(/\b(slots?|budget|slider|auto-summon|autonomous|armed|trust score)\b/i);
    }
  });

  test("never draws the Arbor green or a fixture", () => {
    for (const file of SOURCES) {
      const source = text(file);
      expect(source, file).not.toMatch(/#55c878/i);
      expect(source, file).not.toMatch(/\.arbor\b.*hex|ROLE_COLORS\.arbor/);
      expect(source, file).not.toMatch(/fixtures?(\.js|\.ts)?['"]|STATUS_FIXTURES|EVENT_FIXTURES/);
    }
  });

  test("the state contract is self-contained", () => {
    const contract = text(join(MOD, "types", "index.d.ts"));
    expect(contract).not.toMatch(/^\s*(import|export\s.*from|\/\/\/\s*<reference)/m);
  });
});

describe("generated model bundle", () => {
  const scratch = mkdtempSync(join(tmpdir(), "console-bundle-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test("is exactly what scripts/build-status.mjs builds from packages/status", () => {
    // Build into a scratch copy so this check never rewrites the committed file.
    cpSync(join(ROOT, "scripts", "build-status.mjs"), join(scratch, "scripts", "build-status.mjs"));
    cpSync(join(ROOT, "packages", "status", "src"), join(scratch, "packages", "status", "src"), { recursive: true });
    symlinkSync(join(ROOT, "node_modules"), join(scratch, "node_modules"), "dir");
    execFileSync(process.execPath, [join(scratch, "scripts", "build-status.mjs")], { cwd: scratch, stdio: "pipe" });
    const fresh = text(join(scratch, "plugins", "skill-heaven-console", "hooks", "status-model.mjs"));
    expect(text(join(HOOKS, "status-model.mjs"))).toBe(fresh);
  });

  test("carries its generated header, no Node imports and no fixtures", () => {
    const bundle = text(join(HOOKS, "status-model.mjs"));
    expect(bundle.startsWith("// GENERATED by scripts/build-status.mjs")).toBe(true);
    expect(bundle).not.toMatch(/from\s+["']node:|require\(/);
    expect(bundle).not.toMatch(/STATUS_FIXTURES|EVENT_FIXTURES/);
  });
});
