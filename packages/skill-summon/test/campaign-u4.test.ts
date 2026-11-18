import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignDecisions,
  CampaignStates,
  ElicitationActions,
  MULTIPLEXER_ENV_VARS,
  OperatorDecisionChoices,
  OperatorVerbs,
  ReceiptStatuses,
  UnitReportOutcomes,
  WorkUnitStates,
  buildWorkUnitQueue,
  campaignSha256Hex,
  canonicalCampaignJson,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  formatVerifyReceiptLine,
  selectNextWorkUnit,
  type CampaignCharter,
} from "skill-zero";

import {
  CAMPAIGN_DIR_NAME,
  CAMPAIGN_EVIDENCE_FILE,
  CAMPAIGN_RECEIPTS_FILE,
  CAMPAIGN_UNITS_FILE,
  CampaignStore,
  GaiaService,
  InMemoryGaiaRegistrySource,
  createSkillSummonMcpServer,
  executeCampaignTool,
  executeCheckpoint,
  executeNext,
  executeOpen,
  executeOperatorDecide,
  executePropose,
  executeRecon,
  executeReport,
  executeStatus,
  measureCampaignToolStandingDose,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import {
  CAMPAIGN_RECEIPTS_STAGE_FILE,
  CAMPAIGN_TRACE_FILE,
  CAMPAIGN_TX_STAGE_FILE,
  CAMPAIGN_UNITS_STAGE_FILE,
} from "../src/campaign/store.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import { authorityHits } from "../../../plugins/skill-heaven/scripts/render-ladder.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function makeDocuments(): GaiaRegistryDocuments {
  return {
    generic: {
      generatedAt: "2026-11-15T00:00:00.000Z",
      skills: [
        {
          id: "security-audit",
          name: "Security Audit",
          type: "basic",
          description: "Audit code for security vulnerabilities and injection.",
          prerequisites: [],
          derivatives: [],
          evidence: [],
          status: "active",
        },
        {
          id: "typecheck-guard",
          name: "Typecheck Guard",
          type: "basic",
          description: "Verify TypeScript compilation and static invariants.",
          prerequisites: [],
          derivatives: [],
          evidence: [],
          status: "active",
        },
      ],
    },
    named: {
      generatedAt: "2026-11-15",
      buckets: {
        "security-audit": [
          {
            id: "audit/security-review",
            name: "Security Review",
            contributor: "audit",
            genericSkillRef: "security-audit",
            status: "named",
            description: "Audit code for security vulnerabilities and injection.",
            catalogRef: "audit-security-review",
            tags: ["security", "audit", "review"],
            links: {
              github:
                "https://github.com/gaia-research/skill-security/blob/main/SKILL.md",
            },
            evidence: [],
            invocation: "model",
          },
        ],
        "typecheck-guard": [
          {
            id: "qa/typecheck-guard",
            name: "Typecheck Guard",
            contributor: "qa",
            genericSkillRef: "typecheck-guard",
            status: "named",
            description: "Verify TypeScript compilation and static invariants.",
            catalogRef: "qa-typecheck-guard",
            tags: ["typescript", "verify", "guard"],
            links: {
              github:
                "https://github.com/gaia-research/skill-qa/blob/main/SKILL.md",
            },
            evidence: [],
            invocation: "model",
          },
        ],
      },
    },
  };
}

function makeService() {
  return new GaiaService(new InMemoryGaiaRegistrySource(makeDocuments()), {
    now: () => new Date("2026-11-16T12:00:00Z"),
  });
}

const VALID_GOAL_CONTRACT = {
  goal: "Execute U4 work units with attested receipts and steering isolation",
  workUniverse: ["packages/core/src/campaign", "packages/skill-summon/src/campaign"],
  repositories: ["gaia-research/gaia-skill-heaven"],
  acceptanceCommands: ["npm run typecheck", "npm test"],
  humanOnlyOperations: ["merge", "release"],
  stopConditions: ["any failed verification check"],
};

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of MULTIPLEXER_ENV_VARS) {
    env[key] = undefined;
  }
  return env;
}

function walkFiles(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") {
        continue;
      }
      out.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("U4 store persistence, next/report/checkpoint ops, and steering wiring", () => {
  let session: SummonSession;
  let savedSummonSession: string | undefined;
  const closeCallbacks: Array<() => Promise<void>> = [];

  beforeEach(async () => {
    savedSummonSession = process.env.SKILL_SUMMON_SESSION;
    session = await openSession();
    process.env.SKILL_SUMMON_SESSION = session.root;
  });

  afterEach(async () => {
    if (savedSummonSession === undefined) {
      delete process.env.SKILL_SUMMON_SESSION;
    } else {
      process.env.SKILL_SUMMON_SESSION = savedSummonSession;
    }
    while (closeCallbacks.length > 0) {
      const fn = closeCallbacks.pop()!;
      await fn().catch(() => {});
    }
    await rm(session.root, { recursive: true, force: true });
  });

  async function setupApprovedCampaign(options?: {
    recoverLimit?: number;
    reopenLimit?: number;
  }) {
    const service = makeService();
    const env = cleanEnv();
    const opened = await executeOpen(session, VALID_GOAL_CONTRACT);
    expect(opened.ok).toBe(true);

    const recon = await executeRecon(service, session, {
      gaps: ["security audit", "typescript verify"],
    });
    expect(recon.ok).toBe(true);
    if (!recon.ok) throw new Error("recon failed");

    const cardRefs = recon.recon.gaps.map((g) => g.candidates[0]!.cardRef);
    const proposed = await executePropose(
      session,
      {
        reconId: recon.recon.reconId,
        arsenal: cardRefs,
        phases: ["phase-1", "phase-2"],
        recoverLimit: options?.recoverLimit ?? 1,
        reopenLimit: options?.reopenLimit ?? 1,
        sessionRetention: 3,
      },
      { env },
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error("propose failed");

    const decided = await executeOperatorDecide(session, {
      elicit: async () => ({
        action: ElicitationActions.accept,
        content: { decision: OperatorDecisionChoices.approve },
      }),
      env,
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) throw new Error("decide failed");
    return { service, env, recon, proposed, decided };
  }

  async function setupCharterWithAcceptanceCommands(bounds: {
    recoverLimit: number;
    reopenLimit: number;
  }) {
    const service = makeService();
    const env = cleanEnv();
    await executeOpen(session, VALID_GOAL_CONTRACT);
    const recon = await executeRecon(service, session, {
      gaps: ["security audit", "typescript verify"],
    });
    if (!recon.ok) throw new Error("recon failed");

    const store = await CampaignStore.load(session.root);
    const opCap = createCampaignOperatorAdapter();

    const charter: CampaignCharter = {
      schema: CAMPAIGN_SCHEMA_IDS.charter,
      revision: 1,
      goal: VALID_GOAL_CONTRACT.goal,
      allowedSkills: ["audit/security-review", "qa/typecheck-guard"],
      queue: [
        {
          id: "u1",
          skill: "audit/security-review",
          reconCitation: recon.recon.citations[0]!,
          phase: "p1",
        },
        {
          id: "u2",
          skill: "qa/typecheck-guard",
          reconCitation: recon.recon.citations[0]!,
          phase: "p2",
          dependsOn: ["u1"],
        },
      ],
      recoverLimit: bounds.recoverLimit,
      reopenLimit: bounds.reopenLimit,
      sessionRetention: 5,
      clauses: ["verify-command"],
      acceptanceCommands: VALID_GOAL_CONTRACT.acceptanceCommands,
    };

    await store.append({
      channel: "agent",
      op: AgentOps.propose,
      charter,
    });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: OperatorVerbs.decide,
        action: "approve",
        charterRevision: 1,
        attribution: "terminal-input, unauthenticated",
        operatorChannel: "mcp-elicitation",
        multiplexed: false,
      }),
    );
    return { recon, charter };
  }

  it("runs full E2E flow: open -> recon -> propose -> decide -> next -> report -> checkpoint", async () => {
    await setupApprovedCampaign();

    const firstNext = await executeNext(session);
    expect(firstNext.ok).toBe(true);
    if (!firstNext.ok) return;
    expect(firstNext.unit).not.toBeNull();
    expect(firstNext.unit!.state).toBe(WorkUnitStates.active);
    expect(firstNext.checkpointWritten).toBe(false);
    expect(authorityHits(firstNext.digest.text)).toEqual([]);

    const unitId = firstNext.unit!.id;

    // Unlisted verify command is refused (INV-U15) without modifying unit or trace
    const unlisted = await executeReport(session, {
      unitId,
      outcome: UnitReportOutcomes.pass,
      command: "rm -rf /tmp/evil",
      output: "ok",
    });
    expect(unlisted.ok).toBe(false);
    expect(unlisted.refused).toBe(true);
    if (!unlisted.ok) {
      expect(unlisted.error.code).toBe("unlisted-verify-command");
    }

    // Passing report with charter-named command
    const passed = await executeReport(session, {
      unitId,
      outcome: UnitReportOutcomes.pass,
      command: "npm run typecheck",
      output: "typecheck clean",
    });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.decision).toBe(CampaignDecisions.close);
    expect(passed.unit?.state).toBe(WorkUnitStates.done);
    expect(passed.receipt?.status).toBe(ReceiptStatuses.attested);
    expect(authorityHits(passed.digest.text)).toEqual([]);

    // Receipt text never claims work is good
    const store = await CampaignStore.load(session.root);
    const receipts = await store.loadReceipts();
    expect(receipts).toHaveLength(1);
    expect(JSON.stringify(receipts[0])).not.toMatch(/\bgood\b|\bsucceeded\b/i);

    // Checkpoint writes a CHECKPOINT entry in trace.jsonl
    const cp = await executeCheckpoint(session);
    expect(cp.ok).toBe(true);
    if (!cp.ok) return;
    expect(cp.checkpointWritten).toBe(true);
    expect(cp.entry?.decision).toBe(CampaignDecisions.checkpoint);
    expect(cp.entry?.signal).toBe("checkpoint-request");
    expect(authorityHits(cp.digest.text)).toEqual([]);
  });

  it("enforces recover -> reopen -> convergence at charter bounds (0/0, 0/2, 2/0)", async () => {
    // 0/0 bounds: immediate convergence on first failure
    {
      const s0 = await openSession();
      try {
        const origRoot = session;
        session = s0;
        await setupCharterWithAcceptanceCommands({ recoverLimit: 0, reopenLimit: 0 });
        const n = await executeNext(s0);
        expect(n.ok && n.unit?.id).toBe("u1");
        const r = await executeReport(s0, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "fail 1",
          exitCode: 1,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.decision).toBe(CampaignDecisions.convergence);
          expect(r.unit?.state).toBe(WorkUnitStates.needsHuman);
        }
        session = origRoot;
      } finally {
        await rm(s0.root, { recursive: true, force: true });
      }
    }

    // 0/2 bounds: 0 recovers, 2 reopens, then convergence
    {
      const s02 = await openSession();
      try {
        const origRoot = session;
        session = s02;
        await setupCharterWithAcceptanceCommands({ recoverLimit: 0, reopenLimit: 2 });
        await executeNext(s02);

        const f1 = await executeReport(s02, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f1",
        });
        expect(f1.ok && f1.decision).toBe(CampaignDecisions.reopen);
        await executeReport(s02, { unitId: "u1", outcome: UnitReportOutcomes.resume });

        const f2 = await executeReport(s02, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f2",
        });
        expect(f2.ok && f2.decision).toBe(CampaignDecisions.reopen);
        await executeReport(s02, { unitId: "u1", outcome: UnitReportOutcomes.resume });

        const f3 = await executeReport(s02, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f3",
        });
        expect(f3.ok && f3.decision).toBe(CampaignDecisions.convergence);
        if (f3.ok) expect(f3.unit?.state).toBe(WorkUnitStates.needsHuman);
        session = origRoot;
      } finally {
        await rm(s02.root, { recursive: true, force: true });
      }
    }

    // 2/0 bounds: 2 recovers, 0 reopens, then convergence
    {
      const s20 = await openSession();
      try {
        const origRoot = session;
        session = s20;
        await setupCharterWithAcceptanceCommands({ recoverLimit: 2, reopenLimit: 0 });
        await executeNext(s20);

        const f1 = await executeReport(s20, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f1",
        });
        expect(f1.ok && f1.decision).toBe(CampaignDecisions.recover);
        await executeReport(s20, { unitId: "u1", outcome: UnitReportOutcomes.resume });

        const f2 = await executeReport(s20, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f2",
        });
        expect(f2.ok && f2.decision).toBe(CampaignDecisions.recover);
        await executeReport(s20, { unitId: "u1", outcome: UnitReportOutcomes.resume });

        const f3 = await executeReport(s20, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "f3",
        });
        expect(f3.ok && f3.decision).toBe(CampaignDecisions.convergence);
        if (f3.ok) expect(f3.unit?.state).toBe(WorkUnitStates.needsHuman);
        session = origRoot;
      } finally {
        await rm(s20.root, { recursive: true, force: true });
      }
    }
  });

  it("blocked unit does not stop independent units (PR-9) and respects dependency -> phase -> tie-break order", async () => {
    const service = makeService();
    const env = cleanEnv();
    await executeOpen(session, VALID_GOAL_CONTRACT);
    const recon = await executeRecon(service, session, {
      gaps: ["security audit", "typescript verify"],
    });
    if (!recon.ok) throw new Error("recon failed");

    const store = await CampaignStore.load(session.root);
    const opCap = createCampaignOperatorAdapter();

    const charter: CampaignCharter = {
      schema: CAMPAIGN_SCHEMA_IDS.charter,
      revision: 1,
      goal: VALID_GOAL_CONTRACT.goal,
      allowedSkills: ["audit/security-review", "qa/typecheck-guard"],
      queue: [
        {
          id: "dep-child",
          skill: "qa/typecheck-guard",
          reconCitation: recon.recon.citations[0]!,
          phase: "p1",
          dependsOn: ["u-a"],
        },
        {
          id: "u-b",
          skill: "qa/typecheck-guard",
          reconCitation: recon.recon.citations[0]!,
          phase: "p2",
        },
        {
          id: "u-a",
          skill: "audit/security-review",
          reconCitation: recon.recon.citations[0]!,
          phase: "p1",
        },
      ],
      recoverLimit: 1,
      reopenLimit: 1,
      sessionRetention: 5,
      clauses: ["verify-command"],
      acceptanceCommands: VALID_GOAL_CONTRACT.acceptanceCommands,
    };

    await store.append({
      channel: "agent",
      op: AgentOps.propose,
      charter,
    });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: OperatorVerbs.decide,
        action: "approve",
        charterRevision: 1,
        attribution: "terminal-input, unauthenticated",
        operatorChannel: "mcp-elicitation",
        multiplexed: false,
      }),
    );

    // First ready unit: u-a (depth 0, phase p1; dep-child has depth 1)
    const n1 = await executeNext(session);
    expect(n1.ok && n1.unit?.id).toBe("u-a");

    // Block u-a
    const blk = await executeReport(session, {
      unitId: "u-a",
      outcome: UnitReportOutcomes.block,
      reason: "Waiting on external fixture",
    });
    expect(blk.ok && blk.unit?.state).toBe(WorkUnitStates.blocked);

    // Independent unit u-b is still selectable while dep-child waits on u-a
    const n2 = await executeNext(session);
    expect(n2.ok && n2.unit?.id).toBe("u-b");
    expect(n2.ok && n2.queueCounts.waitingOnDependencies).toBe(1);
    expect(n2.ok && n2.queueCounts.blocked).toBe(1);

    // Complete u-b
    const passB = await executeReport(session, {
      unitId: "u-b",
      outcome: UnitReportOutcomes.pass,
      command: "npm run typecheck",
      output: "ok",
    });
    expect(passB.ok && passB.unit?.state).toBe(WorkUnitStates.done);
  });

  it("derives working rung from steering via trace/replay and isolates retrieval signals (INV-U3, K4)", async () => {
    await setupCharterWithAcceptanceCommands({ recoverLimit: 3, reopenLimit: 1 });
    await executeNext(session);

    const storeBefore = await CampaignStore.load(session.root);
    const initialRung = storeBefore.state.steering.rung;

    // Retrieval refusal never emits behavioral-failure or raises steering rung
    const refusalRes = await executeReport(session, {
      unitId: "u1",
      outcome: UnitReportOutcomes.retrievalRefusal,
    });
    expect(refusalRes.ok).toBe(true);
    if (refusalRes.ok) {
      expect(refusalRes.decision).toBe(CampaignDecisions.hold);
      expect(refusalRes.steering.rung).toBe(initialRung);
      expect(refusalRes.unit?.retrievalRefusalCount).toBe(1);
      expect(refusalRes.unit?.recoverCount).toBe(0);
    }

    // Forbidden retrieval keys are rejected without touching steering or units
    for (const key of [
      "score",
      "margin",
      "noMatch",
      "matchKind",
      "retrieval",
      "ranking",
      "classified",
      "nameMatchesQuery",
      "filtered",
      "cards",
      "previewed",
    ]) {
      const bad = await executeReport(session, {
        unitId: "u1",
        outcome: UnitReportOutcomes.fail,
        command: "npm test",
        output: "fail",
        [key]: key === "noMatch" ? true : 0.9,
      });
      expect(bad.ok).toBe(false);
      expect(bad.refused).toBe(true);
      if (!bad.ok) {
        expect(bad.error.code).toBe("retrieval-signal-rejected");
      }
    }

    // Behavioral failure drives steering through stepSteering and persists in trace
    const f1 = await executeReport(session, {
      unitId: "u1",
      outcome: UnitReportOutcomes.fail,
      command: "npm test",
      output: "fail 1",
    });
    expect(f1.ok).toBe(true);
    if (f1.ok) {
      expect(f1.entry?.signal).toBe("behavioral-failure");
      expect(f1.steering.rung).not.toBe(initialRung);
    }

    // Replay from disk matches state.steering.rung
    const reloaded = await CampaignStore.load(session.root);
    expect(reloaded.corrupted).toBe(false);
    expect(reloaded.state.steering.rung).toBe(
      f1.ok ? f1.state.steering.rung : initialRung,
    );
  });

  it("regroups without checkpoint before decisions and writes CHECKPOINT after decisions", async () => {
    const service = makeService();
    const env = cleanEnv();
    await executeOpen(session, VALID_GOAL_CONTRACT);
    const recon = await executeRecon(service, session, {
      gaps: ["security audit", "typescript verify"],
    });
    if (!recon.ok) throw new Error("recon failed");

    const cardRefs = recon.recon.gaps.map((g) => g.candidates[0]!.cardRef);
    const proposed = await executePropose(
      session,
      {
        reconId: recon.recon.reconId,
        arsenal: cardRefs,
        recoverLimit: 1,
        reopenLimit: 1,
        sessionRetention: 3,
      },
      { env },
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const unitIds = proposed.state.queue.map((q) => q.id);
    // Pre-decisions regroup via next: no checkpoint written
    const preNext = await executeNext(session, {
      batches: [{ id: "batch-pre", unitIds }],
    });
    expect(preNext.ok).toBe(true);
    if (preNext.ok) {
      expect(preNext.checkpointWritten).toBe(false);
      expect(preNext.unit).toBeNull();
      expect(preNext.queue.batches).toHaveLength(1);
    }
    const storePre = await CampaignStore.load(session.root);
    expect(
      storePre.trace.some((e) => e.decision === CampaignDecisions.checkpoint),
    ).toBe(false);

    // Approve
    await executeOperatorDecide(session, {
      elicit: async () => ({
        action: ElicitationActions.accept,
        content: { decision: OperatorDecisionChoices.approve },
      }),
      env,
    });

    // Post-decisions regroup via next: writes CHECKPOINT entry
    const postNext = await executeNext(session, {
      batches: [{ id: "batch-post", unitIds }],
    });
    expect(postNext.ok).toBe(true);
    if (postNext.ok) {
      expect(postNext.checkpointWritten).toBe(true);
      expect(postNext.checkpointEntry?.decision).toBe(
        CampaignDecisions.checkpoint,
      );
      expect(postNext.unit?.state).toBe(WorkUnitStates.active);
    }
    const storePost = await CampaignStore.load(session.root);
    expect(
      storePost.trace.some((e) => e.decision === CampaignDecisions.checkpoint),
    ).toBe(true);
  });

  it("handles orphan units.json / receipts.jsonl and symlinked artifacts fail-safe", async () => {
    // Orphan units.json without trace.jsonl -> FAILED_SAFE
    const campaignDir = path.join(session.root, CAMPAIGN_DIR_NAME);
    await executeOpen(session, VALID_GOAL_CONTRACT);
    await rm(path.join(campaignDir, "trace.jsonl"));
    await writeFile(path.join(campaignDir, CAMPAIGN_UNITS_FILE), "{}\n", "utf8");
    const orphanStore = await CampaignStore.load(session.root);
    expect(orphanStore.corrupted).toBe(true);
    expect(orphanStore.state.state).toBe(CampaignStates.failedSafe);

    // Symlinked receipts.jsonl -> loadReceipts throws
    const s2 = await openSession();
    try {
      await executeOpen(s2, VALID_GOAL_CONTRACT);
      const s2Dir = path.join(s2.root, CAMPAIGN_DIR_NAME);
      const outside = path.join(s2.root, "outside.jsonl");
      await writeFile(outside, "", "utf8");
      await symlink(outside, path.join(s2Dir, CAMPAIGN_RECEIPTS_FILE));
      const store2 = await CampaignStore.load(s2.root);
      await expect(store2.loadReceipts()).rejects.toThrow();
    } finally {
      await rm(s2.root, { recursive: true, force: true });
    }
  });

  it("wires next, report, and checkpoint through MCP server and passes authority checks", async () => {
    const service = makeService();
    const env = cleanEnv();
    const mcpContext = {
      service,
      getSession: async () => session,
      elicit: async () => ({
        action: ElicitationActions.accept,
        content: { decision: OperatorDecisionChoices.approve },
      }),
      env,
    };

    await executeCampaignTool(mcpContext, {
      op: AgentOps.open,
      ...VALID_GOAL_CONTRACT,
    });
    const reconRes = await executeCampaignTool(mcpContext, {
      op: AgentOps.recon,
      gaps: ["security audit"],
    });
    const reconStructured = reconRes.structuredContent as {
      recon: { reconId: string; gaps: Array<{ candidates: Array<{ cardRef: string }> }> };
    };
    await executeCampaignTool(mcpContext, {
      op: AgentOps.propose,
      reconId: reconStructured.recon.reconId,
      arsenal: [reconStructured.recon.gaps[0]!.candidates[0]!.cardRef],
      recoverLimit: 1,
      reopenLimit: 1,
      sessionRetention: 3,
    });
    await executeCampaignTool(mcpContext, {
      op: OperatorVerbs.decide,
    });

    const server = createSkillSummonMcpServer({
      service,
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "u4-mcp-test", version: "1.0.0" });
    await client.connect(clientTransport);
    closeCallbacks.push(async () => {
      await client.close();
      await server.close();
    });

    const nextRes = await client.callTool({
      name: "campaign",
      arguments: { op: AgentOps.next },
    });
    expect(nextRes.isError).not.toBe(true);
    const nextStructured = nextRes.structuredContent as {
      unit: { id: string } | null;
      digest: { text: string };
    };
    expect(nextStructured.unit).not.toBeNull();
    expect(authorityHits(nextStructured.digest.text)).toEqual([]);

    const reportRes = await client.callTool({
      name: "campaign",
      arguments: {
        op: AgentOps.report,
        unitId: nextStructured.unit!.id,
        outcome: UnitReportOutcomes.pass,
        command: "npm test",
        output: "all good",
      },
    });
    expect(reportRes.isError).not.toBe(true);
    const reportStructured = reportRes.structuredContent as {
      digest: { text: string };
    };
    expect(authorityHits(reportStructured.digest.text)).toEqual([]);

    const cpRes = await client.callTool({
      name: "campaign",
      arguments: { op: OperatorVerbs.checkpoint },
    });
    expect(cpRes.isError).not.toBe(true);
    const cpStructured = cpRes.structuredContent as {
      checkpointWritten: boolean;
      digest: { text: string };
    };
    expect(cpStructured.checkpointWritten).toBe(true);
    expect(authorityHits(cpStructured.digest.text)).toEqual([]);

    // Standing dose check
    expect(measureCampaignToolStandingDose().standingTokens).toBe(1098);

    // Forbidden-word check across U4 source and tests
    const forbiddenWord = ["rat", "ify"].join("");
    const filesToCheck = [
      ...walkFiles(path.join(REPO_ROOT, "packages/skill-summon/src/campaign"), [".ts"]),
      path.join(REPO_ROOT, "packages/skill-summon/test/campaign-u4.test.ts"),
    ];
    for (const file of filesToCheck) {
      const content = readFileSync(file, "utf8");
      expect(content.toLowerCase()).not.toContain(forbiddenWord);
    }
  });

  it("Finding 3: fails closed (FAILED_SAFE) when units.json or receipts.jsonl is deleted or tampered", async () => {
    // 1. Deleting units.json after work started -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        await executeNext(s);
        const unitsPath = path.join(s.root, CAMPAIGN_DIR_NAME, CAMPAIGN_UNITS_FILE);
        expect(existsSync(unitsPath)).toBe(true);
        await rm(unitsPath);

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        expect(reloaded.error).toMatch(/missing/i);
        await expect(reloaded.loadUnitsState()).rejects.toThrow();
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 2. Replacing units.json with modified bounds (recoverLimit: 99) -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign({ recoverLimit: 1, reopenLimit: 1 });
        await executeNext(s);
        const unitsPath = path.join(s.root, CAMPAIGN_DIR_NAME, CAMPAIGN_UNITS_FILE);
        const raw = JSON.parse(await readFile(unitsPath, "utf8")) as Record<string, unknown>;
        const tampered = {
          ...raw,
          bounds: { recoverLimit: 99, reopenLimit: 1 },
        };
        await writeFile(unitsPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 3. Replacing units.json with fake done units -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        await executeNext(s);
        const unitsPath = path.join(s.root, CAMPAIGN_DIR_NAME, CAMPAIGN_UNITS_FILE);
        const raw = JSON.parse(await readFile(unitsPath, "utf8")) as {
          units: Array<Record<string, unknown>>;
        };
        const tampered = {
          ...raw,
          units: raw.units.map((u, idx) =>
            idx === 0 ? { ...u, state: WorkUnitStates.done } : u,
          ),
        };
        await writeFile(unitsPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 4. Deleting or tampering receipts.jsonl after verification -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        const n = await executeNext(s);
        expect(n.ok && n.unit).toBeTruthy();
        await executeReport(s, {
          unitId: n.ok && n.unit ? n.unit.id : "u1",
          outcome: UnitReportOutcomes.pass,
          command: "npm test",
          output: "ok",
        });

        const receiptsPath = path.join(
          s.root,
          CAMPAIGN_DIR_NAME,
          CAMPAIGN_RECEIPTS_FILE,
        );
        const originalReceipts = await readFile(receiptsPath, "utf8");

        // Tamper command in receipts.jsonl
        const parsedLine = JSON.parse(originalReceipts.trim()) as Record<string, unknown>;
        await writeFile(
          receiptsPath,
          `${JSON.stringify({ ...parsedLine, command: "echo tampered" })}\n`,
          "utf8",
        );
        const tamperedStore = await CampaignStore.load(s.root);
        expect(tamperedStore.corrupted).toBe(true);
        expect(tamperedStore.state.state).toBe(CampaignStates.failedSafe);

        // Delete receipts.jsonl
        await rm(receiptsPath);
        const missingStore = await CampaignStore.load(s.root);
        expect(missingStore.corrupted).toBe(true);
        expect(missingStore.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }
  });

  it("Finding 4: reconciles staged units/receipts after interrupted rename, binds checkpoint+units atomically, and fails closed on missing evidence", async () => {
    // 1. Simulate interruption after trace.jsonl + evidence.jsonl append (leaving .units.stage.json and .receipts.stage.jsonl)
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        const n = await executeNext(s);
        expect(n.ok && n.unit).toBeTruthy();
        const unitId = n.ok && n.unit ? n.unit.id : "";

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);
        const receiptsPath = path.join(campaignDir, CAMPAIGN_RECEIPTS_FILE);
        const unitsStagePath = path.join(campaignDir, CAMPAIGN_UNITS_STAGE_FILE);
        const receiptsStagePath = path.join(
          campaignDir,
          CAMPAIGN_RECEIPTS_STAGE_FILE,
        );

        // Snapshot pre-report units.json (where unit is active)
        const preReportUnitsRaw = await readFile(unitsPath, "utf8");

        // Complete report normally, then move new units/receipts back to stage files
        // and restore stale units.json + delete receipts.jsonl to simulate crash before rename.
        const rep = await executeReport(s, {
          unitId,
          outcome: UnitReportOutcomes.pass,
          command: "npm test",
          output: "ok",
        });
        expect(rep.ok).toBe(true);

        const postReportUnitsRaw = await readFile(unitsPath, "utf8");
        const postReportReceiptsRaw = await readFile(receiptsPath, "utf8");
        await writeFile(unitsStagePath, postReportUnitsRaw, "utf8");
        await writeFile(receiptsStagePath, postReportReceiptsRaw, "utf8");
        await writeFile(unitsPath, preReportUnitsRaw, "utf8");
        await rm(receiptsPath);

        // Reload reconciles stage files atomically without double-counting
        const recovered = await CampaignStore.load(s.root);
        expect(recovered.corrupted).toBe(false);
        expect(recovered.state.completed).toBe(1);
        const units = await recovered.loadUnitsState();
        expect(units?.units.filter((u) => u.state === WorkUnitStates.done)).toHaveLength(1);
        const receipts = await recovered.loadReceipts();
        expect(receipts).toHaveLength(1);
        expect(existsSync(unitsStagePath)).toBe(false);
        expect(existsSync(receiptsStagePath)).toBe(false);

        // Retrying report on already-done unit is refused (no double-counting)
        const retry = await executeReport(s, {
          unitId,
          outcome: UnitReportOutcomes.pass,
          command: "npm test",
          output: "ok",
        });
        expect(retry.ok).toBe(false);
        if (!retry.ok) {
          expect(retry.error.code).toBe("invalid-work-unit-state");
        }
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 2. Post-decision regrouping writes checkpoint + unitsSha256 in the same evidence line
    // and missing evidence.jsonl after privileged E.verify/O.checkpoint fails closed.
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        const store0 = await CampaignStore.load(s.root);
        const unitIds = store0.state.queue.map((q) => q.id);

        const cp = await executeCheckpoint(s, {
          batches: [{ id: "atomic-batch", unitIds }],
        });
        expect(cp.ok).toBe(true);
        if (cp.ok) {
          expect(cp.checkpointWritten).toBe(true);
          expect(cp.queue?.batches[0]?.id).toBe("atomic-batch");
        }

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const evidenceRaw = await readFile(
          path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE),
          "utf8",
        );
        const evidenceLines = evidenceRaw
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        const lastEv = evidenceLines.at(-1)!;
        expect(lastEv.authorizedPrivileged).toBe(true);
        expect(lastEv.unitsSha256).toBe(
          campaignSha256Hex(canonicalCampaignJson(cp.ok ? cp.queue : null)),
        );

        // Removing evidence.jsonl fails closed (FAILED_SAFE)
        await rm(path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE));
        const noEvStore = await CampaignStore.load(s.root);
        expect(noEvStore.corrupted).toBe(true);
        expect(noEvStore.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }
  });

  it("Finding 5: exhausting bounds (0/0, 0/2, 2/0, 1/1) transitions persisted campaign state to CONVERGENCE with requiresPerson and raised steering rung", async () => {
    const cases: Array<{ recoverLimit: number; reopenLimit: number }> = [
      { recoverLimit: 0, reopenLimit: 0 },
      { recoverLimit: 0, reopenLimit: 2 },
      { recoverLimit: 2, reopenLimit: 0 },
      { recoverLimit: 1, reopenLimit: 1 },
    ];

    for (const bounds of cases) {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupCharterWithAcceptanceCommands(bounds);
        const initialStore = await CampaignStore.load(s.root);
        const initialRung = initialStore.state.steering.rung;

        const n = await executeNext(s);
        expect(n.ok && n.unit?.id).toBe("u1");

        const totalRecoverAndReopen = bounds.recoverLimit + bounds.reopenLimit;
        for (let i = 0; i < totalRecoverAndReopen; i++) {
          const stepFail = await executeReport(s, {
            unitId: "u1",
            outcome: UnitReportOutcomes.fail,
            command: "npm test",
            output: `fail-${i + 1}`,
          });
          expect(stepFail.ok).toBe(true);
          if (stepFail.ok) {
            expect(stepFail.decision).not.toBe(CampaignDecisions.convergence);
          }
          const resumed = await executeReport(s, {
            unitId: "u1",
            outcome: UnitReportOutcomes.resume,
          });
          expect(resumed.ok).toBe(true);
        }

        const finalFail = await executeReport(s, {
          unitId: "u1",
          outcome: UnitReportOutcomes.fail,
          command: "npm test",
          output: "final-exhaustion",
        });
        expect(finalFail.ok).toBe(true);
        if (finalFail.ok) {
          expect(finalFail.decision).toBe(CampaignDecisions.convergence);
          expect(finalFail.unit?.state).toBe(WorkUnitStates.needsHuman);
          expect(finalFail.state.state).toBe(CampaignStates.convergence);
          expect(finalFail.state.incident?.requiresPerson).toBe(true);
        }

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(false);
        expect(reloaded.state.state).toBe(CampaignStates.convergence);
        expect(reloaded.state.incident?.requiresPerson).toBe(true);
        expect(reloaded.state.steering.rung).not.toBe(initialRung);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }
  });

  it("upgrades receipts via --campaign-replay-receipts and reloads CampaignStore without FAILED_SAFE", async () => {
    const deterministicCmd = `node -e "console.log('verified-ok')"`;
    const service = makeService();
    const env = cleanEnv();
    const goalWithCmd = {
      ...VALID_GOAL_CONTRACT,
      acceptanceCommands: [deterministicCmd],
    };
    await executeOpen(session, goalWithCmd);
    const recon = await executeRecon(service, session, {
      gaps: ["security audit"],
    });
    if (!recon.ok) throw new Error("recon failed");

    const cardRef = recon.recon.gaps[0]!.candidates[0]!.cardRef;
    const proposed = await executePropose(
      session,
      {
        reconId: recon.recon.reconId,
        arsenal: [cardRef],
        recoverLimit: 1,
        reopenLimit: 1,
        sessionRetention: 3,
      },
      { env },
    );
    expect(proposed.ok).toBe(true);

    await executeOperatorDecide(session, {
      elicit: async () => ({
        action: ElicitationActions.accept,
        content: { decision: OperatorDecisionChoices.approve },
      }),
      env,
    });

    const n = await executeNext(session);
    expect(n.ok && n.unit).toBeTruthy();
    const unitId = n.ok && n.unit ? n.unit.id : "";

    const rep = await executeReport(session, {
      unitId,
      outcome: UnitReportOutcomes.pass,
      command: deterministicCmd,
      output: "verified-ok\n",
    });
    expect(rep.ok).toBe(true);

    const storeBefore = await CampaignStore.load(session.root);
    const bin = path.resolve(REPO_ROOT, "packages/core/bin/skill-zero.mjs");
    const cliResult = spawnSync(
      process.execPath,
      [bin, "--campaign-replay-receipts", storeBefore.tracePath],
      { encoding: "utf8" },
    );
    expect(cliResult.status).toBe(0);
    const cliJson = JSON.parse(cliResult.stdout) as {
      valid: boolean;
      upgraded: number;
      receipts: Array<{ status: string; replayedExitCode?: number }>;
    };
    expect(cliJson.valid).toBe(true);
    expect(cliJson.upgraded).toBe(1);
    expect(cliJson.receipts[0]?.status).toBe(ReceiptStatuses.replayed);
    expect(cliJson.receipts[0]?.replayedExitCode).toBe(0);

    const storeAfter = await CampaignStore.load(session.root);
    expect(storeAfter.corrupted).toBe(false);
    expect(storeAfter.state.state).toBe(CampaignStates.executing);
    const receiptsAfter = await storeAfter.loadReceipts();
    expect(receiptsAfter).toHaveLength(1);
    expect(receiptsAfter[0]?.status).toBe(ReceiptStatuses.replayed);
    expect(receiptsAfter[0]?.replayedExitCode).toBe(0);
  });

  it("Finding R2-2: fails closed (FAILED_SAFE) when unitsSha256 is stripped from evidence.jsonl or mismatched between trace and evidence", async () => {
    // 1. Removing unitsSha256 from evidence.jsonl + deleting units.json -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        await executeNext(s);

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);

        const evLines = (await readFile(evidencePath, "utf8"))
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        const stripped = evLines.map((ev) => {
          const copy = { ...ev };
          delete copy.unitsSha256;
          return JSON.stringify(copy);
        });
        await writeFile(evidencePath, `${stripped.join("\n")}\n`, "utf8");
        await rm(unitsPath);

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        expect(reloaded.error).toMatch(/commitment mismatch/i);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 2. Replacing evidence+units.json commitment on A.next without matching trace unitsSha256 -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        await executeNext(s);

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);
        const unitsObj = JSON.parse(await readFile(unitsPath, "utf8")) as Record<string, unknown>;
        const tamperedUnits = {
          ...unitsObj,
          bounds: { recoverLimit: 99, reopenLimit: 99 },
        };
        await writeFile(unitsPath, `${JSON.stringify(tamperedUnits, null, 2)}\n`, "utf8");
        const tamperedSha = campaignSha256Hex(canonicalCampaignJson(tamperedUnits));

        const evLines = (await readFile(evidencePath, "utf8"))
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        evLines[evLines.length - 1] = {
          ...evLines[evLines.length - 1],
          unitsSha256: tamperedSha,
        };
        await writeFile(
          evidencePath,
          `${evLines.map((e) => JSON.stringify(e)).join("\n")}\n`,
          "utf8",
        );

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 3. Replacing evidence+units.json commitment on E.verify without matching trace unitsSha256 -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        const n = await executeNext(s);
        expect(n.ok && n.unit).toBeTruthy();
        await executeReport(s, {
          unitId: n.ok && n.unit ? n.unit.id : "u1",
          outcome: UnitReportOutcomes.pass,
          command: "npm test",
          output: "ok",
        });

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);
        const unitsObj = JSON.parse(await readFile(unitsPath, "utf8")) as {
          units: Array<Record<string, unknown>>;
        };
        const tamperedUnits = {
          ...unitsObj,
          units: unitsObj.units.map((u) => ({ ...u, state: WorkUnitStates.done })),
        };
        await writeFile(unitsPath, `${JSON.stringify(tamperedUnits, null, 2)}\n`, "utf8");
        const tamperedSha = campaignSha256Hex(canonicalCampaignJson(tamperedUnits));

        const evLines = (await readFile(evidencePath, "utf8"))
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        evLines[evLines.length - 1] = {
          ...evLines[evLines.length - 1],
          unitsSha256: tamperedSha,
        };
        await writeFile(
          evidencePath,
          `${evLines.map((e) => JSON.stringify(e)).join("\n")}\n`,
          "utf8",
        );

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }

    // 4. Replacing evidence+units.json commitment on O.checkpoint without matching trace unitsSha256 -> FAILED_SAFE
    {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();
        const store0 = await CampaignStore.load(s.root);
        const unitIds = store0.state.queue.map((q) => q.id);
        const cp = await executeCheckpoint(s, {
          batches: [{ id: "b1", unitIds }],
        });
        expect(cp.ok).toBe(true);

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);
        const unitsObj = JSON.parse(await readFile(unitsPath, "utf8")) as Record<string, unknown>;
        const tamperedUnits = {
          ...unitsObj,
          batches: [{ id: "tampered-batch", unitIds }],
        };
        await writeFile(unitsPath, `${JSON.stringify(tamperedUnits, null, 2)}\n`, "utf8");
        const tamperedSha = campaignSha256Hex(canonicalCampaignJson(tamperedUnits));

        const evLines = (await readFile(evidencePath, "utf8"))
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        evLines[evLines.length - 1] = {
          ...evLines[evLines.length - 1],
          unitsSha256: tamperedSha,
        };
        await writeFile(
          evidencePath,
          `${evLines.map((e) => JSON.stringify(e)).join("\n")}\n`,
          "utf8",
        );

        const reloaded = await CampaignStore.load(s.root);
        expect(reloaded.corrupted).toBe(true);
        expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    }
  });

  it("Finding R2-3: recovers across pre-trace, post-trace/pre-evidence, and post-evidence/pre-rename boundaries for agent and privileged ops, and rejects trace-only privileged tampering", async () => {
    // Helper to simulate each crash boundary by running the op on a session,
    // capturing pre/post snapshots, and rewinding disk to the exact crash boundary.
    const testBoundariesForOp = async (
      kind: "agent-next" | "agent-report" | "engine-verify" | "operator-checkpoint",
    ) => {
      const s = await openSession();
      try {
        const orig = session;
        session = s;
        await setupApprovedCampaign();

        const campaignDir = path.join(s.root, CAMPAIGN_DIR_NAME);
        const tracePath = path.join(campaignDir, CAMPAIGN_TRACE_FILE);
        const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
        const unitsPath = path.join(campaignDir, CAMPAIGN_UNITS_FILE);
        const receiptsPath = path.join(campaignDir, CAMPAIGN_RECEIPTS_FILE);
        const unitsStagePath = path.join(campaignDir, CAMPAIGN_UNITS_STAGE_FILE);
        const receiptsStagePath = path.join(campaignDir, CAMPAIGN_RECEIPTS_STAGE_FILE);
        const txStagePath = path.join(campaignDir, CAMPAIGN_TX_STAGE_FILE);

        let unitId = "u1";
        if (kind === "agent-report" || kind === "engine-verify") {
          const n = await executeNext(s);
          expect(n.ok && n.unit).toBeTruthy();
          unitId = n.ok && n.unit ? n.unit.id : "u1";
        }

        const preTrace = await readFile(tracePath, "utf8");
        const preEvidence = await readFile(evidencePath, "utf8");
        const preUnitsExists = existsSync(unitsPath);
        const preUnits = preUnitsExists ? await readFile(unitsPath, "utf8") : null;
        const preReceiptsExists = existsSync(receiptsPath);
        const preReceipts = preReceiptsExists
          ? await readFile(receiptsPath, "utf8")
          : null;

        if (kind === "agent-next") {
          const res = await executeNext(s);
          expect(res.ok).toBe(true);
        } else if (kind === "agent-report") {
          const res = await executeReport(s, {
            unitId,
            outcome: UnitReportOutcomes.block,
            reason: "blocked for test",
          });
          expect(res.ok).toBe(true);
        } else if (kind === "engine-verify") {
          const res = await executeReport(s, {
            unitId,
            outcome: UnitReportOutcomes.pass,
            command: "npm test",
            output: "ok",
          });
          expect(res.ok).toBe(true);
        } else {
          const store0 = await CampaignStore.load(s.root);
          const unitIds = store0.state.queue.map((q) => q.id);
          const res = await executeCheckpoint(s, {
            batches: [{ id: "tx-batch", unitIds }],
          });
          expect(res.ok).toBe(true);
        }

        const postTrace = await readFile(tracePath, "utf8");
        const postEvidence = await readFile(evidencePath, "utf8");
        const postEvidenceLines = postEvidence.trim().split("\n");
        const lastEvidenceLine = postEvidenceLines.at(-1)!;
        const postUnits = await readFile(unitsPath, "utf8");
        const postReceiptsExists = existsSync(receiptsPath);
        const postReceipts = postReceiptsExists
          ? await readFile(receiptsPath, "utf8")
          : null;

        const restorePreArtifacts = async () => {
          if (preUnits !== null) {
            await writeFile(unitsPath, preUnits, "utf8");
          } else {
            await rm(unitsPath, { force: true });
          }
          if (preReceipts !== null) {
            await writeFile(receiptsPath, preReceipts, "utf8");
          } else {
            await rm(receiptsPath, { force: true });
          }
        };

        const writeStageArtifacts = async () => {
          await writeFile(unitsStagePath, postUnits, "utf8");
          if (postReceipts !== null) {
            await writeFile(receiptsStagePath, postReceipts, "utf8");
          }
          await writeFile(txStagePath, `${lastEvidenceLine}\n`, "utf8");
        };

        // Boundary 1: pre-trace (stage files + .tx.stage.json written, trace/evidence NOT yet appended)
        await writeFile(tracePath, preTrace, "utf8");
        await writeFile(evidencePath, preEvidence, "utf8");
        await restorePreArtifacts();
        await writeStageArtifacts();

        const preTraceLoaded = await CampaignStore.load(s.root);
        expect(preTraceLoaded.corrupted).toBe(false);
        expect(preTraceLoaded.trace.length).toBe(
          preTrace.trim().split("\n").length,
        );
        expect(existsSync(txStagePath)).toBe(false);
        expect(existsSync(unitsStagePath)).toBe(false);
        expect(existsSync(receiptsStagePath)).toBe(false);

        // Boundary 2: post-trace / pre-evidence (trace appended + stage files + .tx.stage.json present, evidence NOT appended)
        await writeFile(tracePath, postTrace, "utf8");
        await writeFile(evidencePath, preEvidence, "utf8");
        await restorePreArtifacts();
        await writeStageArtifacts();

        const postTraceLoaded = await CampaignStore.load(s.root);
        expect(postTraceLoaded.corrupted).toBe(false);
        expect(postTraceLoaded.trace.length).toBe(
          postTrace.trim().split("\n").length,
        );
        expect(await readFile(evidencePath, "utf8")).toBe(postEvidence);
        expect(await readFile(unitsPath, "utf8")).toBe(postUnits);
        expect(existsSync(txStagePath)).toBe(false);
        expect(existsSync(unitsStagePath)).toBe(false);
        expect(existsSync(receiptsStagePath)).toBe(false);

        // Boundary 3: post-evidence / pre-rename (trace + evidence appended, stage files not yet renamed)
        await writeFile(tracePath, postTrace, "utf8");
        await writeFile(evidencePath, postEvidence, "utf8");
        await restorePreArtifacts();
        await writeStageArtifacts();

        const postEvLoaded = await CampaignStore.load(s.root);
        expect(postEvLoaded.corrupted).toBe(false);
        expect(postEvLoaded.trace.length).toBe(
          postTrace.trim().split("\n").length,
        );
        expect(await readFile(unitsPath, "utf8")).toBe(postUnits);
        expect(existsSync(txStagePath)).toBe(false);
        expect(existsSync(unitsStagePath)).toBe(false);
        expect(existsSync(receiptsStagePath)).toBe(false);

        // Tamper check: appending privileged/U4 event to trace.jsonl WITHOUT .tx.stage.json -> FAILED_SAFE
        await writeFile(tracePath, postTrace, "utf8");
        await writeFile(evidencePath, preEvidence, "utf8");
        await restorePreArtifacts();
        await rm(txStagePath, { force: true });
        await rm(unitsStagePath, { force: true });
        await rm(receiptsStagePath, { force: true });

        const tamperedLoaded = await CampaignStore.load(s.root);
        expect(tamperedLoaded.corrupted).toBe(true);
        expect(tamperedLoaded.state.state).toBe(CampaignStates.failedSafe);

        session = orig;
      } finally {
        await rm(s.root, { recursive: true, force: true });
      }
    };

    await testBoundariesForOp("agent-next");
    await testBoundariesForOp("agent-report");
    await testBoundariesForOp("engine-verify");
    await testBoundariesForOp("operator-checkpoint");
  });
});
