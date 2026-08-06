// The codex-heaven launch PLAN — pure enough to unit-test without spawning
// codex: it reads skill sources (resolveSkill) but writes nothing. cli.ts
// turns a plan into files + a process.
//
// The non-native postures are NOT composed here. They are composed by core's
// `compile()` — the one place the empirically probed, version-pinned codex
// route lives (see ../PROBE.md) — and this module only:
//   (a) resolves --skill paths into core's ResolvedSkill shape,
//   (b) substitutes core's "$SESSION" placeholder with the real session dir,
//   (c) hands back core's compiled plan.
// Nothing here re-derives a route, invents a flag, or edits the compiled argv.
// If a posture's composition is wrong, it is wrong in packages/core.

import {
  compile,
  HELL_LEVELS,
  LEVEL_ALIASES,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-heaven";

// P2 (LOCKED): the Hell lane is gated. Every user-facing surface hard-errors on
// the Hell levels; /skill-hell is a locked door, not an activator, until Hell is
// proven safe. Sourced from core's canonical HELL_LEVELS (NOT re-listed here) so
// this gate can never drift from the engine's definition. Wording mirrors
// claude-heaven's and pi-heaven's gate verbatim (only the door name changes) —
// the refusal reads the same on every door.
export const GATED_LEVELS: ReadonlySet<string> = new Set(HELL_LEVELS);

/** P2 gate: reject the Hell lane before it can compose anything. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && GATED_LEVELS.has(level)) {
    throw new Error(
      `level "${level}" is Hell-lane and gated (P2) — withheld by policy, not a harness limit: it is ` +
        `technically composable but deliberately locked until Hell is proven safe. /skill-hell is a locked ` +
        `door, not an activator: the key exists and can turn once that bar is met. codex-heaven composes ` +
        `Heaven-lane postures only.`,
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
  /** default "native" */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated only; core rejects it elsewhere. */
  skillPaths?: string[];
  model?: string;
  /** session dir: real writes land here (auth.json copy, curated skill dirs
   * under $SESSION/codex — see core's compileCodex). Pass "$SESSION" for a
   * dry run — nothing is written, and the printed plan then carries core's
   * own placeholder rather than a fake path. */
  sessionDir: string;
  codexArgs?: string[]; // passthrough to codex (after our flags, e.g. the prompt)
}

export interface LaunchPlan {
  posture: Posture;
  command: string;
  argv: string[];
  env: Record<string, string>; // additions only (never removals)
  /** core's fsPlan, already substituted for this session dir. cli.ts
   * materializes it; nothing outside the session dir is ever touched (P3). */
  fsPlan: FsOp[];
  /** core's compile notes, carried verbatim so the evidence travels with the plan. */
  notes: string[];
  skillCount: number;
  /** "recipe" at every posture today (../PROBE.md, codex-cli 0.146.0) — no
   * combination of isolation flags reaches a verified-clean skill surface, so
   * core never marks a codex route "exec". cli.ts refuses to spawn when this
   * is not "exec", same as pi-heaven's recipe-posture refusal. */
  execSupport: CompileResult["execSupport"];
}

const substSession = (s: string, sessionDir: string) => s.replaceAll("$SESSION", sessionDir);

/** Plan a launch at any posture core composes for codex (see ../PROBE.md for what was verified). */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "native";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((p) => resolveSkill(p));

  const compiled = compile({
    posture,
    harness: "codex",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.codexArgs?.length ? { passthrough: opts.codexArgs } : {}),
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
