import { access, chmod, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  formatCampaignEvidenceLine,
  initialCampaignState,
  isValidCharterForRecon,
  parseCampaignEvidenceLines,
  tokenize,
} from "skill-zero";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAMPAIGN_GOAL_STAGE_FILE,
  CAMPAIGN_RECON_STAGE_FILE,
  computeGoalContractSha256,
  parseCampaignGoalContract,
} from "../src/campaign/store.js";

import {
  buildCampaignDigest,
  CAMPAIGN_TOOL_DESCRIPTION,
  CAMPAIGN_TOOL_NAME,
  CampaignStore,
  createSkillSummonMcpServer,
  executeCampaignTool,
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

  describe("7. U1 repair verification (Findings 1-6)", () => {
    it("Finding 1 & 3: atomic open and recon leave trace untouched on artifact write failure and allow subsequent retry", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const campaignDir = path.join(session!.root, "campaign");
      await mkdir(campaignDir);
      await chmod(campaignDir, 0o500);

      try {
        const failedOpen = await client.callTool({
          name: "campaign",
          arguments: VALID_OPEN_INPUT,
        });
        expect(failedOpen.isError).toBe(true);
        expect(
          (failedOpen.structuredContent as Record<string, unknown>).error,
        ).toMatchObject({ code: "invalid-goal-artifact" });
        expect(
          (failedOpen.structuredContent as Record<string, unknown>).state,
        ).toMatchObject({ state: CampaignStates.unarmed });
        await expect(
          access(path.join(campaignDir, "trace.jsonl")),
        ).rejects.toThrow();
      } finally {
        await chmod(campaignDir, 0o700);
      }

      const retryOpen = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });
      expect(retryOpen.isError).not.toBe(true);
      expect(
        (retryOpen.structuredContent as Record<string, unknown>).state,
      ).toMatchObject({ state: CampaignStates.recon });

      const reconPath = path.join(campaignDir, "recon.json");
      await mkdir(reconPath);
      const failedRecon = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(failedRecon.isError).toBe(true);
      expect(
        (failedRecon.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({ code: "invalid-recon-artifact" });

      const storeAfterFailedRecon = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(storeAfterFailedRecon.state.state).toBe(CampaignStates.recon);
      expect(storeAfterFailedRecon.trace).toHaveLength(1);

      await rm(reconPath, { recursive: true, force: true });
      const retryRecon = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(retryRecon.isError).not.toBe(true);
      const storeAfterRetry = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(storeAfterRetry.trace).toHaveLength(2);
    });

    it("Finding 1 & 2: incomplete open (deleted goal.json) fails closed into FAILED_SAFE across load, status, open, and recon", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const storeBefore = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      await rm(storeBefore.goalPath, { force: true });

      const loaded = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loaded.corrupted).toBe(true);
      expect(loaded.state.state).toBe(CampaignStates.failedSafe);

      for (const args of [
        { op: "status" },
        VALID_OPEN_INPUT,
        { op: "recon", gaps: ["automated testing"] },
      ]) {
        const res = await client.callTool({ name: "campaign", arguments: args });
        expect(res.isError).toBe(true);
        const sc = res.structuredContent as Record<string, unknown>;
        expect(sc.error).toMatchObject({ code: "campaign-corrupted" });
        expect(sc.state).toMatchObject({ state: CampaignStates.failedSafe });
      }
    });

    it("Finding 2: tampering with goal.json or recon.json fails closed into FAILED_SAFE", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });
      await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });

      // Tamper with recon.json candidate card
      const reconRaw = JSON.parse(await readFile(store.reconPath, "utf8")) as {
        reconId: string;
        gaps: Array<{ candidates: Array<{ name: string }> }>;
        records: Record<string, { gaps: Array<{ candidates: Array<{ name: string }> }> }>;
      };
      const originalReconText = await readFile(store.reconPath, "utf8");
      reconRaw.gaps[0]!.candidates[0]!.name = "Tampered Name";
      reconRaw.records[reconRaw.reconId]!.gaps[0]!.candidates[0]!.name = "Tampered Name";
      await writeFile(store.reconPath, `${JSON.stringify(reconRaw, null, 2)}\n`, "utf8");

      const loadedTamperedRecon = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loadedTamperedRecon.corrupted).toBe(true);
      expect(loadedTamperedRecon.state.state).toBe(CampaignStates.failedSafe);
      await expect(readPersistedReconRecord(session!.root)).rejects.toThrow();

      const statusTamperedRecon = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusTamperedRecon.isError).toBe(true);
      expect(
        (statusTamperedRecon.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({ code: "campaign-corrupted" });

      // Restore recon.json, then tamper with goal.json
      await writeFile(store.reconPath, originalReconText, "utf8");
      const goalRaw = JSON.parse(await readFile(store.goalPath, "utf8")) as {
        humanOnlyOperations: string[];
      };
      goalRaw.humanOnlyOperations = [];
      goalRaw.humanOnlyOperations.push("tampered-op");
      await writeFile(store.goalPath, `${JSON.stringify(goalRaw, null, 2)}\n`, "utf8");

      const loadedTamperedGoal = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loadedTamperedGoal.corrupted).toBe(true);
      expect(loadedTamperedGoal.state.state).toBe(CampaignStates.failedSafe);

      const statusTamperedGoal = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusTamperedGoal.isError).toBe(true);
      expect(
        (statusTamperedGoal.structuredContent as Record<string, unknown>).error,
      ).toMatchObject({ code: "campaign-corrupted" });
    });

    it("Finding 4: multiple recon calls preserve all recon records by ID and retain earlier citations", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const r1 = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      const sc1 = r1.structuredContent as unknown as CampaignReconResult;
      if (!sc1.ok) throw new Error("Expected recon 1 to succeed");
      expect(sc1.recon.reconId).toBe("recon-1");

      const r2 = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["code review"] },
      });
      const sc2 = r2.structuredContent as unknown as CampaignReconResult;
      if (!sc2.ok) throw new Error("Expected recon 2 to succeed");
      expect(sc2.recon.reconId).toBe("recon-2");

      const persisted1 = await readPersistedReconRecord(session!.root, "recon-1");
      const persisted2 = await readPersistedReconRecord(session!.root, "recon-2");
      const persistedLatest = await readPersistedReconRecord(session!.root);

      expect(persisted1?.reconId).toBe("recon-1");
      expect(persisted1?.gaps[0]?.candidates.length).toBeGreaterThan(0);
      expect(persisted2?.reconId).toBe("recon-2");
      expect(persisted2?.gaps[0]?.candidates[0]?.id).toBe("example/reviewer");
      expect(persistedLatest?.reconId).toBe("recon-2");
      expect(persistedLatest?.records?.["recon-1"]).toBeDefined();
      expect(persistedLatest?.records?.["recon-2"]).toBeDefined();

      // Earlier citations remain in state.recon so a charter citing recon-1 passes isValidCharterForRecon
      const firstCardRef = persisted1!.gaps[0]!.candidates[0]!.cardRef;
      const firstSkillId = persisted1!.gaps[0]!.candidates[0]!.id;
      expect(sc2.state.recon?.citations).toContain(firstCardRef);
      expect(sc2.state.recon?.citations).toContain(firstSkillId);
      expect(
        isValidCharterForRecon(
          sc2.state.recon,
          {
            schema: CAMPAIGN_SCHEMA_IDS.charter,
            revision: 1,
            goal: VALID_OPEN_INPUT.goal,
            allowedSkills: [firstSkillId],
            queue: [
              {
                id: "wu-1",
                skill: firstSkillId,
                reconCitation: firstCardRef,
              },
            ],
            recoverLimit: 1,
            reopenLimit: 1,
            sessionRetention: 1,
            clauses: ["clause-1"],
          },
          1,
        ),
      ).toBe(true);
    });

    it("Finding 5: zeroCut=all and error fallback report actual state or UNAVAILABLE, never fabricated UNARMED", async () => {
      const normalClient = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await normalClient.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });

      const zeroCutClient = await connectServer({
        service: makeService(),
        zeroCut: "all",
        enableCampaignTool: true,
      });
      const zeroCutCall = await zeroCutClient.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(zeroCutCall.isError).toBe(true);
      const zeroCutSc = zeroCutCall.structuredContent as Record<string, unknown>;
      expect(zeroCutSc.state).toMatchObject({ state: CampaignStates.recon });
      expect(zeroCutSc.digest).toMatchObject({ state: CampaignStates.recon });

      // Broken/unreadable session root -> state=null and digest.state="UNAVAILABLE"
      const brokenResult = await executeCampaignTool(
        {
          service: makeService(),
          getSession: async () => {
            throw new Error("Session root unavailable");
          },
          zeroCut: "all",
        },
        { op: "recon", gaps: ["automated testing"] },
      );
      expect(brokenResult.isError).toBe(true);
      expect(brokenResult.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: null,
        status: null,
        digest: {
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: "UNAVAILABLE",
        },
      });

      const catchResult = await executeCampaignTool(
        {
          service: makeService(),
          getSession: async () => {
            throw new Error("Session exploded");
          },
        },
        { op: "status" },
      );
      expect(catchResult.isError).toBe(true);
      expect(catchResult.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: null,
        status: null,
        digest: {
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: "UNAVAILABLE",
        },
        error: {
          code: "campaign-tool-error",
        },
      });
    });

    it("Finding 6: malformed MCP calls return structured refusal + digest while preserving 418-token standing dose", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const malformedPayloads: Array<Record<string, unknown>> = [
        {},
        { op: 123 },
        { op: "recon", gaps: 123 },
        { op: "open", goal: 123, workUniverse: "not-array" },
      ];

      for (const payload of malformedPayloads) {
        const res = await client.callTool({
          name: "campaign",
          arguments: payload,
        });
        expect(res.isError).toBe(true);
        const sc = res.structuredContent as Record<string, unknown>;
        expect(sc.ok).toBe(false);
        expect(sc.refused).toBe(true);
        expect(sc.digest).toMatchObject({
          schema: CAMPAIGN_SCHEMA_IDS.status,
          state: CampaignStates.unarmed,
        });
      }

      const tools = await client.listTools();
      const campaignTool = tools.tools.find(
        (t) => t.name === CAMPAIGN_TOOL_NAME,
      );
      expect(campaignTool).toBeDefined();
      expect(getCampaignToolInputJsonSchema()).toEqual(
        campaignTool!.inputSchema,
      );
      expect(measureCampaignToolStandingDose().standingTokens).toBe(418);
    });
  });

  describe("8. Round 2 review repair verification (U1-2958995 Findings 1-4)", () => {
    it("Finding 1: coordinated tampering of goal.json and evidence.jsonl artifactSha256 fails closed via trace.jsonl goalSha256", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });

      const goalOnDisk = JSON.parse(
        await readFile(store.goalPath, "utf8"),
      ) as Record<string, unknown>;
      const tamperedGoal = parseCampaignGoalContract({
        ...goalOnDisk,
        humanOnlyOperations: ["tampered-bypass"],
      });
      if (!tamperedGoal) throw new Error("Expected valid tampered goal shape");
      await writeFile(
        store.goalPath,
        `${JSON.stringify(tamperedGoal, null, 2)}\n`,
        "utf8",
      );

      const evRaw = await readFile(store.evidencePath, "utf8");
      const parsedEv = parseCampaignEvidenceLines(evRaw);
      if (!parsedEv.ok) throw new Error("Expected valid evidence lines");
      const updatedEv = parsedEv.lines.map((line, idx) =>
        idx === 0
          ? {
              ...line,
              artifactSha256: computeGoalContractSha256(tamperedGoal),
            }
          : line,
      );
      await writeFile(
        store.evidencePath,
        `${updatedEv.map((l) => formatCampaignEvidenceLine(l)).join("\n")}\n`,
        "utf8",
      );

      const loaded = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loaded.corrupted).toBe(true);
      expect(loaded.state.state).toBe(CampaignStates.failedSafe);

      const statusRes = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusRes.isError).toBe(true);
      expect(statusRes.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: { state: CampaignStates.failedSafe },
        digest: { state: CampaignStates.failedSafe },
        error: { code: "campaign-corrupted" },
      });
    });

    it("Finding 2: deleting both goal.json and evidence.jsonl fails closed into FAILED_SAFE across load and status", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      await rm(store.goalPath, { force: true });
      await rm(store.evidencePath, { force: true });

      const loaded = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loaded.corrupted).toBe(true);
      expect(loaded.state.state).toBe(CampaignStates.failedSafe);

      const statusRes = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusRes.isError).toBe(true);
      expect(statusRes.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: { state: CampaignStates.failedSafe },
        digest: { state: CampaignStates.failedSafe },
        error: { code: "campaign-corrupted" },
      });
    });

    it("Finding 3: two-phase staging recovers from pre-trace and post-trace interruption boundaries", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      const campaignDir = path.join(session!.root, "campaign");
      const goalStagePath = path.join(campaignDir, CAMPAIGN_GOAL_STAGE_FILE);
      const reconStagePath = path.join(campaignDir, CAMPAIGN_RECON_STAGE_FILE);

      // Boundary A: interrupted open after .goal.stage.json is staged, before trace.jsonl exists
      await mkdir(campaignDir, { recursive: true });
      await writeFile(
        goalStagePath,
        `${JSON.stringify(VALID_OPEN_INPUT, null, 2)}\n`,
        "utf8",
      );
      const afterBoundaryA = await CampaignStore.load(session!.root);
      expect(afterBoundaryA.corrupted).toBe(false);
      expect(afterBoundaryA.hasTrace).toBe(false);
      expect(afterBoundaryA.state.state).toBe(CampaignStates.unarmed);
      await expect(access(goalStagePath)).rejects.toThrow();

      // Retry open succeeds
      const openRes = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });
      expect(openRes.isError).not.toBe(true);

      // Run recon-1
      const recon1Res = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(recon1Res.isError).not.toBe(true);

      // Boundary B: interrupted recon-2 after .recon.stage.json is staged, before trace.jsonl append
      const storeAfterR1 = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      const recon1Raw = JSON.parse(
        await readFile(storeAfterR1.reconPath, "utf8"),
      ) as Record<string, unknown>;
      const uncommittedRecon2 = {
        ...recon1Raw,
        reconId: "recon-2",
        records: {
          ...(recon1Raw.records as Record<string, unknown>),
          "recon-2": {
            schema: CAMPAIGN_SCHEMA_IDS.recon,
            reconId: "recon-2",
            gaps: [],
            findings: ["uncommitted"],
            citations: ["uncommitted"],
          },
        },
      };
      await writeFile(
        reconStagePath,
        `${JSON.stringify(uncommittedRecon2, null, 2)}\n`,
        "utf8",
      );

      const afterBoundaryB = await CampaignStore.load(session!.root);
      expect(afterBoundaryB.corrupted).toBe(false);
      expect(afterBoundaryB.state.state).toBe(CampaignStates.recon);
      expect(afterBoundaryB.trace).toHaveLength(2);
      await expect(access(reconStagePath)).rejects.toThrow();
      const preservedR1 = await readPersistedReconRecord(session!.root, "recon-1");
      expect(preservedR1?.reconId).toBe("recon-1");

      // Retry recon-2 succeeds
      const recon2Res = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["code review"] },
      });
      expect(recon2Res.isError).not.toBe(true);

      // Boundary C: interrupted after trace.jsonl + evidence.jsonl committed, before stage promotion
      await rename(storeAfterR1.goalPath, goalStagePath);
      await rename(storeAfterR1.reconPath, reconStagePath);

      const afterBoundaryC = await CampaignStore.load(session!.root);
      expect(afterBoundaryC.corrupted).toBe(false);
      expect(afterBoundaryC.state.state).toBe(CampaignStates.recon);
      await expect(access(storeAfterR1.goalPath)).resolves.toBeUndefined();
      await expect(access(storeAfterR1.reconPath)).resolves.toBeUndefined();
      await expect(access(goalStagePath)).rejects.toThrow();
      await expect(access(reconStagePath)).rejects.toThrow();
      const recoveredR2 = await readPersistedReconRecord(session!.root, "recon-2");
      expect(recoveredR2?.reconId).toBe("recon-2");
    });

    it("Finding 4: tampering with citations in recon.json fails closed into FAILED_SAFE", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });
      await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      const reconRaw = JSON.parse(await readFile(store.reconPath, "utf8")) as {
        reconId: string;
        citations: string[];
        records: Record<string, { citations: string[] }>;
      };
      reconRaw.citations = [...reconRaw.citations, "forged:citation"];
      reconRaw.records[reconRaw.reconId]!.citations = [...reconRaw.citations];
      await writeFile(
        store.reconPath,
        `${JSON.stringify(reconRaw, null, 2)}\n`,
        "utf8",
      );

      const loaded = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loaded.corrupted).toBe(true);
      expect(loaded.state.state).toBe(CampaignStates.failedSafe);
      await expect(readPersistedReconRecord(session!.root)).rejects.toThrow();

      const statusRes = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusRes.isError).toBe(true);
      expect(statusRes.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: { state: CampaignStates.failedSafe },
        digest: { state: CampaignStates.failedSafe },
        error: { code: "campaign-corrupted" },
      });
    });
  });

  describe("9. Round 3 review repair verification (U1-868c6df Findings 1-2)", () => {
    it("Finding 1: recovers interruption immediately after trace.jsonl append (before evidence.jsonl append) for both open and subsequent recon", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });

      const openRes = await client.callTool({
        name: "campaign",
        arguments: VALID_OPEN_INPUT,
      });
      expect(openRes.isError).not.toBe(true);

      const storeAfterOpen = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      const goalStagePath = storeAfterOpen.goalStagePath;
      const reconStagePath = storeAfterOpen.reconStagePath;

      // Simulate open interrupted right after trace.jsonl append (before evidence.jsonl and before goalStage promotion)
      await rename(storeAfterOpen.goalPath, goalStagePath);
      await rm(storeAfterOpen.evidencePath, { force: true });

      const recoveredOpenStore = await CampaignStore.load(session!.root);
      expect(recoveredOpenStore.corrupted).toBe(false);
      expect(recoveredOpenStore.state.state).toBe(CampaignStates.recon);
      await expect(access(storeAfterOpen.goalPath)).resolves.toBeUndefined();
      await expect(access(storeAfterOpen.evidencePath)).resolves.toBeUndefined();
      await expect(access(goalStagePath)).rejects.toThrow();

      // Subsequent recon #1 succeeds after recovering open's evidence + goal stage
      const recon1Res = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(recon1Res.isError).not.toBe(true);
      const recon1Snapshot = await readFile(storeAfterOpen.reconPath, "utf8");

      // Execute recon #2, then rewind to the exact boundary right after trace.jsonl append
      // (trace has 3 lines, evidence has 2 lines, recon.json still has recon-1, .recon.stage.json has recon-1 + recon-2)
      const recon2Res = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["code review"] },
      });
      expect(recon2Res.isError).not.toBe(true);

      await rename(storeAfterOpen.reconPath, reconStagePath);
      await writeFile(storeAfterOpen.reconPath, recon1Snapshot, "utf8");
      const evLines = (
        await readFile(storeAfterOpen.evidencePath, "utf8")
      )
        .trim()
        .split("\n");
      expect(evLines).toHaveLength(3);
      await writeFile(
        storeAfterOpen.evidencePath,
        `${evLines.slice(0, 2).join("\n")}\n`,
        "utf8",
      );

      const recoveredReconStore = await CampaignStore.load(session!.root);
      expect(recoveredReconStore.corrupted).toBe(false);
      expect(recoveredReconStore.state.state).toBe(CampaignStates.recon);
      expect(recoveredReconStore.trace).toHaveLength(3);
      await expect(access(reconStagePath)).rejects.toThrow();

      const recoveredEvLines = (
        await readFile(storeAfterOpen.evidencePath, "utf8")
      )
        .trim()
        .split("\n");
      expect(recoveredEvLines).toHaveLength(3);

      const latestRecon = await readPersistedReconRecord(session!.root);
      expect(latestRecon?.reconId).toBe("recon-2");
      expect(latestRecon?.records?.["recon-1"]).toBeDefined();
      expect(latestRecon?.records?.["recon-2"]).toBeDefined();

      // Subsequent recon #3 succeeds cleanly
      const recon3Res = await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      expect(recon3Res.isError).not.toBe(true);
      const latestAfterR3 = await readPersistedReconRecord(session!.root);
      expect(latestAfterR3?.reconId).toBe("recon-3");
    });

    it("Finding 2: coordinated evidence.jsonl deletion and top-level recon.json rollback to an older record fails closed into FAILED_SAFE", async () => {
      const client = await connectServer({
        service: makeService(),
        enableCampaignTool: true,
      });
      await client.callTool({ name: "campaign", arguments: VALID_OPEN_INPUT });
      await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["automated testing"] },
      });
      await client.callTool({
        name: "campaign",
        arguments: { op: "recon", gaps: ["code review"] },
      });

      const store = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });

      const reconEnvelope = JSON.parse(
        await readFile(store.reconPath, "utf8"),
      ) as {
        schema: string;
        reconId: string;
        gaps: unknown[];
        findings: string[];
        citations: string[];
        records: Record<
          string,
          {
            schema: string;
            reconId: string;
            gaps: unknown[];
            findings: string[];
            citations: string[];
          }
        >;
      };
      const olderRecord = reconEnvelope.records["recon-1"]!;
      expect(olderRecord).toBeDefined();
      expect(reconEnvelope.records["recon-2"]).toBeDefined();

      const rolledBackEnvelope = {
        schema: reconEnvelope.schema,
        reconId: olderRecord.reconId,
        gaps: olderRecord.gaps,
        findings: olderRecord.findings,
        citations: olderRecord.citations,
        records: reconEnvelope.records,
      };

      await rm(store.evidencePath, { force: true });
      await writeFile(
        store.reconPath,
        `${JSON.stringify(rolledBackEnvelope, null, 2)}\n`,
        "utf8",
      );

      const loaded = await CampaignStore.load(session!.root, {
        refreshStatus: false,
      });
      expect(loaded.corrupted).toBe(true);
      expect(loaded.state.state).toBe(CampaignStates.failedSafe);
      await expect(readPersistedReconRecord(session!.root)).rejects.toThrow();

      const statusRes = await client.callTool({
        name: "campaign",
        arguments: { op: "status" },
      });
      expect(statusRes.isError).toBe(true);
      expect(statusRes.structuredContent).toMatchObject({
        ok: false,
        refused: true,
        state: { state: CampaignStates.failedSafe },
        digest: { state: CampaignStates.failedSafe },
        error: { code: "campaign-corrupted" },
      });
    });
  });
});
