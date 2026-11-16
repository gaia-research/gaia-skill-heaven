import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  type CampaignCharter,
  type CampaignRecon,
  type ConvergenceIncident,
} from "skill-zero";

import { CampaignStore } from "../src/campaign/store.js";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeTempSessionRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-session-store-"));
  cleanupRoots.push(root);
  return root;
}

const reconPayload: CampaignRecon = {
  schema: CAMPAIGN_SCHEMA_IDS.recon,
  findings: ["Existing test suite passes"],
  citations: ["citation:tests"],
};

function makeCharter(revision = 1): CampaignCharter {
  return {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision,
    goal: "Persist and verify campaign state",
    allowedSkills: ["skill-alpha"],
    queue: [
      {
        id: "unit-1",
        skill: "skill-alpha",
        reconCitation: "citation:tests",
      },
    ],
    recoverLimit: 2,
    reopenLimit: 2,
    sessionRetention: 24,
    clauses: ["verify-command", "termination"],
  };
}

const incidentPayload: ConvergenceIncident = {
  schema: CAMPAIGN_SCHEMA_IDS.incident,
  id: "inc-1",
  description: "Needs operator answer",
  skills: ["skill-alpha"],
  requiresPerson: true,
};

describe("CampaignStore persistence and verification", () => {
  it("appends trace.jsonl, writes status.json via toControllerStatus, and reloads cleanly", async () => {
    const root = await makeTempSessionRoot();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();

    const store = await CampaignStore.load(root);
    expect(store.hasTrace).toBe(false);
    expect(store.corrupted).toBe(false);
    expect(store.state.state).toBe(CampaignStates.unarmed);

    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "recon", recon: reconPayload });
    await store.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    await store.append({ channel: "agent", op: "incident", incident: incidentPayload });
    const answered = await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "answer",
        incidentId: "inc-1",
        answer: "proceed",
      }),
    );
    await store.append(
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: false,
        clause: "verify-command",
      }),
    );

    expect(answered.state.state).toBe(CampaignStates.executing);
    expect(answered.status.schema).toBe(CAMPAIGN_SCHEMA_IDS.status);

    const statusJson = JSON.parse(await readFile(store.statusPath, "utf8")) as Record<string, unknown>;
    expect(statusJson).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.executing,
      effective: "high",
      progress: { completed: 0, total: 1 },
      transition: {
        from: CampaignStates.executing,
        to: CampaignStates.executing,
        reason: "verify",
      },
    });

    const reloaded = await CampaignStore.load(root);
    expect(reloaded.hasTrace).toBe(true);
    expect(reloaded.corrupted).toBe(false);
    expect(reloaded.state.state).toBe(CampaignStates.executing);
    expect(reloaded.state.approved).toBe(true);
    expect(reloaded.state.steering.rung).toBe("high");
    expect(reloaded.trace).toHaveLength(7);
  });

  it("loads malformed, truncated, and blank-line traces as FAILED_SAFE without repairing", async () => {
    for (const mutate of [
      (raw: string) => `${raw}{"seq":2,"event":`,
      (raw: string) => `${raw}\n`,
      (raw: string) => `not-json\n${raw}`,
    ]) {
      const root = await makeTempSessionRoot();
      const store = await CampaignStore.load(root);
      await store.append({ channel: "agent", op: "open" });
      await store.append({ channel: "agent", op: "recon", recon: reconPayload });

      const original = await readFile(store.tracePath, "utf8");
      const corrupted = mutate(original);
      await writeFile(store.tracePath, corrupted, "utf8");

      const reloaded = await CampaignStore.load(root);
      expect(reloaded.corrupted).toBe(true);
      expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
      expect(await readFile(store.tracePath, "utf8")).toBe(corrupted);
      await expect(reloaded.append({ channel: "agent", op: "open" })).rejects.toThrow(
        /corrupted|FAILED_SAFE/u,
      );
      expect(await readFile(store.tracePath, "utf8")).toBe(corrupted);
    }
  });

  it("rejects forged operator/engine claims in trace.jsonl and refuses append after corruption", async () => {
    const root = await makeTempSessionRoot();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "recon", recon: reconPayload });
    await store.append({ channel: "agent", op: "propose", charter: makeCharter(1) });

    // Forge an operator approval directly into trace.jsonl without matching evidence.
    const forgedLine = JSON.stringify({
      seq: 3,
      event: {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      },
      entry: {
        seq: 3,
        from: CampaignStates.decisions,
        to: CampaignStates.executing,
        trigger: "decide",
        decision: "EXPLORE",
        signal: "decision",
        charterRevision: 1,
        charterClause: "operator-control-plane",
        skills: ["skill-alpha"],
        phase: "execution",
        workUnit: null,
        personRequired: true,
        channel: "operator",
        accepted: true,
      },
    });
    const before = await readFile(store.tracePath, "utf8");
    await writeFile(store.tracePath, `${before}${forgedLine}\n`, "utf8");

    const reloaded = await CampaignStore.load(root);
    expect(reloaded.corrupted).toBe(true);
    expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
    await expect(reloaded.append({ channel: "agent", op: "status" })).rejects.toThrow(
      /corrupted|FAILED_SAFE/u,
    );
  });

  it("detects trailing no-op deletion and trace-only field tampering via separately bound evidence", async () => {
    const root = await makeTempSessionRoot();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "status" }); // trailing no-op

    const lines = (await readFile(store.tracePath, "utf8")).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    await writeFile(store.tracePath, `${lines[0]}\n`, "utf8");

    const reloaded = await CampaignStore.load(root);
    expect(reloaded.corrupted).toBe(true);
    expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
  });

  it("supports an external trusted authorize callback seam when provided", async () => {
    const root = await makeTempSessionRoot();
    const opCap = createCampaignOperatorAdapter();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "recon", recon: reconPayload });
    await store.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );

    // Remove sibling evidence.jsonl so only the caller's authorize callback can vouch for index 3.
    await rm(store.evidencePath);

    const untrusted = await CampaignStore.load(root);
    expect(untrusted.corrupted).toBe(true);
    expect(untrusted.state.state).toBe(CampaignStates.failedSafe);

    const trusted = await CampaignStore.load(root, {
      authorize: (event, index) =>
        index === 3 && event.channel === "operator" && event.op === "decide",
    });
    expect(trusted.corrupted).toBe(false);
    expect(trusted.state.state).toBe(CampaignStates.executing);
  });

  it("refuses symlinked campaign directory and symlinked campaign files", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "skill-summon-outside-"));
    cleanupRoots.push(outside);

    // 1. Symlinked campaign/ directory
    const root1 = await makeTempSessionRoot();
    await symlink(outside, path.join(root1, "campaign"), "dir");
    await expect(CampaignStore.load(root1)).rejects.toThrow(/symlink/u);

    // 2. Symlinked trace.jsonl inside real campaign/ directory
    const root2 = await makeTempSessionRoot();
    await mkdir(path.join(root2, "campaign"));
    await writeFile(path.join(outside, "trace.jsonl"), "", "utf8");
    await symlink(
      path.join(outside, "trace.jsonl"),
      path.join(root2, "campaign", "trace.jsonl"),
      "file",
    );
    await expect(CampaignStore.load(root2)).rejects.toThrow(/symlink/u);

    // 3. Symlinked status.json before append
    const root3 = await makeTempSessionRoot();
    const store3 = await CampaignStore.load(root3);
    await mkdir(path.join(root3, "campaign"));
    await writeFile(path.join(outside, "status.json"), "{}", "utf8");
    await symlink(
      path.join(outside, "status.json"),
      path.join(root3, "campaign", "status.json"),
      "file",
    );
    await expect(store3.append({ channel: "agent", op: "open" })).rejects.toThrow(/symlink/u);
    expect((await lstat(path.join(outside, "status.json"))).size).toBe(2);
  });

  it("serializes Promise.all concurrent appends deterministically without duplicate seq", async () => {
    const root = await makeTempSessionRoot();
    const opCap = createCampaignOperatorAdapter();
    const store = await CampaignStore.load(root);

    const results = await Promise.all([
      store.append({ channel: "agent", op: "open" }),
      store.append({ channel: "agent", op: "recon", recon: reconPayload }),
      store.append({ channel: "agent", op: "propose", charter: makeCharter(1) }),
      store.append(
        createCampaignOperatorEvent(opCap, {
          channel: "operator",
          op: "decide",
          action: "approve",
          charterRevision: 1,
        }),
      ),
    ]);

    expect(results.map((r) => r.entry.seq)).toEqual([0, 1, 2, 3]);
    expect(store.state.state).toBe(CampaignStates.executing);

    const reloaded = await CampaignStore.load(root);
    expect(reloaded.corrupted).toBe(false);
    expect(reloaded.trace.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(reloaded.state.state).toBe(CampaignStates.executing);
  });

  it("refuses append when on-disk trace is externally tampered or stale between load and append without modifying disk", async () => {
    // 1. External tamper between load and append
    const root1 = await makeTempSessionRoot();
    const store1 = await CampaignStore.load(root1);
    await store1.append({ channel: "agent", op: "open" });
    await store1.append({ channel: "agent", op: "recon", recon: reconPayload });

    const originalTrace = await readFile(store1.tracePath, "utf8");
    const tamperedTrace = `${originalTrace}{"seq":2,"event":bad\n`;
    await writeFile(store1.tracePath, tamperedTrace, "utf8");
    const evidenceBefore = await readFile(store1.evidencePath, "utf8");
    const statusBefore = await readFile(store1.statusPath, "utf8");

    await expect(
      store1.append({ channel: "agent", op: "propose", charter: makeCharter(1) }),
    ).rejects.toThrow(/corrupted|Refusing to append/u);

    expect(await readFile(store1.tracePath, "utf8")).toBe(tamperedTrace);
    expect(await readFile(store1.evidencePath, "utf8")).toBe(evidenceBefore);
    expect(await readFile(store1.statusPath, "utf8")).toBe(statusBefore);

    // 2. Stale in-memory store (another writer appended between load and append)
    const root2 = await makeTempSessionRoot();
    const writerA = await CampaignStore.load(root2);
    const writerB = await CampaignStore.load(root2);
    await writerA.append({ channel: "agent", op: "open" });

    const traceAfterA = await readFile(writerA.tracePath, "utf8");
    const evidenceAfterA = await readFile(writerA.evidencePath, "utf8");
    const statusAfterA = await readFile(writerA.statusPath, "utf8");

    await expect(
      writerB.append({ channel: "agent", op: "open" }),
    ).rejects.toThrow(/changed since load|Refusing to append/u);

    expect(await readFile(writerA.tracePath, "utf8")).toBe(traceAfterA);
    expect(await readFile(writerA.evidencePath, "utf8")).toBe(evidenceAfterA);
    expect(await readFile(writerA.statusPath, "utf8")).toBe(statusAfterA);
  });

  it("fails closed on partial write failures", async () => {
    if (process.getuid?.() === 0) return;
    const root = await makeTempSessionRoot();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });

    // Make evidence.jsonl read-only so trace append succeeds and evidence append fails.
    await chmod(store.evidencePath, 0o444);
    try {
      await expect(
        store.append({ channel: "agent", op: "recon", recon: reconPayload }),
      ).rejects.toThrow();

      // In-memory store did not advance and refuses further appends.
      expect(store.trace).toHaveLength(1);
      await expect(
        store.append({ channel: "agent", op: "status" }),
      ).rejects.toThrow(/corrupted|FAILED_SAFE/u);
    } finally {
      await chmod(store.evidencePath, 0o600);
    }

    // Reloading the partially written store fails closed into FAILED_SAFE.
    const reloaded = await CampaignStore.load(root);
    expect(reloaded.corrupted).toBe(true);
    expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
  });

  it("regenerates missing or stale status.json on load without rewriting trace/evidence, projects FAILED_SAFE on corrupt trace, and stays write-free when absent", async () => {
    // 1. Absent campaign remains write-free
    const emptyRoot = await makeTempSessionRoot();
    const emptyStore = await CampaignStore.load(emptyRoot);
    expect(emptyStore.hasTrace).toBe(false);
    expect(emptyStore.corrupted).toBe(false);
    await expect(access(emptyStore.campaignDir)).rejects.toThrow();

    // 2. Missing or stale status.json after restart derives from verified fold
    const root = await makeTempSessionRoot();
    const opCap = createCampaignOperatorAdapter();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });
    await store.append({ channel: "agent", op: "recon", recon: reconPayload });
    await store.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await store.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );

    const traceBefore = await readFile(store.tracePath, "utf8");
    const evidenceBefore = await readFile(store.evidencePath, "utf8");

    // Delete status.json and reload
    await rm(store.statusPath);
    const reloadedMissing = await CampaignStore.load(root);
    expect(reloadedMissing.corrupted).toBe(false);
    expect(reloadedMissing.state.state).toBe(CampaignStates.executing);
    const regeneratedFromMissing = JSON.parse(
      await readFile(store.statusPath, "utf8"),
    ) as Record<string, unknown>;
    expect(regeneratedFromMissing).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.executing,
    });
    expect(await readFile(store.tracePath, "utf8")).toBe(traceBefore);
    expect(await readFile(store.evidencePath, "utf8")).toBe(evidenceBefore);

    // Overwrite status.json with stale UNARMED and reload
    await writeFile(
      store.statusPath,
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.unarmed }),
      "utf8",
    );
    await CampaignStore.load(root);
    const regeneratedFromStale = JSON.parse(
      await readFile(store.statusPath, "utf8"),
    ) as Record<string, unknown>;
    expect(regeneratedFromStale).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.executing,
    });

    // 3. Corrupt trace must not leave observable EXECUTING status pretending healthy
    const corruptTrace = `${traceBefore}{"seq":4,"event":corrupt\n`;
    await writeFile(store.tracePath, corruptTrace, "utf8");
    const reloadedCorrupt = await CampaignStore.load(root);
    expect(reloadedCorrupt.corrupted).toBe(true);
    expect(reloadedCorrupt.state.state).toBe(CampaignStates.failedSafe);
    const statusAfterCorrupt = JSON.parse(
      await readFile(store.statusPath, "utf8"),
    ) as Record<string, unknown>;
    expect(statusAfterCorrupt).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
    expect(await readFile(store.tracePath, "utf8")).toBe(corruptTrace);
    expect(await readFile(store.evidencePath, "utf8")).toBe(evidenceBefore);
  });
});
