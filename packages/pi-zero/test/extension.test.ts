import { describe, expect, it } from "vitest";
import {
  renderHellChooser,
  renderSummonedCard,
  HELL_RUNGS,
} from "../src/hell-presentation.js";

describe("pi Skill Hell presentation", () => {
  it("shares the founder-ruled chooser and bounded budgets", () => {
    // No counts anywhere: a rung names a direction and a position on the band,
    // not a number. And no relevance band — band filtering is not shipped, and
    // this surface used to claim otherwise.
    expect(HELL_RUNGS).toEqual(["high", "xhigh", "max"]);
    const chooser = renderHellChooser();
    expect(chooser).toContain("● high    explore · the band opens here");
    expect(chooser).toContain("○ ultra   the crown rung");
    // No counts on the chooser either: a rung names a direction, not a number.
    expect(chooser).not.toMatch(/\d+\s*skills?\s*\/\s*gap/);
    expect(chooser).not.toMatch(/UNRATIFIED/);
    expect(chooser).not.toMatch(/P2|gated/i);
  });

  it("renders cards without placeholders or a pasted body", () => {
    const card = renderSummonedCard({
      id: "card-probe",
      name: "Card probe",
      path: "/tmp/card-probe",
      fileCount: 2,
      totalSeconds: 0.01,
      cacheState: "warm",
      trustFields: { source: "probe", stars: 9 },
    });
    expect(card).toContain("summoned · Card probe");
    expect(card).toContain("source: probe");
    expect(card).toContain("stars: 9");
    expect(card).toContain("install: 0.01s · warm");
    expect(card).toContain("files: 2");
    expect(card).toContain("inspect: file://");
    expect(card).not.toMatch(/(^|\s)TM(\s|$)|n\/a|SKILL\.md body/im);
  });

  it("omits unpublished trust and unpaired cost", () => {
    const card = renderSummonedCard({ id: "plain", path: "/tmp/plain", totalSeconds: 2 });
    expect(card).not.toMatch(/trust|install:|n\/a/i);
  });
});
