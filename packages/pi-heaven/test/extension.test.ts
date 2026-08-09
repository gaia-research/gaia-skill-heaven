import { describe, expect, it } from "vitest";
import {
  renderHellChooser,
  renderSummonedCard,
  rungBudgets,
} from "../src/hell-presentation.js";

describe("pi Skill Hell presentation", () => {
  it("shares the founder-ruled chooser and bounded budgets", () => {
    expect(rungBudgets).toEqual({
      high: { count: 1, relevance: "up to 1 result" },
      xhigh: { count: 3, relevance: "up to 3 results; no score band yet" },
      max: { count: 5, relevance: "up to 5 results; no score band yet" },
    });
    const chooser = renderHellChooser();
    expect(chooser).toContain("● high    default");
    expect(chooser).toContain("⊘ ultra   UNRATIFIED");
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
