import { describe, expect, it } from "vitest";
import { compile, DEFAULT_CLAUDE_MECHANISM } from "../src/compile.js";
import { parseArgs } from "../src/cli.js";
import { assembleRecord } from "../src/record.js";
import { validateRecord } from "../src/vendor/ledger-record.js";
import type { ResolvedSkill } from "../src/skills.js";

const fakeSkill: ResolvedSkill = {
  id: "impeccable",
  dir: "/skills/impeccable",
  skillMdPath: "/skills/impeccable/SKILL.md",
  listingLine: "- impeccable: polish UI",
  standingTokens: 6,
  invocationTokens: 100,
  contentSha256: "a".repeat(64),
};

describe("claude mappings", () => {
  it("floor = suppression + zero-server, empty fsPlan", () => {
    const r = compile({ posture: "floor", harness: "claude", skills: [] });
    expect(r.argv).toEqual([
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
    ]);
    expect(r.fsPlan).toEqual([]);
    expect(r.env).toEqual({});
    expect(r.execSupport).toBe("exec");
  });

  it("native = literally nothing (P3)", () => {
    const r = compile({ posture: "native", harness: "claude", skills: [] });
    expect(r.argv).toEqual([]);
    expect(r.env).toEqual({});
    expect(r.fsPlan).toEqual([]);
  });

  it("curated plugin-dir = setting-sources eviction + --plugin-dir + manifest + skill copies (T6 negative, T8)", () => {
    const r = compile({ posture: "curated", harness: "claude", mechanism: "plugin-dir", skills: [fakeSkill] });
    // T6 (2.1.215): --disable-slash-commands eats plugin skills — must NOT be present
    expect(r.argv).not.toContain("--disable-slash-commands");
    expect(r.argv.join(" ")).toContain("--setting-sources project");
    expect(r.argv).toContain("--strict-mcp-config");
    expect(r.argv).toContain("--plugin-dir");
    expect(r.argv).toContain("$SESSION/heaven-set");
    expect(r.fsPlan[0]).toMatchObject({ kind: "write", path: "$SESSION/heaven-set/.claude-plugin/plugin.json" });
    expect(r.fsPlan[1]).toMatchObject({ kind: "copyDir", to: "$SESSION/heaven-set/skills/impeccable" });
  });

  it("curated config-dir = env scoping, NO suppression flag, credential copy", () => {
    const r = compile({ posture: "curated", harness: "claude", mechanism: "config-dir", skills: [fakeSkill] });
    expect(r.argv).not.toContain("--disable-slash-commands");
    expect(r.env.CLAUDE_CONFIG_DIR).toBe("$SESSION/config");
    expect(r.fsPlan.some((op) => op.kind === "copyFileIfExists")).toBe(true);
  });

  it("default mechanism is frozen by the T6 spike", () => {
    const r = compile({ posture: "curated", harness: "claude", skills: [fakeSkill] });
    const usesPluginDir = r.argv.includes("--plugin-dir");
    expect(usesPluginDir).toBe(DEFAULT_CLAUDE_MECHANISM === "plugin-dir");
  });

  it("headless tail: -p, model, effort, json", () => {
    const r = compile({ posture: "floor", harness: "claude", skills: [], prompt: "Q", model: "haiku", effort: "low", jsonOutput: true });
    expect(r.argv.join(" ")).toContain("--model haiku");
    expect(r.argv.join(" ")).toContain("--effort low");
    expect(r.argv.join(" ")).toContain("-p Q --output-format json");
  });
});

describe("pi mappings", () => {
  it("floor = --no-skills, with -p BEFORE it (pi 0.80.10 ordering quirk)", () => {
    expect(compile({ posture: "floor", harness: "pi", skills: [] }).argv).toEqual(["--no-skills"]);
    const headless = compile({ posture: "floor", harness: "pi", skills: [], prompt: "Q" });
    expect(headless.argv).toEqual(["-p", "Q", "--no-skills"]);
  });
  it("curated = --no-skills + --skill per dir after tail args", () => {
    const r = compile({ posture: "curated", harness: "pi", skills: [fakeSkill] });
    expect(r.argv).toEqual(["--no-skills", "--skill", "/skills/impeccable"]);
    expect(r.execSupport).toBe("exec");
  });
  it("native = nothing", () => {
    expect(compile({ posture: "native", harness: "pi", skills: [] }).argv).toEqual([]);
  });
});

describe("recipe harnesses", () => {
  it("codex compiles a recipe with CODEX_HOME scoping", () => {
    const r = compile({ posture: "floor", harness: "codex", skills: [] });
    expect(r.execSupport).toBe("recipe");
    expect(r.env.CODEX_HOME).toBe("$SESSION/codex");
  });
  it("cursor compiles a recipe with CURSOR_CONFIG_DIR", () => {
    const r = compile({ posture: "floor", harness: "cursor", skills: [] });
    expect(r.execSupport).toBe("recipe");
    expect(r.env.CURSOR_CONFIG_DIR).toBe("$SESSION/cursor-config");
  });
  it("grok refuses floor/curated (no verified mechanism) but allows native", () => {
    expect(() => compile({ posture: "floor", harness: "grok", skills: [] })).toThrow(/grok/);
    expect(compile({ posture: "native", harness: "grok", skills: [] }).execSupport).toBe("recipe");
  });
});

describe("posture/skill validation", () => {
  it("curated without skills errors", () => {
    expect(() => compile({ posture: "curated", harness: "claude", skills: [] })).toThrow(/--skill/);
  });
  it("skills outside curated error", () => {
    expect(() => compile({ posture: "floor", harness: "claude", skills: [fakeSkill] })).toThrow(/curated/);
  });
});

describe("cli level lane", () => {
  it("defaults to floor", () => {
    expect(parseArgs([]).posture).toBe("floor");
  });
  it("--level off → floor, --level low → curated", () => {
    expect(parseArgs(["--level", "off"]).posture).toBe("floor");
    expect(parseArgs(["--level", "low"]).posture).toBe("curated");
  });
  it("hell levels hard-error (P2)", () => {
    for (const l of ["med", "high", "xhigh", "max"]) {
      expect(() => parseArgs(["--level", l])).toThrow(/hell lane .*gated/i);
    }
  });
  it("contradiction between --posture and --level errors", () => {
    expect(() => parseArgs(["--posture", "native", "--level", "off"])).toThrow(/contradicts/);
    expect(parseArgs(["--posture", "floor", "--level", "off"]).posture).toBe("floor");
  });
  it("--record demands headless + ids", () => {
    expect(() => parseArgs(["--record"])).toThrow(/headless/);
    expect(() => parseArgs(["--record", "-p", "Q"])).toThrow(/--benchmark-id/);
    const ok = parseArgs(["--record", "-p", "Q", "--benchmark-id", "b", "--task", "t"]);
    expect(ok.record).toMatchObject({ benchmarkId: "b", task: "t", arm: "heaven", repeatIndex: 0 });
  });
  it("--arm rejects hell/ultra", () => {
    expect(() => parseArgs(["--arm", "hell"])).toThrow(/gated/);
  });
});

describe("record assembly discipline", () => {
  const base = {
    model: "haiku",
    harness: { name: "claude", version: "2.1.215 (Claude Code)" },
    wallClockMs: 1234,
    recordedAt: "2026-07-19T12:00:00.000Z",
    resultText: "NONE",
    usage: { input_tokens: 4, output_tokens: 5, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 },
  };

  it("floor placebo: zeros by construction, system null, perTurn summed", () => {
    const r = assembleRecord({
      ...base,
      opts: { benchmarkId: "hh-m2-smoke", task: "listing-probe", arm: "placebo", repeatIndex: 0, endpointRegex: "^NONE$" },
      posture: "floor",
      skills: [],
    });
    validateRecord(r);
    expect(r.tokens).toEqual({ system: null, skillStanding: 0, skillInvocation: 0, perTurn: 119 });
    expect(r.objectiveEndpoint.pass).toBe(true);
    expect(r.skillsLoaded).toEqual([]);
  });

  it("curated heaven: standing summed, invocation null with note", () => {
    const r = assembleRecord({
      ...base,
      opts: { benchmarkId: "b", task: "t", arm: "heaven", repeatIndex: 1 },
      posture: "curated",
      skills: [fakeSkill],
    });
    validateRecord(r);
    expect(r.tokens.skillStanding).toBe(6);
    expect(r.tokens.skillInvocation).toBeNull();
    expect(r.tokens.system).toBeNull();
    expect(r.notes).toMatch(/stream-json/);
    expect(r.objectiveEndpoint).toEqual({ kind: "unscored", pass: null });
  });

  it("placebo arm outside floor is rejected (B2)", () => {
    expect(() =>
      assembleRecord({
        ...base,
        opts: { benchmarkId: "b", task: "t", arm: "placebo", repeatIndex: 0 },
        posture: "curated",
        skills: [fakeSkill],
      }),
    ).toThrow(/placebo/);
  });

  it("missing usage → perTurn null (unmeasured, never 0)", () => {
    const r = assembleRecord({
      ...base,
      usage: undefined,
      opts: { benchmarkId: "b", task: "t", arm: "heaven", repeatIndex: 0 },
      posture: "curated",
      skills: [fakeSkill],
    });
    expect(r.tokens.perTurn).toBeNull();
  });
});
