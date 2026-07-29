import { describe, expect, it } from "vitest";
import { compile, floorOf, DEFAULT_CLAUDE_MECHANISM, FLOOR_EVIDENCE, POSTURES } from "../src/compile.js";
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
  it("floor = suppression + zero-server + project setting-sources + bundled-skills knob, empty fsPlan (T9b)", () => {
    const r = compile({ posture: "floor", harness: "claude", skills: [] });
    expect(r.argv).toEqual([
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--setting-sources",
      "project",
    ]);
    expect(r.fsPlan).toEqual([]);
    expect(r.env).toEqual({ CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1" });
    expect(r.execSupport).toBe("exec");
  });

  it("native = literally nothing (P3)", () => {
    const r = compile({ posture: "native", harness: "claude", skills: [] });
    expect(r.argv).toEqual([]);
    expect(r.env).toEqual({});
    expect(r.fsPlan).toEqual([]);
  });

  it("curated plugin-dir = setting-sources eviction + --plugin-dir + bundled-skills knob + manifest + skill copies (T6 negative, T9)", () => {
    const r = compile({ posture: "curated", harness: "claude", mechanism: "plugin-dir", skills: [fakeSkill] });
    // T6 (2.1.215): --disable-slash-commands eats plugin skills — must NOT be present
    expect(r.argv).not.toContain("--disable-slash-commands");
    expect(r.argv.join(" ")).toContain("--setting-sources project");
    expect(r.argv).toContain("--strict-mcp-config");
    expect(r.argv).toContain("--plugin-dir");
    expect(r.argv).toContain("$SESSION/heaven-set");
    expect(r.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
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

// Founder ruling V5-5: the benchmark floor stays completely doorless (it is the
// placebo-of-record, B2); a separate doorful product floor ships. The two are
// measured and named separately and priced as separate arms (B1) — never
// averaged into one number.
describe("the floor split (V5-5)", () => {
  it("the benchmark floor is byte-frozen at T9b and stays doorless (F6)", () => {
    const r = compile({ posture: "floor", harness: "claude", skills: [] });
    // F6: this flag is what suppresses plugin COMMANDS, so /skill-heaven does
    // not exist here. That is the ruling, not a bug — do not remove it.
    expect(r.argv).toContain("--disable-slash-commands");
    expect(r.argv).not.toContain("--plugin-dir");
    expect(floorOf("floor")).toBe("benchmark");
  });

  it("the product floor is T9b minus --disable-slash-commands (F7) — that one flag is the door", () => {
    const bench = compile({ posture: "floor", harness: "claude", skills: [] });
    const product = compile({ posture: "product-floor", harness: "claude", skills: [] });
    expect(product.argv).not.toContain("--disable-slash-commands");
    expect(product.argv).toEqual(bench.argv.filter((a) => a !== "--disable-slash-commands"));
    expect(product.env).toEqual({ CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1" });
    expect(product.execSupport).toBe("exec");
    expect(floorOf("product-floor")).toBe("product");
  });

  it("the two floors are distinct postures — neither aliases the other", () => {
    expect(POSTURES).toContain("floor");
    expect(POSTURES).toContain("product-floor");
    const bench = compile({ posture: "floor", harness: "claude", skills: [] });
    const product = compile({ posture: "product-floor", harness: "claude", skills: [] });
    expect(product.argv).not.toEqual(bench.argv);
    expect(product.notes.join(" ")).toMatch(/never average/i);
    expect(bench.notes.join(" ")).toMatch(/placebo-of-record/);
  });

  it("mounts a caller-supplied door plugin dir, and only on the product floor", () => {
    const r = compile({ posture: "product-floor", harness: "claude", skills: [], doorPluginDir: "/opt/door" });
    expect(r.argv.slice(-2)).toEqual(["--plugin-dir", "/opt/door"]);
    for (const p of ["floor", "native"] as const) {
      expect(() => compile({ posture: p, harness: "claude", skills: [], doorPluginDir: "/opt/door" })).toThrow(
        /only valid with --posture product-floor/,
      );
    }
    expect(() =>
      compile({ posture: "curated", harness: "claude", skills: [fakeSkill], doorPluginDir: "/opt/door" }),
    ).toThrow(/only valid with --posture product-floor/);
  });

  it("F6/F7 evidence is recorded, not re-derived — and no averaged floor number exists", () => {
    const e = FLOOR_EVIDENCE;
    expect(e.productFloorTokens - e.benchmarkFloorTokens).toBe(e.doorTokens);
    expect(e.doorTokens).toBe(515);
    expect(e.benchmarkFloorTokens).toBe(19661);
    expect(e.productFloorTokens).toBe(20176);
    expect(e.nativeTokens).toBe(28379);
    // -28.9% off native, one decimal, exactly as F7 reported it
    expect(Number((((e.productFloorTokens - e.nativeTokens) / e.nativeTokens) * 100).toFixed(1))).toBe(
      e.productFloorVsNativePct,
    );
    // B1: nothing here may present the two floors as one blended number.
    const mean = (e.benchmarkFloorTokens + e.productFloorTokens) / 2;
    expect(Object.values(e)).not.toContain(mean);
  });

  it("product-floor has no verified cell on any other harness — it refuses rather than guesses (M0/D8)", () => {
    for (const h of ["pi", "codex", "cursor", "grok"] as const) {
      expect(() => compile({ posture: "product-floor", harness: h, skills: [] })).toThrow(/no verified cell/);
    }
  });

  // KC6 (Issue #12): this refusal is the harness-incapable class — nobody has
  // verified the composition, so there is nothing decided to withhold. It
  // must say that explicitly, not just "no verified cell", which alone could
  // be misread as "not verified [and therefore not permitted]".
  it("marks the harness-cell refusal as a capability gap, not a policy hold (KC6)", () => {
    let msg = "";
    try {
      compile({ posture: "product-floor", harness: "pi", skills: [] });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("harness-capability gap, not a policy hold");
    expect(msg).not.toMatch(/gated \(P2\)/);
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

  // KC6 (Issue #12): same class as the product-floor harness-cell refusal
  // above — no verified mechanism exists at all, which is not a decision to
  // withhold anything.
  it("marks the grok refusal as a capability gap, not a policy hold (KC6)", () => {
    let msg = "";
    try {
      compile({ posture: "floor", harness: "grok", skills: [] });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("harness-capability gap, not a policy hold");
    expect(msg).not.toMatch(/gated \(P2\)/);
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

  // KC6 (Issue #12): the policy-class refusal, on the research CLI's own
  // --level lane too — must not read like the harness-incapable class covered
  // above (product-floor/grok: "harness-capability gap, not a policy hold").
  it("marks the hell-lane refusal as a policy hold, not a harness limit (KC6)", () => {
    let msg = "";
    try {
      parseArgs(["--level", "max"]);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("withheld by policy, not a harness limit");
    expect(msg).not.toContain("harness-capability gap");
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
  it("--posture product-floor parses; benchmark-floor is an alias for floor", () => {
    expect(parseArgs(["--posture", "product-floor"]).posture).toBe("product-floor");
    expect(parseArgs(["--posture", "benchmark-floor"]).posture).toBe("floor");
    expect(() => parseArgs(["--posture", "doorful"])).toThrow(/--posture must be one of/);
  });
  it("--arm placebo is refused on the product floor (B2: the placebo-of-record is doorless)", () => {
    const argsFor = (p: string) => ["--posture", p, "--record", "-p", "Q", "--benchmark-id", "b", "--task", "t", "--arm", "placebo"];
    expect(parseArgs(argsFor("floor")).record?.arm).toBe("placebo");
    expect(() => parseArgs(argsFor("product-floor"))).toThrow(/placebo/);
  });
  it("--door-plugin-dir is carried through", () => {
    expect(parseArgs(["--posture", "product-floor", "--door-plugin-dir", "/opt/door"]).doorPluginDir).toBe("/opt/door");
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

  it("floor records name WHICH floor they came from, so the arms cannot be pooled (B1)", () => {
    const bench = assembleRecord({
      ...base,
      opts: { benchmarkId: "b", task: "t", arm: "placebo", repeatIndex: 0 },
      posture: "floor",
      skills: [],
    });
    const product = assembleRecord({
      ...base,
      opts: { benchmarkId: "b", task: "t", arm: "heaven", repeatIndex: 0 },
      posture: "product-floor",
      skills: [],
    });
    validateRecord(bench);
    validateRecord(product);
    // the tag leads the note, so a record's own floor is unambiguous even
    // though each note also names the arm it must never be pooled with
    expect(bench.notes).toMatch(/^floor=benchmark \(doorless/);
    expect(product.notes).toMatch(/^floor=product \(doorful/);
    expect(bench.notes).toMatch(/never averaged \(B1\)/);
    expect(product.notes).toMatch(/never averaged \(B1\)/);
    // both floors load zero skills — the door is not a skill cost
    expect(product.tokens).toEqual({ system: null, skillStanding: 0, skillInvocation: 0, perTurn: 119 });
    expect(product.arm).toBe("heaven");
  });

  it("the product floor can never be the placebo-of-record (B2)", () => {
    expect(() =>
      assembleRecord({
        ...base,
        opts: { benchmarkId: "b", task: "t", arm: "placebo", repeatIndex: 0 },
        posture: "product-floor",
        skills: [],
      }),
    ).toThrow(/placebo-of-record/);
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
