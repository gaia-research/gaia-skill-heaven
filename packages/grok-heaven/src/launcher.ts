// The grok-heaven launch plan. Core owns the version-pinned Grok route; this
// module resolves --skill paths, substitutes session placeholders, and carries
// the plan to the CLI. It never writes shared Grok state.

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

// P2 (LOCKED): sourced from core so every door refuses the same Hell levels.
export const GATED_LEVELS: ReadonlySet<string> = new Set(HELL_LEVELS);

/** P2 gate: reject the Hell lane before it can compose anything. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && GATED_LEVELS.has(level)) {
    throw new Error(
      `level "${level}" is Hell-lane and gated (P2) — withheld by policy, not a harness limit: it is ` +
        `technically composable but deliberately locked until Hell is proven safe. /skill-hell is a locked ` +
        `door, not an activator: the key exists and can turn once that bar is met. grok-heaven composes ` +
        `Heaven-lane postures only.`,
    );
  }
}

export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "native" */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated copies each directory into the scoped profile. */
  skillPaths?: string[];
  model?: string;
  /** Pass "$SESSION" for dry-run output. */
  sessionDir: string;
  grokArgs?: string[];
}

export interface LaunchPlan {
  posture: Posture;
  command: string;
  argv: string[];
  env: Record<string, string>;
  fsPlan: FsOp[];
  notes: string[];
  skillCount: number;
  execSupport: CompileResult["execSupport"];
}

const subst = (value: string, sessionDir: string): string =>
  value.replaceAll("$SESSION", sessionDir).replaceAll("$CWD", process.cwd());

function substituteFsOp(op: FsOp, sessionDir: string): FsOp {
  if (op.kind === "write") {
    return { ...op, path: subst(op.path, sessionDir), contents: subst(op.contents, sessionDir) };
  }
  return { ...op, from: subst(op.from, sessionDir), to: subst(op.to, sessionDir) };
}

/** Plan a Grok launch grounded in ../PROBE.md. */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "native";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((path) => resolveSkill(path));

  const compiled = compile({
    posture,
    harness: "grok",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.grokArgs?.length ? { passthrough: opts.grokArgs } : {}),
  });

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(compiled.env)) env[key] = subst(value, opts.sessionDir);

  return {
    posture,
    command: compiled.command,
    argv: compiled.argv.map((arg) => subst(arg, opts.sessionDir)),
    env,
    fsPlan: compiled.fsPlan.map((op) => substituteFsOp(op, opts.sessionDir)),
    notes: compiled.notes,
    skillCount: skills.length,
    execSupport: compiled.execSupport,
  };
}
