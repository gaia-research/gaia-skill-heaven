import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HEAVEN_LEVELS, HELL_LEVELS, LADDER_LEVELS, UNRATIFIED_LEVELS } from "skill-heaven";
import { buildLadderArtifact } from "../scripts/generate-ladder.js";
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
  it("machine-copies the founder-ruled Heaven/Hell split from core", () => {
    const artifact = buildLadderArtifact();
    expect(artifact.levels).toEqual(LADDER_LEVELS);
    expect(artifact.heavenLevels).toEqual(HEAVEN_LEVELS);
    expect(artifact.hellLevels).toEqual(HELL_LEVELS);
    expect(artifact.unratifiedLevels).toEqual(UNRATIFIED_LEVELS);
    expect(readLadderData()).toEqual({
      heaven: ["off", "low", "med"],
      hell: ["high", "xhigh", "max"],
      unratified: ["ultra"],
    });
  });

  it("fails closed when generated policy is unavailable", () => {
    expect(renderPosture({ data: null }).refused).toBe(true);
    expect(renderPosture({ data: null }).text).toContain("fail-closed");
  });
});

describe("/skill-heaven owns only the subtractive half", () => {
  it("without a launcher names the dead end and its exact exit", () => {
    const text = renderPosture().text;
    expect(text).toContain("off · low · med");
    expect(text).toContain("boot-time decisions");
    expect(text).toContain("WORKING PROTOTYPE · actively tested for public use");
    expect(text).toContain("claude-heaven --level low --skill <path>");
    expect(text).toContain("did not change the running session");
    expect(text).not.toMatch(/high|xhigh|max|ultra/);
  });

  it("marks off current and makes low and med actionable", () => {
    const text = renderPosture({ manifest: productFloor }).text;
    expect(text).toMatch(/● off\s+near-empty; door open · current/);
    expect(text).toMatch(/○ low\s+upward.*--level low --skill <path>/);
    expect(text).toMatch(/○ med\s+upward.*--level med/);
  });

  it("maps med to native, the unlocked top of Heaven", () => {
    const text = renderPosture({ manifest: native }).text;
    expect(levelForPosture("native")).toBe("med");
    expect(text).toMatch(/● med\s+native setup · current/);
    expect(text).not.toMatch(/med.*LOCKED \(P2\)/);
    const result = captureStdout(() => run(["--level", "med", "--print"]));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).posture).toBe("native");
  });

  it("keeps downward moves D12-locked with exact relaunch commands", () => {
    const text = renderPosture({ manifest: low }).text;
    expect(text).toMatch(/⊘ off\s+DOWNWARD LOCKED \(D12\).*--level off/);
    expect(silenceStderr(() => run(["--level", "off", "--print"]))).toBe(0);
  });

  it("routes Hell selections to /skill-hell instead of locking them", () => {
    const result = renderPosture({ manifest: productFloor, target: "high" });
    expect(result.refused).toBe(false);
    expect(result.text).toBe("↗ high belongs to the additive half. Arm it with: /skill-hell high\n");
    expect(result.text).not.toMatch(/P2|locked/i);
  });

  it("keeps ultra distinctly unratified", () => {
    const result = renderPosture({ manifest: productFloor, target: "ultra" });
    expect(result.refused).toBe(true);
    expect(result.text).toContain("UNRATIFIED");
    expect(result.text).not.toContain("P2");
  });

  it("preserves standing-dose exclusions", () => {
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
      // The card format replaced the old flat "  summoned <id>" header when the
      // ladder split landed: identity first, then only the fields the tree
      // actually published.
      expect(result.text.startsWith("┌ summoned · ")).toBe(true);
      expect(result.text).toContain("status: WORKING PROTOTYPE · actively tested for public use");
    } finally {
      if (previous === undefined) delete process.env.SKILL_HELL_BIN;
      else process.env.SKILL_HELL_BIN = previous;
    }
  });
});

describe("renderer input boundaries", () => {
  it("maps all and only Heaven postures", () => {
    expect(levelForPosture("product-floor")).toBe("off");
    expect(levelForPosture("curated")).toBe("low");
    expect(levelForPosture("native")).toBe("med");
    expect(levelForPosture("floor")).toBeNull();
  });

  it("normalizes plain names and drops exotic input", () => {
    expect(normalizeTarget(" MED ")).toBe("med");
    expect(normalizeTarget("$(id)")).toBeNull();
    expect(renderPosture({ manifest: productFloor, target: "$(id)" }).text).not.toContain("$(id)");
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

function captureStdout(fn: () => number): { code: number; out: string } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (text: string) => boolean) = (text: string) => {
    chunks.push(text);
    return true;
  };
  try {
    return { code: fn(), out: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}
