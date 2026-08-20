import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { ensureCachedRepo, resolveRemoteCommit } from "../src/summon/clone.js";

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("commit-pinned fleet materialization", () => {
  it("accepts an exact SHA without resolving a moving ref and checks out that commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-summon-clone-test-"));
    roots.push(root);
    const origin = path.join(root, "origin");
    await mkdir(path.join(origin, "skills", "fixture"), { recursive: true });
    await git(origin, "init");
    await git(origin, "config", "user.email", "fixture@example.test");
    await git(origin, "config", "user.name", "Fixture");
    await writeFile(path.join(origin, "skills", "fixture", "SKILL.md"), "# version one\n");
    await git(origin, "add", ".");
    await git(origin, "commit", "-m", "one");
    const first = (await git(origin, "rev-parse", "HEAD")).trim();
    await writeFile(path.join(origin, "skills", "fixture", "SKILL.md"), "# version two\n");
    await git(origin, "commit", "-am", "two");

    expect(await resolveRemoteCommit(origin, first)).toBe(first);
    const checkout = await ensureCachedRepo(path.join(root, "checkout"), origin, first);
    expect(checkout.commit).toBe(first);
    expect(
      await readFile(path.join(checkout.path, "skills", "fixture", "SKILL.md"), "utf8"),
    ).toBe("# version one\n");
  });

  it("reuses an existing commit-pinned cache as warm instead of falling back to a re-clone", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-summon-clone-test-"));
    roots.push(root);
    const origin = path.join(root, "origin");
    await mkdir(path.join(origin, "skills", "fixture"), { recursive: true });
    await git(origin, "init");
    await git(origin, "config", "user.email", "fixture@example.test");
    await git(origin, "config", "user.name", "Fixture");
    await writeFile(path.join(origin, "skills", "fixture", "SKILL.md"), "# version one\n");
    await git(origin, "add", ".");
    await git(origin, "commit", "-m", "one");
    const commit = (await git(origin, "rev-parse", "HEAD")).trim();

    const cacheDir = path.join(root, "checkout");
    const first = await ensureCachedRepo(cacheDir, origin, commit);
    expect(first.warm).toBe(false);

    // A second skill materialized from the same pinned fleet commit must reuse
    // the cache (detached HEAD, no upstream) rather than `git pull` failing
    // and forcing a full rmtree + re-clone.
    const second = await ensureCachedRepo(cacheDir, origin, commit);
    expect(second.warm).toBe(true);
    expect(second.commit).toBe(commit);
  });
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout;
}
