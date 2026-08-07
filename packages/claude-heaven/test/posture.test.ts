import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HELL_LEVELS, LADDER_LEVELS, UNRATIFIED_LEVELS } from "skill-heaven";
import { buildP2Gate } from "../scripts/generate-p2-gate.js";
import { run } from "../src/cli.js";
import { renderHell } from "../plugin/scripts/render-hell.mjs";
import {
  formatTokens,
  isLaunchManifest,
  levelForPosture,
  loadManifest,
  normalizeTarget,
  readLadderData,
  renderPosture,
} from "../plugin/scripts/render-posture.mjs";

const productFloor = {
  schema: "claude-heaven/profile@1",
  posture: "product-floor",
  standingTokens: 0,
  skillCount: 0,
  scope: "session",
  launcherLocked: true,
} as const;
const low = { ...productFloor, posture: "curated", standingTokens: 57, skillCount: 1 } as const;
const native = {
  ...productFloor,
  posture: "native",
  standingTokens: 4823,
  skillCount: 12,
  scope: "user+project",
} as const;

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function silenceStderr(fn: () => number): number {
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (text: string) => boolean) = () => true;
  try {
    return fn();
  } finally {
    process.stderr.write = original;
  }
}

describe("generated ladder policy", () => {
  it("machine-copies every ladder, gate, and ratification list from core", () => {
    const artifact = buildP2Gate();
    expect(artifact.levels).toEqual(LADDER_LEVELS);
    expect(artifact.gatedLevels).toEqual(HELL_LEVELS);
    expect(artifact.unratifiedLevels).toEqual(UNRATIFIED_LEVELS);
    expect(readLadderData()).toEqual({
      levels: [...LADDER_LEVELS],
      gated: [...HELL_LEVELS],
      unratified: [...UNRATIFIED_LEVELS],
    });
  });

  it("fails closed when generated policy is unavailable", () => {
    expect(renderPosture({ data: null }).refused).toBe(true);
    expect(renderPosture({ data: null }).text).toContain("fail-closed");
  });
});

describe("/skill-heaven ladder chooser", () => {
  it("previews the new off default and makes low actionable", () => {
    const text = renderPosture().text;
    expect(text).toContain("WORKING PROTOTYPE · actively tested for public use");
    expect(text).toContain("off · low · med · high · xhigh · max · ultra");
    expect(text).toContain("● off");
    expect(text).toContain("○ low");
    expect(text).toContain("claude-heaven --level low --skill <path>");
    expect(text.split("\n").length).toBeLessThanOrEqual(18);
  });

  it("marks off as current in a default launcher session", () => {
    const text = renderPosture({ manifest: productFloor }).text;
    expect(text).toMatch(/● off\s+near-empty; keeps this door · current/);
    expect(text).toMatch(/○ low\s+upward/);
  });

  it("locks only the downward move from low and emits the exact relaunch", () => {
    const text = renderPosture({ manifest: low }).text;
    expect(text).toMatch(/⊘ off\s+DOWNWARD LOCKED \(D12\).*claude-heaven --level off/);
    expect(text).toMatch(/● low\s+curated skills only · current/);
    expect(silenceStderr(() => run(["--level", "off", "--print"]))).toBe(0);
  });

  it("keeps every Hell rung P2-gated and ultra distinctly unratified", () => {
    const text = renderPosture({ manifest: productFloor }).text;
    for (const level of HELL_LEVELS) expect(text).toMatch(new RegExp(`⊘ ${level}\\s+Hell.*LOCKED \\(P2\\)`));
    expect(text).toMatch(/⊘ ultra\s+unratified · no approved product mapping/);
  });

  it("returns the existing P2 refusal for a selected Hell rung", () => {
    const result = renderPosture({ manifest: productFloor, target: "max" });
    expect(result.refused).toBe(true);
    expect(result.text).toContain('"max" is Hell-lane and gated (P2)');
    expect(result.text).toContain("policy hold, not a harness limit");
    expect(result.text).not.toContain("off · low");
  });

  it("points at a selected Heaven rung without claiming it moved", () => {
    const text = renderPosture({ manifest: productFloor, target: "low" }).text;
    expect(text).toMatch(/○ low.*← selected/);
    expect(text).toContain("emits a launch command");
    expect(text).toContain("cannot load a skill natively into this running session");
  });

  it("keeps native and session-scope standing-dose exclusions honest", () => {
    expect(renderPosture({ manifest: native }).text).toContain(
      "bundled CLI skills and plugin-provided skills are not counted",
    );
    expect(renderPosture({ manifest: productFloor }).text).toContain("bundled `doctor` skill is not counted");
  });
});

describe("/skill-hell successful header", () => {
  it("keeps summoned first and discloses public prototype status", () => {
    const dir = mkdtempSync(join(tmpdir(), "hell-renderer-"));
    dirs.push(dir);
    const skillDir = join(dir, "skill");
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "SKILL.md"), "# Tiny test skill\n");
    const engine = join(dir, "skill-hell");
    writeFileSync(
      engine,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({summoned:[{id:"tiny",level:"high",trustMagnitude:1,path:${JSON.stringify(skillDir)}}]}))\n`,
    );
    chmodSync(engine, 0o755);

    const previous = process.env.SKILL_HELL_BIN;
    process.env.SKILL_HELL_BIN = engine;
    try {
      const result = renderHell(["test intent"]);
      expect(result.ok).toBe(true);
      expect(result.text.startsWith("  summoned")).toBe(true);
      expect(result.text).toContain("status  WORKING PROTOTYPE · actively tested for public use");
    } finally {
      if (previous === undefined) delete process.env.SKILL_HELL_BIN;
      else process.env.SKILL_HELL_BIN = previous;
    }
  });
});

describe("renderer input boundaries", () => {
  it("maps only ladder-backed postures", () => {
    expect(levelForPosture("product-floor")).toBe("off");
    expect(levelForPosture("curated")).toBe("low");
    expect(levelForPosture("native")).toBeNull();
  });

  it("normalizes plain rung names and drops exotic input", () => {
    expect(normalizeTarget(" LOW ")).toBe("low");
    expect(normalizeTarget("$(id)")).toBeNull();
    expect(renderPosture({ target: "$(id)" }).text).not.toContain("$(id)");
  });

  it("formats doses and validates manifests", () => {
    expect(formatTokens(4823)).toBe("4.8k");
    expect(formatTokens(57)).toBe("57");
    expect(isLaunchManifest(productFloor)).toBe(true);
    expect(isLaunchManifest({ posture: "product-floor" })).toBe(false);
  });

  it("loads only valid manifests", () => {
    const dir = mkdtempSync(join(tmpdir(), "ladder-manifest-"));
    dirs.push(dir);
    const valid = join(dir, "valid.json");
    const invalid = join(dir, "invalid.json");
    writeFileSync(valid, JSON.stringify(productFloor));
    writeFileSync(invalid, JSON.stringify({ posture: "product-floor" }));
    expect(loadManifest(valid)).toEqual(productFloor);
    expect(loadManifest(invalid)).toBeNull();
    expect(loadManifest(join(dir, "missing.json"))).toBeNull();
  });
});
