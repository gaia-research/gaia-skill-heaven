import type { ArborClaim, ProjectedSupport } from "./contract.js";
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
// THE ONE EFFECT. `direction` may move how much of the admitted set is
// materialized — the breadth cap — and nothing else. The ORDER of the admitted
// set is relevance's, is produced upstream, and is never reordered, rescored,
// filtered, or re-ranked here. A caller that finds `selectionChanged: true` on a
// relevance field has misread this file; the only field this file moves is
// breadth.
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

/** Per-member evidence, all of it read straight off published records. */
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
  /** True only when the caller-supplied matcher accepted a stated condition. */
  matched: boolean;
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
   * Direction lives in the Hell-Heaven lens, which projects
   * `unavailable-unsupported-payload` today: the payload contract is
   * research-owned and unpublished, so this consumer has no legal way to parse
   * a polarity, stamp, or magnitude out of it. Until the publisher ships that
   * payload, nothing supplies this, and the band abstains with
   * `direction-unavailable`.
   *
   * It is a parameter rather than a hardcoded null so the seam is testable now
   * and the HH publisher can fill it without reshaping this file.
   */
  resolveDirection?: ((members: readonly BandMemberEvidence[]) => BandDirection | null) | undefined;
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

  const matched = evidence.filter((item) => item.matched && item.governedCount > 0);
  if (matched.length === 0) {
    return abstain(
      base,
      "no-matching-claim",
      "Governed claims exist in this set, but none states a condition that matches this task. Absence of a matching claim is not evidence against a skill. The band is unchanged.",
    );
  }

  const conclusive = matched.filter((item) => item.support.some((s) => SUPPORT_GOVERNING.has(s)));
  if (conclusive.length === 0) {
    return abstain(
      base,
      "evidence-inconclusive",
      "The matching governed evidence is inconclusive: the curator recorded that the benchmark did not settle the question. This is an honest, expected answer and is reported as such. It is not read as support, and the band is unchanged.",
    );
  }

  const direction = options.resolveDirection?.(conclusive) ?? null;
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
        ? "Matching governed evidence supports a lower-entropy, narrower composition. Breadth is reduced toward Heaven. Relevance ordering and scores are untouched."
        : "Matching governed evidence supports a higher-entropy, broader composition. Breadth is widened toward Hell. Relevance ordering and scores are untouched.",
  };
}

function readMember(
  member: CompositionMember,
  matchesConditions?: (claim: ArborClaim) => boolean,
): BandMemberEvidence {
  const report = member.report;
  // Only a canonical, content-pinned join carries published claims. An
  // unpinned or version-mismatched member contributes absence, not a guess.
  const claims = report.join === "content-pinned" ? report.claims : [];
  const governed = claims.filter((claim) => claim.interpretationSource !== null);
  const support = [...new Set(governed.map((claim) => claim.support))].sort();
  const matched = matchesConditions
    ? governed.some((claim) => {
        try {
          return matchesConditions(claim) === true;
        } catch {
          // A throwing predicate is an unverifiable one. Treating it as a match
          // would be the single easiest way for this file to overreach.
          return false;
        }
      })
    : false;
  const state: EvidenceState =
    governed.length === 0
      ? "evidence-absent"
      : governed.every((claim) => claim.support === "inconclusive")
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
    matched,
  };
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
