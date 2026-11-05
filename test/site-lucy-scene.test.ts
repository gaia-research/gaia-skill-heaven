import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

// #201 — the Lucy Scene: one product state, an atmosphere engine (Motion, DOM)
// and a character engine (Rive) that never drive each other. Vitest runs in
// node here (no DOM), so behaviour that needs a browser is covered two ways:
// server rendering proves each side renders without the other, and static
// source checks (the style of site-truth.test.ts) pin the contracts that are
// otherwise easy to erode: no frame-rate React state, Motion confined to the
// lazy conductor, reduced motion bypassing it, no canvas/WebGL.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// packages/site is a Vite+React app outside the root tsc project (it needs
// jsx:react-jsx), so its components are loaded by absolute path at runtime:
// vitest transforms them, tsc never resolves them.
type Component = (props: Record<string, unknown>) => ReturnType<typeof createElement>;
const load = async <T>(rel: string, name: string): Promise<T> =>
  ((await import(/* @vite-ignore */ join(REPO, "packages", "site", rel))) as Record<string, T>)[name]!;
const LucyAtmosphere = await load<Component>("src/lucy-scene/atmosphere/LucyAtmosphere.tsx", "LucyAtmosphere");
const LucyLive = await load<Component>("src/lucy-scene/LucyLive.tsx", "LucyLive");
const LucyScene = await load<Component>("src/lucy-scene/LucyScene.tsx", "LucyScene");
const SCENE_STATES = await load<readonly string[]>("src/lucy-scene/scene.ts", "SCENE_STATES");
const site = (rel: string) => readFileSync(join(REPO, "packages", "site", rel), "utf8");
const code = (rel: string) =>
  site(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ATMOSPHERE = "src/lucy-scene/atmosphere/LucyAtmosphere.tsx";
const CONDUCTOR = "src/lucy-scene/atmosphere/conductor.ts";
const LIVE = "src/lucy-scene/LucyLive.tsx";
const SCENE = "src/lucy-scene/LucyScene.tsx";

describe("the scene renders each engine without the other", () => {
  it("renders the atmosphere with Lucy absent, in every state", () => {
    for (const state of SCENE_STATES) {
      const html = renderToString(createElement(LucyScene, { state }, createElement(LucyAtmosphere, { state })));
      expect(html).toContain(`data-scene-state="${state}"`);
      expect(html).toContain(`class="la"`);
      expect(html).toContain(`data-state="${state}"`);
      expect(html).not.toContain("lucy-live");
    }
  });

  it("renders Lucy with the atmosphere disabled", () => {
    const html = renderToString(
      createElement(LucyScene, { state: "heaven" }, createElement(LucyLive, { state: "heaven" }, createElement("img", { alt: "" }))),
    );
    expect(html).toContain("lucy-live");
    expect(html).toContain('data-lucy-state="heaven"');
    expect(html).not.toContain('class="la"');
  });

  it("lets Lucy be omitted from the scene on request without touching the atmosphere", () => {
    const html = renderToString(
      createElement(
        LucyScene,
        { state: "hell" },
        createElement(LucyAtmosphere, { state: "hell" }),
        createElement(LucyLive, { state: "hell", hidden: true }, createElement("img", { alt: "" })),
      ),
    );
    expect(html).toContain('class="la"');
    expect(html).not.toContain("lucy-live");
  });

  it("paints every world statically, so no-JS and reduced motion still have a room", () => {
    const html = renderToString(createElement(LucyAtmosphere, { state: "ultra" }));
    for (const world of SCENE_STATES) expect(html).toContain(`data-world="${world}"`);
    expect(html).toContain("la-field");
    expect(html).toContain('aria-hidden="true"');
  });

  it("forwards the host root's props instead of adding a layout wrapper", () => {
    const html = renderToString(createElement(LucyScene, { state: "zero", className: "vha", id: "hero" }));
    expect(html).toMatch(/^<div[^>]*class="vha"/);
    expect(html).toContain('id="hero"');
  });
});

describe("the two engines are decoupled", () => {
  it("neither engine imports the other", () => {
    const atmosphere = [code(ATMOSPHERE), code(CONDUCTOR)].join("\n");
    expect(atmosphere).not.toMatch(/from\s+['"][^'"]*(LucyLive|rive\/|createLucyCharacter|LucyRiveFigure)/);
    const live = [code(LIVE), code("src/lucy-scene/rive/LucyRiveFigure.tsx"), code("src/lucy-scene/rive/createLucyCharacter.ts")].join("\n");
    expect(live).not.toMatch(/from\s+['"][^'"]*(atmosphere|conductor)/);
    expect(live).not.toMatch(/LucyAtmosphere/);
  });

  it("the scene root imports neither engine, only the shared contract and lifecycle", () => {
    const scene = code(SCENE);
    expect(scene).not.toMatch(/atmosphere|LucyLive|rive|motion/i);
    expect(scene).toContain("useSceneLifecycle");
  });

  it("both engines read the same lifecycle attribute rather than running their own observers", () => {
    expect(code(CONDUCTOR)).toContain("SCENE_RUNNING_ATTR");
    expect(code("src/lucy-scene/rive/LucyRiveFigure.tsx")).toContain("SCENE_RUNNING_ATTR");
    for (const f of [ATMOSPHERE, CONDUCTOR, LIVE]) expect(code(f)).not.toContain("IntersectionObserver");
    const hook = code("src/lucy-scene/useSceneLifecycle.ts");
    expect(hook).not.toMatch(/useState|setState/);
  });

  it("the hero's product state is the scene's only input", () => {
    const hero = code("src/variations/VariationHeroA.tsx");
    expect(hero).toMatch(/<LucyScene[^>]*state=\{v\.scene\}/);
    expect(hero).toMatch(/<LucyAtmosphere state=\{v\.scene\}/);
    expect(hero).toMatch(/<LucyLive state=\{v\.scene\}/);
    // No second state machine for the scene.
    expect(code(SCENE)).not.toMatch(/useState|useReducer|createContext/);
  });

  it("keeps the review switches that make each engine independently disable-able", () => {
    const hero = code("src/variations/VariationHeroA.tsx");
    expect(hero).toContain("{!atmosphereOff && <LucyAtmosphere");
    expect(hero).toMatch(/<LucyLive state=\{v\.scene\} hidden=\{lucyOff\}/);
    expect(site("src/variations/VariationHeroA.tsx")).toMatch(/'atmo'[^]*'lucy'/);
  });
});

describe("no animation-frame React work", () => {
  it("never holds animation state in React state", () => {
    for (const f of [ATMOSPHERE, CONDUCTOR, LIVE, SCENE, "src/lucy-scene/useSceneLifecycle.ts"]) {
      expect(code(f), f).not.toMatch(/\buseState\b|\buseReducer\b|\bsetState\b/);
    }
  });

  it("is memoised, so the hero's glitch re-renders never reach the room", () => {
    expect(code(ATMOSPHERE)).toMatch(/export const LucyAtmosphere = memo\(/);
  });

  it("drives pointer depth and transitions with Motion values and WAAPI-eligible properties, not a scheduler", () => {
    const conductor = code(CONDUCTOR);
    expect(conductor).toMatch(/springValue|motionValue/);
    expect(conductor).toMatch(/animate\(/);
    expect(conductor).not.toMatch(/requestAnimationFrame|setInterval/);
    // Animated properties stay on the compositor.
    expect(conductor).not.toMatch(/\b(filter|backdropFilter|backdrop-filter|width|height|top|left)\s*:/);
  });
});

describe("reduced motion bypasses the engine cleanly", () => {
  it("never loads the conductor (and with it Motion) under prefers-reduced-motion", () => {
    const a = code(ATMOSPHERE);
    expect(a).toContain("(prefers-reduced-motion: reduce)");
    expect(a).toMatch(/if \(rm\.matches \|\| conductorRef\.current\) return/);
    // Motion is reachable only through the dynamic import of the conductor.
    expect(a).toMatch(/import\('\.\/conductor'\)/);
    expect(a).not.toMatch(/from\s+['"]motion/);
    // The only static reference is a type import, erased at build.
    expect(a).not.toMatch(/^import\s+(?!type)[^\n]*['"]\.\/conductor['"]/m);
  });

  it("tears the engine down when the preference flips on, falling back to the static rooms", () => {
    const a = code(ATMOSPHERE);
    expect(a).toMatch(/if \(rm\.matches\) \{\s*conductorRef\.current\?\.destroy\(\)/);
  });

  it("the conductor also checks the preference before every transition", () => {
    expect(code(CONDUCTOR)).toContain("reduced()");
  });

  it("the stylesheet freezes loops and transitions under reduced motion", () => {
    const css = site("src/lucy-scene/atmosphere/atmosphere.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transition:\s*none/);
  });

  it("Motion is imported only inside the lazy conductor", () => {
    const offenders = [
      "src/main.tsx",
      "src/lucy-scene/LucyLive.tsx",
      "src/lucy-scene/LucyScene.tsx",
      "src/lucy-scene/scene.ts",
      ATMOSPHERE,
      "src/variations/VariationHeroA.tsx",
    ].filter((f) => /from\s+['"]motion/.test(code(f)));
    expect(offenders).toEqual([]);
    expect(code(CONDUCTOR)).toMatch(/from 'motion'/);
  });
});

describe("the dependency stays narrow", () => {
  it("pins Motion exactly, in the site package only, with no canvas/WebGL scene library", () => {
    const pkg = JSON.parse(site("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.motion).toMatch(/^\d+\.\d+\.\d+$/);
    for (const banned of ["three", "@react-three/fiber", "pixi.js", "ogl", "gsap", "framer-motion", "@react-spring/web"]) {
      expect(pkg.dependencies[banned], banned).toBeUndefined();
    }
    const root = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    expect(root.dependencies?.motion).toBeUndefined();
    const core = JSON.parse(readFileSync(join(REPO, "packages/core/package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(core.dependencies?.motion).toBeUndefined();
  });

  it("the atmosphere layer is DOM/CSS: no canvas or WebGL context", () => {
    for (const f of [ATMOSPHERE, CONDUCTOR, SCENE]) {
      expect(code(f), f).not.toMatch(/<canvas|createElement\(['"]canvas|getContext\(|webgl/i);
    }
  });
});
