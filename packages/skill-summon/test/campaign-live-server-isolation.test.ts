import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import { SUMMON_LOG_FILE } from "../src/summon/log.js";
import type { SessionManifest } from "../src/summon/session.js";

const execFileAsync = promisify(execFile);

const DEAD_FIXTURE_PID = 99_999_999;

const TRACKED_ENV_KEYS = [
  "CLAUDE_CODE_SESSION_ID",
  "SKILL_SUMMON_SESSION",
  "SKILL_SUMMON_CACHE_DIR",
  "TMPDIR",
  "TMP",
  "TEMP",
] as const;

type TrackedEnvKey = (typeof TRACKED_ENV_KEYS)[number];

const hostTmpdir = tmpdir();
let savedEnv: Record<TrackedEnvKey, string | undefined>;
let testNamespace: string | undefined;
const closeCallbacks: Array<() => Promise<void>> = [];

beforeEach(async () => {
  savedEnv = {
    CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID,
    SKILL_SUMMON_SESSION: process.env.SKILL_SUMMON_SESSION,
    SKILL_SUMMON_CACHE_DIR: process.env.SKILL_SUMMON_CACHE_DIR,
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
  };

  testNamespace = await mkdtemp(path.join(hostTmpdir, "skill-summon-live-isolation-"));
  process.env.TMPDIR = testNamespace;
  process.env.TMP = testNamespace;
  process.env.TEMP = testNamespace;
  process.env.SKILL_SUMMON_CACHE_DIR = path.join(testNamespace, "payload-cache");
  delete process.env.SKILL_SUMMON_SESSION;
  delete process.env.CLAUDE_CODE_SESSION_ID;
});

afterEach(async () => {
  await Promise.all(
    closeCallbacks.splice(0).map(async (close) => {
      try {
        await close();
      } catch {
        // Ensure all servers/clients and temp cleanup still run.
      }
    }),
  );

  for (const key of TRACKED_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  if (testNamespace) {
    const ns = testNamespace;
    testNamespace = undefined;
    await rm(ns, { recursive: true, force: true });
    await expect(access(ns)).rejects.toThrow();
  }
});

function requireNamespace(): string {
  if (!testNamespace) throw new Error("testNamespace was not initialized.");
  return testNamespace;
}

function makeDocs(skillUrl: string): GaiaRegistryDocuments {
  return {
    generic: {
      generatedAt: "2026-07-16T00:00:00Z",
      skills: [
        {
          id: "testing",
          name: "Testing",
          type: "basic",
          description: "Testing and verification workflows.",
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
            id: "example/primed-skill",
            name: "Primed Skill",
            contributor: "example",
            genericSkillRef: "testing",
            status: "named",
            description: "Primed skill fixture for live server isolation testing.",
            catalogRef: "example-primed-skill",
            tags: ["primed", "isolation"],
            links: { github: skillUrl },
            evidence: [],
          },
        ],
      },
    },
  };
}

async function createLocalSkillRepo(namespace: string, name = "repo"): Promise<string> {
  // Trailing `/SKILL.md` satisfies isInstallable() without using https://github.com,
  // keeping git ls-remote / git clone purely on local file:// with zero network calls.
  const repoDir = path.join(namespace, name, "SKILL.md");
  await mkdir(repoDir, { recursive: true });
  await writeFile(
    path.join(repoDir, "SKILL.md"),
    "---\nname: primed-skill\ndescription: Local isolation fixture\n---\n\n# Primed Skill\n",
    "utf8",
  );

  const gitEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };

  await execFileAsync("git", ["init", "-q"], { cwd: repoDir, env: gitEnv });
  await execFileAsync("git", ["add", "SKILL.md"], { cwd: repoDir, env: gitEnv });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Isolation Test",
      "-c",
      "user.email=isolation@example.invalid",
      "commit",
      "-q",
      "-m",
      "Initial fixture skill",
    ],
    { cwd: repoDir, env: gitEnv },
  );

  return repoDir;
}

async function connectLiveServer(
  docs: GaiaRegistryDocuments,
  clientName: string,
): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const service = new GaiaService(new InMemoryGaiaRegistrySource(docs), {
    now: () => new Date("2026-07-16T12:00:00Z"),
  });
  const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
  const client = new Client({ name: clientName, version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const close = async () => {
    await client.close();
    await server.close();
  };
  closeCallbacks.push(close);
  return { client, close };
}

async function readManifest(root: string): Promise<SessionManifest> {
  return JSON.parse(await readFile(path.join(root, "session.json"), "utf8")) as SessionManifest;
}

async function seedExecutingCampaign(sessionRoot: string): Promise<void> {
  const opCap = createCampaignOperatorAdapter();
  const store = await CampaignStore.load(sessionRoot);
  const recon: CampaignRecon = {
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    findings: ["Isolation test finding"],
    citations: ["citation:isolation"],
  };
  await store.append({ channel: "agent", op: "open" });
  await store.append({ channel: "agent", op: "recon", recon });
  await store.append({
    channel: "agent",
    op: "propose",
    charter: {
      schema: CAMPAIGN_SCHEMA_IDS.charter,
      revision: 1,
      goal: "Verify live server campaign isolation",
      allowedSkills: ["example/primed-skill"],
      queue: [{ id: "u1", skill: "example/primed-skill", reconCitation: "citation:isolation" }],
      recoverLimit: 1,
      reopenLimit: 1,
      sessionRetention: 24,
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
}

function isCurrentPidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPidDeadEsrch(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

describe("live MCP server session isolation under shared CLAUDE_CODE_SESSION_ID", () => {
  it("isolates two live MCP servers with the same CLAUDE_CODE_SESSION_ID and preserves each server's cached session across repeated calls", async () => {
    const ns = requireNamespace();
    const fixedId = "fixed-live-shared-session-1";
    process.env.CLAUDE_CODE_SESSION_ID = fixedId;
    delete process.env.SKILL_SUMMON_SESSION;

    const docs = makeDocs(`file://${path.join(ns, "unused-repo", "SKILL.md")}`);
    const serverA = await connectLiveServer(docs, "live-client-a");
    const serverB = await connectLiveServer(docs, "live-client-b");

    const resA1 = await serverA.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any", preview: true },
    });
    expect(resA1.isError).toBeFalsy();
    const rootA = (resA1.structuredContent as { sessionRoot: string }).sessionRoot;

    const resB1 = await serverB.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any", preview: true },
    });
    expect(resB1.isError).toBeFalsy();
    const rootB = (resB1.structuredContent as { sessionRoot: string }).sessionRoot;

    expect(rootA).not.toBe(rootB);
    expect(path.dirname(rootA)).toBe(ns);
    expect(path.dirname(rootB)).toBe(ns);
    expect(path.basename(rootA).startsWith("skill-summon-session-")).toBe(true);
    expect(path.basename(rootB).startsWith("skill-summon-session-")).toBe(true);

    const manifestA = await readManifest(rootA);
    const manifestB = await readManifest(rootB);
    expect(manifestA.id).not.toBe(manifestB.id);
    expect(manifestA.harnessSessionId).toBe(fixedId);
    expect(manifestB.harnessSessionId).toBe(fixedId);
    expect(manifestA.pid).toBe(process.pid);
    expect(manifestB.pid).toBe(process.pid);
    expect(isCurrentPidLive(manifestA.pid)).toBe(true);
    expect(isCurrentPidLive(manifestB.pid)).toBe(true);

    // Mutate ambient env between calls to verify each live server retains its own cached sessionPromise.
    process.env.SKILL_SUMMON_SESSION = rootB;
    process.env.CLAUDE_CODE_SESSION_ID = "mutated-after-init";

    const resA2 = await serverA.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any", preview: true },
    });
    expect((resA2.structuredContent as { sessionRoot: string }).sessionRoot).toBe(rootA);

    process.env.SKILL_SUMMON_SESSION = rootA;
    const resB2 = await serverB.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any", preview: true },
    });
    expect((resB2.structuredContent as { sessionRoot: string }).sessionRoot).toBe(rootB);

    const logA = (await readFile(path.join(rootA, SUMMON_LOG_FILE), "utf8")).trim().split("\n");
    const logB = (await readFile(path.join(rootB, SUMMON_LOG_FILE), "utf8")).trim().split("\n");
    expect(logA).toHaveLength(2);
    expect(logB).toHaveLength(2);

    await serverA.close();
    await serverB.close();
  });

  it("refuses reattachment even when SKILL_SUMMON_SESSION points at another live server's root, and keeps primed skills and campaign state isolated", async () => {
    const ns = requireNamespace();
    const fixedId = "fixed-live-shared-session-2";
    process.env.CLAUDE_CODE_SESSION_ID = fixedId;
    delete process.env.SKILL_SUMMON_SESSION;

    const repoDir = await createLocalSkillRepo(ns);
    const docs = makeDocs(`file://${repoDir}`);

    const serverA = await connectLiveServer(docs, "live-client-a-primed");

    // 1. Server A cold-materializes the skill into its session root from the local file:// repo.
    const resA1 = await serverA.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(resA1.isError).toBeFalsy();
    const outA1 = resA1.structuredContent as {
      sessionRoot: string;
      summoned: Array<{ id: string; cacheSource: string; path: string }>;
    };
    const rootA = outA1.sessionRoot;
    expect(outA1.summoned).toHaveLength(1);
    expect(outA1.summoned[0]?.id).toBe("example/primed-skill");
    expect(outA1.summoned[0]?.path.startsWith(rootA)).toBe(true);

    // Remove the local git repo and payload cache so ONLY a session with the primed skill resident can serve it.
    await rm(path.join(ns, "repo"), { recursive: true, force: true });
    await rm(path.join(ns, "payload-cache"), { recursive: true, force: true });

    // Confirm server A serves the primed skill from its own resident session cache.
    const resA2 = await serverA.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(resA2.isError).toBeFalsy();
    const outA2 = resA2.structuredContent as {
      sessionRoot: string;
      summoned: Array<{ id: string; cacheSource: string; path: string }>;
    };
    expect(outA2.sessionRoot).toBe(rootA);
    expect(outA2.summoned).toHaveLength(1);
    expect(outA2.summoned[0]?.cacheSource).toBe("session");

    // Seed an approved executing campaign in server A's root.
    await seedExecutingCampaign(rootA);
    const storeA = await CampaignStore.load(rootA);
    expect(storeA.hasTrace).toBe(true);
    expect(storeA.state.state).toBe(CampaignStates.executing);

    // 2. Point SKILL_SUMMON_SESSION explicitly at live server A's root while keeping the same CLAUDE_CODE_SESSION_ID.
    process.env.SKILL_SUMMON_SESSION = rootA;

    const serverB = await connectLiveServer(docs, "live-client-b-isolated");
    const resB1 = await serverB.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(resB1.isError).toBeFalsy();
    const outB1 = resB1.structuredContent as {
      sessionRoot: string;
      summoned: unknown[];
      skipped: Array<{ id: string; reason: string }>;
    };
    const rootB = outB1.sessionRoot;

    // Server B must NOT adopt or reattach to live rootA.
    expect(rootB).not.toBe(rootA);
    expect(path.dirname(rootB)).toBe(ns);

    // No primed skill crosses: server B cannot serve the resident skill from rootA.
    expect(outB1.summoned).toEqual([]);
    expect(outB1.skipped).toEqual([
      expect.objectContaining({ id: "example/primed-skill" }),
    ]);

    const manifestA = await readManifest(rootA);
    const manifestB = await readManifest(rootB);
    expect(manifestA.pid).toBe(process.pid);
    expect(manifestB.pid).toBe(process.pid);
    expect(manifestA.skills).toHaveLength(1);
    expect(manifestB.skills).toEqual([]);
    expect(await readdir(path.join(rootB, "skills"))).toEqual([]);

    // No campaign state crosses: rootB has no campaign while rootA stays executing.
    await expect(access(path.join(rootB, "campaign"))).rejects.toThrow();
    const storeB = await CampaignStore.load(rootB);
    expect(storeB.hasTrace).toBe(false);
    expect(storeB.state.state).toBe(CampaignStates.unarmed);

    const storeAAfter = await CampaignStore.load(rootA);
    expect(storeAAfter.hasTrace).toBe(true);
    expect(storeAAfter.state.state).toBe(CampaignStates.executing);

    // 3. Repeated calls on both servers stay pinned to their own roots even with cross-pointing env.
    process.env.SKILL_SUMMON_SESSION = rootB;
    const resA3 = await serverA.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    const outA3 = resA3.structuredContent as {
      sessionRoot: string;
      summoned: Array<{ cacheSource: string }>;
    };
    expect(outA3.sessionRoot).toBe(rootA);
    expect(outA3.summoned).toHaveLength(1);
    expect(outA3.summoned[0]?.cacheSource).toBe("session");

    delete process.env.SKILL_SUMMON_SESSION;
    const resB2 = await serverB.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any", preview: true },
    });
    expect((resB2.structuredContent as { sessionRoot: string }).sessionRoot).toBe(rootB);

    await serverA.close();
    await serverB.close();
  });

  it("isolates two live MCP servers resolving concurrently with the same CLAUDE_CODE_SESSION_ID", async () => {
    const ns = requireNamespace();
    const fixedId = "fixed-live-concurrent-id";
    process.env.CLAUDE_CODE_SESSION_ID = fixedId;
    delete process.env.SKILL_SUMMON_SESSION;

    const docs = makeDocs(`file://${path.join(ns, "unused-concurrent", "SKILL.md")}`);
    const serverA = await connectLiveServer(docs, "concurrent-client-a");
    const serverB = await connectLiveServer(docs, "concurrent-client-b");

    const [resA, resB] = await Promise.all([
      serverA.client.callTool({
        name: "summon",
        arguments: { query: "primed skill", surface: "any", preview: true },
      }),
      serverB.client.callTool({
        name: "summon",
        arguments: { query: "primed skill", surface: "any", preview: true },
      }),
    ]);

    expect(resA.isError).toBeFalsy();
    expect(resB.isError).toBeFalsy();
    const rootA = (resA.structuredContent as { sessionRoot: string }).sessionRoot;
    const rootB = (resB.structuredContent as { sessionRoot: string }).sessionRoot;

    expect(rootA).not.toBe(rootB);
    expect((await readManifest(rootA)).pid).toBe(process.pid);
    expect((await readManifest(rootB)).pid).toBe(process.pid);

    // Repeated calls preserve each server's own resolved root.
    const [resA2, resB2] = await Promise.all([
      serverA.client.callTool({
        name: "summon",
        arguments: { query: "primed skill", surface: "any", preview: true },
      }),
      serverB.client.callTool({
        name: "summon",
        arguments: { query: "primed skill", surface: "any", preview: true },
      }),
    ]);

    expect((resA2.structuredContent as { sessionRoot: string }).sessionRoot).toBe(rootA);
    expect((resB2.structuredContent as { sessionRoot: string }).sessionRoot).toBe(rootB);

    await serverA.close();
    await serverB.close();
  });

  it("allows deliberate resume via MCP when matching-ID manifest has a dead PID, then isolates a concurrent third live server", async () => {
    const ns = requireNamespace();
    const fixedId = "fixed-dead-pid-resume-id";
    process.env.CLAUDE_CODE_SESSION_ID = fixedId;
    delete process.env.SKILL_SUMMON_SESSION;
    expect(isPidDeadEsrch(DEAD_FIXTURE_PID)).toBe(true);

    const repoDir = await createLocalSkillRepo(ns, "resume-repo");
    const docs = makeDocs(`file://${repoDir}`);

    // 1. Original server materializes a skill and seeds an executing campaign, then closes cleanly.
    const server1 = await connectLiveServer(docs, "resume-client-1");
    const res1 = await server1.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(res1.isError).toBeFalsy();
    const root1 = (res1.structuredContent as { sessionRoot: string }).sessionRoot;
    await seedExecutingCampaign(root1);
    await server1.close();

    // Remove the local git repo and payload cache so post-resume residency proves real reattachment.
    await rm(path.join(ns, "resume-repo"), { recursive: true, force: true });
    await rm(path.join(ns, "payload-cache"), { recursive: true, force: true });

    // Inject deterministic dead PID ONLY into the disposable test root manifest (never killing any process).
    const manifestPath = path.join(root1, "session.json");
    const staleManifest = await readManifest(root1);
    await writeFile(
      manifestPath,
      JSON.stringify({ ...staleManifest, pid: DEAD_FIXTURE_PID }, null, 2),
      "utf8",
    );

    // 2. New MCP server with the same CLAUDE_CODE_SESSION_ID deliberately reattaches to dead-PID root1.
    const server2 = await connectLiveServer(docs, "resume-client-2");
    const res2 = await server2.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(res2.isError).toBeFalsy();
    const out2 = res2.structuredContent as {
      sessionRoot: string;
      summoned: Array<{ id: string; cacheSource: string }>;
    };
    expect(out2.sessionRoot).toBe(root1);
    expect(out2.summoned).toHaveLength(1);
    expect(out2.summoned[0]?.id).toBe("example/primed-skill");
    expect(out2.summoned[0]?.cacheSource).toBe("session");

    const resumedManifest = await readManifest(root1);
    expect(resumedManifest.pid).toBe(process.pid);
    expect(resumedManifest.harnessSessionId).toBe(fixedId);
    const resumedStore = await CampaignStore.load(root1);
    expect(resumedStore.corrupted).toBe(false);
    expect(resumedStore.state.state).toBe(CampaignStates.executing);

    // 3. While server2 is live on root1, a third live server with the same ID (even with SKILL_SUMMON_SESSION=root1)
    // must NOT steal root1 and gets a fresh isolated root3.
    process.env.SKILL_SUMMON_SESSION = root1;
    const server3 = await connectLiveServer(docs, "live-client-3");
    const res3 = await server3.client.callTool({
      name: "summon",
      arguments: { query: "primed skill", surface: "any" },
    });
    expect(res3.isError).toBeFalsy();
    const out3 = res3.structuredContent as {
      sessionRoot: string;
      summoned: unknown[];
      skipped: Array<{ id: string }>;
    };
    expect(out3.sessionRoot).not.toBe(root1);
    expect(out3.summoned).toEqual([]);
    expect(out3.skipped).toEqual([
      expect.objectContaining({ id: "example/primed-skill" }),
    ]);
    expect((await CampaignStore.load(out3.sessionRoot)).hasTrace).toBe(false);

    await server2.close();
    await server3.close();
  });
});
