import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assertSkillIndex, type SkillIndex } from "../src/retrieval/schema.js";

// Partial expansion coverage is not a partial win — it is a regression for the
// part of the corpus that has not been reached. Measured: unexpanded gold
// targets fall from 0.263 to 0.045 MRR while expanded ones rise to ~0.69.
// Two ranking-side mitigations were tried and neither worked (see the note on
// `fieldPresenceNormalization`), because expansion gives a document vocabulary
// an unexpanded one does not have and that vocabulary is what the query
// matches.
//
// So coverage is a hard requirement, and this test is what makes it one. A
// corpus refresh that adds skills without an expansion pass fails here rather
// than silently demoting every new skill in the tree.

const MINIMUM_COVERAGE = 0.95;

describe("expansion coverage", () => {
  const index = loadIndex();

  it(`covers at least ${MINIMUM_COVERAGE * 100}% of the corpus`, () => {
    const coverage = index.stats.expandedDocs / index.stats.docs;
    expect(
      coverage,
      `Expansion coverage is ${(coverage * 100).toFixed(1)}% (${index.stats.expandedDocs}/${index.stats.docs}).\n` +
        "Skills without expansions are DEMOTED, not merely un-boosted, so a partial index makes\n" +
        "the uncovered skills harder to summon than before expansion existed.\n\n" +
        "Find what needs regenerating:  npx tsx packages/core/scripts/expansion-plan.ts --emit-batches 6",
    ).toBeGreaterThanOrEqual(MINIMUM_COVERAGE);
  });

  it("carries the fingerprint each expansion was written from, so drift is detectable", () => {
    const expanded = index.docs.filter((doc) => doc.retrieval.expansions.length > 0);
    const fingerprinted = expanded.filter((doc) => doc.retrieval.expandedFrom !== undefined);
    expect(fingerprinted.length).toBe(expanded.length);
  });

  it("reports stale expansions rather than silently ranking on out-of-date text", () => {
    expect(typeof index.stats.staleExpansions).toBe("number");
    // Stale expansions still rank — they are out of date, not wrong, and
    // dropping them would re-create the coverage hole they were written to fill.
    expect(index.stats.staleExpansions).toBeLessThanOrEqual(index.stats.expandedDocs);
  });
});

function loadIndex(): SkillIndex {
  const raw = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "plugins", "skill-heaven", "data", "skill-index.json"),
      "utf8",
    ),
  );
  assertSkillIndex(raw);
  return raw;
}
