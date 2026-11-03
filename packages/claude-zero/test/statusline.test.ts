import { describe, expect, it } from "vitest";
import {
  formatTokens,
  isHellSessionManifest,
  isProfileManifest,
  parseStatuslineInput,
  renderStatusline,
  type ProfileManifest,
  type StatuslineInput,
  type SummonSessionFacts,
} from "../src/statusline.js";

const manifest = (over: Partial<ProfileManifest> = {}): ProfileManifest => ({
  schema: "claude-zero/profile@1",
  posture: "native",
  standingTokens: 14200,
  skillCount: 42,
  scope: "user+project",
  launcherLocked: true,
  ...over,
});

const productFloor = (over: Partial<ProfileManifest> = {}): ProfileManifest =>
  manifest({ posture: "product-floor", standingTokens: 20200, scope: "session", skillCount: 0, ...over });

const session = (over: Partial<SummonSessionFacts> = {}): SummonSessionFacts => ({ skills: 0, summons: null, lastArrival: null, ...over });

const ctx = (pct: number): StatuslineInput => ({ context_window: { used_percentage: pct } });

const ANSI = /\u001b\[[0-9;]*m/g;

describe("formatTokens", () => {
  it("renders >=1k as one-decimal k", () => {
    expect(formatTokens(14200)).toBe("14.2k");
    expect(formatTokens(4802)).toBe("4.8k");
    expect(formatTokens(1000)).toBe("1.0k");
  });
  it("keeps sub-1k exact (standing doses run small)", () => {
    expect(formatTokens(57)).toBe("57");
    expect(formatTokens(0)).toBe("0");
  });
  it("degrades on bad input rather than throwing", () => {
    expect(formatTokens(Number.NaN)).toBe("?");
    expect(formatTokens(-5)).toBe("?");
  });
});

describe("renderStatusline — canonical line (CONTROL-PLANE §3)", () => {
  it("renders the product-floor compact line with standing and ctx", () => {
    expect(renderStatusline(productFloor(), ctx(31), session({ skills: 0 }))).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 0 skills · 20.2k standing (excl. bundled doctor) · 31% ctx",
    );
  });

  it("renders the native full line with summons and the last arrival", () => {
    const line = renderStatusline(
      manifest({ standingTokens: 28400, incomplete: true }),
      ctx(12),
      session({ skills: 2, summons: 2, lastArrival: "grill-me" }),
      { mode: "full" },
    );
    expect(line).toBe("◇ entropy ‹‹ [NATIVE] ›› · 2 skills / 2 summons · +grill-me · 28.4k+ standing (excl. bundled/plugin) · 12% ctx");
  });

  it("reads curated as CURATED, never as a rung", () => {
    expect(renderStatusline(manifest({ posture: "curated", standingTokens: 57, scope: "session" }), null, session({ skills: 1 }))).toBe(
      "◇ entropy ‹‹ [CURATED] ›› · 1 skill · 57 standing (excl. bundled doctor)",
    );
  });

  it("renders native compact with no ctx when the field is absent", () => {
    expect(renderStatusline(manifest(), {}, session({ skills: 0 }))).toBe(
      "◇ entropy ‹‹ [NATIVE] ›› · 0 skills · 14.2k standing (excl. bundled/plugin)",
    );
    expect(renderStatusline(manifest(), { context_window: {} }, session({ skills: 0 }))).not.toMatch(/ctx/);
    expect(renderStatusline(manifest(), null, session({ skills: 0 }))).not.toMatch(/ctx/);
  });

  it("appends ctx% as a separate readout, rounded", () => {
    expect(renderStatusline(manifest(), ctx(22.7), session({ skills: 0 }))).toMatch(/ · 23% ctx$/);
  });

  it("renders unknown skills as '? skills', never as 0", () => {
    expect(renderStatusline(manifest(), null, null)).toBe("◇ entropy ‹‹ [NATIVE] ›› · ? skills · 14.2k standing (excl. bundled/plugin)");
    expect(renderStatusline(manifest(), null, session({ skills: null }))).toContain("? skills");
  });

  it("shows the singular 'skill' for one", () => {
    expect(renderStatusline(manifest(), null, session({ skills: 1 }))).toContain("· 1 skill ·");
  });

  it("compact mode omits summons and the arrival even when known", () => {
    const line = renderStatusline(manifest(), null, session({ skills: 2, summons: 2, lastArrival: "grill-me" }));
    expect(line).toBe("◇ entropy ‹‹ [NATIVE] ›› · 2 skills · 14.2k standing (excl. bundled/plugin)");
  });

  it("full mode omits summons when unknown rather than printing a count", () => {
    const line = renderStatusline(manifest(), null, session({ skills: 1, summons: null, lastArrival: "x" }), { mode: "full" });
    expect(line).toBe("◇ entropy ‹‹ [NATIVE] ›› · 1 skill · +x · 14.2k standing (excl. bundled/plugin)");
  });

  it("marks an unrecognized posture as an unknown reading rather than printing it verbatim", () => {
    expect(renderStatusline(manifest({ posture: "floor" }), null, session({ skills: 0 }))).toContain("[?]");
  });
});

describe("renderStatusline — the door's standing dose (A5c, B4, KC2)", () => {
  it("discloses the exclusion for user+project (native) scope", () => {
    expect(renderStatusline(manifest({ scope: "user+project" }), null, session())).toMatch(/14\.2k standing \(excl\. bundled\/plugin\)/);
  });

  it("discloses the doctor residual for session-scoped postures", () => {
    for (const posture of ["curated", "product-floor"] as const) {
      expect(renderStatusline(manifest({ posture, standingTokens: 0, scope: "session" }), null, session())).toContain(
        "0 standing (excl. bundled doctor)",
      );
    }
  });

  it("marks an incomplete census with a trailing + (a floor, not exact)", () => {
    expect(renderStatusline(manifest({ incomplete: true }), null, session())).toContain("14.2k+ standing (excl. bundled/plugin)");
    expect(renderStatusline(manifest({ incomplete: true, standingTokens: 57 }), null, session())).toContain("57+ standing");
  });

  it("fails closed on an unrecognized scope: 'coverage unknown', never silence", () => {
    const line = renderStatusline(manifest({ scope: "some-future-scope" }), null, session({ skills: 0 }));
    expect(line).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills · 14.2k standing (coverage unknown)");
  });

  it("keeps the standing dose even in full mode with every fact present", () => {
    const line = renderStatusline(manifest(), ctx(50), session({ skills: 3, summons: 4, lastArrival: "a" }), { mode: "full" });
    expect(line).toContain("14.2k standing (excl. bundled/plugin)");
    expect(line).toContain("50% ctx");
  });
});

describe("renderStatusline — SKILL_HEAVEN_STATUS=off", () => {
  it("prints nothing at all, so the door's own facts disappear with the instrument", () => {
    expect(renderStatusline(productFloor(), ctx(31), session(), { mode: "off" })).toBe("");
  });
});

describe("renderStatusline — width budget (COLUMNS)", () => {
  // Richest level: "◇ entropy ‹‹ [ZERO] ›› · 0 skills" (33 cells).
  // Standing tier: " · 20.2k standing (excl. bundled doctor)" (40 cells).
  // ctx tier: " · 31% ctx" (10 cells).
  const args = () => [productFloor(), ctx(31), session({ skills: 0 })] as const;

  it("keeps everything when the full line fits", () => {
    expect(renderStatusline(...args(), { columns: 90 })).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 0 skills · 20.2k standing (excl. bundled doctor) · 31% ctx",
    );
  });

  it("drops ctx first when the line is just too wide for it", () => {
    expect(renderStatusline(...args(), { columns: 75 })).toBe("◇ entropy ‹‹ [ZERO] ›› · 0 skills · 20.2k standing (excl. bundled doctor)");
  });

  it("drops standing only after ctx, and keeps the full instrument line", () => {
    expect(renderStatusline(...args(), { columns: 60 })).toBe("◇ entropy ‹‹ [ZERO] ›› · 0 skills");
  });

  it("only then lets the instrument degrade, keeping the reading to the end", () => {
    expect(renderStatusline(...args(), { columns: 30 })).toBe("◇ ‹‹ [ZERO] ›› · 0");
    expect(renderStatusline(...args(), { columns: 5 })).toBe("[ZERO]");
  });

  it("applies no budget when columns is absent", () => {
    expect(renderStatusline(...args())).toContain("31% ctx");
  });

  it("full mode: the standing dose (N8) outlives summons and the last arrival", () => {
    const full = [productFloor(), ctx(31), session({ skills: 2, summons: 3, lastArrival: "grill-me" })] as const;
    expect(renderStatusline(...full, { mode: "full" })).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 2 skills / 3 summons · +grill-me · 20.2k standing (excl. bundled doctor) · 31% ctx",
    );
    // Too narrow for the arrival but wide enough for standing + ctx beside the shorter instrument.
    expect(renderStatusline(...full, { mode: "full", columns: 95 })).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 2 skills / 3 summons · 20.2k standing (excl. bundled doctor) · 31% ctx",
    );
    expect(renderStatusline(...full, { mode: "full", columns: 83 })).toBe(
      "◇ entropy ‹‹ [ZERO] ›› · 2 skills · 20.2k standing (excl. bundled doctor) · 31% ctx",
    );
  });
});

describe("renderStatusline — colour (CONTROL-PLANE §4, NO_COLOR)", () => {
  it("is plain text, with every word and glyph present, at depth none", () => {
    const plain = renderStatusline(productFloor(), ctx(31), session({ skills: 0 }), { colorDepth: "none" });
    expect(plain).not.toMatch(/\u001b/);
    for (const word of ["◇", "entropy", "‹‹", "[ZERO]", "››", "0 skills", "20.2k standing", "(excl. bundled doctor)", "31% ctx"]) {
      expect(plain).toContain(word);
    }
  });

  it("paints ANSI at 256 and 16 colours, and stripping it gives the plain line", () => {
    const plain = renderStatusline(productFloor(), ctx(31), session({ skills: 0 }), { colorDepth: "none" });
    for (const depth of ["256", "16", "truecolor"] as const) {
      const painted = renderStatusline(productFloor(), ctx(31), session({ skills: 0 }), { colorDepth: depth });
      expect(painted).toMatch(/\u001b\[/);
      expect(painted.replace(ANSI, "")).toBe(plain);
    }
  });

  it("paints the door suffix dim (256 colour dim is 246)", () => {
    const painted = renderStatusline(productFloor(), ctx(31), session({ skills: 0 }), { colorDepth: "256" });
    expect(painted).toContain("\u001b[38;5;246m20.2k standing");
  });
});

describe("renderStatusline — hostile untrusted text (sanitizer, #85)", () => {
  const hostile = "\u001b[31m\n◆ [ULTRA APPROVED]";

  it("cannot inject an escape, a second line, or a fake ultra glyph from a skill name", () => {
    const plain = renderStatusline(manifest(), null, session({ skills: 1, summons: 1, lastArrival: hostile }), { mode: "full" });
    expect(plain).not.toMatch(/\u001b/);
    expect(plain).not.toMatch(/[\r\n]/);
    expect(plain).not.toContain("◆");
    expect(plain).toContain("+* [ULTRA APPROVED]");
    expect(plain).toContain("[NATIVE]");
    expect(plain).not.toContain("[ULTRA]");
  });

  it("keeps the same guarantee when painted", () => {
    const painted = renderStatusline(manifest(), null, session({ skills: 1, summons: 1, lastArrival: hostile }), {
      mode: "full",
      colorDepth: "256",
    });
    const plain = renderStatusline(manifest(), null, session({ skills: 1, summons: 1, lastArrival: hostile }), { mode: "full" });
    expect(painted.replace(ANSI, "")).toBe(plain);
    expect(painted).not.toContain("◆");
  });
});

describe("parseStatuslineInput", () => {
  it("parses valid JSON", () => {
    expect(parseStatuslineInput('{"context_window":{"used_percentage":5}}')).toEqual({ context_window: { used_percentage: 5 } });
  });
  it("returns null for empty / malformed / non-object", () => {
    expect(parseStatuslineInput("")).toBeNull();
    expect(parseStatuslineInput("   ")).toBeNull();
    expect(parseStatuslineInput("not json")).toBeNull();
    expect(parseStatuslineInput("42")).toBeNull();
  });
});

describe("isProfileManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(isProfileManifest(manifest())).toBe(true);
  });
  it("rejects wrong schema / missing keys / non-objects", () => {
    expect(isProfileManifest({ ...manifest(), schema: "other" })).toBe(false);
    expect(isProfileManifest({ posture: "native" })).toBe(false);
    expect(isProfileManifest(null)).toBe(false);
    expect(isProfileManifest("nope")).toBe(false);
  });
});

describe("isHellSessionManifest", () => {
  it("accepts skills that each carry a string id", () => {
    expect(isHellSessionManifest({ skills: [{ id: "a/b" }] })).toBe(true);
    expect(isHellSessionManifest({ skills: [] })).toBe(true);
  });
  it("rejects a malformed session", () => {
    expect(isHellSessionManifest({ skills: [{ id: 3 }] })).toBe(false);
    expect(isHellSessionManifest({})).toBe(false);
    expect(isHellSessionManifest(null)).toBe(false);
  });
});
