// The /skill-heaven posture slider (WS4 step 2). The renderer lives in
// plugin/scripts/render-slider.mjs — it must run dependency-free once the door
// is installed from the marketplace — so these tests import the shipped .mjs
// directly rather than a TypeScript mirror of it.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HELL_LEVELS, POSTURES } from "skill-heaven";
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

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

const nativeManifest = {
  schema: "claude-heaven/profile@1",
  posture: "native",
  standingTokens: 4823,
  skillCount: 12,
  scope: "user+project",
  launcherLocked: true,
} as const;

const productFloorManifest = { ...nativeManifest, posture: "product-floor" } as const;
// The doorless benchmark floor. This command does not exist there (F6), so this
// manifest is a "cannot happen" input kept as a regression guard: the renderer
// must not treat it as a launched clean room.
const benchmarkFloorManifest = { ...nativeManifest, posture: "floor" } as const;

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

  it("renders the hell notch as a locked door in every mode (P2)", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).toMatch(/⊘ {2}hell {8}/);
      expect(text).toMatch(/LOCKED \(P2\)/);
    }
  });
});

describe("locked-notch upsell (D12)", () => {
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

  it("unlocks the clean room for a session that launched at the product floor", () => {
    const text = render({ manifest: productFloorManifest });
    expect(text).toMatch(/● {2}clean room/);
    expect(text).not.toContain("relaunch via `claude-heaven` to unlock the clean room");
    expect(text).toContain("you launched here");
  });

  it("never claims a slash command can restart the process (D12 / B4)", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).toContain("cannot restart Claude Code for you");
      expect(text).not.toMatch(/restart(ing)? (the session|for you) automatically/i);
      expect(text).not.toMatch(/\bI (will|can) (relaunch|restart)/i);
    }
  });
});

describe("the floor split (V5-5): the slider targets the PRODUCT floor", () => {
  it("names product-floor as the clean-room notch, and lists no benchmark floor", () => {
    expect(NOTCHES.map((n: { id: string }) => n.id)).toContain("product-floor");
    expect(NOTCHES.map((n: { id: string }) => n.id)).not.toContain("floor");
    // Every notch id the slider ships must be a posture core actually knows, or
    // a lane marker core owns (`hell` is gated by P2, `add-ons`/`lean` are
    // in-session moves rather than compile postures).
    for (const id of ["product-floor", "native"]) expect(POSTURES).toContain(id);
  });

  it("explains the doorless benchmark floor instead of pretending the name is unknown", () => {
    const text = render({ manifest: nativeManifest, target: "floor" });
    expect(text).toContain("no slash commands, so no door and no slider");
    expect(text).not.toMatch(/no notch called "floor"/);
    // and it must not print a command that would take the user to it
    expect(text).not.toContain("--disable-slash-commands");
  });

  it("never renders the benchmark floor as a launched or reachable stop", () => {
    // Cannot happen in practice (F6); guarded anyway.
    const text = render({ manifest: benchmarkFloorManifest });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).not.toContain("you launched here");
  });

  it("prices the two floors as separate arms and never averages them (B1/B2)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("priced as separate arms, never averaged");
    expect(text).toContain("measurement placebo, not a place to sit");
  });

  it("records no benchmark arm anywhere in claude-heaven — placebo is core's, at --posture floor", () => {
    // `--arm placebo` hard-errors on product-floor upstream. The guard that keeps
    // this package from ever tripping it is that it has no arm-recording path at
    // all; assert that rather than trusting a comment.
    const root = PKG;
    const files = [
      ...readdirSync(join(root, "src")).map((f) => join(root, "src", f)),
      ...readdirSync(join(root, "plugin", "scripts")).map((f) => join(root, "plugin", "scripts", f)),
    ].filter((f) => /\.(ts|mjs)$/.test(f));
    for (const f of files) {
      const body = readFileSync(f, "utf-8");
      expect(body, `${f} must not compose a benchmark arm`).not.toContain("--arm");
    }
  });

  it("drops the retired-D13 behavioral notch entirely — no research row, no ⋯ state", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).not.toContain("restraint");
      expect(text).not.toContain("⋯");
      expect(text).not.toContain("coming — research");
    }
    expect(NOTCHES.map((n: { id: string }) => n.id)).not.toContain("restraint");
  });
});

describe("no retired decision id survives anywhere in the repo (D9 / V5-6)", () => {
  it("cites no id on RATIFICATION.md's never-reused list", () => {
    // A PR citing a retired decision id is a defect (Federation Invariant 4).
    // Ids are never reused, so a retired id resolves to nothing — the whole
    // point of the never-reused rule. This walks the repo rather than a list,
    // so a new file cannot reintroduce one unnoticed.
    const RETIRED = ["D7", "D10", "D11", "D13"];
    const REPO = join(PKG, "..", "..");
    const SKIP = new Set(["node_modules", ".git", "dist", "coverage"]);
    /** @returns every source/doc file in the repo */
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (SKIP.has(e.name)) return [];
        const full = join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.(ts|mjs|md|json)$/.test(e.name) && e.name !== "package-lock.json" ? [full] : [];
      });
    const files = walk(REPO);
    expect(files.length).toBeGreaterThan(20);
    for (const rel of files) {
      const body = readFileSync(rel, "utf-8");
      for (const id of RETIRED) {
        // A retired id may only appear as an explicit retirement note.
        for (const line of body.split("\n").filter((l) => new RegExp(`\\b${id}\\b`).test(l))) {
          expect(line, `${rel}: ${id} is retired — re-bind it`).toMatch(/RETIRED|retired/);
        }
      }
    }
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
