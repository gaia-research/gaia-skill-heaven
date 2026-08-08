// The hermes-heaven launch plan. Core owns every posture composition; this
// module resolves --skill paths, substitutes $SESSION, and carries core's
// verified plan back to the CLI. It never writes shared Hermes state.

import {
  compile,
  LEVEL_ALIASES,
  UNRATIFIED_LEVELS,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-heaven";

export const UNRATIFIED: ReadonlySet<string> = new Set(UNRATIFIED_LEVELS);

/** Refuse only values with no ratified product meaning. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && UNRATIFIED.has(level)) {
    throw new Error(
      `level "${level}" is UNRATIFIED. Ultra has no approved ` +
        `product mapping to compose, so hermes-heaven refuses rather than guessing.`,
    );
  }
}

export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "product-floor" (`--level off`) */
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
