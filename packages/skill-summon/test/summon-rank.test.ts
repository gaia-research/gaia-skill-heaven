import { describe, expect, it } from "vitest";

import { namedRegistrySchema } from "../src/data/schemas.js";
import type { NamedSkill } from "../src/domain/types.js";
import { rankCandidatesWithDetails } from "../src/summon/rank.js";
import { displayTrustFields, trustFields } from "../src/trust.js";

describe("tree-provided summon trust", () => {
  it("accepts a tree with no Gaia trust fields and discloses relevance-only ranking", () => {
    const parsed = namedRegistrySchema.parse({
      generatedAt: "2026-08-07T00:00:00Z",
      buckets: {
        review: [skill("fixture/exact-review", "Code Review", "code review")],
      },
    });
    const candidates = Object.values(parsed.buckets).flat();

    const result = rankCandidatesWithDetails(candidates, "code review");

    expect(result.candidates[0]?.id).toBe("fixture/exact-review");
    expect(result.ranking).toEqual({
      mode: "relevance-only",
      trustFields: [],
      disclosure:
        "Tree published no comparable trust signals; candidates are ranked by relevance only.",
    });
    expect(result.candidates[0]?.level).toBeUndefined();
  });

  it("orders by a never-before-seen comparable trust dimension", () => {
    const lower = skill("fixture/lower", "Review Lower", "code review");
    lower.trust = { assuranceIndex: { value: "bronze", score: 2 } };
    const higher = skill("fixture/higher", "Review Higher", "code review");
    higher.trust = { assuranceIndex: { value: "aurora", score: 9 } };

    const result = rankCandidatesWithDetails([lower, higher], "code review");

    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      "fixture/higher",
      "fixture/lower",
    ]);
    expect(result.ranking.mode).toBe("trust-then-relevance");
    expect(result.ranking.trustFields).toEqual(["assuranceIndex"]);
    expect(displayTrustFields(trustFields(higher))).toEqual([
      { key: "assuranceIndex", label: "Assurance Index", value: "aurora" },
    ]);
  });

  it("keeps human-led skills out of automatic Hell routing", () => {
    const human = skill("fixture/human", "Review Human", "code review");
    human.invocation = "human";
    human.origin = "fleet";
    const model = skill("fixture/model", "Review Model", "code review");
    model.invocation = "model";
    model.origin = "fleet";

    expect(
      rankCandidatesWithDetails([human, model], "code review").candidates.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["fixture/model"]);
    expect(
      rankCandidatesWithDetails([human, model], "code review", "hell").candidates.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["fixture/model"]);
    expect(
      rankCandidatesWithDetails([human, model], "code review", "heaven").candidates.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["fixture/human"]);
    expect(
      rankCandidatesWithDetails([human, model], "code review", "any").candidates,
    ).toHaveLength(2);
  });

  it("displays a string rank but does not pretend it has ordering semantics", () => {
    const candidate = skill("fixture/ranked", "Ranked Review", "code review");
    candidate.trust = { rank: "curator-pick" };

    const result = rankCandidatesWithDetails([candidate], "code review");

    expect(result.ranking.mode).toBe("relevance-only");
    expect(displayTrustFields(trustFields(candidate))).toEqual([
      { key: "rank", label: "Rank", value: "curator-pick" },
    ]);
  });
});

function skill(id: string, name: string, description: string): NamedSkill {
  return {
    id,
    name,
    contributor: "fixture",
    genericSkillRef: "review",
    status: "named",
    description,
    tags: ["code", "review"],
    links: {
      github:
        "https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md",
    },
    evidence: [],
  };
}
