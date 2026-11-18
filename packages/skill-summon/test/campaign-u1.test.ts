import { access, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  initialCampaignState,
  tokenize,
} from "skill-zero";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCampaignDigest,
  CAMPAIGN_TOOL_DESCRIPTION,
  CAMPAIGN_TOOL_NAME,
  CampaignStore,
  createSkillSummonMcpServer,
  executeRecon,
  GaiaService,
  getCampaignToolInputJsonSchema,
  InMemoryGaiaRegistrySource,
  measureCampaignToolStandingDose,
  readPersistedReconRecord,
  readSessionCampaignDigest,
  ZERO_CUT_REFUSAL,
  type CampaignReconResult,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import { authorityHits } from "../../../plugins/skill-heaven/scripts/render-ladder.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const BUNDLED_MCP_PATH = path.join(
  REPO_ROOT,
  "plugins/skill-heaven/mcp/skill-summon.mjs",
);

const testDocuments: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Runs test suites and explains failures.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "active",
      },
      {
        id: "code-review",
        name: "Code Review",
        type: "basic",
        description: "Reviews pull requests for defects and regressions.",
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
      "automated-testing": [
        {
          id: "example/human-tester",
          name: "Human Tester",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs automated tests with human review.",
          catalogRef: "example-human-tester",
          tags: [],
          links: {
            github: "https://github.com/example/human-tester/blob/main/SKILL.md",
          },
          evidence: [],
          invocation: "human",
        },
        {
          id: "example/model-tester",
          name: "Model Tester",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs automated tests in model-led mode.",
          catalogRef: "example-model-tester",
          tags: [],
          links: {
            github: "https://github.com/example/model-tester/blob/main/SKILL.md",
          },
          evidence: [],
          invocation: "model",
        },
        {
          id: "example/unclassified-tester",
          name: "Unclassified Tester",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs automated tests without explicit invocation lane.",
          catalogRef: "example-unclassified-tester",
          tags: [],
          links: {
            github: "https://github.com/example/unclassified-tester/blob/main/SKILL.md",
          },
          evidence: [],
        },
      ],
      "code-review": [
        {
          id: "example/reviewer",
          name: "Reviewer",
          contributor: "example",
          genericSkillRef: "code-review",
          status: "named",
          description: "Reviews diffs and reports regressions.",
          catalogRef: "example-reviewer",
          tags: [],
          links: {
            github: "https://github.com/example/reviewer/blob/main/SKILL.md",
          },
          evidence: [],
          invocation: "model",
        },
      ],
    },
  },
};

const VALID_OPEN_INPUT = {
  op: "open",
  goal: "Verify U1 campaign open, recon, and status control plane.",
  workUniverse: ["packages/skill-summon/src/campaign/"],
  repositories: ["gaia-research/gaia-skill-heaven"],
  acceptanceCommands: ["npm run typecheck", "npm test"],
  humanOnlyOperations: ["merge", "release"],
  stopConditions: ["all-acceptance-commands-green"],
};

async function expectNoSkillsMaterialized(skillsRoot: string): Promise<void> {
  try {
    const entries = await readdir(skillsRoot);
    expect(entries).toEqual([]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function makeService(docs: GaiaRegistryDocuments = testDocuments): GaiaService {
  return new GaiaService(new InMemoryGaiaRegistrySource(docs), {
    now: () => new Date("2026-07-16T12:00:00Z"),
  });
}

describe("U1 campaign tool (open, recon, status)", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];
  const tempDirs: string[] = [];
  let session: SummonSession | undefined;
  let prevSessionEnv: string | undefined;
  let prevHarnessIdEnv: string | undefined;
  let prevDecisionEnv: string | undefined;

  beforeEach(async () => {
    prevSessionEnv = process.env.SKILL_SUMMON_SESSION;
    prevHarnessIdEnv = process.env.CLAUDE_CODE_SESSION_ID;
    prevDecisionEnv = process.env.SKILL_HEAVEN_DECISION;
    delete process.env.SKILL_SUMMON_SESSION;
    delete process.env.SKILL_HEAVEN_DECISION;
    session = await openSession();
    process.env.SKILL_SUMMON_SESSION = session.root;
  });

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((fn) => fn()));
    await session?.close();
    session = undefined;
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
    if (prevSessionEnv === undefined) delete process.env.SKILL_SUMMON_SESSION;
    else process.env.SKILL_SUMMON_SESSION = prevSessionEnv;
    if (prevHarnessIdEnv === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = prevHarnessIdEnv;
    if (prevDecisionEnv === undefined) delete process.env.SKILL_HEAVEN_DECISION;
    else process.env.SKILL_HEAVEN_DECISION = prevDecisionEnv;
  });

  async function connectServer(
    options: Parameters<typeof createSkillSummonMcpServer>[0],
  ): Promise<Client> {
    const server = createSkillSummonMcpServer(options);
    const client = new Client({ name: "u1-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );
    return client;
  }

  describe("1. Bundled binary & server option gate (D-002)", () => {
    it("registers only summon by default and registers campaign when enableCampaignTool is true", async () => {
      const defaultClient = await connectServer({
        service: makeService(),
        version: "0.0.0",
      });
      const defaultTools = await defaultClient.listTools();
      expect(defaultTools.tools.map((t) => t.name)).toEqual(["summon"]);

      const enabledClient = await connectServer({
        service: makeService(),
        version: "0.0.0",
        enableCampaignTool: true,
      });
      const enabledTools = await enabledClient.listTools();
      expect(enabledTools.tools.map((t) => t.name)).toEqual([
        "summon",
        "campaign",
      ]);
    });

    it("rebuilt bundled binary lists only summon and rejects calls to campaign", async () => {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
      env.SKILL_SUMMON_SESSION = session!.root;

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [BUNDLED_MCP_PATH],
        env,
        stderr: "pipe",
      });
      const client = new Client({ name: "u1-bundled-test", version: "1.0.0" });
      await client.connect(transport);
      closeCallbacks.push(() => client.close());

      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(["summon"]);

      const missingCall = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(missingCall.isError).toBe(true);
      expect(JSON.stringify(missingCall.content)).toMatch(/campaign|not found/iu);
    });
  });

  describe("2. Unknown / invalid op handling", () => {
    it.each(["unknown", "decide", "propose", ""])(
      "returns structured refusal for op=%j without throwing",
      async (badOp) => {
        const client = await connectServer({
          service: makeService(),
          enableCampaignTool: true,
        });

        const result = await client.callTool({
          name: "campaign",
          arguments: { op: badOp },
        });

        expect(result.isError).toBe(true);
        const sc = result.structuredContent as Record<string, unknown>;
        expect(sc.ok).toBe(false);
        expect(sc.refused).toBe(true);
        expect(sc.error).toMatchObject({
          code: "unknown-op",
          retryable: false,
        });
        expect(sc.digest).toMatchObject({
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: CampaignStates.unarmed,
        });
      },
    );
  });

  describe("3. open operation & goal contract", () => {
    it("stores goal contract, transitions UNARMED -> RECON, writes status.json, and returns digest", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const result = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });

      expect(result.isError).not.toBe(true);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc).toMatchObject({
        ok: true,
        refused: false,
        op: "open",
        state: {
          state: CampaignStates.recon,
        },
        goalContract: {
          goal: VALID_OPEN_INPUT.goal,
          workUniverse: VALID_OPEN_INPUT.workUniverse,
          repositories: VALID_OPEN_INPUT.repositories,
          acceptanceCommands: VALID_OPEN_INPUT.acceptanceCommands,
          humanOnlyOperations: VALID_OPEN_INPUT.humanOnlyOperations,
          stopConditions: VALID_OPEN_INPUT.stopConditions,
        },
        digest: {
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: CampaignStates.recon,
        },
      });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(store.state.state).toBe(CampaignStates.recon);
      expect(store.trace).toHaveLength(1);
      expect(store.trace[0]).toMatchObject({
        from: CampaignStates.unarmed,
        to: CampaignStates.recon,
        accepted: true,
      });
      const goalOnDisk = JSON.parse(
        await readFile(store.goalPath, "utf8"),
      ) as Record<string, unknown>;
      expect(goalOnDisk.goal).toBe(VALID_OPEN_INPUT.goal);
      const statusOnDisk = JSON.parse(
        await readFile(store.statusPath, "utf8"),
      ) as Record<string, unknown>;
      expect(statusOnDisk.state).toBe(CampaignStates.recon);
    });

    it("normalizes snake_case aliases and refuses conflicting camelCase/snake_case values", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const conflictResult = await client.callTool({
        name: "campaign",
        arguments: {
          op: "open",
          goal: "Conflict test",
          workUniverse: ["a"],
          work_universe: ["b"],
          repositories: ["repo"],
          acceptanceCommands: ["npm test"],
          humanOnlyOperations: ["none"],
          stopConditions: ["done"],
        },
      });
      expect(conflictResult.isError).toBe(true);
      expect(
        (conflictResult.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({
        code: "invalid-goal-contract",
      });
      await expect(
        access(path.join(session!.root, "campaign")),
      ).rejects.toThrow();

      const snakeResult = await client.callTool({
        name: "campaign",
        arguments: {
          op: "open",
          goal: "Snake alias test",
          work_universe: ["packages/skill-summon"],
          repositories: ["gaia-research/gaia-skill-heaven"],
          acceptance_commands: ["npm test"],
          human_only_operations: ["human-gate"],
          stop_conditions: ["tests-pass"],
        },
      });
      expect(snakeResult.isError).not.toBe(true);
      expect(
        (snakeResult.structuredContent as Record<string, unknown>).goalContract,
      ).toEqual({
        goal: "Snake alias test",
        workUniverse: ["packages/skill-summon"],
        repositories: ["gaia-research/gaia-skill-heaven"],
        acceptanceCommands: ["npm test"],
        humanOnlyOperations: ["human-gate"],
        stopConditions: ["tests-pass"],
      });
    });

    it("refuses missing/empty goal contract fields without creating campaign/", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const result = await client.callTool({
        name: "campaign",
        arguments: {
          op: "open",
          goal: "   ",
          workUniverse: [],
          repositories: ["repo"],
          acceptanceCommands: ["npm test"],
          humanOnlyOperations: ["gate"],
          stopConditions: ["stop"],
        },
      });

      expect(result.isError).toBe(true);
      expect(
        (result.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({
        code: "invalid-goal-contract",
      });
      await expect(
        access(path.join(session!.root, "campaign")),
      ).rejects.toThrow();
    });

    it("refuses second open in RECON, appends HOLD entry, and preserves original goal.json", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const first = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });
      expect(first.isError).not.toBe(true);

      const second = await client.callTool({
        name: "campaign",
        arguments: {
          ...VALID_OPEN_INPUT,
          goal: "Attempted overwrite goal",
        },
      });
      expect(second.isError).toBe(true);
      const sc = second.structuredContent as Record<string, unknown>;
      expect(sc.error).toMatchObject({
        code: "invalid-campaign-state",
      });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(store.trace).toHaveLength(2);
      expect(store.trace[1]).toMatchObject({
        accepted: false,
        decision: "HOLD",
      });
      const goalOnDisk = await store.loadGoalContract();
      expect(goalOnDisk?.goal).toBe(VALID_OPEN_INPUT.goal);
    });

    it("refuses hostile symlink at goal.json before mutating trace.jsonl", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "u1-outside-goal-"));
      tempDirs.push(outside);
      const outsideTarget = path.join(outside, "goal.json");
      await writeFile(outsideTarget, "{\"hijacked\":true}\n", "utf8");

      const campaignDir = path.join(session!.root, "campaign");
      await mkdir(campaignDir);
      await symlink(outsideTarget, path.join(campaignDir, "goal.json"), "file");

      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      const result = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });
      expect(result.isError).toBe(true);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.ok).toBe(false);
      expect(sc.refused).toBe(true);
      expect(sc.error).toMatchObject({
        retryable: false,
      });
      expect(sc.digest).toMatchObject({
        schema: CAMPAIGN_SCHEMA_IDS.status,
      });
      await expect(
        access(path.join(campaignDir, "trace.jsonl")),
      ).rejects.toThrow();
    });
  });

  describe("4. recon operation, non-materialization, zero_cuts=all, noMatch/refusal, and lenses", () => {
    it("refuses recon before open (UNARMED)", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const result = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });

      expect(result.isError).toBe(true);
      expect(
        (result.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({
        code: "invalid-campaign-state",
      });
    });

    it("refuses recon when zeroCut is all via both MCP and executeRecon without writing files", async () => {
      const client = await connectServer({
        service: makeService(),
        zeroCut: "all",
        enableCampaignTool: true,
      });

      const mcpResult = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(mcpResult.isError).toBe(true);
      const mcpSc = mcpResult.structuredContent as Record<string, unknown>;
      expect(mcpSc.error).toMatchObject({
        code: "zero-cut",
        message: ZERO_CUT_REFUSAL,
      });
      expect(mcpSc.digest).toMatchObject({
        schema: CAMPAIGN_SCHEMA_IDS.status,
        state: CampaignStates.unarmed,
      });
      await expect(
        access(path.join(session!.root, "campaign")),
      ).rejects.toThrow();
      await expectNoSkillsMaterialized(session!.skillsRoot);

      const directResult = await executeRecon(
        makeService(),
        session!,
        { gaps: ["automated testing"] },
        { zeroCut: "all" },
      );
      expect(directResult.ok).toBe(false);
      expect(directResult.refused).toBe(true);
      expect(directResult.digest).toMatchObject({
        schema: CAMPAIGN_SCHEMA_IDS.status,
        state: CampaignStates.unarmed,
      });
      if (!directResult.ok) {
        expect(directResult.error.code).toBe("zero-cut");
        expect(directResult.error.message).toBe(ZERO_CUT_REFUSAL);
      }
    });

    it("materializes nothing under session skills/, forces deterministic classic ranker, and records lane/freshness/installability/arbor/graph lenses", async () => {
      process.env.SKILL_HEAVEN_DECISION = "jev";

      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const reconCall = await client.callTool({
        name: "campaign",
        arguments: {
          op: "recon",
          gaps: ["automated testing", "code review"],
          surface: "any",
          limit: 5,
        },
      });

      expect(reconCall.isError).not.toBe(true);
      await expectNoSkillsMaterialized(session!.skillsRoot);

      const sc = reconCall.structuredContent as unknown as CampaignReconResult;
      expect(sc.ok).toBe(true);
      if (!sc.ok) throw new Error("Expected recon to succeed");

      expect(sc.recon.gaps).toHaveLength(2);
      const testingGap = sc.recon.gaps[0]!;
      expect(testingGap.status).toBe("matched");
      expect(testingGap.refused).toBe(false);
      expect(testingGap.freshness.status).toBe("present");
      expect(testingGap.installability.status).toBe("absent-not-configured");
      expect(testingGap.arbor.hellHeaven.status).toBe("absent-not-published");
      expect(testingGap.graph.status).toMatch(/^absent-/);

      const byId = new Map(
        testingGap.candidates.map((c) => [c.id, c]),
      );
      expect(byId.get("example/human-tester")?.lane).toEqual({
        status: "present",
        invocation: "human",
        lane: "human-led",
        convergenceOnly: true,
      });
      expect(byId.get("example/model-tester")?.lane).toEqual({
        status: "present",
        invocation: "model",
        lane: "model-led",
        convergenceOnly: false,
      });
      expect(byId.get("example/unclassified-tester")?.lane).toEqual({
        status: "present",
        invocation: "any",
        lane: "unclassified",
        convergenceOnly: false,
      });

      const firstCandidate = testingGap.candidates[0]!;
      expect(firstCandidate.cardRef).toMatch(/^recon:recon-\d+:gap:0:card:/);
      expect(firstCandidate.arbor.status).toMatch(/^absent-/);
      expect(firstCandidate.graph.status).toMatch(/^absent-/);
      expect(firstCandidate.installability.status).toBe("absent-not-configured");

      const persisted = await readPersistedReconRecord(session!.root);
      expect(persisted?.reconId).toBe(sc.recon.reconId);
      expect(persisted?.gaps).toHaveLength(2);
    });

    it("records noMatch and refused gaps without failing recon, even when ALL gaps fail, and leaves steering unchanged", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      // 1. Mix of noMatch and refused (unresolvable source override)
      const allFailCall = await client.callTool({
        name: "campaign",
        arguments: {
          op: "recon",
          gaps: ["totally-nonexistent-quantum-flux-skill"],
        },
      });
      expect(allFailCall.isError).not.toBe(true);
      const sc1 = allFailCall.structuredContent as unknown as CampaignReconResult;
      expect(sc1.ok).toBe(true);
      if (!sc1.ok) throw new Error("Expected recon to succeed on all-noMatch");
      expect(sc1.recon.gaps[0]).toMatchObject({
        status: "no-match",
        refused: true,
        refusal: {
          kind: "no-match",
          note: expect.stringContaining("No capability found"),
        },
      });
      expect(sc1.state.steering).toEqual(initialCampaignState().steering);

      // 2. Refused gap via unresolvable source override
      const refusedSourceCall = await client.callTool({
        name: "campaign",
        arguments: {
          op: "recon",
          gaps: ["automated testing"],
          source: "not-a-valid-source-override://invalid",
        },
      });
      expect(refusedSourceCall.isError).not.toBe(true);
      const sc2 = refusedSourceCall.structuredContent as unknown as CampaignReconResult;
      expect(sc2.ok).toBe(true);
      if (!sc2.ok) throw new Error("Expected recon to succeed on refused gap");
      expect(sc2.recon.gaps[0]).toMatchObject({
        status: "refused",
        refused: true,
        refusal: {
          kind: "refused",
          note: expect.stringContaining("No capability found"),
        },
      });
      expect(sc2.state.steering).toEqual(initialCampaignState().steering);
      await expectNoSkillsMaterialized(session!.skillsRoot);
    });

    it("refuses hostile symlink at recon.json before mutating trace.jsonl", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "u1-outside-recon-"));
      tempDirs.push(outside);
      const outsideTarget = path.join(outside, "recon.json");
      await writeFile(outsideTarget, "{\"hijacked\":true}\n", "utf8");

      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const storeBefore = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      const traceBefore = await readFile(storeBefore.tracePath, "utf8");

      await symlink(outsideTarget, storeBefore.reconPath, "file");

      const reconCall = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(reconCall.isError).toBe(true);
      const reconSc = reconCall.structuredContent as Record<string, unknown>;
      expect(reconSc.ok).toBe(false);
      expect(reconSc.refused).toBe(true);
      expect(reconSc.error).toMatchObject({
        code: "invalid-recon-artifact",
        retryable: false,
      });
      expect(reconSc.digest).toMatchObject({
        schema: CAMPAIGN_SCHEMA_IDS.status,
        state: CampaignStates.recon,
      });
      expect(await readFile(storeBefore.tracePath, "utf8")).toBe(traceBefore);
      expect((await lstat(storeBefore.reconPath)).isSymbolicLink()).toBe(true);
    });
  });

  describe("5. status operation and shared buildCampaignDigest", () => {
    it("reports UNARMED without creating campaign/ before open, and returns goalContract + recon + digest after open and recon", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const beforeOpen = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(beforeOpen.isError).not.toBe(true);
      expect(beforeOpen.structuredContent).toMatchObject({
        ok: true,
        refused: false,
        op: "status",
        hasCampaign: false,
        state: { state: CampaignStates.unarmed },
        digest: {
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: CampaignStates.unarmed,
        },
      });
      await expect(
        access(path.join(session!.root, "campaign")),
      ).rejects.toThrow();
      expect(await readSessionCampaignDigest(session!.root)).toBeNull();

      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });
      await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });

      const afterRecon = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(afterRecon.isError).not.toBe(true);
      const sc = afterRecon.structuredContent as Record<string, unknown>;
      expect(sc).toMatchObject({
        ok: true,
        refused: false,
        op: "status",
        hasCampaign: true,
        state: { state: CampaignStates.recon },
        goalContract: { goal: VALID_OPEN_INPUT.goal },
        recon: {
          schema: CAMPAIGN_SCHEMA_IDS.recon,
        },
      });

      const sharedDigest = await readSessionCampaignDigest(session!.root);
      expect(sharedDigest).toEqual(sc.digest);
    });
  });

  describe("6. Standing dose & Authority regression", () => {
    it("measureCampaignToolStandingDose() matches live MCP listTools() definition and reports exact chars4 tokens", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      const tools = await client.listTools();
      const campaignTool = tools.tools.find(
        (t) => t.name === CAMPAIGN_TOOL_NAME,
      );
      expect(campaignTool).toBeDefined();

      expect(getCampaignToolInputJsonSchema()).toEqual(
        campaignTool!.inputSchema,
      );

      const dose = measureCampaignToolStandingDose();
      const liveDefJson = JSON.stringify({
        name: campaignTool!.name,
        description: campaignTool!.description,
        inputSchema: campaignTool!.inputSchema,
      });
      expect(dose.definitionJson).toBe(liveDefJson);
      expect(dose.standingTokens).toBe(tokenize(liveDefJson, "chars4"));
      expect(dose.standingTokens).toBe(418);
    });

    it("passes authorityHits() across tool description, schema, all CampaignStates digests, and recon outputs", async () => {
      expect(authorityHits(CAMPAIGN_TOOL_DESCRIPTION)).toEqual([]);
      expect(
        authorityHits(JSON.stringify(getCampaignToolInputJsonSchema())),
      ).toEqual([]);

      const base = initialCampaignState();
      for (const stateName of Object.values(CampaignStates)) {
        const digest = buildCampaignDigest(base, {
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: stateName,
          effective: base.steering.rung,
        });
        expect(authorityHits(digest.text), `digest for ${stateName}`).toEqual(
          [],
        );
      }

      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });
      const reconCall = await client.callTool({
        name: "campaign",
        arguments: {
          op: "recon",
          gaps: ["automated testing", "missing-gap"],
        },
      });
      const sc = reconCall.structuredContent as unknown as CampaignReconResult;
      if (!sc.ok) throw new Error("Expected recon to succeed");

      for (const finding of sc.recon.findings) {
        expect(authorityHits(finding)).toEqual([]);
      }
      for (const gap of sc.recon.gaps) {
        if (gap.refusal) {
          expect(authorityHits(gap.refusal.note)).toEqual([]);
        }
        for (const candidate of gap.candidates) {
          expect(authorityHits(candidate.card)).toEqual([]);
        }
      }
    });

    it("never contains the word 'ratify' anywhere in packages/skill-summon/src/campaign/", async () => {
      const campaignSrcDir = path.join(
        REPO_ROOT,
        "packages/skill-summon/src/campaign",
      );
      async function collectTsFiles(dir: string): Promise<string[]> {
        const entries = await readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await collectTsFiles(full)));
          } else if (entry.name.endsWith(".ts")) {
            files.push(full);
          }
        }
        return files;
      }

      const files = await collectTsFiles(campaignSrcDir);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const content = await readFile(file, "utf8");
        expect(content.toLowerCase(), file).not.toContain("ratify");
      }
    });
  });
});
