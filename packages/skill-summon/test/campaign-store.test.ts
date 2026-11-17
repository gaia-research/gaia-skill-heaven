import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { vi } from "vitest";

const hookState = vi.hoisted(() => {
  return {
    beforeOp: undefined as
      | ((op: string, args: readonly unknown[]) => Promise<void> | void)
      | undefined,
    afterOp: undefined as
      | ((
          op: string,
          args: readonly unknown[],
          result: unknown,
        ) => Promise<void> | void)
      | undefined,
    afterError: undefined as
      | ((
          op: string,
          args: readonly unknown[],
          error: unknown,
        ) => Promise<void> | void)
      | undefined,
  };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  const wrap = <T extends (...args: never[]) => Promise<unknown>>(
    name: string,
    fn: T,
  ): T =>
    vi.fn(async (...args: Parameters<T>) => {
      if (hookState.beforeOp) {
        await hookState.beforeOp(name, args as readonly unknown[]);
      }
      try {
        const result = await fn(...args);
        if (hookState.afterOp) {
          await hookState.afterOp(name, args as readonly unknown[], result);
        }
        return result;
      } catch (error) {
        if (hookState.afterError) {
          await hookState.afterError(name, args as readonly unknown[], error);
        }
        throw error;
      }
    }) as unknown as T;

  return {
    ...actual,
    appendFile: wrap("appendFile", actual.appendFile),
    lstat: wrap("lstat", actual.lstat),
    mkdir: wrap("mkdir", actual.mkdir),
    mkdtemp: wrap("mkdtemp", actual.mkdtemp),
    open: wrap("open", actual.open),
    readFile: wrap("readFile", actual.readFile),
    readdir: wrap("readdir", actual.readdir),
    realpath: wrap("realpath", actual.realpath),
    rename: wrap("rename", actual.rename),
    rm: wrap("rm", actual.rm),
    stat: wrap("stat", actual.stat),
    unlink: wrap("unlink", actual.unlink),
    writeFile: wrap("writeFile", actual.writeFile),
  };
});

import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  formatCampaignEvidenceLine,
  parseCampaignEvidenceLines,
  type CampaignCharter,
  type CampaignRecon,
  type ConvergenceIncident,
} from "skill-zero";

import { CampaignStore } from "../src/campaign/store.js";
import {
  acquireCampaignStoreClaimForRoot,
  type CampaignStoreClaimBorrow,
  ROOT_SESSION_CLAIM_FILE,
  sessionClaimDirName,
} from "../src/summon/session-ownership.js";

const require = createRequire(import.meta.url);
const tsxCli = path.join(
  path.dirname(require.resolve("tsx/package.json")),
  "dist/cli.mjs",
);

const cleanupRoots: string[] = [];

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  hookState.beforeOp = undefined;
  hookState.afterOp = undefined;
  hookState.afterError = undefined;
});

afterEach(async () => {
  hookState.beforeOp = undefined;
  hookState.afterOp = undefined;
  hookState.afterError = undefined;
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

  it("loads FAILED_SAFE when trace.jsonl alone is deleted while evidence or status survives, preserving artifacts and replacing old status", async () => {
    const opCap = createCampaignOperatorAdapter();

    // 1. Delete trace.jsonl alone while both evidence.jsonl and status.json survive
    const root1 = await makeTempSessionRoot();
    const store1 = await CampaignStore.load(root1);
    await store1.append({ channel: "agent", op: "open" });
    await store1.append({ channel: "agent", op: "recon", recon: reconPayload });
    await store1.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await store1.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    const evidenceBefore1 = await readFile(store1.evidencePath, "utf8");
    await rm(store1.tracePath);

    const reloaded1 = await CampaignStore.load(root1);
    expect(reloaded1.corrupted).toBe(true);
    expect(reloaded1.state.state).toBe(CampaignStates.failedSafe);
    expect(await readFile(store1.evidencePath, "utf8")).toBe(evidenceBefore1);
    const status1 = JSON.parse(await readFile(store1.statusPath, "utf8")) as Record<string, unknown>;
    expect(status1).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
    await expect(reloaded1.append({ channel: "agent", op: "status" })).rejects.toThrow(
      /corrupted|FAILED_SAFE/u,
    );

    // 2. Delete trace.jsonl and status.json while evidence.jsonl survives -> FAILED_SAFE
    const root2 = await makeTempSessionRoot();
    const store2 = await CampaignStore.load(root2);
    await store2.append({ channel: "agent", op: "open" });
    const evidenceBefore2 = await readFile(store2.evidencePath, "utf8");
    await rm(store2.tracePath);
    await rm(store2.statusPath);

    const reloaded2 = await CampaignStore.load(root2);
    expect(reloaded2.corrupted).toBe(true);
    expect(reloaded2.state.state).toBe(CampaignStates.failedSafe);
    expect(await readFile(store2.evidencePath, "utf8")).toBe(evidenceBefore2);

    // 3. Delete trace.jsonl and evidence.jsonl while status.json survives -> FAILED_SAFE
    const root3 = await makeTempSessionRoot();
    const store3 = await CampaignStore.load(root3);
    await store3.append({ channel: "agent", op: "open" });
    await rm(store3.tracePath);
    await rm(store3.evidencePath);

    const reloaded3 = await CampaignStore.load(root3);
    expect(reloaded3.corrupted).toBe(true);
    expect(reloaded3.state.state).toBe(CampaignStates.failedSafe);
    const status3 = JSON.parse(await readFile(store3.statusPath, "utf8")) as Record<string, unknown>;
    expect(status3).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
  });

  it("loads FAILED_SAFE when an injected authorize callback throws during replay", async () => {
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

    const reloaded = await CampaignStore.load(root, {
      authorize: () => {
        throw new Error("evidence unavailable");
      },
    });
    expect(reloaded.corrupted).toBe(true);
    expect(reloaded.state.state).toBe(CampaignStates.failedSafe);
    const statusAfter = JSON.parse(
      await readFile(store.statusPath, "utf8"),
    ) as Record<string, unknown>;
    expect(statusAfter).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
  });

  it("supports read-only load with refreshStatus: false without writing missing, stale, or FAILED_SAFE status.json", async () => {
    const root = await makeTempSessionRoot();
    const store = await CampaignStore.load(root);
    await store.append({ channel: "agent", op: "open" });

    // Missing status.json stays absent when refreshStatus: false
    await rm(store.statusPath);
    const roMissing = await CampaignStore.load(root, { refreshStatus: false });
    expect(roMissing.hasTrace).toBe(true);
    expect(roMissing.corrupted).toBe(false);
    expect(roMissing.state.state).toBe(CampaignStates.recon);
    await expect(lstat(store.statusPath)).rejects.toThrow();

    // Stale status.json stays untouched when refreshStatus: false
    await writeFile(store.statusPath, "{\"stale\":true}\n", "utf8");
    const roStale = await CampaignStore.load(root, { refreshStatus: false });
    expect(roStale.corrupted).toBe(false);
    expect(roStale.state.state).toBe(CampaignStates.recon);
    expect(await readFile(store.statusPath, "utf8")).toBe("{\"stale\":true}\n");

    // Corrupt trace still reports FAILED_SAFE in memory without overwriting status.json
    await writeFile(store.tracePath, `${await readFile(store.tracePath, "utf8")}corrupt\n`, "utf8");
    const roCorrupt = await CampaignStore.load(root, { refreshStatus: false });
    expect(roCorrupt.hasTrace).toBe(true);
    expect(roCorrupt.corrupted).toBe(true);
    expect(roCorrupt.state.state).toBe(CampaignStates.failedSafe);
    expect(await readFile(store.statusPath, "utf8")).toBe("{\"stale\":true}\n");

    // Default load (refreshStatus: true) still refreshes status.json to FAILED_SAFE
    const rwCorrupt = await CampaignStore.load(root);
    expect(rwCorrupt.corrupted).toBe(true);
    expect(JSON.parse(await readFile(store.statusPath, "utf8"))).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
  });

  it("folds read-only (refreshStatus: false) independently of directory/unreadable/symlink/malformed status.json while default load still refuses unsafe status writes", async () => {
    const opCap = createCampaignOperatorAdapter();
    const seedApproved = async (root: string) => {
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
      return store;
    };

    // 1. status.json replaced by a directory
    const dirRoot = await makeTempSessionRoot();
    const dirStore = await seedApproved(dirRoot);
    await rm(dirStore.statusPath);
    await mkdir(dirStore.statusPath);

    const roDir = await CampaignStore.load(dirRoot, { refreshStatus: false });
    expect(roDir.corrupted).toBe(false);
    expect(roDir.state.approved).toBe(true);
    expect(roDir.state.state).toBe(CampaignStates.executing);
    expect(roDir.recordSha256).toBe(dirStore.recordSha256);
    await expect(CampaignStore.load(dirRoot)).rejects.toThrow(/regular file/u);

    // 2. status.json replaced by a symlink pointing outside sessionRoot
    const symRoot = await makeTempSessionRoot();
    const symStore = await seedApproved(symRoot);
    const outsideDir = await makeTempSessionRoot();
    const outsideTarget = path.join(outsideDir, "outside-status.json");
    await writeFile(outsideTarget, "OUTSIDE-SENTINEL", "utf8");
    const outsideBefore = await lstat(outsideTarget);
    await rm(symStore.statusPath);
    await symlink(outsideTarget, symStore.statusPath, "file");

    const roSym = await CampaignStore.load(symRoot, { refreshStatus: false });
    expect(roSym.corrupted).toBe(false);
    expect(roSym.state.approved).toBe(true);
    expect(roSym.state.state).toBe(CampaignStates.executing);
    expect(roSym.recordSha256).toBe(symStore.recordSha256);
    expect(await readFile(outsideTarget, "utf8")).toBe("OUTSIDE-SENTINEL");
    expect((await lstat(outsideTarget)).mtimeMs).toBe(outsideBefore.mtimeMs);

    await expect(CampaignStore.load(symRoot)).rejects.toThrow(/symlink/u);
    expect(await readFile(outsideTarget, "utf8")).toBe("OUTSIDE-SENTINEL");

    // 3. status.json unreadable (0o000)
    if (process.getuid?.() !== 0) {
      const unredRoot = await makeTempSessionRoot();
      const unredStore = await seedApproved(unredRoot);
      await chmod(unredStore.statusPath, 0o000);
      try {
        const roUnred = await CampaignStore.load(unredRoot, { refreshStatus: false });
        expect(roUnred.corrupted).toBe(false);
        expect(roUnred.state.approved).toBe(true);
        expect(roUnred.state.state).toBe(CampaignStates.executing);
        await expect(CampaignStore.load(unredRoot)).rejects.toThrow();
      } finally {
        await chmod(unredStore.statusPath, 0o600);
      }
    }

    // 4. status.json malformed JSON
    const badRoot = await makeTempSessionRoot();
    const badStore = await seedApproved(badRoot);
    await writeFile(badStore.statusPath, "{not-json", "utf8");

    const roBad = await CampaignStore.load(badRoot, { refreshStatus: false });
    expect(roBad.corrupted).toBe(false);
    expect(roBad.state.state).toBe(CampaignStates.executing);
    expect(await readFile(badStore.statusPath, "utf8")).toBe("{not-json");

    const rwBad = await CampaignStore.load(badRoot);
    expect(rwBad.corrupted).toBe(false);
    expect(JSON.parse(await readFile(badStore.statusPath, "utf8"))).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.executing,
    });
  });

  it("excludes concurrent appends across independently loaded stores via deterministic FS barriers across compare, trace, evidence, and status projection without corrupting or clobbering winner", async () => {
    const root = await makeTempSessionRoot();
    const initial = await CampaignStore.load(root);
    await initial.append({ channel: "agent", op: "open" });

    // Barrier phases:
    // 1. Before appendFile(tracePath) (after disk compare & stepCampaign)
    // 2. Between appendFile(tracePath) and appendFile(evidencePath)
    // 3. Between appendFile(evidencePath) and writeFile(statusPath)
    for (const [phaseIndex, barrierTarget] of [
      ["appendFile", initial.tracePath],
      ["appendFile", initial.evidencePath],
      ["writeFile", initial.statusPath],
    ] as const) {
      const storeA = await CampaignStore.load(root);
      const storeB = await CampaignStore.load(root);
      const expectedBeforeCount = storeA.trace.length;

      const storeAHitBarrier = deferred();
      const releaseStoreA = deferred();
      let storeASettled = false;
      let pausedOnce = false;

      hookState.beforeOp = async (op, args) => {
        if (!pausedOnce && op === phaseIndex && args[0] === barrierTarget) {
          pausedOnce = true;
          storeAHitBarrier.resolve();
          await releaseStoreA.promise;
        }
      };

      const appendA = storeA
        .append(
          expectedBeforeCount === 1
            ? { channel: "agent", op: "recon", recon: reconPayload }
            : { channel: "agent", op: "status" },
        )
        .then((res) => {
          storeASettled = true;
          return res;
        });

      await storeAHitBarrier.promise;
      expect(await readdir(root)).toContain(ROOT_SESSION_CLAIM_FILE);

      // While storeA holds the exclusion at the barrier, storeB MUST fail fast (nonblocking)
      // as busy BEFORE writing anything, and must not corrupt or overwrite disk.
      await expect(
        storeB.append({ channel: "agent", op: "status" }),
      ).rejects.toThrow(/ownership claim is busy/u);
      expect(storeASettled).toBe(false);
      expect(storeB.corrupted).toBe(false);

      releaseStoreA.resolve();
      const resA = await appendA;
      hookState.beforeOp = undefined;
      expect(resA.entry.seq).toBe(expectedBeforeCount);
      expect(await readdir(root)).not.toContain(ROOT_SESSION_CLAIM_FILE);

      // Winner's persisted trace, evidence, and status remain intact and valid.
      const winnerTrace = await readFile(initial.tracePath, "utf8");
      const winnerEvidence = await readFile(initial.evidencePath, "utf8");
      const winnerStatus = await readFile(initial.statusPath, "utf8");

      // Now that storeA committed and released, stale storeB MUST still be rejected cleanly
      // without overwriting winner's valid trace, evidence, or status.
      await expect(
        storeB.append({ channel: "agent", op: "status" }),
      ).rejects.toThrow(/changed since load|Refusing to append/u);
      expect(await readFile(initial.tracePath, "utf8")).toBe(winnerTrace);
      expect(await readFile(initial.evidencePath, "utf8")).toBe(winnerEvidence);
      expect(await readFile(initial.statusPath, "utf8")).toBe(winnerStatus);

      // Reloaded store is completely valid, sequences/evidence coherent, and retry succeeds.
      const reloaded = await CampaignStore.load(root);
      expect(reloaded.corrupted).toBe(false);
      expect(reloaded.trace.map((e) => e.seq)).toEqual(
        Array.from({ length: expectedBeforeCount + 1 }, (_, i) => i),
      );
      const retried = await reloaded.append({ channel: "agent", op: "status" });
      expect(retried.entry.seq).toBe(expectedBeforeCount + 1);
    }
  });

  it("serializes Promise.allSettled races across two independently loaded stores (both fresh and populated) and supports clean reload + retry", async () => {
    const root = await makeTempSessionRoot();

    // 1. Fresh root race between storeA and storeB
    const freshA = await CampaignStore.load(root);
    const freshB = await CampaignStore.load(root);
    const freshOutcomes = await Promise.allSettled([
      freshA.append({ channel: "agent", op: "open" }),
      freshB.append({ channel: "agent", op: "open" }),
    ]);

    const freshFulfilled = freshOutcomes.filter((o) => o.status === "fulfilled");
    const freshRejected = freshOutcomes.filter((o) => o.status === "rejected");
    expect(freshFulfilled).toHaveLength(1);
    expect(freshRejected).toHaveLength(1);
    expect(freshFulfilled[0]!.value.entry.seq).toBe(0);

    const afterFresh = await CampaignStore.load(root);
    expect(afterFresh.corrupted).toBe(false);
    expect(afterFresh.trace.map((e) => e.seq)).toEqual([0]);

    // 2. Populated root race between storeC and storeD
    const storeC = await CampaignStore.load(root);
    const storeD = await CampaignStore.load(root);
    const nextOutcomes = await Promise.allSettled([
      storeC.append({ channel: "agent", op: "recon", recon: reconPayload }),
      storeD.append({ channel: "agent", op: "status" }),
    ]);
    const nextFulfilled = nextOutcomes.filter((o) => o.status === "fulfilled");
    const nextRejected = nextOutcomes.filter((o) => o.status === "rejected");
    expect(nextFulfilled).toHaveLength(1);
    expect(nextRejected).toHaveLength(1);
    expect(nextFulfilled[0]!.value.entry.seq).toBe(1);

    // Reload from disk, verify coherent, and retry an event cleanly.
    const reloaded = await CampaignStore.load(root);
    expect(reloaded.corrupted).toBe(false);
    expect(reloaded.trace.map((e) => e.seq)).toEqual([0, 1]);
    await reloaded.append({ channel: "agent", op: "status" });
    const reloadedFinal = await CampaignStore.load(root);
    expect(reloadedFinal.corrupted).toBe(false);
    expect(reloadedFinal.trace.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("enforces cross-process append exclusion across real Node child processes and keeps standalone isolated roots free of external state", async () => {
    // Use a standalone isolated root whose name does NOT start with "skill-summon-session-".
    const isolatedParent = await mkdtemp(path.join(tmpdir(), "standalone-campaign-parent-"));
    cleanupRoots.push(isolatedParent);
    const standaloneRoot = path.join(isolatedParent, "nested", "campaign-root");
    await mkdir(standaloneRoot, { recursive: true });

    const seed = await CampaignStore.load(standaloneRoot);
    await seed.append({ channel: "agent", op: "open" });

    const storeModuleUrl = pathToFileURL(
      path.resolve("packages/skill-summon/src/campaign/store.ts"),
    ).href;
    const ownershipModuleUrl = pathToFileURL(
      path.resolve("packages/skill-summon/src/summon/session-ownership.ts"),
    ).href;

    // 1. Child holds root-local campaign claim -> parent append rejects nonblocking without writing.
    const holderScript = path.join(isolatedParent, "hold-campaign-claim.mts");
    await writeFile(
      holderScript,
      `import { acquireCampaignStoreClaimForRoot } from ${JSON.stringify(ownershipModuleUrl)};
const [root] = process.argv.slice(2);
const claim = await acquireCampaignStoreClaimForRoot(root);
if (claim.status !== "acquired") {
  process.stderr.write("claim-failed:" + claim.status + "\\n");
  process.exit(2);
}
process.stdout.write("HELD\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("RELEASE")) {
    await claim.release();
    process.stdout.write("RELEASED\\n");
    process.exit(0);
  }
});
`,
      "utf8",
    );

    const parentStoreBeforeHold = await CampaignStore.load(standaloneRoot);

    const holder = spawn(process.execPath, [tsxCli, holderScript, standaloneRoot], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        let out = "";
        let err = "";
        holder.stdout.on("data", (d: Buffer) => {
          out += d.toString("utf8");
          if (out.includes("HELD\n")) resolve();
        });
        holder.stderr.on("data", (d: Buffer) => {
          err += d.toString("utf8");
        });
        holder.on("exit", (code) => {
          if (!out.includes("HELD\n")) {
            reject(new Error(`Holder exited early (${code}): ${err}`));
          }
        });
      });

      const traceBefore = await readFile(parentStoreBeforeHold.tracePath, "utf8");
      const evidenceBefore = await readFile(parentStoreBeforeHold.evidencePath, "utf8");
      const statusBefore = await readFile(parentStoreBeforeHold.statusPath, "utf8");

      // While child holds claim, parent load() (both default and read-only) and append() reject as busy.
      await expect(CampaignStore.load(standaloneRoot)).rejects.toThrow(
        /ownership claim is busy/u,
      );
      await expect(
        CampaignStore.load(standaloneRoot, { refreshStatus: false }),
      ).rejects.toThrow(/ownership claim is busy/u);
      await expect(
        parentStoreBeforeHold.append({ channel: "agent", op: "recon", recon: reconPayload }),
      ).rejects.toThrow(/ownership claim is busy/u);

      expect(await readFile(parentStoreBeforeHold.tracePath, "utf8")).toBe(traceBefore);
      expect(await readFile(parentStoreBeforeHold.evidencePath, "utf8")).toBe(evidenceBefore);
      expect(await readFile(parentStoreBeforeHold.statusPath, "utf8")).toBe(statusBefore);

      holder.stdin.write("RELEASE\n");
      await new Promise<void>((resolve, reject) => {
        holder.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Holder exited ${code}`));
        });
      });

      // Retry after release succeeds cleanly.
      const resAfterRelease = await parentStoreBeforeHold.append({
        channel: "agent",
        op: "recon",
        recon: reconPayload,
      });
      expect(resAfterRelease.entry.seq).toBe(1);
    } finally {
      if (holder.exitCode === null) holder.kill("SIGKILL");
    }

    // 2. Two real Node child processes concurrently race CampaignStore.load + append.
    const racerScript = path.join(isolatedParent, "race-store-append.mts");
    await writeFile(
      racerScript,
      `import { CampaignStore } from ${JSON.stringify(storeModuleUrl)};
const [root] = process.argv.slice(2);
const store = await CampaignStore.load(root);
process.stdout.write("READY\\n");
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  if (buf.includes("GO\\n")) {
    buf = buf.replace("GO\\n", "");
    try {
      const res = await store.append({ channel: "agent", op: "status" });
      process.stdout.write(JSON.stringify({ ok: true, seq: res.entry.seq }) + "\\n");
    } catch (err) {
      process.stdout.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + "\\n");
    }
    process.exit(0);
  }
});
`,
      "utf8",
    );

    const runRacer = () => {
      const child = spawn(process.execPath, [tsxCli, racerScript, standaloneRoot], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const ready = new Promise<void>((resolve, reject) => {
        const onData = (d: Buffer) => {
          out += d.toString("utf8");
          if (out.includes("READY\n")) {
            child.stdout.off("data", onData);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (d: Buffer) => {
          err += d.toString("utf8");
        });
        child.on("exit", (code) => {
          if (!out.includes("READY\n")) {
            reject(new Error(`Racer failed before READY (${code}): ${err}`));
          }
        });
      });
      const result = new Promise<{ ok: boolean; seq?: number; error?: string }>(
        (resolve, reject) => {
          const onData = (d: Buffer) => {
            out += d.toString("utf8");
            const line = out.split("\n").find((l) => l.startsWith("{"));
            if (line) {
              child.stdout.off("data", onData);
              resolve(
                JSON.parse(line) as { ok: boolean; seq?: number; error?: string },
              );
            }
          };
          child.stdout.on("data", onData);
          child.on("exit", (code) => {
            if (!out.split("\n").some((l) => l.startsWith("{"))) {
              reject(new Error(`Racer exited without JSON (${code}): ${err}`));
            }
          });
        },
      );
      return { child, ready, result };
    };

    const r1 = runRacer();
    await r1.ready;
    const r2 = runRacer();
    try {
      await r2.ready;
      r1.child.stdin.write("GO\n");
      r2.child.stdin.write("GO\n");

      const [res1, res2] = await Promise.all([r1.result, r2.result]);
      const successes = [res1, res2].filter((r) => r.ok);
      const failures = [res1, res2].filter((r) => !r.ok);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(successes[0]!.seq).toBe(2);

      // Reloaded state must be valid, coherent, and support subsequent append.
      const afterRace = await CampaignStore.load(standaloneRoot);
      expect(afterRace.corrupted).toBe(false);
      expect(afterRace.trace.map((e) => e.seq)).toEqual([0, 1, 2]);
      await afterRace.append({ channel: "agent", op: "status" });
      const afterRetry = await CampaignStore.load(standaloneRoot);
      expect(afterRetry.corrupted).toBe(false);
      expect(afterRetry.trace.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    } finally {
      for (const r of [r1, r2]) {
        if (r.child.exitCode === null) r.child.kill("SIGKILL");
      }
    }

    // Standalone non-session root never created an external claimsDir in isolatedParent or nested/.
    expect((await readdir(isolatedParent)).sort()).toEqual([
      "hold-campaign-claim.mts",
      "nested",
      "race-store-append.mts",
    ]);
    expect(await readdir(path.join(isolatedParent, "nested"))).toEqual([
      "campaign-root",
    ]);

    // 3. Symlinked .session.claim pointing outside standaloneRoot is refused conservatively.
    const storeSymClaim = await CampaignStore.load(standaloneRoot);
    const outsideTarget = path.join(isolatedParent, "outside-claim-target.txt");
    await writeFile(outsideTarget, "UNTOUCHED-CLAIM", "utf8");
    const localClaimPath = path.join(standaloneRoot, ROOT_SESSION_CLAIM_FILE);
    await symlink(outsideTarget, localClaimPath, "file");
    await expect(CampaignStore.load(standaloneRoot)).rejects.toThrow(
      /ownership claim is busy/u,
    );
    await expect(
      CampaignStore.load(standaloneRoot, { refreshStatus: false }),
    ).rejects.toThrow(/ownership claim is busy/u);
    await expect(
      storeSymClaim.append({ channel: "agent", op: "status" }),
    ).rejects.toThrow(/ownership claim is busy/u);
    expect(await readFile(outsideTarget, "utf8")).toBe("UNTOUCHED-CLAIM");

    // Verify standalone acquireCampaignStoreClaimForRoot behavior directly on non-existent root.
    const missingCheck = await acquireCampaignStoreClaimForRoot(
      path.join(isolatedParent, "does-not-exist"),
    );
    expect(missingCheck.status).toBe("ineligible");
  }, 20_000);

  it("refuses append before any disk mutation when historical evidence.jsonl is absent (callback-authorized or agent-only), without fabricating persistent provenance, while allowing append when complete evidence exists", async () => {
    // 1. Callback-authorized historical trace without evidence.jsonl
    const root1 = await makeTempSessionRoot();
    const opCap = createCampaignOperatorAdapter();
    const seed1 = await CampaignStore.load(root1);
    await seed1.append({ channel: "agent", op: "open" });
    await seed1.append({ channel: "agent", op: "recon", recon: reconPayload });
    await seed1.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await seed1.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    await rm(seed1.evidencePath);

    const authorizeApprove = (
      event: { channel: string; op: string },
      index: number,
    ) => index === 3 && event.channel === "operator" && event.op === "decide";

    const trustedNoEvidence = await CampaignStore.load(root1, {
      authorize: authorizeApprove,
    });
    expect(trustedNoEvidence.corrupted).toBe(false);
    expect(trustedNoEvidence.state.state).toBe(CampaignStates.executing);

    const traceSnapshot = await readFile(trustedNoEvidence.tracePath, "utf8");
    const statusSnapshot = await readFile(trustedNoEvidence.statusPath, "utf8");

    await expect(
      trustedNoEvidence.append({ channel: "agent", op: "status" }),
    ).rejects.toThrow(/historical campaign evidence is absent/u);
    await expect(
      trustedNoEvidence.append({ channel: "agent", op: "incident", incident: incidentPayload }),
    ).rejects.toThrow(/historical campaign evidence is absent/u);

    // Bytes, artifacts, and store non-corruption remain completely unchanged.
    expect(trustedNoEvidence.corrupted).toBe(false);
    expect(await readFile(trustedNoEvidence.tracePath, "utf8")).toBe(traceSnapshot);
    expect(await readFile(trustedNoEvidence.statusPath, "utf8")).toBe(statusSnapshot);
    await expect(access(trustedNoEvidence.evidencePath)).rejects.toThrow();
    await expect(
      access(path.join(root1, ROOT_SESSION_CLAIM_FILE)),
    ).rejects.toThrow();

    // Reload WITH callback still succeeds at original length 4; reload WITHOUT callback
    // still fails closed (callback authority was never fabricated into persistent provenance).
    const reloadedWithCallback = await CampaignStore.load(root1, {
      authorize: authorizeApprove,
    });
    expect(reloadedWithCallback.corrupted).toBe(false);
    expect(reloadedWithCallback.trace).toHaveLength(4);
    expect(reloadedWithCallback.state.state).toBe(CampaignStates.executing);

    const reloadedWithoutCallback = await CampaignStore.load(root1);
    expect(reloadedWithoutCallback.corrupted).toBe(true);
    expect(reloadedWithoutCallback.state.state).toBe(CampaignStates.failedSafe);

    // 2. Agent-only historical trace with evidence.jsonl deleted -> append also refuses cleanly.
    const root2 = await makeTempSessionRoot();
    const seed2 = await CampaignStore.load(root2);
    await seed2.append({ channel: "agent", op: "open" });
    await rm(seed2.evidencePath);
    const agentLoaded = await CampaignStore.load(root2);
    expect(agentLoaded.corrupted).toBe(false);
    const traceSnapshot2 = await readFile(agentLoaded.tracePath, "utf8");
    await expect(
      agentLoaded.append({ channel: "agent", op: "recon", recon: reconPayload }),
    ).rejects.toThrow(/historical campaign evidence is absent/u);
    expect(await readFile(agentLoaded.tracePath, "utf8")).toBe(traceSnapshot2);
    await expect(access(agentLoaded.evidencePath)).rejects.toThrow();

    // 3. External deletion of evidence.jsonl between callback-authorized load and append.
    const root3 = await makeTempSessionRoot();
    const seed3 = await CampaignStore.load(root3);
    await seed3.append({ channel: "agent", op: "open" });
    await seed3.append({ channel: "agent", op: "recon", recon: reconPayload });
    await seed3.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await seed3.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    const loadedWithEvidence = await CampaignStore.load(root3, {
      authorize: authorizeApprove,
    });
    await rm(seed3.evidencePath);
    const traceSnapshot3 = await readFile(loadedWithEvidence.tracePath, "utf8");
    const statusSnapshot3 = await readFile(loadedWithEvidence.statusPath, "utf8");
    await expect(
      loadedWithEvidence.append({ channel: "agent", op: "status" }),
    ).rejects.toThrow(/historical campaign evidence is absent/u);
    expect(await readFile(loadedWithEvidence.tracePath, "utf8")).toBe(traceSnapshot3);
    expect(await readFile(loadedWithEvidence.statusPath, "utf8")).toBe(statusSnapshot3);
    await expect(access(loadedWithEvidence.evidencePath)).rejects.toThrow();

    // 4. Normal history WITH complete evidence.jsonl loaded with authorize callback still appends & reloads.
    const root4 = await makeTempSessionRoot();
    const seed4 = await CampaignStore.load(root4);
    await seed4.append({ channel: "agent", op: "open" });
    await seed4.append({ channel: "agent", op: "recon", recon: reconPayload });
    await seed4.append({ channel: "agent", op: "propose", charter: makeCharter(1) });
    await seed4.append(
      createCampaignOperatorEvent(opCap, {
        channel: "operator",
        op: "decide",
        action: "approve",
        charterRevision: 1,
      }),
    );
    const completeLoaded = await CampaignStore.load(root4, {
      authorize: authorizeApprove,
    });
    const appended = await completeLoaded.append({
      channel: "agent",
      op: "incident",
      incident: incidentPayload,
    });
    expect(appended.entry.seq).toBe(4);
    expect(appended.state.state).toBe(CampaignStates.convergence);

    const reloadedComplete = await CampaignStore.load(root4);
    expect(reloadedComplete.corrupted).toBe(false);
    expect(reloadedComplete.trace.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(reloadedComplete.state.state).toBe(CampaignStates.convergence);
  });

  it("coordinates CampaignStore.load() verification and status projection with append exclusion across deterministic barriers (interleavings 1 & 2) and detects unstable read-only snapshots", async () => {
    // Interleaving 1: load() (both default and refreshStatus: false) during append() between
    // trace.jsonl write and evidence.jsonl write MUST fail fast as busy/unstable, MUST NOT
    // classify the valid trace as FAILED_SAFE, and MUST NOT overwrite status.json.
    const root1 = await makeTempSessionRoot();
    const seed1 = await CampaignStore.load(root1);
    await seed1.append({ channel: "agent", op: "open" });
    const statusBeforeInterleave1 = await readFile(seed1.statusPath, "utf8");

    const storeWriter1 = await CampaignStore.load(root1);
    const hitEvidenceBarrier = deferred();
    const releaseEvidenceWrite = deferred();
    let pausedBeforeEvidence = false;

    hookState.beforeOp = async (op, args) => {
      if (
        !pausedBeforeEvidence &&
        op === "appendFile" &&
        args[0] === storeWriter1.evidencePath
      ) {
        pausedBeforeEvidence = true;
        hitEvidenceBarrier.resolve();
        await releaseEvidenceWrite.promise;
      }
    };

    const append1Promise = storeWriter1.append({
      channel: "agent",
      op: "recon",
      recon: reconPayload,
    });
    await hitEvidenceBarrier.promise;

    // Between trace write and evidence write, trace has 2 lines and evidence has 1 line.
    expect(
      (await readFile(storeWriter1.tracePath, "utf8")).trimEnd().split("\n"),
    ).toHaveLength(2);
    expect(
      (await readFile(storeWriter1.evidencePath, "utf8")).trimEnd().split("\n"),
    ).toHaveLength(1);

    await expect(CampaignStore.load(root1)).rejects.toThrow(
      /ownership claim is busy/u,
    );
    await expect(
      CampaignStore.load(root1, { refreshStatus: false }),
    ).rejects.toThrow(/ownership claim is busy/u);
    expect(await readFile(seed1.statusPath, "utf8")).toBe(statusBeforeInterleave1);

    releaseEvidenceWrite.resolve();
    const appended1 = await append1Promise;
    hookState.beforeOp = undefined;
    expect(appended1.entry.seq).toBe(1);

    const afterInterleave1 = await CampaignStore.load(root1);
    expect(afterInterleave1.corrupted).toBe(false);
    expect(afterInterleave1.trace).toHaveLength(2);
    expect(JSON.parse(await readFile(seed1.statusPath, "utf8"))).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      transition: { reason: "recon" },
    });

    // Interleaving 2a: load() holds claim across verification and pauses right before writing
    // stale-replaced status.json -> concurrent append() MUST fail fast as busy without mutating disk,
    // load() publishes status matching the verified trace, and subsequent append() succeeds.
    const root2 = await makeTempSessionRoot();
    const seed2 = await CampaignStore.load(root2);
    await seed2.append({ channel: "agent", op: "open" });
    const storeWriter2 = await CampaignStore.load(root2);
    const traceBefore2 = await readFile(seed2.tracePath, "utf8");
    const evidenceBefore2 = await readFile(seed2.evidencePath, "utf8");

    // Make status.json stale so load() must refresh it inside syncStatusIfNeeded.
    await writeFile(
      seed2.statusPath,
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.unarmed }),
      "utf8",
    );

    const loadAtStatusWrite = deferred();
    const releaseLoadStatusWrite = deferred();
    let pausedLoadStatus = false;

    hookState.beforeOp = async (op, args) => {
      if (!pausedLoadStatus && op === "writeFile" && args[0] === seed2.statusPath) {
        pausedLoadStatus = true;
        loadAtStatusWrite.resolve();
        await releaseLoadStatusWrite.promise;
      }
    };

    const load2Promise = CampaignStore.load(root2);
    await loadAtStatusWrite.promise;

    await expect(
      storeWriter2.append({ channel: "agent", op: "recon", recon: reconPayload }),
    ).rejects.toThrow(/ownership claim is busy/u);
    expect(await readFile(seed2.tracePath, "utf8")).toBe(traceBefore2);
    expect(await readFile(seed2.evidencePath, "utf8")).toBe(evidenceBefore2);

    releaseLoadStatusWrite.resolve();
    const loaded2 = await load2Promise;
    hookState.beforeOp = undefined;
    expect(loaded2.corrupted).toBe(false);
    expect(loaded2.state.state).toBe(CampaignStates.recon);
    expect(JSON.parse(await readFile(seed2.statusPath, "utf8"))).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.recon,
      transition: { reason: "open" },
    });

    const retried2 = await storeWriter2.append({
      channel: "agent",
      op: "recon",
      recon: reconPayload,
    });
    expect(retried2.entry.seq).toBe(1);

    // Interleaving 2b: append() pauses right before writeFile(statusPath) -> load() rejects busy
    // rather than racing status projection; once append() finishes, status matches winning seq 2.
    const hitAppendStatusBarrier = deferred();
    const releaseAppendStatus = deferred();
    let pausedAppendStatus = false;

    hookState.beforeOp = async (op, args) => {
      if (!pausedAppendStatus && op === "writeFile" && args[0] === seed2.statusPath) {
        pausedAppendStatus = true;
        hitAppendStatusBarrier.resolve();
        await releaseAppendStatus.promise;
      }
    };

    const append2bPromise = storeWriter2.append({
      channel: "agent",
      op: "propose",
      charter: makeCharter(1),
    });
    await hitAppendStatusBarrier.promise;

    await expect(CampaignStore.load(root2)).rejects.toThrow(
      /ownership claim is busy/u,
    );

    releaseAppendStatus.resolve();
    const res2b = await append2bPromise;
    hookState.beforeOp = undefined;
    expect(res2b.entry.seq).toBe(2);
    expect(JSON.parse(await readFile(seed2.statusPath, "utf8"))).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.decisions,
      transition: { reason: "propose" },
    });

    // Interleaving 3: read-only preview (refreshStatus: false) passes initial claim check,
    // reads trace.jsonl, then pauses before reading evidence.jsonl while append() runs to
    // completion and releases its claim -> unstable snapshot detection MUST throw rather than
    // reporting FAILED_SAFE or writing anything.
    const root3 = await makeTempSessionRoot();
    const seed3 = await CampaignStore.load(root3);
    await seed3.append({ channel: "agent", op: "open" });
    const storeWriter3 = await CampaignStore.load(root3);

    const previewPausedBeforeEvidence = deferred();
    const releasePreviewEvidenceRead = deferred();
    let pausedPreviewOnce = false;
    let writerRunning = false;

    hookState.beforeOp = async (op, args) => {
      if (
        !writerRunning &&
        !pausedPreviewOnce &&
        op === "readFile" &&
        args[0] === seed3.evidencePath
      ) {
        pausedPreviewOnce = true;
        previewPausedBeforeEvidence.resolve();
        await releasePreviewEvidenceRead.promise;
      }
    };

    const previewPromise = CampaignStore.load(root3, { refreshStatus: false });
    await previewPausedBeforeEvidence.promise;

    writerRunning = true;
    await storeWriter3.append({ channel: "agent", op: "recon", recon: reconPayload });
    writerRunning = false;

    releasePreviewEvidenceRead.resolve();
    await expect(previewPromise).rejects.toThrow(
      /unstable read-only campaign load|changed during read/u,
    );
    hookState.beforeOp = undefined;

    // Subsequent clean read-only preview sees both seq 0 and seq 1 coherently.
    const stablePreview = await CampaignStore.load(root3, { refreshStatus: false });
    expect(stablePreview.corrupted).toBe(false);
    expect(stablePreview.trace).toHaveLength(2);
    expect(stablePreview.state.state).toBe(CampaignStates.recon);

    // Interleaving 3b: read-only preview completes BOTH snapshots and the FINAL claim check
    // (claimAfter === "absent"), then pauses BEFORE delivering that captured snapshot while
    // a concurrent append commits seq 2 (`propose` -> `decisions`). Preview MUST return the
    // CAPTURED old coherent snapshot (seq 0..1, `recon`), perform zero reads after pause and
    // zero projection/disk writes, and leave the committed seq 2 `status.json` intact.
    const isMutatingOp = (op: string, args: readonly unknown[]): boolean => {
      if (
        op === "appendFile" ||
        op === "writeFile" ||
        op === "mkdir" ||
        op === "mkdtemp" ||
        op === "rename" ||
        op === "rm" ||
        op === "unlink"
      ) {
        return true;
      }
      if (op === "open") {
        const flags = args[1];
        if (typeof flags === "string") {
          return /[wa+x]/u.test(flags);
        }
        if (typeof flags === "number") {
          return (
            (flags &
              (constants.O_WRONLY |
                constants.O_RDWR |
                constants.O_CREAT |
                constants.O_TRUNC |
                constants.O_APPEND)) !==
            0
          );
        }
      }
      return false;
    };

    const parentTemp3b = await mkdtemp(
      path.join(tmpdir(), "skill-summon-ro-postclaim-"),
    );
    cleanupRoots.push(parentTemp3b);
    const root3b = await mkdtemp(
      path.join(parentTemp3b, "skill-summon-session-"),
    );
    const claimsDir3b = path.join(
      await realpath(parentTemp3b),
      sessionClaimDirName(),
    );
    const seed3b = await CampaignStore.load(root3b);
    await seed3b.append({ channel: "agent", op: "open" });
    await seed3b.append({ channel: "agent", op: "recon", recon: reconPayload });
    const storeWriter3b = await CampaignStore.load(root3b);
    const preAppendRecordSha3b = storeWriter3b.recordSha256;
    expect(preAppendRecordSha3b).toMatch(/^[0-9a-f]{64}$/u);

    const pausedAfterFinalClaim3b = deferred();
    const releaseAfterFinalClaim3b = deferred();
    let finalClaimChecks3b = 0;
    let pausedPostClaimOnce3b = false;
    let writerRunning3b = false;
    const previewWriteOps3b: string[] = [];
    const previewReadsAfterPause3b: string[] = [];

    hookState.beforeOp = (op, args) => {
      if (writerRunning3b) return;
      if (isMutatingOp(op, args)) {
        previewWriteOps3b.push(op);
      }
      if (pausedPostClaimOnce3b && op === "readFile") {
        previewReadsAfterPause3b.push(String(args[0]));
      }
    };
    hookState.afterError = async (op, args, error) => {
      if (writerRunning3b || pausedPostClaimOnce3b) return;
      if (
        op === "lstat" &&
        args[0] === claimsDir3b &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        finalClaimChecks3b++;
        if (finalClaimChecks3b === 3) {
          pausedPostClaimOnce3b = true;
          pausedAfterFinalClaim3b.resolve();
          await releaseAfterFinalClaim3b.promise;
        }
      }
    };

    const previewPostClaimPromise3b = CampaignStore.load(root3b, {
      refreshStatus: false,
    });
    await pausedAfterFinalClaim3b.promise;
    expect(finalClaimChecks3b).toBe(3);

    writerRunning3b = true;
    const committed3b = await storeWriter3b.append({
      channel: "agent",
      op: "propose",
      charter: makeCharter(1),
    });
    expect(committed3b.entry.seq).toBe(2);
    expect(committed3b.state.state).toBe(CampaignStates.decisions);
    const postAppendStatus3b = await readFile(seed3b.statusPath, "utf8");
    writerRunning3b = false;

    releaseAfterFinalClaim3b.resolve();
    const previewCaptured3b = await previewPostClaimPromise3b;
    hookState.beforeOp = undefined;
    hookState.afterError = undefined;

    expect(previewCaptured3b.corrupted).toBe(false);
    expect(previewCaptured3b.trace.map((e) => e.seq)).toEqual([0, 1]);
    expect(previewCaptured3b.state.state).toBe(CampaignStates.recon);
    expect(previewCaptured3b.recordSha256).toBe(preAppendRecordSha3b);
    expect(previewWriteOps3b).toEqual([]);
    expect(previewReadsAfterPause3b).toEqual([]);
    expect(await readFile(seed3b.statusPath, "utf8")).toBe(postAppendStatus3b);

    // Interleaving 3c: paused after FINAL claim check while a concurrent append leaves
    // trace.jsonl (3 lines) and evidence.jsonl (2 lines) TORN on disk -> preview still
    // delivers its captured coherent [0, 1] snapshot rather than rereading torn files.
    const parentTemp3c = await mkdtemp(
      path.join(tmpdir(), "skill-summon-ro-torn-postclaim-"),
    );
    cleanupRoots.push(parentTemp3c);
    const root3c = await mkdtemp(
      path.join(parentTemp3c, "skill-summon-session-"),
    );
    const claimsDir3c = path.join(
      await realpath(parentTemp3c),
      sessionClaimDirName(),
    );
    const seed3c = await CampaignStore.load(root3c);
    await seed3c.append({ channel: "agent", op: "open" });
    await seed3c.append({ channel: "agent", op: "recon", recon: reconPayload });
    const storeWriter3c = await CampaignStore.load(root3c);
    const preAppendRecordSha3c = storeWriter3c.recordSha256;

    const pausedAfterFinalClaim3c = deferred();
    const releaseAfterFinalClaim3c = deferred();
    const tornWriterPaused3c = deferred();
    const releaseTornWriter3c = deferred();
    let finalClaimChecks3c = 0;
    let pausedPostClaimOnce3c = false;
    let writerActive3c = false;
    const previewWriteOps3c: string[] = [];
    const previewReadsAfterPause3c: string[] = [];

    hookState.beforeOp = async (op, args) => {
      if (writerActive3c) {
        if (op === "appendFile" && args[0] === seed3c.evidencePath) {
          tornWriterPaused3c.resolve();
          await releaseTornWriter3c.promise;
        }
        return;
      }
      if (isMutatingOp(op, args)) {
        previewWriteOps3c.push(op);
      }
      if (pausedPostClaimOnce3c && op === "readFile") {
        previewReadsAfterPause3c.push(String(args[0]));
      }
    };
    hookState.afterError = async (op, args, error) => {
      if (writerActive3c || pausedPostClaimOnce3c) return;
      if (
        op === "lstat" &&
        args[0] === claimsDir3c &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        finalClaimChecks3c++;
        if (finalClaimChecks3c === 3) {
          pausedPostClaimOnce3c = true;
          pausedAfterFinalClaim3c.resolve();
          await releaseAfterFinalClaim3c.promise;
        }
      }
    };

    const previewPostClaimPromise3c = CampaignStore.load(root3c, {
      refreshStatus: false,
    });
    await pausedAfterFinalClaim3c.promise;

    writerActive3c = true;
    const tornAppendPromise3c = storeWriter3c.append({
      channel: "agent",
      op: "propose",
      charter: makeCharter(1),
    });
    await tornWriterPaused3c.promise;
    writerActive3c = false;

    // Confirm files are genuinely torn on disk right when preview resumes.
    writerActive3c = true;
    expect(
      (await readFile(seed3c.tracePath, "utf8")).trimEnd().split("\n"),
    ).toHaveLength(3);
    expect(
      (await readFile(seed3c.evidencePath, "utf8")).trimEnd().split("\n"),
    ).toHaveLength(2);
    writerActive3c = false;

    releaseAfterFinalClaim3c.resolve();
    const previewCaptured3c = await previewPostClaimPromise3c;

    expect(previewCaptured3c.corrupted).toBe(false);
    expect(previewCaptured3c.trace.map((e) => e.seq)).toEqual([0, 1]);
    expect(previewCaptured3c.state.state).toBe(CampaignStates.recon);
    expect(previewCaptured3c.recordSha256).toBe(preAppendRecordSha3c);
    expect(previewWriteOps3c).toEqual([]);
    expect(previewReadsAfterPause3c).toEqual([]);

    writerActive3c = true;
    releaseTornWriter3c.resolve();
    await tornAppendPromise3c;
    hookState.beforeOp = undefined;
    hookState.afterError = undefined;

    const stableAfter3c = await CampaignStore.load(root3c, {
      refreshStatus: false,
    });
    expect(stableAfter3c.corrupted).toBe(false);
    expect(stableAfter3c.trace.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(stableAfter3c.state.state).toBe(CampaignStates.decisions);

    // Absent-campaign load & read-only load on non-writable 0o500 roots remain write-free.
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const roEmptyRoot = await makeTempSessionRoot();
      await chmod(roEmptyRoot, 0o500);
      try {
        const absentStore = await CampaignStore.load(roEmptyRoot);
        expect(absentStore.hasTrace).toBe(false);
        expect(absentStore.corrupted).toBe(false);
        expect(await readdir(roEmptyRoot)).toEqual([]);
      } finally {
        await chmod(roEmptyRoot, 0o700);
      }

      const roPopulatedRoot = await makeTempSessionRoot();
      const popSeed = await CampaignStore.load(roPopulatedRoot);
      await popSeed.append({ channel: "agent", op: "open" });
      await rm(popSeed.statusPath);
      await chmod(roPopulatedRoot, 0o500);
      try {
        const roLoaded = await CampaignStore.load(roPopulatedRoot, {
          refreshStatus: false,
        });
        expect(roLoaded.corrupted).toBe(false);
        expect(roLoaded.state.state).toBe(CampaignStates.recon);
        await expect(access(popSeed.statusPath)).rejects.toThrow();
        await expect(
          access(path.join(roPopulatedRoot, ROOT_SESSION_CLAIM_FILE)),
        ).rejects.toThrow();
      } finally {
        await chmod(roPopulatedRoot, 0o700);
      }
    }

    // Forged serialized/unregistered claimBorrow is always rejected.
    await expect(
      CampaignStore.load(root3, {
        claimBorrow: {} as CampaignStoreClaimBorrow,
      }),
    ).rejects.toThrow(/invalid ownership claim borrow/u);
  });

  it("rejects append before any disk mutation when callback masks present-but-inconsistent sidecar or sidecar becomes inconsistent post-load", async () => {
    const opCap = createCampaignOperatorAdapter();
    const authorizeApprove = (
      event: { channel: string; op: string },
      index: number,
    ) => index === 3 && event.channel === "operator" && event.op === "decide";

    async function seedFourStepApprovedCampaign(): Promise<string> {
      const root = await makeTempSessionRoot();
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
      return root;
    }

    // 1. Callback + present-but-inconsistent sidecar cases where final recordSha256 matches:
    // - wrong early agent eventSha256 (index 0)
    // - authorizedPrivileged: false on accepted privileged operator step (index 3)
    // - authorizedPrivileged: true on agent event (index 0)
    // - wrong early prefix recordSha256 (index 1)
    // - wrong privileged eventSha256 (index 3)
    for (const [label, mutateLine] of [
      [
        "wrong-early-event-hash",
        (lines: ReturnType<typeof parseEvidence>) => {
          lines[0] = { ...lines[0]!, eventSha256: "0".repeat(64) };
        },
      ],
      [
        "wrong-privileged-flag-false",
        (lines: ReturnType<typeof parseEvidence>) => {
          lines[3] = { ...lines[3]!, authorizedPrivileged: false };
        },
      ],
      [
        "wrong-agent-privileged-flag-true",
        (lines: ReturnType<typeof parseEvidence>) => {
          lines[0] = { ...lines[0]!, authorizedPrivileged: true };
        },
      ],
      [
        "wrong-early-record-binding",
        (lines: ReturnType<typeof parseEvidence>) => {
          lines[1] = { ...lines[1]!, recordSha256: "f".repeat(64) };
        },
      ],
      [
        "wrong-privileged-event-hash",
        (lines: ReturnType<typeof parseEvidence>) => {
          lines[3] = { ...lines[3]!, eventSha256: "a".repeat(64) };
        },
      ],
    ] as const) {
      const root = await seedFourStepApprovedCampaign();
      const evidencePath = path.join(root, "campaign", "evidence.jsonl");
      const tracePath = path.join(root, "campaign", "trace.jsonl");
      const statusPath = path.join(root, "campaign", "status.json");
      const lines = parseEvidence(await readFile(evidencePath, "utf8"));
      mutateLine(lines);
      const mutatedEvidence = `${lines.map((l) => formatCampaignEvidenceLine(l)).join("\n")}\n`;
      await writeFile(evidencePath, mutatedEvidence, "utf8");

      const traceBefore = await readFile(tracePath, "utf8");
      const statusBefore = await readFile(statusPath, "utf8");

      // Callback load succeeds in memory, but marks evidence inconsistent (not standalone).
      const callbackLoaded = await CampaignStore.load(root, {
        authorize: authorizeApprove,
      });
      expect(callbackLoaded.corrupted, label).toBe(false);
      expect(callbackLoaded.state.state, label).toBe(CampaignStates.executing);

      // Track open() calls during refused append to prove ZERO claim bookkeeping / disk writes occur.
      let openCountDuringRefusal = 0;
      hookState.beforeOp = (op) => {
        if (op === "open") openCountDuringRefusal++;
      };
      try {
        await expect(
          callbackLoaded.append({ channel: "agent", op: "status" }),
          label,
        ).rejects.toThrow(/historical campaign evidence is inconsistent/u);
      } finally {
        hookState.beforeOp = undefined;
      }
      expect(openCountDuringRefusal, label).toBe(0);

      // Persisted bytes remain completely unchanged.
      expect(await readFile(tracePath, "utf8"), label).toBe(traceBefore);
      expect(await readFile(evidencePath, "utf8"), label).toBe(mutatedEvidence);
      expect(await readFile(statusPath, "utf8"), label).toBe(statusBefore);
      await expect(
        access(path.join(root, ROOT_SESSION_CLAIM_FILE)),
      ).rejects.toThrow();

      // Subsequent reload WITH callback remains coherent at length 4;
      // subsequent reload WITHOUT callback fails closed as FAILED_SAFE.
      const reloadWithCallback = await CampaignStore.load(root, {
        authorize: authorizeApprove,
      });
      expect(reloadWithCallback.corrupted, label).toBe(false);
      expect(reloadWithCallback.trace, label).toHaveLength(4);
      expect(reloadWithCallback.state.state, label).toBe(CampaignStates.executing);

      const reloadWithoutCallback = await CampaignStore.load(root);
      expect(reloadWithoutCallback.corrupted, label).toBe(true);
      expect(reloadWithoutCallback.state.state, label).toBe(CampaignStates.failedSafe);
    }

    // 2. Sequence mismatch in evidence.jsonl (even with callback): fails closed & refuses append.
    const seqRoot = await seedFourStepApprovedCampaign();
    const seqEvidencePath = path.join(seqRoot, "campaign", "evidence.jsonl");
    const seqTracePath = path.join(seqRoot, "campaign", "trace.jsonl");
    const seqLines = parseEvidence(await readFile(seqEvidencePath, "utf8"));
    const swappedEvidence = `${[
      formatCampaignEvidenceLine({ ...seqLines[0]!, seq: 1 }),
      formatCampaignEvidenceLine({ ...seqLines[1]!, seq: 0 }),
      formatCampaignEvidenceLine(seqLines[2]!),
      formatCampaignEvidenceLine(seqLines[3]!),
    ].join("\n")}\n`;
    await writeFile(seqEvidencePath, swappedEvidence, "utf8");
    const seqTraceBefore = await readFile(seqTracePath, "utf8");

    const seqLoaded = await CampaignStore.load(seqRoot, {
      authorize: authorizeApprove,
    });
    expect(seqLoaded.corrupted).toBe(true);
    expect(seqLoaded.state.state).toBe(CampaignStates.failedSafe);
    await expect(
      seqLoaded.append({ channel: "agent", op: "status" }),
    ).rejects.toThrow(/corrupted|FAILED_SAFE/u);
    expect(await readFile(seqTracePath, "utf8")).toBe(seqTraceBefore);
    expect(await readFile(seqEvidencePath, "utf8")).toBe(swappedEvidence);

    // 3. Post-load sidecar tamper (valid at load time, mutated into inconsistent sidecar
    // before append) is caught under exclusive disk comparison before any write.
    const postRoot = await seedFourStepApprovedCampaign();
    const postLoaded = await CampaignStore.load(postRoot, {
      authorize: authorizeApprove,
    });
    const postLines = parseEvidence(await readFile(postLoaded.evidencePath, "utf8"));
    postLines[3] = { ...postLines[3]!, authorizedPrivileged: false };
    const postMutatedEvidence = `${postLines.map((l) => formatCampaignEvidenceLine(l)).join("\n")}\n`;
    await writeFile(postLoaded.evidencePath, postMutatedEvidence, "utf8");
    const postTraceBefore = await readFile(postLoaded.tracePath, "utf8");
    const postStatusBefore = await readFile(postLoaded.statusPath, "utf8");

    await expect(
      postLoaded.append({ channel: "agent", op: "status" }),
    ).rejects.toThrow(/historical campaign evidence is inconsistent/u);
    expect(await readFile(postLoaded.tracePath, "utf8")).toBe(postTraceBefore);
    expect(await readFile(postLoaded.evidencePath, "utf8")).toBe(postMutatedEvidence);
    expect(await readFile(postLoaded.statusPath, "utf8")).toBe(postStatusBefore);

    const postReloadWithCallback = await CampaignStore.load(postRoot, {
      authorize: authorizeApprove,
    });
    expect(postReloadWithCallback.corrupted).toBe(false);
    expect(postReloadWithCallback.trace).toHaveLength(4);
    const postReloadWithoutCallback = await CampaignStore.load(postRoot);
    expect(postReloadWithoutCallback.corrupted).toBe(true);
    expect(postReloadWithoutCallback.state.state).toBe(CampaignStates.failedSafe);

    // 4. Agent-only trace with tampered early sidecar event hash fails closed without callback.
    const agentTamperRoot = await makeTempSessionRoot();
    const agentSeed = await CampaignStore.load(agentTamperRoot);
    await agentSeed.append({ channel: "agent", op: "open" });
    await agentSeed.append({ channel: "agent", op: "recon", recon: reconPayload });
    const agentEvLines = parseEvidence(await readFile(agentSeed.evidencePath, "utf8"));
    agentEvLines[0] = { ...agentEvLines[0]!, eventSha256: "b".repeat(64) };
    await writeFile(
      agentSeed.evidencePath,
      `${agentEvLines.map((l) => formatCampaignEvidenceLine(l)).join("\n")}\n`,
      "utf8",
    );
    const agentNoCallback = await CampaignStore.load(agentTamperRoot);
    expect(agentNoCallback.corrupted).toBe(true);
    expect(agentNoCallback.state.state).toBe(CampaignStates.failedSafe);
  });
});

function parseEvidence(raw: string) {
  const parsed = parseCampaignEvidenceLines(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return [...parsed.lines];
}
