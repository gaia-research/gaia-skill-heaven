import { createHash } from "node:crypto";
import { vi } from "vitest";

const fsSpyState = vi.hoisted(() => {
  type OpRecord = { op: string; args: string[] };
  return {
    recording: false,
    ops: [] as OpRecord[],
    reset() {
      this.ops.length = 0;
    },
    counts(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const entry of this.ops) {
        out[entry.op] = (out[entry.op] ?? 0) + 1;
      }
      return out;
    },
  };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  const wrap = <T extends (...args: never[]) => unknown>(name: string, fn: T): T =>
    vi.fn((...args: Parameters<T>) => {
      if (fsSpyState.recording) {
        fsSpyState.ops.push({
          op: name,
          args: (args as unknown[])
            .filter((arg): arg is string => typeof arg === "string")
            .slice(0, 2),
        });
      }
      return fn(...args);
    }) as unknown as T;

  return {
    ...actual,
    lstat: wrap("lstat", actual.lstat),
    mkdir: wrap("mkdir", actual.mkdir),
    mkdtemp: wrap("mkdtemp", actual.mkdtemp),
    open: wrap("open", actual.open),
    readFile: wrap("readFile", actual.readFile),
    readdir: wrap("readdir", actual.readdir),
    realpath: wrap("realpath", actual.realpath),
    rename: wrap("rename", actual.rename),
    rm: wrap("rm", actual.rm),
    stat: wrap("stat", actual.stat),
    writeFile: wrap("writeFile", actual.writeFile),
  };
});

import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import {
  listSessions,
  reapSessions,
  resolveSession,
} from "../src/summon/session.js";

const DEAD_PID = 99_999_999;
const FOREIGN_COUNT = 1000;
const INDEX_DIR_PREFIX = "skill-summon-index-v1";

const hostTmpdir = tmpdir();
const cleanupRoots: string[] = [];
const closeCallbacks: Array<() => Promise<void>> = [];

const savedEnv = {
  CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID,
  SKILL_SUMMON_SESSION: process.env.SKILL_SUMMON_SESSION,
  TMPDIR: process.env.TMPDIR,
  TMP: process.env.TMP,
  TEMP: process.env.TEMP,
};

beforeEach(() => {
  fsSpyState.recording = false;
  fsSpyState.reset();
  delete process.env.CLAUDE_CODE_SESSION_ID;
  delete process.env.SKILL_SUMMON_SESSION;
});

afterEach(async () => {
  fsSpyState.recording = false;
  fsSpyState.reset();

  await Promise.all(
    closeCallbacks.splice(0).map(async (close) => {
      try {
        await close();
      } catch {
        // Ensure every client/server and temp cleanup still runs.
      }
    }),
  );

  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(hostTmpdir, "skill-summon-lookup-test-"));
  cleanupRoots.push(root);
  return root;
}

function expectedIndexDirName(): string {
  const uid = process.getuid?.();
  return uid === undefined ? INDEX_DIR_PREFIX : `${INDEX_DIR_PREFIX}-${uid}`;
}

function expectedIndexKey(harnessSessionId: string): string {
  return createHash("sha256")
    .update("skill-summon-harness-session-v1\0")
    .update(harnessSessionId, "utf8")
    .digest("hex");
}

async function seedForeignRoots(
  tempRoot: string,
  count: number,
  options: { includeIndexedEntries: boolean },
): Promise<Set<string>> {
  const foreignNames = new Set<string>();
  const indexDir = path.join(tempRoot, expectedIndexDirName());
  if (options.includeIndexedEntries) {
    await mkdir(indexDir, { mode: 0o700, recursive: true });
  }

  const batchSize = 100;
  for (let start = 0; start < count; start += batchSize) {
    const tasks: Promise<void>[] = [];
    const end = Math.min(count, start + batchSize);
    for (let i = start; i < end; i++) {
      const dirName = `skill-summon-session-foreign-${String(i).padStart(4, "0")}`;
      foreignNames.add(dirName);
      const foreignRoot = path.join(tempRoot, dirName);
      const foreignId = `foreign-harness-id-${i}`;
      tasks.push(
        (async () => {
          await mkdir(foreignRoot);
          await writeFile(
            path.join(foreignRoot, "session.json"),
            JSON.stringify({
              id: `foreign-${i}`,
              harnessSessionId: foreignId,
              createdAt: "2026-04-01T00:00:00.000Z",
              pid: i % 2 === 0 ? DEAD_PID : process.pid,
              skills: [],
            }),
            "utf8",
          );
          if (options.includeIndexedEntries && i % 2 === 0) {
            const key = expectedIndexKey(foreignId);
            await writeFile(
              path.join(indexDir, `${key}.json`),
              JSON.stringify({ version: 1, roots: [foreignRoot] }),
              "utf8",
            );
          }
        })(),
      );
    }
    await Promise.all(tasks);
  }
  return foreignNames;
}

async function markDeadPid(sessionRoot: string): Promise<void> {
  const manifestPath = path.join(sessionRoot, "session.json");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Record<string, unknown>;
  manifest.pid = DEAD_PID;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

function assertZeroEnumerationAndZeroForeignInspection(
  ops: ReadonlyArray<{ op: string; args: string[] }>,
  foreignNames: ReadonlySet<string>,
): void {
  const readdirOps = ops.filter((entry) => entry.op === "readdir");
  expect(readdirOps).toEqual([]);

  const foreignTouches = ops.filter((entry) =>
    entry.args.some((arg) => {
      for (const name of foreignNames) {
        if (arg.includes(name)) return true;
      }
      return false;
    }),
  );
  expect(foreignTouches).toEqual([]);
}

async function recordFsOps<T>(fn: () => Promise<T>): Promise<{
  result: T;
  ops: Array<{ op: string; args: string[] }>;
  counts: Record<string, number>;
}> {
  fsSpyState.reset();
  fsSpyState.recording = true;
  try {
    const result = await fn();
    return {
      result,
      ops: [...fsSpyState.ops],
      counts: fsSpyState.counts(),
    };
  } finally {
    fsSpyState.recording = false;
  }
}

const emptyRegistryDocs: GaiaRegistryDocuments = {
  generic: { generatedAt: "2026-07-16T00:00:00Z", skills: [] },
  named: { generatedAt: "2026-07-16", buckets: {} },
};

describe("O(1) harness-session lookup and startup scaling", () => {
  it("keeps miss lookup work identical and free of directory scans across 0 vs 1000 foreign roots", async () => {
    // 1. Cold namespace (no indexDir) vs 1000 legacy unindexed foreign roots
    const emptyCold = await makeTempRoot();
    const crowdedLegacy = await makeTempRoot();
    const legacyForeign = await seedForeignRoots(crowdedLegacy, FOREIGN_COUNT, {
      includeIndexedEntries: false,
    });

    const emptyColdRun = await recordFsOps(() =>
      resolveSession({ tempRoot: emptyCold, harnessSessionId: "miss-cold-id" }),
    );
    const crowdedLegacyRun = await recordFsOps(() =>
      resolveSession({ tempRoot: crowdedLegacy, harnessSessionId: "miss-cold-id" }),
    );

    expect(emptyColdRun.result.created).toBe(true);
    expect(crowdedLegacyRun.result.created).toBe(true);
    assertZeroEnumerationAndZeroForeignInspection(crowdedLegacyRun.ops, legacyForeign);
    expect(crowdedLegacyRun.counts).toEqual(emptyColdRun.counts);
    expect(crowdedLegacyRun.ops.length).toBeLessThanOrEqual(30);

    // 2. Warm-index namespace (indexDir already exists) vs 1000 mixed foreign roots
    const emptyWarm = await makeTempRoot();
    await mkdir(path.join(emptyWarm, expectedIndexDirName()), { mode: 0o700 });
    const crowdedMixed = await makeTempRoot();
    const mixedForeign = await seedForeignRoots(crowdedMixed, FOREIGN_COUNT, {
      includeIndexedEntries: true,
    });

    const emptyWarmRun = await recordFsOps(() =>
      resolveSession({ tempRoot: emptyWarm, harnessSessionId: "miss-warm-id" }),
    );
    const crowdedMixedRun = await recordFsOps(() =>
      resolveSession({ tempRoot: crowdedMixed, harnessSessionId: "miss-warm-id" }),
    );

    expect(emptyWarmRun.result.created).toBe(true);
    expect(crowdedMixedRun.result.created).toBe(true);
    assertZeroEnumerationAndZeroForeignInspection(crowdedMixedRun.ops, mixedForeign);
    expect(crowdedMixedRun.counts).toEqual(emptyWarmRun.counts);
    expect(crowdedMixedRun.ops.length).toBeLessThanOrEqual(30);
  });

  it("keeps dead-pid hit reattach work identical and free of directory scans across 0 vs 1000 foreign roots", async () => {
    const emptyRoot = await makeTempRoot();
    const crowdedRoot = await makeTempRoot();
    const foreignNames = await seedForeignRoots(crowdedRoot, FOREIGN_COUNT, {
      includeIndexedEntries: true,
    });

    const emptySeed = await resolveSession({
      tempRoot: emptyRoot,
      harnessSessionId: "hit-session-id",
    });
    await markDeadPid(emptySeed.session.root);

    const crowdedSeed = await resolveSession({
      tempRoot: crowdedRoot,
      harnessSessionId: "hit-session-id",
    });
    await markDeadPid(crowdedSeed.session.root);

    const emptyHit = await recordFsOps(() =>
      resolveSession({ tempRoot: emptyRoot, harnessSessionId: "hit-session-id" }),
    );
    const crowdedHit = await recordFsOps(() =>
      resolveSession({ tempRoot: crowdedRoot, harnessSessionId: "hit-session-id" }),
    );

    expect(emptyHit.result.created).toBe(false);
    expect(emptyHit.result.session.root).toBe(emptySeed.session.root);
    expect(crowdedHit.result.created).toBe(false);
    expect(crowdedHit.result.session.root).toBe(crowdedSeed.session.root);
    expect(crowdedHit.result.session.pid).toBe(process.pid);

    assertZeroEnumerationAndZeroForeignInspection(crowdedHit.ops, foreignNames);
    expect(crowdedHit.counts).toEqual(emptyHit.counts);
    expect(crowdedHit.ops.length).toBeLessThanOrEqual(80);
  });

  it("performs O(1) lookup on actual MCP server first-call getSession() startup with 1000 foreign roots", async () => {
    const baselineRoot = await makeTempRoot();
    await mkdir(path.join(baselineRoot, expectedIndexDirName()), { mode: 0o700 });

    const crowdedRoot = await makeTempRoot();
    const foreignNames = await seedForeignRoots(crowdedRoot, FOREIGN_COUNT, {
      includeIndexedEntries: true,
    });

    // Seed a dead-PID target in both namespaces so MCP first-call exercises real reattach.
    const baselineTarget = await resolveSession({
      tempRoot: baselineRoot,
      harnessSessionId: "mcp-startup-reattach",
    });
    await markDeadPid(baselineTarget.session.root);

    const crowdedTarget = await resolveSession({
      tempRoot: crowdedRoot,
      harnessSessionId: "mcp-startup-reattach",
    });
    await markDeadPid(crowdedTarget.session.root);

    async function runMcpFirstCall(isolatedTmp: string) {
      process.env.TMPDIR = isolatedTmp;
      process.env.TMP = isolatedTmp;
      process.env.TEMP = isolatedTmp;
      process.env.CLAUDE_CODE_SESSION_ID = "mcp-startup-reattach";
      delete process.env.SKILL_SUMMON_SESSION;

      const service = new GaiaService(
        new InMemoryGaiaRegistrySource(emptyRegistryDocs),
        { now: () => new Date("2026-07-16T12:00:00Z") },
      );
      const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
      const client = new Client({ name: "lookup-mcp-test", version: "1.0.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      closeCallbacks.push(async () => {
        await client.close();
        await server.close();
      });

      return recordFsOps(async () => {
        await Promise.all([
          server.connect(serverTransport),
          client.connect(clientTransport),
        ]);
        // Server connect + capability listing must not resolve or scan sessions.
        await client.listTools();
        // First resources/read triggers MCP's getSession() -> resolveSession() hot path.
        await expect(
          client.readResource({ uri: "skill://example/missing/SKILL.md" }),
        ).rejects.toThrow(/No skill resource is served/u);
        // Second call uses cached sessionPromise with zero extra session lookup.
        await expect(
          client.readResource({ uri: "skill://example/missing/SKILL.md" }),
        ).rejects.toThrow(/No skill resource is served/u);
        await client.close();
        await server.close();
      });
    }

    const baselineMcp = await runMcpFirstCall(baselineRoot);
    const crowdedMcp = await runMcpFirstCall(crowdedRoot);

    assertZeroEnumerationAndZeroForeignInspection(crowdedMcp.ops, foreignNames);
    expect(crowdedMcp.counts).toEqual(baselineMcp.counts);
    expect(crowdedMcp.ops.length).toBeLessThanOrEqual(80);

    // Confirm MCP getSession() genuinely reattached to the dead-PID target root.
    const manifestAfter = JSON.parse(
      await readFile(path.join(crowdedTarget.session.root, "session.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifestAfter.pid).toBe(process.pid);
  });

  it("hashes harness session IDs in index paths, stays inside tempRoot, and hides index from list/reap", async () => {
    const tempRoot = await makeTempRoot();
    const rawId = "secret/../traversal/session:id@42";
    const resolved = await resolveSession({
      tempRoot,
      harnessSessionId: rawId,
    });

    const entriesInTemp = await readdir(tempRoot);
    const indexDirName = expectedIndexDirName();
    expect(entriesInTemp).toContain(indexDirName);
    expect(entriesInTemp.some((name) => name.includes("secret"))).toBe(false);
    expect(entriesInTemp.some((name) => name.includes("traversal"))).toBe(false);

    const indexDir = path.join(tempRoot, indexDirName);
    const indexFiles = await readdir(indexDir);
    expect(indexFiles).toEqual([`${expectedIndexKey(rawId)}.json`]);
    expect(indexFiles[0]).toMatch(/^[0-9a-f]{64}\.json$/u);
    expect(indexDirName.startsWith("skill-summon-session-")).toBe(false);

    // listSessions and reapSessions must scan only session roots, never treat indexDir as a session.
    const listed = await listSessions({ tempRoot });
    expect(listed.map((item) => item.root)).toEqual([resolved.session.root]);

    const dryReap = await reapSessions({
      tempRoot,
      ttlHours: 0,
      dryRun: true,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(dryReap.scanned).toBe(1);
    expect(dryReap.liveProtected).toEqual([resolved.session.root]);
    await expect(access(indexDir)).resolves.toBeUndefined();
  });

  it("never falls back to scanning on legacy unindexed, symlinked, malformed, forged, or mismatched index cases", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();

    // 1. Legacy unindexed root on disk with matching ID & dead PID -> ignored (zero readdir), fresh root created
    const legacyRoot = path.join(tempRoot, "skill-summon-session-legacy-unindexed");
    await mkdir(legacyRoot);
    await writeFile(
      path.join(legacyRoot, "session.json"),
      JSON.stringify({
        id: "legacy-1",
        harnessSessionId: "legacy-only-id",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_PID,
        skills: [],
      }),
      "utf8",
    );
    const legacyLookup = await recordFsOps(() =>
      resolveSession({ tempRoot, harnessSessionId: "legacy-only-id" }),
    );
    expect(legacyLookup.result.created).toBe(true);
    expect(legacyLookup.result.session.root).not.toBe(legacyRoot);
    expect(legacyLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);

    // 2. Malformed JSON in index entry -> ignored conservatively, zero readdir, fresh root created
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    const malformedId = "malformed-index-id";
    await writeFile(
      path.join(indexDir, `${expectedIndexKey(malformedId)}.json`),
      "{not-valid-json",
      "utf8",
    );
    const malformedLookup = await recordFsOps(() =>
      resolveSession({ tempRoot, harnessSessionId: malformedId }),
    );
    expect(malformedLookup.result.created).toBe(true);
    expect(malformedLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);

    // 3. Index entry pointing to forged outside dir, relative path, and wrong-ID dead root -> all refused, zero readdir
    const wrongIdRoot = path.join(tempRoot, "skill-summon-session-wrong-id");
    await mkdir(wrongIdRoot);
    await writeFile(
      path.join(wrongIdRoot, "session.json"),
      JSON.stringify({
        id: "wrong-id",
        harnessSessionId: "some-other-id",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_PID,
        skills: [],
      }),
      "utf8",
    );
    await writeFile(
      path.join(outsideDir, "session.json"),
      JSON.stringify({
        id: "outside-forged",
        harnessSessionId: "forged-index-id",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_PID,
        skills: [],
      }),
      "utf8",
    );
    await writeFile(
      path.join(indexDir, `${expectedIndexKey("forged-index-id")}.json`),
      JSON.stringify({
        version: 1,
        roots: [outsideDir, "skill-summon-session-relative", wrongIdRoot],
      }),
      "utf8",
    );
    const forgedLookup = await recordFsOps(() =>
      resolveSession({ tempRoot, harnessSessionId: "forged-index-id" }),
    );
    expect(forgedLookup.result.created).toBe(true);
    expect(forgedLookup.result.session.root).not.toBe(outsideDir);
    expect(forgedLookup.result.session.root).not.toBe(wrongIdRoot);
    expect(forgedLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);
    await expect(access(path.join(outsideDir, "cache"))).rejects.toThrow();

    // 4. Symlinked index entry file pointing outside -> never followed, never overwritten, zero readdir
    const symlinkTarget = path.join(outsideDir, "outside-index.json");
    const targetPayload = JSON.stringify({ version: 1, roots: [legacyRoot] });
    await writeFile(symlinkTarget, targetPayload, "utf8");
    const symId = "symlink-entry-id";
    await symlink(
      symlinkTarget,
      path.join(indexDir, `${expectedIndexKey(symId)}.json`),
      "file",
    );
    const symEntryLookup = await recordFsOps(() =>
      resolveSession({ tempRoot, harnessSessionId: symId }),
    );
    expect(symEntryLookup.result.created).toBe(true);
    expect(symEntryLookup.result.session.root).not.toBe(legacyRoot);
    expect(symEntryLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);
    expect(await readFile(symlinkTarget, "utf8")).toBe(targetPayload);

    // 5. Symlinked indexDir itself -> never followed, never written through, zero readdir
    const symTempRoot = await makeTempRoot();
    const symIndexTarget = await makeTempRoot();
    await symlink(
      symIndexTarget,
      path.join(symTempRoot, expectedIndexDirName()),
      "dir",
    );
    const symDirLookup = await recordFsOps(() =>
      resolveSession({ tempRoot: symTempRoot, harnessSessionId: "sym-dir-id" }),
    );
    expect(symDirLookup.result.created).toBe(true);
    expect(path.dirname(symDirLookup.result.session.root)).toBe(symTempRoot);
    expect(symDirLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);
    expect(await readdir(symIndexTarget)).toEqual([]);

    // 6. Oversized index file (> 64 KiB) -> ignored conservatively, zero readdir, fresh root created
    const oversizedId = "oversized-index-id";
    await writeFile(
      path.join(indexDir, `${expectedIndexKey(oversizedId)}.json`),
      JSON.stringify({ version: 1, roots: Array.from({ length: 2000 }, (_, i) => path.join(tempRoot, `skill-summon-session-pad-${i}`)) }),
      "utf8",
    );
    const oversizedLookup = await recordFsOps(() =>
      resolveSession({ tempRoot, harnessSessionId: oversizedId }),
    );
    expect(oversizedLookup.result.created).toBe(true);
    expect(oversizedLookup.ops.filter((op) => op.op === "readdir")).toEqual([]);
    expect(oversizedLookup.ops.filter((op) => op.op === "open")).toHaveLength(0);
  });

  it("handles concurrent starts, close(), and reapSessions() index pruning safely", async () => {
    const tempRoot = await makeTempRoot();
    const sharedId = "concurrent-shared-id";

    // Concurrent resolveSession starts produce distinct roots and preserve both in the index.
    const [first, second] = await Promise.all([
      resolveSession({ tempRoot, harnessSessionId: sharedId }),
      resolveSession({ tempRoot, harnessSessionId: sharedId }),
    ]);
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.session.root).not.toBe(second.session.root);

    const indexPath = path.join(
      tempRoot,
      expectedIndexDirName(),
      `${expectedIndexKey(sharedId)}.json`,
    );
    const afterConcurrent = JSON.parse(await readFile(indexPath, "utf8")) as {
      version: number;
      roots: string[];
    };
    expect(afterConcurrent.version).toBe(1);
    expect(new Set(afterConcurrent.roots)).toEqual(
      new Set([first.session.root, second.session.root]),
    );

    // Closing one root prunes only that root from the index; second remains indexed.
    await first.session.close();
    const afterClose = JSON.parse(await readFile(indexPath, "utf8")) as {
      roots: string[];
    };
    expect(afterClose.roots).toEqual([second.session.root]);

    // Marking the second dead and reaping it prunes the last entry and deletes the empty index file.
    await markDeadPid(second.session.root);
    const reapOutcome = await reapSessions({
      tempRoot,
      ttlHours: 0,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(reapOutcome.candidates.map((c) => c.root)).toEqual([second.session.root]);
    await expect(access(indexPath)).rejects.toThrow();
  });
});
