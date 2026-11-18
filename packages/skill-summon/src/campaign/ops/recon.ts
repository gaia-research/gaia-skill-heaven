import { lstat } from "node:fs/promises";

import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  EDGE_ABSENCE_MEANING,
  immutableSnapshot,
  toControllerStatus,
  type ArborClaim,
  type ArborCompositionReport,
  type ArborInteractionReport,
  type ArborJoin,
  type ArborLensAvailability,
  type ArborLensStatus,
  type CampaignRecon,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type IndexedSkill,
} from "skill-zero";

import {
  CampaignStore,
  computeReconCoreSha256,
  formatReconSha256Citation,
  stripSelfReconShaCitation,
} from "../store.js";
import {
  buildCampaignDigest,
  readSafeCampaignStateAndDigest,
  type CampaignDigest,
  type CampaignRefusalError,
  type CampaignUnavailableDigest,
} from "./status.js";
import type { GaiaService } from "../../service.js";
import { displayField } from "../../summon/card.js";
import type { SummonSurface } from "../../summon/rank.js";
import { assertConfinedPath, type SummonSession } from "../../summon/session.js";
import {
  summon,
  type PreviewedSkill,
  type SummonArborDisclosure,
  type SummonOutcome,
} from "../../summon/summon.js";
import { ZERO_CUT_REFUSAL, type ZeroCut } from "../../zero-cut.js";

export type ReconLaneClassification = "human-led" | "model-led" | "unclassified";

export type ReconCandidateLaneLens = Readonly<{
  status: "present";
  invocation: "human" | "model" | "any";
  lane: ReconLaneClassification;
  convergenceOnly: boolean;
}>;

export type ReconFreshnessLens =
  | Readonly<{
      status: "present";
      indexGeneratedAt: string;
      indexAgeDays: number | null;
      stale: boolean;
      indexOrigin: "committed" | "fetched";
      source: string;
    }>
  | Readonly<{
      status: "absent-unavailable";
      indexGeneratedAt: null;
      indexAgeDays: null;
      stale: null;
      indexOrigin: null;
      source: string | null;
      reason: string;
    }>;

export type ReconCandidateInstallabilityLens = Readonly<{
  status: "present" | "absent-unknown" | "absent-not-configured";
  state: "materializable" | "not-materializable" | "unknown";
  reason: string | null;
  applicability: "verified" | "unknown";
  applicabilityReason: string;
  observationDigest: string | null;
  observedAt: string | null;
}>;

export type ReconGapInstallabilityLens = Readonly<{
  status: "applied" | "absent-not-configured" | "absent-not-applicable" | "absent-unavailable";
  adapterStatus: "applied" | "not-configured" | "not-applicable" | "unavailable";
  projectionIndexPath: string | null;
  sourceUrl: string | null;
  warning: string | null;
}>;

export type ReconCandidateArborLens = Readonly<{
  status: "present" | string;
  availability: ArborLensAvailability;
  join: ArborJoin;
  upstreamStatus: ArborLensStatus | null;
  sourceDigest: string | null;
  claims: readonly ArborClaim[];
  conditionsEvaluated: false;
  reason: string;
  hellHeaven: Readonly<{
    status: string;
    availability: ArborLensAvailability;
    upstreamStatus: ArborLensStatus | null;
    reason: string;
  }>;
}>;

export type ReconCandidateGraphLens = Readonly<{
  status: "present" | "absent-no-edges" | string;
  availability: ArborLensAvailability;
  join: ArborJoin;
  upstreamStatus: ArborLensStatus | null;
  sourceDigest: string | null;
  absenceMeaning: "not-evaluated";
  relations: readonly ArborInteractionReport[];
  reason: string;
}>;

export type ReconGapArborLens = Readonly<{
  status: "present" | "absent-empty-publication" | "absent-unavailable" | "absent-unreadable";
  publicationState: "loaded" | "unavailable" | "unreadable";
  subjectsPublished: number;
  edgesPublished: number;
  corpus: SummonArborDisclosure["corpus"] | null;
  identity: SummonArborDisclosure["identity"] | null;
  hellHeaven: Readonly<{
    status: "absent-not-published";
    reason: string;
  }>;
  note: string;
}>;

export type ReconGapGraphLens = Readonly<{
  status:
    | "present"
    | "absent-no-matched-edges"
    | "absent-no-edges-published"
    | "absent-publication-unavailable"
    | "absent-publication-unreadable";
  publicationState: "loaded" | "unavailable" | "unreadable";
  absenceMeaning: "not-evaluated";
  edgesPublished: number;
  matchedEdges: number;
  interactions: ArborCompositionReport["interactions"];
  band: ArborCompositionReport["band"] | null;
  note: string;
}>;

export type ReconCandidateCard = Readonly<{
  cardRef: string;
  id: string;
  name: string;
  title: string | null;
  description: string;
  source: string;
  sourceUrl: string | null;
  card: string;
  retrieval: PreviewedSkill["retrieval"];
  lane: ReconCandidateLaneLens;
  freshness: Extract<ReconFreshnessLens, { status: "present" }>;
  installability: ReconCandidateInstallabilityLens;
  arbor: ReconCandidateArborLens;
  graph: ReconCandidateGraphLens;
}>;

export type ReconGapRefusal = Readonly<{
  kind: "no-match" | "refused";
  reason: string;
  note: string;
}>;

export type ReconGapRecord = Readonly<{
  gapIndex: number;
  query: string;
  status: "matched" | "no-match" | "refused";
  refused: boolean;
  noMatch: SummonOutcome["noMatch"];
  refusal: ReconGapRefusal | null;
  candidates: readonly ReconCandidateCard[];
  filtered: SummonOutcome["filtered"];
  freshness: ReconFreshnessLens;
  installability: ReconGapInstallabilityLens;
  lane: Readonly<{ requestedSurface: SummonSurface }>;
  arbor: ReconGapArborLens;
  graph: ReconGapGraphLens;
}>;

export type CampaignReconRecord = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.recon;
  reconId: string;
  gaps: readonly ReconGapRecord[];
  findings: readonly string[];
  citations: readonly string[];
  records?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

export type CampaignReconResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.recon;
      recon: CampaignReconRecord;
      traceRecon: CampaignRecon;
      state: CampaignState;
      entry: CampaignTraceEntry;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.recon;
      error: CampaignRefusalError;
      state: CampaignState | null;
      status: ControllerStatus | null;
      digest: CampaignDigest | CampaignUnavailableDigest;
    }>;

type ParsedReconInput = Readonly<{
  gaps: readonly string[];
  surface: SummonSurface;
  source?: string;
  limit?: number;
}>;

const NO_CAPABILITY_NOTE =
  "No capability found for this gap. This is a recorded gap outcome, not a signal to explore.";

export async function executeRecon(
  service: GaiaService,
  session: SummonSession,
  rawInput: unknown,
  options: {
    zeroCut?: ZeroCut;
  } = {},
): Promise<CampaignReconResult> {
  if (options.zeroCut === "all") {
    const safe = await readSafeCampaignStateAndDigest(session.root);
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      error: Object.freeze({
        code: "zero-cut",
        message: ZERO_CUT_REFUSAL,
        retryable: false,
      }),
      state: safe.state,
      status: safe.status,
      digest: safe.digest,
    });
  }

  const parsed = parseReconInput(rawInput);
  if (!parsed.ok) {
    const store = await CampaignStore.load(session.root, { refreshStatus: false });
    const status = toControllerStatus(store.state, store.trace.at(-1));
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      error: Object.freeze({
        code: "invalid-recon-input",
        message: parsed.error,
        retryable: false,
      }),
      state: store.state,
      status,
      digest: buildCampaignDigest(store.state, status),
    });
  }

  const store = await CampaignStore.load(session.root);
  const currentStatus = toControllerStatus(store.state, store.trace.at(-1));
  const currentDigest = buildCampaignDigest(store.state, currentStatus);

  if (store.corrupted) {
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      error: Object.freeze({
        code: "campaign-corrupted",
        message: store.error ?? "Campaign store is corrupted (FAILED_SAFE).",
        retryable: false,
      }),
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
    });
  }

  if (store.state.state !== CampaignStates.recon) {
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      error: Object.freeze({
        code: "invalid-campaign-state",
        message: `Campaign recon requires campaign state RECON (current state: ${store.state.state}).`,
        retryable: false,
      }),
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
    });
  }

  const goalContract = await store.loadGoalContract().catch(() => null);
  if (goalContract === null) {
    const failedState = immutableSnapshot({
      ...store.state,
      state: CampaignStates.failedSafe,
    });
    const failedStatus = toControllerStatus(failedState);
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      error: Object.freeze({
        code: "campaign-corrupted",
        message:
          "Campaign trace is in RECON state without a committed goal contract (FAILED_SAFE).",
        retryable: false,
      }),
      state: failedState,
      status: failedStatus,
      digest: buildCampaignDigest(failedState, failedStatus),
    });
  }

  const { gaps, surface, source, limit } = parsed.value;
  const seq = store.trace.length;
  const reconId = `recon-${seq}`;
  const invocationCache = new Map<string, ReadonlyMap<string, IndexedSkill["invocation"]>>();
  const gapRecords: ReconGapRecord[] = [];

  for (let gapIndex = 0; gapIndex < gaps.length; gapIndex++) {
    const trimmedGap = gaps[gapIndex]!;
    let outcome: SummonOutcome;
    try {
      outcome = await summon(service, session, {
        query: trimmedGap,
        preview: true,
        surface,
        decision: "classic",
        live: false,
        ...(source !== undefined ? { source } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      gapRecords.push(buildRefusedGapRecord(gapIndex, trimmedGap, surface, source ?? null, reason));
      continue;
    }

    const freshness: Extract<ReconFreshnessLens, { status: "present" }> = Object.freeze({
      status: "present",
      indexGeneratedAt: outcome.ranking.indexGeneratedAt,
      indexAgeDays: outcome.ranking.indexAgeDays,
      stale: outcome.ranking.stale,
      indexOrigin: outcome.ranking.indexOrigin,
      source: outcome.ranking.source,
    });

    const installability = buildGapInstallabilityLens(outcome.ranking.installability);
    const arbor = buildGapArborLens(outcome.arbor);
    const graph = buildGapGraphLens(outcome.composition);

    if (outcome.noMatch !== null) {
      gapRecords.push(
        Object.freeze({
          gapIndex,
          query: trimmedGap,
          status: "no-match",
          refused: true,
          noMatch: outcome.noMatch,
          refusal: Object.freeze({
            kind: "no-match",
            reason: outcome.noMatch.reason,
            note: NO_CAPABILITY_NOTE,
          }),
          candidates: Object.freeze([]),
          filtered: outcome.filtered,
          freshness,
          installability,
          lane: Object.freeze({ requestedSurface: surface }),
          arbor,
          graph,
        }),
      );
      continue;
    }

    const invocationById = await loadInvocationMap(
      service,
      source,
      outcome.source,
      invocationCache,
    );

    const candidates = Object.freeze(
      outcome.previewed.map((candidate) =>
        buildCandidateCard(
          reconId,
          gapIndex,
          candidate,
          invocationById.get(candidate.id),
          freshness,
          outcome.ranking.installability?.status,
        ),
      ),
    );

    gapRecords.push(
      Object.freeze({
        gapIndex,
        query: trimmedGap,
        status: "matched",
        refused: false,
        noMatch: null,
        refusal: null,
        candidates,
        filtered: outcome.filtered,
        freshness,
        installability,
        lane: Object.freeze({ requestedSurface: surface }),
        arbor,
        graph,
      }),
    );
  }

  const frozenGaps = Object.freeze(gapRecords);
  const findings = Object.freeze(frozenGaps.map(formatGapFinding));
  const currentCitations = collectReconCitations(reconId, frozenGaps);
  const baseCitations = Object.freeze(
    stripSelfReconShaCitation(
      reconId,
      dedupeStrings([
        ...(store.state.recon?.citations ?? []),
        ...currentCitations,
      ]),
    ),
  );
  const coreSha256 = computeReconCoreSha256({
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    reconId,
    gaps: frozenGaps,
    findings,
    citations: baseCitations,
  });
  const shaCitation = formatReconSha256Citation(reconId, coreSha256);
  const citations = Object.freeze(dedupeStrings([...baseCitations, shaCitation]));

  const reconRecord: CampaignReconRecord = Object.freeze({
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    reconId,
    gaps: frozenGaps,
    findings,
    citations,
  });

  const mergedTraceFindings = Object.freeze(
    dedupeStrings([
      ...(store.state.recon?.findings ?? []),
      ...findings,
    ]),
  );

  const traceRecon: CampaignRecon = Object.freeze({
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    findings: mergedTraceFindings,
    citations,
  });

  try {
    await assertConfinedPath(
      session.root,
      store.reconPath,
      "Campaign recon artifact",
    );
    try {
      const reconStat = await lstat(store.reconPath);
      if (reconStat.isSymbolicLink() || !reconStat.isFile()) {
        throw new Error(
          `Campaign recon artifact must be a regular file: ${store.reconPath}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
      error: Object.freeze({
        code: "invalid-recon-artifact",
        message,
        retryable: false,
      }),
    });
  }

  let appended;
  try {
    appended = await store.appendRecon(reconRecord, traceRecon);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safe = await readSafeCampaignStateAndDigest(session.root);
    return Object.freeze({
      ok: false,
      refused: true,
      op: AgentOps.recon,
      state: safe.state,
      status: safe.status,
      digest: safe.digest,
      error: Object.freeze({
        code: "invalid-recon-artifact",
        message,
        retryable: false,
      }),
    });
  }

  const digest = buildCampaignDigest(appended.state, appended.status);
  return Object.freeze({
    ok: true,
    refused: false,
    op: AgentOps.recon,
    recon: reconRecord,
    traceRecon,
    state: appended.state,
    entry: appended.entry,
    status: appended.status,
    digest,
  });
}

export async function readPersistedReconRecord(
  sessionRoot: string,
  reconId?: string,
): Promise<CampaignReconRecord | null> {
  const store = await CampaignStore.load(sessionRoot, {
    refreshStatus: false,
  });
  if (store.corrupted) {
    throw new Error(
      store.error ?? "Campaign store is corrupted (FAILED_SAFE).",
    );
  }
  const artifact = await store.loadReconArtifact(reconId);
  if (!artifact) {
    return null;
  }
  return Object.freeze(artifact as CampaignReconRecord);
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function parseReconInput(
  rawInput: unknown,
): { ok: true; value: ParsedReconInput } | { ok: false; error: string } {
  if (!isPlainObject(rawInput)) {
    return { ok: false, error: "Recon input must be a plain object." };
  }

  const rawGaps = rawInput.gaps;
  if (
    !Array.isArray(rawGaps) ||
    rawGaps.length === 0 ||
    !rawGaps.every((g) => typeof g === "string" && g.trim().length > 0)
  ) {
    return {
      ok: false,
      error: "Recon input 'gaps' must be a non-empty array of non-empty strings.",
    };
  }

  let surface: SummonSurface = "any";
  if (rawInput.surface !== undefined) {
    if (
      rawInput.surface !== "any" &&
      rawInput.surface !== "heaven" &&
      rawInput.surface !== "hell"
    ) {
      return {
        ok: false,
        error: "Recon input 'surface' must be one of 'any', 'heaven', or 'hell'.",
      };
    }
    surface = rawInput.surface;
  }

  let source: string | undefined;
  if (rawInput.source !== undefined) {
    if (typeof rawInput.source !== "string" || rawInput.source.trim().length === 0) {
      return {
        ok: false,
        error: "Recon input 'source' must be a non-empty string when provided.",
      };
    }
    source = rawInput.source.trim();
  }

  let limit: number | undefined;
  if (rawInput.limit !== undefined) {
    if (
      typeof rawInput.limit !== "number" ||
      !Number.isSafeInteger(rawInput.limit) ||
      rawInput.limit < 1
    ) {
      return {
        ok: false,
        error: "Recon input 'limit' must be a positive safe integer when provided.",
      };
    }
    limit = rawInput.limit;
  }

  return {
    ok: true,
    value: {
      gaps: rawGaps.map((g) => g.trim()),
      surface,
      ...(source !== undefined ? { source } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

async function loadInvocationMap(
  service: GaiaService,
  requestedSource: string | undefined,
  outcomeSource: string,
  cache: Map<string, ReadonlyMap<string, IndexedSkill["invocation"]>>,
): Promise<ReadonlyMap<string, IndexedSkill["invocation"]>> {
  const cached = cache.get(outcomeSource);
  if (cached !== undefined) return cached;

  const map = new Map<string, IndexedSkill["invocation"]>();
  try {
    if (typeof service.skillIndex === "function") {
      const resolved = await service.skillIndex(requestedSource);
      for (const doc of resolved.index.docs) {
        map.set(doc.id, doc.invocation);
      }
    }
  } catch {
    // Custom test stubs may omit skillIndex or fail on lookup; treat as unclassified.
  }

  cache.set(outcomeSource, map);
  return map;
}

function buildCandidateLaneLens(
  invocation: IndexedSkill["invocation"] | undefined,
): ReconCandidateLaneLens {
  if (invocation === "human") {
    return Object.freeze({
      status: "present",
      invocation: "human",
      lane: "human-led",
      convergenceOnly: true,
    });
  }
  if (invocation === "model") {
    return Object.freeze({
      status: "present",
      invocation: "model",
      lane: "model-led",
      convergenceOnly: false,
    });
  }
  return Object.freeze({
    status: "present",
    invocation: "any",
    lane: "unclassified",
    convergenceOnly: false,
  });
}

function buildCandidateInstallabilityLens(
  installability: PreviewedSkill["installability"],
  adapterStatus: NonNullable<SummonOutcome["ranking"]["installability"]>["status"] | undefined,
): ReconCandidateInstallabilityLens {
  if (installability === undefined) {
    return Object.freeze({
      status:
        adapterStatus === undefined || adapterStatus === "not-configured"
          ? "absent-not-configured"
          : "absent-unknown",
      state: "unknown",
      reason: null,
      applicability: "unknown",
      applicabilityReason: "not-observed",
      observationDigest: null,
      observedAt: null,
    });
  }

  const status: ReconCandidateInstallabilityLens["status"] =
    installability.applicability === "verified"
      ? "present"
      : adapterStatus === undefined || adapterStatus === "not-configured"
        ? "absent-not-configured"
        : "absent-unknown";

  return Object.freeze({
    status,
    state: installability.state,
    reason: installability.reason ?? null,
    applicability: installability.applicability,
    applicabilityReason: installability.applicabilityReason,
    observationDigest: installability.upstream?.observationDigest ?? null,
    observedAt: installability.upstream?.observedAt ?? null,
  });
}

function buildCandidateArborLens(
  arbor: PreviewedSkill["arbor"],
): ReconCandidateArborLens {
  const claimsLens = arbor.lenses.claims;
  const hhLens = arbor.lenses.hellHeaven;
  const status =
    claimsLens.availability === "consulted"
      ? "present"
      : (claimsLens.upstreamStatus ?? `absent-${arbor.join}`);

  return Object.freeze({
    status,
    availability: claimsLens.availability,
    join: arbor.join,
    upstreamStatus: claimsLens.upstreamStatus,
    sourceDigest: claimsLens.sourceDigest,
    claims: arbor.claims,
    conditionsEvaluated: arbor.conditionsEvaluated,
    reason: claimsLens.reason,
    hellHeaven: Object.freeze({
      status: hhLens.upstreamStatus ?? "absent-not-published",
      availability: hhLens.availability,
      upstreamStatus: hhLens.upstreamStatus,
      reason: hhLens.reason,
    }),
  });
}

function buildCandidateGraphLens(
  arbor: PreviewedSkill["arbor"],
): ReconCandidateGraphLens {
  const interactionsLens = arbor.lenses.interactions;
  const relations = arbor.interactions;
  const status =
    interactionsLens.availability === "consulted"
      ? relations.length > 0
        ? "present"
        : "absent-no-edges"
      : (interactionsLens.upstreamStatus ?? `absent-${arbor.join}`);

  return Object.freeze({
    status,
    availability: interactionsLens.availability,
    join: arbor.join,
    upstreamStatus: interactionsLens.upstreamStatus,
    sourceDigest: interactionsLens.sourceDigest,
    absenceMeaning: EDGE_ABSENCE_MEANING,
    relations,
    reason: interactionsLens.reason,
  });
}

function buildCandidateCard(
  reconId: string,
  gapIndex: number,
  candidate: PreviewedSkill,
  invocation: IndexedSkill["invocation"] | undefined,
  freshness: Extract<ReconFreshnessLens, { status: "present" }>,
  adapterStatus: NonNullable<SummonOutcome["ranking"]["installability"]>["status"] | undefined,
): ReconCandidateCard {
  const laneLens = buildCandidateLaneLens(invocation);
  const card = `[Preview] ${displayField(candidate.name)} · ID: ${displayField(candidate.id)} · Lane: ${laneLens.lane} · Source: ${displayField(candidate.source)} · Note: preview card is reference data, authorizes nothing, and nothing was materialized.`;

  return Object.freeze({
    cardRef: `recon:${reconId}:gap:${gapIndex}:card:${candidate.id}`,
    id: candidate.id,
    name: candidate.name,
    title: candidate.title ?? null,
    description: candidate.description,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl ?? null,
    card,
    retrieval: candidate.retrieval,
    lane: laneLens,
    freshness,
    installability: buildCandidateInstallabilityLens(candidate.installability, adapterStatus),
    arbor: buildCandidateArborLens(candidate.arbor),
    graph: buildCandidateGraphLens(candidate.arbor),
  });
}

function buildGapInstallabilityLens(
  installability: SummonOutcome["ranking"]["installability"],
): ReconGapInstallabilityLens {
  const adapterStatus = installability?.status ?? "not-configured";
  const status: ReconGapInstallabilityLens["status"] =
    adapterStatus === "applied"
      ? "applied"
      : adapterStatus === "not-applicable"
        ? "absent-not-applicable"
        : adapterStatus === "unavailable"
          ? "absent-unavailable"
          : "absent-not-configured";

  return Object.freeze({
    status,
    adapterStatus,
    projectionIndexPath: installability?.projectionIndexPath ?? null,
    sourceUrl: installability?.sourceUrl ?? null,
    warning: installability?.warning ?? null,
  });
}

function buildGapArborLens(arbor: SummonArborDisclosure): ReconGapArborLens {
  const status: ReconGapArborLens["status"] =
    arbor.publicationState === "unavailable"
      ? "absent-unavailable"
      : arbor.publicationState === "unreadable"
        ? "absent-unreadable"
        : arbor.subjectsPublished === 0 && arbor.edgesPublished === 0
          ? "absent-empty-publication"
          : "present";

  return Object.freeze({
    status,
    publicationState: arbor.publicationState,
    subjectsPublished: arbor.subjectsPublished,
    edgesPublished: arbor.edgesPublished,
    corpus: arbor.corpus,
    identity: arbor.identity,
    hellHeaven: Object.freeze({
      status: "absent-not-published",
      reason: "Heaven/Hell behavioral polarity payload is not published.",
    }),
    note: arbor.note,
  });
}

function buildGapGraphLens(composition: ArborCompositionReport): ReconGapGraphLens {
  const pub = composition.publication;
  const status: ReconGapGraphLens["status"] =
    pub.state === "unavailable"
      ? "absent-publication-unavailable"
      : pub.state === "unreadable"
        ? "absent-publication-unreadable"
        : pub.edgesPublished === 0
          ? "absent-no-edges-published"
          : pub.matchedEdges === 0
            ? "absent-no-matched-edges"
            : "present";

  return Object.freeze({
    status,
    publicationState: pub.state,
    absenceMeaning: EDGE_ABSENCE_MEANING,
    edgesPublished: pub.edgesPublished,
    matchedEdges: pub.matchedEdges,
    interactions: composition.interactions,
    band: composition.band,
    note: composition.note,
  });
}

function buildRefusedGapRecord(
  gapIndex: number,
  query: string,
  surface: SummonSurface,
  source: string | null,
  reason: string,
): ReconGapRecord {
  return Object.freeze({
    gapIndex,
    query,
    status: "refused",
    refused: true,
    noMatch: null,
    refusal: Object.freeze({
      kind: "refused",
      reason,
      note: NO_CAPABILITY_NOTE,
    }),
    candidates: Object.freeze([]),
    filtered: [],
    freshness: Object.freeze({
      status: "absent-unavailable",
      indexGeneratedAt: null,
      indexAgeDays: null,
      stale: null,
      indexOrigin: null,
      source,
      reason,
    }),
    installability: Object.freeze({
      status: "absent-unavailable",
      adapterStatus: "unavailable",
      projectionIndexPath: null,
      sourceUrl: source,
      warning: reason,
    }),
    lane: Object.freeze({ requestedSurface: surface }),
    arbor: Object.freeze({
      status: "absent-unavailable",
      publicationState: "unavailable",
      subjectsPublished: 0,
      edgesPublished: 0,
      corpus: null,
      identity: null,
      hellHeaven: Object.freeze({
        status: "absent-not-published",
        reason: "Heaven/Hell behavioral polarity payload is not published.",
      }),
      note: reason,
    }),
    graph: Object.freeze({
      status: "absent-publication-unavailable",
      publicationState: "unavailable",
      absenceMeaning: EDGE_ABSENCE_MEANING,
      edgesPublished: 0,
      matchedEdges: 0,
      interactions: [],
      band: null,
      note: reason,
    }),
  });
}

function formatGapFinding(gap: ReconGapRecord): string {
  if (gap.status === "matched") {
    const candidateSummary = gap.candidates
      .map((candidate) => `${displayField(candidate.id)} [${candidate.lane.lane}]`)
      .join(", ");
    return `gap[${gap.gapIndex}] ${displayField(gap.query)}: matched ${gap.candidates.length} candidate(s) (${candidateSummary})`;
  }
  const reason = gap.refusal?.reason ?? gap.status;
  return `gap[${gap.gapIndex}] ${displayField(gap.query)}: ${gap.status} (${displayField(reason)})`;
}

function collectReconCitations(
  reconId: string,
  gaps: readonly ReconGapRecord[],
): string[] {
  const seen = new Set<string>();
  const citations: string[] = [];
  const add = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      citations.push(value);
    }
  };

  for (const gap of gaps) {
    for (const candidate of gap.candidates) {
      add(candidate.cardRef);
      add(candidate.id);
    }
  }

  if (citations.length === 0) {
    for (const gap of gaps) {
      add(`recon:${reconId}:gap:${gap.gapIndex}:${gap.status}`);
    }
  }

  return citations;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
