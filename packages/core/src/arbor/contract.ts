// The upstream Arbor contracts, mirrored as TypeScript types and constants.
//
// SPEC §0.2 and INV-7: Arbor's schemas live in
// `gaia-skill-tree/registry/arbor/contracts/` and are ratified there. This
// repository is a CONSUMER of them and never an author. Nothing in this file
// may add, rename, widen or reinterpret a field: it is a structural mirror of
// pinned upstream JSON Schema, kept honest by
// `packages/core/test/arbor-contract-parity.test.ts`, which reads the pinned
// schema bytes and fails if this mirror and upstream disagree.
//
// If a consumer needs a field that is not below, the field is missing UPSTREAM
// and the answer is to raise it there (issue #118 kill criterion) — not to
// invent it here.

/** `gaia.arbor-profile/v1` — the deterministic generated per-skill projection. */
export const ARBOR_PROFILE_SCHEMA = "gaia.arbor-profile/v1" as const;
/** `gaia.arbor-runtime/v1` — one aggregate per pinned subject, three lenses. */
export const ARBOR_RUNTIME_SCHEMA = "gaia.arbor-runtime/v1" as const;
/** `gaia.arbor-edge/v1` — one ordered pairwise interaction record. */
export const ARBOR_EDGE_SCHEMA = "gaia.arbor-edge/v1" as const;
/** `gaia.arbor-edge-index/v1` — the published edge set plus its coverage note. */
export const ARBOR_EDGE_INDEX_SCHEMA = "gaia.arbor-edge-index/v1" as const;
/**
 * `gaia.arbor-runtime-index/v1` — the site publisher's subject listing. It has
 * no schema file under `contracts/`; its shape is fixed by the publisher
 * (`gaia_cli/arbor.py::buildArborProjection`) and pinned here by the committed
 * publication fixture rather than by a ratified schema. Recorded as such.
 */
export const ARBOR_RUNTIME_INDEX_SCHEMA = "gaia.arbor-runtime-index/v1" as const;

/**
 * PROJECTED support — five values.
 *
 * This is the axis a generated profile claim or a projected edge carries.
 * `expert-declared` is the state of a claim that NO governed interpretation has
 * spoken on yet. It is not a verdict and not a confidence label.
 */
export const PROJECTED_SUPPORT = [
  "expert-declared",
  "benchmark-confirmed",
  "benchmark-qualified",
  "benchmark-revised",
  "inconclusive",
] as const;

/**
 * GOVERNED support — four values.
 *
 * The enum an explicit `gaia.arbor-interpretation/v1` / `gaia.arbor-edge-
 * interpretation/v1` curator record may set. `expert-declared` is deliberately
 * absent: a curator cannot "set" a claim back to undeclared, and a receipt can
 * never move a claim at all. The four-vs-five difference is intentional
 * upstream (`registry/arbor/README.md`), so this consumer keeps both enums
 * distinct rather than collapsing them into one list.
 */
export const GOVERNED_SUPPORT = [
  "benchmark-confirmed",
  "benchmark-qualified",
  "benchmark-revised",
  "inconclusive",
] as const;

/**
 * Facets are INDEPENDENT and NONEXCLUSIVE (SPEC §4.1). One skill may carry
 * both under different stated conditions, on separate claims. Any
 * representation that can hold only one of these per skill is wrong.
 */
export const ARBOR_FACETS = ["human-led", "model-led"] as const;

/** The seven ratified interaction relations (ENDGAME §8). */
export const ARBOR_RELATIONS = [
  "stabilizes",
  "amplifies",
  "conflicts",
  "recovers",
  "compresses-after",
  "unlocks",
  "duplicates",
] as const;

/**
 * The lens status enum on `gaia.arbor-runtime/v1`.
 *
 * Every value except `present` is a form of ABSENCE, and absence is never
 * negative evidence (SPEC INV-4). `unavailable-unsupported-payload` in
 * particular means an accepted record exists whose payload contract is not
 * published — strictly more unknown, not less.
 */
export const ARBOR_LENS_STATUS = [
  "present",
  "absent-no-accepted-record",
  "absent-subject-version-mismatch",
  "absent-superseded",
  "unavailable-unsupported-payload",
] as const;

/** `coverage.absenceMeaning` is a const upstream: an empty edge set proves nothing. */
export const EDGE_ABSENCE_MEANING = "not-evaluated" as const;

/** `structuralOverlap` is a const upstream; it is not a computed value here. */
export const EDGE_STRUCTURAL_OVERLAP = "not-evaluated" as const;

export type ProjectedSupport = (typeof PROJECTED_SUPPORT)[number];
export type GovernedSupport = (typeof GOVERNED_SUPPORT)[number];
export type ArborFacet = (typeof ARBOR_FACETS)[number];
export type ArborRelation = (typeof ARBOR_RELATIONS)[number];
export type ArborLensStatus = (typeof ARBOR_LENS_STATUS)[number];

/** `{id, contentSha256}` — the exact pin every Arbor record is bound to. */
export type ArborSubjectRef = {
  id: string;
  contentSha256: string;
};

export type ArborAuthority = {
  actor: string;
  basis: string;
};

/** One claim on a generated profile. `conditions` is part of the claim. */
export type ArborClaim = {
  id: string;
  facet: ArborFacet;
  /** The stated conditions. A claim shown without these is not the claim. */
  conditions: string;
  rationale: string;
  authority: ArborAuthority;
  support: ProjectedSupport;
  declarationId: string;
  declaredAt: string;
  declarationSource: string;
  benchmarkSources: string[];
  /** Non-null exactly when a governed interpretation set `support`. */
  interpretationSource: string | null;
};

export type ArborProfile = {
  schema: typeof ARBOR_PROFILE_SCHEMA;
  skill: ArborSubjectRef;
  inputDigest: string;
  sources: {
    declarations: string[];
    benchmarkReceipts: string[];
    interpretations: string[];
  };
  claims: ArborClaim[];
};

export type ArborEdge = {
  schema: typeof ARBOR_EDGE_SCHEMA;
  edgeKey: string;
  /** ORDERED. `from` acts on `to`; swapping them is a different edge. */
  pair: { from: ArborSubjectRef; to: ArborSubjectRef };
  target: { declarationSha256: string; claimId: string };
  relation: ArborRelation;
  conditions: string;
  authority: ArborAuthority;
  support: ProjectedSupport;
  declarationSource: string;
  observationSources: string[];
  interpretationSource: string | null;
  structuralOverlap: typeof EDGE_STRUCTURAL_OVERLAP;
  /**
   * Publication-time only. Upstream states plainly that this is NOT runtime
   * assurance: a consumer must still verify both current endpoint bytes and
   * the stated conditions.
   */
  pairApplicable: boolean;
};

export type ArborEdgeIndex = {
  schema: typeof ARBOR_EDGE_INDEX_SCHEMA;
  edgeSetVersion: string;
  coverage: {
    pairsEvaluated: number;
    absenceMeaning: typeof EDGE_ABSENCE_MEANING;
  };
  edges: ArborEdge[];
};

export type ArborClaimsLens = {
  status: ArborLensStatus;
  sourceDigest: string | null;
  /**
   * The closed profile document, embedded byte-for-byte by the publisher. The
   * runtime schema types it only as `object|null`, so this consumer validates
   * it against the profile contract before reading it and degrades — with
   * disclosure — when it does not conform.
   */
  profile: ArborProfile | null;
};

export type ArborHellHeavenLens = {
  status: ArborLensStatus;
  sourceDigest: string | null;
  /**
   * The HH result payload contract is research-owned and NOT published. Today
   * an accepted HH envelope projects `unavailable-unsupported-payload` with a
   * null result. This consumer never parses, scores, or infers an HH polarity,
   * direction, stamp or magnitude from anything.
   */
  result: Record<string, unknown> | null;
};

export type ArborInteractionsLens = {
  status: ArborLensStatus;
  sourceDigest: string | null;
  edges: ArborEdge[];
};

export type ArborRuntime = {
  schema: typeof ARBOR_RUNTIME_SCHEMA;
  subject: ArborSubjectRef;
  inputDigest: string;
  lenses: {
    claims: ArborClaimsLens;
    hellHeaven: ArborHellHeavenLens;
    interactions: ArborInteractionsLens;
  };
};

export type ArborRuntimeIndex = {
  schema: typeof ARBOR_RUNTIME_INDEX_SCHEMA;
  runtimeVersion: typeof ARBOR_RUNTIME_SCHEMA;
  subjects: ArborSubjectRef[];
};

/** The three lens names, in the order upstream declares them. */
export const ARBOR_LENSES = ["claims", "hellHeaven", "interactions"] as const;
export type ArborLensName = (typeof ARBOR_LENSES)[number];
