import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PayloadCache,
  type PayloadIdentity,
  payloadCacheRoot,
} from "../src/summon/payload-cache.js";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("payload retention cache", () => {
  it("uses a default root that the session reaper cannot mistake for a session", () => {
    const configured = process.env.SKILL_SUMMON_CACHE_DIR;
    delete process.env.SKILL_SUMMON_CACHE_DIR;
    try {
      // The session reaper (session.ts) only reaps entries whose name starts
      // with "skill-summon-session-". The payload cache root must not match
      // that prefix, or the reaper would eventually delete the whole cache.
      expect(path.basename(payloadCacheRoot())).not.toMatch(
        /^skill-summon-session-/u,
      );
    } finally {
      if (configured !== undefined)
        process.env.SKILL_SUMMON_CACHE_DIR = configured;
    }
  });

  it("keys payloads by resolved commit and subpath", async () => {
    const root = await temporaryRoot();
    const source = await payload(root, "source", "one");
    const cache = new PayloadCache({
      root: path.join(root, "cache"),
      maxBytes: 4096,
    });
    const identity = item("a".repeat(40), "skills/review");

    expect(await cache.store(identity, source)).toBe(true);
    const hit = await cache.lookup(identity);

    expect(hit).toBeDefined();
    await expect(access(path.join(hit!, "SKILL.md"))).resolves.toBeUndefined();
    expect(
      await cache.lookup(item("b".repeat(40), "skills/review")),
    ).toBeUndefined();
    expect(
      await cache.lookup(item("a".repeat(40), "skills/other")),
    ).toBeUndefined();
  });

  it("evicts least-recently-used payloads to remain under its size cap", async () => {
    const root = await temporaryRoot();
    const cache = new PayloadCache({
      root: path.join(root, "cache"),
      maxBytes: 900,
    });
    const first = item("a".repeat(40), "first");
    const second = item("b".repeat(40), "second");

    expect(
      await cache.store(first, await payload(root, "first", "x".repeat(350))),
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      await cache.store(second, await payload(root, "second", "y".repeat(350))),
    ).toBe(true);

    expect(await cache.lookup(first)).toBeUndefined();
    expect(await cache.lookup(second)).toBeDefined();
  });

  it("does not retain a payload larger than the total cap", async () => {
    const root = await temporaryRoot();
    const cache = new PayloadCache({
      root: path.join(root, "cache"),
      maxBytes: 10,
    });
    const identity = item("a".repeat(40), "large");

    expect(
      await cache.store(identity, await payload(root, "large", "too large")),
    ).toBe(false);
    expect(await cache.lookup(identity)).toBeUndefined();
  });
});

function item(commit: string, subpath: string): PayloadIdentity {
  return { repoUrl: "https://example.test/repo.git", commit, subpath };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-payload-cache-test-"));
  cleanupRoots.push(root);
  return root;
}

async function payload(
  root: string,
  name: string,
  content: string,
): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(directory);
  await writeFile(path.join(directory, "SKILL.md"), content);
  return directory;
}
