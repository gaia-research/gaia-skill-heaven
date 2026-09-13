// Public surface of the skill-zero core engine — the seam the per-harness
// doors (claude-zero, pi-zero, …) build on. Keep this deliberately small;
// door packages should reach for the composed helpers here, not deep-import
// engine internals.

export {
  compile,
  doseSummary,
  floorOf,
  POSTURES,
  POSTURE_ALIASES,
  FLOOR_EVIDENCE,
  HEAVEN_LEVELS,
  HELL_LEVELS,
  LADDER_LEVELS,
  LEVEL_ALIASES,
  SUMMON_ONLY_LEVELS,
  BANDS,
  RUNG_BANDS,
  BAND_INFO,
  LADDER_WIP,
  HARNESSES,
  type Band,
  type BandInfo,
  type FloorKind,
  type Posture,
  type Harness,
  type DoseSummary,
  type CompileInput,
  type CompileResult,
  type FsOp,
} from "./compile.js";
export { resolveSkill, type ResolvedSkill } from "./skills.js";
export {
  TELEMETRY_SCHEMA,
  assembleRuntimeObservation,
  containsAbsolutePath,
  newSessionPseudonym,
  serializeRuntimeObservation,
  validateRuntimeObservation,
  type AvailableTokenUsage,
  type ObservationInput,
  type RuntimeObservation,
} from "./telemetry.js";

// `materialize` — and deliberately NOT `exec`.
//
// A door that can `compile()` a posture but cannot lay down the fsPlan can only
// plan the posture, never launch it: the curated route's whole mechanism is the
// `$SESSION/heaven-set` plugin dir the fsPlan writes. So the seam has to carry
// the fsPlan writer, and `FsOp` above so a door can type/inspect the plan it is
// about to apply.
//
// `exec` stays internal on purpose. It is core's own runner: it mkdtemps its own
// session dir, spawns, and disposes. A door spawns its OWN process — it owns the
// session dir (its launch manifest and session settings.json live there,
// alongside the materialized set), decides interactive-vs-headless, and handles
// its own exit codes. Handing a door core's runner would blur which package owns
// the process, and would give it a second, competing session dir. Doors call
// materialize(fsPlan, theirSessionDir) and spawn themselves.
export { materialize } from "./exec.js";
export { tokenize, makeListingLine, readFrontmatter, contentSha256, type TokenizerId } from "./vendor/census-pure.js";

// Steering (SPEC §7, PLAN Lane S-now): explicit behavioral events only. The
// controller has no retrieval-score or refusal input and is safe to replay.
export {
  DEFAULT_STEERING_POLICY,
  EVENT_TYPES,
  OPERATOR_EVENT_TYPES,
  RUNTIME_EVENT_TYPES,
  SEARCH_STATES,
  STEERING_POLICY_VERSION,
  STEERING_TRACE_SCHEMA,
  STEERING_RUNGS,
  createOperatorEvent,
  createRuntimeAdapter,
  createRuntimeEvent,
  initialSteeringState,
  parseOperatorCommand,
  parseSteeringEvent,
  parseSteeringPolicy,
  parseSteeringState,
  replaySteering,
  serializeSteeringRecord,
  stepSteering,
  toSteeringRecord,
  verifySteeringRecord,
  type BehavioralEvent,
  type OperatorCommand,
  type OperatorEvent,
  type OperatorEventType,
  type RuntimeAdapterCapability,
  type RuntimeBehavioralEvent,
  type RuntimeEventType,
  type SearchState,
  type SteeringDecision,
  type SteeringDirection,
  type SteeringEvent,
  type SteeringEventType,
  type SteeringPolicy,
  type SteeringPosition,
  type SteeringProvenance,
  type SteeringReplay,
  type SteeringReplayOptions,
  type SteeringReplayRecord,
  type SteeringRung,
  type SteeringSignal,
  type SteeringSignalDescriptor,
  type SteeringState,
  type SteeringStep,
  type SteeringTraceEntry,
  type SteeringVerification,
} from "./steering.js";

// Retrieval (SPEC §2–§4): the committed index contract, the offline builder,
// the BM25F ranker, the shipped baseline, and the benchmark metrics. The
// runtime (`skill-summon`) and the benchmark read the same implementations —
// a re-implementation on either side would drift and make the numbers
// meaningless.
export {
  SKILL_INDEX_SCHEMA,
  STALE_AFTER_DAYS,
  INDEX_FIELDS,
  SkillIndexError,
  assertSkillIndex,
  indexAgeDays,
  isStale,
  type IndexField,
  type IndexedSkill,
  type IndexStats,
  type FloorCalibration,
  type RetrievalSurface,
  type SkillIndex,
} from "./retrieval/schema.js";
export { normalize, tokenizeText, scoreMatch } from "./retrieval/lexical.js";
export {
  buildSkillIndex,
  deriveTerms,
  fieldText,
  isInstallableLink,
  isReachable,
  sha256,
  type BuildIndexOptions,
  type NamedProjection,
  type ProjectionSkill,
} from "./retrieval/build-index.js";
export {
  Bm25fRanker,
  DEFAULT_BM25F_PARAMS,
  EXACT_MATCH_SCORE,
  marginOf,
  type Bm25fParams,
  type MatchKind,
  type ScoredSkill,
} from "./retrieval/bm25f.js";
export {
  BASELINE_MIN_RELEVANCE,
  BASELINE_RELEVANCE_BAND,
  baselineRelevance,
  rankBaseline,
  type BaselineMode,
} from "./retrieval/baseline.js";
export {
  BAND,
  MARGIN,
  decide,
  type Decision,
  type DecideOptions,
  type FilterReason,
  type NoMatch,
  type SummonSurface,
} from "./retrieval/decide.js";
export {
  mean,
  mulberry32,
  pairedBootstrap,
  recallAt,
  reciprocalRank,
  type BootstrapResult,
} from "./retrieval/metrics.js";
export { INDEX_BUILDER_VERSION } from "./retrieval/version.js";

// Arbor consumption (SPEC §4, INV-7/INV-8/INV-13; issue #118 Lane A).
//
// This repository is a CONSUMER of Arbor and never an author. Everything below
// mirrors pinned upstream contracts in `gaia-skill-tree/registry/arbor/
// contracts/` or describes THIS consumer's own join and disclosure state. None
// of it extends, defaults, or computes an Arbor field, and none of it produces
// a number a ranker could read.
export {
  ARBOR_EDGE_INDEX_SCHEMA,
  ARBOR_EDGE_SCHEMA,
  ARBOR_FACETS,
  ARBOR_LENSES,
  ARBOR_LENS_STATUS,
  ARBOR_PROFILE_SCHEMA,
  ARBOR_RELATIONS,
  ARBOR_RUNTIME_INDEX_SCHEMA,
  ARBOR_RUNTIME_SCHEMA,
  EDGE_ABSENCE_MEANING,
  EDGE_STRUCTURAL_OVERLAP,
  GOVERNED_SUPPORT,
  PROJECTED_SUPPORT,
  type ArborAuthority,
  type ArborClaim,
  type ArborClaimsLens,
  type ArborEdge,
  type ArborEdgeIndex,
  type ArborFacet,
  type ArborHellHeavenLens,
  type ArborInteractionsLens,
  type ArborLensName,
  type ArborLensStatus,
  type ArborProfile,
  type ArborRelation,
  type ArborRuntime,
  type ArborRuntimeIndex,
  type ArborSubjectRef,
  type GovernedSupport,
  type ProjectedSupport,
} from "./arbor/contract.js";
export {
  ArborContractError,
  assertArborClaim,
  assertArborEdge,
  assertArborEdgeIndex,
  assertArborProfile,
  assertArborRuntime,
  assertArborRuntimeIndex,
  assertArborSubjectRef,
  isGovernedSupport,
  isProjectedSupport,
} from "./arbor/validate.js";
export {
  readArborPublication,
  subjectKey,
  unavailableArborPublication,
  type ArborProblem,
  type ArborPublication,
  type ArborPublicationDocuments,
  type ArborPublicationProvenance,
  type ArborPublicationState,
} from "./arbor/publication.js";
export {
  consumeArbor,
  describeArborPublication,
  type ArborCandidate,
  type ArborDeliveryContext,
  type ArborDisclosure,
  type ArborInteractionReport,
  type ArborJoin,
  type ArborLensAvailability,
  type ArborLensReport,
  type ArborSubjectReport,
  type ConsumeArborOptions,
} from "./arbor/consume.js";
export {
  ARBOR_IDENTITY_SCHEMA,
  ArborIdentityError,
  assertArborIdentityContext,
  describeArborIdentityMiss,
  resolveArborIdentity,
  type ArborIdentityContext,
  type ArborIdentityEntry,
  type ArborIdentityMiss,
  type ArborIdentityQuery,
  type ArborIdentityResolution,
} from "./arbor/identity.js";
export {
  arborPublicationLines,
  arborSubjectLines,
  claimLine,
  interactionLine,
  type ArborIdentityDisclosure,
} from "./arbor/disclose.js";
