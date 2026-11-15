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

    // At +47h59m: still kept.
    const at47h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-02T23:59:00.000Z"),
    });
    expect(at47h.candidates).toEqual([]);
    await expect(access(pausedRoot)).resolves.toBeUndefined();

    // At +48h01m: past decided window, reaped as usual.
    const at48h = await reapSessions({
      tempRoot,
      ttlHours: 4,
      now: new Date("2026-04-03T00:01:00.000Z"),
    });
    expect(at48h.candidates.map((c) => c.root)).toEqual([pausedRoot]);
    await expect(access(pausedRoot)).rejects.toThrow();
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
