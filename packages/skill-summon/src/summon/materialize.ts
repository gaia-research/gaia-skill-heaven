import { createHash } from "node:crypto";
import { cp, lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { elapsedSeconds, startTiming } from "./timing.js";

export type MaterializeOutcome = {
  path: string;
  materializeSeconds: number;
  fileCount: number;
  sha256: string;
};

/**
 * Copy the validated skill directory (sourceDir) into the session root at
 * destDir. A recursive copy, not a symlink: the session root is disposable
 * and must not leave dangling links once it is removed.
 *
 * `.git` directories are excluded — relevant only when a skill's subpath is
 * the repo root itself, in which case the source directory IS the cloned
 * repo and would otherwise drag its whole git history into the copy.
 *
 * Symlinks are rejected, not copied. A skill is fetched from an untrusted
 * remote; if its tree contained a symlink (e.g. a `SKILL.md` pointing at
 * `/etc/passwd` or `../../secret`) `cp` would faithfully reproduce the link
 * inside the session, and the card returned to the agent would instruct it to
 * read a path outside the summoned payload. Copying with dereference disabled
 * and refusing any symlink keeps the materialized skill confined to its own
 * contents.
 */
export async function materializeSkillDir(
  sourceDir: string,
  destDir: string,
): Promise<MaterializeOutcome> {
  const startedAt = startTiming();
  await cp(sourceDir, destDir, {
    recursive: true,
    dereference: false,
    filter: (source) => {
      if (path.basename(source) === ".git") return false;
      return true;
    },
  });
  await rejectSymlinks(destDir);
  const materializeSeconds = elapsedSeconds(startedAt);
  const skillContent = await readFile(path.join(destDir, "SKILL.md"));
  const sha256 = createHash("sha256").update(skillContent).digest("hex");
  const fileCount = await countFiles(destDir);
  return { path: destDir, materializeSeconds, fileCount, sha256 };
}

/**
 * Walk the materialized tree and refuse if any entry is a symlink. `cp` with
 * `dereference: false` copies links verbatim rather than following them, so the
 * only way a symlink lands here is a malicious skill payload — reject the whole
 * materialization so a link can never redirect a later `readFile` outside it.
 */
async function rejectSymlinks(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `refusing to materialize skill: '${full}' is a symlink, which could redirect reads outside the summoned payload.`,
      );
    }
    if (entry.isDirectory()) await rejectSymlinks(full);
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countFiles(full);
    else count += 1;
  }
  return count;
}
