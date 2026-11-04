// #123 — the Claude Code PreToolUse hook that makes the configured
// `zero_cuts = all` a real cut at the summon tool, recovered minimally from #124.
//
// Unit coverage only. The functional proof is the live session record under
// #125 (docs/evidence/hooks-123/PROBE.md): a real Claude Code install, both
// summon tool names, exit-2 refusal, unrelated tools untouched, and ambient
// user/project hooks coexisting.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DOOR_MCP_SERVER_NAME } from "skill-zero";
import { REFUSAL, SUMMON_TOOL_NAMES, decide } from "../plugins/skill-heaven/hooks/zero-cut.mjs";
import { AUTHORITY_PHRASES, zeroCuts } from "../plugins/skill-heaven/scripts/render-ladder.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "skill-heaven");
const HOOK = join(PLUGIN, "hooks", "zero-cut.mjs");
const json = (path: string) => JSON.parse(readFileSync(path, "utf-8"));

const [NAMESPACED, LAUNCHER] = SUMMON_TOOL_NAMES;
const ALL = { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "all" };

describe("summon tool names — derived from the manifests, not guessed", () => {
  it("the marketplace name is mcp__plugin_<plugin>_<server>__summon", () => {
    const plugin = json(join(PLUGIN, ".claude-plugin", "plugin.json")).name;
    const [server] = Object.keys(json(join(PLUGIN, ".mcp.json")).mcpServers);
    expect(NAMESPACED).toBe(`mcp__plugin_${plugin}_${server}__summon`);
  });

  it("the launcher name is mcp__<door server>__summon (#143 --mcp-config route)", () => {
    expect(LAUNCHER).toBe(`mcp__${DOOR_MCP_SERVER_NAME}__summon`);
  });
});

describe("decide() — the cut", () => {
  it("does nothing while the cut is temporary, unset or unrecognised", () => {
    for (const env of [{}, { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "temporary" }, { SKILL_HEAVEN_ZERO_CUTS: "nonsense" }]) {
      for (const tool_name of [...SUMMON_TOOL_NAMES, "Bash", "Read"]) {
        expect(decide({ tool_name }, env)).toEqual({ block: false, reason: "" });
      }
    }
  });

  it("blocks both summon names when the cut is all", () => {
    for (const tool_name of SUMMON_TOOL_NAMES) {
      expect(decide({ tool_name }, ALL)).toEqual({ block: true, reason: REFUSAL });
    }
  });

  it("never blocks an unrelated tool, even with the cut on", () => {
    for (const tool_name of ["Bash", "Read", "ToolSearch", "mcp__other__summon", "mcp__plugin_other_skill-summon__summon"]) {
      expect(decide({ tool_name }, ALL).block).toBe(false);
    }
  });

  it("fails closed on an unreadable payload when the cut is all", () => {
    for (const payload of [null, undefined, "x", 42, {}, { tool_name: 7 }]) {
      expect(decide(payload, ALL).block).toBe(true);
    }
  });

  it("reads the cut through the renderer's own zeroCuts, so the two cannot drift", () => {
    const envs = [
      {},
      { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "ALL " },
      { SKILL_HEAVEN_ZERO_CUTS: "all" },
      { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "temporary", SKILL_HEAVEN_ZERO_CUTS: "all" },
      { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "", SKILL_HEAVEN_ZERO_CUTS: "all" },
    ];
    for (const env of envs) {
      expect(decide({ tool_name: NAMESPACED }, env).block).toBe(zeroCuts(env) === "all");
    }
  });

  it("refuses in reference language, not authority language (#85/#91)", () => {
    const lower = REFUSAL.toLowerCase();
    for (const phrase of AUTHORITY_PHRASES) expect(lower).not.toContain(phrase);
  });
});

describe("the hook as a process — Claude Code's exit contract", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function run(payload: string, extra: Record<string, string>) {
    const home = mkdtempSync(join(tmpdir(), "zero-cut-home-"));
    const data = mkdtempSync(join(tmpdir(), "zero-cut-data-"));
    dirs.push(home, data);
    const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, CLAUDE_PLUGIN_DATA: data, ...extra };
    const result = spawnSync(process.execPath, [HOOK], { input: payload, env, encoding: "utf-8" });
    return { ...result, home, data };
  }

  it("blocks with exit 2, the reason on stderr and nothing on stdout", () => {
    for (const tool_name of SUMMON_TOOL_NAMES) {
      const r = run(JSON.stringify({ tool_name, tool_input: { query: "x" } }), ALL);
      expect(r.status).toBe(2);
      expect(r.stdout).toBe("");
      expect(r.stderr.trim()).toBe(REFUSAL);
    }
  });

  it("honours the launcher's SKILL_HEAVEN_ZERO_CUTS when no plugin option is exported", () => {
    const r = run(JSON.stringify({ tool_name: LAUNCHER }), { SKILL_HEAVEN_ZERO_CUTS: "all" });
    expect(r.status).toBe(2);
  });

  it("exits 0 silently — no allow decision — when the cut is inactive or the tool is unrelated", () => {
    for (const [payload, env] of [
      [JSON.stringify({ tool_name: NAMESPACED }), {}],
      [JSON.stringify({ tool_name: "Bash" }), ALL],
      ["not json", {}],
    ] as const) {
      const r = run(payload, env);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toBe("");
    }
  });

  it("writes nothing — not to HOME, not even to CLAUDE_PLUGIN_DATA (P3)", () => {
    const r = run(JSON.stringify({ tool_name: NAMESPACED }), ALL);
    expect(r.status).toBe(2);
    expect(readdirSync(r.home)).toEqual([]);
    expect(readdirSync(r.data)).toEqual([]);
  });
});

describe("manifest wiring", () => {
  const pluginJson = json(join(PLUGIN, ".claude-plugin", "plugin.json"));
  const hooks = json(join(PLUGIN, "hooks", "claude-code.json"));

  it("the Claude manifest points at the hook file, and only the Claude manifest does", () => {
    expect(pluginJson.hooks).toBe("./hooks/claude-code.json");
    expect(json(join(PLUGIN, "plugin.json")).hooks).toBeUndefined();
    expect(json(join(PLUGIN, ".codex-plugin", "plugin.json")).hooks).toBeUndefined();
    // Not the conventional hooks/hooks.json, so no client picks it up by default path.
    expect(existsSync(join(PLUGIN, "hooks", "hooks.json"))).toBe(false);
  });

  it("registers exactly one event — PreToolUse — and no context-injecting hook", () => {
    expect(Object.keys(hooks.hooks)).toEqual(["PreToolUse"]);
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
  });

  it("dispatches on exactly the two summon names, and runs the bundled hook on plain node", () => {
    const [entry] = hooks.hooks.PreToolUse;
    expect(entry.matcher.split("|").sort()).toEqual([...SUMMON_TOOL_NAMES].sort());
    expect(entry.hooks).toEqual([
      { type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/zero-cut.mjs"', timeout: 10 },
    ]);
  });

  it("takes no user_config substitution into the shell command", () => {
    expect(JSON.stringify(hooks)).not.toContain("user_config");
  });

  it("the hook source has no filesystem write path", () => {
    const source = readFileSync(HOOK, "utf-8");
    for (const api of ["writeFile", "appendFile", "mkdir", "rmSync", "createWriteStream", "renameSync"]) {
      expect(source).not.toContain(api);
    }
  });
});
