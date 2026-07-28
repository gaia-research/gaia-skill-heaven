// Public surface of the skill-heaven core engine — the seam the per-harness
// doors (claude-heaven, pi-heaven, …) build on. Keep this deliberately small;
// door packages should reach for the composed helpers here, not deep-import
// engine internals.

export {
  compile,
  doseSummary,
  floorOf,
  POSTURES,
  POSTURE_ALIASES,
  FLOOR_EVIDENCE,
  HELL_LEVELS,
  LEVEL_ALIASES,
  HARNESSES,
  type FloorKind,
  type Posture,
  type Harness,
  type DoseSummary,
  type CompileInput,
  type CompileResult,
} from "./compile.js";
export { resolveSkill, type ResolvedSkill } from "./skills.js";
export { tokenize, makeListingLine, readFrontmatter, contentSha256, type TokenizerId } from "./vendor/census-pure.js";
