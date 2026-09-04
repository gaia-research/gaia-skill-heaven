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
// LC — the Ultra controller (SPEC §6). Deterministic by construction: pure
// function of (state, margin), no clock, no randomness, no learning.
export {
  DEFAULT_ULTRA_PARAMS,
  RUNGS,
  ULTRA_CEILING,
  ULTRA_FLOOR,
  initialUltraState,
  replayUltra,
  stepUltra,
  type Rung,
  type UltraDecision,
  type UltraObservation,
  type UltraParams,
  type UltraState,
  type UltraStep,
} from "./retrieval/ultra.js";
