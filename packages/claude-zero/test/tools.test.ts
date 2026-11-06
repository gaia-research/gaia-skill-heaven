// Issue #147 — session-scoped reduced-tool option. Flags verified on claude
// 2.1.318 (docs/evidence/tools-147/PROBE.md): --tools (built-ins only) and
// --disallowedTools (built-in and mcp__ names). --allowedTools is NOT used.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";
import { planLaunch } from "../src/launcher.js";
import { isProfileManifest, renderStatusline } from "../src/statusline.js";
import { resolveToolPolicy, toolPolicyArgv, ToolPolicyError } from "../src/tools.js";

function capture(fn: () => number): { code: number; out: string; err: string } {
  const o: string[] = [];
  const e: string[] = [];
  const so = process.stdout.write.bind(process.stdout);
  const se = process.stderr.write.bind(process.stderr);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => (o.push(s), true);
  (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => (e.push(s), true);
  try {
    return { code: fn(), out: o.join(""), err: e.join("") };
  } finally {
    process.stdout.write = so;
    process.stderr.write = se;
  }
}

let cfg: string;
let prior: string | undefined;
beforeEach(() => {
  cfg = mkdtempSync(join(tmpdir(), "cz147-cfg-"));
  prior = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = cfg;
});
afterEach(() => {
  if (prior === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = prior;
  rmSync(cfg, { recursive: true, force: true });
});

const printJson = (args: string[]) => {
  const r = capture(() => run([...args, "--print"]));
  return { ...r, json: r.code === 0 ? JSON.parse(r.out) : null };
};

describe("parseArgs — --tools / --remove-tools", () => {
  it("captures both, in space and = forms, and does not leak them to claude", () => {
    const a = parseArgs(["--tools", "minimal", "--remove-tools", "Bash", "--remove-tools=WebFetch,mcp__x__y"]);
    expect(a.tools).toBe("minimal");
    expect(a.removeTools).toEqual(["Bash", "WebFetch,mcp__x__y"]);
    expect(a.claudeArgs).toEqual([]);
    expect(parseArgs(["--tools=Read,Grep"]).tools).toBe("Read,Grep");
  });
  it("refuses a missing / option-shaped value rather than swallowing the next flag", () => {
    expect(() => parseArgs(["--tools"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--tools", "--print"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--remove-tools"])).toThrow(/needs a comma list/);
    expect(() => parseArgs(["--remove-tools", "--print"])).toThrow(/needs a comma list/);
  });
  it("exits 2 through run() on a bad value, before anything is created", () => {
    const r = capture(() => run(["--tools", "--print"]));
    expect(r.code).toBe(2);
    expect(r.err).toContain("--tools needs a value");
  });
});

describe("resolveToolPolicy", () => {
  it("is undefined when nothing was asked", () => {
    expect(resolveToolPolicy({ removeTools: [] })).toBeUndefined();
    expect(toolPolicyArgv(undefined)).toEqual([]);
  });
  it("minimal preset is a built-in allowlist only", () => {
    const p = resolveToolPolicy({ tools: "minimal", removeTools: [] })!;
    expect(toolPolicyArgv(p)).toEqual(["--tools", "Read,Grep,Glob,Skill"]);
    expect(p.summonRemoved).toBe(false);
    expect(p.warnings).toEqual([]);
  });
  it("none maps to an empty built-in set and warns that only MCP remains", () => {
    const p = resolveToolPolicy({ tools: "none", removeTools: [] })!;
    expect(toolPolicyArgv(p)).toEqual(["--tools", ""]);
    expect(p.warnings.join(" ")).toMatch(/every built-in tool is removed/);
  });
  it("splits built-in vs MCP removals onto --disallowedTools and keeps the distinction", () => {
    const p = resolveToolPolicy({ removeTools: ["Bash,WebFetch", "mcp__other__t"] })!;
    expect(p.builtinDeny).toEqual(["Bash", "WebFetch"]);
    expect(p.mcpDeny).toEqual(["mcp__other__t"]);
    expect(toolPolicyArgv(p)).toEqual(["--disallowedTools", "Bash,WebFetch,mcp__other__t"]);
    expect(p.summonRemoved).toBe(false);
  });
  it("warns when the summon MCP tool is explicitly removed (door and plugin spellings)", () => {
    for (const n of ["mcp__skill-summon__summon", "mcp__plugin_skill-heaven_skill-summon__summon"]) {
      const p = resolveToolPolicy({ tools: "minimal", removeTools: [n] })!;
      expect(p.summonRemoved).toBe(true);
      expect(p.warnings.join(" ")).toMatch(/summon MCP tool/);
    }
  });
  it("refuses MCP names in --tools (claude's --tools does not govern MCP)", () => {
    expect(() => resolveToolPolicy({ tools: "Read,mcp__a__b", removeTools: [] })).toThrow(ToolPolicyError);
  });
  it("'default' is accepted and adds no --tools flag", () => {
    const p = resolveToolPolicy({ tools: "default", removeTools: ["Bash"] })!;
    expect(toolPolicyArgv(p)).toEqual(["--disallowedTools", "Bash"]);
  });
});

describe("composed claude args via --print", () => {
  it("default launch carries no tool flags and no toolPolicy", () => {
    const { json } = printJson([]);
    expect(json.argv).not.toContain("--tools");
    expect(json.argv).not.toContain("--disallowedTools");
    expect(json.argv).not.toContain("--allowedTools");
    expect(json.toolPolicy).toBeNull();
    expect(json.manifest.toolPolicy).toBeUndefined();
  });
  it("--tools minimal keeps the strict door MCP route and adds --tools after --settings", () => {
    const { json } = printJson(["--tools", "minimal"]);
    const argv: string[] = json.argv;
    expect(argv).toContain("--strict-mcp-config");
    expect(argv[argv.indexOf("--tools") + 1]).toBe("Read,Grep,Glob,Skill");
    expect(argv.indexOf("--tools")).toBeGreaterThan(argv.indexOf("--settings"));
    // the summon MCP server is still the one admitted server
    expect(JSON.stringify(json.fsPlan)).toContain("skill-summon");
    expect(json.manifest.toolPolicy.tools).toBe("minimal");
    expect(json.toolPolicy.mcp.summonRemoved).toBe(false);
    expect(json.notes.join("\n")).toContain("BUILT-IN tools only");
  });
  it("removing summon is carried to argv, manifest and a WARNING note", () => {
    const { json } = printJson(["--remove-tools", "mcp__skill-summon__summon"]);
    expect(json.argv).toContain("--disallowedTools");
    expect(json.manifest.toolPolicy.mcp).toEqual({ removed: ["mcp__skill-summon__summon"], summonRemoved: true });
    expect(json.notes.join("\n")).toMatch(/WARNING: you removed the summon MCP tool/);
  });
  it("works at native too (flags only; native adds no eviction flags)", () => {
    const { json } = printJson(["--level", "native", "--remove-tools", "Bash"]);
    expect(json.argv).toContain("--disallowedTools");
    expect(json.argv).not.toContain("--strict-mcp-config");
    expect(json.manifest.toolPolicy.builtin.removed).toEqual(["Bash"]);
  });
  it("refuses a hand-passed claude tool flag that would fight the policy", () => {
    for (const passthrough of [["--tools", "Bash"], ["--disallowedTools", "Bash"], ["--disallowedTools=Bash"]]) {
      const r = capture(() => run(["--tools", "minimal", "--", ...passthrough]));
      expect(r.code).toBe(2);
      expect(r.err).toContain("conflicts with --tools/--remove-tools");
    }
    // without a door tool option the passthrough is untouched
    expect(JSON.parse(capture(() => run(["--print", "--", "--tools", "Read"])).out).argv).toContain("Read");
  });
  it("never writes to the Claude config dir (P3)", () => {
    writeFileSync(join(cfg, "settings.json"), "{}\n");
    printJson(["--tools", "minimal", "--remove-tools", "Bash"]);
    expect(readdirSync(cfg)).toEqual(["settings.json"]);
  });
});

describe("manifest and status disclosure", () => {
  const plan = () =>
    planLaunch({
      posture: "product-floor",
      sessionDir: "$SESSION",
      statuslineBin: "/x/statusline.mjs",
      toolPolicy: resolveToolPolicy({ tools: "minimal", removeTools: [] })!,
    });
  it("writes the policy into the manifest and the manifest still validates", () => {
    const m = plan().manifest;
    expect(m.toolPolicy).toMatchObject({ tools: "minimal", builtin: { mode: "allowlist", allow: ["Read", "Grep", "Glob", "Skill"] } });
    expect(isProfileManifest(m)).toBe(true);
    expect(isProfileManifest({ ...m, toolPolicy: { tools: 5 } })).toBe(false);
  });
  it("the statusline says tools are reduced; absent policy says nothing", () => {
    expect(renderStatusline(plan().manifest)).toContain("tools reduced (minimal)");
    const { toolPolicy: _t, ...bare } = plan().manifest;
    expect(renderStatusline(bare)).not.toContain("tools reduced");
  });
});
