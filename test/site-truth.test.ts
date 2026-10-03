import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTHORITY_PHRASES } from "../plugins/skill-heaven/scripts/render-ladder.mjs";
import { DOSES, INSTALL, LADDER_WIP, SITE, STAMP_ROUTING_NOTE, SURFACES } from "../packages/site/src/product.js";
import { NOT_CLAIMED, RECEIPT, RELEASE, SHIPPED } from "../packages/site/src/release.js";

// #174 — the public site says the TOOL is live without overclaiming the RESEARCH.
// These tests pin the semantic split: LIVE where the product is verified, PROVISIONAL
// where the evidence says so, and no copy that promises behaviour the product lacks.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const site = (rel: string) => read(join("packages", "site", rel));

const pluginVersion = JSON.parse(read("plugins/skill-heaven/plugin.json")).version as string;

describe("the tool is LIVE (#174)", () => {
  it("retires the product-level WIP · v0 chrome and says LIVE", () => {
    expect(SITE.status).toBe("LIVE");
    expect(SITE.version).toBe("LIVE");
    for (const file of ["src/product.ts", "src/surfaces/Landing.tsx", "src/surfaces/Hero.tsx", "src/surfaces/Live.tsx", "src/release.ts"]) {
      expect(site(file), `${file} still carries WIP · v0`).not.toMatch(/WIP · v0|WIP · V0/);
    }
    expect(site("PRODUCT.md")).not.toMatch(/WORK IN PROGRESS · v0/);
    expect(site("DESIGN.md")).not.toMatch(/standing `WIP · v0` disclosure/);
  });

  it("adds a dedicated production page and links it from the landing page and the hero", () => {
    expect(site("src/main.tsx")).toContain('path="/live"');
    expect(site("src/main.tsx")).toMatch(/\(landing\|instrument\|live\)/);
    const landing = site("src/surfaces/Landing.tsx");
    expect(landing).toContain('href="#/live"');
    expect(landing).toContain("lp-live-banner");
    expect(landing).toContain("lp-nav__live");
    expect(site("src/variations/VariationHeroA.tsx")).toContain('to="/live"');
  });

  it("keeps the receipt consistent with the plugin and the install copy", () => {
    expect(RELEASE.pluginVersion).toBe(pluginVersion);
    expect(RECEIPT.pluginVersion).toBe(pluginVersion);
    expect(RECEIPT.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(RECEIPT.passed).toBe(RECEIPT.total);
    expect(RECEIPT.total).toBeGreaterThan(0);
    expect(INSTALL.claudeMarketplace.testedVersion).toBe(RECEIPT.claude);
    expect(RECEIPT.groups.length).toBeGreaterThanOrEqual(4);
  });

  it("covers every shipped capability the issue lists, each with evidence", () => {
    const ids = SHIPPED.map((item) => item.id);
    for (const id of ["summon", "retrieval", "benchmark", "arbor", "fail-closed", "clean-room", "mcp", "reference", "permissions", "plugin"]) {
      expect(ids).toContain(id);
    }
    for (const item of SHIPPED) {
      expect(item.claim.length, item.id).toBeGreaterThan(40);
      expect(item.proof.length, `${item.id} has no evidence line`).toBeGreaterThan(30);
    }
  });
});

describe("the research stays PROVISIONAL where the evidence says so (#174)", () => {
  it("states every boundary the issue names, in plain words", () => {
    const text = NOT_CLAIMED.map((item) => `${item.title} ${item.body}`).join("\n");
    expect(text).toMatch(/INV-10 stands, unmet/);
    expect(text).toMatch(/relevance-only/i);
    expect(text).toMatch(/reported, not applied/i);
    expect(text).toMatch(/inconclusive/i);
    expect(text).toMatch(/not positive evidence/i);
    expect(text).toMatch(/stamps are not built/i);
    expect(text).toMatch(/provisional/i);
  });

  it("does not delete the PROVISIONAL markers", () => {
    expect(LADDER_WIP).toMatch(/provisional/i);
    expect(site("src/surfaces/Landing.tsx")).toMatch(/PROVISIONAL/);
    expect(site("src/surfaces/Live.tsx")).toMatch(/PROVISIONAL/);
    expect(site("src/product.ts")).toMatch(/PROVISIONAL \(the research, not the tool\)/);
    expect(STAMP_ROUTING_NOTE).toMatch(/not built/i);
    expect(STAMP_ROUTING_NOTE).toMatch(/relevance/i);
  });

  it("never claims what the product does not do", () => {
    const everything = [
      site("src/release.ts"),
      site("src/surfaces/Live.tsx"),
      NOT_CLAIMED.map((i) => i.body).join(" "),
    ].join("\n");
    for (const claim of [
      /INV-10 (is|has been) (met|satisfied)/i,
      /behaviou?r-aware composition (is|has been) (delivered|shipped|live)/i,
      /arbor (now )?(changes|moves|reorders|reranks) (the )?(composition|ranking|selection)/i,
      /inconclusive (record )?(is|was) (positive|a success|an endorsement)/i,
      /stamp-gated routing is (running|live|operational)/i,
      /entropy curve (has been|was) plotted/i,
    ]) {
      expect(everything).not.toMatch(claim);
    }
  });

  it("qualifies the standing dose as a historical measurement", () => {
    expect(DOSES.scope).toMatch(/before the bundled summon MCP/);
    expect(site("src/surfaces/Landing.tsx")).toContain("{DOSES.scope}");
    expect(site("src/surfaces/Landing.tsx")).toContain("STANDING DOSE · MEASURED (HISTORICAL)");
  });
});

describe("no stale pre-#169 authority language (#174)", () => {
  const bannedHere = [/auto-?summon/i, /autonomous/i, /\barmed\b/i, /standing instruction/i, /preauthoriz/i];

  it("surface blurbs describe per-use calls, not standing automation", () => {
    for (const surface of SURFACES) {
      for (const pattern of bannedHere) expect(surface.blurb, `${surface.id}: ${pattern}`).not.toMatch(pattern);
    }
    expect(SURFACES.find((s) => s.id === "heaven")!.blurb).toMatch(/judged per use/);
    expect(SURFACES.find((s) => s.id === "hell")!.blurb).toMatch(/judged per use/);
  });

  it("the landing page, the production page and the product constants carry none of it", () => {
    for (const file of ["src/surfaces/Landing.tsx", "src/surfaces/Live.tsx", "src/product.ts", "src/release.ts"]) {
      const text = site(file)
        // Comments may NAME the banned words in order to ban them.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const pattern of bannedHere) expect(text, `${file}: ${pattern}`).not.toMatch(pattern);
      for (const phrase of AUTHORITY_PHRASES) {
        if (phrase === "armed" || phrase === "verbatim") continue; // `armed` handled above; `verbatim` is provenance wording
        expect(text.toLowerCase(), `${file} contains "${phrase}"`).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("the plugin's public descriptions make no unmeasured promise", () => {
    for (const rel of [".claude-plugin/marketplace.json", "plugins/skill-heaven/plugin.json", "plugins/skill-heaven/.claude-plugin/plugin.json", "plugins/skill-heaven/.codex-plugin/plugin.json"]) {
      expect(read(rel), rel).not.toMatch(/prompt[- ]cache|eliminat|autonomous|token waste|token overhead|working prototype/i);
    }
  });

  it("the licence on the page matches the only machine-readable declaration", () => {
    expect(SITE.licence).toBe(JSON.parse(read("plugins/skill-heaven/plugin.json")).license);
    // …and a LICENSE file now backs it (the repo had none).
    expect(read("LICENSE")).toMatch(/^MIT License/);
    expect(JSON.parse(read("package.json")).license).toBe(SITE.licence);
  });
});
