// #240 — a query that names a skill and adds descriptive words must resolve it
// by name, not die under the relevance floor. Fuzzy discovery must not move.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import { buildSkillIndex, sha256 } from "../src/retrieval/build-index.js";
import { decide, type SummonSurface } from "../src/retrieval/decide.js";
import { assertSkillIndex, type SkillIndex } from "../src/retrieval/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const link = "https://github.com/a/b/blob/main/SKILL.md";

function skill(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    contributor: id.split("/")[0] as string,
    description: `${name} helps with frontend interface design typography layout.`,
    tags: ["design"],
    links: { github: link },
    ...extra,
  };
}

function makeIndex(skills: ReturnType<typeof skill>[], floor = 1000): SkillIndex {
  const index = buildSkillIndex({
    projection: { buckets: { bucket: skills as never } },
    source: "https://example.test",
    sourceDigest: sha256("x"),
    builderVersion: "test/0.0.0",
    generatedAt: "2026-11-06T00:00:00.000Z",
  });
  index.stats.floor = floor; // absurdly high: only the explicit-name path can answer
  return index;
}

const index = makeIndex([
  skill("pbakaus/impeccable", "Impeccable"),
  skill("other/browse", "Browse"),
  skill("third/browse", "Browse"),
  skill("someone/review", "Review"),
  skill("x/layout-kit", "Layout Kit"),
  ...[1, 2, 3, 4].map((n) => skill(`rev/helper${n}`, `Helper${n}`, { description: "Reviews things and does a review of code review." })),
  skill("t/teach", "Teach", { description: "Mentoring." }),
  skill("p/pandas", "Pandas", { description: "Teach me dataframes: teach teach teach dataframe teaching tutorial.", tags: ["teach", "dataframe"] }),
  skill("hum/teachy", "Teachy", { invocation: "human" }),
  skill("hum/modelonly", "Modelonly", { invocation: "model" }),
]);
const ranker = new Bm25fRanker(index);
const run = (query: string, surface: SummonSurface = "any") =>
  decide({ index, query, ranked: ranker.rank(query), surface });

describe("explicit-name resolution (#240)", () => {
  it("exact name plus descriptive words resolves, reports why, and never touches the floor", () => {
    const d = run("impeccable frontend design skill");
    expect(d.noMatch).toBeNull();
    expect(d.admitted.map((h) => h.doc.id)).toEqual(["pbakaus/impeccable"]);
    expect(d.admitted[0]?.matchedBy).toEqual({ key: "name", scope: "within-query" });
    expect(d.floor).toBe(1000);
  });

  it("exact owner/name id inside a longer query resolves by id", () => {
    const d = run("please use pbakaus/impeccable for the landing page");
    expect(d.admitted[0]?.doc.id).toBe("pbakaus/impeccable");
    expect(d.admitted[0]?.matchedBy).toEqual({ key: "id", scope: "within-query" });
  });

  it("whole-query name and id still resolve, now labelled", () => {
    expect(run("impeccable").admitted[0]?.matchedBy).toEqual({ key: "name", scope: "whole-query" });
    expect(run("pbakaus/impeccable").admitted[0]?.matchedBy).toEqual({ key: "id", scope: "whole-query" });
  });

  it("a multi-token name inside a longer query resolves", () => {
    expect(run("I want the layout kit skill please").admitted[0]?.doc.id).toBe("x/layout-kit");
  });

  it("ambiguous name: nothing admitted, all sharers listed", () => {
    for (const q of ["browse", "browse the web for docs"]) {
      const d = run(q);
      expect(d.admitted).toEqual([]);
      expect(d.noMatch?.reason).toBe("ambiguous_name");
      expect(d.noMatch?.topCandidates.map((c) => c.id).sort()).toEqual(["other/browse", "third/browse"]);
    }
    // the full id disambiguates
    expect(run("other/browse").admitted[0]?.doc.id).toBe("other/browse");
  });

  it("a missing id is an honest no-match, not a fuzzy neighbour", () => {
    const d = run("pbakaus/nonexistent");
    expect(d.admitted).toEqual([]);
    expect(d.noMatch?.reason).toBe("name_not_found");
    expect(d.noMatch?.topCandidates).toEqual([]);
    const missing = run("zzqx-nonexistent-skill");
    expect(missing.admitted).toEqual([]);
    expect(missing.noMatch).not.toBeNull();
  });

  it("a near-miss typo stays fuzzy (below the floor here), not name-resolved", () => {
    const d = run("impecable frontend design skill");
    expect(d.admitted).toEqual([]);
    expect(d.noMatch?.reason).toBe("below_floor");
  });

  it("a common-word name inside a longer query is NOT hijacked", () => {
    const d = run("review my pull request");
    expect(d.admitted.every((h) => h.matchKind !== "exact")).toBe(true);
  });

  it("a single-token name that does not lead the query stays fuzzy", () => {
    const d = run("use impeccable for design");
    expect(d.admitted.every((h) => h.matchKind !== "exact")).toBe(true);
  });

  it("a leading rare single-token name that is NOT BM25F rank 1 stays fuzzy", () => {
    const q = "teach me dataframes teach teach tutorial";
    const ranked = ranker.rank(q);
    expect(ranked[0]?.doc.id).not.toBe("t/teach");
    expect(ranked.some((h) => h.matchKind === "exact")).toBe(false);
    expect(run(q).noMatch?.reason).toBe("below_floor");
  });

  it("respects the lane: a named human-led skill on surface hell is withheld with a reason", () => {
    const d = run("teachy for my team", "hell");
    expect(d.admitted).toEqual([]);
    expect(d.noMatch?.reason).toBe("all_filtered");
    expect(d.filtered[0]?.why).toMatch(/surface:hell excludes human-led/);
    expect(run("teachy for my team", "heaven").admitted[0]?.doc.id).toBe("hum/teachy");
    expect(run("modelonly for my team", "heaven").noMatch?.reason).toBe("all_filtered");
  });

  it("respects the installability check: an unreachable named skill is withheld", () => {
    const bad = makeIndex([skill("a/ghostly", "Ghostly", { links: { github: "https://github.com/a/b" } })]);
    const r = new Bm25fRanker(bad);
    const q = "ghostly frontend design skill";
    const d = decide({ index: bad, query: q, ranked: r.rank(q) });
    expect(d.admitted).toEqual([]);
    expect(d.noMatch?.reason).toBe("all_filtered");
  });
});

describe("explicit-name path against the committed index", () => {
  const real = JSON.parse(
    readFileSync(join(here, "..", "..", "..", "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
  ) as unknown;
  assertSkillIndex(real);
  const realRanker = new Bm25fRanker(real);

  it("reproduces #240 offline: the named query resolves pbakaus/impeccable although the floor is above its score", () => {
    const q = "impeccable frontend design skill";
    const d = decide({ index: real, query: q, ranked: realRanker.rank(q), surface: "any" });
    expect(real.stats.floor).toBeGreaterThan(27);
    expect(d.noMatch).toBeNull();
    expect(d.admitted.map((h) => h.doc.id)).toEqual(["pbakaus/impeccable"]);
  });

  it("no gold or unanswerable benchmark query is captured by the name path (fuzzy unchanged)", () => {
    const bench = join(here, "..", "bench");
    for (const file of ["gold.jsonl", "unanswerable.jsonl"]) {
      const rows = readFileSync(join(bench, file), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { query: string });
      for (const { query } of rows) {
        expect(realRanker.rank(query).some((h) => h.matchKind === "exact"), query).toBe(false);
      }
    }
  });
});
