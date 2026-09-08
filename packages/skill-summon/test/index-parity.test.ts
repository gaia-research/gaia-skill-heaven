import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BASELINE_MIN_RELEVANCE,
  BASELINE_RELEVANCE_BAND,
  assertSkillIndex,
  baselineRelevance,
  isInstallableLink,
  isReachable,
  rankBaseline,
  type IndexedSkill,
  type SkillIndex,
} from "skill-zero";

import type { NamedSkill } from "../src/domain/types.js";
import { isInstallable, isSummonable } from "../src/service.js";
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

  it("differs from rank.ts by exactly the two Phase 1 fixes, and by nothing else", () => {
    // `rankBaseline("shipped")` deliberately reproduces the ranker AS IT
    // SHIPPED. Phase 1 fixed two things about it, and exactly two:
    //   - a suite root carries no `links.github` of its own, so every suite
    //     was dropped; rank.ts now admits them;
    //   - the registry-only guard lives at the top level while `isInstallable`
    //     read `links.installable`, so a registry-only skill ranked, won, and
    //     was only refused inside installSingle; rank.ts now withholds it.
    // Any other divergence means the baseline has drifted.
    for (const query of queries) {
      const shipped = rankCandidatesWithDetails(registry, query, "any").candidates.map(
        (skill) => skill.id,
      );
      const measured = rankBaseline(index, query, "shipped").map((hit) => hit.doc.id);
      const onlyInShipped = shipped.filter((id) => !measured.includes(id));
      const onlyInMeasured = measured.filter((id) => !shipped.includes(id));

      for (const id of onlyInMeasured) {
        expect(index.docs.find((entry) => entry.id === id)?.registryOnly).toBe(true);
      }
      for (const id of onlyInShipped) {
        const doc = index.docs.find((entry) => entry.id === id);
        expect(doc?.installable).toBe(false);
        expect(doc?.registryOnly).toBe(false);
        expect(doc?.suiteComponents.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the same gate constants", () => {
    expect(BASELINE_MIN_RELEVANCE).toBe(6);
    expect(BASELINE_RELEVANCE_BAND).toBe(0.5);
  });

  it("agrees with the runtime on installability and on reachability", () => {
    for (const [position, doc] of index.docs.entries()) {
      const skill = registry[position] as NamedSkill;
      expect(isInstallableLink(doc.links)).toBe(isInstallable(skill));
      expect(doc.installable).toBe(isInstallable(skill));
      expect(isReachable(doc)).toBe(isSummonable(skill));
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
    ...(doc.suiteComponents.length > 0 ? { suiteComponents: doc.suiteComponents } : {}),
    ...(doc.registryOnly ? { installable: false } : {}),
    evidence: [],
    origin: "tree",
  };
}
