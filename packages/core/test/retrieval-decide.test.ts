import { describe, expect, it } from "vitest";

import { Bm25fRanker, EXACT_MATCH_SCORE, type ScoredSkill } from "../src/retrieval/bm25f.js";
import { buildSkillIndex, sha256, type NamedProjection } from "../src/retrieval/build-index.js";
import { BAND, MARGIN, decide } from "../src/retrieval/decide.js";
import type { SkillIndex } from "../src/retrieval/schema.js";

function makeIndex(
  skills: NamedProjection["buckets"][string],
  floor: number | null = null,
): SkillIndex {
  const index = buildSkillIndex({
    projection: { buckets: { bucket: skills } },
    source: "https://example.test",
    sourceDigest: sha256("x"),
    builderVersion: "test/0.0.0",
    generatedAt: "2026-09-03T00:00:00.000Z",
  });
  index.stats.floor = floor;
  return index;
}

const installable = "https://github.com/a/b/blob/main/SKILL.md";

const index = makeIndex(
  [
    {
      id: "someone/profiler",
      name: "Profiler",
      contributor: "someone",
      description: "Finds the slow path in a request.",
      tags: ["latency"],
      links: { github: installable },
    },
    {
      id: "someone/unreachable",
      name: "Unreachable",
      contributor: "someone",
      description: "Also finds the slow path in a request.",
      tags: ["latency"],
      links: { github: "https://github.com/a/b" },
    },
    {
      id: "someone/human-only",
      name: "Human Only",
      contributor: "someone",
      invocation: "human",
      description: "A slow path skill a human must invoke.",
      tags: ["latency"],
      links: { github: installable },
    },
  ],
  10,
);

const ranker = new Bm25fRanker(index);
const query = "the request is slow";

describe("decide", () => {
  it("withholds uninstallable skills WITH a reason instead of dropping them silently", () => {
    const decision = decide({ index, query, ranked: ranker.rank(query) });
    const withheld = decision.filtered.find((entry) => entry.id === "someone/unreachable");
    expect(withheld?.why).toMatch(/not installable/);
    expect(decision.admitted.map((hit) => hit.doc.id)).not.toContain("someone/unreachable");
  });

  it("names the surface that excluded a candidate", () => {
    const decision = decide({ index, query, ranked: ranker.rank(query), surface: "hell" });
    expect(decision.filtered.find((entry) => entry.id === "someone/human-only")?.why).toBe(
      "surface:hell excludes human-led skills",
    );
  });

  it("refuses below the floor rather than returning the best of a bad set (#104)", () => {
    const strict = makeIndex(index.docs as never, 1_000);
    const decision = decide({ index: strict, query, ranked: ranker.rank(query) });
    expect(decision.admitted).toEqual([]);
    expect(decision.noMatch?.reason).toBe("below_floor");
    // The caller is shown what was close, so they can judge — not use.
    expect(decision.noMatch?.topCandidates[0]?.floor).toBe(1_000);
    expect(decision.noMatch?.suggestion).toMatch(/source/);
  });

  it("distinguishes no_candidates from all_filtered", () => {
    expect(decide({ index, query: "zzzz", ranked: ranker.rank("zzzz") }).noMatch?.reason).toBe(
      "no_candidates",
    );

    const allUninstallable = makeIndex([
      {
        id: "someone/unreachable",
        name: "Unreachable",
        contributor: "someone",
        description: "Finds the slow path in a request.",
        links: { github: "https://github.com/a/b" },
      },
    ]);
    const ranked = new Bm25fRanker(allUninstallable).rank(query);
    const decision = decide({ index: allUninstallable, query, ranked });
    expect(decision.noMatch?.reason).toBe("all_filtered");
    expect(decision.noMatch?.filtered).toHaveLength(1);
  });

  it("lets an exact match past the floor and the band entirely (SPEC §3.4)", () => {
    const strict = makeIndex(index.docs as never, 1_000);
    const decision = decide({ index: strict, query: "Profiler", ranked: ranker.rank("Profiler") });
    expect(decision.noMatch).toBeNull();
    expect(decision.admitted[0]?.doc.id).toBe("someone/profiler");
    expect(decision.admitted[0]?.score).toBe(EXACT_MATCH_SCORE);
  });

  it("drops candidates below BAND × topScore", () => {
    const ranked: ScoredSkill[] = [
      { doc: index.docs[1] as never, score: 100, matchKind: "ranked", matchedTerms: [] },
      { doc: index.docs[1] as never, score: 100 * BAND + 1, matchKind: "ranked", matchedTerms: [] },
      { doc: index.docs[1] as never, score: 100 * BAND - 1, matchKind: "ranked", matchedTerms: [] },
    ];
    expect(decide({ index, query, ranked }).admitted).toHaveLength(2);
  });

  it("flags ambiguity when the top two are within MARGIN", () => {
    const doc = index.docs.find((entry) => entry.installable) as never;
    const close: ScoredSkill[] = [
      { doc, score: 100, matchKind: "ranked", matchedTerms: [] },
      { doc, score: 100 * (1 - MARGIN / 2), matchKind: "ranked", matchedTerms: [] },
    ];
    expect(decide({ index, query, ranked: close }).ambiguous).toBe(true);

    const clear: ScoredSkill[] = [
      { doc, score: 100, matchKind: "ranked", matchedTerms: [] },
      { doc, score: 61, matchKind: "ranked", matchedTerms: [] },
    ];
    expect(decide({ index, query, ranked: clear }).ambiguous).toBe(false);
  });

  it("never invents a floor when the index has none calibrated", () => {
    const uncalibrated = makeIndex(index.docs as never, null);
    const decision = decide({ index: uncalibrated, query, ranked: ranker.rank(query) });
    expect(decision.floor).toBeNull();
    expect(decision.admitted.length).toBeGreaterThan(0);
  });
});
