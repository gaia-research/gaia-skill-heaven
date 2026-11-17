import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

beforeEach(() => {
  delete process.env.CLAUDE_CODE_SESSION_ID;
  delete process.env.SKILL_SUMMON_SESSION;
});

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

  it("refuses forged outside-directory SKILL_SUMMON_SESSION and ignores symlinked roots on lookup", async () => {
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

    // Even when an indexed root is replaced by a symlink to outside, lookup refuses it
    // and leaves the outside directory untouched.
    const indexed = await resolveSession({ tempRoot, harnessSessionId: "sess-indexed-symlink" });
    await rm(indexed.session.root, { recursive: true, force: true });
    await writeFile(
      path.join(outside, "session.json"),
      JSON.stringify({
        id: "forged-indexed",
        harnessSessionId: "sess-indexed-symlink",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: 99_999_999,
        skills: [],
      }),
      "utf8",
    );
    await symlink(outside, indexed.session.root, "dir");

    const afterSymlink = await resolveSession({
      tempRoot,
      harnessSessionId: "sess-indexed-symlink",
    });
    expect(afterSymlink.created).toBe(true);
    expect(afterSymlink.session.root).not.toBe(indexed.session.root);
    expect(afterSymlink.session.root).not.toBe(outside);
    await expect(access(path.join(outside, "cache"))).rejects.toThrow();
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
      ["missing-pid", { id: "m1", createdAt: "2026-04-01T00:00:00.000Z", skills: [] }],
      ["string-pid", { id: "m2", createdAt: "2026-04-01T00:00:00.000Z", pid: "99999999", skills: [] }],
      ["zero-pid", { id: "m3", createdAt: "2026-04-01T00:00:00.000Z", pid: 0, skills: [] }],
      ["negative-pid", { id: "m4", createdAt: "2026-04-01T00:00:00.000Z", pid: -5, skills: [] }],
      ["missing-skills", { id: "m5", createdAt: "2026-04-01T00:00:00.000Z", pid: 99_999_999 }],
    ] as const) {
      const harnessId = `sess-bad-pid-${label}`;
      delete process.env.SKILL_SUMMON_SESSION;
      const seeded = await resolveSession({ tempRoot, harnessSessionId: harnessId });
      const badRoot = seeded.session.root;
      await writeFile(
        path.join(badRoot, "session.json"),
        JSON.stringify({ ...badManifest, harnessSessionId: harnessId }),
        "utf8",
      );

      // Indexed lookup path must not treat malformed/missing pid as proven dead.
      const lookedUp = await resolveSession({
        tempRoot,
        harnessSessionId: harnessId,
      });
      expect(lookedUp.created).toBe(true);
      expect(lookedUp.session.root).not.toBe(badRoot);

      // Explicit env-root path must reject malformed manifest shape.
      process.env.SKILL_SUMMON_SESSION = badRoot;
      await expect(
        resolveSession({ tempRoot, harnessSessionId: harnessId }),
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

    // Tampered future pause.json must NOT fall back to creation TTL; it safely
    // reestablishes one observation boundary, does not renew, and reaps after 48h.
    await writeFile(
      path.join(first.session.root, "campaign", "pause.json"),
      JSON.stringify({
        pausedAt: "2099-01-01T00:00:00.000Z",
        pid: 99_999_998,
        recordSha256: "0".repeat(64),
      }),
      "utf8",
    );
    const tTamperObs = new Date("2026-04-03T14:00:00.000Z");
    const afterTamper = await reapSessions({ tempRoot, ttlHours: 4, now: tTamperObs });
    expect(afterTamper.candidates).toEqual([]);
    await expect(access(first.session.root)).resolves.toBeUndefined();

    // Subsequent reap before 48h from tTamperObs does not renew and keeps the root.
    const beforeReestablishedEnd = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tTamperObs.getTime() + 47 * 3_600_000 + 59 * 60_000),
    });
    expect(beforeReestablishedEnd.candidates).toEqual([]);
    await expect(access(first.session.root)).resolves.toBeUndefined();

    // At 48h from tTamperObs, the reestablished window expires and it reaps.
    const atReestablishedEnd = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tTamperObs.getTime() + 48 * 3_600_000),
    });
    expect(atReestablishedEnd.candidates.map((c) => c.root)).toEqual([first.session.root]);
    await expect(access(first.session.root)).rejects.toThrow();
  });

  it("never falls back to creation TTL on malformed, future, or symlink pause boundaries and does not touch symlink targets", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";

    // 1. Old session (created 49h ago) with malformed pause.json
    const malformedRoot = await createDeadRoot(tempRoot, "old-malformed-pause", createdAt);
    await seedPausedCampaign(malformedRoot, 48);
    await writeFile(path.join(malformedRoot, "campaign", "pause.json"), "{not-valid-json", "utf8");

    // 2. Old session (created 49h ago) with future-dated pause.json
    const futureRoot = await createDeadRoot(tempRoot, "old-future-pause", createdAt);
    await seedPausedCampaign(futureRoot, 48);
    await writeFile(
      path.join(futureRoot, "campaign", "pause.json"),
      JSON.stringify({ pausedAt: "2099-01-01T00:00:00.000Z", pid: 99_999_999, recordSha256: "a".repeat(64) }),
      "utf8",
    );

    // 3. Old session (created 49h ago) with symlink pause.json pointing outside
    const symlinkRoot = await createDeadRoot(tempRoot, "old-symlink-pause", createdAt);
    await seedPausedCampaign(symlinkRoot, 48);
    const outsideTarget = path.join(outsideDir, "outside-pause.json");
    await writeFile(outsideTarget, "DO-NOT-TOUCH", "utf8");
    const targetBeforeStat = await lstat(outsideTarget);
    await symlink(outsideTarget, path.join(symlinkRoot, "campaign", "pause.json"));

    const tObs = new Date("2026-04-03T01:00:00.000Z"); // +49h from createdAt
    const firstReap = await reapSessions({ tempRoot, ttlHours: 4, now: tObs });
    expect(firstReap.candidates).toEqual([]);
    await expect(access(malformedRoot)).resolves.toBeUndefined();
    await expect(access(futureRoot)).resolves.toBeUndefined();
    await expect(access(symlinkRoot)).resolves.toBeUndefined();

    // Symlink target was not modified or overwritten
    expect(await readFile(outsideTarget, "utf8")).toBe("DO-NOT-TOUCH");
    expect((await lstat(outsideTarget)).mtimeMs).toBe(targetBeforeStat.mtimeMs);

    // Subsequent reap at +24h and +47h59m59s from tObs: no renewal, still kept
    const at24h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tObs.getTime() + 24 * 3_600_000),
    });
    expect(at24h.candidates).toEqual([]);

    const justBefore48h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tObs.getTime() + 48 * 3_600_000 - 1_000),
    });
    expect(justBefore48h.candidates).toEqual([]);
    await expect(access(malformedRoot)).resolves.toBeUndefined();
    await expect(access(futureRoot)).resolves.toBeUndefined();
    await expect(access(symlinkRoot)).resolves.toBeUndefined();

    // At +48h from tObs: malformed & future reap after their safely reestablished 48h window;
    // symlink boundary remains conservatively preserved and its target untouched.
    const at48h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date(tObs.getTime() + 48 * 3_600_000),
    });
    expect(at48h.candidates.map((c) => c.root).sort()).toEqual(
      [futureRoot, malformedRoot].sort(),
    );
    await expect(access(malformedRoot)).rejects.toThrow();
    await expect(access(futureRoot)).rejects.toThrow();
    await expect(access(symlinkRoot)).resolves.toBeUndefined();
    expect(await readFile(outsideTarget, "utf8")).toBe("DO-NOT-TOUCH");
  });

  it("reapSessions({ dryRun: true }) writes no campaign artifacts across missing/stale/corrupt status, malformed trace, and no-campaign roots", async () => {
    const tempRoot = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";

    type ArtifactSnapshot = Record<
      string,
      {
        kind: "file" | "symlink" | "dir";
        size: number;
        mtimeMs: number;
        content?: string;
        target?: string;
      }
    >;

    async function snapshotRootArtifacts(sessionRoot: string): Promise<ArtifactSnapshot> {
      const snap: ArtifactSnapshot = {};
      async function walk(dir: string, relBase: string): Promise<void> {
        const entries = (await readdir(dir)).sort();
        for (const entry of entries) {
          const full = path.join(dir, entry);
          const rel = relBase ? `${relBase}/${entry}` : entry;
          const st = await lstat(full);
          if (st.isSymbolicLink()) {
            snap[rel] = {
              kind: "symlink",
              size: st.size,
              mtimeMs: st.mtimeMs,
              target: await readlink(full),
            };
          } else if (st.isDirectory()) {
            snap[rel] = { kind: "dir", size: st.size, mtimeMs: st.mtimeMs };
            await walk(full, rel);
          } else {
            snap[rel] = {
              kind: "file",
              size: st.size,
              mtimeMs: st.mtimeMs,
              content: await readFile(full, "utf8"),
            };
          }
        }
      }
      await walk(sessionRoot, "");
      return snap;
    }

    // 1. Approved paused campaign with missing status.json (and no pause.json)
    const missingStatus = await createDeadRoot(tempRoot, "dry-missing-status", createdAt);
    await seedPausedCampaign(missingStatus, 48);
    await rm(path.join(missingStatus, "campaign", "status.json"));

    // 2. Approved paused campaign with stale status.json and malformed pause.json
    const staleStatus = await createDeadRoot(tempRoot, "dry-stale-status", createdAt);
    await seedPausedCampaign(staleStatus, 48);
    await writeFile(
      path.join(staleStatus, "campaign", "status.json"),
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.unarmed }),
      "utf8",
    );
    await writeFile(path.join(staleStatus, "campaign", "pause.json"), "{bad", "utf8");

    // 3. Approved paused campaign with corrupt status.json
    const corruptStatus = await createDeadRoot(tempRoot, "dry-corrupt-status", createdAt);
    await seedPausedCampaign(corruptStatus, 48);
    await writeFile(path.join(corruptStatus, "campaign", "status.json"), "{corrupt-json", "utf8");

    // 4. Malformed trace.jsonl with stale status.json (retains old reap behavior -> candidate)
    const malformedTrace = await createDeadRoot(tempRoot, "dry-malformed-trace", createdAt);
    await seedPausedCampaign(malformedTrace, 48);
    await writeFile(
      path.join(malformedTrace, "campaign", "trace.jsonl"),
      `${await readFile(path.join(malformedTrace, "campaign", "trace.jsonl"), "utf8")}corrupt-line\n`,
      "utf8",
    );
    await writeFile(
      path.join(malformedTrace, "campaign", "status.json"),
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.executing }),
      "utf8",
    );

    // 5. Genuinely no campaign (retains old reap behavior -> candidate)
    const noCampaign = await createDeadRoot(tempRoot, "dry-no-campaign", createdAt);

    const allRoots = [missingStatus, staleStatus, corruptStatus, malformedTrace, noCampaign];
    const beforeSnapshots = await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)));

    const dryOutcome = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-02T00:00:00.000Z"), // +24h from createdAt
      dryRun: true,
    });

    expect(dryOutcome.dryRun).toBe(true);
    expect(dryOutcome.candidates.map((c) => c.root).sort()).toEqual(
      [malformedTrace, noCampaign].sort(),
    );

    const afterSnapshots = await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)));
    expect(afterSnapshots).toEqual(beforeSnapshots);
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

  it("decouples retention from derived status I/O across real and dry-run reaps (directory/unreadable/symlink/malformed/missing status) with exact window expiry", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";
    const tObs = new Date("2026-04-01T10:00:00.000Z"); // +10h (> 4h default TTL)

    type ArtifactSnapshot = Record<
      string,
      {
        kind: "file" | "symlink" | "dir";
        size: number;
        mtimeMs: number;
        content?: string;
        target?: string;
      }
    >;

    async function snapshotRootArtifacts(sessionRoot: string): Promise<ArtifactSnapshot> {
      const snap: ArtifactSnapshot = {};
      async function walk(dir: string, relBase: string): Promise<void> {
        const entries = (await readdir(dir)).sort();
        for (const entry of entries) {
          const full = path.join(dir, entry);
          const rel = relBase ? `${relBase}/${entry}` : entry;
          const st = await lstat(full);
          if (st.isSymbolicLink()) {
            snap[rel] = {
              kind: "symlink",
              size: st.size,
              mtimeMs: st.mtimeMs,
              target: await readlink(full),
            };
          } else if (st.isDirectory()) {
            snap[rel] = { kind: "dir", size: st.size, mtimeMs: st.mtimeMs };
            await walk(full, rel);
          } else {
            let content: string | undefined;
            try {
              content = await readFile(full, "utf8");
            } catch {
              content = "<unreadable>";
            }
            snap[rel] = {
              kind: "file",
              size: st.size,
              mtimeMs: st.mtimeMs,
              content,
            };
          }
        }
      }
      await walk(sessionRoot, "");
      return snap;
    }

    // 1. status.json replaced by a directory
    const dirStatus = await createDeadRoot(tempRoot, "status-dir", createdAt);
    await seedPausedCampaign(dirStatus, 48);
    await rm(path.join(dirStatus, "campaign", "status.json"));
    await mkdir(path.join(dirStatus, "campaign", "status.json"));

    // 2. status.json unreadable (0o000)
    const unreadableStatus = await createDeadRoot(tempRoot, "status-unreadable", createdAt);
    await seedPausedCampaign(unreadableStatus, 48);
    const unreadablePath = path.join(unreadableStatus, "campaign", "status.json");
    if (process.getuid?.() !== 0) {
      await chmod(unreadablePath, 0o000);
    }

    // 3. status.json replaced by a symlink pointing outside sessionRoot
    const symlinkStatus = await createDeadRoot(tempRoot, "status-symlink", createdAt);
    await seedPausedCampaign(symlinkStatus, 48);
    const outsideTarget = path.join(outsideDir, "outside-status.json");
    await writeFile(outsideTarget, "DO-NOT-OVERWRITE", "utf8");
    const outsideBefore = await lstat(outsideTarget);
    await rm(path.join(symlinkStatus, "campaign", "status.json"));
    await symlink(outsideTarget, path.join(symlinkStatus, "campaign", "status.json"), "file");

    // 4. status.json malformed JSON
    const malformedStatus = await createDeadRoot(tempRoot, "status-malformed", createdAt);
    await seedPausedCampaign(malformedStatus, 48);
    await writeFile(path.join(malformedStatus, "campaign", "status.json"), "{corrupt-status", "utf8");

    // 5. status.json missing
    const missingStatus = await createDeadRoot(tempRoot, "status-missing", createdAt);
    await seedPausedCampaign(missingStatus, 48);
    await rm(path.join(missingStatus, "campaign", "status.json"));

    const allRoots = [
      dirStatus,
      unreadableStatus,
      symlinkStatus,
      malformedStatus,
      missingStatus,
    ];

    try {
      // Dry-run at tObs: zero writes anywhere, all preserved.
      const beforeDry = await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)));
      const dryObs = await reapSessions({
        tempRoot,
        ttlHours: 4,
        now: tObs,
        dryRun: true,
      });
      expect(dryObs.candidates).toEqual([]);
      const afterDry = await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)));
      expect(afterDry).toEqual(beforeDry);

      // Real reap at tObs: same decision (all preserved), establishes pause.json at tObs,
      // and performs NO status.json refresh or outside symlink write.
      const realObs = await reapSessions({
        tempRoot,
        ttlHours: 4,
        now: tObs,
        dryRun: false,
      });
      expect(realObs.candidates).toEqual([]);
      for (const root of allRoots) {
        await expect(access(root)).resolves.toBeUndefined();
        const pauseRaw = JSON.parse(
          await readFile(path.join(root, "campaign", "pause.json"), "utf8"),
        ) as Record<string, unknown>;
        expect(pauseRaw.pausedAt).toBe(tObs.toISOString());
      }
      expect((await lstat(path.join(dirStatus, "campaign", "status.json"))).isDirectory()).toBe(true);
      expect(await readFile(path.join(malformedStatus, "campaign", "status.json"), "utf8")).toBe("{corrupt-status");
      await expect(lstat(path.join(missingStatus, "campaign", "status.json"))).rejects.toThrow();
      expect(await readFile(outsideTarget, "utf8")).toBe("DO-NOT-OVERWRITE");
      expect((await lstat(outsideTarget)).mtimeMs).toBe(outsideBefore.mtimeMs);

      // 1ms before 48h from first-observation boundary: both dry-run and real reap preserve.
      const justBefore = new Date(tObs.getTime() + 48 * 3_600_000 - 1);
      expect((await reapSessions({ tempRoot, ttlHours: 4, now: justBefore, dryRun: true })).candidates).toEqual([]);
      expect((await reapSessions({ tempRoot, ttlHours: 4, now: justBefore, dryRun: false })).candidates).toEqual([]);

      // At exact 48h from first-observation boundary: dry-run and real reap decide identical candidates;
      // dry-run writes nothing, real reap removes all 5 roots and leaves outside symlink target untouched.
      const atExactExpiry = new Date(tObs.getTime() + 48 * 3_600_000);
      const beforeExpiryDry = await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)));
      const dryExpiry = await reapSessions({
        tempRoot,
        ttlHours: 4,
        now: atExactExpiry,
        dryRun: true,
      });
      expect(dryExpiry.candidates.map((c) => c.root).sort()).toEqual([...allRoots].sort());
      expect(await Promise.all(allRoots.map((r) => snapshotRootArtifacts(r)))).toEqual(beforeExpiryDry);

      const realExpiry = await reapSessions({
        tempRoot,
        ttlHours: 4,
        now: atExactExpiry,
        dryRun: false,
      });
      expect(realExpiry.candidates.map((c) => c.root).sort()).toEqual([...allRoots].sort());
      for (const root of allRoots) {
        await expect(access(root)).rejects.toThrow();
      }
      expect(await readFile(outsideTarget, "utf8")).toBe("DO-NOT-OVERWRITE");
      expect((await lstat(outsideTarget)).mtimeMs).toBe(outsideBefore.mtimeMs);
    } finally {
      if (process.getuid?.() !== 0) {
        await chmod(unreadablePath, 0o600).catch(() => {});
      }
    }
  });

  it("conservatively preserves uncertain verification/projection I/O errors instead of collapsing to creation TTL, while keeping legacy reap for absent/unapproved/terminal/known-invalid traces", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();
    const createdAt = "2026-04-01T00:00:00.000Z";
    const now = new Date("2026-04-01T10:00:00.000Z"); // +10h (> 4h default TTL)

    // Uncertain cases (must be conservatively preserved in both dryRun and real reap):
    // 1. Symlinked campaign/ directory pointing outside
    const symCampaignRoot = await createDeadRoot(tempRoot, "uncertain-sym-campaign", createdAt);
    const outsideCampaignTarget = path.join(outsideDir, "outside-campaign");
    await mkdir(outsideCampaignTarget);
    await writeFile(path.join(outsideCampaignTarget, "marker.txt"), "KEEP", "utf8");
    await symlink(outsideCampaignTarget, path.join(symCampaignRoot, "campaign"), "dir");

    // 2. Symlinked trace.jsonl pointing outside
    const symTraceRoot = await createDeadRoot(tempRoot, "uncertain-sym-trace", createdAt);
    await seedPausedCampaign(symTraceRoot, 48);
    const outsideTraceTarget = path.join(outsideDir, "outside-trace.jsonl");
    await writeFile(outsideTraceTarget, "KEEP-TRACE", "utf8");
    await rm(path.join(symTraceRoot, "campaign", "trace.jsonl"));
    await symlink(outsideTraceTarget, path.join(symTraceRoot, "campaign", "trace.jsonl"), "file");

    // 3. Unreadable trace.jsonl (0o000)
    const unreadableTraceRoot = await createDeadRoot(tempRoot, "uncertain-unreadable-trace", createdAt);
    await seedPausedCampaign(unreadableTraceRoot, 48);
    const unreadableTracePath = path.join(unreadableTraceRoot, "campaign", "trace.jsonl");

    // 4. Unreadable evidence.jsonl (0o000)
    const unreadableEvidenceRoot = await createDeadRoot(tempRoot, "uncertain-unreadable-evidence", createdAt);
    await seedPausedCampaign(unreadableEvidenceRoot, 48);
    const unreadableEvidencePath = path.join(unreadableEvidenceRoot, "campaign", "evidence.jsonl");

    // 5. Unreadable pause.json (0o000)
    const unreadablePauseRoot = await createDeadRoot(tempRoot, "uncertain-unreadable-pause", createdAt);
    await seedPausedCampaign(unreadablePauseRoot, 48);
    const unreadablePausePath = path.join(unreadablePauseRoot, "campaign", "pause.json");
    await writeFile(unreadablePausePath, "{}", "utf8");

    if (process.getuid?.() !== 0) {
      await chmod(unreadableTracePath, 0o000);
      await chmod(unreadableEvidencePath, 0o000);
      await chmod(unreadablePausePath, 0o000);
    }

    // Legacy cases (must still reap by 4h creation TTL):
    const absentRoot = await createDeadRoot(tempRoot, "legacy-absent", createdAt);
    const unapprovedRoot = await createDeadRoot(tempRoot, "legacy-unapproved", createdAt);
    const unapprovedStore = await CampaignStore.load(unapprovedRoot);
    await unapprovedStore.append({ channel: "agent", op: "open" });
    await unapprovedStore.append({ channel: "agent", op: "recon", recon: reconPayload });
    await unapprovedStore.append({ channel: "agent", op: "propose", charter: makeCharter(72) });

    const terminalRoot = await createDeadRoot(tempRoot, "legacy-terminal", createdAt);
    await seedPausedCampaign(terminalRoot, 72);
    const terminalStore = await CampaignStore.load(terminalRoot);
    const engCap = createCampaignEngineAdapter();
    await terminalStore.append(
      createCampaignEngineEvent(engCap, {
        channel: "engine",
        op: "complete",
        clause: "termination",
      }),
    );

    const invalidTraceRoot = await createDeadRoot(tempRoot, "legacy-invalid-trace", createdAt);
    await seedPausedCampaign(invalidTraceRoot, 72);
    await writeFile(
      path.join(invalidTraceRoot, "campaign", "trace.jsonl"),
      `${await readFile(path.join(invalidTraceRoot, "campaign", "trace.jsonl"), "utf8")}not-json\n`,
      "utf8",
    );

    const expectedLegacyReaped = [
      absentRoot,
      unapprovedRoot,
      terminalRoot,
      invalidTraceRoot,
    ].sort();

    const uncertainRoots = [
      symCampaignRoot,
      symTraceRoot,
      ...(process.getuid?.() !== 0
        ? [unreadableTraceRoot, unreadableEvidenceRoot, unreadablePauseRoot]
        : []),
    ];

    try {
      const dry = await reapSessions({ tempRoot, ttlHours: 4, now, dryRun: true });
      expect(dry.candidates.map((c) => c.root).sort()).toEqual(expectedLegacyReaped);

      const real = await reapSessions({ tempRoot, ttlHours: 4, now, dryRun: false });
      expect(real.candidates.map((c) => c.root).sort()).toEqual(expectedLegacyReaped);

      for (const root of expectedLegacyReaped) {
        await expect(access(root)).rejects.toThrow();
      }
      for (const root of uncertainRoots) {
        await expect(access(root)).resolves.toBeUndefined();
      }
      expect(await readFile(path.join(outsideCampaignTarget, "marker.txt"), "utf8")).toBe("KEEP");
      expect(await readFile(outsideTraceTarget, "utf8")).toBe("KEEP-TRACE");
    } finally {
      if (process.getuid?.() !== 0) {
        await chmod(unreadableTracePath, 0o600).catch(() => {});
        await chmod(unreadableEvidencePath, 0o600).catch(() => {});
        await chmod(unreadablePausePath, 0o600).catch(() => {});
      }
    }
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

    // 4. Normal reattach still refuses unsafe status.json writes (symlink or directory)
    const outsideTarget = path.join(tempRoot, "outside-reattach.json");
    await writeFile(outsideTarget, "OUTSIDE-INTACT", "utf8");
    await rm(statusPath2);
    await symlink(outsideTarget, statusPath2, "file");
    await markDeadPid(s2.session.root);
    await expect(resolveSession({ tempRoot })).rejects.toThrow(/symlink/u);
    expect(await readFile(outsideTarget, "utf8")).toBe("OUTSIDE-INTACT");

    await rm(statusPath2);
    await mkdir(statusPath2);
    await expect(resolveSession({ tempRoot })).rejects.toThrow(/regular file/u);
  });

  it("folds and refreshes campaign status through the actual MCP resolveSession path", async () => {
    const isolatedTemp = await makeTempRoot();
    const savedTmpdir = process.env.TMPDIR;
    const savedTmp = process.env.TMP;
    const savedTemp = process.env.TEMP;
    process.env.TMPDIR = isolatedTemp;
    process.env.TMP = isolatedTemp;
    process.env.TEMP = isolatedTemp;

    try {
      delete process.env.SKILL_SUMMON_SESSION;
      process.env.CLAUDE_CODE_SESSION_ID = "sess-mcp-reattach";

      const seeded = await resolveSession();
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
    } finally {
      if (savedTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = savedTmpdir;
      if (savedTmp === undefined) delete process.env.TMP;
      else process.env.TMP = savedTmp;
      if (savedTemp === undefined) delete process.env.TEMP;
      else process.env.TEMP = savedTemp;
    }
  });

  it("preserves exact pause boundary and dead owner PID on failed status refresh (status directory) and reaps at original expiry", async () => {
    const tempRoot = await makeTempRoot();
    const tPause = new Date("2026-04-01T10:00:00.000Z");

    for (const mode of ["scan", "env"] as const) {
      delete process.env.SKILL_SUMMON_SESSION;
      process.env.CLAUDE_CODE_SESSION_ID = `sess-fail-status-${mode}`;

      const seeded = await resolveSession({ tempRoot });
      await seedPausedCampaign(seeded.session.root, 48);
      await markDeadPid(seeded.session.root);

      // Establish original pause boundary at tPause.
      const obsReap = await reapSessions({ tempRoot, ttlHours: 4, now: tPause });
      expect(obsReap.candidates).toEqual([]);

      const pausePath = path.join(seeded.session.root, "campaign", "pause.json");
      const statusPath = path.join(seeded.session.root, "campaign", "status.json");
      const manifestPath = path.join(seeded.session.root, "session.json");
      const originalPauseRaw = await readFile(pausePath, "utf8");
      const originalPause = JSON.parse(originalPauseRaw) as Record<string, unknown>;
      expect(originalPause.pausedAt).toBe(tPause.toISOString());
      expect(originalPause.pid).toBe(99_999_999);

      // Corrupt derived status.json into a directory so CampaignStore.load fails.
      await rm(statusPath);
      await mkdir(statusPath);

      if (mode === "env") {
        process.env.SKILL_SUMMON_SESSION = seeded.session.root;
      } else {
        delete process.env.SKILL_SUMMON_SESSION;
      }

      // Failed resume must throw (not expose the failed root), leave pause.json
      // byte-identical, and leave session.json PID as the dead owner.
      await expect(resolveSession({ tempRoot })).rejects.toThrow(/regular file/u);
      expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);
      const manifestAfterFail = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as Record<string, unknown>;
      expect(manifestAfterFail.pid).toBe(99_999_999);

      // Deterministic clock: 1ms before original 48h expiry is still kept;
      // at exact original 48h expiry it reaps (expiry was NOT renewed).
      const justBeforeOriginalExpiry = new Date(tPause.getTime() + 48 * 3_600_000 - 1);
      expect(
        (await reapSessions({ tempRoot, ttlHours: 4, now: justBeforeOriginalExpiry })).candidates,
      ).toEqual([]);
      await expect(access(seeded.session.root)).resolves.toBeUndefined();

      const atOriginalExpiry = new Date(tPause.getTime() + 48 * 3_600_000);
      const reaped = await reapSessions({ tempRoot, ttlHours: 4, now: atOriginalExpiry });
      expect(reaped.candidates.map((c) => c.root)).toEqual([seeded.session.root]);
      await expect(access(seeded.session.root)).rejects.toThrow();
    }
  });

  it("preserves exact pause boundary and dead owner PID on failed manifest write and reaps at original expiry", async () => {
    if (process.getuid?.() === 0) return;

    const tempRoot = await makeTempRoot();
    const tPause = new Date("2026-04-01T10:00:00.000Z");

    for (const mode of ["scan", "env"] as const) {
      delete process.env.SKILL_SUMMON_SESSION;
      process.env.CLAUDE_CODE_SESSION_ID = `sess-fail-manifest-${mode}`;

      const seeded = await resolveSession({ tempRoot });
      await seedPausedCampaign(seeded.session.root, 48);
      await markDeadPid(seeded.session.root);

      const obsReap = await reapSessions({ tempRoot, ttlHours: 4, now: tPause });
      expect(obsReap.candidates).toEqual([]);

      const pausePath = path.join(seeded.session.root, "campaign", "pause.json");
      const manifestPath = path.join(seeded.session.root, "session.json");
      const originalPauseRaw = await readFile(pausePath, "utf8");

      if (mode === "env") {
        process.env.SKILL_SUMMON_SESSION = seeded.session.root;
      } else {
        delete process.env.SKILL_SUMMON_SESSION;
      }

      // Make session root read-only (0500) so atomic manifest commit fails after CampaignStore.load.
      await chmod(seeded.session.root, 0o500);
      try {
        await expect(resolveSession({ tempRoot })).rejects.toThrow();
        expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);
        const manifestAfterFail = JSON.parse(
          await readFile(manifestPath, "utf8"),
        ) as Record<string, unknown>;
        expect(manifestAfterFail.pid).toBe(99_999_999);

        // Next reap must use original tPause + 48h expiry, not a renewed boundary.
        const justBeforeOriginalExpiry = new Date(tPause.getTime() + 48 * 3_600_000 - 1);
        expect(
          (await reapSessions({ tempRoot, ttlHours: 4, now: justBeforeOriginalExpiry })).candidates,
        ).toEqual([]);
        await expect(access(seeded.session.root)).resolves.toBeUndefined();

        await chmod(seeded.session.root, 0o700);
        const atOriginalExpiry = new Date(tPause.getTime() + 48 * 3_600_000);
        const reaped = await reapSessions({ tempRoot, ttlHours: 4, now: atOriginalExpiry });
        expect(reaped.candidates.map((c) => c.root)).toEqual([seeded.session.root]);
        await expect(access(seeded.session.root)).rejects.toThrow();
      } finally {
        await chmod(seeded.session.root, 0o700).catch(() => {});
      }
    }
  });

  it("confines pause boundary on reattach, preserves owner on pre-commit failure, and commits atomically with generation-bound invalidation even when post-commit pause cleanup fails", async () => {
    const tempRoot = await makeTempRoot();
    const outsideDir = await makeTempRoot();

    // 1. Symlinked pause.json fails pre-commit confinement without writing status.json,
    // claiming process.pid, or touching the outside symlink target.
    delete process.env.SKILL_SUMMON_SESSION;
    process.env.CLAUDE_CODE_SESSION_ID = "sess-pause-symlink";
    const symSeeded = await resolveSession({ tempRoot });
    await seedPausedCampaign(symSeeded.session.root, 48);
    await markDeadPid(symSeeded.session.root);

    const statusPath = path.join(symSeeded.session.root, "campaign", "status.json");
    await writeFile(
      statusPath,
      JSON.stringify({ schema: CAMPAIGN_SCHEMA_IDS.status, state: CampaignStates.unarmed }),
      "utf8",
    );
    const outsideTarget = path.join(outsideDir, "outside-pause.json");
    await writeFile(outsideTarget, "DO-NOT-DELETE", "utf8");
    const symPausePath = path.join(symSeeded.session.root, "campaign", "pause.json");
    await symlink(outsideTarget, symPausePath, "file");

    await expect(resolveSession({ tempRoot })).rejects.toThrow(/symlink/u);
    expect(await readFile(outsideTarget, "utf8")).toBe("DO-NOT-DELETE");
    const symManifest = JSON.parse(
      await readFile(path.join(symSeeded.session.root, "session.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(symManifest.pid).toBe(99_999_999);
    expect(
      (JSON.parse(await readFile(statusPath, "utf8")) as Record<string, unknown>).state,
    ).toBe(CampaignStates.unarmed);
    await rm(symSeeded.session.root, { recursive: true, force: true });

    // 2. Pre-commit status-refresh failure under read-only campaign/ (0500) preserves
    // old dead PID, ownerGeneration, and pause.json. Once status is synced, commit
    // succeeds atomically via session.json even if post-commit clearPauseBoundary fails
    // (0500 campaign/), and future GC never reuses the stale pause.json expiry.
    if (process.getuid?.() !== 0) {
      delete process.env.SKILL_SUMMON_SESSION;
      process.env.CLAUDE_CODE_SESSION_ID = "sess-pause-clear-fail";
      const seeded = await resolveSession({ tempRoot });
      await seedPausedCampaign(seeded.session.root, 48);
      await markDeadPid(seeded.session.root);

      const tPause = new Date("2026-04-01T10:00:00.000Z");
      expect((await reapSessions({ tempRoot, ttlHours: 4, now: tPause })).candidates).toEqual([]);

      const campaignDir = path.join(seeded.session.root, "campaign");
      const pausePath = path.join(campaignDir, "pause.json");
      const manifestPath = path.join(seeded.session.root, "session.json");
      const seededStatusPath = path.join(campaignDir, "status.json");
      const originalPauseRaw = await readFile(pausePath, "utf8");
      const preResumeManifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as Record<string, unknown>;

      // 2a. Missing status.json + 0500 campaign/ fails pre-commit (CampaignStore.load)
      // and leaves owner PID, ownerGeneration, and pause.json unchanged.
      await rm(seededStatusPath);
      await chmod(campaignDir, 0o500);
      try {
        await expect(resolveSession({ tempRoot })).rejects.toThrow();
        expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);
        const unchangedManifest = JSON.parse(
          await readFile(manifestPath, "utf8"),
        ) as Record<string, unknown>;
        expect(unchangedManifest.pid).toBe(99_999_999);
        expect(unchangedManifest.ownerGeneration).toBe(preResumeManifest.ownerGeneration);
      } finally {
        await chmod(campaignDir, 0o700);
      }

      // 2b. Synced status.json + 0500 campaign/ (clearPauseBoundary fails post-commit):
      // single atomic owner commit succeeds with new PID & fresh ownerGeneration without
      // rollback dependency, and old pause.json cannot be reused by later GC.
      await CampaignStore.load(seeded.session.root);
      await chmod(campaignDir, 0o500);
      let resumed;
      try {
        resumed = await resolveSession({ tempRoot });
        expect(resumed.created).toBe(false);
        expect(resumed.session.root).toBe(seeded.session.root);
        expect(resumed.session.pid).toBe(process.pid);
        expect(resumed.session.ownerGeneration).toBeDefined();
        expect(resumed.session.ownerGeneration).not.toBe(
          preResumeManifest.ownerGeneration,
        );
        // Old pause.json still on disk because campaign/ was 0500 during cleanup.
        expect(await readFile(pausePath, "utf8")).toBe(originalPauseRaw);
      } finally {
        await chmod(campaignDir, 0o700);
      }

      // Once writable and new owner dies, even 100h past tPause, real GC must NOT
      // reuse the old pause.json expiry; it re-anchors a fresh 48h window from tNewObs.
      await markDeadPid(seeded.session.root);
      const tNewObs = new Date(tPause.getTime() + 100 * 3_600_000);
      expect(
        (await reapSessions({ tempRoot, ttlHours: 4, now: tNewObs })).candidates,
      ).toEqual([]);
      await expect(access(seeded.session.root)).resolves.toBeUndefined();
      expect(
        (
          await reapSessions({
            tempRoot,
            ttlHours: 4,
            now: new Date(tNewObs.getTime() + 48 * 3_600_000 - 1),
          })
        ).candidates,
      ).toEqual([]);
      const atNewExpiry = await reapSessions({
        tempRoot,
        ttlHours: 4,
        now: new Date(tNewObs.getTime() + 48 * 3_600_000),
      });
      expect(atNewExpiry.candidates.map((c) => c.root)).toEqual([
        seeded.session.root,
      ]);
      await expect(access(seeded.session.root)).rejects.toThrow();
    }
  });
});
