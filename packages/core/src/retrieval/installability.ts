// Tree-scoped installability consumption. This is deliberately separate from
// retrieval scoring: installability evidence may withhold an explicitly proven
// negative, but it never changes a relevance score.

export const INSTALLABILITY_PROJECTION_SCHEMA = "gaia.installability/v1" as const;
export const INSTALLABILITY_OBSERVATION_SCHEMA =
  "gaia.installability-observation/v1" as const;

export const INSTALLABILITY_STATES = [
  "materializable",
  "not-materializable",
  "unknown",
] as const;
export type InstallabilityState = (typeof INSTALLABILITY_STATES)[number];

export const INSTALLABILITY_REASONS = [
  "gaia-materialized",
  "no-source",
  "intrinsic-content-failure",
  "subject-changed",
  "route-changed",
  "not-observed",
  "inaccessible-at-check",
  "unclassified-install-failure",
  "timeout",
  "unexpected-refusal",
  "contradictory-observation",
  "suite-component-failed",
  "ambiguous-observation",
] as const;
export type InstallabilityReason = (typeof INSTALLABILITY_REASONS)[number];

export type InstallabilitySourceRoute = {
  url: string;
  owner: string;
  repo: string;
  ref: string | null;
  subpath: string;
  entrypoint: string;
  installSubpath: string;
};

export type InstallabilityObservationRef = {
  digest: string;
  checkedAt: string;
  runId: string;
};

/** One per-skill record from the upstream `gaia.installability/v1` projection. */
export type InstallabilityProjectionSkill = {
  state: InstallabilityState;
  reason: InstallabilityReason;
  observationDigest: string | null;
  observedAt: string | null;
  currentSourceRoute: InstallabilitySourceRoute | null;
  currentSkillContentSha256: string | null;
  observedSourceRoute: InstallabilitySourceRoute | null;
  observedSkillContentSha256: string | null;
  resolvedRevision: string | null;
  deliveredContentSha256: string | null;
};

export type InstallabilityProjection = {
  schema: typeof INSTALLABILITY_PROJECTION_SCHEMA;
  indexPath: string;
  observations: InstallabilityObservationRef[];
  skills: Record<string, InstallabilityProjectionSkill>;
};

export type InstallabilityApplicability =
  | "verified"
  | "unknown";

export type InstallabilityApplicabilityReason =
  | "matched"
  | "not-observed"
  | "source-mismatch"
  | "content-mismatch"
  | "revision-unverified"
  | "revision-mismatch"
  | "fleet-source"
  | "invalid-context"
  | "invalid-evidence";

/**
 * The consumer-side envelope around an upstream record.
 *
 * `upstream` is retained verbatim when the projection contains a record. The
 * local fields say whether this runtime has enough exact identity/source/
 * content/version context to apply that record. An unverified record is
 * always effective `unknown`; it is never allowed to become a refusal.
 */
export type InstallabilityAssessment = {
  state: InstallabilityState;
  reason: InstallabilityReason | "unverified-applicability";
  applicability: InstallabilityApplicability;
  applicabilityReason: InstallabilityApplicabilityReason;
  projectionIndexPath: string | null;
  upstream: InstallabilityProjectionSkill | null;
};

export type InstallabilityCandidateContext = {
  id: string;
  sourceRoute: InstallabilitySourceRoute | null;
  /** Hash of the current source's SKILL.md bytes, when the source supplies it. */
  skillContentSha256?: string | null | undefined;
  /** Resolved source revision, not a mutable branch name. */
  resolvedRevision?: string | null | undefined;
};

export function unknownInstallabilityAssessment(
  projectionIndexPath: string | null = null,
  applicabilityReason: InstallabilityApplicabilityReason = "not-observed",
  upstream: InstallabilityProjectionSkill | null = null,
): InstallabilityAssessment {
  return {
    state: "unknown",
    reason: "unverified-applicability",
    applicability: "unknown",
    applicabilityReason,
    projectionIndexPath,
    upstream,
  };
}

export function assessInstallability(
  projection: InstallabilityProjection,
  skillId: string,
  candidate: InstallabilityCandidateContext | undefined,
  sourceKind: "tree" | "fleet" | "unknown" = "unknown",
): InstallabilityAssessment {
  if (sourceKind !== "tree") {
    return unknownInstallabilityAssessment(
      typeof projection?.indexPath === "string" ? projection.indexPath : null,
      sourceKind === "fleet" ? "fleet-source" : "invalid-context",
    );
  }

  const projectionIndexPath =
    typeof projection?.indexPath === "string" ? projection.indexPath : null;
  if (
    typeof projection !== "object" ||
    projection === null ||
    typeof projection.skills !== "object" ||
    projection.skills === null ||
    Array.isArray(projection.skills)
  ) {
    return unknownInstallabilityAssessment(
      projectionIndexPath,
      "invalid-evidence",
    );
  }

  const upstream = projection.skills[skillId];
  if (upstream === undefined) {
    return unknownInstallabilityAssessment(projection.indexPath, "not-observed");
  }
  const semanticError = projectionSemanticError(projection, skillId, upstream);
  if (semanticError !== null) {
    return unknownInstallabilityAssessment(
      projection.indexPath,
      "invalid-evidence",
      upstream,
    );
  }
  if (candidate === undefined || candidate.id !== skillId) {
    return unknownInstallabilityAssessment(
      projection.indexPath,
      "invalid-context",
      upstream,
    );
  }

  if (!sameRoute(candidate.sourceRoute, upstream.currentSourceRoute)) {
    return unknownInstallabilityAssessment(
      projection.indexPath,
      "source-mismatch",
      upstream,
    );
  }

  // The Tree hash is not the delivered remote SKILL.md. Requiring the caller
  // to provide the current hash is intentional: URL equality alone does not
  // establish applicability.
  if (
    candidate.skillContentSha256 === undefined ||
    candidate.skillContentSha256 === null ||
    upstream.currentSkillContentSha256 === null ||
    candidate.skillContentSha256 !== upstream.currentSkillContentSha256
  ) {
    return unknownInstallabilityAssessment(
      projection.indexPath,
      "content-mismatch",
      upstream,
    );
  }

  // A positive observation includes the revision Gaia actually resolved. A
  // mutable branch in the candidate route is not a substitute for that pin.
  if (upstream.resolvedRevision !== null) {
    if (
      candidate.resolvedRevision === undefined ||
      candidate.resolvedRevision === null
    ) {
      return unknownInstallabilityAssessment(
        projection.indexPath,
        "revision-unverified",
        upstream,
      );
    }
    if (candidate.resolvedRevision !== upstream.resolvedRevision) {
      return unknownInstallabilityAssessment(
        projection.indexPath,
        "revision-mismatch",
        upstream,
      );
    }
  }

  return {
    state: upstream.state,
    reason: upstream.reason,
    applicability: "verified",
    applicabilityReason: "matched",
    projectionIndexPath: projection.indexPath,
    upstream,
  };
}

export function withInstallability<T extends { docs: ReadonlyArray<{ id: string }> }>(
  index: T,
  assessments: ReadonlyMap<string, InstallabilityAssessment>,
): T {
  const docs = index.docs.map((doc) => ({
    ...doc,
    installability: safeAssessment(assessments.get(doc.id)),
  }));
  const decorated = { ...index, docs } as T;
  const stats = (index as T & { stats?: unknown }).stats;
  if (isStats(stats)) {
    // `buildSkillIndex()` keeps the legacy URL-shape statistic for the
    // committed artifact. A runtime assessment view must not report that old
    // count as if unknown candidates were still unreachable.
    return {
      ...decorated,
      stats: {
        ...stats,
        unreachable: docs.filter(assessedUnreachable).length,
      },
    } as T;
  }
  return decorated;
}

/** Mark every candidate unknown when no Tree evidence can be applied. */
export function withUnknownInstallability<T extends { docs: ReadonlyArray<{ id: string }> }>(
  index: T,
  projectionIndexPath: string | null = null,
  applicabilityReason: InstallabilityApplicabilityReason = "not-observed",
): T {
  const assessments = new Map(
    index.docs.map((doc) => [
      doc.id,
      unknownInstallabilityAssessment(projectionIndexPath, applicabilityReason),
    ]),
  );
  return withInstallability(index, assessments) as T;
}

function safeAssessment(
  value: InstallabilityAssessment | undefined,
): InstallabilityAssessment | undefined {
  if (value === undefined) return undefined;
  try {
    assertInstallabilityAssessment(value);
    return value;
  } catch {
    // A caller can reach this exported core seam without the JSON adapter.
    // Never let an unsound typed cast promote a malformed positive/negative.
    return unknownInstallabilityAssessment(null, "invalid-evidence");
  }
}

function isStats(value: unknown): value is { unreachable: number } & Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { unreachable?: unknown }).unreachable === "number";
}

function assessedUnreachable(value: { [key: string]: unknown }): boolean {
  if (value.registryOnly === true) return true;
  const assessment = value.installability as InstallabilityAssessment | undefined;
  if (assessment !== undefined) {
    return assessment.applicability === "verified" &&
      assessment.state === "not-materializable";
  }
  return value.installable !== true &&
    (!Array.isArray(value.suiteComponents) || value.suiteComponents.length === 0);
}

function sameRoute(
  left: InstallabilitySourceRoute | null,
  right: InstallabilitySourceRoute | null,
): boolean {
  if (left === null || right === null) return left === right;
  return ["url", "owner", "repo", "ref", "subpath", "entrypoint", "installSubpath"]
    .every((key) => left[key as keyof InstallabilitySourceRoute] === right[key as keyof InstallabilitySourceRoute]);
}

export function isInstallabilityState(value: unknown): value is InstallabilityState {
  return typeof value === "string" &&
    (INSTALLABILITY_STATES as readonly string[]).includes(value);
}

export function isInstallabilityReason(value: unknown): value is InstallabilityReason {
  return typeof value === "string" &&
    (INSTALLABILITY_REASONS as readonly string[]).includes(value);
}

export function assertInstallabilityAssessment(
  value: unknown,
  label = "Installability assessment",
): asserts value is InstallabilityAssessment {
  const assessment = asRecord(value, label);
  if (!isInstallabilityState(assessment.state)) {
    throw new Error(`${label}.state is invalid.`);
  }
  if (
    assessment.reason !== "unverified-applicability" &&
    !isInstallabilityReason(assessment.reason)
  ) {
    throw new Error(`${label}.reason is invalid.`);
  }
  if (assessment.applicability !== "verified" && assessment.applicability !== "unknown") {
    throw new Error(`${label}.applicability is invalid.`);
  }
  const applicabilityReasons = [
    "matched",
    "not-observed",
    "source-mismatch",
    "content-mismatch",
    "revision-unverified",
    "revision-mismatch",
    "fleet-source",
    "invalid-context",
    "invalid-evidence",
  ];
  if (!applicabilityReasons.includes(String(assessment.applicabilityReason))) {
    throw new Error(`${label}.applicabilityReason is invalid.`);
  }
  if (assessment.projectionIndexPath !== null &&
      typeof assessment.projectionIndexPath !== "string") {
    throw new Error(`${label}.projectionIndexPath must be a string or null.`);
  }
  if (assessment.upstream !== null) {
    assertInstallabilityProjectionSkill(assessment.upstream, `${label}.upstream`);
    if (assessment.applicability === "verified") {
      const stateError = stateSpecificError(assessment.upstream);
      if (stateError !== null) {
        throw new Error(`${label}.upstream is semantically invalid: ${stateError}`);
      }
      if (assessment.applicabilityReason !== "matched") {
        throw new Error(`${label}.verified assessments must have applicabilityReason matched.`);
      }
      if (
        assessment.state !== assessment.upstream.state ||
        assessment.reason !== assessment.upstream.reason
      ) {
        throw new Error(`${label} does not preserve its upstream state and reason.`);
      }
    } else if (
      assessment.state !== "unknown" ||
      assessment.reason !== "unverified-applicability"
    ) {
      throw new Error(`${label}.unknown applicability must be effective unknown.`);
    }
  } else if (
    assessment.applicability !== "unknown" ||
    assessment.state !== "unknown" ||
    assessment.reason !== "unverified-applicability"
  ) {
    throw new Error(`${label} without upstream evidence must be effective unknown.`);
  }
}

function projectionSemanticError(
  projection: InstallabilityProjection,
  skillId: string,
  record: InstallabilityProjectionSkill,
): string | null {
  try {
    assertInstallabilityProjectionSkill(record, `Installability projection skill ${skillId}`);
    if (typeof projection.indexPath !== "string" || projection.indexPath.length === 0) {
      return "missing projection index path";
    }
    if (!Array.isArray(projection.observations)) return "missing observation refs";
    const refs = projection.observations.filter(
      (ref) => ref && typeof ref === "object",
    );
    if (refs.length !== projection.observations.length) return "malformed observation ref";
    for (const ref of refs) {
      if (
        typeof ref.digest !== "string" ||
        !/^[0-9a-f]{64}$/iu.test(ref.digest) ||
        typeof ref.checkedAt !== "string" ||
        !Number.isFinite(Date.parse(ref.checkedAt)) ||
        typeof ref.runId !== "string" ||
        ref.runId.length === 0
      ) {
        return "malformed observation ref";
      }
    }
    const sameDigest = refs.filter((ref) => ref.digest === record.observationDigest);
    if (record.observationDigest !== null) {
      if (sameDigest.length !== 1) return "orphan or conflicting observation ref";
      if (record.observedAt === null || record.observedAt !== sameDigest[0]?.checkedAt) {
        return "observation timestamp does not match its ref";
      }
    } else if (record.observedAt !== null) {
      if (
        record.state !== "unknown" ||
        record.reason !== "ambiguous-observation" ||
        !refs.some((ref) => ref.checkedAt === record.observedAt)
      ) {
        return "observation timestamp has no selected ref";
      }
    } else if (
      record.state !== "unknown" ||
      record.reason !== "not-observed"
    ) {
      return "decision record has no observation provenance";
    }
    return stateSpecificError(record);
  } catch {
    // The exported core assessment seam must fail closed even when a caller
    // bypasses the outer JSON parser with an unsound cast.
    return `malformed record for ${skillId}`;
  }
}

function stateSpecificError(record: InstallabilityProjectionSkill): string | null {
  if (
    record.state === "unknown" &&
    (record.reason === "gaia-materialized" ||
      record.reason === "no-source" ||
      record.reason === "intrinsic-content-failure")
  ) {
    return "unknown result has a contradictory decision reason";
  }
  if (record.state === "materializable") {
    if (record.reason !== "gaia-materialized") return "positive result has the wrong reason";
    if (
      record.currentSourceRoute === null ||
      record.observedSourceRoute === null ||
      !sameRoute(record.currentSourceRoute, record.observedSourceRoute)
    ) {
      return "materializable result lacks matching current and observed source identity";
    }
    if (
      record.currentSkillContentSha256 === null ||
      record.observedSkillContentSha256 === null ||
      record.currentSkillContentSha256 !== record.observedSkillContentSha256
    ) {
      return "materializable result lacks matching current and observed content identity";
    }
    if (record.resolvedRevision === null) return "materializable result lacks resolved revision";
    if (record.deliveredContentSha256 === null) {
      return "materializable result lacks delivered content provenance";
    }
    return null;
  }

  if (record.state === "not-materializable") {
    if (record.reason === "no-source") {
      if (
        record.currentSourceRoute !== null ||
        record.observedSourceRoute !== null ||
        record.observedSkillContentSha256 !== null ||
        record.resolvedRevision !== null ||
        record.deliveredContentSha256 !== null
      ) {
        return "no-source result contains sourced observation fields";
      }
      return null;
    }
    if (record.reason === "intrinsic-content-failure") {
      if (
        record.currentSourceRoute === null ||
        record.observedSourceRoute === null ||
        !sameRoute(record.currentSourceRoute, record.observedSourceRoute)
      ) {
        return "intrinsic result lacks matching source identity";
      }
      // Hashes, resolved revision, and delivered bytes may legitimately be
      // null for an intrinsic failure; the failure is not a positive result.
      return null;
    }
    return "negative result has an unscoped reason";
  }

  return null;
}

export function assertInstallabilityProjectionSkill(
  value: unknown,
  label = "Installability projection skill",
): asserts value is InstallabilityProjectionSkill {
  const skill = asRecord(value, label);
  if (!isInstallabilityState(skill.state)) throw new Error(`${label}.state is invalid.`);
  if (!isInstallabilityReason(skill.reason)) throw new Error(`${label}.reason is invalid.`);
  optionalSha(skill.observationDigest, `${label}.observationDigest`);
  optionalTimestamp(skill.observedAt, `${label}.observedAt`);
  optionalRoute(skill.currentSourceRoute, `${label}.currentSourceRoute`);
  optionalSha(skill.currentSkillContentSha256, `${label}.currentSkillContentSha256`);
  optionalRoute(skill.observedSourceRoute, `${label}.observedSourceRoute`);
  optionalSha(skill.observedSkillContentSha256, `${label}.observedSkillContentSha256`);
  optionalRevision(skill.resolvedRevision, `${label}.resolvedRevision`);
  optionalSha(skill.deliveredContentSha256, `${label}.deliveredContentSha256`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalSha(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !/^[0-9a-f]{64}$/iu.test(value))) {
    throw new Error(`${label} must be a sha256 string or null.`);
  }
}

function optionalRevision(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !/^[0-9a-f]{40}$/iu.test(value))) {
    throw new Error(`${label} must be a revision string or null.`);
  }
}

function optionalTimestamp(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
    throw new Error(`${label} must be an ISO timestamp or null.`);
  }
}

function optionalRoute(value: unknown, label: string): void {
  if (value === null) return;
  const route = asRecord(value, label);
  for (const key of ["url", "owner", "repo", "subpath", "entrypoint", "installSubpath"]) {
    if (typeof route[key] !== "string") throw new Error(`${label}.${key} must be a string.`);
  }
  if (route.ref !== null && typeof route.ref !== "string") {
    throw new Error(`${label}.ref must be a string or null.`);
  }
}
