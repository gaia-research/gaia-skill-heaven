// Joining a retrieval candidate to a published Arbor subject, and saying
// exactly what that join does and does not establish.
//
// This is where SPEC INV-4 (unknown is not negative) and INV-13 (say which
// lenses informed the decision, and which were absent) are actually enforced.
// Three rules shape every line of it:
//
//   * Identity is `id` AND exact content bytes. Upstream binds every Arbor
//     record to `{id, contentSha256}` of the canonical source file. An ID match
//     ALONE proves neither the source nor the current content context, so it
//     never yields a consulted lens — it yields UNKNOWN.
//   * Conditions travel with every claim. Matching an identity does not satisfy
//     a claim's stated conditions; this layer evaluates none of them and says so.
//   * Nothing here produces a score, a threshold, a ranking input, or a
//     pass/fail. There is no scalar in the output by construction (SPEC INV-1,
//     INV-3, §4.2).

import {
  ARBOR_LENSES,
  type ArborClaim,
  type ArborEdge,
  type ArborLensName,
  type ArborLensStatus,
  type ArborSubjectRef,
} from "./contract.js";
import {
  subjectKey,
  type ArborProblem,
  type ArborPublication,
  type ArborPublicationProvenance,
} from "./publication.js";

/**
 * What the consuming runtime knows about one candidate.
 *
 * `contentSha256` is the sha256 of the CANONICAL upstream source file's bytes —
 * the same pin Arbor binds to. It is NOT the digest of a materialized payload
 * directory and not the hash of the skill's own SKILL.md in its origin repo;
 * conflating those would manufacture a match that does not exist. When the
 * runtime cannot prove that pin it passes `null`, and the join stays unknown.
 */
export type ArborCandidate = {
  skillId: string;
  contentSha256: string | null;
  /**
   * True only when this candidate came from the same canonical source the
   * publication describes. A flat GitHub fleet or an explicitly overridden
   * source is a different corpus: an id collision there says nothing.
   */
  canonicalSource: boolean;
  /**
   * Why no content pin was available, in the caller's own words, when
   * `contentSha256` is null. Carried onto the unknown reason so a reader learns
   * WHICH unknown this is rather than a generic one.
   */
  identityNote?: string | undefined;
  /**
   * What, if anything, was actually delivered for this candidate. Kept strictly
   * apart from claim identity: proving which canonical record a claim belongs to
   * says nothing about the artifact that landed on disk.
   */
  delivery?: ArborDeliveryContext | undefined;
};

/**
 * The execution side of the question, which canonical identity does not answer.
 *
 * There is deliberately no "verified" value. The canonical Tree file a claim is
 * bound to is a registry record, not the SKILL.md a summon materializes, so no
 * byte comparison available today could promote a delivery to proven — and a
 * state this layer cannot reach is a state it must not name.
 */
export type ArborDeliveryContext =
  /** Nothing was materialized: a preview, or a refusal. */
  | "not-materialized"
  /**
   * A payload was materialized. It was NOT proven to be the canonical artifact
   * the claims are bound to, and its conditions were not evaluated.
   */
  | "delivered-unverified";

export type ArborJoin =
  /** `id` and exact content bytes both matched a published subject. */
  | "content-pinned"
  /** The id is published, but this runtime holds no provable content pin. */
  | "identity-unproven"
  /** This runtime holds a pin; the publication pins different bytes for that id. */
  | "subject-version-unmatched"
  /** The publication is readable and lists no subject with this id at all. */
  | "no-published-subject"
  /** The candidate is not from the canonical source this publication describes. */
  | "source-not-canonical"
  /** Nothing was published, or the publication could not be read. */
  | "publication-unavailable";

/**
 * What this consumer can honestly say about one lens.
 *
 * `absent` is reserved for a PROVEN subject whose lens upstream reports as
 * absent — evidence of non-observation, still never evidence of a negative.
 * Everything else that is not `consulted` is `unknown`.
 */
export type ArborLensAvailability = "consulted" | "absent" | "unknown";

export type ArborLensReport = {
  lens: ArborLensName;
  availability: ArborLensAvailability;
  /** The upstream lens status VERBATIM, or null when no pinned document was read. */
  upstreamStatus: ArborLensStatus | null;
  sourceDigest: string | null;
  /** One sentence naming what is and is not established. Never a verdict. */
  reason: string;
};

export type ArborInteractionReport = {
  /** The edge record VERBATIM, including its conditions and support. */
  edge: ArborEdge;
  /**
   * Edges are ORDERED. `subject-acts-on` means the subject is `pair.from`;
   * `acts-on-subject` means it is `pair.to`. These are different facts and are
   * never merged.
   */
  direction: "subject-acts-on" | "acts-on-subject";
  counterpart: ArborSubjectRef;
  /**
   * Upstream states plainly that publication-time `pairApplicable` is NOT
   * runtime assurance. Unless the caller proved the counterpart's current
   * bytes, this stays `unverified` and the edge is unknown-applicability.
   */
  counterpartPin: "verified" | "mismatched" | "unverified";
};

export type ArborSubjectReport = {
  skillId: string;
  contentSha256: string | null;
  canonicalSource: boolean;
  join: ArborJoin;
  /** The published subject this candidate was pinned to, when proven. */
  matchedSubject: ArborSubjectRef | null;
  lenses: Record<ArborLensName, ArborLensReport>;
  lensesConsulted: ArborLensName[];
  lensesAbsent: ArborLensName[];
  lensesUnknown: ArborLensName[];
  /**
   * Claims VERBATIM from the published profile. Populated only on a
   * content-pinned, `present` claims lens: every field upstream set is carried
   * through untouched, `conditions` included.
   */
  claims: readonly ArborClaim[];
  /** Subject-scoped interaction edges, verbatim, with their direction. */
  interactions: readonly ArborInteractionReport[];
  /**
   * True when a claim's conditions have been evaluated against the current
   * task. This layer evaluates none, so it is always false — stated as a field
   * so no surface can quietly imply otherwise.
   */
  conditionsEvaluated: false;
  /** Whether anything was delivered, and whether it was proven canonical. */
  deliveryContext: ArborDeliveryContext;
  problems: readonly ArborProblem[];
  /** One sentence for a human surface. */
  note: string;
};

export type ArborDisclosure = {
  publicationState: ArborPublication["state"];
  provenance: ArborPublicationProvenance | null;
  contracts: ArborPublication["contracts"];
  /** How many subjects the publication actually lists. Zero is a real answer. */
  subjectsPublished: number;
  /** How many edges the published edge set contains. */
  edgesPublished: number;
  /**
   * Upstream's own coverage note. `absenceMeaning: "not-evaluated"` is the
   * reason an empty edge set is not a finding about any pair.
   */
  edgeCoverage: { pairsEvaluated: number; absenceMeaning: string } | null;
  problems: readonly ArborProblem[];
  /** One sentence for a human surface (SPEC INV-13). */
  note: string;
};

export type ConsumeArborOptions = {
  /**
   * Canonical content pins the caller can prove for OTHER skills, used only to
   * check an interaction edge's counterpart endpoint. Production passes none.
   */
  knownContentSha256?: Readonly<Record<string, string>> | undefined;
};

/** The publication-level half of the disclosure (SPEC INV-13). */
export function describeArborPublication(publication: ArborPublication): ArborDisclosure {
  const subjectsPublished = publication.subjects.length;
  const edgesPublished = publication.edgeIndex?.edges.length ?? 0;
  const edgeCoverage = publication.edgeIndex
    ? { ...publication.edgeIndex.coverage }
    : null;

  let note: string;
  if (publication.state === "unavailable") {
    note =
      "no published projection is available to this runtime, so no behavioral lens was consulted. " +
      "That is unknown, not a clean bill of health.";
  } else if (publication.state === "unreadable") {
    note =
      "a publication was found but does not conform to the pinned contracts, so it was not consumed. " +
      "Treated as unknown and disclosed rather than partially read.";
  } else if (subjectsPublished === 0 && edgesPublished === 0) {
    note =
      "the canonical projection is published and EMPTY — 0 subjects, 0 interaction edges. " +
      "Upstream records that absence means not-evaluated, so nothing here is evidence about any skill.";
  } else {
    note =
      `canonical projection consulted — ${subjectsPublished} published subject(s), ` +
      `${edgesPublished} interaction edge(s). Absence of a record means not-evaluated.`;
  }
  if (publication.problems.length > 0) {
    note += ` ${publication.problems.length} publication defect(s) disclosed; the affected records were not consumed.`;
  }

  return {
    publicationState: publication.state,
    provenance: publication.provenance,
    contracts: publication.contracts,
    subjectsPublished,
    edgesPublished,
    edgeCoverage,
    problems: publication.problems,
    note,
  };
}

/**
 * Join one candidate to the publication and report what that establishes.
 *
 * Returns a report for every candidate, including candidates nothing is
 * published about — "we looked and there is nothing" is the answer INV-13 asks
 * for, and it is not the same answer as "we did not look".
 */
export function consumeArbor(
  publication: ArborPublication,
  candidate: ArborCandidate,
  options: ConsumeArborOptions = {},
): ArborSubjectReport {
  const join = resolveJoin(publication, candidate);
  const matchedSubject =
    join === "content-pinned" && candidate.contentSha256 !== null
      ? { id: candidate.skillId, contentSha256: candidate.contentSha256 }
      : null;
  const runtime = matchedSubject ? publication.runtimes.get(subjectKey(matchedSubject)) : undefined;

  const lenses = {} as Record<ArborLensName, ArborLensReport>;
  for (const lens of ARBOR_LENSES) {
    // A `present` claims lens whose profile did not survive validation — or was
    // quarantined for naming another subject — read NOTHING. Reporting it as
    // consulted would claim a lens informed a decision that in fact supplied no
    // record at all (SPEC INV-13), so the payload's readability is part of the
    // question, not just upstream's status word.
    const payloadUnreadable =
      lens === "claims" &&
      runtime?.lenses.claims.status === "present" &&
      runtime.lenses.claims.profile === null;
    lenses[lens] = reportLens(
      lens,
      join,
      runtime?.lenses[lens],
      candidate.identityNote,
      payloadUnreadable,
    );
  }

  const claimsLens = runtime?.lenses.claims;
  const claims =
    lenses.claims.availability === "consulted" && claimsLens?.profile
      ? claimsLens.profile.claims
      : [];

  const problems: ArborProblem[] = [];
  const interactions: ArborInteractionReport[] = [];
  if (lenses.interactions.availability === "consulted" && matchedSubject) {
    for (const edge of runtime!.lenses.interactions.edges) {
      const report = describeInteraction(edge, matchedSubject, options.knownContentSha256);
      if (report === null) {
        // Subject-scoped means the subject is one of the two endpoints. An edge
        // that names neither is not about this skill, and guessing a direction
        // for it would invent a relationship — so it is disclosed, not consumed.
        problems.push({
          where: `${subjectKey(matchedSubject)} lenses.interactions edge ${edge.edgeKey}`,
          detail:
            "the edge names neither endpoint as this subject at its pinned bytes; not consumed",
        });
        continue;
      }
      interactions.push(report);
    }
  }
  if (runtime && runtime.lenses.claims.status === "present" && runtime.lenses.claims.profile === null) {
    problems.push({
      where: `${subjectKey(runtime.subject)} lenses.claims`,
      detail:
        "upstream reports the claims lens present, but its embedded profile could not be read against " +
        "gaia.arbor-profile/v1; no claim was consumed for this subject",
    });
  }

  const lensesConsulted = ARBOR_LENSES.filter((lens) => lenses[lens].availability === "consulted");
  const lensesAbsent = ARBOR_LENSES.filter((lens) => lenses[lens].availability === "absent");
  const lensesUnknown = ARBOR_LENSES.filter((lens) => lenses[lens].availability === "unknown");

  return {
    skillId: candidate.skillId,
    contentSha256: candidate.contentSha256,
    canonicalSource: candidate.canonicalSource,
    join,
    matchedSubject,
    lenses,
    lensesConsulted,
    lensesAbsent,
    lensesUnknown,
    claims,
    interactions,
    conditionsEvaluated: false,
    deliveryContext: candidate.delivery ?? "not-materialized",
    problems,
    note: subjectNote(
      join,
      lensesConsulted,
      lensesAbsent,
      lensesUnknown,
      claims.length,
      interactions.length,
      candidate.delivery ?? "not-materialized",
      candidate.identityNote,
    ),
  };
}

function resolveJoin(publication: ArborPublication, candidate: ArborCandidate): ArborJoin {
  if (publication.state !== "loaded") return "publication-unavailable";
  if (!candidate.canonicalSource) return "source-not-canonical";

  const pinsForId = publication.subjects.filter((subject) => subject.id === candidate.skillId);
  if (pinsForId.length === 0) return "no-published-subject";
  if (candidate.contentSha256 === null) return "identity-unproven";
  const matched = pinsForId.some(
    (subject) => subject.contentSha256 === candidate.contentSha256,
  );
  if (!matched) return "subject-version-unmatched";
  // The listing and the aggregate documents can disagree — a listed subject
  // whose document failed validation is a disclosed publication defect, and the
  // honest join for it is "we could not read the record", not "pinned".
  return publication.runtimes.has(
    subjectKey({ id: candidate.skillId, contentSha256: candidate.contentSha256 }),
  )
    ? "content-pinned"
    : "identity-unproven";
}

function reportLens(
  lens: ArborLensName,
  join: ArborJoin,
  upstream: { status: ArborLensStatus; sourceDigest: string | null } | undefined,
  identityNote: string | undefined,
  payloadUnreadable = false,
): ArborLensReport {
  if (join !== "content-pinned" || upstream === undefined) {
    return {
      lens,
      availability: "unknown",
      upstreamStatus: null,
      sourceDigest: null,
      reason: identityNote && join === "identity-unproven"
        ? `${joinReason(join)} — ${identityNote}`
        : joinReason(join),
    };
  }
  if (upstream.status === "present") {
    if (payloadUnreadable) {
      return {
        lens,
        availability: "unknown",
        upstreamStatus: upstream.status,
        sourceDigest: upstream.sourceDigest,
        reason:
          "upstream reports a record for this subject, but its payload was not usable — " +
          "it either failed the pinned contract or does not belong to this subject; nothing was read from it",
      };
    }
    return {
      lens,
      availability: "consulted",
      upstreamStatus: upstream.status,
      sourceDigest: upstream.sourceDigest,
      reason: "a record is published for this exact subject pin and was read verbatim",
    };
  }
  if (upstream.status === "unavailable-unsupported-payload") {
    // An accepted record whose payload contract is not published is MORE
    // unknown, not less — never "absent" and never a neutral pass.
    return {
      lens,
      availability: "unknown",
      upstreamStatus: upstream.status,
      sourceDigest: upstream.sourceDigest,
      reason:
        "an accepted record exists for this subject but its payload contract is not published; " +
        "this runtime cannot read it and derives nothing from it",
    };
  }
  return {
    lens,
    availability: "absent",
    upstreamStatus: upstream.status,
    sourceDigest: upstream.sourceDigest,
    reason: absentReason(upstream.status),
  };
}

function absentReason(status: ArborLensStatus): string {
  switch (status) {
    case "absent-no-accepted-record":
      return "no accepted record has been published for this subject — not evaluated, not a negative finding";
    case "absent-subject-version-mismatch":
      return "a record exists but is pinned to different content bytes, so it does not describe this version";
    case "absent-superseded":
      return "the record for this subject has been superseded and no successor is published";
    default:
      return "no record was consulted";
  }
}

function joinReason(join: ArborJoin): string {
  switch (join) {
    case "publication-unavailable":
      return "no readable Arbor publication is available to this runtime";
    case "source-not-canonical":
      return "this candidate came from a source the canonical Arbor projection does not describe, so a matching id would prove nothing";
    case "no-published-subject":
      return "the readable publication lists no subject with this id — not evaluated, not a negative finding";
    case "subject-version-unmatched":
      return "the publication pins different content bytes for this id, so its records describe other content";
    case "identity-unproven":
      return "this runtime holds no canonical content pin for this candidate, so applicability is unknown — an id match alone proves neither source nor current content";
    default:
      return "";
  }
}

function subjectNote(
  join: ArborJoin,
  consulted: readonly ArborLensName[],
  absent: readonly ArborLensName[],
  unknown: readonly ArborLensName[],
  claimCount: number,
  edgeCount: number,
  delivery: ArborDeliveryContext,
  identityNote: string | undefined,
): string {
  const parts = [
    `lenses — consulted: ${consulted.length > 0 ? consulted.join(", ") : "none"}`,
    `absent: ${absent.length > 0 ? absent.join(", ") : "none"}`,
    `unknown: ${unknown.length > 0 ? unknown.join(", ") : "none"}`,
  ];
  let note = `${parts.join(" · ")}. ${joinNote(join)}`;
  if (join === "identity-unproven" && identityNote) note += ` (${identityNote})`;
  if (claimCount > 0) {
    note += ` ${claimCount} claim(s) carried verbatim with their stated conditions; those conditions are NOT evaluated here, so applicability to this task is unknown.`;
  }
  if (edgeCount > 0) {
    note += ` ${edgeCount} ordered interaction edge(s) carried verbatim; publication-time pairApplicable is not runtime assurance.`;
  }
  // Identity and execution are different questions, and a surface that answers
  // the first must not be read as having answered the second.
  if (claimCount > 0 || consulted.length > 0) {
    note +=
      delivery === "delivered-unverified"
        ? " A payload was materialized; it was NOT proven to be the canonical artifact these records are bound to."
        : " Nothing was materialized: this describes what is declared about the canonical record, not that a future execution will satisfy its conditions.";
  }
  return note;
}

function joinNote(join: ArborJoin): string {
  switch (join) {
    case "content-pinned":
      return "Subject identity proven by id and exact content pin.";
    case "identity-unproven":
      return "Subject identity NOT proven: unknown applicability, which is neither a denial nor an assurance.";
    case "subject-version-unmatched":
      return "Published records pin different content bytes: unknown for this version.";
    case "no-published-subject":
      return "Nothing is published about this skill: not evaluated.";
    case "source-not-canonical":
      return "Candidate is outside the canonical corpus: no Arbor record can apply to it.";
    default:
      return "No Arbor publication was consulted.";
  }
}

/**
 * Report one edge from the subject's point of view, or `null` when the edge
 * does not name this subject at its pinned bytes.
 *
 * The pair is ORDERED and the order is the fact: `from` acts on `to`. Reading
 * an edge in the wrong direction inverts its meaning, so the direction is
 * derived from which endpoint the subject actually is, never assumed.
 */
function describeInteraction(
  edge: ArborEdge,
  subject: ArborSubjectRef,
  known: Readonly<Record<string, string>> | undefined,
): ArborInteractionReport | null {
  const matches = (endpoint: ArborSubjectRef): boolean =>
    endpoint.id === subject.id && endpoint.contentSha256 === subject.contentSha256;
  const subjectIsFrom = matches(edge.pair.from);
  if (!subjectIsFrom && !matches(edge.pair.to)) return null;
  const counterpart = subjectIsFrom ? edge.pair.to : edge.pair.from;
  const knownPin = known?.[counterpart.id];
  const counterpartPin =
    knownPin === undefined
      ? "unverified"
      : knownPin === counterpart.contentSha256
        ? "verified"
        : "mismatched";
  return {
    edge,
    direction: subjectIsFrom ? "subject-acts-on" : "acts-on-subject",
    counterpart,
    counterpartPin,
  };
}
