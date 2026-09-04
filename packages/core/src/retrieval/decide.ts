// L2 — decide: refuse, disambiguate, or answer (SPEC §4).
//
// The difference between a tool you trust and one you check. Today's ranker
// has no absolute floor, so a uniformly terrible field still produces a
// winner: `RELEVANCE_BAND` is relative to the best candidate, and the best of
// a bad set is still the best of that set. That is issue #104.

import { marginOf, type ScoredSkill } from "./bm25f.js";
import { isReachable } from "./build-index.js";
import type { IndexedSkill, SkillIndex } from "./schema.js";

/** Candidates below `BAND × topScore` are dropped from the result set. PROVISIONAL — SPEC §4.1. */
export const BAND = 0.6;

/** Top two within this normalised margin are ambiguous. PROVISIONAL — SPEC §4.3. */
export const MARGIN = 0.15;

export type SummonSurface = "any" | "heaven" | "hell";

/**
 * Which signal decided surface routing for a candidate (SPEC §8.1, PLAN 4.4).
 *
 * `arbor.polarity` replaces a contributor's claim with a measurement, so it
 * wins when present. It is absent everywhere today — no receipts exist — and
 * the fallback is the tree's `invocation` field, which is ALSO absent on all
 * 326 skills. So routing is currently doing nothing at all, and the honest
 * disclosure says exactly that rather than implying a lane was applied.
 */
export type RoutingSignal = "arbor.polarity" | "invocation" | "none";

export function routingSignalOf(doc: IndexedSkill): RoutingSignal {
  if (doc.arbor && doc.arbor.polarity !== "unknown") return "arbor.polarity";
  if (doc.invocation !== "any") return "invocation";
  return "none";
}

export type FilterReason = {
  id: string;
  name: string;
  why: string;
};

export type NoMatch = {
  reason: "no_candidates" | "below_floor" | "all_filtered";
  query: string;
  /** Shown so the caller can judge, not use. */
  topCandidates: Array<{ id: string; name: string; score: number; floor: number | null }>;
  filtered: FilterReason[];
  suggestion: string;
};

export type Decision = {
  /** Candidates that survived the surface filter, the floor and the band, best first. */
  admitted: ScoredSkill[];
  noMatch: NoMatch | null;
  /** `(top − next) / top` over the admitted set — the Ultra controller's signal. */
  margin: number;
  /** True when the top two are within `MARGIN` and a caller should be asked. */
  ambiguous: boolean;
  /** Everything withheld, with a reason. Unreachable skills vanish silently otherwise. */
  filtered: FilterReason[];
  floor: number | null;
  /**
   * What actually decided surface routing across the admitted set. `"none"`
   * means neither Arbor nor the tree published a lane and `surface` had no
   * effect — which is the case for the whole corpus today.
   */
  routing: RoutingSignal;
};

export type DecideOptions = {
  index: SkillIndex;
  query: string;
  ranked: readonly ScoredSkill[];
  surface?: SummonSurface | undefined;
  /** Where the candidates came from, for the `noMatch` suggestion. */
  source?: string | undefined;
};

export function decide({
  index,
  query,
  ranked,
  surface = "any",
  source,
}: DecideOptions): Decision {
  const floor = index.stats.floor;
  const filtered: FilterReason[] = [];
  const eligible: ScoredSkill[] = [];

  for (const hit of ranked) {
    const why = withholdReason(hit.doc, surface);
    if (why) filtered.push({ id: hit.doc.id, name: hit.doc.name, why });
    else eligible.push(hit);
  }

  const top = eligible[0];
  if (!top) {
    return noMatchDecision(
      query,
      ranked.length === 0 ? "no_candidates" : "all_filtered",
      ranked,
      filtered,
      floor,
      source,
      routingOf(ranked, surface),
    );
  }

  // An exact name/id/catalogRef hit skips the band and the floor entirely
  // (SPEC §3.4): "summon scout-fleet" must not go through a relevance band.
  if (top.matchKind === "exact") {
    const exact = eligible.filter((hit) => hit.matchKind === "exact");
    return {
      admitted: exact,
      noMatch: null,
      margin: marginOf(exact),
      ambiguous: exact.length > 1,
      filtered,
      floor,
      routing: routingOf(ranked, surface),
    };
  }

  if (floor !== null && top.score < floor) {
    return noMatchDecision(query, "below_floor", eligible, filtered, floor, source, routingOf(ranked, surface));
  }

  const admitted = eligible.filter((hit) => hit.score >= top.score * BAND);
  const margin = marginOf(admitted);
  return {
    admitted,
    noMatch: null,
    margin,
    ambiguous: admitted.length > 1 && margin < MARGIN,
    filtered,
    floor,
    routing: routingOf(ranked, surface),
  };
}

/**
 * The strongest signal available across everything the surface filter looked
 * at — not just what survived it. A skill excluded BY its lane is evidence
 * that a lane was in use, so reporting only the admitted set would say "none"
 * exactly when routing did the most work.
 */
function routingOf(considered: readonly ScoredSkill[], surface: SummonSurface): RoutingSignal {
  // `surface: "any"` applies no lane, so nothing routed — whatever was
  // published. Reporting a signal here would describe data that existed rather
  // than a decision that was made.
  if (surface === "any") return "none";
  const signals = new Set(considered.map((hit) => routingSignalOf(hit.doc)));
  if (signals.has("arbor.polarity")) return "arbor.polarity";
  if (signals.has("invocation")) return "invocation";
  return "none";
}

/**
 * Why a plausible skill was withheld. A caller who can see this can act; one
 * who cannot will assume the tool is broken (SPEC §4.2).
 */
function withholdReason(doc: IndexedSkill, surface: SummonSurface): string | null {
  if (doc.registryOnly) return "registry-only — the tree marks this skill installable: false";
  if (!isReachable(doc)) {
    return doc.links.github
      ? "not installable — links.github does not resolve to a SKILL.md"
      : "not installable — the tree publishes no links.github and no suiteComponents";
  }
  if (surface === "any") return null;

  // A measurement beats a claim: when Arbor has stamped a polarity it decides
  // the lane, and the contributor's `invocation` declaration is the fallback.
  const polarity = doc.arbor?.polarity;
  if (polarity === "heaven-native" && surface === "hell") {
    return "surface:hell excludes heaven-native skills (arbor.polarity)";
  }
  if (polarity === "hell-native" && surface === "heaven") {
    return "surface:heaven excludes hell-native skills (arbor.polarity)";
  }
  if (polarity !== undefined && polarity !== "unknown") return null;

  if (surface === "heaven" && doc.invocation === "model") {
    return "surface:heaven excludes model-led skills";
  }
  if (surface === "hell" && doc.invocation === "human") {
    return "surface:hell excludes human-led skills";
  }
  return null;
}

function noMatchDecision(
  query: string,
  reason: NoMatch["reason"],
  considered: readonly ScoredSkill[],
  filtered: FilterReason[],
  floor: number | null,
  source: string | undefined,
  routing: RoutingSignal,
): Decision {
  return {
    admitted: [],
    noMatch: {
      reason,
      query,
      topCandidates: considered.slice(0, 3).map((hit) => ({
        id: hit.doc.id,
        name: hit.doc.name,
        score: Math.round(hit.score * 10_000) / 10_000,
        floor,
      })),
      filtered,
      suggestion: suggestionFor(reason, source),
    },
    margin: 0,
    ambiguous: false,
    filtered,
    floor,
    // A refusal still reports what signal was available. Hardcoding "none"
    // here said "nothing routed this" precisely when routing may have been
    // what emptied the set.
    routing,
  };
}

function suggestionFor(reason: NoMatch["reason"], source: string | undefined): string {
  const where = source ? `\`${source}\`` : "the configured source";
  switch (reason) {
    case "no_candidates":
      return `No skill in ${where} shares any term with that query. Try naming the repo explicitly: summon(query, source: "owner/repo").`;
    case "below_floor":
      return `Nothing in ${where} scored above the calibrated relevance floor. The closest candidates are listed with their scores; none of them is a match. Try naming the repo explicitly: summon(query, source: "owner/repo").`;
    case "all_filtered":
      return `Every candidate in ${where} was withheld — see \`filtered\` for why. Most commonly the skill publishes no installable SKILL.md link.`;
  }
}
