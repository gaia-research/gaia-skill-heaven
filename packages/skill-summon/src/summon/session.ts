import { createHash, randomUUID } from "node:crypto";
import { constants, realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CampaignStates } from "skill-zero";
import type { ArborSubjectReport, InstallabilityAssessment } from "skill-zero";

import { CAMPAIGN_DIR_NAME, CampaignStore } from "../campaign/store.js";
import type { SkillInvocation, TrustFields } from "../domain/types.js";
import {
  acquireRootLocalClaimForRealRoot,
  acquireSessionClaimForRealRoot,
  assertConfinedPath,
  assertConfinedPrivateMetadataDir,
  checkRootLocalClaimAbsenceForRealRoot,
  hasExistingSessionClaimForRealRoot,
  isCurrentProcessUid,
  ROOT_SESSION_CLAIM_FILE,
  type AcquiredSessionClaim,
  type SessionClaimPurpose,
} from "./session-ownership.js";

export { assertConfinedPath };

// Deliberately more specific than a bare "skill-summon-" prefix: the payload
// cache directory (payload-cache.ts CACHE_DIR_NAME) also lives directly under
// tmpdir() and is itself named "skill-summon-payload-cache-v1" — if this
// prefix were only "skill-summon-" the reaper below would treat the payload
// cache directory itself as an abandoned session candidate and delete it.
const SESSION_DIR_PREFIX = "skill-summon-session-";
// Must NOT start with SESSION_DIR_PREFIX so listSessions()/reapSessions()
// never treat the index directory as a disposable session root.
const SESSION_INDEX_DIR_PREFIX = "skill-summon-index-v1";
const MANIFEST_FILE = "session.json";
const CAMPAIGN_PAUSE_FILE = "pause.json";
const DEFAULT_SESSION_TTL_HOURS = 4;
const MAX_INDEX_ENTRY_BYTES = 64 * 1024;
const MAX_INDEX_ROOTS_PER_ID = 16;

/**
 * Environment variable(s) carrying the harness session ID. Kept in one
 * constant so other doors can add theirs without duplicating lookup logic.
 */
export const HARNESS_SESSION_ID_ENV_VARS = Object.freeze([
  "CLAUDE_CODE_SESSION_ID",
] as const);

export function readHarnessSessionId(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of HARNESS_SESSION_ID_ENV_VARS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** What the ranker knew about this skill when it chose it (SPEC §5.2). */
export type RetrievalDisclosure = {
  score: number;
  /** `(top − next) / top` across the admitted set. */
  margin: number;
  matchKind: "exact" | "ranked";
  /** Present on an exact match: the skill was resolved by this key, not by score (#240). */
  matchedBy?: { key: "id" | "catalogRef" | "name"; scope: "whole-query" | "within-query" } | undefined;
  /** False when the tree has not bucketed this skill under a generic node. */
  classified: boolean;
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
  /** Tree installability evidence, with unknown applicability kept explicit. */
  installability?: InstallabilityAssessment | undefined;
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
  /**
   * Arbor disclosure (SPEC INV-13, issue #118 A3/A4). Present on every summoned
   * skill, including — especially — when no lens could be consulted: absence of
   * behavioral evidence is stated, never left as an empty field.
   */
  arbor?: ArborSubjectReport | undefined;
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
  harnessSessionId?: string | undefined;
  createdAt: string;
  pid: number;
  ownerGeneration?: string | undefined;
  skills: MaterializedSkillRecord[];
};

export type OpenSessionOptions = {
  id?: string | undefined;
  harnessSessionId?: string | undefined;
  tempRoot?: string | undefined;
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

let commitReattachUnderClaim: (session: SummonSession) => Promise<void>;

/**
 * A session is a single mkdtemp root. All summon writes are confined to it
 * (invariant P3: never write outside the session root, never touch user
 * config). Closing a session deletes the root and everything under it.
 */
export class SummonSession {
  readonly root: string;
  readonly id: string;
  readonly #manifestPath: string;
  readonly #tempRoot: string | undefined;
  #manifest: SessionManifest;
  #manifestWriteQueue: Promise<void> = Promise.resolve();

  private constructor(
    root: string,
    manifest: SessionManifest,
    tempRoot?: string,
  ) {
    this.root = root;
    this.id = manifest.id;
    this.#manifestPath = path.join(root, MANIFEST_FILE);
    this.#tempRoot = tempRoot;
    this.#manifest = manifest;
  }

  static async createAt(
    root: string,
    id: string,
    opts: { harnessSessionId?: string | undefined; tempRoot?: string | undefined } = {},
  ): Promise<SummonSession> {
    const tempRoot = opts.tempRoot ?? tmpdir();
    const harnessSessionId = opts.harnessSessionId ?? readHarnessSessionId();
    const manifest: SessionManifest = {
      id,
      ...(harnessSessionId === undefined ? {} : { harnessSessionId }),
      createdAt: new Date().toISOString(),
      pid: process.pid,
      ownerGeneration: randomUUID(),
      skills: [],
    };
    const session = new SummonSession(root, manifest, tempRoot);
    const claimAttempt = await acquireSessionClaim(root, tempRoot, "create");
    if (claimAttempt.status === "ineligible") {
      await assertDisposableSessionRoot(root, tempRoot);
      throw new Error(`Session root ${root} is no longer available.`);
    }
    if (claimAttempt.status !== "acquired") {
      throw new Error(
        `Cannot initialize session root ${root}: ownership claim is ${claimAttempt.status}.`,
      );
    }
    try {
      await session.#writeManifest(manifest, { skipRootCheck: true });
    } finally {
      await claimAttempt.release();
    }
    if (harnessSessionId !== undefined) {
      await recordSessionInIndex(tempRoot, harnessSessionId, root).catch(
        () => {},
      );
    }
    return session;
  }

  static async loadAt(
    root: string,
    tempRoot?: string,
  ): Promise<SummonSession> {
    await assertDisposableSessionRoot(root, tempRoot);
    const manifestPath = path.join(root, MANIFEST_FILE);
    await assertConfinedPath(root, manifestPath, "Session manifest");
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      throw new Error(
        `SKILL_SUMMON_SESSION points at ${root}, but no session manifest was found there: ${errorMessage(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Invalid session manifest JSON at ${root}: ${errorMessage(error)}`,
      );
    }
    const manifest = parseSessionManifest(parsed);
    if (!manifest) {
      throw new Error(`Invalid session manifest shape at ${root}.`);
    }
    return new SummonSession(root, manifest, tempRoot);
  }

  static async reattachAt(
    root: string,
    tempRoot?: string,
  ): Promise<SummonSession> {
    const resolvedTempRoot = tempRoot ?? tmpdir();
    const prelim = await SummonSession.loadAt(root, resolvedTempRoot);
    const outcome = await tryReattachWithClaim(
      root,
      resolvedTempRoot,
      true,
      prelim.harnessSessionId,
    );
    if (outcome.status !== "adopted") {
      throw new Error(
        `Cannot reattach to session root ${root}: ${outcome.status}.`,
      );
    }
    return outcome.session;
  }

  static {
    commitReattachUnderClaim = (session: SummonSession) =>
      session.#commitReattachUnderClaim();
  }

  async #commitReattachUnderClaim(): Promise<void> {
    const pausePath = path.join(this.root, CAMPAIGN_DIR_NAME, CAMPAIGN_PAUSE_FILE);
    await assertConfinedPath(this.root, pausePath, "Campaign pause boundary");
    try {
      const pauseStat = await lstat(pausePath);
      if (pauseStat.isSymbolicLink() || !pauseStat.isFile()) {
        throw new Error(
          `Campaign pause boundary must be a regular file: ${pausePath}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await CampaignStore.load(this.root);

    const previousManifest = this.#manifest;
    const nextManifest: SessionManifest = {
      ...previousManifest,
      pid: process.pid,
      ownerGeneration: randomUUID(),
    };
    await this.#writeManifest(nextManifest);
    this.#manifest = nextManifest;

    // Single authoritative atomic commit point above: `ownerGeneration` on
    // `session.json` invalidates any prior or forged `pause.json` marker even
    // if post-commit cleanup fails, without depending on a second fallible
    // manifest rollback write.
    await clearPauseBoundary(this.root).catch(() => {});
  }

  get harnessSessionId(): string | undefined {
    return this.#manifest.harnessSessionId;
  }

  get pid(): number {
    return this.#manifest.pid;
  }

  get ownerGeneration(): string | undefined {
    return this.#manifest.ownerGeneration;
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
    // The environment can name an existing directory, and both cache and
    // skills are recursive write targets. Validate the physical root before
    // creating either child so a symlink cannot redirect writes outside it.
    await assertDisposableSessionRoot(this.root, this.#tempRoot);
    await ensureConfinedDirectory(this.root, this.cacheRoot);
    await ensureConfinedDirectory(this.root, this.skillsRoot);
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
    const run = this.#manifestWriteQueue
      .catch(() => {})
      .then(async () => {
        const nextManifest: SessionManifest = {
          ...this.#manifest,
          skills: [...this.#manifest.skills, record],
        };
        await this.#writeManifestSnapshot(nextManifest);
        this.#manifest = nextManifest;
      });
    this.#manifestWriteQueue = run;
    return run;
  }

  async close(): Promise<void> {
    const harnessSessionId = this.#manifest.harnessSessionId;
    const tempRoot = this.#tempRoot ?? tmpdir();
    const claimAttempt = await acquireSessionClaim(this.root, tempRoot, "close");
    if (claimAttempt.status === "acquired") {
      try {
        await assertDisposableSessionRoot(this.root, tempRoot);
        await quarantineAndRemoveSessionRoot(this.root);
      } catch (error) {
        if (!isConcurrentRemovalErrorOrCause(error)) {
          throw error;
        }
      } finally {
        await claimAttempt.release();
      }
    } else if (claimAttempt.status !== "ineligible") {
      throw new Error(
        `Cannot close session root ${this.root}: ownership claim is ${claimAttempt.status}.`,
      );
    }
    if (harnessSessionId !== undefined) {
      await removeSessionFromIndex(
        tempRoot,
        harnessSessionId,
        this.root,
      ).catch(() => {});
    }
  }

  async #writeManifest(
    manifest: SessionManifest = this.#manifest,
    opts: { skipRootCheck?: boolean } = {},
  ): Promise<void> {
    const snapshot: SessionManifest = {
      ...manifest,
      skills: [...manifest.skills],
    };
    const run = this.#manifestWriteQueue
      .catch(() => {})
      .then(() => this.#writeManifestSnapshot(snapshot, opts));
    this.#manifestWriteQueue = run;
    return run;
  }

  async #writeManifestSnapshot(
    manifest: SessionManifest,
    opts: { skipRootCheck?: boolean } = {},
  ): Promise<void> {
    if (!opts.skipRootCheck) {
      await assertDisposableSessionRoot(this.root, this.#tempRoot);
    }
    await assertConfinedPath(this.root, this.#manifestPath, "Session manifest");
    const tmpPath = path.join(
      this.root,
      `.${MANIFEST_FILE}.tmp-${process.pid}-${randomUUID()}`,
    );
    let renamed = false;
    try {
      await writeFile(tmpPath, JSON.stringify(manifest, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      try {
        const targetStat = await lstat(this.#manifestPath);
        if (targetStat.isSymbolicLink()) {
          throw new Error(
            `Session manifest traverses a symlink: ${this.#manifestPath}`,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      await rename(tmpPath, this.#manifestPath);
      renamed = true;
    } finally {
      if (!renamed) {
        await rm(tmpPath, { force: true }).catch(() => {});
      }
    }
  }
}

export async function openSession(
  opts: OpenSessionOptions = {},
): Promise<SummonSession> {
  const tempRoot = opts.tempRoot ?? tmpdir();
  const harnessSessionId = opts.harnessSessionId ?? readHarnessSessionId();
  const root = await mkdtemp(path.join(tempRoot, SESSION_DIR_PREFIX));
  return SummonSession.createAt(root, opts.id ?? randomUUID(), {
    harnessSessionId,
    tempRoot,
  });
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
  if (root.includes("\0")) return false;
  const resolved = path.resolve(root);
  const name = path.basename(resolved);
  if (!name.startsWith(SESSION_DIR_PREFIX)) return false;
  if (path.dirname(resolved) === path.resolve(tempRoot)) return true;

  // macOS commonly exposes /tmp as an alias of /private/tmp. Keep the cheap
  // synchronous predicate useful for callers that only have a path, while the
  // async validator below checks the actual root and all physical boundaries.
  try {
    return realpathSync(path.dirname(resolved)) === realpathSync(tempRoot);
  } catch {
    return false;
  }
}

/**
 * Validate an env-supplied session root before any session file is read or
 * written. Lexical prefix checks are insufficient: the named root itself, or
 * an ancestor reached through a platform alias, may be a symlink.
 */
export async function assertDisposableSessionRoot(
  root: string,
  tempRoot: string = tmpdir(),
): Promise<void> {
  await resolveValidatedDisposableSessionRoot(root, tempRoot);
}

async function resolveValidatedDisposableSessionRoot(
  root: string,
  tempRoot: string = tmpdir(),
): Promise<string> {
  if (!isDisposableSessionRoot(root, tempRoot)) {
    throw new Error(
      `Session root ${root} is not a direct child of the OS temp directory (${tempRoot}).`,
    );
  }

  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    throw new Error(
      `Session root ${root} is not an existing directory: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Session root ${root} must be a real directory, not a symlink or file.`);
  }

  let rootReal: string;
  let tempReal: string;
  try {
    [rootReal, tempReal] = await Promise.all([realpath(root), realpath(tempRoot)]);
  } catch (error) {
    throw new Error(
      `Session root ${root} could not be resolved: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  if (
    path.dirname(rootReal) !== tempReal ||
    !path.basename(rootReal).startsWith(SESSION_DIR_PREFIX)
  ) {
    throw new Error(
      `Session root ${root} resolves outside the disposable temp-root namespace.`,
    );
  }
  return rootReal;
}

async function ensureConfinedDirectory(root: string, target: string): Promise<void> {
  await assertConfinedPath(root, target, "Session directory");
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error(`Session directory ${target} must be a real directory.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(target);
  }
  await assertConfinedPath(root, target, "Session directory");
}

type ReattachWithClaimOutcome =
  | { status: "adopted"; session: SummonSession }
  | { status: "busy" | "ineligible" };

function isConcurrentRemovalErrorOrCause(error: unknown): boolean {
  if (isConcurrentRemoval(error)) return true;
  if (error instanceof Error && error.cause !== undefined) {
    return isConcurrentRemoval(error.cause);
  }
  return false;
}

async function acquireSessionClaim(
  root: string,
  tempRoot: string,
  purpose: SessionClaimPurpose,
): Promise<
  | AcquiredSessionClaim
  | { readonly status: "busy" | "unavailable" | "ineligible" }
> {
  let realSessionRoot: string;
  try {
    realSessionRoot = await resolveValidatedDisposableSessionRoot(root, tempRoot);
  } catch (error) {
    if (isConcurrentRemovalErrorOrCause(error)) {
      return { status: "ineligible" };
    }
    throw error;
  }

  if (purpose === "reattach") {
    const rootAbsence = await checkRootLocalClaimAbsenceForRealRoot(
      realSessionRoot,
    );
    if (rootAbsence !== "absent") {
      return { status: rootAbsence };
    }
    return acquireSessionClaimForRealRoot(realSessionRoot, tempRoot, purpose);
  }

  const rootClaim = await acquireRootLocalClaimForRealRoot(
    realSessionRoot,
    purpose,
  );
  if (rootClaim.status !== "acquired") {
    return rootClaim;
  }

  const externalClaim = await acquireSessionClaimForRealRoot(
    realSessionRoot,
    tempRoot,
    purpose,
  );
  if (externalClaim.status === "acquired") {
    return {
      status: "acquired",
      claimPath: externalClaim.claimPath,
      async release(): Promise<void> {
        try {
          await externalClaim.release();
        } finally {
          await rootClaim.release();
        }
      },
    };
  }

  if (externalClaim.status === "unavailable" && purpose === "create") {
    return rootClaim;
  }

  await rootClaim.release();
  return { status: externalClaim.status };
}

async function tryReattachWithClaim(
  root: string,
  tempRoot: string,
  hasExpectedHarnessId: boolean,
  expectedHarnessSessionId: string | undefined,
): Promise<ReattachWithClaimOutcome> {
  const claimAttempt = await acquireSessionClaim(root, tempRoot, "reattach");
  if (claimAttempt.status !== "acquired") {
    return {
      status: claimAttempt.status === "ineligible" ? "ineligible" : "busy",
    };
  }

  let adoptedSession: SummonSession | undefined;
  try {
    let session: SummonSession;
    try {
      session = await SummonSession.loadAt(root, tempRoot);
    } catch (error) {
      if (isConcurrentRemovalErrorOrCause(error)) {
        return { status: "ineligible" };
      }
      throw error;
    }

    if (
      hasExpectedHarnessId &&
      session.harnessSessionId !== expectedHarnessSessionId
    ) {
      return { status: "ineligible" };
    }
    if (!hasProvenDeadPid(session.pid)) {
      return { status: "ineligible" };
    }

    await commitReattachUnderClaim(session);
    adoptedSession = session;
  } finally {
    await claimAttempt.release();
  }

  if (adoptedSession.harnessSessionId !== undefined) {
    await recordSessionInIndex(
      tempRoot,
      adoptedSession.harnessSessionId,
      root,
    ).catch(() => {});
  }

  return { status: "adopted", session: adoptedSession };
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
  const tempRoot = opts.tempRoot ?? tmpdir();
  const harnessSessionId = opts.harnessSessionId ?? readHarnessSessionId();
  const existingRoot = process.env.SKILL_SUMMON_SESSION;
  if (existingRoot) {
    if (!isDisposableSessionRoot(existingRoot, tempRoot)) {
      throw new Error(
        `SKILL_SUMMON_SESSION points at ${existingRoot}, which is not a disposable ` +
          `session directory. A session root must be a "${SESSION_DIR_PREFIX}*" ` +
          `directory directly under the OS temp dir (${tempRoot}); summon refuses ` +
          `to write into or delete any other path.`,
      );
    }
    const existing = await SummonSession.loadAt(existingRoot, tempRoot);
    if (harnessSessionId === undefined) {
      await CampaignStore.load(existingRoot);
      return {
        session: existing,
        created: false,
      };
    }
    if (
      existing.harnessSessionId === harnessSessionId &&
      hasProvenDeadPid(existing.pid)
    ) {
      const outcome = await tryReattachWithClaim(
        existingRoot,
        tempRoot,
        true,
        harnessSessionId,
      );
      if (outcome.status === "adopted") {
        return {
          session: outcome.session,
          created: false,
        };
      }
      // Contender or crash-left claim ("busy") or concurrently invalidated/deleted:
      // skip this root and create a fresh root without waiting or scanning.
      return {
        session: await openSession({ ...opts, harnessSessionId, tempRoot }),
        created: true,
      };
    }
  }

  if (harnessSessionId) {
    const match = await findIndexedDeadSession(tempRoot, harnessSessionId);
    if (match) {
      const outcome = await tryReattachWithClaim(
        match,
        tempRoot,
        true,
        harnessSessionId,
      );
      if (outcome.status === "adopted") {
        return {
          session: outcome.session,
          created: false,
        };
      }
    }
  }

  return {
    session: await openSession({ ...opts, harnessSessionId, tempRoot }),
    created: true,
  };
}

type HarnessSessionIndexEntry = {
  version: 1;
  roots: string[];
};

const indexWriteQueues = new Map<string, Promise<void>>();

function sessionIndexDirName(): string {
  const uid = process.getuid?.();
  return uid === undefined
    ? SESSION_INDEX_DIR_PREFIX
    : `${SESSION_INDEX_DIR_PREFIX}-${uid}`;
}

function sessionIndexDir(tempRoot: string): string {
  return path.join(tempRoot, sessionIndexDirName());
}

function harnessSessionIndexKey(harnessSessionId: string): string {
  return createHash("sha256")
    .update("skill-summon-harness-session-v1\0")
    .update(harnessSessionId, "utf8")
    .digest("hex");
}

async function assertConfinedIndexDir(
  tempRoot: string,
  indexDir: string,
): Promise<void> {
  await assertConfinedPrivateMetadataDir(
    tempRoot,
    indexDir,
    "Session index directory",
  );
}

function parseIndexEntry(raw: unknown): string[] | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.roots)) {
    return undefined;
  }
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const item of obj.roots) {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.includes("\0") ||
      !path.isAbsolute(item)
    ) {
      continue;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    roots.push(item);
    if (roots.length >= MAX_INDEX_ROOTS_PER_ID) break;
  }
  return roots;
}

async function readConfinedIndexFile(
  indexDir: string,
  entryPath: string,
): Promise<{ exists: boolean; confined: boolean; roots?: string[] }> {
  try {
    await assertConfinedPath(indexDir, entryPath, "Session index entry");
  } catch {
    return { exists: true, confined: false };
  }

  let entryStat;
  try {
    entryStat = await lstat(entryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, confined: true };
    }
    return { exists: true, confined: false };
  }

  if (
    entryStat.isSymbolicLink() ||
    !entryStat.isFile() ||
    !isCurrentProcessUid(entryStat.uid)
  ) {
    return { exists: true, confined: false };
  }
  if (entryStat.size > MAX_INDEX_ENTRY_BYTES) {
    return { exists: true, confined: true, roots: undefined };
  }

  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(entryPath, flags);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, confined: true };
    }
    return { exists: true, confined: false };
  }

  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || !isCurrentProcessUid(openedStat.uid)) {
      return { exists: true, confined: false };
    }
    if (openedStat.size > MAX_INDEX_ENTRY_BYTES) {
      return { exists: true, confined: true, roots: undefined };
    }
    const maxReadBytes = MAX_INDEX_ENTRY_BYTES + 1;
    const buffer = Buffer.allocUnsafe(maxReadBytes);
    let totalBytes = 0;
    while (totalBytes < maxReadBytes) {
      const { bytesRead } = await handle.read(
        buffer,
        totalBytes,
        maxReadBytes - totalBytes,
        totalBytes,
      );
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
    }
    if (totalBytes > MAX_INDEX_ENTRY_BYTES) {
      return { exists: true, confined: true, roots: undefined };
    }
    const raw = buffer.subarray(0, totalBytes).toString("utf8");
    return {
      exists: true,
      confined: true,
      roots: parseIndexEntry(JSON.parse(raw) as unknown),
    };
  } catch {
    return { exists: true, confined: true, roots: undefined };
  } finally {
    await handle.close();
  }
}

function enqueueIndexUpdate(
  indexDir: string,
  key: string,
  fn: () => Promise<void>,
): Promise<void> {
  const queueKey = `${indexDir}\0${key}`;
  const prev = indexWriteQueues.get(queueKey) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tracked = next.then(
    () => {
      if (indexWriteQueues.get(queueKey) === tracked) {
        indexWriteQueues.delete(queueKey);
      }
    },
    () => {
      if (indexWriteQueues.get(queueKey) === tracked) {
        indexWriteQueues.delete(queueKey);
      }
    },
  );
  indexWriteQueues.set(queueKey, tracked);
  return next;
}

async function writeIndexEntryAtomically(
  indexDir: string,
  entryPath: string,
  key: string,
  roots: readonly string[],
): Promise<void> {
  const tmpPath = path.join(
    indexDir,
    `.tmp-${key}-${process.pid}-${randomUUID()}`,
  );
  const payload: HarnessSessionIndexEntry = {
    version: 1,
    roots: [...roots],
  };
  try {
    await writeFile(tmpPath, `${JSON.stringify(payload)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(tmpPath, entryPath);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}

async function recordSessionInIndex(
  tempRoot: string,
  harnessSessionId: string,
  sessionRoot: string,
): Promise<void> {
  const indexDir = sessionIndexDir(tempRoot);
  const key = harnessSessionIndexKey(harnessSessionId);
  const absoluteRoot = path.resolve(sessionRoot);
  await enqueueIndexUpdate(indexDir, key, async () => {
    try {
      await mkdir(indexDir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return;
    }
    try {
      await assertConfinedIndexDir(tempRoot, indexDir);
    } catch {
      return;
    }

    const entryPath = path.join(indexDir, `${key}.json`);
    const existing = await readConfinedIndexFile(indexDir, entryPath);
    if (!existing.confined) return;
    const existingRoots = existing.roots ?? [];
    if (existingRoots[0] === absoluteRoot) return;

    const nextRoots = [
      absoluteRoot,
      ...existingRoots.filter((item) => item !== absoluteRoot),
    ].slice(0, MAX_INDEX_ROOTS_PER_ID);

    await writeIndexEntryAtomically(indexDir, entryPath, key, nextRoots);
  });
}

async function removeSessionFromIndex(
  tempRoot: string,
  harnessSessionId: string,
  sessionRoot: string,
): Promise<void> {
  const indexDir = sessionIndexDir(tempRoot);
  const key = harnessSessionIndexKey(harnessSessionId);
  const absoluteRoot = path.resolve(sessionRoot);
  await enqueueIndexUpdate(indexDir, key, async () => {
    try {
      await assertConfinedIndexDir(tempRoot, indexDir);
    } catch {
      return;
    }

    const entryPath = path.join(indexDir, `${key}.json`);
    const existing = await readConfinedIndexFile(indexDir, entryPath);
    if (!existing.confined || !existing.exists || !existing.roots) return;
    if (!existing.roots.includes(absoluteRoot)) return;

    const nextRoots = existing.roots.filter((item) => item !== absoluteRoot);
    if (nextRoots.length === 0) {
      await rm(entryPath, { force: true });
      return;
    }

    await writeIndexEntryAtomically(indexDir, entryPath, key, nextRoots);
  });
}

async function findIndexedDeadSession(
  tempRoot: string,
  harnessSessionId: string,
): Promise<string | undefined> {
  const indexDir = sessionIndexDir(tempRoot);
  try {
    await assertConfinedIndexDir(tempRoot, indexDir);
  } catch {
    return undefined;
  }

  const key = harnessSessionIndexKey(harnessSessionId);
  const entryPath = path.join(indexDir, `${key}.json`);
  const existing = await readConfinedIndexFile(indexDir, entryPath);
  if (!existing.confined || !existing.exists || !existing.roots || existing.roots.length === 0) {
    return undefined;
  }

  const matches: { root: string; createdAt: string }[] = [];
  for (const candidateRoot of existing.roots) {
    try {
      await assertDisposableSessionRoot(candidateRoot, tempRoot);
      await assertConfinedPath(
        candidateRoot,
        path.join(candidateRoot, MANIFEST_FILE),
        "Session manifest",
      );
    } catch {
      continue;
    }
    const manifest = await readManifestSafely(candidateRoot);
    if (!manifest || manifest.harnessSessionId !== harnessSessionId) continue;
    if (!hasProvenDeadPid(manifest.pid)) continue;
    matches.push({
      root: candidateRoot,
      createdAt: manifest.createdAt,
    });
  }

  if (matches.length === 0) return undefined;
  matches.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return matches[0]!.root;
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

type RetentionDecision =
  | { kind: "preserve"; needsPauseWrite: boolean }
  | { kind: "reap"; ageHours: number; needsPauseWrite: boolean };

async function evaluateRetentionDecision(
  sessionRoot: string,
  manifest: SessionManifest | undefined,
  mtimeMs: number,
  paused: PausedCampaignRetention,
  ttlHours: number,
  nowMs: number,
  dryRun: boolean,
): Promise<RetentionDecision> {
  if (paused.kind === "preserve") {
    return { kind: "preserve", needsPauseWrite: false };
  }
  const createdAt = manifest ? Date.parse(manifest.createdAt) : Number.NaN;
  let startedAt = Number.isFinite(createdAt) ? createdAt : mtimeMs;
  let effectiveTtlHours = ttlHours;
  let needsPauseWrite = false;

  if (paused.kind === "paused") {
    if (manifest === undefined) {
      return { kind: "preserve", needsPauseWrite: false };
    }
    const pauseBoundary = await resolvePauseBoundaryMs(
      sessionRoot,
      manifest.pid,
      manifest.ownerGeneration,
      paused.recordSha256,
      nowMs,
      dryRun,
    );
    if (pauseBoundary.kind === "preserve") {
      return { kind: "preserve", needsPauseWrite: false };
    }
    startedAt = pauseBoundary.boundaryMs;
    effectiveTtlHours = paused.retentionHours;
    needsPauseWrite = pauseBoundary.needsMutation;
  }

  const ageHours = Math.max(0, (nowMs - startedAt) / 3_600_000);
  if (ageHours < effectiveTtlHours) {
    return { kind: "preserve", needsPauseWrite };
  }
  return { kind: "reap", ageHours, needsPauseWrite };
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

    const prelimManifest = await readManifestSafely(sessionRoot);
    if (prelimManifest?.pid !== undefined && isProcessLive(prelimManifest.pid)) {
      liveProtected.push(sessionRoot);
      continue;
    }

    let prelimStat;
    try {
      prelimStat = await lstat(sessionRoot);
    } catch (error) {
      if (isConcurrentRemoval(error)) continue;
      throw error;
    }
    if (prelimStat.isSymbolicLink() || !prelimStat.isDirectory()) {
      continue;
    }

    const prelimPaused = await loadPausedCampaignRetention(sessionRoot);
    const prelimDecision = await evaluateRetentionDecision(
      sessionRoot,
      prelimManifest,
      prelimStat.mtimeMs,
      prelimPaused,
      ttlHours,
      now,
      true,
    );

    if (dryRun) {
      if (prelimDecision.kind !== "reap") continue;
      let realSessionRoot: string;
      try {
        realSessionRoot = await realpath(sessionRoot);
      } catch (error) {
        if (isConcurrentRemoval(error)) continue;
        throw error;
      }
      if (await hasExistingSessionClaimForRealRoot(realSessionRoot, root)) {
        continue;
      }
      let bytes = 0;
      try {
        bytes = await directorySize(sessionRoot);
      } catch (error) {
        if (isConcurrentRemoval(error)) continue;
        throw error;
      }
      candidates.push({
        root: sessionRoot,
        ageHours: prelimDecision.ageHours,
        bytes,
      });
      continue;
    }

    if (
      !prelimDecision.needsPauseWrite &&
      prelimDecision.kind !== "reap"
    ) {
      continue;
    }

    const claimAttempt = await acquireSessionClaim(sessionRoot, root, "gc");
    if (claimAttempt.status !== "acquired") {
      continue;
    }

    try {
      let sessionStat;
      try {
        sessionStat = await lstat(sessionRoot);
      } catch (error) {
        if (isConcurrentRemoval(error)) continue;
        throw error;
      }
      if (sessionStat.isSymbolicLink() || !sessionStat.isDirectory()) {
        continue;
      }

      const manifest = await readManifestSafely(sessionRoot);
      if (manifest?.pid !== undefined && isProcessLive(manifest.pid)) {
        liveProtected.push(sessionRoot);
        continue;
      }

      const paused = await loadPausedCampaignRetention(sessionRoot);
      const decision = await evaluateRetentionDecision(
        sessionRoot,
        manifest,
        sessionStat.mtimeMs,
        paused,
        ttlHours,
        now,
        false,
      );
      if (decision.kind !== "reap") continue;

      let bytes = 0;
      try {
        bytes = await directorySize(sessionRoot);
      } catch (error) {
        if (isConcurrentRemoval(error)) continue;
        throw error;
      }
      try {
        await quarantineAndRemoveSessionRoot(sessionRoot);
      } catch (error) {
        if (isConcurrentRemoval(error)) continue;
        throw error;
      }
      candidates.push({ root: sessionRoot, ageHours: decision.ageHours, bytes });
      if (manifest?.harnessSessionId !== undefined) {
        await removeSessionFromIndex(
          root,
          manifest.harnessSessionId,
          sessionRoot,
        ).catch(() => {});
      }
    } finally {
      await claimAttempt.release();
    }
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

type PausedCampaignRetention =
  | { kind: "absent" }
  | { kind: "not_paused" }
  | { kind: "preserve" }
  | { kind: "paused"; retentionHours: number; recordSha256: string };

async function loadPausedCampaignRetention(
  sessionRoot: string,
): Promise<PausedCampaignRetention> {
  const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
  let campaignStat;
  try {
    campaignStat = await lstat(campaignDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }
    return { kind: "preserve" };
  }
  if (campaignStat.isSymbolicLink() || !campaignStat.isDirectory()) {
    return { kind: "preserve" };
  }

  let store: CampaignStore;
  try {
    store = await CampaignStore.load(sessionRoot, {
      refreshStatus: false,
    });
  } catch {
    return { kind: "preserve" };
  }

  if (!store.hasTrace) {
    return { kind: "absent" };
  }
  if (store.corrupted || !store.recordSha256) {
    return { kind: "preserve" };
  }
  const state = store.state;
  if (
    state.approved &&
    state.charter !== null &&
    (state.state === CampaignStates.executing ||
      state.state === CampaignStates.convergence)
  ) {
    if (
      !Number.isFinite(state.charter.sessionRetention) ||
      state.charter.sessionRetention < 0
    ) {
      return { kind: "preserve" };
    }
    return {
      kind: "paused",
      retentionHours: state.charter.sessionRetention,
      recordSha256: store.recordSha256,
    };
  }
  return { kind: "not_paused" };
}

async function quarantineAndRemoveSessionRoot(
  sessionRoot: string,
): Promise<void> {
  const parentDir = path.dirname(path.resolve(sessionRoot));
  const quarantinePath = path.join(
    parentDir,
    `.skill-summon-reap-${process.pid}-${randomUUID()}`,
  );
  await rename(sessionRoot, quarantinePath);
  await rm(quarantinePath, { recursive: true, force: true });
}

async function clearPauseBoundary(sessionRoot: string): Promise<void> {
  const pausePath = path.join(sessionRoot, CAMPAIGN_DIR_NAME, CAMPAIGN_PAUSE_FILE);
  await assertConfinedPath(sessionRoot, pausePath, "Campaign pause boundary");
  let pauseStat;
  try {
    pauseStat = await lstat(pausePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (pauseStat.isSymbolicLink() || !pauseStat.isFile()) {
    throw new Error(
      `Campaign pause boundary must be a regular file: ${pausePath}`,
    );
  }
  await rm(pausePath, { force: true });
}

type PauseBoundaryResolution =
  | { kind: "preserve" }
  | { kind: "boundary"; boundaryMs: number; needsMutation: boolean };

async function resolvePauseBoundaryMs(
  sessionRoot: string,
  expectedPid: number,
  expectedOwnerGeneration: string | undefined,
  expectedRecordSha256: string,
  nowMs: number,
  dryRun: boolean,
): Promise<PauseBoundaryResolution> {
  const pausePath = path.join(sessionRoot, CAMPAIGN_DIR_NAME, CAMPAIGN_PAUSE_FILE);
  try {
    await assertConfinedPath(sessionRoot, pausePath, "Campaign pause boundary");
  } catch {
    return { kind: "preserve" };
  }

  let stat;
  try {
    stat = await lstat(pausePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (!dryRun) {
        try {
          await writePauseBoundary(
            pausePath,
            expectedPid,
            expectedOwnerGeneration,
            expectedRecordSha256,
            nowMs,
          );
        } catch {
          return { kind: "preserve" };
        }
      }
      return { kind: "boundary", boundaryMs: nowMs, needsMutation: true };
    }
    return { kind: "preserve" };
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { kind: "preserve" };
  }

  let raw: string;
  try {
    raw = await readFile(pausePath, "utf8");
  } catch {
    return { kind: "preserve" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      if (!dryRun) {
        try {
          await writePauseBoundary(
            pausePath,
            expectedPid,
            expectedOwnerGeneration,
            expectedRecordSha256,
            nowMs,
          );
        } catch {
          return { kind: "preserve" };
        }
      }
      return { kind: "boundary", boundaryMs: nowMs, needsMutation: true };
    }
    const obj = parsed as Record<string, unknown>;
    const pausedAtMs =
      typeof obj.pausedAt === "string" ? Date.parse(obj.pausedAt) : Number.NaN;
    const objOwnerGen =
      typeof obj.ownerGeneration === "string" &&
      obj.ownerGeneration.trim().length > 0
        ? obj.ownerGeneration
        : undefined;
    const hasValidOwnerGenField =
      obj.ownerGeneration === undefined || objOwnerGen !== undefined;
    const ownerGenMatches =
      hasValidOwnerGenField && objOwnerGen === expectedOwnerGeneration;
    if (
      !Number.isFinite(pausedAtMs) ||
      pausedAtMs > nowMs ||
      obj.pid !== expectedPid ||
      obj.recordSha256 !== expectedRecordSha256 ||
      !ownerGenMatches
    ) {
      if (!dryRun) {
        try {
          await writePauseBoundary(
            pausePath,
            expectedPid,
            expectedOwnerGeneration,
            expectedRecordSha256,
            nowMs,
          );
        } catch {
          return { kind: "preserve" };
        }
      }
      return { kind: "boundary", boundaryMs: nowMs, needsMutation: true };
    }
    return { kind: "boundary", boundaryMs: pausedAtMs, needsMutation: false };
  } catch {
    if (!dryRun) {
      try {
        await writePauseBoundary(
          pausePath,
          expectedPid,
          expectedOwnerGeneration,
          expectedRecordSha256,
          nowMs,
        );
      } catch {
        return { kind: "preserve" };
      }
    }
    return { kind: "boundary", boundaryMs: nowMs, needsMutation: true };
  }
}

async function writePauseBoundary(
  pausePath: string,
  pid: number,
  ownerGeneration: string | undefined,
  recordSha256: string,
  nowMs: number,
): Promise<void> {
  const campaignDir = path.dirname(pausePath);
  const tmpPath = path.join(
    campaignDir,
    `.${CAMPAIGN_PAUSE_FILE}.tmp-${process.pid}-${randomUUID()}`,
  );
  const payload = {
    pausedAt: new Date(nowMs).toISOString(),
    pid,
    ...(ownerGeneration === undefined ? {} : { ownerGeneration }),
    recordSha256,
  };
  let renamed = false;
  try {
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    try {
      const targetStat = await lstat(pausePath);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        throw new Error(
          `Campaign pause boundary must be a regular file: ${pausePath}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await rename(tmpPath, pausePath);
    renamed = true;
  } finally {
    if (!renamed) {
      await rm(tmpPath, { force: true }).catch(() => {});
    }
  }
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
    const parsed = JSON.parse(
      await readFile(path.join(root, MANIFEST_FILE), "utf8"),
    ) as unknown;
    return parseSessionManifest(parsed);
  } catch {
    return undefined;
  }
}

function parseSessionManifest(raw: unknown): SessionManifest | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) return undefined;
  if (typeof obj.createdAt !== "string") return undefined;
  if (!isValidPid(obj.pid)) return undefined;
  if (!Array.isArray(obj.skills)) return undefined;
  if (
    obj.harnessSessionId !== undefined &&
    (typeof obj.harnessSessionId !== "string" ||
      obj.harnessSessionId.trim().length === 0)
  ) {
    return undefined;
  }
  if (
    obj.ownerGeneration !== undefined &&
    (typeof obj.ownerGeneration !== "string" ||
      obj.ownerGeneration.trim().length === 0)
  ) {
    return undefined;
  }
  return obj as SessionManifest;
}

function isValidPid(pid: unknown): pid is number {
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0;
}

function hasProvenDeadPid(pid: unknown): boolean {
  if (!isValidPid(pid)) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function isProcessLive(pid: unknown): boolean {
  if (!isValidPid(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}

/**
 * Total size of the session's FILES. A directory's own inode size is excluded:
 * it is platform-dependent (4096 on ext4, ~64 on APFS), so counting it makes
 * `reclaimedBytes` report a different number for identical content per host.
 * Same rule as payload-cache's directorySize (#41).
 */
async function directorySize(root: string, isRoot = true): Promise<number> {
  const target = await lstat(root);
  if (!target.isDirectory()) return target.size;
  let bytes = 0;
  for (const entry of await readdir(root)) {
    if (isRoot && entry === ROOT_SESSION_CLAIM_FILE) continue;
    bytes += await directorySize(path.join(root, entry), false);
  }
  return bytes;
}

export function isConcurrentRemoval(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
