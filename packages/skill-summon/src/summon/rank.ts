import type { NamedSkill } from "../domain/types.js";
import { isSummonable, scoreMatch } from "../service.js";
import { trustFields, trustScore } from "../trust.js";

/**
 * A lone half-weight substring hit in a description is not a match — it is
 * noise. `scoreMatch` awards weight/2 for any substring occurrence, so a
 * bare `> 0` test admits nearly the whole registry.
 */
const MIN_RELEVANCE = 6;

/** Candidates below this fraction of the best score are too far off-topic. */
const RELEVANCE_BAND = 0.5;

export type RankingSummary = {
  mode: "trust-then-relevance" | "relevance-only";
  trustFields: string[];
  disclosure: string;
};

export type SummonSurface = "any" | "heaven" | "hell";

export type RankedCandidates = {
  candidates: NamedSkill[];
  ranking: RankingSummary;
};

/** Back-compatible candidate-only interface. */
export function rankCandidates(
  candidates: readonly NamedSkill[],
  query: string,
): NamedSkill[] {
  return rankCandidatesWithDetails(candidates, query).candidates;
}

/**
 * Relevance gates candidates. Comparable tree-published trust dimensions then
 * order the on-topic band; when none exist, relevance alone orders it and the
 * returned disclosure says so explicitly.
 */
export function rankCandidatesWithDetails(
  candidates: readonly NamedSkill[],
  query: string,
  surface: SummonSurface = "hell",
): RankedCandidates {
  const fleet = candidates.some((skill) => skill.origin === "fleet");
  const scored = candidates
    .filter((skill) => allowedOnSurface(skill, surface))
    .filter(isSummonable)
    .map((skill) => ({ skill, relevance: relevanceScore(skill, query) }))
    .filter(({ relevance }) => relevance >= MIN_RELEVANCE);

  if (scored.length === 0) {
    return {
      candidates: [],
      ranking: relevanceOnlyRanking(fleet),
    };
  }

  const best = Math.max(...scored.map(({ relevance }) => relevance));
  const onTopic = scored.filter(
    ({ relevance }) => relevance >= best * RELEVANCE_BAND,
  );
  const fieldOrder = comparableTrustFields(onTopic.map(({ skill }) => skill));

  onTopic.sort((left, right) => {
    for (const field of fieldOrder) {
      const leftScore = fieldScore(left.skill, field);
      const rightScore = fieldScore(right.skill, field);
      if (leftScore !== rightScore) return rightScore - leftScore;
    }
    return right.relevance - left.relevance;
  });

  return {
    candidates: onTopic.map(({ skill }) => skill),
    ranking:
      fieldOrder.length === 0
        ? relevanceOnlyRanking(fleet)
        : {
            mode: "trust-then-relevance",
            trustFields: fieldOrder,
            disclosure: `Tree-published trust (${fieldOrder.join(", ")}) orders candidates within the relevance band; relevance breaks ties.`,
          },
  };
}

function comparableTrustFields(skills: readonly NamedSkill[]): string[] {
  const fields = new Set<string>();
  for (const skill of skills) {
    for (const [key, value] of Object.entries(trustFields(skill))) {
      if (trustScore(key, value) !== undefined) fields.add(key);
    }
  }
  return [...fields];
}

function fieldScore(skill: NamedSkill, field: string): number {
  const value = trustFields(skill)[field];
  if (value === undefined) return Number.NEGATIVE_INFINITY;
  return trustScore(field, value) ?? Number.NEGATIVE_INFINITY;
}

function relevanceOnlyRanking(fleet = false): RankingSummary {
  return {
    mode: "relevance-only",
    trustFields: [],
    disclosure: fleet
      ? "Flat fleet: the agent query routes SKILL.md name and description metadata by relevance; no generic map or tree trust ordering is active."
      : "Tree published no comparable trust signals; candidates are ranked by relevance only.",
  };
}

function allowedOnSurface(skill: NamedSkill, surface: SummonSurface): boolean {
  const invocation = skill.invocation ?? "any";
  if (surface === "heaven") return invocation !== "model";
  if (surface === "hell") return invocation !== "human";
  return true;
}

/**
 * Exported for `test/index-parity.test.ts`, which pins these weights to
 * `skill-zero`'s `baselineRelevance`. The benchmark's baseline number is only
 * the product's number while the two agree.
 */
export function relevanceScore(skill: NamedSkill, query: string): number {
  return scoreMatch(query, [
    [skill.name, 12],
    [skill.id, 10],
    [skill.title ?? "", 10],
    [skill.catalogRef ?? "", 8],
    [skill.genericSkillRef ?? "", 8],
    [skill.tags.join(" "), 6],
    [skill.description, 3],
  ]);
}
