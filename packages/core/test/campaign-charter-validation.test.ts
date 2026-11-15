import { describe, expect, it } from "vitest";
import {
  AgentOps as A,
  CampaignStates as S,
  CAMPAIGN_SCHEMA_IDS as IDs,
  initialCampaignState,
  stepCampaign,
  type CampaignCharter,
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
