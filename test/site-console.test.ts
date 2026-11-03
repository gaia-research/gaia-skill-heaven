import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildConsoleView, HARNESS_PATHS, renderConsoleText, ROLE_COLORS } from "../packages/status/src/index.js";
import { consoleFixtures } from "../packages/status/src/fixtures.js";
import { contrastRatio, gradeContrast } from "../packages/site/src/console/contrast.js";
import { buildFlowTree, degradeFlow, syntheticFanOut, FLOW_VISIBLE_LIMIT } from "../packages/site/src/console/derive.js";

// /console (docs/CONTROL-PLANE.md §5.5) is the one site surface, with /start, allowed to show
// fixture data. These static checks pin that boundary and the load-bearing copy.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_SRC = join(REPO, "packages", "site", "src");
const read = (rel: string) => readFileSync(join(SITE_SRC, rel), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sources = walk(SITE_SRC).filter((p) => /\.(tsx?|css)$/.test(p));
const FIXTURES_IMPORT = /@gaia-skill-heaven\/status\/fixtures|status\/src\/fixtures/;

describe("/console is a labelled fixture prototype", () => {
  const consoleSrc = read("surfaces/Console.tsx");
  const consoleParts = walk(join(SITE_SRC, "console"))
    .filter((p) => p.endsWith(".tsx") || p.endsWith(".ts"))
    .map((p) => readFileSync(p, "utf8"));

  it("selects harness capability dynamically and renders the shared fixture semantic view", () => {
    expect(consoleSrc).toContain("HARNESS_PATHS.filter((item) => item.id !== 'other')");
    expect(consoleSrc).toContain("buildConsoleView(example, selectedHarness)");
    expect(consoleSrc).toContain("renderConsoleText(semanticView)");
    expect(consoleSrc).toContain("semanticView.projection.surfaces");
    for (const harness of HARNESS_PATHS.filter((item) => item.id !== "other")) {
      const fixture = consoleFixtures(harness.console.observes).working!;
      const view = buildConsoleView(fixture.state, harness);
      expect(view.harness.id).toBe(harness.id);
      expect(renderConsoleText(view)).toContain(harness.name);
    }
  });

  it("imports fixtures only from the status package's fixtures entry", () => {
    const imports = [...consoleSrc.matchAll(/from\s+['"]([^'"]*fixtures[^'"]*)['"]/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).toBe("@gaia-skill-heaven/status/fixtures");
    expect(consoleSrc).toContain("STATUS_FIXTURES");
    expect(consoleSrc).toContain("EVENT_FIXTURES");
    expect(consoleSrc).toContain("FLOW_FIXTURE");
  });

  it("carries the permanent FIXTURE banner and no way to dismiss it", () => {
    expect(consoleSrc).toContain(
      "FIXTURE — design states, not your session. Every value on this page is example data rendered by the real status model.",
    );
    expect(consoleSrc).toMatch(/className="cx-banner"/);
    const banner = consoleSrc.slice(consoleSrc.indexOf('className="cx-banner"'), consoleSrc.indexOf("</header>"));
    expect(banner).not.toMatch(/<button|onClick|localStorage|sessionStorage/);
  });

  it("states today's Ultra truth with the exact provisioned copy", () => {
    expect(consoleSrc).toContain("Skill Ultra · provisioned.");
    expect(consoleSrc).toContain("Controller unavailable");
    expect(consoleSrc).toContain("The long-horizon controller is tracked in #126 and is not yet empirically validated.");
  });

  it("uses real tablist semantics", () => {
    expect(consoleSrc).toContain('role="tablist"');
    expect(consoleSrc).toContain('role="tab"');
    expect(consoleSrc).toContain('role="tabpanel"');
    expect(consoleSrc).toContain("aria-selected");
    expect(consoleSrc).toContain("aria-controls");
    expect(consoleSrc).toContain("useRovingTabs");
    const tabs = readFileSync(join(SITE_SRC, "console", "tabs.ts"), "utf8");
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(tabs).toContain(key);
  });

  it("never prints the deferred host, an npx route or banned vocabulary", () => {
    const all = [consoleSrc, ...consoleParts, read("surfaces/console.css")].join("\n");
    expect(all).not.toContain("skill-heaven.dev");
    expect(all).not.toMatch(/\bnpx\b/);
    expect(all).not.toMatch(/\b(slots?|budget|auto-summon|autonomous|armed|trust score)\b/i);
    expect(all).not.toMatch(/standing authorization/i);
  });

  it("adds its root to the token-collision block", () => {
    expect(read("styles/system.css")).toMatch(/\.hx,[^{]*\.cx[^{]*\{/);
  });

  it("keeps Arbor green out of the page and Hell out of red", () => {
    const css = read("surfaces/console.css");
    expect(css.toLowerCase()).not.toContain(ROLE_COLORS.arbor.hex);
    expect(ROLE_COLORS.hell.hex.toLowerCase()).not.toBe(ROLE_COLORS.stop.hex.toLowerCase());
  });

  it("derives instead of hand-writing: the sections render through the real renderer", () => {
    const instrument = readFileSync(join(SITE_SRC, "console", "Instrument.tsx"), "utf8");
    for (const fn of ["renderStatusSegments", "paintAnsi", "describeStatus", "statusLevels"]) expect(instrument).toContain(fn);
    const lens = readFileSync(join(SITE_SRC, "console", "Lens.tsx"), "utf8");
    expect(lens).toContain("EventPulse");
    expect(readFileSync(join(SITE_SRC, "console", "Panels.tsx"), "utf8")).toContain("eventLines");
  });
});

describe("fixture data stays off every other surface", () => {
  it("only Start.tsx and Console.tsx import the status fixtures", () => {
    const allowed = new Set(["surfaces/Start.tsx", "surfaces/Console.tsx"]);
    const offenders = sources
      .map((p) => relative(SITE_SRC, p).split("\\").join("/"))
      .filter((rel) => !allowed.has(rel))
      .filter((rel) => FIXTURES_IMPORT.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("no surface other than Start and Console imports the fixtures (Landing, Hero, Live, variations)", () => {
    for (const rel of ["surfaces/Landing.tsx", "surfaces/Hero.tsx", "surfaces/Live.tsx", "surfaces/SlashReel.tsx"]) {
      expect(read(rel), rel).not.toMatch(FIXTURES_IMPORT);
    }
    for (const p of sources.filter((s) => s.includes(`${join(SITE_SRC, "variations")}`))) {
      expect(readFileSync(p, "utf8"), p).not.toMatch(FIXTURES_IMPORT);
    }
  });

  it("the console's own parts receive fixtures as props and never import them", () => {
    for (const p of sources.filter((s) => s.includes(`${join(SITE_SRC, "console")}`))) {
      expect(readFileSync(p, "utf8"), p).not.toMatch(FIXTURES_IMPORT);
    }
  });
});

describe("the console's computed values", () => {
  it("computes WCAG contrast rather than quoting it", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#eeebe6", "#1b1a1c")).toBeGreaterThan(7);
    for (const role of ["umbrella", "ultra", "zero", "heaven", "hell", "ink", "dim", "amber"] as const) {
      expect(gradeContrast(contrastRatio(ROLE_COLORS[role].hex, "#1b1a1c")), role).toBe("text");
    }
    // stop is glyph-only: below 4.5:1 on the ground.
    expect(gradeContrast(contrastRatio(ROLE_COLORS.stop.hex, "#1b1a1c"))).not.toBe("text");
  });

  it("builds the Flow tree from parent links, degrades honestly, and collapses fan-out beyond 12", () => {
    const agents = syntheticFanOut(14);
    const [root] = buildFlowTree(agents);
    expect(root?.children).toHaveLength(14);
    expect(FLOW_VISIBLE_LIMIT).toBe(12);
    const degraded = degradeFlow(agents);
    expect(degraded).toHaveLength(1);
    expect(degraded[0]!.summons).toBe(agents.reduce((n, a) => n + a.summons, 0));
  });
});
