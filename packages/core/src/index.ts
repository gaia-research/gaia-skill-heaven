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
