// Closed-shape structural validation for the pinned Arbor contracts.
//
// Hand-rolled on purpose: this package carries zero runtime dependencies, so
// there is no JSON Schema engine to reach for. That makes drift the real risk,
// which is why `test/arbor-contract-parity.test.ts` reads the PINNED upstream
// schema bytes and asserts that every required field, enum and const below
// matches them. A validator that quietly diverged from upstream would be a
// local fork of the contract wearing a consumer's clothes.
//
// Two rules run through all of it:
//
//   1. Unknown fields are REJECTED. Every Arbor contract sets
//      `additionalProperties: false`; accepting an unknown key here would let a
//      future or forged field enter runtime state unnoticed.
//   2. Unknown schema ids and versions FAIL CLOSED. A document this build does
//      not understand is not "mostly fine" — it is unreadable, and the caller
//      discloses that rather than guessing.

import {
  ARBOR_EDGE_INDEX_SCHEMA,
  ARBOR_EDGE_SCHEMA,
  ARBOR_FACETS,
  ARBOR_LENS_STATUS,
  ARBOR_PROFILE_SCHEMA,
  ARBOR_RELATIONS,
  ARBOR_RUNTIME_INDEX_SCHEMA,
  ARBOR_RUNTIME_SCHEMA,
  EDGE_ABSENCE_MEANING,
  EDGE_STRUCTURAL_OVERLAP,
  GOVERNED_SUPPORT,
  PROJECTED_SUPPORT,
  type ArborClaim,
  type ArborEdge,
  type ArborEdgeIndex,
  type ArborProfile,
  type ArborRuntime,
  type ArborRuntimeIndex,
  type ArborSubjectRef,
  type GovernedSupport,
  type ProjectedSupport,
} from "./contract.js";

export class ArborContractError extends Error {
  override readonly name = "ArborContractError";
}

const SHA256 = /^[a-f0-9]{64}$/u;
const RECORD_ID = /^[a-z][a-z0-9.-]*$/u;
const SKILL_ID =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)?$/u;
// RFC 3339, which is what JSON Schema's `date-time` format means here.
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/u;

/** Whether `value` is one of the four values a governed interpretation may set. */
export function isGovernedSupport(value: string): value is GovernedSupport {
  return (GOVERNED_SUPPORT as readonly string[]).includes(value);
}

/** Whether `value` is one of the five values a PROJECTED record may carry. */
export function isProjectedSupport(value: string): value is ProjectedSupport {
  return (PROJECTED_SUPPORT as readonly string[]).includes(value);
}

export function assertArborProfile(value: unknown, label = "Arbor profile"): asserts value is ArborProfile {
  const profile = closedRecord(value, label, [
    "schema",
    "skill",
    "inputDigest",
    "sources",
    "claims",
  ]);
  constant(profile, "schema", ARBOR_PROFILE_SCHEMA, label);
  subjectRef(profile.skill, `${label}.skill`);
  sha256(profile, "inputDigest", label);

  const sources = closedRecord(profile.sources, `${label}.sources`, [
    "declarations",
    "benchmarkReceipts",
    "interpretations",
  ]);
  for (const key of ["declarations", "benchmarkReceipts", "interpretations"] as const) {
    digestList(sources[key], `${label}.sources.${key}`);
  }

  const claims = array(profile.claims, `${label}.claims`);
  // `minItems: 1` upstream — a profile with no claims is not a profile.
  if (claims.length === 0) {
    throw new ArborContractError(`${label}.claims must contain at least one claim.`);
  }
  claims.forEach((claim, position) => assertArborClaim(claim, `${label}.claims[${position}]`));
}

export function assertArborClaim(value: unknown, label: string): asserts value is ArborClaim {
  const claim = closedRecord(value, label, [
    "id",
    "facet",
    "conditions",
    "rationale",
    "authority",
    "support",
    "declarationId",
    "declaredAt",
    "declarationSource",
    "benchmarkSources",
    "interpretationSource",
  ]);
  pattern(claim, "id", RECORD_ID, label);
  enumeration(claim, "facet", ARBOR_FACETS, label);
  // `conditions` is required by upstream and load-bearing for this consumer:
  // §4.1 — a behavioral claim without its stated conditions is not the claim.
  nonEmpty(claim, "conditions", label);
  nonEmpty(claim, "rationale", label);
  authority(claim.authority, `${label}.authority`);
  enumeration(claim, "support", PROJECTED_SUPPORT, label);
  pattern(claim, "declarationId", RECORD_ID, label);
  dateTime(claim, "declaredAt", label);
  sha256(claim, "declarationSource", label);
  digestList(claim.benchmarkSources, `${label}.benchmarkSources`);
  sha256OrNull(claim, "interpretationSource", label);
}

export function assertArborEdge(value: unknown, label = "Arbor edge"): asserts value is ArborEdge {
  const edge = closedRecord(value, label, [
    "schema",
    "edgeKey",
    "pair",
    "target",
    "relation",
    "conditions",
    "authority",
    "support",
    "declarationSource",
    "observationSources",
    "interpretationSource",
    "structuralOverlap",
    "pairApplicable",
  ]);
  constant(edge, "schema", ARBOR_EDGE_SCHEMA, label);
  sha256(edge, "edgeKey", label);

  const pair = closedRecord(edge.pair, `${label}.pair`, ["from", "to"]);
  subjectRef(pair.from, `${label}.pair.from`);
  subjectRef(pair.to, `${label}.pair.to`);

  const target = closedRecord(edge.target, `${label}.target`, ["declarationSha256", "claimId"]);
  sha256(target, "declarationSha256", `${label}.target`);
  pattern(target, "claimId", RECORD_ID, `${label}.target`);

  enumeration(edge, "relation", ARBOR_RELATIONS, label);
  nonEmpty(edge, "conditions", label);
  authority(edge.authority, `${label}.authority`);
  enumeration(edge, "support", PROJECTED_SUPPORT, label);
  sha256(edge, "declarationSource", label);
  digestList(edge.observationSources, `${label}.observationSources`);
  sha256OrNull(edge, "interpretationSource", label);
  constant(edge, "structuralOverlap", EDGE_STRUCTURAL_OVERLAP, label);
  if (typeof edge.pairApplicable !== "boolean") {
    throw new ArborContractError(`${label}.pairApplicable must be a boolean.`);
  }
}

export function assertArborEdgeIndex(
  value: unknown,
  label = "Arbor edge index",
): asserts value is ArborEdgeIndex {
  const index = closedRecord(value, label, ["schema", "edgeSetVersion", "coverage", "edges"]);
  constant(index, "schema", ARBOR_EDGE_INDEX_SCHEMA, label);
  nonEmpty(index, "edgeSetVersion", label);

  const coverage = closedRecord(index.coverage, `${label}.coverage`, [
    "pairsEvaluated",
    "absenceMeaning",
  ]);
  nonNegativeInteger(coverage, "pairsEvaluated", `${label}.coverage`);
  // A const upstream, and the reason an empty edge set is not a finding.
  constant(coverage, "absenceMeaning", EDGE_ABSENCE_MEANING, `${label}.coverage`);

  const edges = array(index.edges, `${label}.edges`);
  edges.forEach((edge, position) => assertArborEdge(edge, `${label}.edges[${position}]`));
}

export function assertArborRuntime(
  value: unknown,
  label = "Arbor runtime",
): asserts value is ArborRuntime {
  const runtime = closedRecord(value, label, ["schema", "subject", "inputDigest", "lenses"]);
  constant(runtime, "schema", ARBOR_RUNTIME_SCHEMA, label);
  subjectRef(runtime.subject, `${label}.subject`);
  sha256(runtime, "inputDigest", label);

  const lenses = closedRecord(runtime.lenses, `${label}.lenses`, [
    "claims",
    "hellHeaven",
    "interactions",
  ]);

  const claimsLens = closedRecord(lenses.claims, `${label}.lenses.claims`, [
    "status",
    "sourceDigest",
    "profile",
  ]);
  enumeration(claimsLens, "status", ARBOR_LENS_STATUS, `${label}.lenses.claims`);
  sha256OrNull(claimsLens, "sourceDigest", `${label}.lenses.claims`);
  // The runtime schema types the embedded profile as `object|null` only. The
  // validation of its inner shape belongs to the profile contract and is done
  // by the reader, which can degrade one lens instead of rejecting a whole
  // subject aggregate.
  objectOrNull(claimsLens, "profile", `${label}.lenses.claims`);

  const hhLens = closedRecord(lenses.hellHeaven, `${label}.lenses.hellHeaven`, [
    "status",
    "sourceDigest",
    "result",
  ]);
  enumeration(hhLens, "status", ARBOR_LENS_STATUS, `${label}.lenses.hellHeaven`);
  sha256OrNull(hhLens, "sourceDigest", `${label}.lenses.hellHeaven`);
  objectOrNull(hhLens, "result", `${label}.lenses.hellHeaven`);

  const interactionsLens = closedRecord(lenses.interactions, `${label}.lenses.interactions`, [
    "status",
    "sourceDigest",
    "edges",
  ]);
  enumeration(interactionsLens, "status", ARBOR_LENS_STATUS, `${label}.lenses.interactions`);
  sha256OrNull(interactionsLens, "sourceDigest", `${label}.lenses.interactions`);
  const edges = array(interactionsLens.edges, `${label}.lenses.interactions.edges`);
  edges.forEach((edge, position) =>
    assertArborEdge(edge, `${label}.lenses.interactions.edges[${position}]`),
  );
}

export function assertArborRuntimeIndex(
  value: unknown,
  label = "Arbor runtime index",
): asserts value is ArborRuntimeIndex {
  const index = closedRecord(value, label, ["schema", "runtimeVersion", "subjects"]);
  constant(index, "schema", ARBOR_RUNTIME_INDEX_SCHEMA, label);
  // Fails closed on a runtime document version this build cannot read.
  constant(index, "runtimeVersion", ARBOR_RUNTIME_SCHEMA, label);
  const subjects = array(index.subjects, `${label}.subjects`);
  subjects.forEach((subject, position) =>
    subjectRef(subject, `${label}.subjects[${position}]`),
  );
}

export function assertArborSubjectRef(
  value: unknown,
  label = "Arbor subject",
): asserts value is ArborSubjectRef {
  subjectRef(value, label);
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

function closedRecord(
  value: unknown,
  label: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArborContractError(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ArborContractError(
        `${label} carries unknown field '${key}'. The Arbor contracts are closed; ` +
          "a consumer that accepted it would be forking the schema.",
      );
    }
  }
  for (const key of allowed) {
    if (!(key in record)) {
      throw new ArborContractError(`${label} is missing required field '${key}'.`);
    }
  }
  return record;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ArborContractError(`${label} must be an array.`);
  return value;
}

function constant(record: Record<string, unknown>, key: string, expected: string, label: string): void {
  if (record[key] !== expected) {
    throw new ArborContractError(
      `${label}.${key} must be '${expected}', got ${JSON.stringify(record[key])}. ` +
        "This build reads only the pinned contract version.",
    );
  }
}

function nonEmpty(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ArborContractError(`${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function pattern(
  record: Record<string, unknown>,
  key: string,
  expression: RegExp,
  label: string,
): string {
  const value = nonEmpty(record, key, label);
  if (!expression.test(value)) {
    throw new ArborContractError(`${label}.${key} does not match ${String(expression)}.`);
  }
  return value;
}

function sha256(record: Record<string, unknown>, key: string, label: string): string {
  return pattern(record, key, SHA256, label);
}

function sha256OrNull(record: Record<string, unknown>, key: string, label: string): void {
  if (record[key] === null) return;
  sha256(record, key, label);
}

function objectOrNull(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (value === null) return;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ArborContractError(`${label}.${key} must be an object or null.`);
  }
}

function dateTime(record: Record<string, unknown>, key: string, label: string): void {
  const value = nonEmpty(record, key, label);
  if (!DATE_TIME.test(value)) {
    throw new ArborContractError(`${label}.${key} must be an RFC 3339 date-time.`);
  }
}

function enumeration(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  label: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ArborContractError(
      `${label}.${key} must be one of ${allowed.join(", ")}; got ${JSON.stringify(value)}.`,
    );
  }
}

function digestList(value: unknown, label: string): void {
  const digests = array(value, label);
  const seen = new Set<string>();
  digests.forEach((digest, position) => {
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      throw new ArborContractError(`${label}[${position}] must be a sha256 digest.`);
    }
    if (seen.has(digest)) {
      throw new ArborContractError(`${label} repeats digest ${digest}; upstream requires uniqueness.`);
    }
    seen.add(digest);
  });
}

function nonNegativeInteger(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ArborContractError(`${label}.${key} must be a non-negative integer.`);
  }
}

function subjectRef(value: unknown, label: string): void {
  const subject = closedRecord(value, label, ["id", "contentSha256"]);
  pattern(subject, "id", SKILL_ID, label);
  sha256(subject, "contentSha256", label);
}

function authority(value: unknown, label: string): void {
  const record = closedRecord(value, label, ["actor", "basis"]);
  nonEmpty(record, "actor", label);
  nonEmpty(record, "basis", label);
}
