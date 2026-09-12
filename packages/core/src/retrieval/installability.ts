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
  | "invalid-context";

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
  sourceKind: "tree" | "fleet" = "tree",
): InstallabilityAssessment {
  if (sourceKind === "fleet") {
    return unknownInstallabilityAssessment(
      projection.indexPath,
      "fleet-source",
    );
  }

  const upstream = projection.skills[skillId];
  if (upstream === undefined) {
    return unknownInstallabilityAssessment(projection.indexPath, "not-observed");
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
  return {
    ...index,
    docs: index.docs.map((doc) => ({
      ...doc,
      installability: assessments.get(doc.id),
    })),
  } as T;
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
  }
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
