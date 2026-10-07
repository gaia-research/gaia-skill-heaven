import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";
import {
  CHIP_LABEL,
  HARNESS_PATHS,
  GROUND_HEX,
  ROLE_COLORS,
  controllerFromCampaignStatus,
  controllerFromSteeringEntry,
  describeEvent,
  describeStatus,
  emptyStatus,
  eventFromSummonResult,
  eventLines,
  markRead,
  noticeLines,
  paintAnsi,
  readingFromProfileManifest,
  reduceStatus,
  renderStatusSegments,
  resolveColorDepth,
  sanitizeDisplay,
  segmentsWidth,
  selectionFromCommand,
  skillsFromSessionManifest,
  statusLevels,
  toPlain,
  withReading,
  type SkillHeavenStatus,
} from "../src/index.js";
import { EVENT_FIXTURES, STATUS_FIXTURES } from "../src/fixtures.js";

const SRC = join(__dirname, "..", "src");

function line(status: SkillHeavenStatus, mode: "compact" | "full" = "compact", width?: number): string {
  return toPlain(renderStatusSegments(status, mode, width));
}

function st(partial: Partial<SkillHeavenStatus>): SkillHeavenStatus {
  return { ...emptyStatus(), skills: 0, summons: 0, ...partial };
}

describe("canonical grammar (#137)", () => {
  it("renders the north star", () => {
    expect(line(st({ reading: { kind: "native", source: "no-launcher" } }))).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills");
  });

  it("renders every reading token and singular/plural", () => {
    expect(line(st({ reading: { kind: "boot", posture: "product-floor", source: "launcher-manifest" } }))).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 0 skills",
    );
    expect(line(st({ reading: { kind: "boot", posture: "curated", source: "launcher-manifest" } }))).toContain("[CURATED]");
    expect(line(st({ reading: { kind: "selected", rung: "low", source: "observed-command" }, skills: 1 }))).toBe(
      "◇ entropy ‹‹ [LOW] ›› · 1 skill",
    );
    expect(line(st({ reading: { kind: "selected", rung: "max", source: "observed-command" }, skills: 18 }))).toBe(
      "◇ entropy ‹‹ [MAX] ›› · 18 skills",
    );
  });

  it("unknown is unknown — never 0 (§2.2)", () => {
    expect(line(st({ skills: null }))).toBe("◇ entropy ‹‹ [?] ›› · ? skills");
  });

  it("full mode adds summons and the last arrival", () => {
    const s = st({ reading: { kind: "selected", rung: "high", source: "observed-command" }, skills: 9, summons: 5, lastArrival: "browser-security" });
    expect(line(s, "full")).toBe("◇ entropy ‹‹ [HIGH] ›› · 9 skills / 5 summons · +browser-security");
  });

  it("off renders nothing", () => {
    expect(renderStatusSegments(st({}), "off")).toEqual([]);
  });

  it("K5 — no percentage, score, fraction or count-per-rung anywhere in a status line", () => {
    for (const { status } of Object.values(STATUS_FIXTURES)) {
      for (const level of statusLevels({ ...status, controller: status.controller }, "full")) {
        const text = toPlain(level);
        expect(text).not.toMatch(/%|score|entropy \d|\d\/7/);
      }
    }
  });
});

describe("narrow terminals drop fields from the right; the reading goes last", () => {
  const s = st({ reading: { kind: "selected", rung: "high", source: "observed-command" }, skills: 9, summons: 5, lastArrival: "browser-security" });

  it("degrades through the documented levels", () => {
    expect(line(s, "full", 200)).toBe("◇ entropy ‹‹ [HIGH] ›› · 9 skills / 5 summons · +browser-security");
    expect(line(s, "full", 45)).toBe("◇ entropy ‹‹ [HIGH] ›› · 9 skills / 5 summons");
    expect(line(s, "full", 33)).toBe("◇ entropy ‹‹ [HIGH] ›› · 9 skills");
    expect(line(s, "full", 18)).toBe("◇ ‹‹ [HIGH] ›› · 9");
    expect(line(s, "full", 14)).toBe("◇ ‹‹ [HIGH] ››");
    expect(line(s, "full", 3)).toBe("[HIGH]");
  });

  it("every level fits its width or is the last resort", () => {
    for (let width = 1; width < 90; width++) {
      const segs = renderStatusSegments(s, "full", width);
      const levels = statusLevels(s, "full");
      expect(segmentsWidth(segs) <= width || toPlain(segs) === toPlain(levels[levels.length - 1]!)).toBe(true);
      expect(toPlain(segs)).toContain("[HIGH]");
    }
  });
});

describe("Ultra (#137 K9, CONTROL-PLANE §2.4)", () => {
  it("selecting ultra provisions the controller as unavailable", () => {
    const s = withReading(st({ skills: 3 }), { kind: "selected", rung: "ultra", source: "observed-command" });
    expect(s.controller).toEqual({ kind: "unavailable" });
    expect(line(s)).toBe("◆ entropy ‹‹ [ULTRA] ›› · 3 skills");
    expect(line(s, "full")).toBe("◆ entropy ‹‹ [ULTRA] ›› · 3 skills / 0 summons · controller unavailable");
    expect(describeStatus(s)).toContain("Ultra controller: unavailable");
  });

  it("leaving ultra clears the slot", () => {
    const s = withReading(withReading(st({}), { kind: "selected", rung: "ultra", source: "observed-command" }), {
      kind: "selected",
      rung: "low",
      source: "observed-command",
    });
    expect(s.controller).toEqual({ kind: "not-selected" });
  });

  it("an effective rung never replaces [ULTRA]", () => {
    const fx = STATUS_FIXTURES.ultraExplore!.status;
    for (const level of statusLevels(fx, "full")) {
      const text = toPlain(level);
      expect(text).toContain("[ULTRA]");
      expect(text).not.toContain("[HIGH]");
    }
    expect(line(fx, "full")).toBe("FIXTURE ◆ entropy ‹‹ [ULTRA] ›› · 12 skills / 7 summons · EXPLORE · now HIGH › · 34/118");
  });

  it("reported controller state binds from a steering trace entry", () => {
    const c = controllerFromSteeringEntry({ decision: "explore", changed: true, from: { rung: "med" }, to: { rung: "high" }, explanation: "behavioral failure" });
    expect(c).toMatchObject({ kind: "reported", source: "steering-trace", state: "EXPLORE", effective: "high" });
    expect(controllerFromSteeringEntry({ decision: "teleport" })).toBeNull();
    expect(controllerFromSteeringEntry({ decision: "explore", score: 0.9 })).toMatchObject({ state: "EXPLORE" });
  });

  it("the proposed campaign contract parser is strict", () => {
    expect(controllerFromCampaignStatus({ schema: "skill-heaven/controller-status@0", state: "VERIFY", progress: { completed: 34, total: 118 } })).toMatchObject({
      kind: "reported",
      source: "campaign",
      state: "VERIFY",
      progress: { completed: 34, total: 118 },
    });
    expect(controllerFromCampaignStatus({ schema: "skill-heaven/controller-status@0", state: "VERIFY", authority: "granted" })).toBeNull();
    expect(controllerFromCampaignStatus({ schema: "skill-heaven/controller-status@0", state: "verify" })).toBeNull();
    expect(controllerFromCampaignStatus({ schema: "skill-heaven/controller-status@0", state: "EXEC", effective: "ultra" })).toBeNull();
    expect(controllerFromCampaignStatus({ schema: "skill-heaven/controller-status@0", state: "EXEC", progress: { completed: 5, total: 3 } })).toBeNull();
    expect(controllerFromCampaignStatus({ schema: "other", state: "EXEC" })).toBeNull();
  });
});

describe("fixtures cannot pass as runtime truth", () => {
  it("every fixture status and event is labelled FIXTURE in text and speech", () => {
    for (const { status } of Object.values(STATUS_FIXTURES)) {
      for (const level of statusLevels(status, "full")) expect(toPlain(level).startsWith("FIXTURE ")).toBe(true);
      expect(describeStatus(status).startsWith("Fixture")).toBe(true);
    }
    for (const { event } of Object.values(EVENT_FIXTURES)) {
      expect(toPlain(eventLines(event)[0]!).startsWith("FIXTURE ")).toBe(true);
      expect(describeEvent(event).startsWith("Fixture")).toBe(true);
    }
  });

  it("the package root does not export fixtures", () => {
    expect(Object.keys(api)).not.toContain("STATUS_FIXTURES");
    expect(Object.keys(api)).not.toContain("EVENT_FIXTURES");
  });

  it("no runtime module imports fixtures.ts", () => {
    for (const file of readdirSync(SRC)) {
      if (file === "fixtures.ts") continue;
      expect(readFileSync(join(SRC, file), "utf8")).not.toMatch(/from "\.\/fixtures\.js"/);
    }
  });

  it("no runtime adapter can return a fixture controller", () => {
    expect(readFileSync(join(SRC, "adapters.ts"), "utf8")).not.toMatch(/kind:\s*"fixture"/);
  });
});

describe("the package stays Node-free (the console mod has no Node)", () => {
  it("no node: imports and no process access in src", () => {
    for (const file of readdirSync(SRC)) {
      const text = readFileSync(join(SRC, file), "utf8");
      expect(text).not.toMatch(/from "node:|require\(|process\./);
    }
  });
});

describe("events: state, event, evidence stay distinct (#137)", () => {
  it("a no-match never changes skills, the reading or the direction (K6)", () => {
    const before = st({ reading: { kind: "selected", rung: "high", source: "observed-command" }, skills: 4, summons: 2 });
    const after = reduceStatus(before, EVENT_FIXTURES.noMatch!.event);
    expect(after.skills).toBe(4);
    expect(after.reading).toEqual(before.reading);
    expect(after.summons).toBe(3);
  });

  it("a preview changes nothing", () => {
    const before = st({ skills: 4, summons: 2 });
    expect(reduceStatus(before, EVENT_FIXTURES.previewMany!.event)).toEqual(before);
  });

  it("a summon adds what materialized and names the arrival", () => {
    const after = reduceStatus(st({ skills: 1, summons: 1 }), EVENT_FIXTURES.explore!.event);
    expect(after).toMatchObject({ skills: 2, summons: 2, lastArrival: "browser-security" });
  });

  it("direction glyphs follow the surface", () => {
    expect(toPlain(eventLines(EVENT_FIXTURES.manual!.event)[0]!)).toBe("FIXTURE ◇ summoned  impeccable");
    expect(toPlain(eventLines(EVENT_FIXTURES.converge!.event)[0]!)).toBe("FIXTURE ‹ summoned  react-performance");
    expect(toPlain(eventLines(EVENT_FIXTURES.explore!.event)[0]!)).toBe("FIXTURE › summoned  browser-security");
    expect(toPlain(eventLines(EVENT_FIXTURES.explore!.event)[1]!)).toBe("  ranked · .78 · Δ .11 · cold · 1.31s · +1");
    expect(toPlain(eventLines(EVENT_FIXTURES.noMatch!.event)[0]!)).toBe("FIXTURE ◇ summon  × no match");
  });

  it("a close call is a labelled retrieval fact, never behaviour", () => {
    expect(toPlain(eventLines(EVENT_FIXTURES.previewMany!.event)[1]!)).toContain("close call (retrieval)");
  });

  it("maps a real-shaped structuredContent", () => {
    const e = eventFromSummonResult({
      query: "q",
      surface: "hell",
      summoned: [{ id: "a/b", name: "b", invocation: "human", retrieval: { score: 0.5, margin: 0.2, matchKind: "ranked" }, cacheState: "warm", totalSeconds: 0.2, path: "/tmp/s/b", arbor: { join: "content-pinned" } }],
      previewed: [],
      noMatch: null,
      ranking: { stale: true, indexAgeDays: 40 },
      arbor: { publicationState: "loaded" },
      composition: { mode: "relevance-only" },
    });
    expect(e).toMatchObject({ kind: "summoned", direction: "explore", delta: 1, composition: "relevance-only", arbor: "governed-record", sourceHealth: { kind: "stale", indexAgeDays: 40 } });
    if (e.kind !== "summoned") throw new Error("expected summoned");
    expect(e.skills[0]).toMatchObject({ lane: "human-led", stage: "materialized", ms: 200 });
  });

  it("tool errors become error or unavailable, never a fabricated summon", () => {
    expect(eventFromSummonResult(null, {}, { isError: true, text: "fetch failed" }).kind).toBe("unavailable");
    expect(eventFromSummonResult(null, {}, { isError: true, text: "boom" }).kind).toBe("error");
    expect(eventFromSummonResult("not an object").kind).toBe("error");
  });

  it("a read of the materialized SKILL.md moves the skill into context", () => {
    const e = eventFromSummonResult({ surface: "any", summoned: [{ id: "x", name: "x", path: "/tmp/s/x" }], previewed: [], noMatch: null });
    const read = markRead(e, "/tmp/s/x/SKILL.md");
    expect(read.kind === "summoned" && read.skills[0]!.stage).toBe("in-context");
    expect(markRead(e, "/tmp/s/x/reference/a.md")).toBe(e);
  });
});

describe("gaps closed after the /console review", () => {
  it("a lens no-match says lens and nothing materialized; a summon no-match does not", () => {
    expect(eventLines(EVENT_FIXTURES.previewNoMatch!.event).map(toPlain)).toEqual([
      "FIXTURE ◇ lens  × no match",
      "  0 admitted · nothing cleared the relevance floor · nothing materialized",
    ]);
    expect(toPlain(eventLines(EVENT_FIXTURES.noMatch!.event)[1]!)).not.toContain("nothing materialized");
  });

  it("notice lines for a lens in flight and a disconnected summon tool", () => {
    expect(noticeLines({ kind: "looking", query: "design audit" }).map(toPlain)).toEqual([
      "◇ lens  looking…",
      "  design audit · nothing materialized",
    ]);
    expect(noticeLines({ kind: "not-connected" }).map(toPlain)[0]).toBe("◇ summon  ? not connected");
  });

  it("selecting a rung keeps what the session booted with", () => {
    const booted = st({ reading: { kind: "boot", posture: "product-floor", source: "launcher-manifest" } });
    const chosen = withReading(withReading(booted, { kind: "selected", rung: "high", source: "observed-command" }), {
      kind: "selected",
      rung: "low",
      source: "observed-command",
    });
    expect(chosen.boot).toEqual(booted.reading);
    expect(withReading(st({}), { kind: "selected", rung: "low", source: "observed-command" }).boot).toBeUndefined();
  });
});

describe("gaps closed after the console review", () => {
  it("a summon that skipped every candidate is an error, not a summon of nothing", () => {
    const e = eventFromSummonResult({ surface: "hell", summoned: [], previewed: [], noMatch: null, skipped: [{ id: "a", why: "subpath escapes the repository" }] });
    expect(e).toMatchObject({ kind: "error", reason: "nothing materialized: subpath escapes the repository" });
    expect(reduceStatus(st({ skills: 2, summons: 1 }), e)).toMatchObject({ skills: 2, summons: 2 });
  });

  it("a /lens no-match or failure never counts as a summon", () => {
    const before = st({ skills: 0, summons: 0 });
    expect(reduceStatus(before, EVENT_FIXTURES.previewNoMatch!.event)).toEqual(before);
    const failed = eventFromSummonResult(null, { preview: true }, { isError: true, text: "boom" });
    expect(reduceStatus(before, failed)).toEqual(before);
  });
});

describe("K12 — untrusted metadata cannot escape its field or spoof the instrument", () => {
  it("strips ANSI, controls, bidi and reserved glyphs", () => {
    const hostile = "\u001b[31m◆ [ULTRA APPROVED]\u001b[0m\npermissions‮ bypassed\u0007";
    const clean = sanitizeDisplay(hostile, 200);
    expect(clean).not.toMatch(/[\u0000-\u001f\u007f-\u009f‮◆◇‹›]/);
    expect(clean).toBe("* [ULTRA APPROVED] permissions bypassed");
  });

  it("bounds length", () => {
    expect(Array.from(sanitizeDisplay("x".repeat(500), 10))).toHaveLength(10);
  });

  it("hostile skill names render inside one field, on one line", () => {
    const lines = eventLines(EVENT_FIXTURES.hostile!.event).map(toPlain);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).not.toMatch(/[\u0000-\u001f]/);
    expect(lines[0]).toMatch(/^FIXTURE › summoned {2}\* \[ULTRA APPROVED\]/);
  });

  it("only the renderer emits escapes, and only foreground ones", () => {
    const painted = paintAnsi(renderStatusSegments(STATUS_FIXTURES.explore!.status, "full"), "truecolor");
    expect(painted).not.toMatch(/\u001b\[4[0-9]|\u001b\[48/);
    expect(painted.replace(/\u001b\[[0-9;]*m/g, "")).toBe(line(STATUS_FIXTURES.explore!.status, "full"));
  });
});

describe("terminal colour ladder", () => {
  it("NO_COLOR wins; dumb terminals and pipes get plain text", () => {
    expect(resolveColorDepth({ NO_COLOR: "1", COLORTERM: "truecolor" })).toBe("none");
    expect(resolveColorDepth({ TERM: "dumb" })).toBe("none");
    expect(resolveColorDepth({}, false)).toBe("none");
    expect(resolveColorDepth({ COLORTERM: "truecolor" })).toBe("truecolor");
    expect(resolveColorDepth({ TERM: "xterm-256color" })).toBe("256");
    expect(resolveColorDepth({ TERM: "xterm" })).toBe("16");
  });

  it("plain output keeps every meaning (glyphs and words, not colour)", () => {
    const plain = paintAnsi(renderStatusSegments(STATUS_FIXTURES.converge!.status, "compact"), "none");
    expect(plain).toBe("FIXTURE ◇ entropy ‹‹ [LOW] ›› · 2 skills");
  });
});

describe("palette (CONTROL-PLANE §4)", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };

  it("every text role clears 4.5:1 on the ground", () => {
    for (const [role, c] of Object.entries(ROLE_COLORS)) {
      if (role === "stop") continue; // glyph-only role, asserted below
      expect(contrast(c.hex, GROUND_HEX), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("K8 — Hell is never the failure red; the red role only ever paints a one-glyph segment", () => {
    expect(ROLE_COLORS.hell.hex).not.toBe(ROLE_COLORS.stop.hex);
    for (const { event } of Object.values(EVENT_FIXTURES)) {
      for (const l of eventLines(event)) for (const s of l) if (s.role === "stop") expect(s.text).toBe("!");
    }
  });

  it("K7 — nothing renders in the Arbor role today", () => {
    for (const { event } of Object.values(EVENT_FIXTURES)) for (const l of eventLines(event)) for (const s of l) expect(s.role).not.toBe("arbor");
  });
});

describe("readers fail closed", () => {
  it("profile manifest", () => {
    expect(readingFromProfileManifest({ schema: "claude-zero/profile@1", posture: "product-floor" })).toMatchObject({ kind: "boot", posture: "product-floor" });
    expect(readingFromProfileManifest({ schema: "claude-zero/profile@1", posture: "floor" })).toEqual({ kind: "unknown" });
    expect(readingFromProfileManifest(null)).toEqual({ kind: "unknown" });
  });

  it("session manifest", () => {
    expect(skillsFromSessionManifest({ skills: [{ id: "a/x", name: "x" }, { id: "b" }] })).toEqual({ skills: 2, last: "b" });
    expect(skillsFromSessionManifest({ skills: [{ nope: 1 }] })).toEqual({ skills: null, last: null });
    expect(skillsFromSessionManifest("garbage")).toEqual({ skills: null, last: null });
  });

  it("observed rung commands", () => {
    expect(selectionFromCommand("/skill-hell high")).toMatchObject({ rung: "high" });
    expect(selectionFromCommand("/skill-heaven:skill-hell xhigh")).toMatchObject({ rung: "xhigh" });
    expect(selectionFromCommand("/skill-heaven")).toMatchObject({ rung: "low" });
    expect(selectionFromCommand("/skill-hell")).toMatchObject({ rung: "high" });
    expect(selectionFromCommand("/skill-ultra")).toMatchObject({ rung: "ultra" });
    expect(selectionFromCommand("/skill-zero all")).toMatchObject({ rung: "zero" });
    expect(selectionFromCommand("/skill-heaven high")).toBeNull();
    expect(selectionFromCommand("/skill-hell 5")).toBeNull();
    expect(selectionFromCommand("please /skill-hell high")).toBeNull();
    expect(selectionFromCommand("/summon x")).toBeNull();
  });
});

describe("harness table (CONTROL-PLANE §5.4)", () => {
  it("every row names its probed version or says it was not probed", () => {
    for (const h of HARNESS_PATHS) {
      expect(h.chip in CHIP_LABEL).toBe(true);
      if (h.chip === "verified" || h.chip === "compatible") expect(h.probedVersion).toMatch(/^\d+\.\d+\.\d+$/);
      if (h.commands.length === 0) expect(h.blocked).toBeTruthy();
    }
  });

  it("never prints a dead path", () => {
    const text = JSON.stringify(HARNESS_PATHS);
    expect(text).not.toMatch(/skill-heaven\.dev|npx |npm install/);
  });

  it("Antigravity is partial and prints no registration command until probed", () => {
    const agy = HARNESS_PATHS.find((h) => h.id === "agy")!;
    expect(agy.chip).toBe("partial");
    expect(agy.commands).toEqual([]);
  });
});
