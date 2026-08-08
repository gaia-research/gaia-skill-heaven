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

  it("curated plugin-dir = empty setting-sources allowlist + --plugin-dir + bundled-skills knob + manifest + skill copies (KC4 clean room, T6 negative)", () => {
    const r = compile({ posture: "curated", harness: "claude", mechanism: "plugin-dir", skills: [fakeSkill] });
    // T6 (2.1.215): --disable-slash-commands eats plugin skills — must NOT be present
    expect(r.argv).not.toContain("--disable-slash-commands");
    // KC4 (2026-07-30): --setting-sources is an ALLOWLIST. Naming "project"
    // explicitly KEEPS project-scope skills live — that was the measured
    // residual. The flag must still be passed, with an EMPTY value — that is
    // structurally different from omitting the flag (which restores the full
    // bundled listing).
    const settingSourcesIdx = r.argv.indexOf("--setting-sources");
    expect(settingSourcesIdx).toBeGreaterThanOrEqual(0);
    expect(r.argv[settingSourcesIdx + 1]).toBe("");
    expect(r.argv).not.toContain("project");
    expect(r.argv).toContain("--strict-mcp-config");
    expect(r.argv).toContain("--plugin-dir");
    // --plugin-dir is a flag, not a setting source, so the curated set still
    // mounts under the empty allowlist.
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

  it("the product floor keeps the door and uses an empty setting-sources allowlist (P8)", () => {
    const product = compile({ posture: "product-floor", harness: "claude", skills: [] });
    expect(product.argv).toEqual([
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--setting-sources",
      "",
    ]);
    expect(product.argv).not.toContain("--disable-slash-commands");
    expect(product.argv).not.toContain("project");
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

  it("product-floor has no verified cell on cursor — it refuses rather than guesses (M0/D8)", () => {
    // pi joined claude as a verified product-floor cell in WP2 (PROBE.md, pi
    // 0.83.0, 2026-08-07); codex joined in WP14 (PROBE.md, 0.146.0), and
    // grok joined in WP12 (PROBE.md, 0.2.118). Cursor remains unprobed.
    for (const h of ["cursor"] as const) {
      expect(() => compile({ posture: "product-floor", harness: h, skills: [] })).toThrow(/no verified cell/);
    }
  });

  // KC6 (Issue #12): cursor still has no product-floor route at all. That is a
  // harness-capability gap, not a policy hold.
  it("marks the harness-cell refusal as a capability gap, not a policy hold (KC6)", () => {
    let msg = "";
    try {
      compile({ posture: "product-floor", harness: "cursor", skills: [] });
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
  it("product-floor = --no-skills + --no-context-files + --no-prompt-templates, extensions untouched (WP2, PROBE.md, 0.83.0)", () => {
    const r = compile({ posture: "product-floor", harness: "pi", skills: [] });
    expect(r.argv).toEqual(["--no-skills", "--no-context-files", "--no-prompt-templates"]);
    expect(r.argv).not.toContain("--no-extensions"); // extensions are pi's door surface — left alive
    expect(r.execSupport).toBe("exec");
    expect(r.fsPlan).toEqual([]);
  });
  it("native = nothing", () => {
    expect(compile({ posture: "native", harness: "pi", skills: [] }).argv).toEqual([]);
  });
});

describe("non-native harness mappings", () => {
  it("codex compiles an exec route with session-scoped exact-path discovery", () => {
    const r = compile({ posture: "floor", harness: "codex", skills: [] });
    expect(r.execSupport).toBe("exec");
    expect(r.env.CODEX_HOME).toBe("$SESSION/codex");
    expect(r.argv).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--ignore-rules",
    ]);
    expect(r.notes.join(" ")).toMatch(/skills\/list/i);
  });
  it("cursor compiles a recipe with CURSOR_CONFIG_DIR", () => {
    const r = compile({ posture: "floor", harness: "cursor", skills: [] });
    expect(r.execSupport).toBe("recipe");
    expect(r.env.CURSOR_CONFIG_DIR).toBe("$SESSION/cursor-config");
  });
  it("grok composes pinned exec routes and leaves native untouched", () => {
    const floor = compile({ posture: "floor", harness: "grok", skills: [] });
    expect(floor.env.GROK_HOME).toBe("$SESSION/grok");
    expect(floor.argv).toEqual(["--no-memory", "--no-subagents", "--no-plan", "--disable-web-search"]);
    expect(floor.fsPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "copyFileIfExists", to: "$SESSION/grok/auth.json" }),
        expect.objectContaining({ kind: "write", path: "$SESSION/grok/config.toml" }),
      ]),
    );
    expect(floor.execSupport).toBe("exec");

    const product = compile({ posture: "product-floor", harness: "grok", skills: [] });
    expect(product.execSupport).toBe("exec");
    expect(product.notes.join(" ")).toMatch(/plugins as the door surface/i);

    const curated = compile({ posture: "curated", harness: "grok", skills: [fakeSkill] });
    expect(curated.fsPlan).toContainEqual({
      kind: "copyDir",
      from: "/skills/impeccable",
      to: "$SESSION/grok/skills/impeccable",
    });

    const native = compile({ posture: "native", harness: "grok", skills: [] });
    expect(native.argv).toEqual([]);
    expect(native.env).toEqual({});
    expect(native.fsPlan).toEqual([]);
    expect(native.execSupport).toBe("exec");
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
  it("maps the complete Heaven half: off → product-floor, low → curated, med → native", () => {
    expect(parseArgs(["--level", "off"]).posture).toBe("product-floor");
    expect(parseArgs(["--level", "low"]).posture).toBe("curated");
    expect(parseArgs(["--level", "med"]).posture).toBe("native");
  });
  it("routes Hell budgets to /skill-hell rather than P2-locking them", () => {
    for (const level of ["high", "xhigh", "max"]) {
      expect(() => parseArgs(["--level", level])).toThrow(/live Hell summon budget.*\/skill-hell/i);
      try {
        parseArgs(["--level", level]);
      } catch (error) {
        expect((error as Error).message).not.toMatch(/P2|gated|policy/i);
      }
    }
  });

  it("refuses ultra as unratified", () => {
    expect(() => parseArgs(["--level", "ultra"])).toThrow(/UNRATIFIED/);
  });
  it("contradiction between --posture and --level errors", () => {
    expect(() => parseArgs(["--posture", "native", "--level", "off"])).toThrow(/contradicts/);
    expect(() => parseArgs(["--posture", "floor", "--level", "off"])).toThrow(/contradicts/);
    expect(parseArgs(["--posture", "product-floor", "--level", "off"]).posture).toBe("product-floor");
  });
  it("--record demands headless + ids", () => {
    expect(() => parseArgs(["--record"])).toThrow(/headless/);
    expect(() => parseArgs(["--record", "-p", "Q"])).toThrow(/--benchmark-id/);
    const ok = parseArgs(["--record", "-p", "Q", "--benchmark-id", "b", "--task", "t"]);
    expect(ok.record).toMatchObject({ benchmarkId: "b", task: "t", arm: "heaven", repeatIndex: 0 });
  });
  it("--arm remains a benchmark enum, separate from live Hell budgets", () => {
    expect(() => parseArgs(["--arm", "hell"])).toThrow(/heaven or placebo/);
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
