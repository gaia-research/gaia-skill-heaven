import { describe, expect, it } from "vitest";
import {
  AgentOps,
  CAMPAIGN_GATE_DECISIONS,
  CAMPAIGN_GATE_REFUSAL_CODES,
  CAMPAIGN_GATE_REFUSAL_TEXT,
  CAMPAIGN_SCHEMA_IDS,
  CAMPAIGN_SIGNALS,
  CampaignDecisions,
  CampaignGateDecisions,
  CampaignGateRefusalCodes,
  CampaignPhases,
  CampaignSignals,
  CampaignStates,
  DecisionActions,
  EngineOps,
  OperatorVerbs,
  PUBLISH_CLASS_DENY_LIST,
  PublishDenyListClasses,
  assertSkillIndex,
  buildSkillIndex,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  explainCampaignTransition,
  formatCampaignTraceLine,
  initialCampaignState,
  isValidCharterForRecon,
  parseCampaignCharter,
  parseCampaignEvent,
  parseCampaignRecon,
  parseCampaignTraceEntry,
  parseCampaignTraceLines,
  replayCampaign,
  stepCampaign,
  verifyCampaignRecord,
  verifyCampaignTraceLines,
  type CampaignCharter,
  type CampaignEvent,
  type SkillIndex,
} from "../src/index.js";

function makeRecon() {
  const parsed = parseCampaignRecon({
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    findings: ["example/planned-skill covers planned coding workflow"],
    citations: ["recon-cit-1", "recon-cit-2"],
  });
  if (!parsed) throw new Error("Failed to construct valid test recon");
  return parsed;
}

function makeCharter(overrides: Partial<CampaignCharter> = {}): CampaignCharter {
  const parsed = parseCampaignCharter({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: 1,
    goal: "Ship U5 gate",
    allowedSkills: ["example/planned-skill"],
    queue: [
      {
        id: "wu-1",
        skill: "example/planned-skill",
        reconCitation: "recon-cit-1",
        phase: CampaignPhases.execution,
      },
    ],
    recoverLimit: 1,
    reopenLimit: 1,
    sessionRetention: 3,
    clauses: ["authority-split-enforced"],
    ...overrides,
  });
  if (!parsed) throw new Error("Failed to construct valid test charter");
  return parsed;
}

describe("U5 core vocabulary, schema, engine, and explain", () => {
  it("exports frozen T8 publish deny-list classes and non-prescriptive refusal text", () => {
    expect(PUBLISH_CLASS_DENY_LIST).toEqual([
      PublishDenyListClasses.publishToExternalChannels,
      PublishDenyListClasses.secretBearingWrites,
      PublishDenyListClasses.destructiveInfraMutation,
      PublishDenyListClasses.schemaQueueMigrations,
    ]);
    expect(Object.isFrozen(PUBLISH_CLASS_DENY_LIST)).toBe(true);
    expect(Object.isFrozen(CAMPAIGN_GATE_REFUSAL_TEXT)).toBe(true);
    expect(CAMPAIGN_GATE_DECISIONS).toEqual([
      CampaignGateDecisions.allow,
      CampaignGateDecisions.allowUnplanned,
      CampaignGateDecisions.refuse,
    ]);
    expect(CAMPAIGN_GATE_REFUSAL_CODES).toEqual([
      CampaignGateRefusalCodes.humanLedAutomatic,
      CampaignGateRefusalCodes.publishDenyList,
      CampaignGateRefusalCodes.charterExcluded,
      CampaignGateRefusalCodes.notExecuting,
      CampaignGateRefusalCodes.unitWaitingOnPerson,
    ]);
    expect(CAMPAIGN_SIGNALS).toContain(CampaignSignals.unplanned);

    const bannedWord = ["rat", "ify"].join("");
    for (const code of CAMPAIGN_GATE_REFUSAL_CODES) {
      const text = CAMPAIGN_GATE_REFUSAL_TEXT[code];
      expect(text.toLowerCase()).not.toContain(bannedWord);
      expect(text.toLowerCase()).not.toContain("search harder");
      expect(text.toLowerCase()).not.toContain("try another skill");
      expect(text.startsWith("Refused:")).toBe(true);
    }
  });

  it("validates charter excludedSkills against invalid values and overlap with allowedSkills/queue", () => {
    const charterWithExcluded = makeCharter({
      excludedSkills: ["example/excluded-skill"],
    });
    expect(charterWithExcluded.excludedSkills).toEqual(["example/excluded-skill"]);

    expect(
      parseCampaignCharter({
        ...makeCharter(),
        excludedSkills: ["   "],
      }),
    ).toBeNull();

    const recon = makeRecon();
    expect(isValidCharterForRecon(recon, charterWithExcluded, 1)).toBe(true);

    const overlappingAllowed = makeCharter({
      excludedSkills: ["example/planned-skill"],
    });
    expect(isValidCharterForRecon(recon, overlappingAllowed, 1)).toBe(false);
  });

  it("validates IndexedSkill.denyListClass in assertSkillIndex", () => {
    const baseIndex = buildSkillIndex({
      projection: {
        generatedAt: "2026-11-19T00:00:00Z",
        buckets: {
          email: [
            {
              id: "example/publish-skill",
              name: "Publish Skill",
              contributor: "example",
              description: "Sends emails via SMTP",
              tags: ["email"],
              links: { github: "https://github.com/example/publish-skill" },
              invocation: "any",
              denyListClass: PublishDenyListClasses.publishToExternalChannels,
            },
          ],
        },
      },
      source: "https://example.invalid/skills",
      sourceDigest: "sha256:" + "0".repeat(64),
      builderVersion: "0.1.0",
      generatedAt: "2026-11-19T00:00:00Z",
    });

    expect(() => assertSkillIndex(baseIndex)).not.toThrow();
    expect(baseIndex.docs[0]?.denyListClass).toBe(
      PublishDenyListClasses.publishToExternalChannels,
    );

    const invalidIndex = {
      ...baseIndex,
      docs: [{ ...baseIndex.docs[0]!, denyListClass: "not-a-t8-class" }],
    } as unknown as SkillIndex;
    expect(() => assertSkillIndex(invalidIndex)).toThrow(/denyListClass/u);
  });

  it("folds, verifies, replays, and explains A.summon unplanned events deterministically", () => {
    const recon = makeRecon();
    const charter = makeCharter({
      excludedSkills: ["example/excluded-skill"],
    });
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();

    const events: CampaignEvent[] = [
      { channel: "agent", op: AgentOps.open },
      { channel: "agent", op: AgentOps.recon, recon },
      { channel: "agent", op: AgentOps.propose, charter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: OperatorVerbs.decide,
        action: DecisionActions.approve,
        charterRevision: 1,
      }),
      {
        channel: "agent",
        op: AgentOps.summon,
        unplanned: true,
        skills: ["example/unplanned-helper"],
        workUnit: "wu-1",
      },
      // Excluded skill is refused in engine state machine
      {
        channel: "agent",
        op: AgentOps.summon,
        unplanned: true,
        skills: ["example/excluded-skill"],
        workUnit: "wu-1",
      },
      // Non-unplanned agent summon op is refused
      {
        channel: "agent",
        op: AgentOps.summon,
        unplanned: false,
        skills: ["example/planned-skill"],
        workUnit: "wu-1",
      },
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: EngineOps.verify,
        passed: true,
        clause: "authority-split-enforced",
        workUnit: "wu-1",
      }),
    ];

    let state = initialCampaignState();
    const steps: Array<ReturnType<typeof stepCampaign>> = [];
    for (let i = 0; i < events.length; i++) {
      const step = stepCampaign(state, events[i], i);
      expect(parseCampaignTraceEntry(step.entry)).toEqual(step.entry);
      steps.push(step);
      state = step.state;
    }

    const unplannedStep = steps[4]!;
    expect(unplannedStep.entry.accepted).toBe(true);
    expect(unplannedStep.entry.signal).toBe(CampaignSignals.unplanned);
    expect(unplannedStep.entry.trigger).toBe(AgentOps.summon);
    expect(unplannedStep.entry.skills).toEqual(["example/unplanned-helper"]);
    expect(unplannedStep.entry.workUnit).toBe("wu-1");
    expect(
      explainCampaignTransition(
        unplannedStep.entry.from,
        unplannedStep.entry.to,
        unplannedStep.entry.decision,
        unplannedStep.entry.signal,
        unplannedStep.entry.personRequired,
      ),
    ).toContain("unplanned");

    expect(steps[5]!.entry.accepted).toBe(false);
    expect(steps[5]!.entry.decision).toBe(CampaignDecisions.hold);
    expect(steps[6]!.entry.accepted).toBe(false);

    const replayed = replayCampaign(events, { authorize: () => true });
    expect(replayed.final).toEqual(state);
    expect(replayed.trace[4]).toEqual(unplannedStep.entry);
    const verifiedRecord = verifyCampaignRecord(replayed.record, { authorize: () => true });
    expect(verifiedRecord.valid).toBe(true);
    if (verifiedRecord.valid) {
      expect(verifiedRecord.record.final).toEqual(state);
    }

    // JSONL round-trip verification
    const jsonl = events
      .map((ev, i) =>
        formatCampaignTraceLine({ seq: i, event: ev, entry: steps[i]!.entry }),
      )
      .join("\n");
    const parsedLines = parseCampaignTraceLines(jsonl);
    expect(parsedLines.ok).toBe(true);
    if (parsedLines.ok) {
      const lineVerify = verifyCampaignTraceLines(parsedLines.lines, {
        authorize: () => true,
      });
      expect(lineVerify.valid).toBe(true);
      if (lineVerify.valid) {
        expect(lineVerify.record.final).toEqual(state);
      }
    }

    // Outside EXECUTING (e.g. RECON), A.summon is refused
    const reconReplay = replayCampaign(
      [
        { channel: "agent", op: AgentOps.open },
        {
          channel: "agent",
          op: AgentOps.summon,
          unplanned: true,
          skills: ["example/unplanned-helper"],
        },
      ],
      { authorize: () => true },
    );
    expect(reconReplay.trace[1]!.accepted).toBe(false);
    expect(reconReplay.final.state).toBe(CampaignStates.recon);

    expect(
      parseCampaignEvent({
        channel: "agent",
        op: AgentOps.summon,
        unplanned: "yes",
        skills: ["example/unplanned"],
      }),
    ).toBeNull();
  });
});
