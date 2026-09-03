import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SkillInvocation, TrustFields } from "../domain/types.js";

// Deliberately more specific than a bare "skill-summon-" prefix: the payload
// cache directory (payload-cache.ts CACHE_DIR_NAME) also lives directly under
// tmpdir() and is itself named "skill-summon-payload-cache-v1" — if this
// prefix were only "skill-summon-" the reaper below would treat the payload
// cache directory itself as an abandoned session candidate and delete it.
const SESSION_DIR_PREFIX = "skill-summon-session-";
const MANIFEST_FILE = "session.json";
const DEFAULT_SESSION_TTL_HOURS = 4;

/** What the ranker knew about this skill when it chose it (SPEC §5.2). */
export type RetrievalDisclosure = {
  score: number;
  /** `(top − next) / top` across the admitted set. */
  margin: number;
  matchKind: "exact" | "ranked";
  /** False means the summoned skill is not the one the query named — the card must say so. */
  nameMatchesQuery: boolean;
};

export type InstalledSkill = {
  id: string;
  name: string;
  contributor: string;
  invocation?: SkillInvocation | undefined;
  origin?: "tree" | "fleet" | undefined;
  level?: string | undefined;
  trustMagnitude?: number | undefined;
  stars?: number | undefined;
  trust?: TrustFields | undefined;
  sourceUrl: string;
  repoUrl: string;
  branch: string | null;
  subpath: string;
  path: string;
  fileCount: number;
  sha256: string;
  /** "cold" = source fetched; "warm" = payload or resident session hit. */
  cacheState: "cold" | "warm";
  /** Back-compatible alias consumed by Heaven renderers. */
  cache: "cold" | "warm";
  cacheSource: "remote" | "payload" | "session";
  inspectUrl: string;
  /** Where this skill came from — `source` can now vary per call (SPEC §5.4). */
  source?: string | undefined;
  /** Retrieval disclosure, carried onto the card and into `structuredContent`. */
  retrieval?: RetrievalDisclosure | undefined;
  card: string;
  cloneSeconds: number;
  materializeSeconds: number;
  totalSeconds: number;
};

export type MaterializedSkillRecord = InstalledSkill & {
  materializedAt: string;
  /** Set when this skill was pulled in as a suite component, not summoned directly. */
  viaSuite?: string | undefined;
};

export type SessionManifest = {
  id: string;
  createdAt: string;
  pid: number;
  skills: MaterializedSkillRecord[];
};

export type OpenSessionOptions = {
  id?: string | undefined;
};

export type ResolveSessionResult = {
  session: SummonSession;
  created: boolean;
};

export type ReapSessionOptions = {
  dryRun?: boolean | undefined;
  excludeRoots?: readonly string[] | undefined;
  now?: Date | undefined;
  tempRoot?: string | undefined;
  ttlHours?: number | undefined;
};

export type ReapedSession = {
  root: string;
  ageHours: number;
  bytes: number;
};

export type ReapSessionOutcome = {
  dryRun: boolean;
  ttlHours: number;
  scanned: number;
  candidates: ReapedSession[];
  reclaimedBytes: number;
  liveProtected: string[];
};

export type SessionSummary = {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  skillCount: number;
  skills: string[];
};

export type ListSessionOptions = {
  tempRoot?: string | undefined;
};

/**
 * A session is a single mkdtemp root. All summon writes are confined to it
 * (invariant P3: never write outside the session root, never touch user
 * config). Closing a session deletes the root and everything under it.
 */
export class SummonSession {
  readonly root: string;
  readonly id: string;
  readonly #manifestPath: string;
  #manifest: SessionManifest;

  private constructor(root: string, manifest: SessionManifest) {
    this.root = root;
    this.id = manifest.id;
    this.#manifestPath = path.join(root, MANIFEST_FILE);
    this.#manifest = manifest;
  }

  static async createAt(root: string, id: string): Promise<SummonSession> {
    const manifest: SessionManifest = {
      id,
      createdAt: new Date().toISOString(),
      pid: process.pid,
      skills: [],
    };
    const session = new SummonSession(root, manifest);
    await session.#writeManifest();
    return session;
  }

  static async loadAt(root: string): Promise<SummonSession> {
    const manifestPath = path.join(root, MANIFEST_FILE);
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      throw new Error(
        `SKILL_SUMMON_SESSION points at ${root}, but no session manifest was found there: ${errorMessage(error)}`,
      );
    }
    const manifest = JSON.parse(raw) as SessionManifest;
    return new SummonSession(root, manifest);
  }

  get createdAt(): string {
    return this.#manifest.createdAt;
  }

  get skills(): readonly MaterializedSkillRecord[] {
    return this.#manifest.skills;
  }

  /** Directory for transient clone scaffolding: <root>/cache/. */
  get cacheRoot(): string {
    return path.join(this.root, "cache");
  }

  /** Directory under which materialized skills for this session live: <root>/skills/. */
  get skillsRoot(): string {
    return path.join(this.root, "skills");
  }

  async ensureRoots(): Promise<void> {
    await mkdir(this.cacheRoot, { recursive: true });
    await mkdir(this.skillsRoot, { recursive: true });
  }

  /** Record a skill (or suite component) already materialized on disk into the session manifest. */
  async recordSkill(
    skill: InstalledSkill,
    opts: { viaSuite?: string | undefined } = {},
  ): Promise<void> {
    const record: MaterializedSkillRecord = {
      ...skill,
      ...(opts.viaSuite === undefined ? {} : { viaSuite: opts.viaSuite }),
      materializedAt: new Date().toISOString(),
    };
    this.#manifest.skills.push(record);
    await this.#writeManifest();
  }

  async close(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  async #writeManifest(): Promise<void> {
    await writeFile(
      this.#manifestPath,
      JSON.stringify(this.#manifest, null, 2),
      "utf8",
    );
  }
}

export async function openSession(
  opts: OpenSessionOptions = {},
): Promise<SummonSession> {
  const root = await mkdtemp(path.join(tmpdir(), SESSION_DIR_PREFIX));
  return SummonSession.createAt(root, opts.id ?? randomUUID());
}

/**
 * A path is a disposable session root only if it is a direct child of the OS
 * temp directory whose name carries the mkdtemp prefix openSession() uses.
 * SKILL_SUMMON_SESSION is untrusted (inherited from the environment), and both
 * resolveSession() (which writes cache/ and skills/ into it) and close() (which
 * recursively deletes it) trust it — so a value pointing anywhere else would
 * let summon write into, and then delete, a directory that is not one of ours.
 * That would violate P3 (only writes live inside a disposable mkdtemp session
 * dir) and could delete outside the session namespace entirely. Confining the
 * env-supplied root to <tmpdir()>/skill-summon-session-* closes both paths.
 */
export function isDisposableSessionRoot(
  root: string,
  tempRoot: string = tmpdir(),
): boolean {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(tempRoot)) return false;
  return path.basename(resolved).startsWith(SESSION_DIR_PREFIX);
}

/**
 * Reuse the session root named by SKILL_SUMMON_SESSION if it is set, so
 * multiple skill-summon invocations in one shell share a session. Otherwise
 * open a fresh session; callers should surface `created` so the invoker
 * knows to export SKILL_SUMMON_SESSION to keep reusing it.
 *
 * The env-supplied root MUST be a disposable session dir we could have created
 * (a `skill-summon-session-*` mkdtemp under the OS temp dir). Anything else is
 * refused rather than adopted — see isDisposableSessionRoot().
 */
export async function resolveSession(
  opts: OpenSessionOptions = {},
): Promise<ResolveSessionResult> {
  const existingRoot = process.env.SKILL_SUMMON_SESSION;
  if (existingRoot) {
    if (!isDisposableSessionRoot(existingRoot)) {
      throw new Error(
        `SKILL_SUMMON_SESSION points at ${existingRoot}, which is not a disposable ` +
          `session directory. A session root must be a "${SESSION_DIR_PREFIX}*" ` +
          `directory directly under the OS temp dir (${tmpdir()}); summon refuses ` +
          `to write into or delete any other path.`,
      );
    }
    return {
      session: await SummonSession.loadAt(existingRoot),
      created: false,
    };
  }
  return { session: await openSession(opts), created: true };
}

/** List valid warm roots without creating or mutating a session. */
export async function listSessions(
  opts: ListSessionOptions = {},
): Promise<SessionSummary[]> {
  const tempRoot = opts.tempRoot ?? tmpdir();
  let entries;
  try {
    entries = await readdir(tempRoot, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Could not list session roots in ${tempRoot}: ${errorMessage(error)}`,
    );
  }

  const sessions: SessionSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(SESSION_DIR_PREFIX)) {
      continue;
    }
    const root = path.join(tempRoot, entry.name);
    const manifest = await readManifestSafely(root);
    if (!manifest) continue;
    sessions.push({
      id: manifest.id,
      name: entry.name,
      root,
      createdAt: manifest.createdAt,
      skillCount: manifest.skills.length,
      skills: manifest.skills.map((skill) => skill.id),
    });
  }
  return sessions.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

/** Resolve a listed session by manifest id, generated directory name, or root. */
export async function findSession(
  identifier: string,
  opts: ListSessionOptions = {},
): Promise<SessionSummary> {
  const cleaned = identifier.trim();
  if (!cleaned) throw new Error("Session identifier must not be empty.");
  const matches = (await listSessions(opts)).filter(
    (session) =>
      session.id === cleaned ||
      session.name === cleaned ||
      path.resolve(session.root) === path.resolve(cleaned),
  );
  if (matches.length === 0) {
    throw new Error(`Warm session not found: ${cleaned}`);
  }
  if (matches.length > 1) {
    throw new Error(`Warm session identifier is ambiguous: ${cleaned}`);
  }
  return matches[0]!;
}

/** Remove expired, abandoned session roots while preserving every live PID. */
export async function reapSessions(
  opts: ReapSessionOptions = {},
): Promise<ReapSessionOutcome> {
  const dryRun = opts.dryRun ?? false;
  const ttlHours = opts.ttlHours ?? sessionTtlHours();
  if (!Number.isFinite(ttlHours) || ttlHours < 0) {
    throw new Error(
      `Session TTL must be a non-negative number, got: ${ttlHours}`,
    );
  }

  const root = opts.tempRoot ?? tmpdir();
  const excluded = new Set(
    (opts.excludeRoots ?? []).map((item) => path.resolve(item)),
  );
  const now = (opts.now ?? new Date()).getTime();
  const candidates: ReapedSession[] = [];
  const liveProtected: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Could not scan session roots in ${root}: ${errorMessage(error)}`,
    );
  }

  let scanned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(SESSION_DIR_PREFIX))
      continue;
    const sessionRoot = path.join(root, entry.name);
    if (excluded.has(path.resolve(sessionRoot))) continue;
    scanned++;

    const manifest = await readManifestSafely(sessionRoot);
    if (manifest?.pid !== undefined && isProcessLive(manifest.pid)) {
      liveProtected.push(sessionRoot);
      continue;
    }

    const sessionStat = await lstat(sessionRoot);
    const createdAt = manifest ? Date.parse(manifest.createdAt) : Number.NaN;
    const startedAt = Number.isFinite(createdAt)
      ? createdAt
      : sessionStat.mtimeMs;
    const ageHours = Math.max(0, (now - startedAt) / 3_600_000);
    if (ageHours < ttlHours) continue;

    const bytes = await directorySize(sessionRoot);
    candidates.push({ root: sessionRoot, ageHours, bytes });
    if (!dryRun) await rm(sessionRoot, { recursive: true, force: true });
  }

  return {
    dryRun,
    ttlHours,
    scanned,
    candidates,
    reclaimedBytes: candidates.reduce((total, item) => total + item.bytes, 0),
    liveProtected,
  };
}

function sessionTtlHours(): number {
  const configured = process.env.SKILL_SUMMON_TTL_HOURS;
  if (configured === undefined) return DEFAULT_SESSION_TTL_HOURS;
  const value = Number(configured);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `SKILL_SUMMON_TTL_HOURS must be a non-negative number, got: ${configured}`,
    );
  }
  return value;
}

async function readManifestSafely(
  root: string,
): Promise<SessionManifest | undefined> {
  try {
    return JSON.parse(
      await readFile(path.join(root, MANIFEST_FILE), "utf8"),
    ) as SessionManifest;
  } catch {
    return undefined;
  }
}

function isProcessLive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}

async function directorySize(root: string): Promise<number> {
  const target = await lstat(root);
  if (!target.isDirectory()) return target.size;
  let bytes = target.size;
  for (const entry of await readdir(root)) {
    bytes += await directorySize(path.join(root, entry));
  }
  return bytes;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
