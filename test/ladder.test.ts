// The one renderer behind all five surfaces. These are the assertions a machine
// can hold from the claim-discipline review (B4): the line is one line, every
// rung on it is reachable, nothing refuses a rung, and no rendering of a
// provisional count appears without its WIP mark.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BAND_INFO, LADDER_LEVELS, RUNG_BANDS } from "skill-zero";
import { buildLadderArtifact } from "../packages/claude-zero/scripts/generate-ladder.js";
import {
  formatTokens,
  isLaunchManifest,
  levelForPosture,
  loadManifest,
  MODES,
  normalizeTarget,
  readLadderData,
  renderLadder,
  zeroCuts,
} from "../plugins/skill-heaven/scripts/render-ladder.mjs";

const data = readLadderData();
const productFloor = {
  schema: "claude-zero/profile@1",
  posture: "product-floor",
  standingTokens: 0,
  skillCount: 0,
  scope: "session",
  launcherLocked: true,
};

function render(mode: string, target = "", env: NodeJS.ProcessEnv = {}) {
  return renderLadder({ mode, target, data, env, manifest: null });
}

describe("the shipped ladder artifact", () => {
  it("is byte-identical to a fresh generation from core", () => {
    // Regenerate with: npx tsx packages/claude-zero/scripts/generate-ladder.ts
    expect(data).not.toBeNull();
    const fresh = buildLadderArtifact();
    expect(data!.rungs).toEqual(fresh.rungs);
    expect(data!.bands).toEqual(fresh.bands);
    expect(data!.wip).toBe(fresh.wip);
  });

  it("carries core's RUNG_BANDS unchanged — one source of truth", () => {
    for (const level of LADDER_LEVELS) {
      const rung = data!.rungs.find((r) => r.id === level);
      expect(rung, `rung ${level} is missing from the artifact`).toBeDefined();
      expect(rung!.band).toBe(RUNG_BANDS[level]);
    }
    expect(data!.rungs.map((r) => r.id)).toEqual([...LADDER_LEVELS]);
  });

  it("assigns no number to any rung", () => {
    // Nothing assigns a count to a rung. If a `slots`-shaped field ever comes
    // back, this fails rather than letting a number leak onto the line again.
    for (const rung of data!.rungs) {
      expect(Object.keys(rung).sort()).toEqual(["band", "id"]);
    }
  });
});

describe("one line, four bands", () => {
  it("renders every rung on every rung command — the same line each time", () => {
    for (const mode of ["zero", "heaven", "hell", "ultra"]) {
      const { text } = render(mode);
      for (const level of LADDER_LEVELS) {
        expect(text, `${mode} omits rung ${level}`).toContain(` ${level} `.trimEnd());
      }
    }
  });

  it("opens each band on its own default rung and marks exactly one as armed", () => {
    for (const [band, info] of Object.entries(BAND_INFO)) {
      const { text } = render(band);
      expect(text).toContain(`armed: ${info.defaultRung}`);
      expect(text.match(/●/g)).toHaveLength(1);
    }
  });

  it("carries the WIP · PROVISIONAL mark on every rendering that shows a count", () => {
    for (const mode of ["zero", "heaven", "hell", "ultra"]) {
      expect(render(mode).text).toContain("WIP · PROVISIONAL");
    }
  });

  it("NEVER refuses a rung — nothing on the line is gated (N13)", () => {
    for (const level of LADDER_LEVELS) {
      const band = RUNG_BANDS[level];
      const result = render(band, level);
      expect(result.refused, `${band} refused its own rung ${level}`).toBe(false);
      expect(result.text).not.toMatch(/UNRATIFIED|gated|locked|sealed/i);
    }
  });

  it("redirects an out-of-band rung to the command that owns it, rather than refusing", () => {
    const result = render("heaven", "max");
    expect(result.refused).toBe(false);
    expect(result.text).toContain("↗ max sits in the hell band");
    expect(result.text).toContain("/skill-hell max");
    expect(render("hell", "ultra").text).toContain("/skill-ultra");
  });

  it("names a direction, never a count, and never a cap", () => {
    for (const [rung, direction] of [
      ["low", "converge"],
      ["med", "converge"],
      ["high", "explore"],
      ["xhigh", "explore"],
      ["max", "explore"],
    ] as const) {
      const band = RUNG_BANDS[rung];
      const { text } = render(band, rung);
      expect(text).toContain(direction);
      expect(text.replace(/\s+/g, " ")).toContain("no cap on a summon");
      // No "N skills per gap", no "limit: N" — nothing assigns a number.
      expect(text).not.toMatch(/limit:\s*\d/);
      expect(text).not.toMatch(/\d+\s*(skills?)?\s*\/\s*gap/);
      expect(text).not.toMatch(/up to \d+ skill/);
    }
  });

  it("gives ultra no sub-ladder and no count either", () => {
    const { text } = render("ultra");
    expect(text).toContain("picks the direction");
    expect(text).toContain("no sub-ladder");
    expect(text).not.toMatch(/limit:\s*\d/);
  });

  it("says the armed rung is a standing instruction, not an enforced limit", () => {
    for (const mode of ["zero", "heaven", "hell", "ultra"]) {
      expect(render(mode).text).toContain("not something the tool enforces");
    }
  });

  it("names an unknown rung honestly instead of silently arming the default", () => {
    const { text } = render("hell", "blazing");
    expect(text).toContain('Unknown rung "blazing"');
  });
});

describe("the floor", () => {
  it("cuts temporary automatic skills but keeps manual /summon", () => {
    const { text } = render("zero");
    expect(text).toContain("no temporary automatic skills");
    expect(text).toContain("Manual /summon still works");
    expect(text).toContain("/skill-zero all");
  });

  it("cuts manual too on `all`, and on the zero_cuts plugin default", () => {
    expect(render("zero", "all").text).toContain("no manual /summon either");
    expect(render("zero", "", { SKILL_HEAVEN_ZERO_CUTS: "all" }).text).toContain(
      "no manual /summon either",
    );
    expect(render("zero", "", { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "all" }).text).toContain(
      "no manual /summon either",
    );
  });

  it("never claims the cut emptied the session (D12)", () => {
    const { text } = render("zero");
    expect(text).toContain("cannot be evicted mid-session");
    expect(text).toContain("claude-zero --level zero");
  });
});

describe("/summon — the manual path, present at every rung", () => {
  it("tells the agent to make exactly one call, with no count attached", () => {
    const { text } = render("summon", "review a Rust PR");
    expect(text).toContain("once");
    expect(text).toContain("review a Rust PR");
    expect(text).toContain("arms nothing");
    expect(text).not.toMatch(/limit:\s*\d/);
  });

  it("prints usage, not a refusal, when no intent is given", () => {
    const result = render("summon");
    expect(result.refused).toBe(false);
    expect(result.text).toContain("/summon <intent>");
  });

  it("is cut — and says so plainly — when zero_cuts is all", () => {
    const result = render("summon", "anything", { SKILL_HEAVEN_ZERO_CUTS: "all" });
    expect(result.refused).toBe(true);
    expect(result.text).toContain("zero_cuts = all");
  });
});

describe("fail-closed", () => {
  it("refuses to render invented numbers when the ladder artifact is unreadable", () => {
    const result = renderLadder({ mode: "hell", data: null });
    expect(result.refused).toBe(true);
    expect(result.text).toContain("fail-closed");
  });

  it("refuses an unknown surface", () => {
    const result = renderLadder({ mode: "purgatory", data });
    expect(result.refused).toBe(true);
    expect(result.text).toContain("purgatory");
  });

  it("exposes exactly the five surfaces", () => {
    expect(MODES).toEqual(["zero", "heaven", "hell", "ultra", "summon"]);
  });

  it("returns null for a malformed artifact rather than a partial one", () => {
    const dir = mkdtempSync(join(tmpdir(), "ladder-data-"));
    writeFileSync(join(dir, "ladder.json"), JSON.stringify({ rungs: [{ id: "zero" }] }));
    expect(readLadderData(dir)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("launch-manifest helpers carried over from the posture renderer", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("formats a standing dose", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(4823)).toBe("4.8k");
    expect(formatTokens(-1)).toBe("?");
    expect(formatTokens("x")).toBe("?");
  });

  it("validates and maps a launch manifest", () => {
    expect(isLaunchManifest(productFloor)).toBe(true);
    expect(isLaunchManifest({ posture: "native" })).toBe(false);
    expect(levelForPosture("product-floor")).toBe("zero");
    expect(levelForPosture("curated")).toBe("low");
    expect(levelForPosture("native")).toBe("med");
    expect(levelForPosture("floor")).toBeNull();
  });

  it("loads a manifest from disk and discloses what the dose excludes", () => {
    dir = mkdtempSync(join(tmpdir(), "ladder-manifest-"));
    const path = join(dir, "profile.json");
    writeFileSync(path, JSON.stringify({ ...productFloor, scope: "user+project", standingTokens: 4823 }));
    const manifest = loadManifest(path);
    expect(manifest).not.toBeNull();
    const { text } = renderLadder({ mode: "zero", data, manifest, env: {} });
    expect(text).toContain("bundled CLI skills and plugin-provided skills are not counted");
  });

  it("says so plainly when the session was not launched by a door", () => {
    expect(render("zero").text).toContain("was not launched by claude-zero");
  });

  it("normalizes a target and rejects junk", () => {
    expect(normalizeTarget(" HIGH ")).toBe("high");
    expect(normalizeTarget("")).toBe("");
    expect(normalizeTarget("no spaces allowed")).toBeNull();
  });

  it("defaults zero_cuts to temporary", () => {
    expect(zeroCuts({})).toBe("temporary");
    expect(zeroCuts({ SKILL_HEAVEN_ZERO_CUTS: "ALL" })).toBe("all");
    expect(zeroCuts({ SKILL_HEAVEN_ZERO_CUTS: "nonsense" })).toBe("temporary");
  });
});
