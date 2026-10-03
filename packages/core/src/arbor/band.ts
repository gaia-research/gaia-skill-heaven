import type { ArborClaim, ArborFacet, ProjectedSupport } from "./contract.js";
import type { ArborSubjectReport } from "./consume.js";
import type { CompositionMember, CompositionRole } from "./composition.js";

// ---------------------------------------------------------------------------
// THE BAND JUDGMENT
//
// WHAT THIS FILE IS. The Heaven/Hell band judgment: the one place where
// accepted Arbor evidence is allowed to change COMPOSITION.
//
// The model, from docs/INTENT.md §6 and the ladder ruling in
// packages/core/src/compile.ts: Heaven and Hell are two directions along ONE
// quantity — skill entropy — and a single ladder is a product decision, not a
// reduction of a hidden multidimensional truth. Breadth is therefore not a
// degraded stand-in for behavior: it is the observable in which that one
// quantity manifests. Heaven (low·med) is low entropy, narrow, converging.
// Hell (high·xhigh·max) is high entropy, broad, exploring.
//
// WHAT THIS FILE DELIBERATELY IS NOT. It is not a ranking, a relevance score, a
// master behavioral score, or an adjustment to any relevance number. Nothing
// here computes a number, a weight, a threshold, or a magnitude, and nothing
// downstream of it should start: compile.ts carries that ruling in full.
//
// THE ONE PERMITTED EFFECT. A licensed `direction` may one day move how much of
// the admitted set is materialized — the breadth cap — and nothing else.
// TODAY IT MOVES NOTHING: no runtime consumer reads `band.direction`, and no
// legal resolver exists until the HH payload is published, so the judgment is
// reported, never applied. The ORDER of the admitted set is relevance's, is
// produced upstream, and is never reordered, rescored, filtered, or re-ranked
// here. A caller that finds `selectionChanged: true` on a relevance field has
// misread this file; breadth is the only field it may ever move, and it moves
// none today.
//
// ABSTENTION IS THE DEFAULT. Every path that cannot be justified from an
// accepted, content-pinned, governed, condition-matched record abstains, and
// says which of the reasons below applied. Absence is never negative evidence:
// no record, no match, and an inconclusive record are three different states and
// all three mean "this did not move the band."
//
// INCONCLUSIVE IS A FIRST-CLASS, NON-NEGATIVE STATE. `inconclusive` is an
// honest curator answer, and the program expects and embraces it. It is surfaced,
// not hidden — but it is NEVER laundered into support, and it can never license
// a direction. "We ran it and we do not know" is emphatically not "yes". The
// guard that keeps embracing inconclusive from decaying into not-mattering is
// exactly this: a runtime may read `inconclusive` as unknown, never as
// permitted. See `evidenceInconclusive` below and the tests that pin it.
// ---------------------------------------------------------------------------

/** The two directions along the one ladder. */
export const BAND_DIRECTION = ["converge", "explore"] as const;
export type BandDirection = (typeof BAND_DIRECTION)[number];

/**
 * Why no band was produced. These are DISCLOSED, not internal: a surface shows
 * the reason so that a reader can tell "nothing was measured" apart from
 * "something was measured and it was inconclusive".
 */
export const BAND_ABSTAIN = [
  /** No publication could be read at all. */
  "publication-unavailable",
  /** A publication was present but failed validation. */
  "publication-unreadable",
  /** Readable, but no member carries any governed claim. */
  "no-governed-claim",
  /** Governed claims exist, but none matched this task's stated conditions. */
  "no-matching-claim",
  /** The caller supplied no conditions matcher, so no claim can be matched. */
  "conditions-unverified",
  /** The only matched, governed evidence says `inconclusive`. */
  "evidence-inconclusive",
  /**
   * The governed evidence is usable, but no direction could be read from it,
   * because direction lives in the HH lens and that payload is not published.
   * This is the reason that applies today.
   */
  "direction-unavailable",
] as const;
export type BandAbstain = (typeof BAND_ABSTAIN)[number];

/** The three evidence states a member can be in. Mutually exclusive. */
export const EVIDENCE_STATE = [
  /** No claim, or no claim with a governed interpretation behind it. */
  "evidence-absent",
  /** Governed, and the governed answer is `inconclusive`. */
  "evidence-inconclusive",
  /** Governed, and the governed answer confirms, qualifies, or revises. */
  "evidence-governed",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATE)[number];

/**
 * ONE CLAIM, with the facts kept attached to it.
 *
 * This type exists because of a real laundering path found in review. Matching
 * and conclusiveness MUST be carried on the same claim. If they are collapsed
 * into per-member aggregates — a member-level `matched` flag from one claim and
 * a member-level `support` list from another — then a matched-but-inconclusive
 * claim can lend its match to an unrelated confirmed claim on the same skill and
 * license a direction. `inconclusive can never license a direction` is only true
 * while every fact below stays pinned to the claim that supplied it.
 */
export type BandClaimEvidence = {
  claimId: string;
  facet: ArborFacet;
  /** Governing support, verbatim. Never mapped to a direction. */
  support: ProjectedSupport;
  /** True only when the caller-supplied matcher accepted THIS claim's conditions. */
  matched: boolean;
  /** True when a separate governed interpretation set this support. */
  governed: boolean;
  declarationSource: string;
  interpretationSource: string | null;
};

/**
 * A matched, governed, conclusive claim — the ONLY thing a direction resolver
 * may ever be handed. Resolvers cannot see members, aggregates, or unmatched
 * claims, so there is no aggregate for a bad fact to travel through.
 */
export type ConclusiveEvidence = BandClaimEvidence & {
  memberId: string;
  role: CompositionRole;
};

/** Per-member evidence for the human surface. Aggregates, disclosed as such. */
export type BandMemberEvidence = {
  id: string;
  role: CompositionRole;
  join: ArborSubjectReport["join"];
  state: EvidenceState;
  claimCount: number;
  /** Claims carrying a non-null `interpretationSource`. */
  governedCount: number;
  /** Distinct governed support values, verbatim. Never mapped to a direction. */
  support: ProjectedSupport[];
  /** True when ANY governed claim on this member matched. Display only. */
  matched: boolean;
  /** Per-claim facts, claim-scoped. This is what the gates actually read. */
  claims: BandClaimEvidence[];
};

export type ArborBandJudgment = {
  /** Null unless every gate below is passed. */
  direction: BandDirection | null;
  abstained: BandAbstain | null;
  members: BandMemberEvidence[];
  /**
   * Always true. Breadth is the only thing this layer moves; relevance
   * ordering, scores, and admission are untouched. Stated as a field so no
   * surface can quietly imply otherwise.
   */
  relevanceUntouched: true;
  /** One sentence for a human surface. */
  disclosure: string;
};

export type ArborBandOptions = {
  /**
   * Matches a claim's free-text `conditions` against the CURRENT task.
   *
   * This layer cannot evaluate prose, so it never pretends to. Supplying this
   * predicate is how a caller asserts "this task is the situation this claim
   * describes". Omitting it abstains with `conditions-unverified`, which is the
   * correct default: an unmatched claim is not a weak match, it is no match.
   */
  matchesConditions?: ((claim: ArborClaim) => boolean) | undefined;
  /**
   * Resolves the direction the governed evidence licenses.
   *
   * Receives ONLY claims that are individually matched, governed, AND
   * conclusive. The same claim can appear more than once when one skill is
   * both a session record and a proposed member, so `evidence.length` is not a
   * count of anything and must never be read as one. There is no member-level aggregate in this signature on
   * purpose: an aggregate loses which claim supplied which fact, and that is
   * exactly how an unmatched confirmed claim gets laundered through a matched
   * inconclusive one.
   *
   * Direction lives in the Hell-Heaven lens, which projects
   * `unavailable-unsupported-payload` today: the payload contract is
   * research-owned and unpublished, so this consumer has no legal way to parse
   * a polarity, stamp, or magnitude out of it. Until the publisher ships that
   * payload, nothing supplies this, and the band abstains with
   * `direction-unavailable`.
   */
  resolveDirection?: ((evidence: readonly ConclusiveEvidence[]) => BandDirection | null) | undefined;
};

const SUPPORT_GOVERNING: ReadonlySet<ProjectedSupport> = new Set([
  "benchmark-confirmed",
  "benchmark-qualified",
  "benchmark-revised",
]);

/**
 * The band judgment for an actual proposed/session set.
 *
 * Order of gates matters and is fixed: publication, then evidence, then match,
 * then conclusiveness, then direction. The first failure is the disclosed
 * reason, and every gate is checked against CONTENT-PINNED members only.
 */
export function judgeArborBand(
  publicationState: "loaded" | "unavailable" | "unreadable",
  members: readonly CompositionMember[],
  options: ArborBandOptions = {},
): ArborBandJudgment {
  const evidence = members.map((member) => readMember(member, options.matchesConditions));
  const base = { members: evidence, relevanceUntouched: true as const };

  if (publicationState !== "loaded") {
    return abstain(
      base,
      publicationState === "unreadable" ? "publication-unreadable" : "publication-unavailable",
      "No Arbor publication could be read, so no member carries governed evidence. The band is unchanged and breadth is untouched.",
    );
  }

  if (evidence.every((item) => item.governedCount === 0)) {
    return abstain(
      base,
      "no-governed-claim",
      "No member of this set carries a governed Arbor claim. A claim only counts once a separate interpretation has set its support; an expert declaration on its own is not evidence. The band is unchanged.",
    );
  }

  if (!options.matchesConditions) {
    return abstain(
      base,
      "conditions-unverified",
      `${evidence.filter((i) => i.governedCount > 0).length} member(s) carry a governed claim, but this caller supplied no conditions matcher. Arbor does not evaluate prose conditions and does not guess at them, so no claim is treated as applicable here. The band is unchanged.`,
    );
  }

  const matched = evidence.flatMap((item) =>
    item.claims.filter((entry) => entry.matched && entry.governed).map((entry) => ({ ...entry, memberId: item.id, role: item.role })));
  if (matched.length === 0) {
    return abstain(
      base,
      "no-matching-claim",
      "Governed claims exist in this set, but none states a condition that matches this task. Absence of a matching claim is not evidence against a skill. The band is unchanged.",
    );
  }

  // Claim-scoped on purpose. A claim licenses a direction only when the SAME
  // claim both matched the task and carries conclusive governed support. The
  // cross-product of "matched by one claim" and "confirmed by another" is
  // exactly the laundering path review caught, so it is never formed.
  const conclusive = matched.filter((entry) => SUPPORT_GOVERNING.has(entry.support));
  if (conclusive.length === 0) {
    const inconclusiveMatched = matched.filter((entry) => entry.support === "inconclusive");
    return abstain(
      base,
      "evidence-inconclusive",
      inconclusiveMatched.length > 0
        ? "The matching governed evidence is inconclusive: the curator recorded that the benchmark did not settle the question. This is an honest, expected answer and is reported as such. It is not read as support, and the band is unchanged."
        : "No matched, governed claim carries conclusive support. The band is unchanged.",
    );
  }

  const direction = readDirection(options.resolveDirection, conclusive);
  if (direction === null) {
    return abstain(
      base,
      "direction-unavailable",
      `${conclusive.length} member(s) carry matching, governed, conclusive Arbor evidence, but no direction could be read from it. Direction lives in the Hell-Heaven lens, whose payload contract is not published. Arbor does not infer a polarity it was not given. The band is unchanged.`,
    );
  }

  return {
    ...base,
    direction,
    abstained: null,
    disclosure:
      direction === "converge"
        ? "Matching governed evidence licenses the converging, lower-entropy direction (toward Heaven). It may narrow breadth only; relevance ordering and scores are untouched."
        : "Matching governed evidence licenses the exploring, higher-entropy direction (toward Hell). It may widen breadth only; relevance ordering and scores are untouched.",
  };
}

/**
 * Runs the injected direction resolver and accepts only a value on the ladder.
 *
 * The resolver is a seam for a publisher that does not exist yet, so its output
 * is treated as untrusted input: a throw, `undefined`, or any value outside
 * `BAND_DIRECTION` is "no direction", never a direction. Letting an arbitrary
 * string through would publish a band the MCP schema and every surface reject.
 */
function readDirection(
  resolveDirection: ArborBandOptions["resolveDirection"],
  conclusive: readonly ConclusiveEvidence[],
): BandDirection | null {
  if (!resolveDirection) return null;
  let value: unknown;
  try {
    value = resolveDirection(conclusive);
  } catch {
    return null;
  }
  return (BAND_DIRECTION as readonly unknown[]).includes(value) ? (value as BandDirection) : null;
}

function readMember(
  member: CompositionMember,
  matchesConditions?: (claim: ArborClaim) => boolean,
): BandMemberEvidence {
  const report = member.report;
  // Only a canonical, content-pinned join carries published claims. An
  // unpinned or version-mismatched member contributes absence, not a guess.
  const source = report.join === "content-pinned" ? report.claims : [];
  const claims: BandClaimEvidence[] = source.map((claim) => {
    const governed = claim.interpretationSource !== null;
    return {
      claimId: claim.id,
      facet: claim.facet,
      support: claim.support,
      // Only a governed claim can be matched: an expert declaration has no
      // benchmark behind it, so matching one would launder a declaration into
      // governed evidence.
      matched: governed && safeMatch(matchesConditions, claim),
      governed,
      declarationSource: claim.declarationSource,
      interpretationSource: claim.interpretationSource,
    };
  });
  const governed = claims.filter((entry) => entry.governed);
  const support = [...new Set(governed.map((entry) => entry.support))].sort();
  const state: EvidenceState =
    governed.length === 0
      ? "evidence-absent"
      : governed.every((entry) => entry.support === "inconclusive")
        ? "evidence-inconclusive"
        : "evidence-governed";
  return {
    id: report.skillId,
    role: member.role,
    join: report.join,
    state,
    claimCount: claims.length,
    governedCount: governed.length,
    support,
    matched: governed.some((entry) => entry.matched),
    claims,
  };
}

/**
 * Runs a caller-supplied predicate without letting it throw its way into a
 * match. A predicate that blows up is an unverifiable one, and treating it as a
 * match would be the single easiest way for this file to overreach.
 */
function safeMatch(
  matchesConditions: ((claim: ArborClaim) => boolean) | undefined,
  claim: ArborClaim,
): boolean {
  if (!matchesConditions) return false;
  try {
    return matchesConditions(claim) === true;
  } catch {
    return false;
  }
}

function abstain(
  base: { members: BandMemberEvidence[]; relevanceUntouched: true },
  reason: BandAbstain,
  disclosure: string,
): ArborBandJudgment {
  return { ...base, direction: null, abstained: reason, disclosure };
}

/** One line per member, for a human surface. */
export function arborBandLines(judgment: ArborBandJudgment): string[] {
  const head =
    judgment.direction === null
      ? `Band: unchanged (abstained: ${judgment.abstained})`
      : `Band: ${judgment.direction}`;
  const lines = [head];
  for (const item of judgment.members) {
    const support = item.support.length ? item.support.join(", ") : "none";
    const matched = item.matched ? ", condition-matched" : "";
    lines.push(`  ${item.id} (${item.role}, ${item.join}): ${item.state}; ${item.governedCount}/${item.claimCount} governed; support ${support}${matched}`);
  }
  lines.push(`  ${judgment.disclosure}`);
  return lines;
}

// ---------------------------------------------------------------------------
// CONDITION MATCHING
//
// A claim's `conditions` is free prose, and this layer deliberately does not
// evaluate prose — it carries conditions verbatim and reports
// `conditionsEvaluated: false` forever. That is correct: pretending to read
// English would make every downstream surface quietly overreach.
//
// So matching is the CALLER's job, and this helper makes that explicit rather
// than leaving it implicit. A caller supplies a matcher to assert "the current
// task IS the situation this claim describes". The matcher is deliberately
// narrow and mechanical: it does not paraphrase, infer, or score. It asks for
// exact, caller-declared signal phrases, and requires the claim text to carry
// them verbatim.
//
// Why exact phrases rather than semantics: a matcher that "understands" the
// conditions is a matcher that will someday be wrong in a way nobody notices.
// Exact declared phrases fail closed — a claim whose wording drifts simply stops
// matching, which abstains honestly instead of quietly applying.
// ---------------------------------------------------------------------------

/**
 * Builds a matcher from caller-declared signal phrases.
 *
 * `signals` describes the CURRENT TASK, not the claim. A claim matches when it
 * states every signal the caller declared. Passing no signals yields a matcher
 * that matches nothing, which abstains with `no-matching-claim` — the correct
 * answer for a caller that has not described its task.
 */
export function conditionMatcher(signals: readonly string[]): (claim: ArborClaim) => boolean {
  const required = signals.map((signal) => signal.trim().toLowerCase()).filter((s) => s.length > 0);
  if (required.length === 0) return () => false;
  return (claim: ArborClaim) => {
    const text = claim.conditions.toLowerCase();
    return required.every((signal) => text.includes(signal));
  };
}
