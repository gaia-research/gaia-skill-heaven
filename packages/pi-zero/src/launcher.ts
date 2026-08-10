// The pi-zero launch PLAN — pure enough to unit-test without spawning pi:
// it reads skill sources (resolveSkill) but writes nothing. cli.ts turns a
// plan into files + a process.
//
// The non-native postures are NOT composed here. They are composed by core's
// `compile()` — the one place the empirically probed, version-pinned pi
// routes live (see ../PROBE.md) — and this module only:
//   (a) resolves --skill paths into core's ResolvedSkill shape,
//   (b) substitutes core's "$SESSION" placeholder with the real session dir,
//   (c) hands back core's compiled plan.
// Nothing here re-derives a route, invents a flag, or edits the compiled argv.
// If a posture's composition is wrong, it is wrong in packages/core.

import {
  compile,
  LEVEL_ALIASES,
  UNRATIFIED_LEVELS,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-zero";

export const UNRATIFIED: ReadonlySet<string> = new Set(UNRATIFIED_LEVELS);

/** Refuse only values with no ratified product meaning. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && UNRATIFIED.has(level)) {
    throw new Error(
      `level "${level}" is UNRATIFIED. Ultra has no approved ` +
        `product mapping to compose, so pi-zero refuses rather than guessing.`,
    );
  }
}

/** Resolve a --level alias (off/low) to its posture, or undefined if the value
 * is not a known alias — callers must treat that as a hard error, not a
 * silent fallthrough. Gated levels are rejected earlier by assertLevelAllowed. */
export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "product-floor" (`--level off`) */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated only; core rejects it elsewhere. */
  skillPaths?: string[];
  model?: string;
  /** session dir, for P3 symmetry with the other doors. pi's compiled fsPlan
   * is empty at every posture verified so far (PROBE.md) — nothing is
   * actually written under it today, but the placeholder substitution stays
   * wired so a future fsPlan-bearing pi route does not require touching this
   * module. Pass "$SESSION" for a dry run. */
  sessionDir: string;
  piArgs?: string[]; // passthrough to pi (after our flags, e.g. `-p "..."`)
}

export interface LaunchPlan {
  posture: Posture;
  command: string;
  argv: string[];
  env: Record<string, string>; // additions only (never removals)
  /** core's fsPlan, already substituted for this session dir. Empty at every
   * posture verified so far. cli.ts materializes it; nothing outside the
   * session dir is ever touched (P3). */
  fsPlan: FsOp[];
  /** core's compile notes, carried verbatim so the evidence travels with the plan. */
  notes: string[];
  skillCount: number;
  execSupport: CompileResult["execSupport"];
}

const substSession = (s: string, sessionDir: string) => s.replaceAll("$SESSION", sessionDir);

/** Plan a launch at any posture core composes for pi (see ../PROBE.md for what was verified). */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "product-floor";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((p) => resolveSkill(p));

  const compiled = compile({
    posture,
    harness: "pi",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.piArgs?.length ? { passthrough: opts.piArgs } : {}),
  });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(compiled.env)) env[k] = substSession(v, opts.sessionDir);

  return {
    posture,
    command: compiled.command,
    argv: compiled.argv.map((a) => substSession(a, opts.sessionDir)),
    env,
    fsPlan: compiled.fsPlan.map((op) =>
      op.kind === "write"
        ? { ...op, path: substSession(op.path, opts.sessionDir) }
        : { ...op, from: substSession(op.from, opts.sessionDir), to: substSession(op.to, opts.sessionDir) },
    ),
    notes: compiled.notes,
    skillCount: skills.length,
    execSupport: compiled.execSupport,
  };
}
