import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import { assertSkillIndex, type SkillIndex } from "../src/retrieval/schema.js";

// Expansions are INDEX DATA: ranked on, never displayed (SPEC §2.2). These
// assertions are the standing guard on that, plus on the two things a bad
// generation run would do — rewrite what the user reads, or smuggle
// instruction-shaped text into a surface an agent prints.

const index = loadIndex();

describe("the expansion surface", () => {
  it("never rewrites a contributor description", () => {
    const snapshot = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "bench", "corpus", "named-projection.json"), "utf8"),
    ) as {
      buckets: Record<string, Array<{ id: string; description?: string }>>;
      awaitingClassification?: Array<{ id: string; description?: string }>;
    };
    const upstream = new Map(
      [...Object.values(snapshot.buckets).flat(), ...(snapshot.awaitingClassification ?? [])].map(
        (skill) => [skill.id, skill.description ?? ""],
      ),
    );
    for (const doc of index.docs) {
      expect(doc.description).toBe(upstream.get(doc.id));
    }
  });

  it("keeps expansions out of every displayed field", () => {
    for (const doc of index.docs) {
      for (const expansion of doc.retrieval.expansions) {
        expect(doc.description).not.toContain(expansion);
        expect(doc.title ?? "").not.toContain(expansion);
        expect(doc.name).not.toContain(expansion);
      }
    }
  });

  it("carries the builder version that produced each batch, so a bad run is revertible", () => {
    for (const doc of index.docs) {
      if (doc.retrieval.expansions.length > 0) {
        expect(doc.retrieval.expandedBy).toBeTruthy();
      }
    }
  });

  it("contains no instruction-shaped text — these are search strings, not directives", () => {
    // A generated field that reaches a ranker is still generated text. It must
    // never be able to read as a directive if it is ever surfaced by mistake.
    const instructionShaped =
      /\b(ignore (all |any )?previous|disregard the|you must|system prompt|as an ai|<\/?script)\b/i;
    for (const doc of index.docs) {
      for (const expansion of doc.retrieval.expansions) {
        expect(expansion).not.toMatch(instructionShaped);
        expect(expansion).not.toMatch(/https?:\/\//);
      }
    }
  });

  it("ranks a skill higher with its expansions than without, when it has any", () => {
    const expanded = index.docs.filter((doc) => doc.retrieval.expansions.length > 0);
    if (expanded.length === 0) return; // no batch generated yet

    const stripped: SkillIndex = {
      ...index,
      docs: index.docs.map((doc) => ({
        ...doc,
        retrieval: { ...doc.retrieval, expansions: [], terms: [] },
      })),
    };
    const withExpansion = new Bm25fRanker(index);
    const without = new Bm25fRanker(stripped);

    const sample = expanded[0];
    const query = sample?.retrieval.expansions[0] ?? "";
    const rankOf = (ranker: Bm25fRanker) =>
      ranker.rank(query).findIndex((hit) => hit.doc.id === sample?.id);
    expect(rankOf(withExpansion)).toBeLessThanOrEqual(Math.max(rankOf(without), 0));
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
