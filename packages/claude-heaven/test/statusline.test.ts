import { describe, expect, it } from "vitest";
import { formatTokens, isProfileManifest, parseStatuslineInput, renderStatusline, type ProfileManifest } from "../src/statusline.js";

const manifest = (over: Partial<ProfileManifest> = {}): ProfileManifest => ({
  schema: "claude-heaven/profile@1",
  posture: "native",
  standingTokens: 14200,
  skillCount: 42,
  scope: "user+project",
  launcherLocked: true,
  ...over,
});

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

describe("renderStatusline", () => {
  it("renders the native-posture shape (P1)", () => {
    expect(renderStatusline(manifest())).toBe("⚡ native · 14.2k standing (excl. bundled/plugin)");
  });
  it("reflects the launched posture verbatim", () => {
    expect(renderStatusline(manifest({ posture: "floor", standingTokens: 0 }))).toBe(
      "⚡ floor · 0 standing (excl. bundled/plugin)",
    );
    expect(renderStatusline(manifest({ posture: "curated", standingTokens: 57 }))).toBe(
      "⚡ curated · 57 standing (excl. bundled/plugin)",
    );
  });
  it("marks an incomplete census with a trailing + (floor, not exact)", () => {
    expect(renderStatusline(manifest({ incomplete: true }))).toBe("⚡ native · 14.2k+ standing (excl. bundled/plugin)");
    expect(renderStatusline(manifest({ incomplete: true, standingTokens: 57 }))).toBe(
      "⚡ native · 57+ standing (excl. bundled/plugin)",
    );
  });
  it("appends live ctx% as a SEPARATE readout when present", () => {
    expect(renderStatusline(manifest(), { context_window: { used_percentage: 22.7 } })).toBe(
      "⚡ native · 14.2k standing (excl. bundled/plugin) · 23% ctx",
    );
  });
  it("omits ctx when the field is absent or non-numeric", () => {
    expect(renderStatusline(manifest(), {})).toBe("⚡ native · 14.2k standing (excl. bundled/plugin)");
    expect(renderStatusline(manifest(), { context_window: {} })).toBe("⚡ native · 14.2k standing (excl. bundled/plugin)");
    expect(renderStatusline(manifest(), null)).toBe("⚡ native · 14.2k standing (excl. bundled/plugin)");
  });

  // A3/KC4 correction: "session" scope (curated/product-floor) enumerates the
  // launched skill SET exactly, but a bundled `doctor` skill was MEASURED
  // (packages/claude-heaven/scripts/probe-kc4-listing-residual.sh) to survive
  // every posture regardless of CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 — a
  // permanent, founder-ruled harness residual. The old behavior (no caveat at
  // all for "session") asserted a coverage claim this measurement disproved.
  it("discloses the doctor residual for a fully-enumerated session scope", () => {
    expect(renderStatusline(manifest({ scope: "session" }))).toBe("⚡ native · 14.2k standing (excl. bundled doctor)");
  });
  it("never renders the standing dose without SOME scope word or the exclusion caveat", () => {
    // user+project scope must always disclose what it could not see.
    expect(renderStatusline(manifest({ scope: "user+project" }))).toMatch(/excl\. bundled\/plugin/);
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
