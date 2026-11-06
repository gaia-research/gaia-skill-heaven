import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// #203/#204 — the pointer budget and the lifecycle guards, at the level vitest
// can see (node, no DOM). The behaviour in a real browser is checked by
// packages/site/scripts/e2e-atmosphere.mjs (`npm -w @gaia-skill-heaven/site run e2e`).

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "site");
type Pointer = {
  GAZE_BUDGET_VMIN: number;
  ATMOSPHERE_MAX_VMIN: number;
  POINTER_X_VMIN: number;
  normalise(client: number, extent: number, gain?: number): number;
  depthOffset(norm: number, depth: number, axis: "x" | "y"): number;
};
type Plane = { depth: number };
type Worlds = { SHARDS: Plane[]; LIGHT: Record<string, Plane[]> };
const pointer = (await import(/* @vite-ignore */ join(SITE, "src/lucy-scene/atmosphere/pointer.ts"))) as Pointer;
const worlds = (await import(/* @vite-ignore */ join(SITE, "src/lucy-scene/atmosphere/worlds.ts"))) as Worlds;
const code = (rel: string) =>
  readFileSync(join(SITE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("pointer depth budget", () => {
  it("keeps the room's ceiling below Lucy's gaze budget", () => {
    expect(pointer.ATMOSPHERE_MAX_VMIN).toBeLessThan(pointer.GAZE_BUDGET_VMIN);
    expect(pointer.ATMOSPHERE_MAX_VMIN / pointer.GAZE_BUDGET_VMIN).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it("clamps every declared plane, whatever its depth and however far the pointer goes", () => {
    const depths = [
      ...worlds.SHARDS.map((s: Plane) => s.depth),
      ...Object.values(worlds.LIGHT).flatMap((ls: Plane[]) => ls.map((l: Plane) => l.depth)),
    ];
    // The widest plane (Ultra's sweep) would exceed the ceiling unclamped.
    expect(Math.max(...depths.map(Math.abs)) * pointer.POINTER_X_VMIN).toBeGreaterThan(pointer.ATMOSPHERE_MAX_VMIN);
    for (const d of depths) {
      for (const n of [-5, -1, -0.3, 0, 0.3, 1, 5]) {
        for (const axis of ["x", "y"] as const) {
          expect(Math.abs(pointer.depthOffset(n, d, axis))).toBeLessThanOrEqual(pointer.ATMOSPHERE_MAX_VMIN);
        }
      }
    }
  });

  it("moves planes at different scales, and negative depth answers backwards", () => {
    const near = pointer.depthOffset(1, 0.25, "x");
    const far = pointer.depthOffset(1, 0.9, "x");
    expect(Math.abs(far)).toBeGreaterThan(Math.abs(near));
    expect(pointer.depthOffset(1, -0.5, "x")).toBeGreaterThan(0);
    expect(pointer.depthOffset(1, 0.5, "x")).toBeLessThan(0);
    expect(pointer.depthOffset(0, 0.9, "y")).toBeCloseTo(0);
  });

  it("normalises and clamps client coordinates; a degenerate viewport is neutral", () => {
    expect(pointer.normalise(0, 1000)).toBe(-1);
    expect(pointer.normalise(1000, 1000)).toBe(1);
    expect(pointer.normalise(500, 1000)).toBe(0);
    expect(pointer.normalise(5000, 1000)).toBe(1);
    expect(pointer.normalise(500, 0)).toBe(0);
    // Touch uses a softer gain than a mouse.
    expect(Math.abs(pointer.normalise(0, 1000, 1.2))).toBeLessThan(1);
  });
});

describe("conductor lifecycle and input guards", () => {
  const conductor = code("src/lucy-scene/atmosphere/conductor.ts");

  it("takes the depth maths from pointer.ts, not inline constants", () => {
    expect(conductor).toContain("depthOffset(");
    expect(conductor).not.toMatch(/\*\s*-1\.[16]\b/);
  });

  it("applies pointer input only while the scene runs, and eases to the latest target on resume", () => {
    expect(conductor).toMatch(/if \(!isRunning\(\)\) return\s+tx\.set\(x\)/);
    expect(conductor).toMatch(/tx\.set\(target\.x\)/);
  });

  it("pauses animations that a state change starts while the scene is paused", () => {
    expect(conductor).toMatch(/if \(!isRunning\(\)\) syncRunning\(\)/);
  });

  it("holds pointer state in plain variables and motion values, never React", () => {
    expect(conductor).not.toMatch(/useState|setState|useReducer/);
  });

  it("ships the e2e script and wires it into package.json without adding a dependency", () => {
    const pkg = JSON.parse(readFileSync(join(SITE, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.e2e).toBe("node scripts/e2e-atmosphere.mjs");
    for (const name of ["playwright", "playwright-core", "@playwright/test", "jsdom"]) {
      expect(pkg.dependencies[name]).toBeUndefined();
      expect(pkg.devDependencies[name]).toBeUndefined();
    }
  });
});
