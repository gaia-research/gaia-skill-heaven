// Pins the skill-entropy concept (docs/LADDER-FLOW.md, "What the ladder
// measures — skill entropy") in the two places a reader actually encounters
// it without opening that doc: the README hero SVG's alt text, and the header
// line every rendered rung command prints. Not every prose sentence — just
// the two surfaces most likely to silently drift back to the pre-N13 shape
// (the ladder generator that shipped `off`, nested `zero` inside Heaven, and
// called `high` "the default").

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readLadderData, renderLadder } from "../plugins/skill-heaven/scripts/render-ladder.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

function svgAriaLabel(): string {
  const svg = readFileSync(join(REPO, "docs", "assets", "entropy-ladder.svg"), "utf-8");
  const match = svg.match(/aria-label="([^"]*)"/);
  if (!match) throw new Error("docs/assets/entropy-ladder.svg has no aria-label attribute");
  return match[1];
}

describe("the entropy-ladder SVG alt text (README.md line 1)", () => {
  const label = svgAriaLabel();

  it("says what skill entropy is", () => {
    expect(label).toMatch(/skill.entropy/i);
    expect(label).toContain("skill variety and volume enters a session");
  });

  it("names all four bands", () => {
    for (const band of ["zero", "heaven", "hell", "ultra"]) {
      expect(label.toLowerCase(), `alt text omits ${band}`).toContain(band);
    }
  });

  it("never spells the floor rung `off` — it is `zero` (N13)", () => {
    expect(label).not.toMatch(/\boff\b/i);
  });

  it("never calls a rung THE default without the PROVISIONAL caveat", () => {
    // The pre-N13 generator called `high` "the default" outright. Representative
    // rungs may still be *named*, but never asserted as an unqualified default.
    expect(label).not.toMatch(/\bthe default\b/i);
  });

  it("keeps ultra to one simple line — no rung-vs-controller litigation", () => {
    expect(label).not.toMatch(/seventh selectable rung/i);
    expect(label).not.toMatch(/sub-ladder/i);
  });

  it("carries the N13 reachability claim, not a measured result", () => {
    expect(label).toMatch(/nothing on the line refuses|every rung is reachable/i);
    // Claim discipline (B4): no formula, no percentage, nothing "measured".
    expect(label).not.toMatch(/\d+%/);
    expect(label).not.toMatch(/measured|benchmarked/i);
  });
});

describe("the rendered ladder header names skill entropy", () => {
  const data = readLadderData();

  it("every rung command's header says the line reads as skill entropy", () => {
    for (const mode of ["zero", "heaven", "hell", "ultra"]) {
      const { text } = renderLadder({ mode, target: "", data, env: {}, manifest: null, detail: "full" });
      expect(text, `${mode} header omits skill entropy`).toMatch(/skill entropy/i);
    }
  });
});
