// The shipped baseline, expressed against the index so the benchmark can score
// it (PLAN 0.4). This is a faithful restatement of
// `packages/skill-summon/src/summon/rank.ts` as it stands before Phase 1 —
// same field weights, same `MIN_RELEVANCE`, same `RELEVANCE_BAND`, same
// installability filter. `packages/skill-summon/test/index-parity.test.ts`
// pins the two together so the number the benchmark publishes is the number
// the product produces.

import { scoreMatch } from "./lexical.js";
import type { ScoredSkill } from "./bm25f.js";
import type { IndexedSkill, SkillIndex } from "./schema.js";

/** `rank.ts` — a lone half-weight substring hit in a description is noise. */
export const BASELINE_MIN_RELEVANCE = 6;
/** `rank.ts` — candidates below this fraction of the best score are off-topic. */
export const BASELINE_RELEVANCE_BAND = 0.5;

export function baselineRelevance(doc: IndexedSkill, query: string): number {
  return scoreMatch(query, [
    [doc.name, 12],
    [doc.id, 10],
    [doc.title ?? "", 10],
    [doc.catalogRef ?? "", 8],
    [doc.genericSkillRef ?? "", 8],
    [doc.tags.join(" "), 6],
    [doc.description, 3],
  ]);
}

export type BaselineMode =
  /** Every document ordered by relevance — measures ordering ability alone. */
  | "raw"
  /** What `/summon` actually returns today: installable, above floor, in band. */
  | "shipped";

export function rankBaseline(
  index: SkillIndex,
  query: string,
  mode: BaselineMode = "shipped",
): ScoredSkill[] {
  const pool = mode === "shipped" ? index.docs.filter((doc) => doc.installable) : index.docs;
  const scored = pool
    .map((doc) => ({
      doc,
      score: baselineRelevance(doc, query),
      matchKind: "ranked" as const,
      matchedTerms: [],
    }))
    .filter(({ score }) => (mode === "shipped" ? score >= BASELINE_MIN_RELEVANCE : score > 0));

  scored.sort((left, right) => right.score - left.score || (left.doc.id < right.doc.id ? -1 : 1));
  if (mode === "raw" || scored.length === 0) return scored;

  const best = scored[0]?.score ?? 0;
  return scored.filter(({ score }) => score >= best * BASELINE_RELEVANCE_BAND);
}
