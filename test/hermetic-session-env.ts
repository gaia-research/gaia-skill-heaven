import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
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

export type IsolatedTempNamespaceOptions = {
  readonly allowShortParentFallback?: boolean;
};

export const WORKER_TEMP_NAMESPACE_PREFIX = "sh-";

const MKDTEMP_RANDOM_SUFFIX_BYTES = 6;
const DOOR_CONTRACT_TMP_OVERHEAD_BYTES = 25; // "/door-contract-XXXXXX/tmp"
const DARWIN_MAX_SUN_PATH_BYTES = 103; // 104-byte sockaddr_un.sun_path minus NUL
const LINUX_MAX_SUN_PATH_BYTES = 107; // 108-byte sockaddr_un.sun_path minus NUL

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

export function getMaxUnixSocketPathBytes(): number | undefined {
  if (process.platform === "win32") return undefined;
  if (process.platform === "linux") return LINUX_MAX_SUN_PATH_BYTES;
  return DARWIN_MAX_SUN_PATH_BYTES;
}

export function getTsxIpcUserToken(): string {
  if (typeof process.geteuid === "function") {
    return String(process.geteuid());
  }
  return userInfo().username;
}

export function getTsxMaxPidDigits(): number {
  const currentPidDigits = String(process.pid).length;
  return process.platform === "darwin"
    ? Math.max(5, currentPidDigits)
    : Math.max(7, currentPidDigits);
}

export function getDerivedDoorPipeMaxSuffixBytes(): number {
  const userTokenBytes = Buffer.byteLength(getTsxIpcUserToken(), "utf8");
  const maxPidDigits = getTsxMaxPidDigits();
  // "/door-contract-XXXXXX/tmp" (25) + "/tsx-" (5) + user + "/" (1) + pid + ".pipe" (5)
  return (
    DOOR_CONTRACT_TMP_OVERHEAD_BYTES + 5 + userTokenBytes + 1 + maxPidDigits + 5
  );
}

export function getEstimatedDoorPipeBytesForNamespaceRoot(root: string): number {
  return (
    Buffer.byteLength(root, "utf8") + getDerivedDoorPipeMaxSuffixBytes()
  );
}

function getWorkerLeafBytes(): number {
  return (
    1 +
    Buffer.byteLength(WORKER_TEMP_NAMESPACE_PREFIX, "utf8") +
    MKDTEMP_RANDOM_SUFFIX_BYTES
  );
}

function isSafePosixTempParent(dir: string): boolean {
  try {
    const st = lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
    const euid = typeof process.geteuid === "function" ? process.geteuid() : undefined;
    const ownedByCurrentUser = euid !== undefined && st.uid === euid;
    const rootStickyDir = st.uid === 0 && (st.mode & 0o1000) !== 0;
    if (!ownedByCurrentUser && !rootStickyDir) return false;
    accessSync(dir, constants.W_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function selectNamespaceParent(
  callerTmpdir: string,
  allowShortParentFallback: boolean,
): { parentDir: string; usedFallback: boolean } {
  if (!allowShortParentFallback) {
    return { parentDir: callerTmpdir, usedFallback: false };
  }
  const maxSocketBytes = getMaxUnixSocketPathBytes();
  if (maxSocketBytes === undefined) {
    return { parentDir: callerTmpdir, usedFallback: false };
  }
  const maxNamespaceRootBytes =
    maxSocketBytes - getDerivedDoorPipeMaxSuffixBytes();
  const maxParentBytes = maxNamespaceRootBytes - getWorkerLeafBytes();
  const callerBytes = Buffer.byteLength(callerTmpdir, "utf8");
  if (callerBytes <= maxParentBytes) {
    return { parentDir: callerTmpdir, usedFallback: false };
  }

  const candidates =
    process.platform === "darwin" ? ["/private/tmp", "/tmp"] : ["/tmp"];
  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate);
      const resolvedBytes = Buffer.byteLength(resolved, "utf8");
      if (resolvedBytes < callerBytes && resolvedBytes <= maxParentBytes && isSafePosixTempParent(resolved)) {
        return { parentDir: resolved, usedFallback: true };
      }
    } catch {
      // Ignore unavailable fallback candidate.
    }
  }
  return { parentDir: callerTmpdir, usedFallback: false };
}

function enforcePrivateNamespaceDir(root: string): void {
  const st = lstatSync(root);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`Isolated temp namespace is not a real directory: ${root}`);
  }
  if (process.platform !== "win32") {
    if (typeof process.geteuid === "function" && st.uid !== process.geteuid()) {
      throw new Error(
        `Isolated temp namespace has unexpected owner uid ${st.uid}: ${root}`,
      );
    }
    if ((st.mode & 0o077) !== 0) {
      chmodSync(root, 0o700);
    }
  }
}

export function createIsolatedTempNamespace(
  env: NodeJS.ProcessEnv = process.env,
  options: IsolatedTempNamespaceOptions = {},
): WorkerTempNamespace {
  const savedEnv: Record<TempEnvKey, string | undefined> = {
    TMPDIR: env.TMPDIR,
    TMP: env.TMP,
    TEMP: env.TEMP,
  };
  const callerTmpdir = resolveCallerTmpdir(env);
  const { parentDir, usedFallback } = selectNamespaceParent(
    callerTmpdir,
    options.allowShortParentFallback === true,
  );
  if (!usedFallback && !existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  const root = mkdtempSync(path.join(parentDir, WORKER_TEMP_NAMESPACE_PREFIX));
  enforcePrivateNamespaceDir(root);
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
  activeWorkerTempNamespace = createIsolatedTempNamespace(env, {
    allowShortParentFallback: true,
  });
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
