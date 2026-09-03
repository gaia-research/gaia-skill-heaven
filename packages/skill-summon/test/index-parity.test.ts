import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BASELINE_MIN_RELEVANCE,
  BASELINE_RELEVANCE_BAND,
  assertSkillIndex,
  baselineRelevance,
  isInstallableLink,
  rankBaseline,
  type IndexedSkill,
  type SkillIndex,
} from "skill-zero";

import type { NamedSkill } from "../src/domain/types.js";
import { isInstallable } from "../src/service.js";
import { rankCandidatesWithDetails, relevanceScore } from "../src/summon/rank.js";

// The benchmark scores `skill-zero`'s restatement of today's ranker
// (packages/core/src/retrieval/baseline.ts). If that restatement drifts from
// what `/summon` actually runs, the baseline the whole plan is measured
// against stops meaning anything. This test is the pin.

const index = loadIndex();
const registry = index.docs.map(toNamedSkill);

const queries = [
  "make this API faster",
  "did anything break after my last change",
  "scout fleet",
  "I want to review a pull request the way a staff engineer would",
  "zzzz qqqq",
  "test",
];

describe("core baseline is the shipped ranker", () => {
  it("scores every document identically to rank.ts", () => {
    for (const query of queries) {
      for (const [position, doc] of index.docs.entries()) {
        expect(baselineRelevance(doc, query)).toBe(
          relevanceScore(registry[position] as NamedSkill, query),
        );
      }
    }
  });

  it("admits exactly the same candidate set as rank.ts", () => {
    for (const query of queries) {
      const shipped = rankCandidatesWithDetails(registry, query, "any").candidates.map(
        (skill) => skill.id,
      );
      const measured = rankBaseline(index, query, "shipped").map((hit) => hit.doc.id);
      expect([...measured].sort()).toEqual([...shipped].sort());
    }
  });

  it("keeps the same gate constants", () => {
    expect(BASELINE_MIN_RELEVANCE).toBe(6);
    expect(BASELINE_RELEVANCE_BAND).toBe(0.5);
  });

  it("agrees with the runtime on which skills are installable", () => {
    for (const [position, doc] of index.docs.entries()) {
      expect(isInstallableLink(doc.links)).toBe(isInstallable(registry[position] as NamedSkill));
      expect(doc.installable).toBe(isInstallable(registry[position] as NamedSkill));
    }
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

function toNamedSkill(doc: IndexedSkill): NamedSkill {
  return {
    id: doc.id,
    name: doc.name,
    ...(doc.title ? { title: doc.title } : {}),
    contributor: doc.contributor,
    ...(doc.genericSkillRef ? { genericSkillRef: doc.genericSkillRef } : {}),
    ...(doc.catalogRef ? { catalogRef: doc.catalogRef } : {}),
    status: "named",
    ...(doc.level ? { level: doc.level } : {}),
    description: doc.description,
    tags: doc.tags,
    links: { ...doc.links },
    evidence: [],
    origin: "tree",
  };
}
