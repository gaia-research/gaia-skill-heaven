import { describe, expect, it } from "vitest";
import {
  AgentOps as A,
  CAMPAIGN_SCHEMA_IDS as IDs,
  CampaignDecisions as D,
  CampaignStates as S,
  DecisionActions as Actions,
  EngineOps as E,
  OperatorVerbs as O,
  RECEIPT_STATUSES,
  ReceiptStatuses,
  UNIT_REPORT_OUTCOMES,
  UnitReportOutcomes,
  WORK_UNIT_STATES,
  WorkUnitStates,
  activateWorkUnit,
  beginVerifyWorkUnit,
  blockWorkUnit,
  buildWorkUnitQueue,
  canReceiptCloseUnit,
  canTransitionWorkUnit,
  completeWorkUnit,
  computeOutputDigest,
  createAttestedReceipt,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  createWorkUnit,
  escalateRecoveringToReopen,
  failWorkUnitVerification,
  formatVerifyReceiptLine,
  initialSteeringState,
  isCharterNamedVerifyCommand,
  markWorkUnitNeedsHuman,
  orderReadyWorkUnits,
  parseVerifyReceipt,
  parseVerifyReceiptLines,
  parseWorkUnitQueueState,
  parseWorkUnitRecord,
  recordRetrievalRefusal,
  regroupWorkUnits,
  replayCampaign,
  reportUnitVerification,
  resumeWorkUnitFromHuman,
  selectNextWorkUnit,
  serializeCampaignRecord,
  stepCampaign,
  stepCampaignSteering,
  stepSteering,
  unblockWorkUnit,
  updateWorkUnitInQueue,
  upgradeReceiptOnReplay,
  validateWorkUnitBounds,
  verifyCampaignRecord,
  verifySteeringRecord,
  type AgentCampaignEvent,
  type CampaignCharter,
  type CampaignOperatorCommand,
  type EngineCommand,
  type WorkUnitBounds,
} from "../src/index.js";
import { STEERING_TRACE_SCHEMA } from "../src/steering.js";

const operatorAdapter = createCampaignOperatorAdapter();
const engineAdapter = createCampaignEngineAdapter();

const operator = (command: Omit<CampaignOperatorCommand, "channel"> | Record<string, unknown>) =>
  createCampaignOperatorEvent(operatorAdapter, { channel: "operator", ...command } as CampaignOperatorCommand);

const engine = (command: Omit<EngineCommand, "channel"> | Record<string, unknown>) =>
  createCampaignEngineEvent(engineAdapter, { channel: "engine", ...command } as EngineCommand);

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function makeCharter(overrides: Partial<CampaignCharter> = {}): CampaignCharter {
  return {
    schema: IDs.charter,
    revision: 1,
    goal: "U4 synthetic goal",
    allowedSkills: ["skill-a", "skill-b"],
    queue: [
      { id: "unit-a", skill: "skill-a", reconCitation: "citation:a" },
      { id: "unit-b", skill: "skill-b", reconCitation: "citation:a" },
    ],
    recoverLimit: 2,
    reopenLimit: 2,
    sessionRetention: 4,
    clauses: ["verify-command", "termination"],
    acceptanceCommands: ["npm test", "npm run typecheck"],
    ...overrides,
  };
}

function setupCampaign(charter: CampaignCharter = makeCharter()) {
  const open: AgentCampaignEvent = { channel: "agent", op: A.open };
  const recon: AgentCampaignEvent = {
    channel: "agent",
    op: A.recon,
    recon: {
      schema: IDs.recon,
      findings: ["Synthetic finding"],
      citations: ["citation:a"],
    },
  };
  const propose: AgentCampaignEvent = { channel: "agent", op: A.propose, charter };
  const approve = operator({ op: O.decide, action: Actions.approve, charterRevision: charter.revision });
  return [open, recon, propose, approve] as const;
}

describe("U4 vocabulary and schema IDs", () => {
  it("exposes bounded work-unit, receipt, and report vocabularies without 'ratify'", () => {
    expect(IDs.receipt).toBe("skill-heaven/verify-receipt/v1");
    expect(IDs.units).toBe("skill-heaven/work-units/v1");
    expect(WORK_UNIT_STATES).toEqual([
      "ready",
      "active",
      "verifying",
      "recovering",
      "reopened",
      "done",
      "needs-human",
      "blocked",
    ]);
    expect(RECEIPT_STATUSES).toEqual(["attested", "replayed"]);
    expect(UNIT_REPORT_OUTCOMES).toEqual([
      "pass",
      "fail",
      "block",
      "unblock",
      "needs-human",
      "resume",
      "retrieval-refusal",
    ]);
    for (const token of [...WORK_UNIT_STATES, ...RECEIPT_STATUSES, ...UNIT_REPORT_OUTCOMES]) {
      expect(token.toLowerCase()).not.toContain("ratify");
    }
  });
});

describe("U4 verify receipts (INV-U15, PR-5)", () => {
  it("computes deterministic digests and creates frozen attested receipts with no quality claims", () => {
    const output = "Test Files  1 passed (1)\n";
    const digest = computeOutputDigest(output);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(computeOutputDigest(output)).toBe(digest);

    const receipt = createAttestedReceipt({
      unitId: "unit-a",
      command: "npm test",
      output,
      exitCode: 0,
    });
    expect(receipt).toEqual({
      schema: IDs.receipt,
      unitId: "unit-a",
      command: "npm test",
      outputSha256: digest,
      exitCode: 0,
      status: ReceiptStatuses.attested,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(JSON.stringify(receipt).toLowerCase()).not.toContain("good");
    expect(JSON.stringify(receipt).toLowerCase()).not.toContain("ratify");
  });

  it("rejects mismatched digests, missing digests, and non-plain / accessor / forged inputs", () => {
    const digest = computeOutputDigest("ok");
    expect(() =>
      createAttestedReceipt({ unitId: "unit-a", command: "npm test", output: "ok", outputSha256: "0".repeat(64), exitCode: 0 }),
    ).toThrow();
    expect(() => createAttestedReceipt({ unitId: "unit-a", command: "npm test", exitCode: 0 })).toThrow();
    expect(() => createAttestedReceipt({ unitId: "unit-a", command: "npm test", outputSha256: digest, exitCode: -1 })).toThrow();

    const valid = createAttestedReceipt({ unitId: "unit-a", command: "npm test", outputSha256: digest, exitCode: 0 });
    expect(parseVerifyReceipt(valid)).toEqual(valid);
    expect(parseVerifyReceipt({ ...valid, extra: true })).toBeNull();
    expect(parseVerifyReceipt({ ...valid, status: "replayed" })).toBeNull();
    expect(parseVerifyReceipt({ ...valid, replayedExitCode: 0 })).toBeNull();
    expect(parseVerifyReceipt(Object.create(valid))).toBeNull();

    let getterCalls = 0;
    const withAccessor = {
      ...valid,
      get command() {
        getterCalls++;
        return "npm test";
      },
    };
    expect(parseVerifyReceipt(withAccessor)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("formats and strictly parses receipts.jsonl lines", () => {
    const r1 = createAttestedReceipt({ unitId: "u1", command: "npm test", output: "a", exitCode: 0 });
    const r2 = upgradeReceiptOnReplay(
      createAttestedReceipt({ unitId: "u2", command: "npm run typecheck", output: "b", exitCode: 1 }),
      { command: "npm run typecheck", outputSha256: computeOutputDigest("b"), exitCode: 1 },
    ).receipt;

    const jsonl = `${formatVerifyReceiptLine(r1)}\n${formatVerifyReceiptLine(r2)}\n`;
    const parsed = parseVerifyReceiptLines(jsonl);
    expect(parsed).toEqual({ ok: true, lines: [r1, r2] });
    expect(parseVerifyReceiptLines("")).toEqual({ ok: true, lines: [] });
    expect(parseVerifyReceiptLines(`${formatVerifyReceiptLine(r1)}\n\n${formatVerifyReceiptLine(r2)}`).ok).toBe(false);
    expect(parseVerifyReceiptLines("{bad json").ok).toBe(false);
  });

  it("closes a unit ONLY on a passing receipt whose command the charter names (INV-U15)", () => {
    const charterCommands = ["npm test", "npm run typecheck"];
    expect(isCharterNamedVerifyCommand("  npm test  ", charterCommands)).toBe(true);
    expect(isCharterNamedVerifyCommand("npm test -- --watch", charterCommands)).toBe(false);
    expect(isCharterNamedVerifyCommand("npm", charterCommands)).toBe(false);
    expect(isCharterNamedVerifyCommand("npm test", [])).toBe(false);

    const passingNamed = createAttestedReceipt({
      unitId: "unit-a",
      command: "npm test",
      output: "ok",
      exitCode: 0,
    });
    const passingUnnamed = createAttestedReceipt({
      unitId: "unit-a",
      command: "echo ok",
      output: "ok",
      exitCode: 0,
    });
    const failingNamed = createAttestedReceipt({
      unitId: "unit-a",
      command: "npm test",
      output: "fail",
      exitCode: 1,
    });

    expect(canReceiptCloseUnit(passingNamed, "unit-a", charterCommands)).toBe(true);
    expect(canReceiptCloseUnit(passingNamed, "unit-b", charterCommands)).toBe(false);
    expect(canReceiptCloseUnit(passingUnnamed, "unit-a", charterCommands)).toBe(false);
    expect(canReceiptCloseUnit(failingNamed, "unit-a", charterCommands)).toBe(false);
    expect(canReceiptCloseUnit(passingNamed, "unit-a", [])).toBe(false);
  });

  it("upgrades matching receipts to replayed and leaves mismatched ones attested", () => {
    const initial = createAttestedReceipt({
      unitId: "unit-a",
      command: "npm test",
      output: "pass",
      exitCode: 0,
    });

    const matched = upgradeReceiptOnReplay(initial, {
      command: "npm test",
      outputSha256: computeOutputDigest("pass"),
      exitCode: 0,
    });
    expect(matched.upgraded).toBe(true);
    expect(matched.receipt.status).toBe(ReceiptStatuses.replayed);
    expect(matched.receipt.replayedExitCode).toBe(0);
    expect(matched.receipt.replayedOutputSha256).toBe(initial.outputSha256);

    const mismatchedDigest = upgradeReceiptOnReplay(initial, {
      command: "npm test",
      outputSha256: computeOutputDigest("different"),
      exitCode: 0,
    });
    expect(mismatchedDigest.upgraded).toBe(false);
    expect(mismatchedDigest.receipt.status).toBe(ReceiptStatuses.attested);
    expect(mismatchedDigest.receipt.replayedExitCode).toBeUndefined();

    const mismatchedExit = upgradeReceiptOnReplay(initial, {
      command: "npm test",
      outputSha256: computeOutputDigest("pass"),
      exitCode: 1,
    });
    expect(mismatchedExit.upgraded).toBe(false);
    expect(mismatchedExit.receipt.status).toBe(ReceiptStatuses.attested);
  });
});

describe("U4 work-unit state machine and bounds", () => {
  it("validates bounds with no compiled defaults", () => {
    expect(() => validateWorkUnitBounds(undefined)).toThrow();
    expect(() => validateWorkUnitBounds({})).toThrow();
    expect(() => validateWorkUnitBounds({ recoverLimit: -1, reopenLimit: 0 })).toThrow();
    expect(() => validateWorkUnitBounds({ recoverLimit: 1, reopenLimit: 0.5 })).toThrow();
    expect(validateWorkUnitBounds({ recoverLimit: 0, reopenLimit: 0 })).toEqual({
      recoverLimit: 0,
      reopenLimit: 0,
    });
  });

  it.each<[WorkUnitBounds, string[]]>([
    [{ recoverLimit: 0, reopenLimit: 0 }, ["CONVERGENCE:needs-human"]],
    [
      { recoverLimit: 0, reopenLimit: 2 },
      ["REOPEN:reopened", "REOPEN:reopened", "CONVERGENCE:needs-human"],
    ],
    [
      { recoverLimit: 2, reopenLimit: 0 },
      ["RECOVER:recovering", "RECOVER:recovering", "CONVERGENCE:needs-human"],
    ],
    [
      { recoverLimit: 2, reopenLimit: 2 },
      [
        "RECOVER:recovering",
        "RECOVER:recovering",
        "REOPEN:reopened",
        "REOPEN:reopened",
        "CONVERGENCE:needs-human",
      ],
    ],
  ])("enforces recover -> reopen -> convergence at bounds %j", (bounds, expectedSteps) => {
    let unit = createWorkUnit({ id: "u1", skill: "skill-a", reconCitation: "citation:a" });
    const observed: string[] = [];

    for (let i = 0; i < expectedSteps.length; i++) {
      unit = activateWorkUnit(unit);
      unit = beginVerifyWorkUnit(unit);
      const res = failWorkUnitVerification(unit, bounds);
      unit = res.unit;
      observed.push(`${res.decision}:${unit.state}`);
    }

    expect(observed).toEqual(expectedSteps);
    expect(unit.recoverCount).toBe(bounds.recoverLimit);
    expect(unit.reopenCount).toBe(bounds.reopenLimit);
  });

  it("supports escalateRecoveringToReopen, reportUnitVerification, block/unblock, human resume, and terminal done", () => {
    const charterCommands = ["npm test"];
    const bounds: WorkUnitBounds = { recoverLimit: 1, reopenLimit: 1 };

    let unit = createWorkUnit({ id: "u1", skill: "skill-a", reconCitation: "citation:a" });
    unit = activateWorkUnit(unit);
    const failReport = reportUnitVerification(unit, {
      outcome: UnitReportOutcomes.fail,
      bounds,
      charterCommands,
      receipt: createAttestedReceipt({ unitId: "u1", command: "npm test", output: "err", exitCode: 1 }),
    });
    expect(failReport.decision).toBe(D.recover);
    expect(failReport.unit.state).toBe(WorkUnitStates.recovering);

    const escalated = escalateRecoveringToReopen(failReport.unit, bounds);
    expect(escalated.decision).toBe(D.reopen);
    expect(escalated.unit.state).toBe(WorkUnitStates.reopened);

    unit = activateWorkUnit(escalated.unit);
    const blocked = blockWorkUnit(unit, "waiting on external fixture");
    expect(blocked.state).toBe(WorkUnitStates.blocked);
    const unblocked = unblockWorkUnit(blocked, WorkUnitStates.active);
    expect(unblocked.state).toBe(WorkUnitStates.active);

    const needsHuman = markWorkUnitNeedsHuman(unblocked, "clarify edge case");
    expect(needsHuman.state).toBe(WorkUnitStates.needsHuman);
    const resumed = resumeWorkUnitFromHuman(needsHuman, WorkUnitStates.active);
    expect(resumed.state).toBe(WorkUnitStates.active);

    const badReceipt = createAttestedReceipt({ unitId: "u1", command: "echo ok", output: "ok", exitCode: 0 });
    expect(() =>
      reportUnitVerification(resumed, {
        outcome: UnitReportOutcomes.pass,
        bounds,
        charterCommands,
        receipt: badReceipt,
      }),
    ).toThrow();

    const goodReceipt = createAttestedReceipt({ unitId: "u1", command: "npm test", output: "ok", exitCode: 0 });
    const passed = reportUnitVerification(resumed, {
      outcome: UnitReportOutcomes.pass,
      bounds,
      charterCommands,
      receipt: goodReceipt,
    });
    expect(passed.decision).toBe(D.close);
    expect(passed.unit.state).toBe(WorkUnitStates.done);
    expect(canTransitionWorkUnit(WorkUnitStates.done, WorkUnitStates.ready)).toBe(false);
    expect(() => activateWorkUnit(passed.unit)).toThrow();
    expect(parseWorkUnitRecord(passed.unit)).toEqual(passed.unit);
  });

  it("treats retrieval refusal as HOLD without incrementing recover/reopen", () => {
    const unit = activateWorkUnit(createWorkUnit({ id: "u1", skill: "skill-a", reconCitation: "citation:a" }));
    const refused = recordRetrievalRefusal(unit);
    expect(refused.decision).toBe(D.hold);
    expect(refused.unit.state).toBe(WorkUnitStates.active);
    expect(refused.unit.recoverCount).toBe(0);
    expect(refused.unit.reopenCount).toBe(0);
    expect(refused.unit.retrievalRefusalCount).toBe(1);
  });
});

describe("U4 queue ordering, PR-9 independence, and regrouping checkpoints", () => {
  it("orders ready units by dependency depth -> charter phase -> stable tie-break", () => {
    const charter = makeCharter({
      queue: [
        { id: "u-dep", skill: "skill-a", reconCitation: "citation:a", phase: "p1", dependsOn: ["u-p2"] },
        { id: "u-p2", skill: "skill-a", reconCitation: "citation:a", phase: "p2" },
        { id: "u-p1-b", skill: "skill-a", reconCitation: "citation:a", phase: "p1" },
        { id: "u-p1-a", skill: "skill-a", reconCitation: "citation:a", phase: "p1" },
        { id: "u-unphased", skill: "skill-a", reconCitation: "citation:a" },
      ],
    });
    let queue = buildWorkUnitQueue(charter, { phases: ["p1", "p2"] });
    const first = selectNextWorkUnit(queue);
    expect(first.orderedReady.map((u) => u.id)).toEqual(["u-p1-b", "u-p1-a", "u-p2", "u-unphased"]);
    expect(first.counts.waitingOnDependencies).toBe(1);

    // Complete u-p2 so u-dep becomes unblocked at depth 1 (after depth 0 units)
    const p2Unit = queue.units.find((u) => u.id === "u-p2")!;
    const doneP2 = completeWorkUnit(
      beginVerifyWorkUnit(activateWorkUnit(p2Unit)),
      createAttestedReceipt({ unitId: "u-p2", command: "npm test", output: "ok", exitCode: 0 }),
      ["npm test"],
    );
    queue = updateWorkUnitInQueue(queue, doneP2);
    const second = selectNextWorkUnit(queue);
    expect(second.orderedReady.map((u) => u.id)).toEqual(["u-p1-b", "u-p1-a", "u-unphased", "u-dep"]);
  });

  it("does not let a blocked or needs-human unit stop independent units (PR-9)", () => {
    const charter = makeCharter({
      queue: [
        { id: "u-blocked", skill: "skill-a", reconCitation: "citation:a" },
        { id: "u-dependent", skill: "skill-a", reconCitation: "citation:a", dependsOn: ["u-blocked"] },
        { id: "u-independent", skill: "skill-b", reconCitation: "citation:a" },
      ],
    });
    let queue = buildWorkUnitQueue(charter);
    queue = updateWorkUnitInQueue(queue, blockWorkUnit(queue.units[0]!, "blocked externally"));

    const selection = selectNextWorkUnit(queue);
    expect(selection.next?.id).toBe("u-independent");
    expect(selection.counts.blocked).toBe(1);
    expect(selection.counts.waitingOnDependencies).toBe(1);
  });

  it("writes no checkpoint when regrouping before decisions, and writes a checkpoint after decisions", () => {
    const queue = buildWorkUnitQueue(makeCharter());
    const batches = [
      { id: "batch-1", unitIds: ["unit-a"] },
      { id: "batch-2", unitIds: ["unit-b"] },
    ];

    const preDecision = regroupWorkUnits(queue, batches, false);
    expect(preDecision.checkpointRequired).toBe(false);
    expect(preDecision.checkpoint).toBeNull();
    expect(preDecision.queue.checkpointCount).toBe(0);
    expect(preDecision.queue.units.map((u) => u.batchId)).toEqual(["batch-1", "batch-2"]);

    const postDecision = regroupWorkUnits(preDecision.queue, batches, true);
    expect(postDecision.checkpointRequired).toBe(true);
    expect(postDecision.checkpoint).toEqual({
      decision: D.checkpoint,
      signal: "checkpoint-request",
      checkpointCount: 1,
      batchIds: ["batch-1", "batch-2"],
    });
    expect(postDecision.queue.checkpointCount).toBe(1);
    expect(parseWorkUnitQueueState(postDecision.queue)).toEqual(postDecision.queue);
  });

  it("rejects dependency cycles, unknown dependencies, and invalid regroup batches", () => {
    expect(() =>
      buildWorkUnitQueue(
        makeCharter({
          queue: [
            { id: "a", skill: "skill-a", reconCitation: "citation:a", dependsOn: ["b"] },
            { id: "b", skill: "skill-a", reconCitation: "citation:a", dependsOn: ["a"] },
          ],
        }),
      ),
    ).toThrow(/cycle/i);

    const queue = buildWorkUnitQueue(makeCharter());
    expect(() => regroupWorkUnits(queue, [{ id: "b1", unitIds: ["unknown"] }], true)).toThrow();
    expect(() =>
      regroupWorkUnits(
        queue,
        [
          { id: "b1", unitIds: ["unit-a"] },
          { id: "b2", unitIds: ["unit-a"] },
        ],
        true,
      ),
    ).toThrow();
  });
});

describe("U4 150-unit deterministic replay", () => {
  it("replays a 150-unit synthetic sequence byte-identically with no Math.random", () => {
    const queueItems = Array.from({ length: 150 }, (_, i) => ({
      id: `unit-${String(i).padStart(3, "0")}`,
      skill: i % 2 === 0 ? "skill-a" : "skill-b",
      reconCitation: "citation:a",
      phase: i < 50 ? "phase-1" : i < 100 ? "phase-2" : "phase-3",
      ...(i >= 50 && i % 10 === 0 ? { dependsOn: [`unit-${String(i - 50).padStart(3, "0")}`] } : {}),
    }));
    const charter = makeCharter({
      queue: queueItems,
      recoverLimit: 1,
      reopenLimit: 1,
      acceptanceCommands: ["npm test"],
    });

    const runOnce = () => {
      const nextRand = seeded(0x126004);
      let queue = buildWorkUnitQueue(charter, {
        phases: ["phase-1", "phase-2", "phase-3"],
        decisionsApproved: true,
      });
      const events: unknown[] = [...setupCampaign(charter)];

      while (true) {
        const sel = selectNextWorkUnit(queue);
        if (!sel.next) break;
        const unit = activateWorkUnit(sel.next);
        queue = updateWorkUnitInQueue(queue, unit);

        const roll = nextRand() % 5;
        if (roll === 0) {
          // One failure then pass
          const verifying = beginVerifyWorkUnit(unit);
          const failRes = failWorkUnitVerification(verifying, queue.bounds);
          events.push(
            engine({
              op: E.verify,
              passed: false,
              clause: "verify-command",
              workUnit: unit.id,
            }),
          );
          const retried = beginVerifyWorkUnit(activateWorkUnit(failRes.unit));
          const passReceipt = createAttestedReceipt({
            unitId: unit.id,
            command: "npm test",
            output: `ok-${unit.id}`,
            exitCode: 0,
          });
          const done = completeWorkUnit(retried, passReceipt, charter.acceptanceCommands!);
          queue = updateWorkUnitInQueue(queue, done);
          events.push(
            engine({
              op: E.verify,
              passed: true,
              clause: "verify-command",
              workUnit: unit.id,
              receipt: passReceipt,
              closesUnit: true,
            }),
          );
        } else {
          const verifying = beginVerifyWorkUnit(unit);
          const passReceipt = createAttestedReceipt({
            unitId: unit.id,
            command: "npm test",
            output: `ok-${unit.id}`,
            exitCode: 0,
          });
          const done = completeWorkUnit(verifying, passReceipt, charter.acceptanceCommands!);
          queue = updateWorkUnitInQueue(queue, done);
          events.push(
            engine({
              op: E.verify,
              passed: true,
              clause: "verify-command",
              workUnit: unit.id,
              receipt: passReceipt,
              closesUnit: true,
            }),
          );
        }
      }

      events.push(engine({ op: E.complete, clause: "termination" }));
      const replay = replayCampaign(events);
      return {
        queueJson: JSON.stringify(queue),
        replayJson: JSON.stringify(replay),
        serializedRecord: serializeCampaignRecord(replay.record),
        replay,
        queue,
      };
    };

    const runA = runOnce();
    const runB = runOnce();

    expect(runA.queue.units).toHaveLength(150);
    expect(selectNextWorkUnit(runA.queue).counts.done).toBe(150);
    expect(runA.replay.final.state).toBe(S.completed);
    expect(runA.replay.final.completed).toBe(150);
    expect(runA.queueJson).toBe(runB.queueJson);
    expect(runA.replayJson).toBe(runB.replayJson);
    expect(runA.serializedRecord).toBe(runB.serializedRecord);
  });
});

describe("U4 engine steering wiring and retrieval isolation (INV-U3, K4)", () => {
  it("derives the working rung from steering and validates closesUnit receipts", () => {
    const charter = makeCharter();
    const setup = setupCampaign(charter);
    const failEvent = engine({
      op: E.verify,
      passed: false,
      clause: "verify-command",
      workUnit: "unit-a",
    });
    const unnamedReceipt = createAttestedReceipt({
      unitId: "unit-a",
      command: "echo ok",
      output: "ok",
      exitCode: 0,
    });
    const badClose = engine({
      op: E.verify,
      passed: true,
      clause: "verify-command",
      workUnit: "unit-a",
      receipt: unnamedReceipt,
      closesUnit: true,
    });
    const goodReceipt = createAttestedReceipt({
      unitId: "unit-a",
      command: "npm test",
      output: "ok",
      exitCode: 0,
    });
    const goodClose = engine({
      op: E.verify,
      passed: true,
      clause: "verify-command",
      workUnit: "unit-a",
      receipt: goodReceipt,
      closesUnit: true,
    });

    const replay = replayCampaign([...setup, failEvent, badClose, goodClose]);
    // Step 4: failEvent -> steering moves med -> high
    expect(replay.trace[4]!.accepted).toBe(true);
    expect(replay.trace[4]!.workUnit).toBe("unit-a");
    expect(replay.trace[4]!.decision).toBe(D.explore);

    // Step 5: badClose -> refused because command is not charter-named
    expect(replay.trace[5]!.accepted).toBe(false);
    expect(replay.trace[5]!.decision).toBe(D.hold);

    // Step 6: goodClose -> accepted, completed = 1, steering moves high -> med
    expect(replay.trace[6]!.accepted).toBe(true);
    expect(replay.trace[6]!.workUnit).toBe("unit-a");
    expect(replay.final.completed).toBe(1);
    expect(replay.final.steering.rung).toBe("med");

    // Verify steering trace directly via engine-owned helper
    const s0 = initialSteeringState("med", "open");
    const step1 = stepCampaignSteering(s0, false);
    const step2 = stepCampaignSteering(step1.state, true);
    expect(step1.state.rung).toBe("high");
    expect(step2.state.rung).toBe("med");
    expect(
      verifySteeringRecord({
        schema: STEERING_TRACE_SCHEMA,
        policy: step1.policy,
        initial: s0,
        final: step2.state,
        trace: [
          { index: 0, ...step1, state: undefined } as never,
        ],
      }).valid,
    ).toBe(false);
    expect(verifyCampaignRecord(replay.record).valid).toBe(false);
  });

  it("proves no retrieval-derived value can become a steering event in stepSteering, stepCampaign, or stepCampaignSteering", () => {
    const charter = makeCharter();
    const executing = replayCampaign([...setupCampaign(charter)]).final;
    const steeringStart = initialSteeringState("med", "open");

    const retrievalValues: unknown[] = [
      { score: 0.99 },
      { margin: 0.45 },
      { noMatch: true },
      { matchKind: "ranked" },
      { classified: true },
      { nameMatchesQuery: true },
      { filtered: ["skill-a"] },
      { ranking: [{ id: "skill-a", score: 0.9 }] },
      { retrieval: { score: 0.9, margin: 0.4, noMatch: false } },
      { cards: [{ id: "skill-a", card: "[Preview] skill-a" }] },
      { previewed: ["skill-a"] },
      {
        score: 0.9,
        margin: 0.4,
        noMatch: true,
        matchKind: "exact",
        classified: true,
        nameMatchesQuery: true,
        filtered: [],
        ranking: [],
        retrieval: {},
        cards: [],
        previewed: [],
      },
    ];

    for (const value of retrievalValues) {
      const steeringStep = stepSteering(steeringStart, value);
      expect(steeringStep.accepted).toBe(false);
      expect(steeringStep.changed).toBe(false);
      expect(steeringStep.decision).toBe("hold");
      expect(steeringStep.state).toEqual(steeringStart);

      const campaignStep = stepCampaign(executing, value);
      expect(campaignStep.entry.accepted).toBe(false);
      expect(campaignStep.entry.decision).toBe(D.hold);
      expect(campaignStep.state).toBe(executing);

      expect(() => stepCampaignSteering(steeringStart, value as unknown as boolean)).toThrow();
    }
  });
});
