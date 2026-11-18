import { describe, expect, it } from "vitest";
import {
  AgentOps as A,
  CampaignStates as S,
  CAMPAIGN_SCHEMA_IDS as IDs,
  DecisionActions as D,
  OperatorVerbs as O,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  initialCampaignState,
  parseCampaignState,
  stepCampaign,
  type CampaignCharter,
  type CampaignState,
} from "../src/index.js";

const recon = { schema: IDs.recon, findings: ["Synthetic finding"], citations: ["citation:source"] } as const;
const open = { channel: "agent", op: A.open } as const;
const reconEvent = { channel: "agent", op: A.recon, recon } as const;
const charter = (queue: CampaignCharter["queue"]): CampaignCharter => ({
  schema: IDs.charter,
  revision: 1,
  goal: "Synthetic goal",
  allowedSkills: ["skill-a"],
  queue,
  recoverLimit: 0,
  reopenLimit: 0,
  sessionRetention: 0,
  clauses: ["termination"],
});
const proposal = (value: CampaignCharter) => ({ channel: "agent", op: A.propose, charter: value });
const afterRecon = () => {
  const state = stepCampaign(stepCampaign(initialCampaignState(), open).state, reconEvent).state;
  expect(state.state).toBe(S.recon);
  return state;
};
const validCharter = (revision = 1, queue: CampaignCharter["queue"] = [{ id: "unit-a", skill: "skill-a", reconCitation: "citation:source" }]): CampaignCharter => ({
  ...charter(queue),
  revision,
});
const validDecisionsState = (): CampaignState => {
  const result = stepCampaign(afterRecon(), proposal(validCharter(1)));
  expect(result.state.state).toBe(S.decisions);
  return result.state;
};
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const operatorAdapter = createCampaignOperatorAdapter();
const approveEvent = (charterRevision = 1) =>
  createCampaignOperatorEvent(operatorAdapter, {
    channel: "operator",
    op: O.decide,
    action: D.approve,
    charterRevision,
  });

describe("campaign charter proposal validation", () => {
  it("holds an empty-queue proposal even after successful cited recon", () => {
    const state = afterRecon();
    expect(state.recon?.citations).toEqual(["citation:source"]);

    const result = stepCampaign(state, proposal(charter([])));

    expect(result.state).toBe(state);
    expect(result.state.state).toBe(S.recon);
    expect(result.entry).toMatchObject({ decision: "HOLD", accepted: false });
  });

  it("accepts a nonempty proposal whose queue item cites recon", () => {
    const state = afterRecon();
    const value = charter([{ id: "unit-a", skill: "skill-a", reconCitation: "citation:source" }]);

    const result = stepCampaign(state, proposal(value));

    expect(result.state.state).toBe(S.decisions);
    expect(result.state.charter).toEqual(value);
    expect(result.state.queue).toEqual(value.queue);
    expect(result.entry).toMatchObject({ decision: "DECISIONS", signal: "proposal", accepted: true, charterClause: "recon.citations" });
  });

  it("rejects a nonempty proposal with a bogus recon citation", () => {
    const state = afterRecon();
    const value = charter([{ id: "unit-a", skill: "skill-a", reconCitation: "citation:invented" }]);

    const result = stepCampaign(state, proposal(value));

    expect(result.state).toBe(state);
    expect(result.state.state).toBe(S.recon);
    expect(result.entry).toMatchObject({ decision: "HOLD", accepted: false });
  });
});

describe("campaign state charter validation", () => {
  it("rejects tampered empty queues and empty recon citations at both parser and step boundaries", () => {
    const base = cloneJson(validDecisionsState()) as Record<string, unknown>;
    const tampered = {
      ...base,
      queue: [],
      total: 0,
      charter: { ...(base.charter as Record<string, unknown>), queue: [] },
      recon: { ...(base.recon as Record<string, unknown>), citations: [] },
    } as unknown as CampaignState;

    expect(parseCampaignState(tampered)).toBeNull();
    expect(() => stepCampaign(tampered, approveEvent(1))).toThrow("Invalid campaign state");
  });

  it("rejects tampered serialized/resume states with empty queues, missing citations, duplicates, or inconsistent envelopes", () => {
    const base = validDecisionsState();
    const cases: Array<[string, (s: CampaignState) => unknown]> = [
      [
        "empty charter/state queue even with cited recon",
        s => ({ ...cloneJson(s), queue: [], total: 0, charter: { ...cloneJson(s.charter!), queue: [] } }),
      ],
      [
        "empty recon citations with nonempty queue",
        s => ({ ...cloneJson(s), recon: { ...cloneJson(s.recon!), citations: [] } }),
      ],
      [
        "uncited queue item",
        s => {
          const q = [{ id: "unit-a", skill: "skill-a", reconCitation: "citation:invented" }];
          return { ...cloneJson(s), queue: q, charter: { ...cloneJson(s.charter!), queue: q } };
        },
      ],
      [
        "duplicate queue item ids",
        s => {
          const q = [
            { id: "unit-a", skill: "skill-a", reconCitation: "citation:source" },
            { id: "unit-a", skill: "skill-a", reconCitation: "citation:source" },
          ];
          return { ...cloneJson(s), queue: q, total: 2, charter: { ...cloneJson(s.charter!), queue: q } };
        },
      ],
      [
        "duplicate allowedSkills",
        s => ({
          ...cloneJson(s),
          charter: { ...cloneJson(s.charter!), allowedSkills: ["skill-a", "skill-a"] },
        }),
      ],
      [
        "queue skill outside allowedSkills envelope",
        s => {
          const q = [{ id: "unit-a", skill: "skill-b", reconCitation: "citation:source" }];
          return { ...cloneJson(s), queue: q, charter: { ...cloneJson(s.charter!), queue: q } };
        },
      ],
      [
        "empty charter clauses",
        s => ({ ...cloneJson(s), charter: { ...cloneJson(s.charter!), clauses: [] } }),
      ],
      [
        "charter revision mismatch",
        s => ({ ...cloneJson(s), charter: { ...cloneJson(s.charter!), revision: 2 } }),
      ],
      [
        "charterRevision zero with non-null charter",
        s => ({ ...cloneJson(s), charterRevision: 0, charter: { ...cloneJson(s.charter!), revision: 0 } }),
      ],
      [
        "null recon with non-null charter",
        s => ({ ...cloneJson(s), recon: null }),
      ],
      [
        "state queue diverging from charter queue",
        s => ({
          ...cloneJson(s),
          queue: [{ id: "unit-b", skill: "skill-a", reconCitation: "citation:source" }],
        }),
      ],
    ];

    for (const [, mutate] of cases) {
      const tampered = mutate(base) as CampaignState;
      expect(parseCampaignState(tampered)).toBeNull();
      expect(() => stepCampaign(tampered, approveEvent(1))).toThrow("Invalid campaign state");
    }
  });

  it("parses and acts on valid decided, approved, and amended states across serialization", () => {
    const decided = parseCampaignState(cloneJson(validDecisionsState()));
    expect(decided).not.toBeNull();

    const approvedStep = stepCampaign(decided!, approveEvent(1));
    expect(approvedStep.entry).toMatchObject({ decision: "EXPLORE", accepted: true });
    expect(approvedStep.state.state).toBe(S.executing);
    expect(approvedStep.state.approved).toBe(true);

    const executing = parseCampaignState(cloneJson(approvedStep.state));
    expect(executing).not.toBeNull();

    const amendEvent = createCampaignOperatorEvent(operatorAdapter, {
      channel: "operator",
      op: O.amend,
      charter: { ...validCharter(2), goal: "Amended synthetic goal" },
    });
    const amendedStep = stepCampaign(executing!, amendEvent);
    expect(amendedStep.entry).toMatchObject({ decision: "DECISIONS", signal: "amendment", accepted: true });
    expect(amendedStep.state.state).toBe(S.decisions);
    expect(amendedStep.state.charterRevision).toBe(2);
    expect(amendedStep.state.approved).toBe(false);

    const amendedParsed = parseCampaignState(cloneJson(amendedStep.state));
    expect(amendedParsed).not.toBeNull();

    const reapprovedStep = stepCampaign(amendedParsed!, approveEvent(2));
    expect(reapprovedStep.entry).toMatchObject({ decision: "EXPLORE", accepted: true });
    expect(reapprovedStep.state.state).toBe(S.executing);
    expect(reapprovedStep.state.charterRevision).toBe(2);
    expect(reapprovedStep.state.approved).toBe(true);
  });
});
