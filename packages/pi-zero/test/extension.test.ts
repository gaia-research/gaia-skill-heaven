import { RUNG_SLOTS } from "skill-zero";
import { describe, expect, it } from "vitest";
import {
  renderHellChooser,
  renderSummonedCard,
  rungBudgets,
} from "../src/hell-presentation.js";

describe("pi Skill Hell presentation", () => {
  it("shares the founder-ruled chooser and bounded budgets", () => {
    // The counts now come from core's RUNG_SLOTS — one source of truth for the
    // whole line. There is deliberately no relevance band: band filtering is not
    // shipped, and this surface used to claim otherwise.
    expect(rungBudgets).toEqual({
      high: { count: RUNG_SLOTS.high },
      xhigh: { count: RUNG_SLOTS.xhigh },
      max: { count: RUNG_SLOTS.max },
    });
    expect([rungBudgets.high.count, rungBudgets.xhigh.count, rungBudgets.max.count]).toEqual([3, 4, 5]);
    const chooser = renderHellChooser();
    expect(chooser).toContain("● high    default");
    expect(chooser).toContain("○ ultra   the crown rung");
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
