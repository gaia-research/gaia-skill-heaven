// The hermes-heaven launch plan. Core owns every posture composition; this
// module resolves --skill paths, substitutes $SESSION, and carries the honest
// recipe-only result back to the CLI. It never writes shared Hermes state.

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
        `door, not an activator: the key exists and can turn once that bar is met. hermes-heaven composes ` +
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
  /** --skill <path>, repeatable. Hermes can only request matching installed names. */
  skillPaths?: string[];
  model?: string;
  /** Pass "$SESSION" for dry-run output. Hermes currently emits no fsPlan. */
  sessionDir: string;
  hermesArgs?: string[];
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

const substSession = (value: string, sessionDir: string) => value.replaceAll("$SESSION", sessionDir);

/** Plan a Hermes recipe grounded in ../PROBE.md. */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "native";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((path) => resolveSkill(path));

  const compiled = compile({
    posture,
    harness: "hermes",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.hermesArgs?.length ? { passthrough: opts.hermesArgs } : {}),
  });

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(compiled.env)) {
    env[key] = substSession(value, opts.sessionDir);
  }

  return {
    posture,
    command: compiled.command,
    argv: compiled.argv.map((arg) => substSession(arg, opts.sessionDir)),
    env,
    fsPlan: compiled.fsPlan.map((op) =>
      op.kind === "write"
        ? { ...op, path: substSession(op.path, opts.sessionDir) }
        : {
            ...op,
            from: substSession(op.from, opts.sessionDir),
            to: substSession(op.to, opts.sessionDir),
          },
    ),
    notes: compiled.notes,
    skillCount: skills.length,
    execSupport: compiled.execSupport,
  };
}
