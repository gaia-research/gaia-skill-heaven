import {
  access,
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findSession,
  listSessions,
  reapSessions,
  SummonSession,
} from "../src/summon/session.js";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("summon session garbage collection", () => {
  it("reaps expired abandoned roots but protects live and young sessions", async () => {
    const parent = await temporaryParent();
    const now = new Date("2026-04-01T12:00:00.000Z");
    const old = "2026-04-01T05:00:00.000Z";
    const young = "2026-04-01T11:30:00.000Z";
    const abandoned = await sessionRoot(parent, "abandoned", old, 99_999_999);
    const live = await sessionRoot(parent, "live", old, process.pid);
    const recent = await sessionRoot(parent, "recent", young, 99_999_999);

    const outcome = await reapSessions({ tempRoot: parent, ttlHours: 4, now });

    expect(outcome.candidates.map((item) => item.root)).toEqual([abandoned]);
    expect(outcome.liveProtected).toEqual([live]);
    await expect(access(abandoned)).rejects.toThrow();
    await expect(access(live)).resolves.toBeUndefined();
    await expect(access(recent)).resolves.toBeUndefined();
  });

  it("reports dry-run candidates without deleting them", async () => {
    const parent = await temporaryParent();
    const root = path.join(parent, "skill-summon-session-malformed");
    await mkdir(root);
    await writeFile(path.join(root, "session.json"), "not json");
    await utimes(root, new Date(0), new Date(0));

    const outcome = await reapSessions({
      dryRun: true,
      tempRoot: parent,
      ttlHours: 1,
      now: new Date("2026-04-01T12:00:00.000Z"),
    });

    expect(outcome.candidates).toHaveLength(1);
    await expect(access(root)).resolves.toBeUndefined();
  });

  it("lists warm roots and resolves them by id, name, or full root", async () => {
    const parent = await temporaryParent();
    const root = await sessionRoot(
      parent,
      "reattach",
      "2026-04-01T11:30:00.000Z",
      99_999_999,
    );

    const sessions = await listSessions({ tempRoot: parent });

    expect(sessions).toEqual([
      {
        id: "reattach",
        name: "skill-summon-session-reattach",
        root,
        createdAt: "2026-04-01T11:30:00.000Z",
        skillCount: 0,
        skills: [],
      },
    ]);
    await expect(
      findSession("reattach", { tempRoot: parent }),
    ).resolves.toMatchObject({
      root,
    });
    await expect(
      findSession("skill-summon-session-reattach", { tempRoot: parent }),
    ).resolves.toMatchObject({ root });
    await expect(
      findSession(root, { tempRoot: parent }),
    ).resolves.toMatchObject({
      id: "reattach",
    });
  });

  it("refuses roots that were not discovered under the session temp directory", async () => {
    const parent = await temporaryParent();
    await expect(
      findSession("/tmp/not-a-listed-skill-session", { tempRoot: parent }),
    ).rejects.toThrow(/not found/u);
  });

  it("close removes the complete owned root", async () => {
    const parent = await temporaryParent();
    const root = path.join(parent, "skill-summon-session-close");
    await mkdir(root);
    const session = await SummonSession.createAt(root, "close-test");
    await session.ensureRoots();
    await writeFile(path.join(session.cacheRoot, "scaffolding"), "clone");
    await writeFile(path.join(session.skillsRoot, "payload"), "skill");

    await session.close();

    await expect(access(root)).rejects.toThrow();
  });
});

async function temporaryParent(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-gc-test-"));
  cleanupRoots.push(root);
  return root;
}

async function sessionRoot(
  parent: string,
  name: string,
  createdAt: string,
  pid: number,
): Promise<string> {
  const root = path.join(parent, `skill-summon-session-${name}`);
  await mkdir(root);
  await writeFile(
    path.join(root, "session.json"),
    JSON.stringify({ id: name, createdAt, pid, skills: [] }),
  );
  return root;
}
