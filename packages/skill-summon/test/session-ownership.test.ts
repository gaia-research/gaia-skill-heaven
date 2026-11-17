import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
    onWriteFile: undefined as
      | ((
          actualOpen: typeof import("node:fs/promises").open,
          actualWriteFile: typeof import("node:fs/promises").writeFile,
          args: Parameters<typeof import("node:fs/promises").writeFile>,
        ) => Promise<void>)
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
      const result = await fn(...args);
      if (hookState.afterOp) {
        await hookState.afterOp(name, args as readonly unknown[], result);
      }
      return result;
    }) as unknown as T;

  const wrapWriteFile = vi.fn(
    async (...args: Parameters<typeof actual.writeFile>) => {
      if (hookState.beforeOp) {
        await hookState.beforeOp("writeFile", args as readonly unknown[]);
      }
      const result = hookState.onWriteFile
        ? await hookState.onWriteFile(actual.open, actual.writeFile, args)
        : await actual.writeFile(...args);
      if (hookState.afterOp) {
        await hookState.afterOp(
          "writeFile",
          args as readonly unknown[],
          result,
        );
      }
      return result;
    },
  ) as unknown as typeof actual.writeFile;

  return {
    ...actual,
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
    writeFile: wrapWriteFile,
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
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  type CampaignCharter,
  type CampaignRecon,
} from "skill-zero";

import { CampaignStore } from "../src/campaign/store.js";
import {
  openSession,
  reapSessions,
  resolveSession,
  SummonSession,
} from "../src/summon/session.js";
import {
  acquireSessionClaimForRealRoot,
  SESSION_CLAIM_DIR_PREFIX,
  sessionClaimDir,
  sessionClaimKey,
} from "../src/summon/session-ownership.js";

const require = createRequire(import.meta.url);
const tsxCli = path.join(
  path.dirname(require.resolve("tsx/package.json")),
  "dist/cli.mjs",
);

const DEAD_PID = 99_999_999;
const INDEX_DIR_PREFIX = "skill-summon-index-v1";

const hostTmpdir = tmpdir();
const cleanupRoots: string[] = [];

const savedEnv = {
  CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID,
  SKILL_SUMMON_SESSION: process.env.SKILL_SUMMON_SESSION,
};

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
  hookState.onWriteFile = undefined;
  delete process.env.CLAUDE_CODE_SESSION_ID;
  delete process.env.SKILL_SUMMON_SESSION;
});

afterEach(async () => {
  hookState.beforeOp = undefined;
  hookState.afterOp = undefined;
  hookState.onWriteFile = undefined;
  if (savedEnv.CLAUDE_CODE_SESSION_ID === undefined) {
    delete process.env.CLAUDE_CODE_SESSION_ID;
  } else {
    process.env.CLAUDE_CODE_SESSION_ID = savedEnv.CLAUDE_CODE_SESSION_ID;
  }
  if (savedEnv.SKILL_SUMMON_SESSION === undefined) {
    delete process.env.SKILL_SUMMON_SESSION;
  } else {
    process.env.SKILL_SUMMON_SESSION = savedEnv.SKILL_SUMMON_SESSION;
  }

  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(hostTmpdir, "skill-summon-own-test-"));
  cleanupRoots.push(root);
  return root;
}

function expectedIndexDirName(): string {
  const uid = process.getuid?.();
  return uid === undefined ? INDEX_DIR_PREFIX : `${INDEX_DIR_PREFIX}-${uid}`;
}

function expectedIndexKey(harnessSessionId: string): string {
  return createHash("sha256")
    .update("skill-summon-harness-session-v1\0")
    .update(harnessSessionId, "utf8")
    .digest("hex");
}

function makeCharter(sessionRetention: number): CampaignCharter {
  return {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: 1,
    goal: "Ownership concurrency verification",
    allowedSkills: ["skill-alpha"],
    queue: [{ id: "u1", skill: "skill-alpha", reconCitation: "citation:own" }],
    recoverLimit: 1,
    reopenLimit: 1,
    sessionRetention,
    clauses: ["verify-command", "termination"],
  };
}

async function seedPausedCampaign(
  sessionRoot: string,
  sessionRetention: number,
): Promise<void> {
  const opCap = createCampaignOperatorAdapter();
  const store = await CampaignStore.load(sessionRoot);
  const recon: CampaignRecon = {
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    findings: ["Ownership verification recon"],
    citations: ["citation:own"],
  };
  await store.append({ channel: "agent", op: "open" });
  await store.append({ channel: "agent", op: "recon", recon });
  await store.append({
    channel: "agent",
    op: "propose",
    charter: makeCharter(sessionRetention),
  });
  await store.append(
    createCampaignOperatorEvent(opCap, {
      channel: "operator",
      op: "decide",
      action: "approve",
      charterRevision: 1,
    }),
  );
}

async function seedDeadIndexedSession(
  tempRoot: string,
  harnessSessionId: string,
  opts: { createdAt?: string; withCampaignRetention?: number } = {},
): Promise<{ root: string; id: string }> {
  const created = await resolveSession({ tempRoot, harnessSessionId });
  if (opts.withCampaignRetention !== undefined) {
    await seedPausedCampaign(created.session.root, opts.withCampaignRetention);
  }
  const manifestPath = path.join(created.session.root, "session.json");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Record<string, unknown>;
  manifest.pid = DEAD_PID;
  if (opts.createdAt !== undefined) {
    manifest.createdAt = opts.createdAt;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { root: created.session.root, id: created.session.id };
}

describe("per-root filesystem ownership claim and coordination", () => {
  it("coordinates simultaneous adopters via deterministic barrier so only one adopts and contender skips immediately to fresh", async () => {
    const tempRoot = await makeTempRoot();
    const harnessSessionId = "race-adopter-busy-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessSessionId, {
      withCampaignRetention: 24,
    });
    const manifestPath = path.join(seeded.root, "session.json");

    // Both adopters deterministically read DEAD_PID in preliminary lookup before either claims.
    let prelimManifestReads = 0;
    const caller1InPrelim = deferred();
    const releaseCaller1 = deferred();
    const caller2InPrelim = deferred();
    const releaseCaller2 = deferred();
    const winnerHoldingClaim = deferred();
    const releaseWinnerCommit = deferred();
    let winnerSettled = false;

    hookState.beforeOp = async (op, args) => {
      if (op === "readFile" && args[0] === manifestPath) {
        prelimManifestReads++;
        if (prelimManifestReads === 1) {
          caller1InPrelim.resolve();
          await releaseCaller1.promise;
        } else if (prelimManifestReads === 2) {
          caller2InPrelim.resolve();
          await releaseCaller2.promise;
        }
      } else if (
        op === "rename" &&
        args[1] === manifestPath
      ) {
        // Winner now holds the claim and is about to commit process.pid.
        winnerHoldingClaim.resolve();
        await releaseWinnerCommit.promise;
      }
    };

    const winnerPromise = resolveSession({ tempRoot, harnessSessionId }).then(
      (res) => {
        winnerSettled = true;
        return res;
      },
    );
    await caller1InPrelim.promise;

    const contenderPromise = resolveSession({ tempRoot, harnessSessionId });
    await caller2InPrelim.promise;

    // Let winner acquire claim and pause at manifest commit while contender still waits at prelim.
    releaseCaller1.resolve();
    await winnerHoldingClaim.promise;
    const claimDir = sessionClaimDir(tempRoot);
    expect(await readdir(claimDir)).toHaveLength(1);

    // Let contender proceed to claim acquisition while winner still holds the claim.
    releaseCaller2.resolve();
    const contenderResult = await contenderPromise;

    // Contender MUST finish immediately as fresh without waiting for winner or scanning!
    expect(winnerSettled).toBe(false);
    expect(contenderResult.created).toBe(true);
    expect(contenderResult.session.root).not.toBe(seeded.root);

    // Now let winner complete commit and release claim.
    releaseWinnerCommit.resolve();
    const winnerResult = await winnerPromise;
    expect(winnerResult.created).toBe(false);
    expect(winnerResult.session.root).toBe(seeded.root);
    expect(winnerResult.session.id).toBe(seeded.id);
    expect(winnerResult.session.pid).toBe(process.pid);
    expect(await readdir(claimDir)).toEqual([]);

    const reloadedStore = await CampaignStore.load(seeded.root);
    expect(reloadedStore.corrupted).toBe(false);
    expect(reloadedStore.state.state).toBe(CampaignStates.executing);
  });

  it("rejects double adoption via post-claim re-read even when winner commits and releases claim before contender acquires claim", async () => {
    const tempRoot = await makeTempRoot();
    const harnessSessionId = "race-adopter-reread-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessSessionId, {
      withCampaignRetention: 24,
    });
    const manifestPath = path.join(seeded.root, "session.json");

    // Both adopters deterministically read DEAD_PID in findIndexedDeadSession;
    // contender stalls BEFORE acquiring the claim until winner commits live PID and releases.
    let prelimReads = 0;
    const caller1InPrelim = deferred();
    const releaseCaller1 = deferred();
    const caller2InPrelim = deferred();
    const allowContender = deferred();

    hookState.beforeOp = async (op, args) => {
      if (op === "readFile" && args[0] === manifestPath) {
        prelimReads++;
        if (prelimReads === 1) {
          caller1InPrelim.resolve();
          await releaseCaller1.promise;
        } else if (prelimReads === 2) {
          caller2InPrelim.resolve();
          await allowContender.promise;
        }
      }
    };

    const winnerPromise = resolveSession({ tempRoot, harnessSessionId });
    await caller1InPrelim.promise;

    const contenderPromise = resolveSession({ tempRoot, harnessSessionId });
    await caller2InPrelim.promise;

    releaseCaller1.resolve();
    const winner = await winnerPromise;
    expect(winner.created).toBe(false);
    expect(winner.session.root).toBe(seeded.root);
    expect(winner.session.pid).toBe(process.pid);

    // Release contender AFTER winner already released the claim and committed live PID.
    allowContender.resolve();
    const contender = await contenderPromise;
    expect(contender.created).toBe(true);
    expect(contender.session.root).not.toBe(seeded.root);
  });

  it("prevents adoption during GC deletion, preserves claim throughout rm, and avoids resurrecting deleted roots", async () => {
    const tempRoot = await makeTempRoot();
    const harnessSessionId = "gc-vs-adopt-delete-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessSessionId, {
      createdAt: "2026-04-01T00:00:00.000Z",
    });

    // Interleaving A: GC holds claim while quarantining & deleting root -> adopter sees busy & creates fresh;
    // claim file remains on disk when quarantine rename(sessionRoot) starts (no deletion gap).
    const gcInRm = deferred();
    const releaseGcRm = deferred();
    let claimExistedWhenRmStarted = false;
    const claimsDir = sessionClaimDir(tempRoot);

    hookState.beforeOp = async (op, args) => {
      if (op === "rename" && args[0] === seeded.root) {
        const claimFiles = await readdir(claimsDir);
        claimExistedWhenRmStarted = claimFiles.length === 1;
        gcInRm.resolve();
        await releaseGcRm.promise;
      }
    };

    const gcPromise = reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T10:00:00.000Z"),
    });

    await gcInRm.promise;
    expect(claimExistedWhenRmStarted).toBe(true);

    const contenderWhileGcDeleting = await resolveSession({
      tempRoot,
      harnessSessionId,
    });
    expect(contenderWhileGcDeleting.created).toBe(true);
    expect(contenderWhileGcDeleting.session.root).not.toBe(seeded.root);

    releaseGcRm.resolve();
    const gcOutcome = await gcPromise;
    expect(gcOutcome.candidates.map((c) => c.root)).toEqual([seeded.root]);
    await expect(access(seeded.root)).rejects.toThrow();
    expect(await readdir(claimsDir)).toEqual([]);

    // Fresh session created during GC must remain indexed and accessible.
    const indexPath = path.join(
      tempRoot,
      expectedIndexDirName(),
      `${expectedIndexKey(harnessSessionId)}.json`,
    );
    const indexData = JSON.parse(await readFile(indexPath, "utf8")) as {
      roots: string[];
    };
    expect(indexData.roots).toEqual([contenderWhileGcDeleting.session.root]);

    // Interleaving B: Adopter passed preliminary check (saw dead PID), then GC deletes root
    // & releases claim before adopter acquires claim -> adopter sees ineligible and goes fresh.
    const seeded2 = await seedDeadIndexedSession(tempRoot, "gc-deletes-before-claim", {
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    const allowAdopterClaim = deferred();
    const adopterSawDeadPrelim = deferred();
    let adopterReadingManifest = 0;
    let gcRunning = false;

    hookState.beforeOp = async (op, args) => {
      if (
        !gcRunning &&
        op === "readFile" &&
        args[0] === path.join(seeded2.root, "session.json")
      ) {
        adopterReadingManifest++;
      } else if (
        !gcRunning &&
        adopterReadingManifest === 1 &&
        op === "open" &&
        typeof args[0] === "string" &&
        args[0].endsWith(".claim")
      ) {
        adopterSawDeadPrelim.resolve();
        await allowAdopterClaim.promise;
      }
    };

    const adopterPromise = resolveSession({
      tempRoot,
      harnessSessionId: "gc-deletes-before-claim",
    });
    await adopterSawDeadPrelim.promise;

    gcRunning = true;
    const gc2 = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T10:00:00.000Z"),
    });
    expect(gc2.candidates.map((c) => c.root)).toEqual([seeded2.root]);
    gcRunning = false;

    allowAdopterClaim.resolve();
    const adoptedAfterDelete = await adopterPromise;
    expect(adoptedAfterDelete.created).toBe(true);
    expect(adoptedAfterDelete.session.root).not.toBe(seeded2.root);
    await expect(access(seeded2.root)).rejects.toThrow();
  });

  it("coordinates GC pause-boundary bookkeeping with concurrent adoption via post-claim re-read", async () => {
    const tempRoot = await makeTempRoot();
    const harnessSessionId = "gc-vs-adopt-live-preserve";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessSessionId, {
      createdAt: "2026-04-01T00:00:00.000Z",
      withCampaignRetention: 48,
    });

    // GC passes preliminary check (sees dead PID and paused campaign needing pause.json write),
    // then stalls before acquiring the claim. Adopter runs, adopts root, commits live PID.
    // When GC resumes and acquires claim, post-claim re-read sees live PID and protects root!
    const gcPausedBeforeClaim = deferred();
    const allowGcClaim = deferred();
    let adopterRunning = false;
    let gcClaimAttempts = 0;

    hookState.beforeOp = async (op, args) => {
      if (
        !adopterRunning &&
        op === "open" &&
        typeof args[0] === "string" &&
        args[0].endsWith(".claim")
      ) {
        gcClaimAttempts++;
        if (gcClaimAttempts === 1) {
          gcPausedBeforeClaim.resolve();
          await allowGcClaim.promise;
        }
      }
    };

    const gcPromise = reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T10:00:00.000Z"),
    });
    await gcPausedBeforeClaim.promise;

    adopterRunning = true;
    const adopted = await resolveSession({ tempRoot, harnessSessionId });
    expect(adopted.created).toBe(false);
    expect(adopted.session.root).toBe(seeded.root);
    expect(adopted.session.pid).toBe(process.pid);
    adopterRunning = false;

    allowGcClaim.resolve();
    const gcOutcome = await gcPromise;
    expect(gcOutcome.candidates).toEqual([]);
    expect(gcOutcome.liveProtected).toContain(seeded.root);
    // Pause boundary must NOT have been written after live adoption.
    await expect(
      access(path.join(seeded.root, "campaign", "pause.json")),
    ).rejects.toThrow();
    const store = await CampaignStore.load(seeded.root);
    expect(store.state.state).toBe(CampaignStates.executing);
  });

  it("enforces filesystem claim across actual Node child processes (hold, concurrent race, and crash-left fail-safe)", async () => {
    const tempRoot = await makeTempRoot();
    const sessionModuleUrl = pathToFileURL(
      path.resolve("packages/skill-summon/src/summon/session.ts"),
    ).href;
    const ownershipModuleUrl = pathToFileURL(
      path.resolve("packages/skill-summon/src/summon/session-ownership.ts"),
    ).href;

    // 1. Child process acquires real filesystem claim and holds it until signaled.
    const heldId = "child-held-claim-id";
    const heldSeed = await seedDeadIndexedSession(tempRoot, heldId, {
      createdAt: "2026-04-01T00:00:00.000Z",
      withCampaignRetention: 24,
    });
    const holderScript = path.join(tempRoot, "holder-child.mts");
    await writeFile(
      holderScript,
      `import { realpath } from "node:fs/promises";
import { acquireSessionClaimForRealRoot } from ${JSON.stringify(ownershipModuleUrl)};
const [sessionRoot, tempRoot] = process.argv.slice(2);
const realRoot = await realpath(sessionRoot);
const claim = await acquireSessionClaimForRealRoot(realRoot, tempRoot, "reattach");
if (claim.status !== "acquired") {
  process.stderr.write("failed-to-acquire:" + claim.status + "\\n");
  process.exit(2);
}
process.stdout.write("CLAIMED\\n");
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

    const holder = spawn(
      process.execPath,
      [tsxCli, holderScript, heldSeed.root, tempRoot],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TMPDIR: tempRoot,
          TMP: tempRoot,
          TEMP: tempRoot,
        },
      },
    );

    try {
      await new Promise<void>((resolve, reject) => {
        let out = "";
        let err = "";
        holder.stdout.on("data", (d: Buffer) => {
          out += d.toString("utf8");
          if (out.includes("CLAIMED\n")) resolve();
        });
        holder.stderr.on("data", (d: Buffer) => {
          err += d.toString("utf8");
        });
        holder.on("exit", (code) => {
          if (!out.includes("CLAIMED\n")) {
            reject(new Error(`Holder exited early (${code}): ${err}`));
          }
        });
      });

      // While child process holds OS claim:
      // Parent resolveSession skips and creates a fresh root.
      const duringHold = await resolveSession({ tempRoot, harnessSessionId: heldId });
      expect(duringHold.created).toBe(true);
      expect(duringHold.session.root).not.toBe(heldSeed.root);

      // Parent dry-run and real GC both conservatively preserve heldSeed.root.
      const futureNow = new Date("2099-01-01T00:00:00.000Z");
      const dryDuringHold = await reapSessions({
        tempRoot,
        ttlHours: 0,
        now: futureNow,
        dryRun: true,
      });
      expect(dryDuringHold.candidates.map((c) => c.root)).not.toContain(heldSeed.root);
      const realDuringHold = await reapSessions({
        tempRoot,
        ttlHours: 0,
        now: futureNow,
        dryRun: false,
      });
      expect(realDuringHold.candidates.map((c) => c.root)).not.toContain(heldSeed.root);
      await expect(access(heldSeed.root)).resolves.toBeUndefined();

      // Release claim from child process.
      holder.stdin.write("RELEASE\n");
      await new Promise<void>((resolve, reject) => {
        holder.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Holder exit code ${code}`));
        });
      });

      // Now parent adopts heldSeed.root cleanly.
      const afterRelease = await resolveSession({
        tempRoot,
        harnessSessionId: heldId,
      });
      expect(afterRelease.created).toBe(false);
      expect(afterRelease.session.root).toBe(heldSeed.root);
      expect(afterRelease.session.pid).toBe(process.pid);
    } finally {
      if (holder.exitCode === null) {
        holder.kill("SIGKILL");
      }
    }

    // 2. Two real child processes race resolveSession concurrently against one dead root
    // while both remain alive until both finish resolving.
    const raceId = "two-children-race-id";
    const raceSeed = await seedDeadIndexedSession(tempRoot, raceId, {
      withCampaignRetention: 24,
    });
    const racerScript = path.join(tempRoot, "racer-child.mts");
    await writeFile(
      racerScript,
      `import { resolveSession } from ${JSON.stringify(sessionModuleUrl)};
const [tempRoot, harnessSessionId] = process.argv.slice(2);
process.stdout.write("READY\\n");
process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  if (buffer.includes("GO\\n")) {
    buffer = buffer.replace("GO\\n", "");
    const res = await resolveSession({ tempRoot, harnessSessionId });
    process.stdout.write(JSON.stringify({ pid: process.pid, created: res.created, root: res.session.root }) + "\\n");
  }
  if (buffer.includes("EXIT\\n")) {
    process.exit(0);
  }
});
`,
      "utf8",
    );

    const spawnRacer = () => {
      const child = spawn(
        process.execPath,
        [tsxCli, racerScript, tempRoot, raceId],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            TMPDIR: tempRoot,
            TMP: tempRoot,
            TEMP: tempRoot,
            CLAUDE_CODE_SESSION_ID: raceId,
          },
        },
      );
      let stdoutBuf = "";
      let stderrBuf = "";
      const ready = new Promise<void>((resolve, reject) => {
        const onData = (d: Buffer) => {
          stdoutBuf += d.toString("utf8");
          if (stdoutBuf.includes("READY\n")) {
            child.stdout.off("data", onData);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (d: Buffer) => {
          stderrBuf += d.toString("utf8");
        });
        child.on("exit", (code) => {
          if (!stdoutBuf.includes("READY\n")) {
            reject(new Error(`Racer exited before READY (${code}): ${stderrBuf}`));
          }
        });
      });
      const result = new Promise<{ pid: number; created: boolean; root: string }>(
        (resolve, reject) => {
          const onData = (d: Buffer) => {
            stdoutBuf += d.toString("utf8");
            const lines = stdoutBuf.split("\n");
            const jsonLine = lines.find((line) => line.startsWith("{"));
            if (jsonLine) {
              child.stdout.off("data", onData);
              try {
                resolve(
                  JSON.parse(jsonLine) as {
                    pid: number;
                    created: boolean;
                    root: string;
                  },
                );
              } catch (err) {
                reject(err);
              }
            }
          };
          child.stdout.on("data", onData);
          child.on("exit", (code) => {
            if (!stdoutBuf.split("\n").some((line) => line.startsWith("{"))) {
              reject(new Error(`Racer exited without JSON (${code}): ${stderrBuf}`));
            }
          });
        },
      );
      return { child, ready, result };
    };

    const r1 = spawnRacer();
    const r2 = spawnRacer();
    try {
      await Promise.all([r1.ready, r2.ready]);
      r1.child.stdin.write("GO\n");
      r2.child.stdin.write("GO\n");

      const [child1, child2] = await Promise.all([r1.result, r2.result]);
      const adopters = [child1, child2].filter((c) => !c.created);
      const freshers = [child1, child2].filter((c) => c.created);
      expect(adopters).toHaveLength(1);
      expect(freshers).toHaveLength(1);
      expect(adopters[0]!.root).toBe(raceSeed.root);
      expect(freshers[0]!.root).not.toBe(raceSeed.root);

      const raceManifest = JSON.parse(
        await readFile(path.join(raceSeed.root, "session.json"), "utf8"),
      ) as { pid: number };
      expect(raceManifest.pid).toBe(adopters[0]!.pid);
    } finally {
      for (const r of [r1, r2]) {
        if (r.child.exitCode === null) {
          r.child.stdin.write("EXIT\n");
        }
      }
      await Promise.all(
        [r1, r2].map(
          (r) =>
            new Promise<void>((resolve) => {
              if (r.child.exitCode !== null) {
                resolve();
                return;
              }
              const timer = setTimeout(() => {
                r.child.kill("SIGKILL");
                resolve();
              }, 2000);
              r.child.once("exit", () => {
                clearTimeout(timer);
                resolve();
              });
            }),
        ),
      );
    }
  }, 20_000);

  it("conservatively preserves roots on crash-left and unsafe claims/dirs without stale-lock breaking or poisoning fresh sessions, and keeps dry-run write-free", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();

    // 1. Dry-run when no claimsDir exists writes nothing (does not create claimsDir).
    const dryId = "dry-no-claims-dir";
    await seedDeadIndexedSession(tempRoot, dryId, {
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    await rm(sessionClaimDir(tempRoot), { recursive: true, force: true });
    await expect(access(sessionClaimDir(tempRoot))).rejects.toThrow();
    const dryCheck = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T10:00:00.000Z"),
      dryRun: true,
    });
    expect(dryCheck.candidates).toHaveLength(1);
    await expect(access(sessionClaimDir(tempRoot))).rejects.toThrow();

    // 2. Crash-left claim (even with dead PID and 1999 timestamp in claim file):
    // must NOT be broken by stale-lock heuristics; blocks both adoption and GC (dry & real).
    const crashId = "crash-left-claim-id";
    const crashSeed = await seedDeadIndexedSession(tempRoot, crashId, {
      createdAt: "2026-04-01T00:00:00.000Z",
      withCampaignRetention: 24,
    });
    const claimsDir = sessionClaimDir(tempRoot);
    await mkdir(claimsDir, { mode: 0o700, recursive: true });
    const crashClaimPath = path.join(
      claimsDir,
      `${sessionClaimKey(await (await import("node:fs/promises")).realpath(crashSeed.root))}.claim`,
    );
    const crashClaimBody = JSON.stringify({
      version: 1,
      pid: DEAD_PID,
      purpose: "reattach",
      acquiredAt: "1999-01-01T00:00:00.000Z",
    });
    await writeFile(crashClaimPath, crashClaimBody, { mode: 0o600 });

    const afterCrashClaim = await resolveSession({
      tempRoot,
      harnessSessionId: crashId,
    });
    expect(afterCrashClaim.created).toBe(true);
    expect(afterCrashClaim.session.root).not.toBe(crashSeed.root);

    // Explicit SKILL_SUMMON_SESSION against crash-claimed root also skips to fresh, never steals.
    process.env.SKILL_SUMMON_SESSION = crashSeed.root;
    const explicitCrashClaim = await resolveSession({
      tempRoot,
      harnessSessionId: crashId,
    });
    expect(explicitCrashClaim.created).toBe(true);
    expect(explicitCrashClaim.session.root).not.toBe(crashSeed.root);
    delete process.env.SKILL_SUMMON_SESSION;

    // Explicit SummonSession.close() refuses when a busy/crash-left claim exists.
    const crashLoaded = await SummonSession.loadAt(crashSeed.root, tempRoot);
    await expect(crashLoaded.close()).rejects.toThrow(/ownership claim is busy/u);

    const futureNow = new Date("2099-01-01T00:00:00.000Z");
    const dryCrash = await reapSessions({
      tempRoot,
      ttlHours: 0,
      now: futureNow,
      dryRun: true,
    });
    expect(dryCrash.candidates.map((c) => c.root)).not.toContain(crashSeed.root);

    const realCrash = await reapSessions({
      tempRoot,
      ttlHours: 0,
      now: futureNow,
      dryRun: false,
    });
    expect(realCrash.candidates.map((c) => c.root)).not.toContain(crashSeed.root);
    await expect(access(crashSeed.root)).resolves.toBeUndefined();
    expect(await readFile(crashClaimPath, "utf8")).toBe(crashClaimBody);

    // 3. Symlinked claim file pointing outside -> never followed, outside untouched, root preserved.
    const symId = "symlink-claim-id";
    const symSeed = await seedDeadIndexedSession(tempRoot, symId, {
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    const outsideTarget = path.join(outsideDir, "outside-claim-sentinel.txt");
    await writeFile(outsideTarget, "UNTOUCHED", "utf8");
    const symClaimPath = path.join(
      claimsDir,
      `${sessionClaimKey(await (await import("node:fs/promises")).realpath(symSeed.root))}.claim`,
    );
    await symlink(outsideTarget, symClaimPath, "file");

    const symLookup = await resolveSession({ tempRoot, harnessSessionId: symId });
    expect(symLookup.created).toBe(true);
    expect(symLookup.session.root).not.toBe(symSeed.root);
    const symReap = await reapSessions({
      tempRoot,
      ttlHours: 0,
      now: futureNow,
      dryRun: false,
    });
    expect(symReap.candidates.map((c) => c.root)).not.toContain(symSeed.root);
    expect(await readFile(outsideTarget, "utf8")).toBe("UNTOUCHED");

    // 4. Unsafe claimsDir (permissive 0755 or symlink) blocks adoption & GC conservatively,
    // never chmods/deletes outside, and never poisons fresh sessions.
    const unsafeTemp = await makeTempRoot();
    const unsafeSeed = await seedDeadIndexedSession(unsafeTemp, "unsafe-dir-id", {
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    const unsafeClaimsDir = sessionClaimDir(unsafeTemp);
    await mkdir(unsafeClaimsDir, { mode: 0o700, recursive: true });
    await chmod(unsafeClaimsDir, 0o755);

    const unsafeResolve = await resolveSession({
      tempRoot: unsafeTemp,
      harnessSessionId: "unsafe-dir-id",
    });
    expect(unsafeResolve.created).toBe(true);
    expect(unsafeResolve.session.root).not.toBe(unsafeSeed.root);
    expect(((await lstat(unsafeClaimsDir)).mode & 0o777)).toBe(0o755);

    const unsafeDryReap = await reapSessions({
      tempRoot: unsafeTemp,
      ttlHours: 0,
      now: futureNow,
      dryRun: true,
    });
    expect(unsafeDryReap.candidates).toEqual([]);
    const unsafeRealReap = await reapSessions({
      tempRoot: unsafeTemp,
      ttlHours: 0,
      now: futureNow,
      dryRun: false,
    });
    expect(unsafeRealReap.candidates).toEqual([]);
    await expect(access(unsafeSeed.root)).resolves.toBeUndefined();
  });

  it("keeps claim exclusion operational even when optional locator indexDir is unavailable (0500)", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;

    const tempRoot = await makeTempRoot();
    const indexDir = path.join(tempRoot, expectedIndexDirName());
    await mkdir(indexDir, { mode: 0o700 });

    const harnessId = "claim-independent-of-index";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessId, {
      createdAt: "2026-04-01T00:00:00.000Z",
    });

    // Make optional indexDir read-only (0500).
    await chmod(indexDir, 0o500);
    try {
      // Explicit SKILL_SUMMON_SESSION reattach STILL uses claimsDir (separate from indexDir).
      const { realpath } = await import("node:fs/promises");
      const claim = await acquireSessionClaimForRealRoot(
        await realpath(seeded.root),
        tempRoot,
        "reattach",
      );
      expect(claim.status).toBe("acquired");
      if (claim.status !== "acquired") return;

      try {
        process.env.SKILL_SUMMON_SESSION = seeded.root;
        const contended = await resolveSession({
          tempRoot,
          harnessSessionId: harnessId,
        });
        expect(contended.created).toBe(true);
        expect(contended.session.root).not.toBe(seeded.root);
      } finally {
        await claim.release();
      }

      // After claim release, explicit SKILL_SUMMON_SESSION reattaches despite 0500 indexDir.
      process.env.SKILL_SUMMON_SESSION = seeded.root;
      const resumed = await resolveSession({
        tempRoot,
        harnessSessionId: harnessId,
      });
      expect(resumed.created).toBe(false);
      expect(resumed.session.root).toBe(seeded.root);
      expect(resumed.session.pid).toBe(process.pid);
    } finally {
      await chmod(indexDir, 0o700).catch(() => {});
    }
  });

  it("keeps claim dir prefix distinct from session dir prefix", () => {
    expect(SESSION_CLAIM_DIR_PREFIX.startsWith("skill-summon-session-")).toBe(
      false,
    );
  });

  it("never exposes an absent or truncated session.json to GC during recordSkill truncate-to-write barrier on an old live root", async () => {
    const tempRoot = await makeTempRoot();
    const oldRoot = path.join(tempRoot, "skill-summon-session-old-live-writer");
    await mkdir(oldRoot, { mode: 0o700 });
    const oldCreatedAt = "2026-04-01T00:00:00.000Z";
    const initialManifest = {
      id: "old-live-writer",
      harnessSessionId: "old-live-writer-id",
      createdAt: oldCreatedAt,
      pid: process.pid,
      skills: [],
    };
    const manifestPath = path.join(oldRoot, "session.json");
    await writeFile(manifestPath, JSON.stringify(initialManifest, null, 2), "utf8");
    const session = await SummonSession.loadAt(oldRoot, tempRoot);

    const sampleSkill = (id: string) => ({
      id,
      name: id,
      contributor: "gaia",
      sourceUrl: `https://example.invalid/${id}`,
      repoUrl: "https://example.invalid/repo",
      branch: "main",
      subpath: `skills/${id}`,
      path: path.join(session.skillsRoot, id),
      fileCount: 1,
      sha256: "a".repeat(64),
      cacheState: "cold" as const,
      cache: "cold" as const,
      cacheSource: "remote" as const,
      inspectUrl: "https://example.invalid/inspect",
      card: id,
      cloneSeconds: 0.1,
      materializeSeconds: 0.1,
      totalSeconds: 0.2,
    });

    // Deterministic pass-through FS barrier: executes real open(flag, mode) (O_TRUNC or O_CREAT|O_EXCL),
    // pauses BEFORE writing bytes, runs real GC on the old root, then finishes write + close.
    const writerPausedBetweenTruncateAndWrite = deferred();
    const releaseWriter = deferred();
    let interceptedTarget: string | undefined;

    hookState.onWriteFile = async (actualOpen, actualWriteFile, args) => {
      const [targetPath, data, opts] = args;
      if (
        typeof targetPath === "string" &&
        path.dirname(targetPath) === oldRoot &&
        (targetPath === manifestPath ||
          path.basename(targetPath).startsWith(".session.json.tmp-"))
      ) {
        interceptedTarget = targetPath;
        const flag =
          typeof opts === "object" && opts !== null && "flag" in opts && typeof opts.flag === "string"
            ? opts.flag
            : "w";
        const mode =
          typeof opts === "object" && opts !== null && "mode" in opts && typeof opts.mode === "number"
            ? opts.mode
            : 0o666;
        const fh = await actualOpen(targetPath, flag, mode);
        try {
          writerPausedBetweenTruncateAndWrite.resolve();
          await releaseWriter.promise;
          await fh.writeFile(data as string, "utf8");
        } finally {
          await fh.close();
        }
        return;
      }
      await actualWriteFile(...args);
    };

    const recordPromise = session.recordSkill(sampleSkill("skill-one"));
    await writerPausedBetweenTruncateAndWrite.promise;
    expect(interceptedTarget).toBeDefined();
    expect(interceptedTarget).not.toBe(manifestPath);

    // While recordSkill is paused between open/truncate and write, session.json MUST stay valid & live,
    // and real GC with a future clock must protect oldRoot rather than treating it as missing/abandoned.
    const parsedDuringWrite = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; skills: unknown[] };
    expect(parsedDuringWrite.pid).toBe(process.pid);

    const gcDuringRecord = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-02T00:00:00.000Z"),
      dryRun: false,
    });
    expect(gcDuringRecord.candidates).toEqual([]);
    expect(gcDuringRecord.liveProtected).toContain(oldRoot);
    await expect(access(oldRoot)).resolves.toBeUndefined();

    releaseWriter.resolve();
    await recordPromise;
    hookState.onWriteFile = undefined;

    const finalManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; skills: Array<{ id: string }> };
    expect(finalManifest.pid).toBe(process.pid);
    expect(finalManifest.skills.map((s) => s.id)).toEqual(["skill-one"]);

    // Concurrent recordSkill calls are serialized so neither rename clobbers the other,
    // and an injected rename failure preserves the committed manifest and cleans up tmp.
    await Promise.all([
      session.recordSkill(sampleSkill("skill-two")),
      session.recordSkill(sampleSkill("skill-three")),
    ]);
    const afterConcurrent = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { skills: Array<{ id: string }> };
    expect(afterConcurrent.skills.map((s) => s.id)).toEqual([
      "skill-one",
      "skill-two",
      "skill-three",
    ]);

    hookState.beforeOp = (op, args) => {
      if (op === "rename" && args[1] === manifestPath) {
        throw Object.assign(new Error("Injected recordSkill rename failure"), {
          code: "EIO",
        });
      }
    };
    await expect(
      session.recordSkill(sampleSkill("skill-four")),
    ).rejects.toThrow(/Injected recordSkill rename failure/u);
    hookState.beforeOp = undefined;
    expect(
      (
        JSON.parse(await readFile(manifestPath, "utf8")) as {
          skills: Array<{ id: string }>;
        }
      ).skills.map((s) => s.id),
    ).toEqual(["skill-one", "skill-two", "skill-three"]);
    expect(
      (await readdir(oldRoot)).filter((name) => name.startsWith(".session.json.tmp-")),
    ).toEqual([]);
  });

  it("coordinates initial fresh owner publication against ttl0 GC without exposing deleted roots or poisoning fresh sessions when claim/index are unavailable", async () => {
    const tempRoot = await makeTempRoot();
    const indexPathFor = (id: string) =>
      path.join(
        tempRoot,
        expectedIndexDirName(),
        `${expectedIndexKey(id)}.json`,
      );

    // 1. ttl0 GC deletes empty mkdtemp root before createAt acquires claim ->
    // openSession/createAt MUST reject and never expose or index the deleted root.
    const gcDeletedBeforeClaim = deferred();
    let createdDirPath: string | undefined;
    let openPaused = false;
    hookState.afterOp = async (op, _args, result) => {
      if (op === "mkdtemp" && !openPaused && typeof result === "string") {
        openPaused = true;
        createdDirPath = result;
        const gcRes = await reapSessions({ tempRoot, ttlHours: 0 });
        expect(gcRes.candidates.map((c) => c.root)).toContain(result);
        gcDeletedBeforeClaim.resolve();
      }
    };
    await expect(
      openSession({ tempRoot, harnessSessionId: "ttl0-deleted-before-claim" }),
    ).rejects.toThrow(/not an existing directory/u);
    await gcDeletedBeforeClaim.promise;
    hookState.afterOp = undefined;
    expect(createdDirPath).toBeDefined();
    await expect(access(createdDirPath!)).rejects.toThrow();
    await expect(access(indexPathFor("ttl0-deleted-before-claim"))).rejects.toThrow();

    // 2. createAt acquires claim and pauses before publishing session.json ->
    // ttl0 GC sees busy and skips; createAt commits and subsequent ttl0 GC protects live root.
    const createHoldingClaim = deferred();
    const releaseCreateWrite = deferred();
    let pausedCreate = false;
    hookState.beforeOp = async (op, args) => {
      if (
        !pausedCreate &&
        op === "writeFile" &&
        typeof args[0] === "string" &&
        path.basename(args[0]).startsWith(".session.json.tmp-")
      ) {
        pausedCreate = true;
        createHoldingClaim.resolve();
        await releaseCreateWrite.promise;
      }
    };
    const createPromise = openSession({
      tempRoot,
      harnessSessionId: "ttl0-during-create-claim",
    });
    await createHoldingClaim.promise;

    const gcWhileCreating = await reapSessions({ tempRoot, ttlHours: 0 });
    expect(gcWhileCreating.candidates).toEqual([]);

    releaseCreateWrite.resolve();
    const createdSession = await createPromise;
    hookState.beforeOp = undefined;

    await expect(access(createdSession.root)).resolves.toBeUndefined();
    const gcAfterCreate = await reapSessions({ tempRoot, ttlHours: 0 });
    expect(gcAfterCreate.candidates).toEqual([]);
    expect(gcAfterCreate.liveProtected).toContain(createdSession.root);

    // 3. ttl0 GC holds claim right before quarantine rename(root) -> direct createAt sees busy and fails
    // without publishing session.json or exposing the doomed root.
    const doomedRoot = path.join(tempRoot, "skill-summon-session-doomed-by-gc");
    await mkdir(doomedRoot, { mode: 0o700 });
    const gcAboutToRm = deferred();
    const releaseGcRm = deferred();
    hookState.beforeOp = async (op, args) => {
      if (op === "rename" && args[0] === doomedRoot) {
        gcAboutToRm.resolve();
        await releaseGcRm.promise;
      }
    };
    const gcDoomedPromise = reapSessions({ tempRoot, ttlHours: 0 });
    await gcAboutToRm.promise;

    await expect(
      SummonSession.createAt(doomedRoot, "doomed-id", {
        tempRoot,
        harnessSessionId: "doomed-harness-id",
      }),
    ).rejects.toThrow(/ownership claim is busy/u);
    await expect(access(indexPathFor("doomed-harness-id"))).rejects.toThrow();

    releaseGcRm.resolve();
    const gcDoomedOutcome = await gcDoomedPromise;
    hookState.beforeOp = undefined;
    expect(gcDoomedOutcome.candidates.map((c) => c.root)).toEqual([doomedRoot]);
    await expect(access(doomedRoot)).rejects.toThrow();

    // 4. Unavailable claim dir (0500 or 0755) + unavailable index dir (0500) must NOT poison fresh sessions.
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const degradedTemp = await makeTempRoot();
      const claimsDir = sessionClaimDir(degradedTemp);
      const indexDir = path.join(degradedTemp, expectedIndexDirName());
      await mkdir(claimsDir, { mode: 0o500 });
      await chmod(claimsDir, 0o500);
      await mkdir(indexDir, { mode: 0o500 });
      await chmod(indexDir, 0o500);
      try {
        const freshInDegraded = await resolveSession({
          tempRoot: degradedTemp,
          harnessSessionId: "fresh-degraded-id",
        });
        expect(freshInDegraded.created).toBe(true);
        expect(freshInDegraded.session.pid).toBe(process.pid);
        await expect(
          access(path.join(freshInDegraded.session.root, "session.json")),
        ).resolves.toBeUndefined();

        const gcDegraded = await reapSessions({
          tempRoot: degradedTemp,
          ttlHours: 0,
        });
        expect(gcDegraded.candidates).toEqual([]);
        expect(gcDegraded.liveProtected).toContain(freshInDegraded.session.root);
      } finally {
        await chmod(claimsDir, 0o700).catch(() => {});
        await chmod(indexDir, 0o700).catch(() => {});
      }
    }
  });

  it("refuses explicit close() conservatively when claim status is unavailable so held/adopting roots cannot be deleted", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;

    const tempRoot = await makeTempRoot();
    const harnessId = "close-unavailable-preserve-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessId, {
      withCampaignRetention: 24,
    });
    const claimsDir = sessionClaimDir(tempRoot);
    const indexPath = path.join(
      tempRoot,
      expectedIndexDirName(),
      `${expectedIndexKey(harnessId)}.json`,
    );

    // Spawn a real child holding a reattach claim on seeded.root, then degrade claimsDir to 0755 & 0500.
    const ownershipModuleUrl = pathToFileURL(
      path.resolve("packages/skill-summon/src/summon/session-ownership.ts"),
    ).href;
    const holderScript = path.join(tempRoot, "close-guard-holder.mts");
    await writeFile(
      holderScript,
      `import { realpath } from "node:fs/promises";
import { acquireSessionClaimForRealRoot } from ${JSON.stringify(ownershipModuleUrl)};
const [sessionRoot, tempRoot] = process.argv.slice(2);
const realRoot = await realpath(sessionRoot);
const claim = await acquireSessionClaimForRealRoot(realRoot, tempRoot, "reattach");
if (claim.status !== "acquired") {
  process.stderr.write("acquire-failed:" + claim.status + "\\n");
  process.exit(2);
}
process.stdout.write("HELD\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("RELEASE")) {
    await claim.release();
    process.exit(0);
  }
});
`,
      "utf8",
    );

    const holder = spawn(
      process.execPath,
      [tsxCli, holderScript, seeded.root, tempRoot],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
      },
    );

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

      const session = await SummonSession.loadAt(seeded.root, tempRoot);

      // Unsafe permissive claimsDir (0755) while child holds claim -> close() MUST fail conservatively.
      await chmod(claimsDir, 0o755);
      await expect(session.close()).rejects.toThrow(
        /ownership claim is unavailable/u,
      );
      await expect(access(seeded.root)).resolves.toBeUndefined();
      await expect(access(path.join(seeded.root, "session.json"))).resolves.toBeUndefined();
      expect(JSON.parse(await readFile(indexPath, "utf8"))).toMatchObject({
        roots: [seeded.root],
      });

      // Read-only claimsDir (0500) on an unclaimed root (cannot create claim -> unavailable)
      // AND 0400 claimsDir while child holds claim -> close() MUST fail conservatively in both!
      const secondSeed = await seedDeadIndexedSession(tempRoot, "close-unavailable-unclaimed-id");
      const secondSession = await SummonSession.loadAt(secondSeed.root, tempRoot);
      await chmod(claimsDir, 0o500);
      await expect(secondSession.close()).rejects.toThrow(
        /ownership claim is unavailable/u,
      );
      await expect(access(secondSeed.root)).resolves.toBeUndefined();

      await chmod(claimsDir, 0o400);
      await expect(session.close()).rejects.toThrow(
        /ownership claim is unavailable/u,
      );
      await expect(access(seeded.root)).resolves.toBeUndefined();
      expect(JSON.parse(await readFile(indexPath, "utf8"))).toMatchObject({
        roots: [seeded.root],
      });

      // Restore 0700 while child still holds claim -> busy still blocks close().
      await chmod(claimsDir, 0o700);
      await expect(session.close()).rejects.toThrow(/ownership claim is busy/u);

      // Release child claim -> explicit close() now succeeds cleanly and prunes index.
      holder.stdin.write("RELEASE\n");
      await new Promise<void>((resolve, reject) => {
        holder.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Holder exit code ${code}`));
        });
      });
      await session.close();
      await expect(access(seeded.root)).rejects.toThrow();
      await expect(access(indexPath)).rejects.toThrow();

      // Symlinked claimsDir pointing outside -> close() refuses conservatively and leaves both root and target intact.
      const symTemp = await makeTempRoot();
      const symOutside = await makeTempRoot();
      const symCreated = await resolveSession({
        tempRoot: symTemp,
        harnessSessionId: "sym-close-preserve",
      });
      await rm(sessionClaimDir(symTemp), { recursive: true, force: true });
      await writeFile(path.join(symOutside, "sentinel.txt"), "KEEP", "utf8");
      await symlink(symOutside, sessionClaimDir(symTemp), "dir");
      await expect(symCreated.session.close()).rejects.toThrow(
        /ownership claim is unavailable/u,
      );
      await expect(access(symCreated.session.root)).resolves.toBeUndefined();
      expect(await readFile(path.join(symOutside, "sentinel.txt"), "utf8")).toBe("KEEP");
    } finally {
      await chmod(claimsDir, 0o700).catch(() => {});
      if (holder.exitCode === null) {
        holder.kill("SIGKILL");
      }
    }
  }, 20_000);

  it("preserves pause boundary, dead PID, and primary error when atomic manifest rename fails during reattach", async () => {
    const tempRoot = await makeTempRoot();
    const harnessId = "reattach-rename-fail-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessId, {
      withCampaignRetention: 48,
    });
    const tPause = new Date("2026-04-01T10:00:00.000Z");
    expect((await reapSessions({ tempRoot, ttlHours: 4, now: tPause })).candidates).toEqual([]);

    const manifestPath = path.join(seeded.root, "session.json");
    const pausePath = path.join(seeded.root, "campaign", "pause.json");
    const originalPause = await readFile(pausePath, "utf8");
    const originalManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; ownerGeneration?: string };

    hookState.beforeOp = (op, args) => {
      if (op === "rename" && args[1] === manifestPath) {
        throw Object.assign(new Error("Injected reattach rename failure"), {
          code: "EIO",
        });
      }
    };

    try {
      await expect(
        resolveSession({ tempRoot, harnessSessionId: harnessId }),
      ).rejects.toThrow(/Injected reattach rename failure/u);
    } finally {
      hookState.beforeOp = undefined;
    }

    expect(await readFile(pausePath, "utf8")).toBe(originalPause);
    const manifestAfterCommitFail = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; ownerGeneration?: string };
    expect(manifestAfterCommitFail.pid).toBe(DEAD_PID);
    expect(manifestAfterCommitFail.ownerGeneration).toBe(
      originalManifest.ownerGeneration,
    );
    expect(await readdir(sessionClaimDir(tempRoot))).toEqual([]);
    expect(
      (await readdir(seeded.root)).filter((name) =>
        name.startsWith(".session.json.tmp-"),
      ),
    ).toEqual([]);

    // Original pause retention window remains intact.
    expect(
      (
        await reapSessions({
          tempRoot,
          ttlHours: 4,
          now: new Date(tPause.getTime() + 48 * 3_600_000 - 1),
        })
      ).candidates,
    ).toEqual([]);
    const atExpiry = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tPause.getTime() + 48 * 3_600_000),
    });
    expect(atExpiry.candidates.map((c) => c.root)).toEqual([seeded.root]);
  });

  it("commits reattach atomically without rollback dependency under simultaneous pause cleanup + rollback-write failure, and invalidates stale/forged markers for future real GC", async () => {
    const tempRoot = await makeTempRoot();
    const harnessId = "reattach-double-fault-id";
    const seeded = await seedDeadIndexedSession(tempRoot, harnessId, {
      withCampaignRetention: 48,
    });
    const tOldPause = new Date("2026-04-01T10:00:00.000Z");
    expect(
      (await reapSessions({ tempRoot, ttlHours: 4, now: tOldPause })).candidates,
    ).toEqual([]);

    const manifestPath = path.join(seeded.root, "session.json");
    const pausePath = path.join(seeded.root, "campaign", "pause.json");
    const originalPauseRaw = await readFile(pausePath, "utf8");
    const originalManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; ownerGeneration?: string };
    const originalPause = JSON.parse(originalPauseRaw) as {
      pausedAt: string;
      pid: number;
      ownerGeneration?: string;
      recordSha256: string;
    };
    expect(originalManifest.ownerGeneration).toBeDefined();
    expect(originalPause.ownerGeneration).toBe(originalManifest.ownerGeneration);

    // Inject simultaneous failures:
    // 1. pause.json cleanup (`rm`) fails with EIO, AND
    // 2. ANY second manifest write/rename (what a rollback would attempt) ALSO fails with EIO.
    let manifestRenameCount = 0;
    let pauseRmAttempted = false;
    hookState.beforeOp = (op, args) => {
      if (op === "rename" && args[1] === manifestPath) {
        manifestRenameCount++;
        if (manifestRenameCount >= 2) {
          throw Object.assign(new Error("Injected rollback manifest write failure"), {
            code: "EIO",
          });
        }
      }
      if (op === "rm" && args[0] === pausePath) {
        pauseRmAttempted = true;
        throw Object.assign(new Error("Injected pause cleanup failure"), {
          code: "EIO",
        });
      }
    };

    let adopted;
    try {
      adopted = await resolveSession({ tempRoot, harnessSessionId: harnessId });
    } finally {
      hookState.beforeOp = undefined;
    }

    // Coherent observable result: single authoritative commit succeeded with zero rollback write,
    // new owner PID + fresh ownerGeneration are committed on disk, claims are released cleanly.
    expect(manifestRenameCount).toBe(1);
    expect(pauseRmAttempted).toBe(true);
    expect(adopted.created).toBe(false);
    expect(adopted.session.root).toBe(seeded.root);
    expect(adopted.session.pid).toBe(process.pid);
    expect(adopted.session.ownerGeneration).toBeDefined();
    expect(adopted.session.ownerGeneration).not.toBe(
      originalManifest.ownerGeneration,
    );

    const committedManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as { pid: number; ownerGeneration?: string };
    expect(committedManifest.pid).toBe(process.pid);
    expect(committedManifest.ownerGeneration).toBe(
      adopted.session.ownerGeneration,
    );
    expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);
    expect(await readdir(sessionClaimDir(tempRoot))).toEqual([]);

    // Simulate new owner dying (preserving its new ownerGeneration).
    // Even well past old expiry (tOldPause + 100h), real GC MUST NOT reuse old pause.json!
    committedManifest.pid = DEAD_PID;
    await writeFile(
      manifestPath,
      JSON.stringify(committedManifest, null, 2),
      "utf8",
    );

    const tNewObs = new Date(tOldPause.getTime() + 100 * 3_600_000);
    const dryAtNewObs = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: tNewObs,
      dryRun: true,
    });
    expect(dryAtNewObs.candidates).toEqual([]);
    expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);

    const realAtNewObs = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: tNewObs,
      dryRun: false,
    });
    expect(realAtNewObs.candidates).toEqual([]);
    await expect(access(seeded.root)).resolves.toBeUndefined();

    const refreshedPause = JSON.parse(
      await readFile(pausePath, "utf8"),
    ) as {
      pausedAt: string;
      pid: number;
      ownerGeneration?: string;
      recordSha256: string;
    };
    expect(refreshedPause.pausedAt).toBe(tNewObs.toISOString());
    expect(refreshedPause.pid).toBe(DEAD_PID);
    expect(refreshedPause.ownerGeneration).toBe(adopted.session.ownerGeneration);
    expect(refreshedPause.recordSha256).toBe(originalPause.recordSha256);

    // Forged stale pause.json (matching DEAD_PID & current recordSha256, but old/missing ownerGeneration)
    // must ALSO be rejected and re-anchored to tForgeObs without reusing old expiry.
    const tForgeObs = new Date(tNewObs.getTime() + 10 * 3_600_000);
    await writeFile(
      pausePath,
      JSON.stringify({
        pausedAt: "2020-01-01T00:00:00.000Z",
        pid: DEAD_PID,
        ownerGeneration: originalManifest.ownerGeneration,
        recordSha256: originalPause.recordSha256,
      }),
      "utf8",
    );
    expect(
      (await reapSessions({ tempRoot, ttlHours: 4, now: tForgeObs, dryRun: true }))
        .candidates,
    ).toEqual([]);
    expect(
      (await reapSessions({ tempRoot, ttlHours: 4, now: tForgeObs, dryRun: false }))
        .candidates,
    ).toEqual([]);
    const afterForgeReap = JSON.parse(
      await readFile(pausePath, "utf8"),
    ) as { pausedAt: string; ownerGeneration?: string };
    expect(afterForgeReap.pausedAt).toBe(tForgeObs.toISOString());
    expect(afterForgeReap.ownerGeneration).toBe(adopted.session.ownerGeneration);

    // Full 48h window from tForgeObs is preserved until 1ms before expiry, then reaped at exact expiry.
    expect(
      (
        await reapSessions({
          tempRoot,
          ttlHours: 4,
          now: new Date(tForgeObs.getTime() + 48 * 3_600_000 - 1),
        })
      ).candidates,
    ).toEqual([]);
    await expect(access(seeded.root)).resolves.toBeUndefined();

    const atFinalExpiry = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tForgeObs.getTime() + 48 * 3_600_000),
    });
    expect(atFinalExpiry.candidates.map((c) => c.root)).toEqual([seeded.root]);
    await expect(access(seeded.root)).rejects.toThrow();
  });

  it("fences fresh session publication against concurrent ttl0 real GC even on transient external claimsDir EIO, and quarantines atomically", async () => {
    const tempRoot = await makeTempRoot();
    const claimsDir = sessionClaimDir(tempRoot);

    for (const faultOp of ["mkdir", "open"] as const) {
      const harnessId = `transient-eio-${faultOp}`;
      if (faultOp === "open") {
        await mkdir(claimsDir, { mode: 0o700, recursive: true });
      } else {
        await rm(claimsDir, { recursive: true, force: true });
      }

      let injectedExternalEio = false;
      let pausedBeforeManifestWrite = false;
      const creatorReadyBeforeManifest = deferred();
      const releaseCreatorWrite = deferred();

      hookState.beforeOp = async (op, args) => {
        if (
          !injectedExternalEio &&
          op === faultOp &&
          typeof args[0] === "string" &&
          (faultOp === "mkdir"
            ? args[0] === claimsDir
            : args[0].startsWith(`${claimsDir}${path.sep}`))
        ) {
          injectedExternalEio = true;
          throw Object.assign(
            new Error(`Injected transient ${faultOp} EIO on claimsDir`),
            { code: "EIO" },
          );
        }

        if (
          !pausedBeforeManifestWrite &&
          op === "writeFile" &&
          typeof args[0] === "string" &&
          path.basename(args[0]).startsWith(".session.json.tmp-")
        ) {
          pausedBeforeManifestWrite = true;
          creatorReadyBeforeManifest.resolve();
          await releaseCreatorWrite.promise;
        }
      };

      const createPromise = resolveSession({
        tempRoot,
        harnessSessionId: harnessId,
      });
      await creatorReadyBeforeManifest.promise;
      expect(injectedExternalEio).toBe(true);

      // Transient EIO is now over: external claimsDir IS available to ttl0 GC!
      // Yet GC MUST still see the root-local claim as busy and NOT quarantine/delete the root.
      const gcDuringTransientEioCreate = await reapSessions({
        tempRoot,
        ttlHours: 0,
      });
      expect(gcDuringTransientEioCreate.candidates).toEqual([]);

      releaseCreatorWrite.resolve();
      const created = await createPromise;
      hookState.beforeOp = undefined;

      expect(created.created).toBe(true);
      await expect(access(created.session.root)).resolves.toBeUndefined();
      const manifest = JSON.parse(
        await readFile(path.join(created.session.root, "session.json"), "utf8"),
      ) as { pid: number; harnessSessionId?: string; ownerGeneration?: string };
      expect(manifest.pid).toBe(process.pid);
      expect(manifest.harnessSessionId).toBe(harnessId);
      expect(manifest.ownerGeneration).toBe(created.session.ownerGeneration);

      // Subsequent ttl0 GC sees live PID and protects the returned session root.
      const gcAfterReturn = await reapSessions({ tempRoot, ttlHours: 0 });
      expect(gcAfterReturn.candidates).toEqual([]);
      expect(gcAfterReturn.liveProtected).toContain(created.session.root);
    }

    // Reverse interleaving: ttl0 GC acquires claim FIRST, executes atomic quarantine rename,
    // and pauses BEFORE rm(quarantinePath). Creator resumes and MUST fail cleanly without
    // writing session.json, indexing, or returning a deleted root.
    const gcInQuarantineRm = deferred();
    const releaseQuarantineRm = deferred();
    let targetRootFromMkdtemp: string | undefined;
    let pausedOpenSession = false;
    const allowOpenCreateAt = deferred();
    const openSessionPausedAfterMkdtemp = deferred();

    hookState.afterOp = async (op, _args, result) => {
      if (op === "mkdtemp" && !pausedOpenSession && typeof result === "string") {
        pausedOpenSession = true;
        targetRootFromMkdtemp = result;
        openSessionPausedAfterMkdtemp.resolve();
        await allowOpenCreateAt.promise;
      }
    };

    const doomedOpenPromise = openSession({
      tempRoot,
      harnessSessionId: "ttl0-quarantine-before-create",
    });
    await openSessionPausedAfterMkdtemp.promise;
    hookState.afterOp = undefined;

    hookState.beforeOp = async (op, args) => {
      if (
        op === "rm" &&
        typeof args[0] === "string" &&
        path.basename(args[0]).startsWith(".skill-summon-reap-")
      ) {
        gcInQuarantineRm.resolve();
        await releaseQuarantineRm.promise;
      }
    };

    const gcQuarantinePromise = reapSessions({ tempRoot, ttlHours: 0 });
    await gcInQuarantineRm.promise;

    // While quarantined root is paused right before rm(quarantinePath),
    // release creator -> creator MUST reject because targetRootFromMkdtemp is gone!
    allowOpenCreateAt.resolve();
    await expect(doomedOpenPromise).rejects.toThrow(/not an existing directory/u);
    await expect(access(targetRootFromMkdtemp!)).rejects.toThrow();

    releaseQuarantineRm.resolve();
    const gcQuarantineRes = await gcQuarantinePromise;
    hookState.beforeOp = undefined;
    expect(gcQuarantineRes.candidates.map((c) => c.root)).toContain(
      targetRootFromMkdtemp!,
    );
  });
});
