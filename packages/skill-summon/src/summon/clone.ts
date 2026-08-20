import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { elapsedSeconds, startTiming } from "./timing.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 60_000;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export type CloneOutcome = {
  path: string;
  cloneSeconds: number;
  /** false = freshly cloned ("cold"), true = existing cache reused via pull ("warm"). */
  warm: boolean;
  commit: string;
};

/** Remove transient clone scaffolding after its payload has been extracted. */
export async function discardCachedRepo(cacheDir: string): Promise<void> {
  await rm(cacheDir, { recursive: true, force: true });
}

/**
 * Ensure repoUrl@branch is checked out at cacheDir, mirroring install.py's
 * `_install_single` caching step: clone if absent, `git pull` if a valid
 * cache exists, and repair (rmtree + re-clone) a partial cache or a failed
 * pull rather than trusting it as-is.
 */
export async function ensureCachedRepo(
  cacheDir: string,
  repoUrl: string,
  branch: string | null,
): Promise<CloneOutcome> {
  const startedAt = startTiming();

  const exists = await pathExists(cacheDir);
  const validRepo = exists && (await pathExists(path.join(cacheDir, ".git")));
  if (exists && !validRepo) {
    await rm(cacheDir, { recursive: true, force: true });
  }

  let warm: boolean;
  if (!(await pathExists(cacheDir))) {
    await cloneRepo(repoUrl, branch, cacheDir);
    warm = false;
  } else {
    try {
      await runGit(["pull"], cacheDir);
      warm = true;
    } catch {
      await rm(cacheDir, { recursive: true, force: true });
      await cloneRepo(repoUrl, branch, cacheDir);
      warm = false;
    }
  }

  const commit = await gitOutput(["rev-parse", "HEAD"], cacheDir);
  return {
    path: cacheDir,
    cloneSeconds: elapsedSeconds(startedAt),
    warm,
    commit,
  };
}

/** Resolve the remote commit so cache lookup cannot silently use a stale branch payload. */
export async function resolveRemoteCommit(
  repoUrl: string,
  branch: string | null,
): Promise<string> {
  if (branch && COMMIT_SHA.test(branch)) return branch.toLowerCase();
  const refs = branch
    ? [`refs/heads/${branch}`, `refs/tags/${branch}^{}`, `refs/tags/${branch}`]
    : ["HEAD"];
  const output = await gitOutput([
    "ls-remote",
    "--exit-code",
    repoUrl,
    ...refs,
  ]);
  const lines = output.split("\n").filter(Boolean);
  const preferred = branch
    ? (lines.find((line) => line.endsWith(`refs/heads/${branch}`)) ??
      lines.find((line) => line.endsWith(`refs/tags/${branch}^{}`)) ??
      lines[0])
    : lines[0];
  const commit = preferred?.split(/\s+/u)[0];
  if (!commit)
    throw new Error(`git ls-remote returned no commit for ${repoUrl}`);
  return commit;
}

async function cloneRepo(
  repoUrl: string,
  branch: string | null,
  dest: string,
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  if (branch && COMMIT_SHA.test(branch)) {
    await mkdir(dest, { recursive: true });
    await runGit(["init"], dest);
    await runGit(["remote", "add", "origin", repoUrl], dest);
    await runGit(["fetch", "--depth", "1", "origin", branch], dest);
    await runGit(["checkout", "--detach", "FETCH_HEAD"], dest);
    return;
  }
  const args = ["clone", "--single-branch", "--depth", "1"];
  if (branch) args.push("-b", branch);
  args.push(repoUrl, dest);
  await runGit(args);
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  await gitOutput(args, cwd);
}

async function gitOutput(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed: ${errorMessage(error)}`);
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
