import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  CAMPAIGN_DECISIONS,
  CAMPAIGN_SCHEMA_IDS,
  CampaignDecisions,
  CampaignStates,
  ReceiptStatuses,
  campaignSha256Hex,
  canonicalCampaignJson,
  createAttestedReceipt,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  explainCampaignTransition,
  formatCampaignEvidenceLine,
  formatCampaignTraceLine,
  formatVerifyReceiptLine,
  parseVerifyReceiptLines,
  replayCampaign,
  serializeCampaignRecord,
  type CampaignCharter,
  type CampaignRecon,
  type ConvergenceIncident,
} from "../src/index.js";

const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");
const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-zero-campaign-cli-"));
  cleanupDirs.push(dir);
  return dir;
}

const recon: CampaignRecon = {
  schema: CAMPAIGN_SCHEMA_IDS.recon,
  findings: ["Finding 1"],
  citations: ["cit:1"],
};

const charter: CampaignCharter = {
  schema: CAMPAIGN_SCHEMA_IDS.charter,
  revision: 1,
  goal: "Verify CLI campaign flags",
  allowedSkills: ["skill-a"],
  queue: [{ id: "u1", skill: "skill-a", reconCitation: "cit:1" }],
  recoverLimit: 2,
  reopenLimit: 2,
  sessionRetention: 12,
  clauses: ["verify-command", "termination"],
};

const personIncident: ConvergenceIncident = {
  schema: CAMPAIGN_SCHEMA_IDS.incident,
  id: "inc-person",
  description: "Need operator input",
  skills: ["skill-a"],
  requiresPerson: true,
};

function writePersistedTrace(dir: string, events: readonly unknown[]): {
  tracePath: string;
  evidencePath: string;
} {
  const opCap = createCampaignOperatorAdapter();
  const engCap = createCampaignEngineAdapter();
  const replayed = replayCampaign(events, {
    authorize: (ev) => ev.channel === "operator" || ev.channel === "engine",
  });
  void opCap;
  void engCap;

  const traceLines: string[] = [];
  const evidenceLines: string[] = [];
  for (let i = 0; i < replayed.trace.length; i++) {
    const entry = replayed.trace[i]!;
    const descriptor = replayed.record.events[i]!;
    traceLines.push(formatCampaignTraceLine({ seq: i, event: descriptor, entry }));
    const partial = replayCampaign(events.slice(0, i + 1), {
      authorize: (ev) => ev.channel === "operator" || ev.channel === "engine",
    }).record;
    evidenceLines.push(
      formatCampaignEvidenceLine({
        seq: i,
        authorizedPrivileged:
          (entry.channel === "operator" || entry.channel === "engine") && entry.accepted,
        eventSha256: campaignSha256Hex(canonicalCampaignJson(descriptor)),
        recordSha256: campaignSha256Hex(serializeCampaignRecord(partial)),
      }),
    );
  }

  const tracePath = join(dir, "trace.jsonl");
  const evidencePath = join(dir, "evidence.jsonl");
  writeFileSync(tracePath, `${traceLines.join("\n")}\n`, "utf8");
  writeFileSync(evidencePath, `${evidenceLines.join("\n")}\n`, "utf8");
  return { tracePath, evidencePath };
}

describe("campaign CLI flags (--campaign-verify, --campaign-explain)", () => {
  it("enforces standalone flag discipline against unrelated flags", () => {
    const dir = makeTempDir();
    const { tracePath } = writePersistedTrace(dir, [{ channel: "agent", op: "open" }]);

    for (const extra of [["--print"], ["--posture", "floor"], ["--steering-verify", tracePath], ["--campaign-explain", tracePath]]) {
      const res = spawnSync(
        process.execPath,
        [bin, "--campaign-verify", tracePath, ...extra],
        { encoding: "utf8" },
      );
      expect(res.status, extra.join(" ")).toBe(2);
      expect(res.stderr).toMatch(/standalone|cannot be combined/u);
    }
  });

  it("verifies valid persisted trace.jsonl and agent-only traces with exit 0", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();

    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "complete",
        clause: "termination",
      }),
    ]);

    const res = spawnSync(process.execPath, [bin, "--campaign-verify", tracePath], {
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout)).toMatchObject({
      valid: true,
      schema: CAMPAIGN_SCHEMA_IDS.trace,
      state: CampaignStates.completed,
      traceLength: 5,
    });

    // Agent-only trace.jsonl without sibling evidence.jsonl also verifies cleanly.
    const agentDir = makeTempDir();
    const agentReplayed = replayCampaign([
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
    ]);
    const agentTrace = join(agentDir, "trace.jsonl");
    writeFileSync(
      agentTrace,
      agentReplayed.trace
        .map((entry, i) =>
          formatCampaignTraceLine({
            seq: i,
            event: agentReplayed.record.events[i]!,
            entry,
          }),
        )
        .join("\n") + "\n",
      "utf8",
    );
    const agentRes = spawnSync(process.execPath, [bin, "--campaign-verify", agentTrace], {
      encoding: "utf8",
    });
    expect(agentRes.status).toBe(0);
    expect(JSON.parse(agentRes.stdout)).toMatchObject({
      valid: true,
      state: CampaignStates.recon,
      traceLength: 2,
    });
  });

  it("exits non-zero on tampered, truncated, or un-evidenced privileged traces", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const { tracePath, evidencePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    ]);

    // 1. Tamper with an entry field in trace.jsonl
    const original = spawnSync("cat", [tracePath], { encoding: "utf8" }).stdout;
    const tamperedField = original.replace('"goal":"Verify CLI campaign flags"', '"goal":"Tampered"');
    const tamperedPath = join(dir, "tampered.jsonl");
    writeFileSync(tamperedPath, tamperedField, "utf8");
    const r1 = spawnSync(process.execPath, [bin, "--campaign-verify", tamperedPath], {
      encoding: "utf8",
    });
    expect(r1.status).toBe(2);

    // 2. Truncated trace.jsonl
    const truncatedPath = join(dir, "truncated.jsonl");
    writeFileSync(truncatedPath, `${original}{"seq":4,"event":`, "utf8");
    const r2 = spawnSync(process.execPath, [bin, "--campaign-verify", truncatedPath], {
      encoding: "utf8",
    });
    expect(r2.status).toBe(2);

    // 3. Remove evidence.jsonl so operator approval has no independent evidence -> fails
    rmSync(evidencePath);
    const r3 = spawnSync(process.execPath, [bin, "--campaign-verify", tracePath], {
      encoding: "utf8",
    });
    expect(r3.status).toBe(2);
    expect(r3.stderr).toContain("invalid campaign trace");
  });

  it("explains every campaign transition kind via --campaign-explain", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();

    // Sequence covering RECON, DECISIONS, EXPLORE, CONVERGENCE, HOLD (person-required),
    // CHECKPOINT, RECOVER, CLOSE.
    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" }, // RECON
      { channel: "agent", op: "recon", recon }, // RECON
      { channel: "agent", op: "propose", charter }, // DECISIONS
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }), // EXPLORE
      { channel: "agent", op: "incident", incident: personIncident }, // CONVERGENCE
      { channel: "agent", op: "next" }, // HOLD (person-required)
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "answer",
        incidentId: "inc-person",
        answer: "ok",
      }), // EXPLORE
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "checkpoint",
      }), // CHECKPOINT
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: false,
        clause: "verify-command",
      }), // EXPLORE
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
      }), // RECOVER
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "complete",
        clause: "termination",
      }), // CLOSE
    ]);

    const res1 = spawnSync(process.execPath, [bin, "--campaign-explain", tracePath], {
      encoding: "utf8",
    });
    expect(res1.status).toBe(0);
    expect(res1.stdout).toContain("The campaign gathered reconnaissance.");
    expect(res1.stdout).toContain("The campaign awaits an operator decision.");
    expect(res1.stdout).toContain("The campaign continued execution or exploration.");
    expect(res1.stdout).toContain("The campaign entered convergence.");
    expect(res1.stdout).toContain("Automatic continuation was refused; an operator answer is required.");
    expect(res1.stdout).toContain("The operator recorded a checkpoint.");
    expect(res1.stdout).toContain("The working rung converged after a verification pass.");
    expect(res1.stdout).toContain("The runtime reported campaign completion.");

    // Also cover STOP and REOPEN via persisted JSONL trace entries in --campaign-explain.
    const extraDir = makeTempDir();
    const stopTrace = replayCampaign([
      { channel: "agent", op: "open" },
      createCampaignOperatorEvent(opCap, { channel: "operator", op: "stop" }),
    ]);
    const reopenEntry = {
      ...stopTrace.trace[0]!,
      seq: 2,
      from: CampaignStates.executing,
      to: CampaignStates.executing,
      decision: CampaignDecisions.reopen,
      signal: "work-ready" as const,
      phase: "execution" as const,
    };
    const extraPath = join(extraDir, "extra.jsonl");
    writeFileSync(
      extraPath,
      [
        formatCampaignTraceLine({
          seq: 0,
          event: stopTrace.record.events[0]!,
          entry: stopTrace.trace[0]!,
        }),
        formatCampaignTraceLine({
          seq: 1,
          event: stopTrace.record.events[1]!,
          entry: stopTrace.trace[1]!,
        }),
        formatCampaignTraceLine({
          seq: 2,
          event: null,
          entry: reopenEntry,
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const res2 = spawnSync(process.execPath, [bin, "--campaign-explain", extraPath], {
      encoding: "utf8",
    });
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain("The campaign ended.");
    expect(res2.stdout).toContain("The campaign reopened a path.");

    // Verify every CAMPAIGN_DECISIONS member produces a non-empty explanation.
    for (const decision of CAMPAIGN_DECISIONS) {
      const text = explainCampaignTransition(
        CampaignStates.executing,
        CampaignStates.executing,
        decision,
        "work-ready",
      );
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

describe("campaign CLI --campaign-replay-receipts", () => {
  it("enforces standalone flag discipline for --campaign-replay-receipts", () => {
    const dir = makeTempDir();
    const { tracePath } = writePersistedTrace(dir, [{ channel: "agent", op: "open" }]);

    for (const extra of [
      ["--print"],
      ["--posture", "floor"],
      ["--steering-verify", tracePath],
      ["--campaign-verify", tracePath],
      ["--campaign-explain", tracePath],
    ]) {
      const res = spawnSync(
        process.execPath,
        [bin, "--campaign-replay-receipts", tracePath, ...extra],
        { encoding: "utf8" },
      );
      expect(res.status, extra.join(" ")).toBe(2);
      expect(res.stderr).toMatch(/standalone|cannot be combined/u);
    }
  });

  it("refuses tampered or unverified traces without running any commands", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();
    const sentinel = join(dir, "ran.txt");
    const cmd = `printf 'ran' > ${JSON.stringify(sentinel)}`;
    const localCharter: CampaignCharter = {
      ...charter,
      acceptanceCommands: [cmd],
    };
    const receipt = createAttestedReceipt({
      unitId: "u1",
      command: cmd,
      output: "",
      exitCode: 0,
    });

    const { tracePath, evidencePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter: localCharter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
        workUnit: "u1",
        closesUnit: true,
        receipt,
      }),
    ]);

    const receiptsPath = join(dir, "receipts.jsonl");
    writeFileSync(receiptsPath, `${formatVerifyReceiptLine(receipt)}\n`, "utf8");

    // 1. Tampered trace.jsonl
    const originalTrace = readFileSync(tracePath, "utf8");
    const tamperedPath = join(dir, "tampered.jsonl");
    writeFileSync(tamperedPath, originalTrace.replace('"goal":"Verify CLI campaign flags"', '"goal":"Tampered"'), "utf8");
    const r1 = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tamperedPath], {
      encoding: "utf8",
    });
    expect(r1.status).toBe(2);
    expect(r1.stderr).toContain("invalid campaign trace");
    expect(existsSync(sentinel)).toBe(false);

    // 2. Missing evidence.jsonl -> unverified privileged trace
    rmSync(evidencePath);
    const r2 = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(r2.status).toBe(2);
    expect(r2.stderr).toContain("invalid campaign trace");
    expect(existsSync(sentinel)).toBe(false);
  });

  it("upgrades matching receipts in receipts.jsonl, leaves mismatched ones attested, and keeps --campaign-verify valid", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();

    const matchingCmd = "printf 'ok-match\\n'";
    const mismatchedDigestCmd = "printf 'actual-output\\n'";
    const mismatchedExitCmd = "exit 3";
    const localCharter: CampaignCharter = {
      ...charter,
      acceptanceCommands: [matchingCmd],
    };

    const rMatch = createAttestedReceipt({
      unitId: "u1",
      command: matchingCmd,
      output: "ok-match\n",
      exitCode: 0,
    });
    const rMismatchDigest = createAttestedReceipt({
      unitId: "u1",
      command: mismatchedDigestCmd,
      output: "stale-expected-output\n",
      exitCode: 0,
    });
    const rMismatchExit = createAttestedReceipt({
      unitId: "u1",
      command: mismatchedExitCmd,
      output: "",
      exitCode: 0,
    });

    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter: localCharter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
        workUnit: "u1",
        closesUnit: true,
        receipt: rMatch,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: false,
        clause: "verify-command",
        workUnit: "u1",
        receipt: rMismatchDigest,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: false,
        clause: "verify-command",
        workUnit: "u1",
        receipt: rMismatchExit,
      }),
    ]);

    const receiptsPath = join(dir, "receipts.jsonl");
    writeFileSync(
      receiptsPath,
      [
        formatVerifyReceiptLine(rMatch),
        formatVerifyReceiptLine(rMismatchDigest),
        formatVerifyReceiptLine(rMismatchExit),
      ].join("\n") + "\n",
      "utf8",
    );

    const replayRes = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(replayRes.status).toBe(0);
    const parsedStdout = JSON.parse(replayRes.stdout);
    expect(parsedStdout).toMatchObject({
      valid: true,
      schema: CAMPAIGN_SCHEMA_IDS.receipt,
      total: 3,
      upgraded: 1,
      unchanged: 2,
    });
    expect(parsedStdout.receipts).toHaveLength(3);
    expect(parsedStdout.receipts[0]).toMatchObject({
      status: ReceiptStatuses.replayed,
      replayedExitCode: 0,
      replayedOutputSha256: rMatch.outputSha256,
    });
    expect(parsedStdout.receipts[1].status).toBe(ReceiptStatuses.attested);
    expect(parsedStdout.receipts[1].replayedExitCode).toBeUndefined();
    expect(parsedStdout.receipts[2].status).toBe(ReceiptStatuses.attested);
    expect(parsedStdout.receipts[2].replayedExitCode).toBeUndefined();

    // Verify receipts.jsonl on disk was updated accordingly.
    const persistedReceipts = parseVerifyReceiptLines(readFileSync(receiptsPath, "utf8"));
    expect(persistedReceipts.ok).toBe(true);
    if (persistedReceipts.ok) {
      expect(persistedReceipts.lines[0]?.status).toBe(ReceiptStatuses.replayed);
      expect(persistedReceipts.lines[1]?.status).toBe(ReceiptStatuses.attested);
      expect(persistedReceipts.lines[2]?.status).toBe(ReceiptStatuses.attested);
    }

    // Verify trace.jsonl and evidence.jsonl were not modified so --campaign-verify still passes.
    const verifyRes = spawnSync(process.execPath, [bin, "--campaign-verify", tracePath], {
      encoding: "utf8",
    });
    expect(verifyRes.status).toBe(0);
    expect(JSON.parse(verifyRes.stdout)).toMatchObject({
      valid: true,
      state: CampaignStates.executing,
    });
  });

  it("returns empty replay summary when trace has 0 E.verify receipts and sibling receipts.jsonl does not exist", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    ]);

    const res = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out).toMatchObject({
      valid: true,
      schema: CAMPAIGN_SCHEMA_IDS.receipt,
      total: 0,
      upgraded: 0,
      unchanged: 0,
      receipts: [],
    });
    expect(existsSync(join(dir, "receipts.jsonl"))).toBe(false);
  });

  it("rejects missing sibling receipts.jsonl when verified trace contains E.verify receipts without running any command", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();
    const sentinel = join(dir, "missing-receipts-ran.txt");
    const cmd = `printf 'ran' > ${JSON.stringify(sentinel)}`;
    const localCharter: CampaignCharter = {
      ...charter,
      acceptanceCommands: [cmd],
    };

    const receipt = createAttestedReceipt({
      unitId: "u1",
      command: cmd,
      output: "",
      exitCode: 0,
    });

    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter: localCharter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
        workUnit: "u1",
        closesUnit: true,
        receipt,
      }),
    ]);

    expect(existsSync(join(dir, "receipts.jsonl"))).toBe(false);
    const res = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("invalid campaign receipts: missing sibling receipts.jsonl for verified trace with receipts");
    expect(existsSync(sentinel)).toBe(false);
  });

  it("rejects mismatched, extra, missing, or unaccepted-event sidecar receipts.jsonl before running any command", () => {
    const dir = makeTempDir();
    const opCap = createCampaignOperatorAdapter();
    const engCap = createCampaignEngineAdapter();
    const sentinel = join(dir, "injected-ran.txt");
    const safeCmd = "printf 'safe'";
    const injectedCmd = `printf 'injected' > ${JSON.stringify(sentinel)}`;
    const localCharter: CampaignCharter = {
      ...charter,
      acceptanceCommands: [safeCmd],
    };

    const acceptedReceipt = createAttestedReceipt({
      unitId: "u1",
      command: safeCmd,
      output: "safe",
      exitCode: 0,
    });
    const injectedReceipt = createAttestedReceipt({
      unitId: "u1",
      command: injectedCmd,
      output: "",
      exitCode: 0,
    });

    // Include one accepted E.verify and one refused (unaccepted) E.verify with injectedReceipt
    const { tracePath } = writePersistedTrace(dir, [
      { channel: "agent", op: "open" },
      { channel: "agent", op: "recon", recon },
      { channel: "agent", op: "propose", charter: localCharter },
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
        workUnit: "u1",
        closesUnit: true,
        receipt: acceptedReceipt,
      }),
      // Unaccepted E.verify (closesUnit: true with unnamed command)
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "verify",
        passed: true,
        clause: "verify-command",
        workUnit: "u1",
        closesUnit: true,
        receipt: injectedReceipt,
      }),
    ]);

    const receiptsPath = join(dir, "receipts.jsonl");

    // 1. Modified command in receipts.jsonl
    writeFileSync(receiptsPath, `${formatVerifyReceiptLine(injectedReceipt)}\n`, "utf8");
    const rModified = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(rModified.status).toBe(2);
    expect(rModified.stderr).toContain("invalid campaign receipts");
    expect(existsSync(sentinel)).toBe(false);

    // 2. Extra receipt in receipts.jsonl (including one matching an unaccepted trace event)
    writeFileSync(
      receiptsPath,
      `${formatVerifyReceiptLine(acceptedReceipt)}\n${formatVerifyReceiptLine(injectedReceipt)}\n`,
      "utf8",
    );
    const rExtra = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(rExtra.status).toBe(2);
    expect(rExtra.stderr).toContain("invalid campaign receipts");
    expect(existsSync(sentinel)).toBe(false);

    // 3. Missing receipt (empty receipts.jsonl when trace has 1 accepted verify receipt)
    writeFileSync(receiptsPath, "", "utf8");
    const rMissing = spawnSync(process.execPath, [bin, "--campaign-replay-receipts", tracePath], {
      encoding: "utf8",
    });
    expect(rMissing.status).toBe(2);
    expect(rMissing.stderr).toContain("invalid campaign receipts");
    expect(existsSync(sentinel)).toBe(false);
  });
});
