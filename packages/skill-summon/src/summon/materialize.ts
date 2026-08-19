import { createHash } from "node:crypto";
import { cp, readFile, readdir } from "node:fs/promises";
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
 */
export async function materializeSkillDir(
  sourceDir: string,
  destDir: string,
): Promise<MaterializeOutcome> {
  const startedAt = startTiming();
  await cp(sourceDir, destDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== ".git",
  });
  const materializeSeconds = elapsedSeconds(startedAt);
  const skillContent = await readFile(path.join(destDir, "SKILL.md"));
  const sha256 = createHash("sha256").update(skillContent).digest("hex");
  const fileCount = await countFiles(destDir);
  return { path: destDir, materializeSeconds, fileCount, sha256 };
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
