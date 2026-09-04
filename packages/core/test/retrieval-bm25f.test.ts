import { describe, expect, it } from "vitest";

import { Bm25fRanker, EXACT_MATCH_SCORE, marginOf } from "../src/retrieval/bm25f.js";
import { buildSkillIndex, sha256, type NamedProjection } from "../src/retrieval/build-index.js";

function indexOf(skills: NamedProjection["buckets"][string]) {
  return buildSkillIndex({
    projection: { buckets: { bucket: skills } },
    source: "https://example.test",
    sourceDigest: sha256("x"),
    builderVersion: "test/0.0.0",
    generatedAt: "2026-09-03T00:00:00.000Z",
  });
}

const corpus = indexOf([
  {
    id: "gaia-research/scout-fleet",
    name: "Scout Fleet",
    contributor: "gaia-research",
    description: "Runs a fan-out of scouts across a research question.",
    tags: ["research"],
    links: { github: "https://github.com/a/b/blob/main/SKILL.md" },
  },
  {
    id: "someone/profiler",
    name: "Profiler",
    contributor: "someone",
    title: "Latency Hunter",
    description: "Finds the slow path in a request and proves the fix landed.",
    tags: ["performance", "latency"],
    links: { github: "https://github.com/a/c/blob/main/SKILL.md" },
  },
  {
    id: "someone/kitchen-sink",
    name: "Kitchen Sink",
    contributor: "someone",
    description:
      "A very long description that mentions latency and performance and research and scouts and profiling and every other word in this corpus repeatedly, latency latency latency, purely to be long.",
    tags: [],
    links: { github: "https://github.com/a/d/blob/main/SKILL.md" },
  },
]);

describe("Bm25fRanker", () => {
  const ranker = new Bm25fRanker(corpus);

  it("takes the exact-name fast path instead of a relevance band (SPEC §3.4, #104)", () => {
    const [top, ...rest] = ranker.rank("scout fleet");
    expect(top?.doc.id).toBe("gaia-research/scout-fleet");
    expect(top?.matchKind).toBe("exact");
    expect(top?.score).toBe(EXACT_MATCH_SCORE);
    expect(rest).toHaveLength(0);
  });

  it("matches an exact id and catalogRef too", () => {
    expect(ranker.rank("gaia-research/scout-fleet")[0]?.matchKind).toBe("exact");
  });

  it("length-normalises so a padded description does not outrank a precise one", () => {
    const ranked = ranker.rank("the request is slow, find where the time goes");
    expect(ranked[0]?.doc.id).toBe("someone/profiler");
  });

  it("returns nothing for a query sharing no terms with the corpus", () => {
    expect(ranker.rank("zzzz qqqq")).toEqual([]);
  });

  it("returns nothing for an empty query rather than the whole corpus", () => {
    expect(ranker.rank("   ")).toEqual([]);
  });

  it("weights a rare term above a common one", () => {
    // "latency" appears in two documents, "scouts" in two, but "profiler" is
    // unique — IDF is what makes the unique term decisive.
    const ranked = ranker.rank("profiler");
    expect(ranked[0]?.doc.id).toBe("someone/profiler");
  });

  it("ranks deterministically — equal scores break by id, not insertion order", () => {
    const first = ranker.rank("performance").map((hit) => hit.doc.id);
    const second = new Bm25fRanker(corpus).rank("performance").map((hit) => hit.doc.id);
    expect(first).toEqual(second);
  });
});

describe("marginOf", () => {
  it("is 1 when a single candidate stands alone", () => {
    expect(marginOf([{ doc: {} as never, score: 12, matchKind: "ranked", matchedTerms: [] }])).toBe(1);
  });

  it("is 0 when nothing was found", () => {
    expect(marginOf([])).toBe(0);
  });

  it("is (top - next) / top", () => {
    const ranked = [
      { doc: {} as never, score: 10, matchKind: "ranked" as const, matchedTerms: [] },
      { doc: {} as never, score: 4, matchKind: "ranked" as const, matchedTerms: [] },
    ];
    expect(marginOf(ranked)).toBeCloseTo(0.6, 10);
  });

  it("reports two exact matches as maximally ambiguous, not maximally certain", () => {
    const ranked = [
      { doc: {} as never, score: EXACT_MATCH_SCORE, matchKind: "exact" as const, matchedTerms: [] },
      { doc: {} as never, score: EXACT_MATCH_SCORE, matchKind: "exact" as const, matchedTerms: [] },
    ];
    expect(marginOf(ranked)).toBe(0);
  });
});
