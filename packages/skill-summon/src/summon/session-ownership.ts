import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";

export const SESSION_CLAIM_DIR_PREFIX = "skill-summon-claims-v1";
export const ROOT_SESSION_CLAIM_FILE = ".session.claim";
const SESSION_CLAIM_KEY_DOMAIN = "skill-summon-root-claim-v1\0";

export type SessionClaimPurpose =
  | "create"
  | "reattach"
  | "gc"
  | "close"
  | "campaign";

export type AcquiredSessionClaim = {
  readonly status: "acquired";
  readonly claimPath: string;
  release(): Promise<void>;
};

export type SessionClaimAttempt =
  | AcquiredSessionClaim
  | { readonly status: "busy" | "unavailable" };

export function isCurrentProcessUid(uid: number): boolean {
  const currentUid = process.getuid?.();
  return currentUid === undefined || uid === currentUid;
}

export function sessionClaimDirName(): string {
  const uid = process.getuid?.();
  return uid === undefined
    ? SESSION_CLAIM_DIR_PREFIX
    : `${SESSION_CLAIM_DIR_PREFIX}-${uid}`;
}

export function sessionClaimDir(tempRoot: string): string {
  return path.join(tempRoot, sessionClaimDirName());
}

export function sessionClaimKey(realSessionRoot: string): string {
  return createHash("sha256")
    .update(SESSION_CLAIM_KEY_DOMAIN)
    .update(realSessionRoot, "utf8")
    .digest("hex");
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

/** Validate an existing or not-yet-created path stays physically below root. */
export async function assertConfinedPath(
  root: string,
  target: string,
  label = "Path",
): Promise<void> {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  if (!isWithin(rootResolved, targetResolved)) {
    throw new Error(`${label} escapes session root: ${target}`);
  }

  const rootReal = await realpath(rootResolved);
  let current = targetResolved;
  while (true) {
    let currentStat;
    try {
      currentStat = await lstat(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      if (current === rootResolved) throw error;
      current = path.dirname(current);
      continue;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error(`${label} traverses a symlink: ${current}`);
    }
    if (current !== targetResolved && !currentStat.isDirectory()) {
      throw new Error(`${label} traverses a non-directory path: ${current}`);
    }
    if (current === rootResolved) return;
    const currentReal = await realpath(current);
    if (!isWithin(rootReal, currentReal)) {
      throw new Error(`${label} resolves outside session root: ${target}`);
    }
    current = path.dirname(current);
  }
}

export async function assertConfinedPrivateMetadataDir(
  tempRoot: string,
  metadataDir: string,
  label: string,
): Promise<void> {
  const dirStat = await lstat(metadataDir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`${label} ${metadataDir} must be a real directory.`);
  }
  if (!isCurrentProcessUid(dirStat.uid)) {
    throw new Error(`${label} ${metadataDir} has unexpected owner.`);
  }
  if (process.platform !== "win32" && (dirStat.mode & 0o077) !== 0) {
    throw new Error(
      `${label} ${metadataDir} must not have group or other permissions.`,
    );
  }
  const [tempReal, dirReal] = await Promise.all([
    realpath(tempRoot),
    realpath(metadataDir),
  ]);
  if (
    path.dirname(dirReal) !== tempReal ||
    path.basename(dirReal) !== path.basename(metadataDir)
  ) {
    throw new Error(`${label} ${metadataDir} resolves outside ${tempRoot}.`);
  }
}

/**
 * Acquire a nonblocking, exclusive per-root claim inside a private metadata
 * directory under `tempRoot` keyed by the canonical real path of the target
 * disposable session root.
 *
 * Crash-left claims (existing claim files left behind by dead processes) and
 * unsafe/unverifiable claim paths are never broken automatically; contenders
 * treat `EEXIST` as `busy` and skip rather than waiting, scanning, or guessing.
 */
export async function acquireSessionClaimForRealRoot(
  realSessionRoot: string,
  tempRoot: string,
  purpose: SessionClaimPurpose,
): Promise<SessionClaimAttempt> {
  const claimsDir = sessionClaimDir(tempRoot);
  try {
    await mkdir(claimsDir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return { status: "unavailable" };
    }
  }

  try {
    await assertConfinedPrivateMetadataDir(
      tempRoot,
      claimsDir,
      "Session claim directory",
    );
  } catch {
    return { status: "unavailable" };
  }

  const claimPath = path.join(
    claimsDir,
    `${sessionClaimKey(realSessionRoot)}.claim`,
  );
  try {
    await assertConfinedPath(claimsDir, claimPath, "Session ownership claim");
  } catch (error) {
    if (isSymlinkOrUnsafeClaimPathError(error)) {
      return { status: "busy" };
    }
    return { status: "unavailable" };
  }

  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(claimPath, flags, 0o600);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ELOOP") {
      return { status: "busy" };
    }
    return { status: "unavailable" };
  }

  try {
    const metadata = JSON.stringify({
      version: 1,
      pid: process.pid,
      purpose,
      acquiredAt: new Date().toISOString(),
    });
    await handle.writeFile(`${metadata}\n`, "utf8");
    await handle.close();
  } catch {
    await handle.close().catch(() => {});
    await rm(claimPath, { force: true }).catch(() => {});
    return { status: "unavailable" };
  }

  let released = false;
  return {
    status: "acquired",
    claimPath,
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        await assertConfinedPrivateMetadataDir(
          tempRoot,
          claimsDir,
          "Session claim directory",
        );
        await assertConfinedPath(
          claimsDir,
          claimPath,
          "Session ownership claim",
        );
        const st = await lstat(claimPath);
        if (
          !st.isSymbolicLink() &&
          st.isFile() &&
          isCurrentProcessUid(st.uid)
        ) {
          await unlink(claimPath);
        }
      } catch {
        // Best-effort safe release; never follow symlinks or mutate unsafe paths.
      }
    },
  };
}

export async function checkRootLocalClaimAbsenceForRealRoot(
  realSessionRoot: string,
): Promise<"absent" | "busy" | "ineligible" | "unavailable"> {
  const claimPath = path.join(realSessionRoot, ROOT_SESSION_CLAIM_FILE);
  try {
    await lstat(claimPath);
    return "busy";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "absent";
    if (code === "ENOTDIR") return "ineligible";
    return "unavailable";
  }
}

export async function acquireRootLocalClaimForRealRoot(
  realSessionRoot: string,
  purpose: SessionClaimPurpose,
): Promise<
  | AcquiredSessionClaim
  | { readonly status: "busy" | "unavailable" | "ineligible" }
> {
  const claimPath = path.join(realSessionRoot, ROOT_SESSION_CLAIM_FILE);
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(claimPath, flags, 0o600);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ELOOP" || code === "EISDIR") {
      return { status: "busy" };
    }
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { status: "ineligible" };
    }
    if (purpose === "create") {
      throw error;
    }
    return { status: "unavailable" };
  }

  let openedStat;
  try {
    openedStat = await handle.stat();
    const metadata = JSON.stringify({
      version: 1,
      pid: process.pid,
      purpose,
      acquiredAt: new Date().toISOString(),
    });
    await handle.writeFile(`${metadata}\n`, "utf8");
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    try {
      const st = await lstat(claimPath);
      if (
        !st.isSymbolicLink() &&
        st.isFile() &&
        (openedStat === undefined ||
          (st.dev === openedStat.dev && st.ino === openedStat.ino))
      ) {
        await unlink(claimPath);
      }
    } catch {
      // Best-effort safe cleanup; never follow symlinks.
    }
    if (purpose === "create") {
      throw error;
    }
    return { status: "unavailable" };
  }

  let released = false;
  return {
    status: "acquired",
    claimPath,
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        const st = await lstat(claimPath);
        if (
          !st.isSymbolicLink() &&
          st.isFile() &&
          st.dev === openedStat.dev &&
          st.ino === openedStat.ino
        ) {
          await unlink(claimPath);
        }
      } catch {
        // Best-effort safe release; ENOENT after quarantine/removal is normal.
      }
    },
  };
}

/**
 * Read-only check for an existing external claim under `tempRoot` for
 * `realSessionRoot`: never initializes `claimsDir`, never creates or deletes
 * claim files, and conservatively treats existing or unsafe claim metadata as
 * busy.
 */
export async function hasExistingExternalSessionClaimForRealRoot(
  realSessionRoot: string,
  tempRoot: string,
): Promise<boolean> {
  const claimsDir = sessionClaimDir(tempRoot);
  try {
    await lstat(claimsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    return true;
  }

  try {
    await assertConfinedPrivateMetadataDir(
      tempRoot,
      claimsDir,
      "Session claim directory",
    );
  } catch {
    return true;
  }

  const claimPath = path.join(
    claimsDir,
    `${sessionClaimKey(realSessionRoot)}.claim`,
  );
  try {
    await assertConfinedPath(claimsDir, claimPath, "Session ownership claim");
  } catch {
    return true;
  }

  try {
    await lstat(claimPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    return true;
  }
}

/**
 * Acquire a nonblocking, exclusive root-local claim for `CampaignStore`
 * append transactions on any confined `sessionRoot` (including standalone
 * isolated roots outside `tmpdir()`), while also respecting any active
 * external `SummonSession` claim when `sessionRoot` is a disposable session
 * root. Never creates external `claimsDir` and never breaks stale claims.
 */
export async function acquireCampaignStoreClaimForRoot(
  sessionRoot: string,
): Promise<
  | AcquiredSessionClaim
  | { readonly status: "busy" | "unavailable" | "ineligible" }
> {
  const rootResolved = path.resolve(sessionRoot);
  let rootStat;
  try {
    rootStat = await lstat(rootResolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { status: "ineligible" };
    }
    return { status: "unavailable" };
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return { status: "ineligible" };
  }

  let realSessionRoot: string;
  try {
    realSessionRoot = await realpath(rootResolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { status: "ineligible" };
    }
    return { status: "unavailable" };
  }

  const rootClaim = await acquireRootLocalClaimForRealRoot(
    realSessionRoot,
    "campaign",
  );
  if (rootClaim.status !== "acquired") {
    return rootClaim;
  }

  if (path.basename(realSessionRoot).startsWith("skill-summon-session-")) {
    const externalBusy = await hasExistingExternalSessionClaimForRealRoot(
      realSessionRoot,
      path.dirname(realSessionRoot),
    );
    if (externalBusy) {
      await rootClaim.release();
      return { status: "busy" };
    }
  }

  return rootClaim;
}

/**
 * Read-only check used by GC dry-run: never initializes `claimsDir`, never
 * creates or deletes claim files, and conservatively treats existing or unsafe
 * claim metadata as blocking deletion.
 */
export async function hasExistingSessionClaimForRealRoot(
  realSessionRoot: string,
  tempRoot: string,
): Promise<boolean> {
  const rootClaimPath = path.join(realSessionRoot, ROOT_SESSION_CLAIM_FILE);
  try {
    await lstat(rootClaimPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return true;
    }
  }

  return hasExistingExternalSessionClaimForRealRoot(realSessionRoot, tempRoot);
}

function isSymlinkOrUnsafeClaimPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("traverses a symlink") ||
      error.message.includes("traverses a non-directory") ||
      error.message.includes("resolves outside"))
  );
}
