// The /skill-heaven posture slider (WS4 step 2). The renderer lives in
// plugin/scripts/render-slider.mjs — it must run dependency-free once the door
// is installed from the marketplace — so these tests import the shipped .mjs
// directly rather than a TypeScript mirror of it.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HELL_LEVELS } from "skill-heaven";
import { censusStandingDose, nativeSkillRoots } from "../src/census.js";
import { planNativeLaunch } from "../src/launcher.js";
import { formatTokens as formatTokensTs } from "../src/statusline.js";
import {
  NOTCHES,
  formatTokens,
  isLaunchManifest,
  loadManifest,
  normalizeTarget,
  readGatedLevels,
  renderSlider,
} from "../plugin/scripts/render-slider.mjs";

const nativeManifest = {
  schema: "claude-heaven/profile@1",
  posture: "native",
  standingTokens: 4823,
  skillCount: 12,
  scope: "user+project",
  launcherLocked: true,
} as const;

const floorManifest = { ...nativeManifest, posture: "floor" } as const;

const render = (opts: Record<string, unknown> = {}) =>
  renderSlider({ sessionId: "sess-123", ...opts }).text as string;

describe("P2 gate (the Hell lane is gated on every surface)", () => {
  it("refuses every core HELL_LEVEL, sourced from core — not a literal in this file", () => {
    for (const level of HELL_LEVELS) {
      const r = renderSlider({ target: level });
      expect(r.refused, `${level} must be refused`).toBe(true);
      expect(r.text).toMatch(/Hell-lane and gated \(P2\)/);
    }
  });

  it("refuses the `hell` notch itself and never prints a way to reach it", () => {
    const r = renderSlider({ target: "hell" });
    expect(r.refused).toBe(true);
    expect(r.text).not.toMatch(/claude --resume/);
    expect(r.text).toMatch(/locked door, not an activator/);
  });

  it("keeps the shipped gate list byte-identical to core's HELL_LEVELS", () => {
    // The plugin cannot import `skill-heaven` once installed (no node_modules),
    // so the list is machine-copied by scripts/generate-p2-gate.ts. This is the
    // freshness gate: add or rename a Hell level upstream and CI fails here.
    expect(readGatedLevels()).toEqual([...HELL_LEVELS]);
  });

  it("fails CLOSED when the gate artifact is unreadable", () => {
    // Unknown gate list => anything that is not a known heaven notch is refused,
    // rather than a Hell posture being rendered as available.
    expect(renderSlider({ target: "max", gatedLevels: null }).refused).toBe(true);
    expect(renderSlider({ target: "native", gatedLevels: null }).refused).toBe(false);
  });

  it("renders the hell notch as a locked door in every mode (D13)", () => {
    for (const manifest of [null, nativeManifest, floorManifest]) {
      const text = render({ manifest });
      expect(text).toMatch(/⊘ {2}hell {8}/);
      expect(text).toMatch(/LOCKED \(P2\)/);
    }
  });
});

describe("locked-notch upsell (D12/D13)", () => {
  it("locks the clean room under vanilla claude, with the ratified copy", () => {
    const text = render({ manifest: null });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).toContain("relaunch via `claude-heaven` to unlock the clean room");
  });

  it("locks the clean room under a claude-heaven launch that did not launch there", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).toContain("relaunch via `claude-heaven` to unlock the clean room");
  });

  it("unlocks the clean room for a session that launched at the floor", () => {
    const text = render({ manifest: floorManifest });
    expect(text).toMatch(/● {2}clean room/);
    expect(text).not.toContain("relaunch via `claude-heaven` to unlock the clean room");
    expect(text).toContain("you launched here");
  });

  it("never claims a slash command can restart the process (no magic respawn, D10)", () => {
    for (const manifest of [null, nativeManifest, floorManifest]) {
      const text = render({ manifest });
      expect(text).toContain("cannot restart Claude Code for you");
      expect(text).not.toMatch(/restart(ing)? (the session|for you) automatically/i);
      expect(text).not.toMatch(/\bI (will|can) (relaunch|restart)/i);
    }
  });
});

describe("the behavioral notch stays research-only (D13 / gate (e))", () => {
  it("renders as `coming — research` and never as a reachable stop", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toMatch(/⋯ {2}restraint/);
    expect(text).toContain("coming — research");
    expect(text).toContain("not a working stop");
    // The restraint row must carry no runnable command.
    const row = text.split("\n").findIndex((l) => l.includes("restraint"));
    expect(text.split("\n")[row + 1]).not.toContain("claude --resume");
  });
});

describe("reachable notches print an exact, runnable command", () => {
  it("uses the real session id when the harness provides one", () => {
    const text = render({ manifest: nativeManifest, sessionId: "abc-def" });
    expect(text).toContain("→ claude --resume abc-def --setting-sources project");
    expect(text).toContain("→ claude --resume abc-def --plugin-dir <your-plugin-dir>");
  });

  it("falls back to a placeholder + the resume-picker hint with no session id", () => {
    const text = render({ manifest: nativeManifest, sessionId: "" });
    expect(text).toContain("claude --resume <session-id>");
    expect(text).toContain("pick this conversation from the list");
  });

  it("labels `lean` honestly — it does not remove personal skills (gate (a) row C)", () => {
    expect(render({ manifest: nativeManifest })).toContain("Does NOT remove your personal skills");
  });

  it("marks the launched posture and does not offer it as a move", () => {
    const lines = render({ manifest: nativeManifest }).split("\n");
    const i = lines.findIndex((l) => l.includes("●  native"));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toContain("you launched here (via claude-heaven)");
  });
});

describe("standing-dose readout", () => {
  it("reports the launch manifest's dose with scope disclosed, two numbers never one (B1)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("4.8k standing (user+project scope)");
    expect(text).toContain("charged separately, on invoke");
  });

  it("marks an incomplete census with a trailing + rather than presenting it as exact (B4)", () => {
    expect(render({ manifest: { ...nativeManifest, incomplete: true } })).toContain("4.8k+ standing");
  });

  it("claims no standing number at all under vanilla claude", () => {
    const text = render({ manifest: null });
    expect(text).toContain("no launch manifest, so no standing-dose readout here");
    expect(text).not.toMatch(/\d+k? standing/);
  });

  it("formats tokens identically to the statusline (one readout, two renderers)", () => {
    for (const n of [0, 57, 999, 1000, 4823, 14200, -1, Number.NaN]) {
      expect(formatTokens(n)).toBe(formatTokensTs(n));
    }
  });
});

describe("manifest contract with the launcher", () => {
  let sessionDir: string;
  let home: string;

  beforeAll(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "ch-slider-"));
    home = mkdtempSync(join(tmpdir(), "ch-slider-home-"));
  });
  afterAll(() => {
    rmSync(sessionDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("accepts a manifest the launcher actually writes, and reports core's census total", () => {
    // The acceptance cross-check: the number the slider prints is the number
    // packages/core's census produces for the same loadout — by construction,
    // because both read the one manifest the launcher wrote.
    const plan = planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/s.mjs" });
    expect(isLaunchManifest(plan.manifest)).toBe(true);

    const census = censusStandingDose(nativeSkillRoots({ home, projectDir: home }));
    expect(plan.manifest.standingTokens).toBe(census.standingTotal);

    const path = join(sessionDir, "profile.json");
    writeFileSync(path, `${JSON.stringify(plan.manifest, null, 2)}\n`);
    const loaded = loadManifest(path) as { standingTokens: number } | null;
    expect(loaded?.standingTokens).toBe(census.standingTotal);
    expect(render({ manifest: loaded })).toContain(`${formatTokens(census.standingTotal)} standing`);
  });

  it("degrades to vanilla rendering on a missing or malformed manifest", () => {
    expect(loadManifest(undefined)).toBeNull();
    expect(loadManifest(join(sessionDir, "does-not-exist.json"))).toBeNull();
    const bad = join(sessionDir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(loadManifest(bad)).toBeNull();
    const wrongSchema = join(sessionDir, "wrong.json");
    writeFileSync(wrongSchema, JSON.stringify({ schema: "other@9", posture: "native" }));
    expect(loadManifest(wrongSchema)).toBeNull();
  });
});

describe("argument handling", () => {
  it("accepts plain notch names and points at the row", () => {
    expect(normalizeTarget("  LEAN ")).toBe("lean");
    expect(render({ manifest: nativeManifest, target: "lean" })).toContain("you asked for this one");
  });

  it("refuses to interpret anything exotic as a notch, and never reflects it back", () => {
    for (const raw of ["a b", "rm -rf /", "$(id)", "x".repeat(64), "--plugin-dir"]) {
      expect(normalizeTarget(raw)).toBeNull();
    }
    const text = render({ manifest: nativeManifest, target: "$(id)" });
    expect(text).toContain('no notch called "?"');
    expect(text).not.toContain("$(id)");
  });

  it("still renders the whole slider for an unknown notch name", () => {
    const text = render({ manifest: nativeManifest, target: "turbo" });
    expect(text).toContain('no notch called "turbo"');
    for (const notch of NOTCHES) expect(text).toContain(notch.label);
  });
});
