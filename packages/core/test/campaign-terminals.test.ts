import { describe, expect, it } from "vitest";
import {
  CampaignStates as S, CampaignDecisions as D, CampaignPhases as P,
  AgentOps as A, OperatorVerbs as O, EngineOps as E, CAMPAIGN_SCHEMA_IDS as IDs,
  initialCampaignState, stepCampaign, createCampaignEngineAdapter, createCampaignEngineEvent,
  createCampaignOperatorAdapter, createCampaignOperatorEvent,
  type CampaignState, type EngineCommand,
} from "../src/index.js";

const runtime = createCampaignEngineAdapter();
const operator = createCampaignOperatorAdapter();
const terminalExpectations = [
  [E.sessionEnd, S.endedWithSession, "session-ended"],
  [E.fail, S.failedSafe, "failed-safe"],
  [E.block, S.blocked, "blocked"],
  [E.policyStop, S.stoppedByPolicy, "policy-refusal"],
] as const;
const terminalOps = terminalExpectations.map(([op]) => op);
const matchedClause = "some-other-reason";
const unmatchedClause = "runtime reason";
const activeStates = [S.recon, S.decisions, S.executing, S.convergence] as const;
const terminalStates = [S.completed, S.stoppedByUser, S.stoppedByPolicy, S.blocked, S.failedSafe, S.endedWithSession] as const;

function engineCommand(op: EngineCommand["op"], clause: string, passed = false): EngineCommand {
  return op === E.verify ? { channel: "engine", op, passed, clause } : { channel: "engine", op, clause };
}

function stateAt(state: string): CampaignState {
  const base = initialCampaignState();
  const recon = { schema: IDs.recon, findings: ["finding"], citations: ["citation"] };
  const charter = { schema: IDs.charter, revision: 1, goal: "goal", allowedSkills: ["skill"], queue: [{ id: "unit", skill: "skill", reconCitation: "citation" }], recoverLimit: 1, reopenLimit: 1, sessionRetention: 1, clauses: ["some-other-reason"] };
  return {
    ...base,
    state: state as CampaignState["state"],
    recon: state === S.recon ? null : recon,
    charter: [S.decisions, S.executing, S.convergence, ...terminalStates].includes(state as never) ? charter : null,
    charterRevision: [S.decisions, S.executing, S.convergence, ...terminalStates].includes(state as never) ? 1 : 0,
    queue: [S.decisions, S.executing, S.convergence, ...terminalStates].includes(state as never) ? charter.queue : [],
    total: [S.decisions, S.executing, S.convergence, ...terminalStates].includes(state as never) ? 1 : 0,
    approved: [S.executing, S.convergence, S.completed].includes(state as never),
    incident: state === S.convergence ? { schema: IDs.incident, id: "incident", description: "question", skills: ["skill"], requiresPerson: false } : null,
  } as CampaignState;
}

describe("mechanical runtime terminal authorization", () => {
  it.each(
    activeStates.flatMap(state => terminalExpectations.map(([op, target, signal]) => [state, op, target, signal] as const)),
  )("%s maps trusted %s to %s with no or mismatched charter clause", (stateName, op, expectedTarget, expectedSignal) => {
    const state = stateAt(stateName);
    const event = createCampaignEngineEvent(runtime, engineCommand(op, unmatchedClause));
    const result = stepCampaign(state, event);
    expect(result.state.state).toBe(expectedTarget);
    expect(result.entry).toMatchObject({
      from: stateName,
      to: expectedTarget,
      trigger: op,
      decision: D.stop,
      signal: expectedSignal,
      charterClause: null,
      phase: P.terminal,
      channel: "engine",
      accepted: true,
    });
  });

  it.each(
    activeStates.flatMap(state => [E.sessionEnd, E.fail, E.block, E.policyStop, E.complete, E.verify].map(op => [state, op] as const)),
  )("%s rejects raw, copied, and agent-channel %s claims", (stateName, op) => {
    const state = stateAt(stateName);
    const trusted = createCampaignEngineEvent(runtime, engineCommand(op, matchedClause));
    const raw = engineCommand(op, matchedClause);
    const shallowCopy = { ...trusted };
    const jsonCopy = JSON.parse(JSON.stringify(trusted)) as unknown;
    const agentClaim = { ...raw, channel: "agent" };

    for (const untrusted of [raw, shallowCopy, jsonCopy, agentClaim]) {
      const result = stepCampaign(state, untrusted);
      expect(result.state).toBe(state);
      expect(result.entry).toMatchObject({
        from: stateName,
        to: stateName,
        decision: D.hold,
        accepted: false,
        charterClause: null,
      });
    }
  });

  it("holds complete and verify without a decided charter or with an unmatched clause", () => {
    const reconState = stateAt(S.recon);
    const decisionsState = stateAt(S.decisions);
    const executingState = stateAt(S.executing);
    const convergenceState = stateAt(S.convergence);

    const holdCases: readonly [CampaignState, EngineCommand][] = [
      [reconState, engineCommand(E.complete, matchedClause)],
      [reconState, engineCommand(E.verify, matchedClause, false)],
      [reconState, engineCommand(E.verify, matchedClause, true)],
      [decisionsState, engineCommand(E.complete, matchedClause)],
      [decisionsState, engineCommand(E.verify, matchedClause, false)],
      [decisionsState, engineCommand(E.verify, matchedClause, true)],
      [executingState, engineCommand(E.complete, unmatchedClause)],
      [executingState, engineCommand(E.verify, unmatchedClause, false)],
      [executingState, engineCommand(E.verify, unmatchedClause, true)],
      [convergenceState, engineCommand(E.complete, unmatchedClause)],
      [convergenceState, engineCommand(E.verify, unmatchedClause, false)],
      [convergenceState, engineCommand(E.verify, unmatchedClause, true)],
    ];

    for (const [state, command] of holdCases) {
      const result = stepCampaign(state, createCampaignEngineEvent(runtime, command));
      expect(result.state).toBe(state);
      expect(result.entry).toMatchObject({
        from: state.state,
        to: state.state,
        trigger: command.op,
        decision: D.hold,
        accepted: false,
        charterClause: null,
      });
    }
  });

  it("retains expected behavior for approved, clause-matched complete and verify", () => {
    const executingState = stateAt(S.executing);
    const convergenceState = stateAt(S.convergence);

    const completed = stepCampaign(executingState, createCampaignEngineEvent(runtime, engineCommand(E.complete, matchedClause)));
    expect(completed.state.state).toBe(S.completed);
    expect(completed.entry).toMatchObject({
      from: S.executing,
      to: S.completed,
      trigger: E.complete,
      decision: D.close,
      signal: "completed",
      charterClause: matchedClause,
      phase: P.terminal,
      channel: "engine",
      accepted: true,
    });

    const convergenceComplete = stepCampaign(convergenceState, createCampaignEngineEvent(runtime, engineCommand(E.complete, matchedClause)));
    expect(convergenceComplete.state).toBe(convergenceState);
    expect(convergenceComplete.entry).toMatchObject({
      from: S.convergence,
      to: S.convergence,
      trigger: E.complete,
      decision: D.hold,
      accepted: false,
      charterClause: null,
    });

    for (const state of [executingState, convergenceState]) {
      const failVerify = stepCampaign(state, createCampaignEngineEvent(runtime, engineCommand(E.verify, matchedClause, false)));
      expect(failVerify.state.state).toBe(state.state);
      expect(failVerify.entry).toMatchObject({
        from: state.state,
        to: state.state,
        trigger: E.verify,
        decision: D.explore,
        signal: "behavioral-failure",
        charterClause: matchedClause,
        channel: "engine",
        accepted: true,
      });

      const passVerify = stepCampaign(state, createCampaignEngineEvent(runtime, engineCommand(E.verify, matchedClause, true)));
      expect(passVerify.state.state).toBe(state.state);
      expect(passVerify.entry).toMatchObject({
        from: state.state,
        to: state.state,
        trigger: E.verify,
        decision: D.recover,
        signal: "behavioral-recovery",
        charterClause: matchedClause,
        channel: "engine",
        accepted: true,
      });
    }
  });

  it.each(terminalStates)("%s remains absorbing for runtime and untrusted terminal claims", stateName => {
    const state = stateAt(stateName);
    for (const op of terminalOps) {
      const trusted = createCampaignEngineEvent(runtime, engineCommand(op, unmatchedClause));
      const raw = engineCommand(op, unmatchedClause);
      expect(stepCampaign(state, trusted).state).toBe(state);
      expect(stepCampaign(state, raw).state).toBe(state);
      expect(stepCampaign(state, { channel: "agent", op: A.open }).state).toBe(state);
    }
    expect(stepCampaign(state, createCampaignOperatorEvent(operator, { channel: "operator", op: O.stop })).state).toBe(state);
  });
});
