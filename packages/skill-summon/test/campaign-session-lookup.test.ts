import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { vi } from "vitest";

const fsSpyState = vi.hoisted(() => {
  type OpRecord = { op: string; args: string[] };
  return {
    recording: false,
    ops: [] as OpRecord[],
    onOp: undefined as
      | ((op: string, args: readonly unknown[]) => void)
      | undefined,
    onOpenResult: undefined as
      | ((args: readonly unknown[], handle: unknown) => unknown)
      | undefined,
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
      fsSpyState.onOp?.(name, args as readonly unknown[]);
      return fn(...args);
    }) as unknown as T;

  const wrapOpen = vi.fn(async (...args: Parameters<typeof actual.open>) => {
    if (fsSpyState.recording) {
      fsSpyState.ops.push({
        op: "open",
        args: (args as unknown[])
          .filter((arg): arg is string => typeof arg === "string")
          .slice(0, 2),
      });
    }
    fsSpyState.onOp?.("open", args as readonly unknown[]);
    const handle = await actual.open(...args);
    return fsSpyState.onOpenResult
      ? (fsSpyState.onOpenResult(args as readonly unknown[], handle) as typeof handle)
      : handle;
  });

  return {
    ...actual,
    lstat: wrap("lstat", actual.lstat),
    mkdir: wrap("mkdir", actual.mkdir),
    mkdtemp: wrap("mkdtemp", actual.mkdtemp),
    open: wrapOpen,
    readFile: wrap("readFile", actual.readFile),
    readdir: wrap("readdir", actual.readdir),
    realpath: wrap("realpath", actual.realpath),
    rename: wrap("rename", actual.rename),
    rm: wrap("rm", actual.rm),
    stat: wrap("stat", actual.stat),
    unlink: wrap("unlink", actual.unlink),
    writeFile: wrap("writeFile", actual.writeFile),
  };
});

import {
  access,
  chmod,
  lstat,
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
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  type CampaignRecon,
} from "skill-zero";

import { CampaignStore } from "../src/campaign/store.js";
import { resetArborIdentityCache } from "../src/data/arbor-identity-source.js";
import { resetArborPublicationCache } from "../src/data/arbor-source.js";
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
  SummonSession,
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
  fsSpyState.onOp = undefined;
  fsSpyState.onOpenResult = undefined;
  fsSpyState.reset();
  resetArborPublicationCache();
  resetArborIdentityCache();
  delete process.env.CLAUDE_CODE_SESSION_ID;
  delete process.env.SKILL_SUMMON_SESSION;
});

afterEach(async () => {
  fsSpyState.recording = false;
  fsSpyState.onOp = undefined;
  fsSpyState.onOpenResult = undefined;
  fsSpyState.reset();
  resetArborPublicationCache();
  resetArborIdentityCache();

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

const summonRegistryDocs: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "testing",
        name: "Testing",
        type: "basic",
        description: "Testing workflows.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "active",
      },
    ],
  },
  named: {
    generatedAt: "2026-07-16",
    buckets: {
      testing: [
        {
          id: "example/lookup-skill",
          name: "Lookup Skill",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Offline lookup scaling fixture skill.",
          catalogRef: "example-lookup-skill",
          tags: ["lookup"],
          links: {},
          evidence: [],
        },
      ],
    },
  },
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
    // Measured 85 ops with exclusive claim + post-claim revalidation + release.
    expect(crowdedHit.ops.length).toBeLessThanOrEqual(95);
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
    // Measured 85 ops with exclusive claim + post-claim revalidation + release.
    expect(crowdedMcp.ops.length).toBeLessThanOrEqual(95);

    // Confirm MCP getSession() genuinely reattached to the dead-PID target root.
    const manifestAfter = JSON.parse(
      await readFile(path.join(crowdedTarget.session.root, "session.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifestAfter.pid).toBe(process.pid);
  });

  it("performs O(1) bounded work on actual MCP client.callTool summon first call AND repeated cached calls across 0 vs 1000 foreign roots", async () => {
    const baselineRoot = await makeTempRoot();
    await mkdir(path.join(baselineRoot, expectedIndexDirName()), { mode: 0o700 });

    const crowdedRoot = await makeTempRoot();
    const foreignNames = await seedForeignRoots(crowdedRoot, FOREIGN_COUNT, {
      includeIndexedEntries: true,
    });

    const baselineTarget = await resolveSession({
      tempRoot: baselineRoot,
      harnessSessionId: "mcp-summon-reattach",
    });
    await markDeadPid(baselineTarget.session.root);

    const crowdedTarget = await resolveSession({
      tempRoot: crowdedRoot,
      harnessSessionId: "mcp-summon-reattach",
    });
    await markDeadPid(crowdedTarget.session.root);

    async function runMcpSummonSequence(
      isolatedTmp: string,
      harnessSessionId: string,
    ) {
      resetArborPublicationCache();
      resetArborIdentityCache();
      process.env.TMPDIR = isolatedTmp;
      process.env.TMP = isolatedTmp;
      process.env.TEMP = isolatedTmp;
      process.env.CLAUDE_CODE_SESSION_ID = harnessSessionId;
      delete process.env.SKILL_SUMMON_SESSION;

      const service = new GaiaService(
        new InMemoryGaiaRegistrySource(summonRegistryDocs),
        { now: () => new Date("2026-07-16T12:00:00Z") },
      );
      const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
      const client = new Client({
        name: `lookup-summon-${harnessSessionId}`,
        version: "1.0.0",
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      closeCallbacks.push(async () => {
        await client.close();
        await server.close();
      });

      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const firstCall = await recordFsOps(async () => {
        await client.listTools();
        return client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
      });

      const cachedCalls = await recordFsOps(async () => {
        const second = await client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
        const third = await client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", surface: "any" },
        });
        return { second, third };
      });

      await client.close();
      await server.close();

      return { firstCall, cachedCalls };
    }

    // 1. Dead-PID reattach via actual MCP client.callTool("summon")
    const baselineReattach = await runMcpSummonSequence(
      baselineRoot,
      "mcp-summon-reattach",
    );
    const crowdedReattach = await runMcpSummonSequence(
      crowdedRoot,
      "mcp-summon-reattach",
    );

    expect(baselineReattach.firstCall.result.isError).toBeFalsy();
    expect(crowdedReattach.firstCall.result.isError).toBeFalsy();
    const crowdedFirstRoot = (
      crowdedReattach.firstCall.result.structuredContent as { sessionRoot: string }
    ).sessionRoot;
    expect(crowdedFirstRoot).toBe(crowdedTarget.session.root);

    expect(crowdedReattach.cachedCalls.result.second.isError).toBeFalsy();
    expect(
      (
        crowdedReattach.cachedCalls.result.second.structuredContent as {
          sessionRoot: string;
        }
      ).sessionRoot,
    ).toBe(crowdedTarget.session.root);
    expect(crowdedReattach.cachedCalls.result.third.isError).toBeFalsy();
    expect(
      crowdedReattach.cachedCalls.result.third.structuredContent as {
        sessionRoot: string;
        summoned: unknown[];
        skipped: Array<{ id: string; reason: string }>;
      },
    ).toMatchObject({
      sessionRoot: crowdedTarget.session.root,
      summoned: [],
      skipped: [expect.objectContaining({ id: "example/lookup-skill" })],
    });

    assertZeroEnumerationAndZeroForeignInspection(
      crowdedReattach.firstCall.ops,
      foreignNames,
    );
    assertZeroEnumerationAndZeroForeignInspection(
      crowdedReattach.cachedCalls.ops,
      foreignNames,
    );
    expect(crowdedReattach.firstCall.counts).toEqual(
      baselineReattach.firstCall.counts,
    );
    expect(crowdedReattach.cachedCalls.counts).toEqual(
      baselineReattach.cachedCalls.counts,
    );
    expect(crowdedReattach.firstCall.ops.length).toBeLessThanOrEqual(160);
    expect(crowdedReattach.cachedCalls.ops.length).toBeLessThanOrEqual(50);
    expect(crowdedReattach.cachedCalls.ops.length).toBeLessThan(
      crowdedReattach.firstCall.ops.length,
    );

    const manifestAfter = JSON.parse(
      await readFile(path.join(crowdedTarget.session.root, "session.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifestAfter.pid).toBe(process.pid);

    // 2. Fresh miss via actual MCP client.callTool("summon")
    const baselineMiss = await runMcpSummonSequence(
      baselineRoot,
      "mcp-summon-miss",
    );
    const crowdedMiss = await runMcpSummonSequence(
      crowdedRoot,
      "mcp-summon-miss",
    );

    const missRoot = (
      crowdedMiss.firstCall.result.structuredContent as { sessionRoot: string }
    ).sessionRoot;
    expect(path.dirname(missRoot)).toBe(crowdedRoot);
    expect(
      (
        crowdedMiss.cachedCalls.result.second.structuredContent as {
          sessionRoot: string;
        }
      ).sessionRoot,
    ).toBe(missRoot);

    assertZeroEnumerationAndZeroForeignInspection(
      crowdedMiss.firstCall.ops,
      foreignNames,
    );
    assertZeroEnumerationAndZeroForeignInspection(
      crowdedMiss.cachedCalls.ops,
      foreignNames,
    );
    expect(crowdedMiss.firstCall.counts).toEqual(baselineMiss.firstCall.counts);
    expect(crowdedMiss.cachedCalls.counts).toEqual(
      baselineMiss.cachedCalls.counts,
    );
    expect(crowdedMiss.firstCall.ops.length).toBeLessThanOrEqual(120);
    expect(crowdedMiss.cachedCalls.ops.length).toBeLessThanOrEqual(50);
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

  it("leaves abandoned roots untouched during summon and respects live PID and paused charter retention on explicit manual reap", async () => {
    const tempRoot = await makeTempRoot();
    const oldCreatedAt = "2026-04-01T00:00:00.000Z";
    const tPause = new Date("2026-04-01T12:00:00.000Z");

    // 1. Expired abandoned dead-PID root (no campaign)
    const abandoned = await resolveSession({
      tempRoot,
      harnessSessionId: "manual-gc-abandoned",
    });
    const abandonedManifestPath = path.join(abandoned.session.root, "session.json");
    const abandonedManifest = JSON.parse(
      await readFile(abandonedManifestPath, "utf8"),
    ) as Record<string, unknown>;
    abandonedManifest.pid = DEAD_PID;
    abandonedManifest.createdAt = oldCreatedAt;
    await writeFile(
      abandonedManifestPath,
      JSON.stringify(abandonedManifest, null, 2),
      "utf8",
    );

    // 2. Old live-PID root (must be protected by live PID)
    const live = await resolveSession({
      tempRoot,
      harnessSessionId: "manual-gc-live",
    });
    const liveManifestPath = path.join(live.session.root, "session.json");
    const liveManifest = JSON.parse(
      await readFile(liveManifestPath, "utf8"),
    ) as Record<string, unknown>;
    liveManifest.createdAt = oldCreatedAt;
    await writeFile(
      liveManifestPath,
      JSON.stringify(liveManifest, null, 2),
      "utf8",
    );

    // 3. Old dead-PID root with an active paused campaign (48h charter retention)
    const paused = await resolveSession({
      tempRoot,
      harnessSessionId: "manual-gc-paused",
    });
    const opCap = createCampaignOperatorAdapter();
    const store = await CampaignStore.load(paused.session.root);
    const recon: CampaignRecon = {
      schema: CAMPAIGN_SCHEMA_IDS.recon,
      findings: ["Manual GC charter retention check"],
      citations: ["citation:manual-gc"],
    };
    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "recon", recon });
    await store.append({
      channel: "agent",
      op: "propose",
      charter: {
        schema: CAMPAIGN_SCHEMA_IDS.charter,
        revision: 1,
        goal: "Verify explicit manual reap preserves paused charter",
        allowedSkills: ["example/lookup-skill"],
        queue: [
          {
            id: "u1",
            skill: "example/lookup-skill",
            reconCitation: "citation:manual-gc",
          },
        ],
        recoverLimit: 1,
        reopenLimit: 1,
        sessionRetention: 48,
        clauses: ["verify-command", "termination"],
      },
    });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    const pausedManifestPath = path.join(paused.session.root, "session.json");
    const pausedManifest = JSON.parse(
      await readFile(pausedManifestPath, "utf8"),
    ) as Record<string, unknown>;
    pausedManifest.pid = DEAD_PID;
    pausedManifest.createdAt = oldCreatedAt;
    await writeFile(
      pausedManifestPath,
      JSON.stringify(pausedManifest, null, 2),
      "utf8",
    );

    // Running MCP summon on another session must NOT scan tempRoot or reap expired abandoned roots.
    process.env.TMPDIR = tempRoot;
    process.env.TMP = tempRoot;
    process.env.TEMP = tempRoot;
    process.env.CLAUDE_CODE_SESSION_ID = "manual-gc-caller";
    delete process.env.SKILL_SUMMON_SESSION;

    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(summonRegistryDocs),
      { now: () => new Date("2026-07-16T12:00:00Z") },
    );
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "manual-gc-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    closeCallbacks.push(async () => {
      await client.close();
      await server.close();
    });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const summonOps = await recordFsOps(async () => {
      await client.callTool({
        name: "summon",
        arguments: { query: "lookup skill", preview: true, surface: "any" },
      });
      await client.callTool({
        name: "summon",
        arguments: { query: "lookup skill", preview: true, surface: "any" },
      });
    });
    await client.close();
    await server.close();

    expect(summonOps.ops.filter((op) => op.op === "readdir")).toEqual([]);
    await expect(access(abandoned.session.root)).resolves.toBeUndefined();
    await expect(access(live.session.root)).resolves.toBeUndefined();
    await expect(access(paused.session.root)).resolves.toBeUndefined();

    // Explicit manual reap: reaps abandoned root and prunes its index entry,
    // protects live PID, and establishes pause boundary for paused charter.
    const firstReap = await reapSessions({ tempRoot, ttlHours: 4, now: tPause });
    expect(firstReap.candidates.map((c) => c.root)).toEqual([
      abandoned.session.root,
    ]);
    expect(firstReap.liveProtected).toContain(live.session.root);
    await expect(access(abandoned.session.root)).rejects.toThrow();
    await expect(
      access(
        path.join(
          tempRoot,
          expectedIndexDirName(),
          `${expectedIndexKey("manual-gc-abandoned")}.json`,
        ),
      ),
    ).rejects.toThrow();
    await expect(access(live.session.root)).resolves.toBeUndefined();
    await expect(access(paused.session.root)).resolves.toBeUndefined();

    // Inside 48h charter retention window: paused root stays protected.
    const beforeCharterEnd = new Date(tPause.getTime() + 47 * 3_600_000);
    const midReap = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: beforeCharterEnd,
    });
    expect(midReap.candidates).toEqual([]);
    await expect(access(paused.session.root)).resolves.toBeUndefined();

    // Once charter retention window expires: manual reap removes paused root and its index entry.
    const atCharterEnd = new Date(tPause.getTime() + 48 * 3_600_000);
    const finalReap = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: atCharterEnd,
    });
    expect(finalReap.candidates.map((c) => c.root)).toEqual([
      paused.session.root,
    ]);
    await expect(access(paused.session.root)).rejects.toThrow();
    await expect(
      access(
        path.join(
          tempRoot,
          expectedIndexDirName(),
          `${expectedIndexKey("manual-gc-paused")}.json`,
        ),
      ),
    ).rejects.toThrow();
    await expect(access(live.session.root)).resolves.toBeUndefined();
  });
});

describe("best-effort sidecar index failures and index directory privacy", () => {
  async function startOfflineMcpClient(
    isolatedTmp: string,
    harnessSessionId: string,
    clientName: string,
  ) {
    resetArborPublicationCache();
    resetArborIdentityCache();
    process.env.TMPDIR = isolatedTmp;
    process.env.TMP = isolatedTmp;
    process.env.TEMP = isolatedTmp;
    process.env.CLAUDE_CODE_SESSION_ID = harnessSessionId;
    delete process.env.SKILL_SUMMON_SESSION;

    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(summonRegistryDocs),
      { now: () => new Date("2026-07-16T12:00:00Z") },
    );
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: clientName, version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    closeCallbacks.push(async () => {
      await client.close();
      await server.close();
    });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return {
      client,
      async close() {
        await client.close();
        await server.close();
      },
    };
  }

  for (const mode of ["writeFile", "rename"] as const) {
    it(`succeeds unindexed on actual MCP summon when index ${mode} fails deterministically, preserves cached calls, and recovers safely after restoration`, async () => {
      const tempRoot = await makeTempRoot();
      const indexDir = path.join(tempRoot, expectedIndexDirName());
      const harnessId = `injected-${mode}-failure-id`;

      fsSpyState.onOp = (op, args) => {
        if (
          op === mode &&
          typeof args[0] === "string" &&
          args[0].startsWith(`${indexDir}${path.sep}.tmp-`)
        ) {
          throw Object.assign(
            new Error(`Injected ${mode} failure for ${args[0]}`),
            { code: mode === "writeFile" ? "EACCES" : "EPERM" },
          );
        }
      };

      const mcp1 = await startOfflineMcpClient(
        tempRoot,
        harnessId,
        `mcp-${mode}-1`,
      );
      try {
        // First summon creates a valid unindexed session even though index update failed.
        const firstCall = await mcp1.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
        expect(firstCall.isError).toBeFalsy();
        const root1 = (
          firstCall.structuredContent as { sessionRoot: string }
        ).sessionRoot;
        expect(path.dirname(root1)).toBe(tempRoot);

        // session.json was genuinely written with live PID and matching harnessSessionId.
        const manifest1 = JSON.parse(
          await readFile(path.join(root1, "session.json"), "utf8"),
        ) as Record<string, unknown>;
        expect(manifest1.pid).toBe(process.pid);
        expect(manifest1.harnessSessionId).toBe(harnessId);

        // No index entry and no orphan .tmp-* file left in indexDir.
        const indexEntriesDuringFault = await readdir(indexDir);
        expect(indexEntriesDuringFault).toEqual([]);

        // Repeated cached calls on the same MCP server must NOT see a cached rejected sessionPromise.
        const secondCall = await mcp1.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
        expect(secondCall.isError).toBeFalsy();
        expect(
          (secondCall.structuredContent as { sessionRoot: string }).sessionRoot,
        ).toBe(root1);

        const thirdCall = await mcp1.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", surface: "any" },
        });
        expect(thirdCall.isError).toBeFalsy();
        expect(
          (thirdCall.structuredContent as { sessionRoot: string }).sessionRoot,
        ).toBe(root1);

        // Restore index availability while mcp1 is still live on root1.
        fsSpyState.onOp = undefined;

        // A second MCP server / new lookup with the same ID must NOT adopt live root1,
        // performs zero readdir, and now writes its own indexed root2.
        const mcp2 = await startOfflineMcpClient(
          tempRoot,
          harnessId,
          `mcp-${mode}-2`,
        );
        try {
          const mcp2Ops = await recordFsOps(() =>
            mcp2.client.callTool({
              name: "summon",
              arguments: { query: "lookup skill", preview: true, surface: "any" },
            }),
          );
          expect(mcp2Ops.result.isError).toBeFalsy();
          expect(mcp2Ops.ops.filter((op) => op.op === "readdir")).toEqual([]);
          const root2 = (
            mcp2Ops.result.structuredContent as { sessionRoot: string }
          ).sessionRoot;
          expect(root2).not.toBe(root1);

          const entryPath = path.join(
            indexDir,
            `${expectedIndexKey(harnessId)}.json`,
          );
          const entry = JSON.parse(await readFile(entryPath, "utf8")) as {
            version: number;
            roots: string[];
          };
          expect(entry).toEqual({ version: 1, roots: [root2] });
        } finally {
          await mcp2.close();
        }

        // Unindexed dead root1 without readdir fallback is not auto-discovered by plain lookup,
        // but explicit SKILL_SUMMON_SESSION reattach succeeds once dead and records root1 in index.
        await markDeadPid(root1);
        const plainLookupAfterDeath = await recordFsOps(() =>
          resolveSession({ tempRoot, harnessSessionId: harnessId }),
        );
        expect(plainLookupAfterDeath.result.created).toBe(true);
        expect(plainLookupAfterDeath.result.session.root).not.toBe(root1);
        expect(
          plainLookupAfterDeath.ops.filter((op) => op.op === "readdir"),
        ).toEqual([]);

        process.env.SKILL_SUMMON_SESSION = root1;
        const explicitReattach = await resolveSession({
          tempRoot,
          harnessSessionId: harnessId,
        });
        expect(explicitReattach.created).toBe(false);
        expect(explicitReattach.session.root).toBe(root1);

        const entryAfterReattach = JSON.parse(
          await readFile(
            path.join(indexDir, `${expectedIndexKey(harnessId)}.json`),
            "utf8",
          ),
        ) as { roots: string[] };
        expect(entryAfterReattach.roots[0]).toBe(root1);
      } finally {
        fsSpyState.onOp = undefined;
        await mcp1.close();
      }
    });
  }

  it("preserves a pre-existing valid index entry intact when atomic rename fails", async () => {
    const tempRoot = await makeTempRoot();
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    const harnessId = "atomic-rename-preserves-prior";

    const first = await resolveSession({ tempRoot, harnessSessionId: harnessId });
    const entryPath = path.join(indexDir, `${expectedIndexKey(harnessId)}.json`);
    const beforePayload = await readFile(entryPath, "utf8");

    fsSpyState.onOp = (op, args) => {
      if (
        op === "rename" &&
        typeof args[0] === "string" &&
        args[0].startsWith(`${indexDir}${path.sep}.tmp-`)
      ) {
        throw Object.assign(new Error("Injected rename failure"), { code: "EPERM" });
      }
    };

    try {
      const second = await resolveSession({
        tempRoot,
        harnessSessionId: harnessId,
      });
      expect(second.created).toBe(true);
      expect(second.session.root).not.toBe(first.session.root);
      expect(await readFile(entryPath, "utf8")).toBe(beforePayload);
      expect(await readdir(indexDir)).toEqual([path.basename(entryPath)]);
    } finally {
      fsSpyState.onOp = undefined;
    }
  });

  it("handles real POSIX mode 0500 read-only private indexDir on MCP summon and recovers after restoring 0700 (non-root only)", async () => {
    // Non-root POSIX condition: root (uid 0) bypasses DAC write checks on 0500 directories.
    if (process.platform === "win32" || process.getuid?.() === 0) return;

    const tempRoot = await makeTempRoot();
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    const harnessId = "real-0500-index-id";
    await mkdir(indexDir, { mode: 0o500 });
    // Ensure exact 0o500 regardless of process umask.
    await chmod(indexDir, 0o500);

    try {
      const mcp1 = await startOfflineMcpClient(tempRoot, harnessId, "mcp-0500-1");
      try {
        const firstCall = await mcp1.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
        expect(firstCall.isError).toBeFalsy();
        const root1 = (
          firstCall.structuredContent as { sessionRoot: string }
        ).sessionRoot;

        const secondCall = await mcp1.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        });
        expect(secondCall.isError).toBeFalsy();
        expect(
          (secondCall.structuredContent as { sessionRoot: string }).sessionRoot,
        ).toBe(root1);

        expect(((await lstat(indexDir)).mode & 0o777)).toBe(0o500);
        await chmod(indexDir, 0o700);
        expect(await readdir(indexDir)).toEqual([]);

        // After restoring writability, a new MCP server creates and indexes a fresh root
        // without adopting live root1.
        const mcp2 = await startOfflineMcpClient(
          tempRoot,
          harnessId,
          "mcp-0500-2",
        );
        try {
          const nextOps = await recordFsOps(() =>
            mcp2.client.callTool({
              name: "summon",
              arguments: { query: "lookup skill", preview: true, surface: "any" },
            }),
          );
          expect(nextOps.result.isError).toBeFalsy();
          expect(nextOps.ops.filter((op) => op.op === "readdir")).toEqual([]);
          const root2 = (
            nextOps.result.structuredContent as { sessionRoot: string }
          ).sessionRoot;
          expect(root2).not.toBe(root1);

          const entryPath = path.join(
            indexDir,
            `${expectedIndexKey(harnessId)}.json`,
          );
          const entry = JSON.parse(await readFile(entryPath, "utf8")) as {
            roots: string[];
          };
          expect(entry.roots).toEqual([root2]);
          expect(((await lstat(indexDir)).mode & 0o777)).toBe(0o700);
          expect(((await lstat(entryPath)).mode & 0o777)).toBe(0o600);
        } finally {
          await mcp2.close();
        }
      } finally {
        await mcp1.close();
      }
    } finally {
      await chmod(indexDir, 0o700).catch(() => {});
    }
  });

  it("never swallows actual session-root or manifest validation/write failures in SummonSession.createAt", async () => {
    const tempRoot = await makeTempRoot();
    const outsideRoot = await makeTempRoot();

    // 1. Non-disposable root is rejected.
    await expect(
      SummonSession.createAt(outsideRoot, "non-disposable", { tempRoot }),
    ).rejects.toThrow(/not a direct child|disposable/u);

    // 2. Symlinked session root is rejected.
    const symlinkSession = path.join(tempRoot, "skill-summon-session-sym-create");
    await symlink(outsideRoot, symlinkSession, "dir");
    await expect(
      SummonSession.createAt(symlinkSession, "sym-root", { tempRoot }),
    ).rejects.toThrow(/real directory|symlink/u);

    // 3. Manifest write failure is propagated, not swallowed.
    const realRoot = path.join(tempRoot, "skill-summon-session-manifest-fail");
    await mkdir(realRoot);
    fsSpyState.onOp = (op, args) => {
      if (op === "writeFile" && args[0] === path.join(realRoot, "session.json")) {
        throw Object.assign(new Error("Injected manifest write failure"), {
          code: "EIO",
        });
      }
    };
    try {
      await expect(
        SummonSession.createAt(realRoot, "manifest-fail", {
          tempRoot,
          harnessSessionId: "manifest-fail-id",
        }),
      ).rejects.toThrow(/Injected manifest write failure/u);
    } finally {
      fsSpyState.onOp = undefined;
    }

    // 4. Real read-only session root (0500) rejects manifest creation (non-root POSIX).
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const readOnlyRoot = path.join(tempRoot, "skill-summon-session-ro-root");
      await mkdir(readOnlyRoot, { mode: 0o500 });
      await chmod(readOnlyRoot, 0o500);
      try {
        await expect(
          SummonSession.createAt(readOnlyRoot, "ro-root", {
            tempRoot,
            harnessSessionId: "ro-root-id",
          }),
        ).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(readOnlyRoot, 0o700).catch(() => {});
      }
    }
  });

  it("creates new index dir at 0700 and index files at 0600, and rejects pre-existing permissive group/other index dirs without chmod or overwriting preexisting data", async () => {
    if (process.platform === "win32") return;

    // 1. Fresh index directory and entry file permissions.
    const freshTempRoot = await makeTempRoot();
    const fresh = await resolveSession({
      tempRoot: freshTempRoot,
      harnessSessionId: "fresh-perms-id",
    });
    expect(fresh.created).toBe(true);
    const freshIndexDir = path.join(freshTempRoot, expectedIndexDirName());
    const freshEntryPath = path.join(
      freshIndexDir,
      `${expectedIndexKey("fresh-perms-id")}.json`,
    );
    expect(((await lstat(freshIndexDir)).mode & 0o777)).toBe(0o700);
    expect(((await lstat(freshEntryPath)).mode & 0o777)).toBe(0o600);

    // 2. Pre-existing permissive same-owner index dirs across group/other bits.
    for (const mode of [0o755, 0o775, 0o777, 0o750, 0o701] as const) {
      const tempRoot = await makeTempRoot();
      const indexDir = path.join(tempRoot, expectedIndexDirName());
      const deadRoot = path.join(tempRoot, "skill-summon-session-dead-in-permissive");
      await mkdir(deadRoot);
      const harnessId = `permissive-${mode.toString(8)}`;
      await writeFile(
        path.join(deadRoot, "session.json"),
        JSON.stringify({
          id: `dead-${mode}`,
          harnessSessionId: harnessId,
          createdAt: "2026-04-01T00:00:00.000Z",
          pid: DEAD_PID,
          skills: [],
        }),
        "utf8",
      );

      await mkdir(indexDir, { mode: 0o700 });
      const entryPath = path.join(indexDir, `${expectedIndexKey(harnessId)}.json`);
      const preexistingEntry = JSON.stringify({ version: 1, roots: [deadRoot] });
      await writeFile(entryPath, preexistingEntry, "utf8");
      const arbitraryFile = path.join(indexDir, "preexisting-data.json");
      await writeFile(arbitraryFile, '{"keep":true}\n', "utf8");
      await chmod(indexDir, mode);

      const lookupOps = await recordFsOps(() =>
        resolveSession({ tempRoot, harnessSessionId: harnessId }),
      );
      expect(lookupOps.result.created).toBe(true);
      expect(lookupOps.result.session.root).not.toBe(deadRoot);
      expect(lookupOps.ops.filter((op) => op.op === "readdir")).toEqual([]);
      // Must neither chmod the directory nor overwrite/remove preexisting data.
      expect(((await lstat(indexDir)).mode & 0o777)).toBe(mode);
      expect(await readFile(entryPath, "utf8")).toBe(preexistingEntry);
      expect(await readFile(arbitraryFile, "utf8")).toBe('{"keep":true}\n');

      // Closing the created session also leaves the permissive dir untouched.
      await lookupOps.result.session.close();
      expect(((await lstat(indexDir)).mode & 0o777)).toBe(mode);
      expect(await readFile(entryPath, "utf8")).toBe(preexistingEntry);
      expect(await readFile(arbitraryFile, "utf8")).toBe('{"keep":true}\n');
    }
  });

  it("rejects foreign-owned and symlinked index directories without chmod, readdir, or outside target mutation", async () => {
    if (typeof process.getuid !== "function") return;

    const realUid = process.getuid();
    const fakeUid = realUid + 10_000;
    const tempRoot = await makeTempRoot();
    const foreignIndexDir = path.join(
      tempRoot,
      `${INDEX_DIR_PREFIX}-${fakeUid}`,
    );
    const deadRoot = path.join(tempRoot, "skill-summon-session-foreign-dead");
    await mkdir(deadRoot);
    const harnessId = "foreign-owned-index-id";
    await writeFile(
      path.join(deadRoot, "session.json"),
      JSON.stringify({
        id: "foreign-dead",
        harnessSessionId: harnessId,
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_PID,
        skills: [],
      }),
      "utf8",
    );

    await mkdir(foreignIndexDir, { mode: 0o700 });
    const entryPath = path.join(
      foreignIndexDir,
      `${expectedIndexKey(harnessId)}.json`,
    );
    const entryPayload = JSON.stringify({ version: 1, roots: [deadRoot] });
    await writeFile(entryPath, entryPayload, "utf8");
    const sentinelPath = path.join(foreignIndexDir, "foreign-sentinel.txt");
    await writeFile(sentinelPath, "UNMODIFIED", "utf8");

    const uidSpy = vi.spyOn(process, "getuid").mockReturnValue(fakeUid);
    try {
      const ops = await recordFsOps(() =>
        resolveSession({ tempRoot, harnessSessionId: harnessId }),
      );
      expect(ops.result.created).toBe(true);
      expect(ops.result.session.root).not.toBe(deadRoot);
      expect(ops.ops.filter((op) => op.op === "readdir")).toEqual([]);
      expect(await readFile(entryPath, "utf8")).toBe(entryPayload);
      expect(await readFile(sentinelPath, "utf8")).toBe("UNMODIFIED");

      // Closing must also leave the foreign-owned index directory untouched.
      await ops.result.session.close();
      expect(await readFile(entryPath, "utf8")).toBe(entryPayload);
      expect(await readFile(sentinelPath, "utf8")).toBe("UNMODIFIED");
    } finally {
      uidSpy.mockRestore();
    }

    // Symlinked indexDir pointing outside: close() as well as resolveSession() must not mutate target.
    const symTempRoot = await makeTempRoot();
    const outsideTarget = await makeTempRoot();
    const outsideEntry = path.join(
      outsideTarget,
      `${expectedIndexKey("sym-close-id")}.json`,
    );
    await writeFile(outsideEntry, JSON.stringify({ version: 1, roots: [] }), "utf8");
    await symlink(
      outsideTarget,
      path.join(symTempRoot, expectedIndexDirName()),
      "dir",
    );

    const symResolved = await recordFsOps(() =>
      resolveSession({ tempRoot: symTempRoot, harnessSessionId: "sym-close-id" }),
    );
    expect(symResolved.result.created).toBe(true);
    expect(symResolved.ops.filter((op) => op.op === "readdir")).toEqual([]);
    await symResolved.result.session.close();
    expect(await readdir(outsideTarget)).toEqual([path.basename(outsideEntry)]);
  });

  it("enforces actual index byte read cap (bound + 1) when an index file grows after stat", async () => {
    const tempRoot = await makeTempRoot();
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    await mkdir(indexDir, { mode: 0o700 });

    const harnessId = "post-stat-growth-id";
    const deadRoot = path.join(tempRoot, "skill-summon-session-grown-target");
    await mkdir(deadRoot);
    await writeFile(
      path.join(deadRoot, "session.json"),
      JSON.stringify({
        id: "grown-target",
        harnessSessionId: harnessId,
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_PID,
        skills: [],
      }),
      "utf8",
    );

    const entryPath = path.join(indexDir, `${expectedIndexKey(harnessId)}.json`);
    const initialJson = JSON.stringify({ version: 1, roots: [deadRoot] });
    expect(Buffer.byteLength(initialJson, "utf8")).toBeLessThan(1024);
    await writeFile(entryPath, initialJson, "utf8");

    let bytesReadTotal = 0;
    let unboundedReadFileCalled = false;
    let grewAfterStat = false;

    fsSpyState.onOpenResult = (args, rawHandle) => {
      if (args[0] !== entryPath) return rawHandle;
      const handle = rawHandle as Awaited<ReturnType<typeof import("node:fs/promises").open>>;
      const origStat = handle.stat.bind(handle);
      const origRead = handle.read.bind(handle);
      return new Proxy(handle, {
        get(target, prop, receiver) {
          if (prop === "stat") {
            return async () => {
              const st = await origStat();
              if (!grewAfterStat) {
                grewAfterStat = true;
                // Grow the file well past 64 KiB AFTER stat() observes the small size.
                appendFileSync(entryPath, " ".repeat(70 * 1024), "utf8");
              }
              return st;
            };
          }
          if (prop === "read") {
            return async (...readArgs: Parameters<typeof handle.read>) => {
              const result = await origRead(...readArgs);
              bytesReadTotal += result.bytesRead;
              return result;
            };
          }
          if (prop === "readFile") {
            return () => {
              unboundedReadFileCalled = true;
              throw new Error("Unbounded handle.readFile must not be used");
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    };

    try {
      const lookup = await recordFsOps(() =>
        resolveSession({ tempRoot, harnessSessionId: harnessId }),
      );
      expect(grewAfterStat).toBe(true);
      expect(unboundedReadFileCalled).toBe(false);
      // Bounded to MAX_INDEX_ENTRY_BYTES + 1 = 65537 bytes despite >70 KiB on disk.
      expect(bytesReadTotal).toBe(64 * 1024 + 1);
      expect(lookup.result.created).toBe(true);
      expect(lookup.result.session.root).not.toBe(deadRoot);
      expect(lookup.ops.filter((op) => op.op === "readdir")).toEqual([]);
    } finally {
      fsSpyState.onOpenResult = undefined;
    }
  });

  it("preserves session root and valid locator on server.close() (SIGINT-equivalent) for automatic resume, distinct from explicit SummonSession.close()", async () => {
    const tempRoot = await makeTempRoot();
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    const harnessId = "sigint-close-resume-id";
    const entryPath = path.join(indexDir, `${expectedIndexKey(harnessId)}.json`);

    // 1. Start MCP server 1, run summon, then call server.close() (the SIGINT/SIGTERM action).
    const mcp1 = await startOfflineMcpClient(tempRoot, harnessId, "mcp-sigint-1");
    const call1 = await mcp1.client.callTool({
      name: "summon",
      arguments: { query: "lookup skill", preview: true, surface: "any" },
    });
    expect(call1.isError).toBeFalsy();
    const root1 = (call1.structuredContent as { sessionRoot: string }).sessionRoot;

    // Seed campaign state so we also prove campaign continuity across close -> dead -> resume.
    const seededStore = await CampaignStore.load(root1);
    await seededStore.append({ channel: "agent", op: "open" });
    await seededStore.append({
      channel: "agent",
      op: "recon",
      recon: {
        schema: CAMPAIGN_SCHEMA_IDS.recon,
        findings: ["Preserved across server.close"],
        citations: ["citation:sigint"],
      },
    });

    await mcp1.close();

    // Root, manifest, campaign, and valid locator entry must ALL remain intact.
    await expect(access(root1)).resolves.toBeUndefined();
    await expect(access(path.join(root1, "session.json"))).resolves.toBeUndefined();
    const entryAfterServerClose = JSON.parse(await readFile(entryPath, "utf8")) as {
      roots: string[];
    };
    expect(entryAfterServerClose.roots).toContain(root1);

    // 2. After previous server process dies, a new MCP server automatically discovers and reattaches.
    await markDeadPid(root1);
    const mcp2 = await startOfflineMcpClient(tempRoot, harnessId, "mcp-sigint-2");
    try {
      const resumeOps = await recordFsOps(() =>
        mcp2.client.callTool({
          name: "summon",
          arguments: { query: "lookup skill", preview: true, surface: "any" },
        }),
      );
      expect(resumeOps.result.isError).toBeFalsy();
      expect(resumeOps.ops.filter((op) => op.op === "readdir")).toEqual([]);
      expect(
        (resumeOps.result.structuredContent as { sessionRoot: string }).sessionRoot,
      ).toBe(root1);

      const resumedStore = await CampaignStore.load(root1);
      expect(resumedStore.state.state).toBe(CampaignStates.recon);
    } finally {
      await mcp2.close();
    }

    // 3. Explicit SummonSession.close() removes the root and prunes its locator entry.
    await markDeadPid(root1);
    const reattached = await resolveSession({ tempRoot, harnessSessionId: harnessId });
    expect(reattached.created).toBe(false);
    expect(reattached.session.root).toBe(root1);
    await reattached.session.close();

    await expect(access(root1)).rejects.toThrow();
    await expect(access(entryPath)).rejects.toThrow();
  });
});
