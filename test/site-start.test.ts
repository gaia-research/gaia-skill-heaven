import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HARNESS_PATHS } from "../packages/status/src/index.js";

// /start is the install front door (docs/CONTROL-PLANE.md §1, §5.4). These are
// static source checks in the style of site-truth.test.ts: the page must render
// the compat table rather than hard-code harness facts, keep the ratified
// install hierarchy, and offer a single-select control with real semantics.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = (rel: string) => readFileSync(join(REPO, "packages", "site", rel), "utf8");

/** Source without comments, so a comment may NAME a banned route in order to ban it. */
const code = (rel: string) =>
  site(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("/start renders the compat table (#47 · #161 · #147)", () => {
  const start = site("src/surfaces/Start.tsx");

  it("imports HARNESS_PATHS and the chip copy from the status package root", () => {
    expect(start).toMatch(/HARNESS_PATHS/);
    expect(start).toMatch(/CHIP_LABEL/);
    expect(start).toMatch(/CHIP_MEANING/);
    expect(start).toMatch(/AGENT_PLUGIN_INSTALL/);
    expect(start).toMatch(/LAUNCHER_INSTALL/);
    expect(start).toMatch(/from '@gaia-skill-heaven\/status'/);
  });

  it("hard-codes no harness command or probed version of its own", () => {
    const body = code("src/surfaces/Start.tsx");
    for (const h of HARNESS_PATHS) {
      for (const c of h.commands) expect(body, `${h.id}: ${c}`).not.toContain(c);
      if (h.probedVersion) expect(body, `${h.id} version`).not.toContain(`'${h.probedVersion}'`);
    }
    expect(body).not.toMatch(/codex plugin|grok plugin|hermes plugins|pi install/);
  });

  it("offers every table row plus 'I don't have one yet', Claude Code first", () => {
    expect(HARNESS_PATHS[0]!.id).toBe("claude");
    expect(start).toContain("HARNESS_PATHS.map");
    expect(start).toMatch(/I don’t have one yet|I don't have one yet/);
  });

  it("prints no banned route", () => {
    const body = code("src/surfaces/Start.tsx");
    expect(body).not.toMatch(/skill-heaven\.dev/);
    expect(body).not.toMatch(/\bnpx\b/);
    expect(body).not.toMatch(/npm (i|install)\b/);
  });

  it("never claims the installer installs a harness, and states the opposite", () => {
    expect(start).toMatch(/never installs your harness|does not install harnesses/);
  });

  it("uses radio semantics for the harness choice", () => {
    expect(start).toMatch(/role="radiogroup"/);
    expect(start).toMatch(/type="radio"/);
  });

  it("persists only the choice in the URL hash query", () => {
    const body = code("src/surfaces/Start.tsx");
    expect(body).toMatch(/useSearchParams/);
    expect(body).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it("labels the fixtures and keeps Ultra provisioned", () => {
    expect(start).toMatch(/Example — not your session/);
    expect(start).toMatch(/provisioned — the controller that would choose for you is not built yet/);
    expect(start).toMatch(/PROVISIONAL|Provisional/);
  });

  it("shows a blocked row's text instead of a command", () => {
    expect(start).toMatch(/harness\.blocked/);
    expect(start).toMatch(/No registration command yet/);
  });

  it("covers what-changes, update and remove, and the client-copy caveat", () => {
    expect(start).toMatch(/What changes on your machine/);
    expect(start).toMatch(/harness\.update/);
    expect(start).toMatch(/harness\.remove/);
    expect(start).toMatch(/does not unregister/);
  });

  it("answers 'Do I need a launcher?' with No, and links the receipt and the console", () => {
    expect(start).toMatch(/Do I need a launcher\?/);
    expect(start).toMatch(/st-answer">No\./);
    expect(start).toContain('to="/live"');
    expect(start).toContain('to="/console"');
  });

  it("scopes its CSS under .st and registers the root in the token-collision block", () => {
    expect(site("src/styles/system.css")).toMatch(/^\.hx, \.lp(?:, \.[a-z]+)*, \.st(?:, \.[a-z]+)* \{/m);
    const css = site("src/surfaces/start.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css
      .split("{")
      .map((chunk) => chunk.split("}").pop()!.trim())
      .filter((sel) => sel && !sel.startsWith("@") && !/^\d/.test(sel));
    expect(selectors.length).toBeGreaterThan(20);
    for (const sel of selectors) {
      for (const part of sel.split(",").map((p) => p.trim())) {
        expect(part, `unscoped selector: ${part}`).toMatch(/^\.st\b/);
      }
    }
  });

  it("has no decorative motion", () => {
    const css = site("src/surfaces/start.css");
    expect(css).not.toMatch(/@keyframes/);
    expect(css).toMatch(/transition: none !important/);
  });
});

describe("the front doors send people to /start first (#47)", () => {
  const landing = site("src/surfaces/Landing.tsx");

  it("leads /landing §01 with the plugin and /start, before any launcher install", () => {
    const section = landing.slice(landing.indexOf('id="doors"'));
    const firstStart = section.indexOf("#/start");
    const firstLauncher = section.search(/install\.sh|INSTALL\.sh\b|LAUNCHERS · INSTALL/);
    expect(firstStart).toBeGreaterThan(-1);
    expect(firstLauncher).toBeGreaterThan(-1);
    expect(firstStart).toBeLessThan(firstLauncher);
    expect(section).toMatch(/INSTALL IN YOUR HARNESS/);
    const optional = section.indexOf("Optional — the launcher (Skill Zero at boot)");
    expect(optional).toBeGreaterThan(firstStart);
    // the Claude in-harness two-liner is part of the lead block, above the launcher grid
    expect(section.indexOf("CLAUDE_COMPATIBILITY.map")).toBeLessThan(optional);
  });

  it("keeps the existing anchors and §03", () => {
    for (const id of ["doors", "run", "session", "directions", "house"]) expect(landing).toContain(`id="${id}"`);
    expect(landing).toContain("STANDING DOSE · MEASURED (HISTORICAL)");
  });

  it("adds Install to the landing nav", () => {
    const nav = landing.slice(landing.indexOf('<nav className="lp-nav"'), landing.indexOf("</nav>"));
    expect(nav).toMatch(/href="#\/start">INSTALL/);
  });

  it("links the hero's install panel to /start", () => {
    const hero = site("src/variations/VariationHeroA.tsx");
    expect(hero).toContain('to="/start"');
    expect(hero).toContain("Choose your harness");
    // the install command stays
    expect(hero).toContain("PLATFORM_COMMANDS[platform].agentPlugin");
  });

  it("routes /start", () => {
    expect(site("src/main.tsx")).toContain('path="/start"');
  });
});
