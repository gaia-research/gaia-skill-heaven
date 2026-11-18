import {
  ARBOR_EDGE_SCHEMA,
  ARBOR_FACETS,
  ARBOR_LENS_STATUS,
  ARBOR_RELATIONS,
  EDGE_ABSENCE_MEANING,
  EDGE_STRUCTURAL_OVERLAP,
  PROJECTED_SUPPORT,
  type ArborClaim,
  type ArborEdge,
  type ArborLensStatus,
} from "../arbor/contract.js";
import type {
  ArborInteractionReport,
  ArborJoin,
  ArborLensAvailability,
} from "../arbor/consume.js";
import { immutableSnapshot } from "./schema.js";
import { CAMPAIGN_SCHEMA_IDS } from "./vocabulary.js";

export const CAMPAIGN_MANIFEST_SCHEMA = CAMPAIGN_SCHEMA_IDS.manifest;

export const CAMPAIGN_MANIFEST_KEYS = Object.freeze([
  "schema",
  "reconId",
  "gaps",
  "entries",
] as const);

export const CAMPAIGN_MANIFEST_GAP_KEYS = Object.freeze([
  "gapIndex",
  "query",
  "status",
  "refused",
  "refusal",
  "selectedCardRefs",
] as const);

export const CAMPAIGN_MANIFEST_ENTRY_KEYS = Object.freeze([
  "reconId",
  "gapIndex",
  "gap",
  "cardRef",
  "id",
  "name",
  "title",
  "description",
  "source",
  "sourceUrl",
  "card",
  "convergenceOnly",
  "retrieval",
  "lane",
  "installability",
  "arbor",
  "graph",
  "freshness",
] as const);

export const CAMPAIGN_MANIFEST_LENS_KEYS = Object.freeze([
  "retrieval",
  "lane",
  "installability",
  "arbor",
  "graph",
  "freshness",
] as const);

export const MANIFEST_RETRIEVAL_RANKED_KEYS = Object.freeze([
  "score",
  "margin",
  "matchKind",
  "classified",
  "nameMatchesQuery",
] as const);

export const MANIFEST_RETRIEVAL_EXACT_KEYS = Object.freeze([
  "score",
  "margin",
  "matchKind",
  "matchedBy",
  "classified",
  "nameMatchesQuery",
] as const);

export const MANIFEST_RETRIEVAL_ABSENT_KEYS = Object.freeze([
  "status",
  "reason",
] as const);

export const MANIFEST_LANE_LENS_KEYS = Object.freeze([
  "status",
  "invocation",
  "lane",
  "convergenceOnly",
] as const);

export const MANIFEST_INSTALLABILITY_LENS_KEYS = Object.freeze([
  "status",
  "state",
  "reason",
  "applicability",
  "applicabilityReason",
  "observationDigest",
  "observedAt",
] as const);

export const MANIFEST_ARBOR_LENS_KEYS = Object.freeze([
  "status",
  "availability",
  "join",
  "upstreamStatus",
  "sourceDigest",
  "claims",
  "conditionsEvaluated",
  "reason",
  "hellHeaven",
] as const);

export const MANIFEST_ARBOR_HELL_HEAVEN_KEYS = Object.freeze([
  "status",
  "availability",
  "upstreamStatus",
  "reason",
] as const);

export const MANIFEST_GRAPH_LENS_KEYS = Object.freeze([
  "status",
  "availability",
  "join",
  "upstreamStatus",
  "sourceDigest",
  "absenceMeaning",
  "relations",
  "reason",
] as const);

export const MANIFEST_FRESHNESS_PRESENT_KEYS = Object.freeze([
  "status",
  "indexGeneratedAt",
  "indexAgeDays",
  "stale",
  "indexOrigin",
  "source",
] as const);

export const MANIFEST_FRESHNESS_ABSENT_KEYS = Object.freeze([
  "status",
  "indexGeneratedAt",
  "indexAgeDays",
  "stale",
  "indexOrigin",
  "source",
  "reason",
] as const);

export type ManifestRetrievalMatchedBy = Readonly<{
  key: "id" | "catalogRef" | "name";
  scope: "whole-query" | "within-query";
}>;

export type ManifestRetrievalRankedLens = Readonly<{
  score: number;
  margin: number;
  matchKind: "ranked";
  classified: boolean;
  nameMatchesQuery: boolean;
}>;

export type ManifestRetrievalExactLens = Readonly<{
  score: number;
  margin: number;
  matchKind: "exact";
  matchedBy: ManifestRetrievalMatchedBy;
  classified: boolean;
  nameMatchesQuery: boolean;
}>;

export type ManifestRetrievalAbsentLens = Readonly<{
  status: "absent-not-measured" | "absent-unavailable";
  reason: string;
}>;

export type ManifestRetrievalLens =
  | ManifestRetrievalRankedLens
  | ManifestRetrievalExactLens
  | ManifestRetrievalAbsentLens;

export type ManifestLaneLens = Readonly<{
  status: "present" | "absent-not-published" | "absent-unknown";
  invocation: "human" | "model" | "any";
  lane: "human-led" | "model-led" | "unclassified";
  convergenceOnly: boolean;
}>;

export type ManifestInstallabilityLens = Readonly<{
  status:
    | "present"
    | "absent-unknown"
    | "absent-not-configured"
    | "absent-not-applicable"
    | "absent-unavailable";
  state: "materializable" | "not-materializable" | "unknown";
  reason: string | null;
  applicability: "verified" | "unknown";
  applicabilityReason: string;
  observationDigest: string | null;
  observedAt: string | null;
}>;

export type ManifestArborHellHeavenLens = Readonly<{
  status: string;
  availability: ArborLensAvailability;
  upstreamStatus: ArborLensStatus | null;
  reason: string;
}>;

export type ManifestArborLens = Readonly<{
  status: string;
  availability: ArborLensAvailability;
  join: ArborJoin;
  upstreamStatus: ArborLensStatus | null;
  sourceDigest: string | null;
  claims: readonly ArborClaim[];
  conditionsEvaluated: false;
  reason: string;
  hellHeaven: ManifestArborHellHeavenLens;
}>;

export type ManifestGraphLens = Readonly<{
  status: string;
  availability: ArborLensAvailability;
  join: ArborJoin;
  upstreamStatus: ArborLensStatus | null;
  sourceDigest: string | null;
  absenceMeaning: typeof EDGE_ABSENCE_MEANING;
  relations: readonly ArborInteractionReport[];
  reason: string;
}>;

export type ManifestFreshnessPresentLens = Readonly<{
  status: "present";
  indexGeneratedAt: string;
  indexAgeDays: number | null;
  stale: boolean;
  indexOrigin: "committed" | "fetched";
  source: string;
}>;

export type ManifestFreshnessAbsentLens = Readonly<{
  status: "absent-unavailable";
  indexGeneratedAt: null;
  indexAgeDays: null;
  stale: null;
  indexOrigin: null;
  source: string | null;
  reason: string;
}>;

export type ManifestFreshnessLens =
  | ManifestFreshnessPresentLens
  | ManifestFreshnessAbsentLens;

export type CampaignManifestGapRefusal = Readonly<{
  kind: "no-match" | "refused";
  reason: string;
  note: string;
}>;

export type CampaignManifestGap = Readonly<{
  gapIndex: number;
  query: string;
  status: "matched" | "no-match" | "refused";
  refused: boolean;
  refusal: CampaignManifestGapRefusal | null;
  selectedCardRefs: readonly string[];
}>;

export type CampaignManifestEntry = Readonly<{
  reconId: string;
  gapIndex: number;
  gap: string;
  cardRef: string;
  id: string;
  name: string;
  title: string | null;
  description: string;
  source: string;
  sourceUrl: string | null;
  card: string;
  convergenceOnly: boolean;
  retrieval: ManifestRetrievalLens;
  lane: ManifestLaneLens;
  installability: ManifestInstallabilityLens;
  arbor: ManifestArborLens;
  graph: ManifestGraphLens;
  freshness: ManifestFreshnessLens;
}>;

export type CampaignManifest = Readonly<{
  schema: typeof CAMPAIGN_MANIFEST_SCHEMA;
  reconId: string;
  gaps: readonly CampaignManifestGap[];
  entries: readonly CampaignManifestEntry[];
}>;

type AssertExactKeys<T, Allowed extends readonly string[]> =
  Exclude<keyof T, Allowed[number]> extends never
    ? Exclude<Allowed[number], keyof T> extends never
      ? true
      : never
    : never;

const _exactKeyAssertions: readonly [
  AssertExactKeys<CampaignManifest, typeof CAMPAIGN_MANIFEST_KEYS>,
  AssertExactKeys<CampaignManifestGap, typeof CAMPAIGN_MANIFEST_GAP_KEYS>,
  AssertExactKeys<CampaignManifestEntry, typeof CAMPAIGN_MANIFEST_ENTRY_KEYS>,
  AssertExactKeys<ManifestRetrievalRankedLens, typeof MANIFEST_RETRIEVAL_RANKED_KEYS>,
  AssertExactKeys<ManifestRetrievalExactLens, typeof MANIFEST_RETRIEVAL_EXACT_KEYS>,
  AssertExactKeys<ManifestRetrievalAbsentLens, typeof MANIFEST_RETRIEVAL_ABSENT_KEYS>,
  AssertExactKeys<ManifestLaneLens, typeof MANIFEST_LANE_LENS_KEYS>,
  AssertExactKeys<ManifestInstallabilityLens, typeof MANIFEST_INSTALLABILITY_LENS_KEYS>,
  AssertExactKeys<ManifestArborLens, typeof MANIFEST_ARBOR_LENS_KEYS>,
  AssertExactKeys<ManifestArborHellHeavenLens, typeof MANIFEST_ARBOR_HELL_HEAVEN_KEYS>,
  AssertExactKeys<ManifestGraphLens, typeof MANIFEST_GRAPH_LENS_KEYS>,
  AssertExactKeys<ManifestFreshnessPresentLens, typeof MANIFEST_FRESHNESS_PRESENT_KEYS>,
  AssertExactKeys<ManifestFreshnessAbsentLens, typeof MANIFEST_FRESHNESS_ABSENT_KEYS>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true];
void _exactKeyAssertions;

export type ReconCandidateRetrievalInput =
  | ManifestRetrievalLens
  | Readonly<{
      score: number;
      margin: number;
      matchKind: "exact" | "ranked";
      matchedBy?: ManifestRetrievalMatchedBy | undefined;
      classified: boolean;
      nameMatchesQuery: boolean;
    }>;

export type ReconCandidateCardInput = Readonly<{
  cardRef: string;
  id: string;
  name: string;
  title: string | null;
  description: string;
  source: string;
  sourceUrl: string | null;
  card: string;
  retrieval: ReconCandidateRetrievalInput;
  lane: ManifestLaneLens;
  installability: ManifestInstallabilityLens;
  arbor: ManifestArborLens;
  graph: ManifestGraphLens;
  freshness: ManifestFreshnessLens;
}>;

export type ReconGapRecordInput = Readonly<{
  gapIndex: number;
  query: string;
  status: "matched" | "no-match" | "refused";
  refused: boolean;
  refusal: CampaignManifestGapRefusal | null;
  candidates: readonly ReconCandidateCardInput[];
  noMatch?: unknown;
  filtered?: unknown;
  freshness?: unknown;
  installability?: unknown;
  lane?: unknown;
  arbor?: unknown;
  graph?: unknown;
}>;

export type CampaignReconRecordInput = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.recon;
  reconId: string;
  gaps: readonly ReconGapRecordInput[];
  findings?: readonly string[];
  citations?: readonly string[];
  records?: unknown;
}>;

export type CampaignManifestSelectionItemObject = Readonly<{
  reconId?: string;
  gapIndex?: number;
  gap?: string | number;
  cardRef: string;
  id?: string;
  skillId?: string;
}>;

export type CampaignManifestSelectionItem =
  | string
  | CampaignManifestSelectionItemObject;

export type CampaignManifestSelectionInput =
  | readonly CampaignManifestSelectionItem[]
  | Readonly<{
      reconId?: string;
      selections?: readonly CampaignManifestSelectionItem[];
      entries?: readonly CampaignManifestSelectionItem[];
    }>;

export class CampaignManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignManifestError";
  }
}

type Check = (v: unknown) => boolean;

const GAP_STATUSES = ["matched", "no-match", "refused"] as const;
const REFUSAL_KINDS = ["no-match", "refused"] as const;
const RETRIEVAL_MATCHED_BY_KEYS = ["id", "catalogRef", "name"] as const;
const RETRIEVAL_MATCHED_BY_SCOPES = ["whole-query", "within-query"] as const;
const RETRIEVAL_ABSENT_STATUSES = [
  "absent-not-measured",
  "absent-unavailable",
] as const;
const LANE_STATUSES = [
  "present",
  "absent-not-published",
  "absent-unknown",
] as const;
const LANE_INVOCATIONS = ["human", "model", "any"] as const;
const LANE_CLASSES = ["human-led", "model-led", "unclassified"] as const;
const INSTALLABILITY_STATUSES = [
  "present",
  "absent-unknown",
  "absent-not-configured",
  "absent-not-applicable",
  "absent-unavailable",
] as const;
const INSTALLABILITY_STATES = [
  "materializable",
  "not-materializable",
  "unknown",
] as const;
const INSTALLABILITY_APPLICABILITY = ["verified", "unknown"] as const;
const ARBOR_AVAILABILITIES = ["consulted", "absent", "unknown"] as const;
const ARBOR_JOINS = [
  "content-pinned",
  "identity-unproven",
  "subject-version-unmatched",
  "no-published-subject",
  "source-not-canonical",
  "publication-unavailable",
] as const;
const INTERACTION_DIRECTIONS = [
  "subject-acts-on",
  "acts-on-subject",
] as const;
const COUNTERPART_PINS = ["verified", "mismatched", "unverified"] as const;
const INDEX_ORIGINS = ["committed", "fetched"] as const;

const SELECTION_CONTAINER_KEYS = ["reconId", "selections", "entries"] as const;
const SELECTION_ITEM_KEYS = [
  "reconId",
  "gapIndex",
  "gap",
  "cardRef",
  "id",
  "skillId",
] as const;

const str: Check = (v) => typeof v === "string";
const text: Check = (v) => typeof v === "string" && v.trim().length > 0;
const bool: Check = (v) => typeof v === "boolean";
const finiteNum: Check = (v) => typeof v === "number" && Number.isFinite(v);
const nonNegFiniteNum: Check = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const nat: Check = (v) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const member =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v);
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);

function closedObject(
  v: unknown,
  fields: Record<string, Check>,
  optional: readonly string[] = [],
): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(v).some(
      (k) => typeof k !== "string" || !Object.hasOwn(fields, k),
    )
  ) {
    return false;
  }
  return Object.entries(fields).every(([k, check]) => {
    const d = descriptors[k];
    return d
      ? Object.hasOwn(d, "value") && d.enumerable === true && check(d.value)
      : optional.includes(k);
  });
}

const strictArray =
  (check: Check): Check =>
  (v) => {
    if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) {
      return false;
    }
    if (Reflect.ownKeys(v).length !== v.length + 1) return false;
    for (let i = 0; i < v.length; i++) {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (!d || !Object.hasOwn(d, "value") || !d.enumerable || !check(d.value)) {
        return false;
      }
    }
    return true;
  };

const matchedByCheck: Check = (v) =>
  closedObject(v, {
    key: member(RETRIEVAL_MATCHED_BY_KEYS),
    scope: member(RETRIEVAL_MATCHED_BY_SCOPES),
  });

const retrievalLensCheck: Check = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const statusDesc = Object.getOwnPropertyDescriptor(v, "status");
  if (statusDesc && Object.hasOwn(statusDesc, "value")) {
    return closedObject(v, {
      status: member(RETRIEVAL_ABSENT_STATUSES),
      reason: text,
    });
  }
  const mkDesc = Object.getOwnPropertyDescriptor(v, "matchKind");
  if (!mkDesc || !Object.hasOwn(mkDesc, "value")) return false;
  if (mkDesc.value === "ranked") {
    return closedObject(v, {
      score: finiteNum,
      margin: finiteNum,
      matchKind: (x) => x === "ranked",
      classified: bool,
      nameMatchesQuery: bool,
    });
  }
  if (mkDesc.value === "exact") {
    return closedObject(v, {
      score: finiteNum,
      margin: finiteNum,
      matchKind: (x) => x === "exact",
      matchedBy: matchedByCheck,
      classified: bool,
      nameMatchesQuery: bool,
    });
  }
  return false;
};

const laneLensCheck: Check = (v) => {
  if (
    !closedObject(v, {
      status: member(LANE_STATUSES),
      invocation: member(LANE_INVOCATIONS),
      lane: member(LANE_CLASSES),
      convergenceOnly: bool,
    })
  ) {
    return false;
  }
  const lane = v as ManifestLaneLens;
  const expectedConvergenceOnly =
    lane.lane === "human-led" || lane.invocation === "human";
  return lane.convergenceOnly === expectedConvergenceOnly;
};

const installabilityLensCheck: Check = (v) => {
  if (
    !closedObject(v, {
      status: member(INSTALLABILITY_STATUSES),
      state: member(INSTALLABILITY_STATES),
      reason: nullable(text),
      applicability: member(INSTALLABILITY_APPLICABILITY),
      applicabilityReason: text,
      observationDigest: nullable(text),
      observedAt: nullable(text),
    })
  ) {
    return false;
  }
  const inst = v as ManifestInstallabilityLens;
  if (inst.status === "present") {
    return (
      inst.applicability === "verified" &&
      (inst.state === "materializable" || inst.state === "not-materializable")
    );
  }
  return true;
};

const arborSubjectRefCheck: Check = (v) =>
  closedObject(v, {
    id: text,
    contentSha256: text,
  });

const arborAuthorityCheck: Check = (v) =>
  closedObject(v, {
    actor: text,
    basis: text,
  });

const arborClaimCheck: Check = (v) =>
  closedObject(v, {
    id: text,
    facet: member(ARBOR_FACETS),
    conditions: str,
    rationale: str,
    authority: arborAuthorityCheck,
    support: member(PROJECTED_SUPPORT),
    declarationId: text,
    declaredAt: text,
    declarationSource: text,
    benchmarkSources: strictArray(text),
    interpretationSource: nullable(text),
  });

const arborHellHeavenCheck: Check = (v) =>
  closedObject(v, {
    status: text,
    availability: member(ARBOR_AVAILABILITIES),
    upstreamStatus: nullable(member(ARBOR_LENS_STATUS)),
    reason: text,
  });

const arborLensCheck: Check = (v) =>
  closedObject(v, {
    status: text,
    availability: member(ARBOR_AVAILABILITIES),
    join: member(ARBOR_JOINS),
    upstreamStatus: nullable(member(ARBOR_LENS_STATUS)),
    sourceDigest: nullable(text),
    claims: strictArray(arborClaimCheck),
    conditionsEvaluated: (x) => x === false,
    reason: text,
    hellHeaven: arborHellHeavenCheck,
  });

const arborEdgeCheck: Check = (v) =>
  closedObject(v, {
    schema: (x) => x === ARBOR_EDGE_SCHEMA,
    edgeKey: text,
    pair: (p) =>
      closedObject(p, {
        from: arborSubjectRefCheck,
        to: arborSubjectRefCheck,
      }),
    target: (t) =>
      closedObject(t, {
        declarationSha256: text,
        claimId: text,
      }),
    relation: member(ARBOR_RELATIONS),
    conditions: str,
    authority: arborAuthorityCheck,
    support: member(PROJECTED_SUPPORT),
    declarationSource: text,
    observationSources: strictArray(text),
    interpretationSource: nullable(text),
    structuralOverlap: (x) => x === EDGE_STRUCTURAL_OVERLAP,
    pairApplicable: bool,
  });

const arborInteractionCheck: Check = (v) =>
  closedObject(v, {
    edge: arborEdgeCheck,
    direction: member(INTERACTION_DIRECTIONS),
    counterpart: arborSubjectRefCheck,
    counterpartPin: member(COUNTERPART_PINS),
  });

const graphLensCheck: Check = (v) =>
  closedObject(v, {
    status: text,
    availability: member(ARBOR_AVAILABILITIES),
    join: member(ARBOR_JOINS),
    upstreamStatus: nullable(member(ARBOR_LENS_STATUS)),
    sourceDigest: nullable(text),
    absenceMeaning: (x) => x === EDGE_ABSENCE_MEANING,
    relations: strictArray(arborInteractionCheck),
    reason: text,
  });

const freshnessLensCheck: Check = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const statusDesc = Object.getOwnPropertyDescriptor(v, "status");
  if (!statusDesc || !Object.hasOwn(statusDesc, "value")) return false;
  if (statusDesc.value === "present") {
    return closedObject(v, {
      status: (x) => x === "present",
      indexGeneratedAt: text,
      indexAgeDays: nullable(nonNegFiniteNum),
      stale: bool,
      indexOrigin: member(INDEX_ORIGINS),
      source: text,
    });
  }
  if (statusDesc.value === "absent-unavailable") {
    return closedObject(v, {
      status: (x) => x === "absent-unavailable",
      indexGeneratedAt: (x) => x === null,
      indexAgeDays: (x) => x === null,
      stale: (x) => x === null,
      indexOrigin: (x) => x === null,
      source: nullable(text),
      reason: text,
    });
  }
  return false;
};

const gapRefusalCheck: Check = (v) =>
  closedObject(v, {
    kind: member(REFUSAL_KINDS),
    reason: text,
    note: text,
  });

const manifestGapCheck: Check = (v) => {
  if (
    !closedObject(v, {
      gapIndex: nat,
      query: text,
      status: member(GAP_STATUSES),
      refused: bool,
      refusal: nullable(gapRefusalCheck),
      selectedCardRefs: strictArray(text),
    })
  ) {
    return false;
  }
  const gap = v as CampaignManifestGap;
  if (gap.status === "matched") {
    return !gap.refused && gap.refusal === null;
  }
  return (
    gap.refused &&
    gap.refusal !== null &&
    gap.refusal.kind === gap.status &&
    gap.selectedCardRefs.length === 0
  );
};

const manifestEntryCheck: Check = (v) => {
  if (
    !closedObject(v, {
      reconId: text,
      gapIndex: nat,
      gap: text,
      cardRef: text,
      id: text,
      name: text,
      title: nullable(text),
      description: str,
      source: text,
      sourceUrl: nullable(text),
      card: text,
      convergenceOnly: bool,
      retrieval: retrievalLensCheck,
      lane: laneLensCheck,
      installability: installabilityLensCheck,
      arbor: arborLensCheck,
      graph: graphLensCheck,
      freshness: freshnessLensCheck,
    })
  ) {
    return false;
  }
  const entry = v as CampaignManifestEntry;
  const expectedCardRef = formatCardRef(entry.reconId, entry.gapIndex, entry.id);
  if (entry.cardRef !== expectedCardRef) return false;
  const expectedConvergenceOnly =
    entry.lane.lane === "human-led" || entry.lane.invocation === "human";
  return (
    entry.lane.convergenceOnly === expectedConvergenceOnly &&
    entry.convergenceOnly === expectedConvergenceOnly
  );
};

const manifestCheck: Check = (v) => {
  if (
    !closedObject(v, {
      schema: (x) => x === CAMPAIGN_MANIFEST_SCHEMA,
      reconId: text,
      gaps: strictArray(manifestGapCheck),
      entries: strictArray(manifestEntryCheck),
    })
  ) {
    return false;
  }
  const manifest = v as CampaignManifest;
  for (let i = 0; i < manifest.gaps.length; i++) {
    if (manifest.gaps[i]!.gapIndex !== i) return false;
  }

  const refsByGap = new Map<number, string[]>();
  for (let i = 0; i < manifest.gaps.length; i++) {
    refsByGap.set(i, []);
  }

  for (const entry of manifest.entries) {
    if (entry.reconId !== manifest.reconId) return false;
    const gap = manifest.gaps[entry.gapIndex];
    if (!gap || gap.status !== "matched" || gap.refused) return false;
    if (gap.query !== entry.gap) return false;
    refsByGap.get(entry.gapIndex)!.push(entry.cardRef);
  }

  for (let i = 0; i < manifest.gaps.length; i++) {
    const gap = manifest.gaps[i]!;
    const expectedRefs = refsByGap.get(i)!;
    if (gap.selectedCardRefs.length !== expectedRefs.length) return false;
    for (let j = 0; j < expectedRefs.length; j++) {
      if (gap.selectedCardRefs[j] !== expectedRefs[j]) return false;
    }
  }

  return true;
};

function formatCardRef(reconId: string, gapIndex: number, id: string): string {
  return `recon:${reconId}:gap:${gapIndex}:card:${id}`;
}

function normalizeRetrievalLens(
  retrieval: ReconCandidateRetrievalInput,
): ManifestRetrievalLens | null {
  if (!retrieval || typeof retrieval !== "object" || Array.isArray(retrieval)) {
    return null;
  }
  const proto = Object.getPrototypeOf(retrieval);
  if (proto !== Object.prototype && proto !== null) return null;

  const statusDesc = Object.getOwnPropertyDescriptor(retrieval, "status");
  if (statusDesc && Object.hasOwn(statusDesc, "value")) {
    if (!retrievalLensCheck(retrieval)) return null;
    return retrieval as ManifestRetrievalAbsentLens;
  }

  const mkDesc = Object.getOwnPropertyDescriptor(retrieval, "matchKind");
  if (!mkDesc || !Object.hasOwn(mkDesc, "value")) return null;

  if (mkDesc.value === "ranked") {
    const matchedByDesc = Object.getOwnPropertyDescriptor(retrieval, "matchedBy");
    if (matchedByDesc) {
      if (!Object.hasOwn(matchedByDesc, "value") || matchedByDesc.value !== undefined) {
        return null;
      }
      // Accept U1 RetrievalDisclosure objects that have `matchedBy: undefined`.
      const allowedRankedWithUndefined = new Set([
        ...MANIFEST_RETRIEVAL_RANKED_KEYS,
        "matchedBy",
      ]);
      if (
        Reflect.ownKeys(retrieval).some(
          (k) => typeof k !== "string" || !allowedRankedWithUndefined.has(k),
        )
      ) {
        return null;
      }
      const r = retrieval as {
        score: unknown;
        margin: unknown;
        matchKind: unknown;
        classified: unknown;
        nameMatchesQuery: unknown;
      };
      const normalized = {
        score: r.score,
        margin: r.margin,
        matchKind: "ranked" as const,
        classified: r.classified,
        nameMatchesQuery: r.nameMatchesQuery,
      };
      return retrievalLensCheck(normalized)
        ? (normalized as ManifestRetrievalRankedLens)
        : null;
    }
    return retrievalLensCheck(retrieval)
      ? (retrieval as ManifestRetrievalRankedLens)
      : null;
  }

  if (mkDesc.value === "exact") {
    return retrievalLensCheck(retrieval)
      ? (retrieval as ManifestRetrievalExactLens)
      : null;
  }

  return null;
}

function validateReconRecord(
  recon: unknown,
): { ok: true; recon: CampaignReconRecordInput } | { ok: false; error: string } {
  if (
    !closedObject(
      recon,
      {
        schema: (x) => x === CAMPAIGN_SCHEMA_IDS.recon,
        reconId: text,
        gaps: strictArray(() => true),
        findings: strictArray(text),
        citations: strictArray(text),
        records: () => true,
      },
      ["findings", "citations", "records"],
    )
  ) {
    return {
      ok: false,
      error:
        "Recon record must be a closed plain object with valid schema, reconId, and dense gaps array.",
    };
  }
  const r = recon as CampaignReconRecordInput;
  for (let i = 0; i < r.gaps.length; i++) {
    const gap = r.gaps[i];
    if (
      !closedObject(
        gap,
        {
          gapIndex: (x) => x === i,
          query: text,
          status: member(GAP_STATUSES),
          refused: bool,
          noMatch: () => true,
          refusal: nullable(gapRefusalCheck),
          candidates: strictArray(() => true),
          filtered: () => true,
          freshness: () => true,
          installability: () => true,
          lane: () => true,
          arbor: () => true,
          graph: () => true,
        },
        [
          "noMatch",
          "filtered",
          "freshness",
          "installability",
          "lane",
          "arbor",
          "graph",
        ],
      )
    ) {
      return {
        ok: false,
        error: `Recon gap ${i} must be a closed plain object with valid fields and dense candidates array.`,
      };
    }
    const g = gap as ReconGapRecordInput;
    if (g.status === "matched") {
      if (g.refused || g.refusal !== null) {
        return {
          ok: false,
          error: `Recon gap ${i} with status "matched" must have refused: false and refusal: null.`,
        };
      }
    } else {
      if (
        !g.refused ||
        g.refusal === null ||
        !gapRefusalCheck(g.refusal) ||
        g.refusal.kind !== g.status
      ) {
        return {
          ok: false,
          error: `Recon gap ${i} with status "${String(g.status)}" must have matching refusal.`,
        };
      }
    }
    for (let j = 0; j < g.candidates.length; j++) {
      const c = g.candidates[j];
      if (
        !closedObject(c, {
          cardRef: text,
          id: text,
          name: text,
          title: nullable(text),
          description: str,
          source: text,
          sourceUrl: nullable(text),
          card: text,
          retrieval: (v) =>
            normalizeRetrievalLens(v as ReconCandidateRetrievalInput) !== null,
          lane: (v) =>
            closedObject(v, {
              status: member(LANE_STATUSES),
              invocation: member(LANE_INVOCATIONS),
              lane: member(LANE_CLASSES),
              convergenceOnly: bool,
            }),
          freshness: freshnessLensCheck,
          installability: installabilityLensCheck,
          arbor: arborLensCheck,
          graph: graphLensCheck,
        })
      ) {
        return {
          ok: false,
          error: `Recon gap ${i} candidate ${j} must be a closed plain object with valid fields and lenses.`,
        };
      }
      if (c.cardRef !== formatCardRef(r.reconId, i, c.id)) {
        return {
          ok: false,
          error: `Recon gap ${i} candidate ${j} has invalid id or cardRef.`,
        };
      }
    }
  }
  return { ok: true, recon: r };
}

function parseSelectionItems(
  selectionInput: unknown,
  reconId: string,
):
  | { ok: true; items: readonly CampaignManifestSelectionItemObject[] }
  | { ok: false; error: string } {
  let rawItems: unknown;

  if (Array.isArray(selectionInput)) {
    if (
      Object.getPrototypeOf(selectionInput) !== Array.prototype ||
      Reflect.ownKeys(selectionInput).length !== selectionInput.length + 1
    ) {
      return { ok: false, error: "Selection array must be a dense standard array." };
    }
    rawItems = selectionInput;
  } else if (selectionInput && typeof selectionInput === "object") {
    if (
      !closedObject(
        selectionInput,
        {
          reconId: text,
          selections: strictArray(() => true),
          entries: strictArray(() => true),
        },
        SELECTION_CONTAINER_KEYS,
      )
    ) {
      return {
        ok: false,
        error:
          "Selection container has unknown, non-enumerable, symbol, accessor, or invalid fields.",
      };
    }
    const container = selectionInput as {
      reconId?: string;
      selections?: unknown[];
      entries?: unknown[];
    };
    if (container.reconId !== undefined && container.reconId !== reconId) {
      return {
        ok: false,
        error: `Selection container reconId (${container.reconId}) does not match recon (${reconId}).`,
      };
    }
    if (container.selections !== undefined && container.entries !== undefined) {
      return {
        ok: false,
        error: "Selection container must not specify both selections and entries.",
      };
    }
    if (container.selections !== undefined) {
      rawItems = container.selections;
    } else if (container.entries !== undefined) {
      rawItems = container.entries;
    } else {
      return {
        ok: false,
        error: "Selection container must include selections or entries.",
      };
    }
  } else {
    return {
      ok: false,
      error: "Selection input must be an array or selection container object.",
    };
  }

  const items: CampaignManifestSelectionItemObject[] = [];
  const arr = rawItems as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const d = Object.getOwnPropertyDescriptor(arr, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) {
      return { ok: false, error: `Selection item ${i} must be an own enumerable element.` };
    }
    const raw = d.value;
    if (typeof raw === "string") {
      if (!text(raw)) {
        return { ok: false, error: `Selection item ${i} cardRef must be non-empty.` };
      }
      items.push({ cardRef: raw });
      continue;
    }
    if (
      !closedObject(
        raw,
        {
          reconId: text,
          gapIndex: nat,
          gap: (v) => text(v) || nat(v),
          cardRef: text,
          id: text,
          skillId: text,
        },
        ["reconId", "gapIndex", "gap", "id", "skillId"],
      )
    ) {
      return {
        ok: false,
        error: `Selection item ${i} is invalid or contains disallowed fields.`,
      };
    }
    items.push(raw as CampaignManifestSelectionItemObject);
  }

  return { ok: true, items };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(b as object, key)) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

export function tryBuildCampaignManifest(
  reconInput: CampaignReconRecordInput,
  selectionInput: CampaignManifestSelectionInput,
): { ok: true; manifest: CampaignManifest } | { ok: false; error: string } {
  const validRecon = validateReconRecord(reconInput);
  if (!validRecon.ok) return validRecon;
  const recon = validRecon.recon;

  const parsedItems = parseSelectionItems(selectionInput, recon.reconId);
  if (!parsedItems.ok) return parsedItems;

  const candidatesByCardRef = new Map<
    string,
    { gap: ReconGapRecordInput; candidate: ReconCandidateCardInput }
  >();
  for (const gap of recon.gaps) {
    for (const candidate of gap.candidates) {
      candidatesByCardRef.set(candidate.cardRef, { gap, candidate });
    }
  }

  const selectedRefsByGap = new Map<number, string[]>();
  for (const gap of recon.gaps) {
    selectedRefsByGap.set(gap.gapIndex, []);
  }

  const entries: CampaignManifestEntry[] = [];
  for (let i = 0; i < parsedItems.items.length; i++) {
    const item = parsedItems.items[i]!;
    if (item.reconId !== undefined && item.reconId !== recon.reconId) {
      return {
        ok: false,
        error: `Selection item ${i} cites reconId "${item.reconId}" instead of "${recon.reconId}".`,
      };
    }

    const found = candidatesByCardRef.get(item.cardRef);
    if (!found) {
      return {
        ok: false,
        error: `Selection item ${i} cardRef "${item.cardRef}" is not present in recon "${recon.reconId}".`,
      };
    }

    const { gap, candidate } = found;
    if (
      recon.citations !== undefined &&
      !recon.citations.includes(candidate.cardRef)
    ) {
      return {
        ok: false,
        error: `Selection item ${i} cardRef "${candidate.cardRef}" is not present in recon.citations.`,
      };
    }
    if (gap.status !== "matched" || gap.refused) {
      return {
        ok: false,
        error: `Selection item ${i} references gap ${gap.gapIndex} with status "${gap.status}", which cannot yield manifest entries.`,
      };
    }

    if (item.gapIndex !== undefined && item.gapIndex !== gap.gapIndex) {
      return {
        ok: false,
        error: `Selection item ${i} gapIndex (${item.gapIndex}) does not match cited candidate gapIndex (${gap.gapIndex}).`,
      };
    }
    if (item.gap !== undefined) {
      if (typeof item.gap === "string" && item.gap !== gap.query) {
        return {
          ok: false,
          error: `Selection item ${i} gap "${item.gap}" does not match cited gap query "${gap.query}".`,
        };
      }
      if (typeof item.gap === "number" && item.gap !== gap.gapIndex) {
        return {
          ok: false,
          error: `Selection item ${i} gap index ${item.gap} does not match cited gapIndex ${gap.gapIndex}.`,
        };
      }
    }
    if (item.id !== undefined && item.id !== candidate.id) {
      return {
        ok: false,
        error: `Selection item ${i} id "${item.id}" does not match cited candidate id "${candidate.id}".`,
      };
    }
    if (item.skillId !== undefined && item.skillId !== candidate.id) {
      return {
        ok: false,
        error: `Selection item ${i} skillId "${item.skillId}" does not match cited candidate id "${candidate.id}".`,
      };
    }

    const retrieval = normalizeRetrievalLens(candidate.retrieval);
    if (!retrieval) {
      return {
        ok: false,
        error: `Candidate "${candidate.cardRef}" has an invalid retrieval lens.`,
      };
    }

    const convergenceOnly =
      candidate.lane.lane === "human-led" ||
      candidate.lane.invocation === "human";

    const entry: CampaignManifestEntry = {
      reconId: recon.reconId,
      gapIndex: gap.gapIndex,
      gap: gap.query,
      cardRef: candidate.cardRef,
      id: candidate.id,
      name: candidate.name,
      title: candidate.title,
      description: candidate.description,
      source: candidate.source,
      sourceUrl: candidate.sourceUrl,
      card: candidate.card,
      convergenceOnly,
      retrieval,
      lane: {
        status: candidate.lane.status,
        invocation: candidate.lane.invocation,
        lane: candidate.lane.lane,
        convergenceOnly,
      },
      installability: candidate.installability,
      arbor: candidate.arbor,
      graph: candidate.graph,
      freshness: candidate.freshness,
    };

    entries.push(entry);
    selectedRefsByGap.get(gap.gapIndex)!.push(candidate.cardRef);
  }

  const gaps: CampaignManifestGap[] = recon.gaps.map((gap) => ({
    gapIndex: gap.gapIndex,
    query: gap.query,
    status: gap.status,
    refused: gap.refused,
    refusal: gap.refusal
      ? {
          kind: gap.refusal.kind,
          reason: gap.refusal.reason,
          note: gap.refusal.note,
        }
      : null,
    selectedCardRefs: selectedRefsByGap.get(gap.gapIndex)!,
  }));

  const manifest: CampaignManifest = {
    schema: CAMPAIGN_MANIFEST_SCHEMA,
    reconId: recon.reconId,
    gaps,
    entries,
  };

  if (!manifestCheck(manifest)) {
    return {
      ok: false,
      error: "Built manifest failed internal schema invariants.",
    };
  }

  return { ok: true, manifest: immutableSnapshot(manifest) };
}

export function buildCampaignManifest(
  recon: CampaignReconRecordInput,
  selectionInput: CampaignManifestSelectionInput,
): CampaignManifest {
  const result = tryBuildCampaignManifest(recon, selectionInput);
  if (!result.ok) {
    throw new CampaignManifestError(result.error);
  }
  return result.manifest;
}

export function isValidManifestForRecon(
  reconInput: CampaignReconRecordInput | null,
  value: unknown,
): boolean {
  if (!reconInput) return false;
  const validRecon = validateReconRecord(reconInput);
  if (!validRecon.ok) return false;
  const recon = validRecon.recon;

  const manifest = parseCampaignManifest(value);
  if (!manifest) return false;

  if (manifest.reconId !== recon.reconId) return false;
  if (manifest.gaps.length !== recon.gaps.length) return false;

  for (let i = 0; i < recon.gaps.length; i++) {
    const rGap = recon.gaps[i]!;
    const mGap = manifest.gaps[i]!;
    if (
      mGap.gapIndex !== rGap.gapIndex ||
      mGap.query !== rGap.query ||
      mGap.status !== rGap.status ||
      mGap.refused !== rGap.refused ||
      !deepEqual(mGap.refusal, rGap.refusal)
    ) {
      return false;
    }
  }

  for (const entry of manifest.entries) {
    const rGap = recon.gaps[entry.gapIndex];
    if (!rGap || rGap.status !== "matched" || rGap.refused) return false;
    if (rGap.query !== entry.gap) return false;

    const candidate = rGap.candidates.find(
      (c) => c.cardRef === entry.cardRef && c.id === entry.id,
    );
    if (!candidate) return false;
    if (
      recon.citations !== undefined &&
      !recon.citations.includes(candidate.cardRef)
    ) {
      return false;
    }

    if (
      entry.name !== candidate.name ||
      entry.title !== candidate.title ||
      entry.description !== candidate.description ||
      entry.source !== candidate.source ||
      entry.sourceUrl !== candidate.sourceUrl ||
      entry.card !== candidate.card
    ) {
      return false;
    }

    const expectedRetrieval = normalizeRetrievalLens(candidate.retrieval);
    if (!expectedRetrieval || !deepEqual(entry.retrieval, expectedRetrieval)) {
      return false;
    }

    const expectedConvergenceOnly =
      candidate.lane.lane === "human-led" ||
      candidate.lane.invocation === "human";
    if (
      entry.lane.status !== candidate.lane.status ||
      entry.lane.invocation !== candidate.lane.invocation ||
      entry.lane.lane !== candidate.lane.lane ||
      entry.lane.convergenceOnly !== expectedConvergenceOnly ||
      entry.convergenceOnly !== expectedConvergenceOnly
    ) {
      return false;
    }

    if (
      !deepEqual(entry.installability, candidate.installability) ||
      !deepEqual(entry.arbor, candidate.arbor) ||
      !deepEqual(entry.graph, candidate.graph) ||
      !deepEqual(entry.freshness, candidate.freshness)
    ) {
      return false;
    }
  }

  return true;
}

export function parseCampaignManifest(
  value: unknown,
  recon?: CampaignReconRecordInput | null,
): CampaignManifest | null {
  try {
    if (!manifestCheck(value)) return null;
    const parsed = immutableSnapshot(value as CampaignManifest);
    if (recon !== undefined) {
      return isValidManifestForRecon(recon, parsed) ? parsed : null;
    }
    return parsed;
  } catch {
    return null;
  }
}
