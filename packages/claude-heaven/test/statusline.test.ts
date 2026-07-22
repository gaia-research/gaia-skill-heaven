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
  it("renders the D10 shape at native", () => {
    expect(renderStatusline(manifest())).toBe("⚡ native · 14.2k standing");
  });
  it("reflects the launched posture verbatim", () => {
    expect(renderStatusline(manifest({ posture: "floor", standingTokens: 0 }))).toBe("⚡ floor · 0 standing");
    expect(renderStatusline(manifest({ posture: "curated", standingTokens: 57 }))).toBe("⚡ curated · 57 standing");
  });
  it("appends live ctx% as a SEPARATE readout when present", () => {
    expect(renderStatusline(manifest(), { context_window: { used_percentage: 22.7 } })).toBe("⚡ native · 14.2k standing · 23% ctx");
  });
  it("omits ctx when the field is absent or non-numeric", () => {
    expect(renderStatusline(manifest(), {})).toBe("⚡ native · 14.2k standing");
    expect(renderStatusline(manifest(), { context_window: {} })).toBe("⚡ native · 14.2k standing");
    expect(renderStatusline(manifest(), null)).toBe("⚡ native · 14.2k standing");
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
