import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
} from "skill-zero";

import { CampaignStore } from "../src/campaign/store.js";
import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import {
  HARNESS_SESSION_ID_ENV_VARS,
  reapSessions,
  resolveSession,
  type InstalledSkill,
} from "../src/summon/session.js";

const cleanupRoots: string[] = [];
const savedHarnessSessionId = process.env.CLAUDE_CODE_SESSION_ID;
const savedSummonSession = process.env.SKILL_SUMMON_SESSION;

afterEach(async () => {
  if (savedHarnessSessionId === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
  else process.env.CLAUDE_CODE_SESSION_ID = savedHarnessSessionId;

  if (savedSummonSession === undefined) delete process.env.SKILL_SUMMON_SESSION;
  else process.env.SKILL_SUMMON_SESSION = savedSummonSession;

  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-reattach-test-"));
  cleanupRoots.push(root);
  return root;
}

const sampleSkill = (skillsRoot: string): InstalledSkill => ({
  id: "skill-alpha",
  name: "Skill Alpha",
  contributor: "gaia",
  sourceUrl: "https://example.invalid/skill-alpha",
  repoUrl: "https://example.invalid/repo",
  branch: "main",
  subpath: "skills/alpha",
  path: path.join(skillsRoot, "skill-alpha"),
  fileCount: 1,
  sha256: "a".repeat(64),
  cacheState: "cold",
  cache: "cold",
  cacheSource: "remote",
  inspectUrl: "https://example.invalid/inspect",
  card: "Skill Alpha",
  cloneSeconds: 0.1,
  materializeSeconds: 0.1,
  totalSeconds: 0.2,
});

const reconPayload: CampaignRecon = {
  schema: CAMPAIGN_SCHEMA_IDS.recon,
  findings: ["Recon finding"],
  citations: ["citation:1"],
};

function makeCharter(sessionRetention: number): CampaignCharter {
  return {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: 1,
    goal: "Test session retention",
    allowedSkills: ["skill-alpha"],
    queue: [{ id: "u1", skill: "skill-alpha", reconCitation: "citation:1" }],
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
  await store.append({ channel: "agent", op: "open" });
  await store.append({ channel: "agent", op: "recon", recon: reconPayload });
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

describe("session re-attachment by harness session id", () => {
  it("exports CLAUDE_CODE_SESSION_ID from a single env-source constant", () => {
    expect(HARNESS_SESSION_ID_ENV_VARS).toEqual(["CLAUDE_CODE_SESSION_ID"]);
  });

  it("re-attaches to a dead-pid root with matching CLAUDE_CODE_SESSION_ID, updates pid, and preserves summoned paths and campaign", async () => {
    const tempRoot = await makeTempRoot();
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-match-1";

    const first = await resolveSession({ tempRoot });
    expect(first.created).toBe(true);
    expect(first.session.harnessSessionId).toBe("sess-match-1");

    await first.session.ensureRoots();
    const skill = sampleSkill(first.session.skillsRoot);
    await mkdir(skill.path, { recursive: true });
    await writeFile(path.join(skill.path, "SKILL.md"), "# Skill Alpha\n", "utf8");
    await first.session.recordSkill(skill);
    await seedPausedCampaign(first.session.root, 24);

    // Simulate previous process death by writing a dead PID into session.json.
    const manifestPath = path.join(first.session.root, "session.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.pid = 99_999_999;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const resumed = await resolveSession({ tempRoot });
    expect(resumed.created).toBe(false);
    expect(resumed.session.root).toBe(first.session.root);
    expect(resumed.session.id).toBe(first.session.id);
    expect(resumed.session.pid).toBe(process.pid);
    expect(resumed.session.skills).toHaveLength(1);
    expect(resumed.session.skills[0]?.path).toBe(skill.path);
    await expect(access(path.join(skill.path, "SKILL.md"))).resolves.toBeUndefined();

    const reloadedStore = await CampaignStore.load(resumed.session.root);
    expect(reloadedStore.corrupted).toBe(false);
    expect(reloadedStore.state.state).toBe(CampaignStates.executing);
  });

  it("creates a fresh root for missing, unmatched, fork, or live-pid session ids", async () => {
    const tempRoot = await makeTempRoot();
    delete process.env.SKILL_SUMMON_SESSION;

    // 1. Missing CLAUDE_CODE_SESSION_ID -> fresh root
    delete process.env.CLAUDE_CODE_SESSION_ID;
    const missing = await resolveSession({ tempRoot });
    expect(missing.created).toBe(true);
    expect(missing.session.harnessSessionId).toBeUndefined();

    // 2. Live PID with same CLAUDE_CODE_SESSION_ID -> must NOT steal live root; creates fresh root
    process.env.CLAUDE_CODE_SESSION_ID = "sess-live-1";
    const liveFirst = await resolveSession({ tempRoot });
    expect(liveFirst.created).toBe(true);
    await seedPausedCampaign(liveFirst.session.root, 24);

    const liveSecond = await resolveSession({ tempRoot });
    expect(liveSecond.created).toBe(true);
    expect(liveSecond.session.root).not.toBe(liveFirst.session.root);

    // 3. Unmatched id -> fresh root
    process.env.CLAUDE_CODE_SESSION_ID = "sess-unmatched";
    const unmatched = await resolveSession({ tempRoot });
    expect(unmatched.created).toBe(true);
    expect(unmatched.session.root).not.toBe(liveFirst.session.root);

    // 4. Fork's new id -> fresh root and no campaign (PR-10)
    process.env.CLAUDE_CODE_SESSION_ID = "sess-fork-new";
    const forked = await resolveSession({ tempRoot });
    expect(forked.created).toBe(true);
    expect(forked.session.root).not.toBe(liveFirst.session.root);
    const forkedStore = await CampaignStore.load(forked.session.root);
    expect(forkedStore.hasTrace).toBe(false);
    expect(forkedStore.state.state).toBe(CampaignStates.unarmed);
  });

  it("refuses forged outside-directory SKILL_SUMMON_SESSION and ignores symlinked roots on scan", async () => {
    const tempRoot = await makeTempRoot();
    const outside = await makeTempRoot();

    // Forged SKILL_SUMMON_SESSION pointing outside disposable namespace
    process.env.SKILL_SUMMON_SESSION = outside;
    await expect(resolveSession({ tempRoot })).rejects.toThrow(/not a disposable session directory/u);
    delete process.env.SKILL_SUMMON_SESSION;

    // Symlinked skill-summon-session-* directory inside tempRoot with matching id & dead pid
    await writeFile(
      path.join(outside, "session.json"),
      JSON.stringify({
        id: "forged",
        harnessSessionId: "sess-symlink",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: 99_999_999,
        skills: [],
      }),
      "utf8",
    );
    await symlink(outside, path.join(tempRoot, "skill-summon-session-symlinked"), "dir");

    process.env.CLAUDE_CODE_SESSION_ID = "sess-symlink";
    const res = await resolveSession({ tempRoot });
    expect(res.created).toBe(true);
    expect(res.session.root).not.toBe(outside);
    expect(res.session.root).not.toBe(path.join(tempRoot, "skill-summon-session-symlinked"));
  });

  it("enforces automatic reattachment policy when SKILL_SUMMON_SESSION is set with harnessSessionId (same/mismatched/fork/live/missing-manifest-id)", async () => {
    const tempRoot = await makeTempRoot();
    delete process.env.CLAUDE_CODE_SESSION_ID;

    // Seed original session with a campaign and dead pid.
    delete process.env.SKILL_SUMMON_SESSION;
    const original = await resolveSession({
      tempRoot,
      harnessSessionId: "original",
    });
    await seedPausedCampaign(original.session.root, 24);
    const manifestPath = path.join(original.session.root, "session.json");
    const deadManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    deadManifest.pid = 99_999_999;
    await writeFile(manifestPath, JSON.stringify(deadManifest, null, 2), "utf8");

    // 1. Fork id with SKILL_SUMMON_SESSION pointing at original root -> fresh root, no campaign!
    process.env.SKILL_SUMMON_SESSION = original.session.root;
    const forked = await resolveSession({
      tempRoot,
      harnessSessionId: "fork-id",
    });
    expect(forked.created).toBe(true);
    expect(forked.session.root).not.toBe(original.session.root);
    expect(forked.session.id).not.toBe(original.session.id);
    const forkedStore = await CampaignStore.load(forked.session.root);
    expect(forkedStore.hasTrace).toBe(false);
    expect(forkedStore.state.state).toBe(CampaignStates.unarmed);

    // 2. Mismatched id with SKILL_SUMMON_SESSION pointing at original root -> fresh root
    const mismatched = await resolveSession({
      tempRoot,
      harnessSessionId: "mismatched-id",
    });
    expect(mismatched.created).toBe(true);
    expect(mismatched.session.root).not.toBe(original.session.root);

    // 3. Same id + dead pid with SKILL_SUMMON_SESSION -> re-attaches and updates pid
    const same = await resolveSession({
      tempRoot,
      harnessSessionId: "original",
    });
    expect(same.created).toBe(false);
    expect(same.session.root).toBe(original.session.root);
    expect(same.session.id).toBe(original.session.id);
    expect(same.session.pid).toBe(process.pid);

    // 4. Same id + live pid (now process.pid) with SKILL_SUMMON_SESSION -> must NOT steal live root
    const live = await resolveSession({
      tempRoot,
      harnessSessionId: "original",
    });
    expect(live.created).toBe(true);
    expect(live.session.root).not.toBe(original.session.root);

    // 5. Missing harnessSessionId in manifest with SKILL_SUMMON_SESSION + caller harnessSessionId -> fresh root
    const noManifestIdRoot = path.join(tempRoot, "skill-summon-session-no-harness-id");
    await mkdir(noManifestIdRoot);
    await writeFile(
      path.join(noManifestIdRoot, "session.json"),
      JSON.stringify({
        id: "legacy-warm",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: 99_999_999,
        skills: [],
      }),
      "utf8",
    );
    process.env.SKILL_SUMMON_SESSION = noManifestIdRoot;
    const withCallerId = await resolveSession({
      tempRoot,
      harnessSessionId: "caller-id",
    });
    expect(withCallerId.created).toBe(true);
    expect(withCallerId.session.root).not.toBe(noManifestIdRoot);

    // 6. Legacy explicit warm-root reuse without harness ID -> still reuses SKILL_SUMMON_SESSION
    const legacy = await resolveSession({ tempRoot });
    expect(legacy.created).toBe(false);
    expect(legacy.session.root).toBe(noManifestIdRoot);
    expect(legacy.session.id).toBe("legacy-warm");
  });

  it("validates manifest shape and pid evidence rather than treating malformed/missing pid as proven dead", async () => {
    const tempRoot = await makeTempRoot();
    delete process.env.SKILL_SUMMON_SESSION;

    for (const [label, badManifest] of [
      ["missing-pid", { id: "m1", harnessSessionId: "sess-bad-pid", createdAt: "2026-04-01T00:00:00.000Z", skills: [] }],
      ["string-pid", { id: "m2", harnessSessionId: "sess-bad-pid", createdAt: "2026-04-01T00:00:00.000Z", pid: "99999999", skills: [] }],
      ["zero-pid", { id: "m3", harnessSessionId: "sess-bad-pid", createdAt: "2026-04-01T00:00:00.000Z", pid: 0, skills: [] }],
      ["negative-pid", { id: "m4", harnessSessionId: "sess-bad-pid", createdAt: "2026-04-01T00:00:00.000Z", pid: -5, skills: [] }],
      ["missing-skills", { id: "m5", harnessSessionId: "sess-bad-pid", createdAt: "2026-04-01T00:00:00.000Z", pid: 99_999_999 }],
    ] as const) {
      const badRoot = path.join(tempRoot, `skill-summon-session-${label}`);
      await mkdir(badRoot);
      await writeFile(path.join(badRoot, "session.json"), JSON.stringify(badManifest), "utf8");

      // Scan path must not treat malformed/missing pid as proven dead.
      delete process.env.SKILL_SUMMON_SESSION;
      const scanned = await resolveSession({
        tempRoot,
        harnessSessionId: "sess-bad-pid",
      });
      expect(scanned.created).toBe(true);
      expect(scanned.session.root).not.toBe(badRoot);

      // Explicit env-root path must reject malformed manifest shape.
      process.env.SKILL_SUMMON_SESSION = badRoot;
      await expect(
        resolveSession({ tempRoot, harnessSessionId: "sess-bad-pid" }),
      ).rejects.toThrow(/Invalid session manifest/u);
    }
  });
});

describe("paused campaign reaper retention (deterministic clock)", () => {
  async function createDeadRoot(
    tempRoot: string,
    name: string,
    createdAtIso: string,
  ): Promise<string> {
    const root = path.join(tempRoot, `skill-summon-session-${name}`);
    await mkdir(root);
    await writeFile(
      path.join(root, "session.json"),
      JSON.stringify({
        id: name,
        createdAt: createdAtIso,
        pid: 99_999_999,
        skills: [],
      }),
      "utf8",
    );
    return root;
  }

  it("keeps a paused campaign inside its decided sessionRetention window and reaps it after", async () => {
    const tempRoot = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";
    const pausedRoot = await createDeadRoot(tempRoot, "paused-48h", createdAt);
    const legacyRoot = await createDeadRoot(tempRoot, "legacy-no-campaign", createdAt);

    await seedPausedCampaign(pausedRoot, 48);

    // At +10h (past default 4h TTL, inside 48h decided retention):
    // legacyRoot is reaped; pausedRoot is kept.
    const at10h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T10:00:00.000Z"),
    });
    expect(at10h.candidates.map((c) => c.root)).toEqual([legacyRoot]);
    await expect(access(legacyRoot)).rejects.toThrow();
    await expect(access(pausedRoot)).resolves.toBeUndefined();

    // At +47h59m from creation (37h59m from pause): still kept.
    const at47h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-02T23:59:00.000Z"),
    });
    expect(at47h.candidates).toEqual([]);
    await expect(access(pausedRoot)).resolves.toBeUndefined();

    // At +48h01m from creation (38h01m from pause): still inside 48h pause window, kept.
    const at38hFromPause = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T00:01:00.000Z"),
    });
    expect(at38hFromPause.candidates).toEqual([]);
    await expect(access(pausedRoot)).resolves.toBeUndefined();

    // At +47h59m from pause (2026-04-03T09:59:00.000Z): still kept.
    const at47h59mFromPause = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T09:59:00.000Z"),
    });
    expect(at47h59mFromPause.candidates).toEqual([]);
    await expect(access(pausedRoot)).resolves.toBeUndefined();

    // At +48h01m from pause (2026-04-03T10:01:00.000Z): past decided window, reaped as usual.
    const at48hFromPause = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T10:01:00.000Z"),
    });
    expect(at48hFromPause.candidates.map((c) => c.root)).toEqual([pausedRoot]);
    await expect(access(pausedRoot)).rejects.toThrow();
  });

  it("anchors retention to pause boundary for 49h-old sessions, does not renew on repeated reaps, and enforces exact boundary", async () => {
    const tempRoot = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";
    const oldSessionRoot = await createDeadRoot(tempRoot, "old-49h-new-pause", createdAt);
    await seedPausedCampaign(oldSessionRoot, 48);

    // Process exits after 49h alive; first reap at +49h records pause boundary at 2026-04-03T01:00:00Z.
    const firstReap = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T01:00:00.000Z"),
    });
    expect(firstReap.candidates).toEqual([]);
    await expect(access(oldSessionRoot)).resolves.toBeUndefined();

    // Repeated reaps at +10h and +47h59m59s from pause do not renew the window and keep the root.
    const repeat1 = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T11:00:00.000Z"),
    });
    expect(repeat1.candidates).toEqual([]);

    const justBeforeBoundary = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-05T00:59:59.000Z"),
    });
    expect(justBeforeBoundary.candidates).toEqual([]);
    await expect(access(oldSessionRoot)).resolves.toBeUndefined();

    // At exact 48h00m00s from pause boundary, it reaps.
    const atExactBoundary = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-05T01:00:00.000Z"),
    });
    expect(atExactBoundary.candidates.map((c) => c.root)).toEqual([oldSessionRoot]);
    await expect(access(oldSessionRoot)).rejects.toThrow();
  });

  it("resets pause lifecycle on reattach/resume and fails closed on tampered pause boundary", async () => {
    const tempRoot = await makeTempRoot();
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-pause-reset";

    const first = await resolveSession({ tempRoot });
    await seedPausedCampaign(first.session.root, 48);

    // Simulate dead pid and first reap recording pause at T0 + 1h.
    const manifestPath = path.join(first.session.root, "session.json");
    const m1 = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    m1.pid = 99_999_999;
    await writeFile(manifestPath, JSON.stringify(m1, null, 2), "utf8");

    const tPause1 = new Date("2026-04-01T01:00:00.000Z");
    expect((await reapSessions({ tempRoot, ttlHours: 4, now: tPause1 })).candidates).toEqual([]);
    await expect(access(path.join(first.session.root, "campaign", "pause.json"))).resolves.toBeUndefined();

    // Reattach resets pause lifecycle (clears pause.json).
    const resumed = await resolveSession({ tempRoot });
    expect(resumed.created).toBe(false);
    expect(resumed.session.root).toBe(first.session.root);
    await expect(access(path.join(first.session.root, "campaign", "pause.json"))).rejects.toThrow();

    // Simulate second exit 60h later (well past 48h from tPause1).
    const m2 = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    m2.pid = 99_999_998;
    await writeFile(manifestPath, JSON.stringify(m2, null, 2), "utf8");

    const tPause2 = new Date("2026-04-03T13:00:00.000Z");
    const afterSecondExit = await reapSessions({ tempRoot, ttlHours: 4, now: tPause2 });
    expect(afterSecondExit.candidates).toEqual([]);
    await expect(access(first.session.root)).resolves.toBeUndefined();

    // Tampered future pause.json fails closed (falls back to default TTL from createdAt).
    await writeFile(
      path.join(first.session.root, "campaign", "pause.json"),
      JSON.stringify({
        pausedAt: "2099-01-01T00:00:00.000Z",
        pid: 99_999_998,
        recordSha256: "0".repeat(64),
      }),
      "utf8",
    );
    const futureNow = new Date(Date.now() + 5 * 3_600_000);
    const afterTamper = await reapSessions({ tempRoot, ttlHours: 4, now: futureNow });
    expect(afterTamper.candidates.map((c) => c.root)).toEqual([first.session.root]);
  });

  it("has no compiled pause default (sessionRetention: 0 reaps immediately) and ignores unapproved/terminal/forged-status roots", async () => {
    const tempRoot = await makeTempRoot();
    const createdAt = "2026-04-01T10:00:00.000Z";

    // 1. Decided sessionRetention: 0 -> reaps immediately even at +1h (< 4h default TTL)
    const zeroRetention = await createDeadRoot(tempRoot, "zero-retention", createdAt);
    await seedPausedCampaign(zeroRetention, 0);

    // 2. Unapproved proposal (DECISIONS, approved: false) with sessionRetention: 72 -> falls back to 4h TTL
    const unapproved = await createDeadRoot(tempRoot, "unapproved-72h", createdAt);
    const unapprovedStore = await CampaignStore.load(unapproved);
    await unapprovedStore.append({ channel: "agent", op: "open" });
    await unapprovedStore.append({ channel: "agent", op: "recon", recon: reconPayload });
    await unapprovedStore.append({
      channel: "agent",
      op: "propose",
      charter: makeCharter(72),
    });

    // 3. Completed terminal campaign with sessionRetention: 72 -> falls back to 4h TTL
    const completed = await createDeadRoot(tempRoot, "completed-72h", createdAt);
    await seedPausedCampaign(completed, 72);
    const completedStore = await CampaignStore.load(completed);
    const engCap = createCampaignEngineAdapter();
    await completedStore.append(
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "complete",
        clause: "termination",
      }),
    );

    // 4. Forged status.json without valid trace.jsonl -> falls back to 4h TTL
    const forgedStatus = await createDeadRoot(tempRoot, "forged-status", createdAt);
    await mkdir(path.join(forgedStatus, "campaign"));
    await writeFile(
      path.join(forgedStatus, "campaign", "status.json"),
      JSON.stringify({
        schema: CAMPAIGN_SCHEMA_IDS.status,
        state: CampaignStates.executing,
        effective: "med",
      }),
      "utf8",
    );

    // At +1h: only zeroRetention is reaped; the other three are < 4h default TTL.
    const at1h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T11:00:00.000Z"),
    });
    expect(at1h.candidates.map((c) => c.root)).toEqual([zeroRetention]);

    // At +5h: unapproved, completed, and forgedStatus all reap at the 4h default TTL.
    const at5h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-01T15:00:00.000Z"),
    });
    expect(at5h.candidates.map((c) => c.root).sort()).toEqual(
      [completed, forgedStatus, unapproved].sort(),
    );
  });
});

describe("reattach campaign fold/verification and status refresh", () => {
  const emptyRegistryDocs: GaiaRegistryDocuments = {
    generic: { generatedAt: "2026-07-16T00:00:00Z", skills: [] },
    named: { generatedAt: "2026-07-16", buckets: {} },
  };

  async function markDeadPid(sessionRoot: string): Promise<void> {
    const manifestPath = path.join(sessionRoot, "session.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.pid = 99_999_999;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  it("folds and refreshes status.json to FAILED_SAFE or verified projection on scan and explicit env-root reattach", async () => {
    const tempRoot = await makeTempRoot();

    // 1. Scan path with tampered trace.jsonl -> status.json refreshed to FAILED_SAFE before returning
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-scan-tampered";
    const s1 = await resolveSession({ tempRoot });
    await seedPausedCampaign(s1.session.root, 24);
    const tracePath1 = path.join(s1.session.root, "campaign", "trace.jsonl");
    const statusPath1 = path.join(s1.session.root, "campaign", "status.json");
    await writeFile(tracePath1, `${await readFile(tracePath1, "utf8")}corrupt-line\n`, "utf8");
    await markDeadPid(s1.session.root);

    const resumedScanTampered = await resolveSession({ tempRoot });
    expect(resumedScanTampered.created).toBe(false);
    expect(resumedScanTampered.session.root).toBe(s1.session.root);
    const refreshedStatus1 = JSON.parse(await readFile(statusPath1, "utf8")) as Record<string, unknown>;
    expect(refreshedStatus1).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });

    // 2. Explicit SKILL_SUMMON_SESSION env-root with stale status.json -> refreshed to EXECUTING
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-env-stale";
    const s2 = await resolveSession({ tempRoot });
    await seedPausedCampaign(s2.session.root, 24);
    const statusPath2 = path.join(s2.session.root, "campaign", "status.json");
    await writeFile(
      statusPath2,
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.unarmed }),
      "utf8",
    );
    await markDeadPid(s2.session.root);

    process.env.SKILL_SUMMON_SESSION = s2.session.root;
    const resumedEnvStale = await resolveSession({ tempRoot });
    expect(resumedEnvStale.created).toBe(false);
    expect(resumedEnvStale.session.root).toBe(s2.session.root);
    const refreshedStatus2 = JSON.parse(await readFile(statusPath2, "utf8")) as Record<string, unknown>;
    expect(refreshedStatus2).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.executing,
    });

    // 3. Explicit SKILL_SUMMON_SESSION env-root with tampered trace -> refreshed to FAILED_SAFE
    await writeFile(
      path.join(s2.session.root, "campaign", "trace.jsonl"),
      `${await readFile(path.join(s2.session.root, "campaign", "trace.jsonl"), "utf8")}bad\n`,
      "utf8",
    );
    await markDeadPid(s2.session.root);
    const resumedEnvTampered = await resolveSession({ tempRoot });
    expect(resumedEnvTampered.created).toBe(false);
    expect(resumedEnvTampered.session.root).toBe(s2.session.root);
    const refreshedStatus3 = JSON.parse(await readFile(statusPath2, "utf8")) as Record<string, unknown>;
    expect(refreshedStatus3).toMatchObject({
      schema: CAMPAIGN_SCHEMA_IDS.status,
      state: CampaignStates.failedSafe,
    });
  });

  it("folds and refreshes campaign status through the actual MCP resolveSession path", async () => {
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-mcp-reattach";

    const seeded = await resolveSession();
    cleanupRoots.push(seeded.session.root);
    await seedPausedCampaign(seeded.session.root, 24);
    const tracePath = path.join(seeded.session.root, "campaign", "trace.jsonl");
    const statusPath = path.join(seeded.session.root, "campaign", "status.json");
    await writeFile(tracePath, `${await readFile(tracePath, "utf8")}tampered\n`, "utf8");
    await markDeadPid(seeded.session.root);

    // Point MCP's resolveSession() at our seeded session root via SKILL_SUMMON_SESSION.
    process.env.SKILL_SUMMON_SESSION = seeded.session.root;

    const service = new GaiaService(new InMemoryGaiaRegistrySource(emptyRegistryDocs), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "reattach-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      await client.callTool({ name: "summon", arguments: { query: "nonexistent" } });
      const statusAfterMcp = JSON.parse(await readFile(statusPath, "utf8")) as Record<string, unknown>;
      expect(statusAfterMcp).toMatchObject({
        schema: CAMPAIGN_SCHEMA_IDS.status,
        state: CampaignStates.failedSafe,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
