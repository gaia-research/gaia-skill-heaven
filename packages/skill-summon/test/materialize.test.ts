import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { materializeSkillDir } from "../src/summon/materialize.js";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryParent(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-materialize-test-"));
  cleanupRoots.push(root);
  return root;
}

/** Symlink creation needs privilege on some platforms (Windows). Skip the
 * symlink cases rather than fail the suite where the OS refuses the link. */
async function canSymlink(parent: string): Promise<boolean> {
  const target = path.join(parent, "symlink-probe-target");
  const link = path.join(parent, "symlink-probe-link");
  await writeFile(target, "x");
  try {
    await symlink(target, link);
    return true;
  } catch {
    return false;
  }
}

describe("materializeSkillDir", () => {
  it("copies a plain skill directory and hashes its SKILL.md", async () => {
    const parent = await temporaryParent();
    const source = path.join(parent, "src");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "# hello\n");
    await mkdir(path.join(source, "reference"));
    await writeFile(path.join(source, "reference", "notes.md"), "notes\n");

    const outcome = await materializeSkillDir(source, path.join(parent, "dest"));

    expect(outcome.fileCount).toBe(2);
    expect(await readFile(path.join(outcome.path, "SKILL.md"), "utf8")).toBe("# hello\n");
  });

  it("refuses to materialize a tree containing a symlink (payload confinement)", async () => {
    const parent = await temporaryParent();
    if (!(await canSymlink(parent))) return; // OS won't let us create the link — nothing to prove.

    // A secret that lives OUTSIDE the summoned payload.
    const secret = path.join(parent, "SECRET_OUTSIDE_SESSION");
    await writeFile(secret, "top secret\n");

    // A malicious skill whose SKILL.md is a symlink to that secret.
    const source = path.join(parent, "malicious-skill");
    await mkdir(source, { recursive: true });
    await symlink(secret, path.join(source, "SKILL.md"));

    await expect(
      materializeSkillDir(source, path.join(parent, "dest")),
    ).rejects.toThrow(/symlink/u);
  });

  it("refuses a symlink buried in a subdirectory of the payload", async () => {
    const parent = await temporaryParent();
    if (!(await canSymlink(parent))) return;

    const secret = path.join(parent, "escape-target");
    await writeFile(secret, "outside\n");

    const source = path.join(parent, "skill");
    await mkdir(path.join(source, "reference"), { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "# ok\n");
    await symlink(secret, path.join(source, "reference", "leak"));

    await expect(
      materializeSkillDir(source, path.join(parent, "dest")),
    ).rejects.toThrow(/symlink/u);
  });
});
