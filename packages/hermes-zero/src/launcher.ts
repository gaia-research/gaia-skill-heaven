// The hermes-zero launch plan. Core owns every posture composition; this
// module resolves --skill paths, substitutes $SESSION, and carries core's
// verified plan back to the CLI. It never writes shared Hermes state.

import {
  compile,
  LEVEL_ALIASES,
  SUMMON_ONLY_LEVELS,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-zero";

// The rungs that are armed LIVE, in-session, and have no boot-posture mapping.
// They do not refuse: ultra is ratified (N13) and nothing on the line refuses.
// They are simply a different dial from --level, and saying so is the honest
// answer — the launcher owns the subtractive boot dial, /skill-hell and
// /skill-ultra own the additive summon line.
export const SUMMON_ONLY: ReadonlySet<string> = new Set(SUMMON_ONLY_LEVELS);

/** A summon-line rung is not a boot posture. This is a redirect, not a gate. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && SUMMON_ONLY.has(level)) {
    const arm = level === "ultra" ? "/skill-ultra" : `/skill-hell ${level}`;
    throw new Error(
      `level "${level}" is a live summon rung, not a boot posture. ` +
        `Launch hermes-zero at zero|low|med, then arm it in-session with ${arm}.`,
    );
  }
}

export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "product-floor" (`--level zero`) */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated copies each directory into the scoped profile. */
  skillPaths?: string[];
  model?: string;
  /** Pass "$SESSION" for dry-run output. Curated fsPlan writes only below it. */
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

/** Plan a verified Hermes launch grounded in ../PROBE.md. */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "product-floor";
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
