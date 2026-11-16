import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Inherited session variables that must never leak from a caller's host
 * harness (e.g. Claude Code setting CLAUDE_CODE_SESSION_ID or a shell having
 * SKILL_SUMMON_SESSION exported) into test fixtures. Kept in sync with
 * HARNESS_SESSION_ID_ENV_VARS without importing session.ts before per-file
 * vi.mock() hoists (e.g. node:fs/promises in summon-session.test.ts).
 */
export const HERMETIC_SESSION_ENV_VARS = Object.freeze([
  "CLAUDE_CODE_SESSION_ID",
  "SKILL_SUMMON_SESSION",
] as const);

export const HERMETIC_TEMP_ENV_VARS = Object.freeze([
  "TMPDIR",
  "TMP",
  "TEMP",
] as const);

export type TempEnvKey = (typeof HERMETIC_TEMP_ENV_VARS)[number];

export type WorkerTempNamespace = {
  readonly callerTmpdir: string;
  readonly root: string;
  readonly savedEnv: Readonly<Record<TempEnvKey, string | undefined>>;
};

export const WORKER_TEMP_NAMESPACE_PREFIX = "skill-heaven-vitest-tmp-";

let activeWorkerTempNamespace: WorkerTempNamespace | undefined;

export function scrubInheritedSessionEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of HERMETIC_SESSION_ENV_VARS) {
    delete env[key];
  }
}

function resolveCallerTmpdir(env: NodeJS.ProcessEnv): string {
  if (env === process.env) return tmpdir();
  if (process.platform === "win32") {
    const candidate = env.TEMP?.trim() || env.TMP?.trim();
    return candidate ? path.resolve(candidate) : tmpdir();
  }
  const candidate = env.TMPDIR?.trim();
  return candidate ? path.resolve(candidate) : tmpdir();
}

export function applyTempRootToEnv(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  for (const key of HERMETIC_TEMP_ENV_VARS) {
    env[key] = root;
  }
}

export function createIsolatedTempNamespace(
  env: NodeJS.ProcessEnv = process.env,
): WorkerTempNamespace {
  const savedEnv: Record<TempEnvKey, string | undefined> = {
    TMPDIR: env.TMPDIR,
    TMP: env.TMP,
    TEMP: env.TEMP,
  };
  const callerTmpdir = resolveCallerTmpdir(env);
  if (!existsSync(callerTmpdir)) {
    mkdirSync(callerTmpdir, { recursive: true });
  }
  const root = mkdtempSync(path.join(callerTmpdir, WORKER_TEMP_NAMESPACE_PREFIX));
  const namespace: WorkerTempNamespace = {
    callerTmpdir,
    root,
    savedEnv: Object.freeze(savedEnv),
  };
  applyTempRootToEnv(root, env);
  return namespace;
}

export function disposeIsolatedTempNamespace(
  namespace: WorkerTempNamespace,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of HERMETIC_TEMP_ENV_VARS) {
    const previous = namespace.savedEnv[key];
    if (previous === undefined) {
      delete env[key];
    } else {
      env[key] = previous;
    }
  }
  rmSync(namespace.root, { recursive: true, force: true });
}

export function getActiveWorkerTempNamespace(): WorkerTempNamespace | undefined {
  return activeWorkerTempNamespace;
}

export function establishWorkerTempNamespace(
  env: NodeJS.ProcessEnv = process.env,
): WorkerTempNamespace {
  if (activeWorkerTempNamespace) {
    applyTempRootToEnv(activeWorkerTempNamespace.root, env);
    return activeWorkerTempNamespace;
  }
  activeWorkerTempNamespace = createIsolatedTempNamespace(env);
  return activeWorkerTempNamespace;
}

export function ensureActiveWorkerTempNamespace(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!activeWorkerTempNamespace) return;
  applyTempRootToEnv(activeWorkerTempNamespace.root, env);
}

export function cleanupWorkerTempNamespace(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const namespace = activeWorkerTempNamespace;
  if (!namespace) return;
  activeWorkerTempNamespace = undefined;
  disposeIsolatedTempNamespace(namespace, env);
}
