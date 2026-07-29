// Issue #11 (P1) — Verify zero shared-state mutation (P3), claude-heaven door.
//
// KC5 (verbatim): "No shared config or skill directory is mutated (P3),
// verified by before/after diff."
//
// This complements packages/core/test/no-shared-mutation.test.ts, which
// covers compile()/materialize() across every posture x harness x mechanism.
// This file covers the claude-heaven DOOR specifically: `planNativeLaunch`
// (src/launcher.ts) and the census reads it depends on (src/census.ts). Per
// cli.ts (do-not-touch — LAUNCHABLE_POSTURES lives there and is being edited
// by another agent right now), slice 1 is native-only; this is the only
// posture reachable through this door today, so it is the only one exercised
// here. The real-launch write sequence (manifest + settings into a fresh
// session dir, `--settings <file>` passed to claude, nothing else) is
// reproduced from cli.ts's `run()` without importing or editing that file.
//
// Fixtures only — never the founder's real ~/.claude.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { censusStandingDose, nativeSkillRoots } from "../src/census.js";
import { planNativeLaunch } from "../src/launcher.js";

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** path (relative to root) -> content hash, recursive. Throwaway fixture trees
 * only — never point this at a real home directory. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        out[relative(root, full)] = sha(readFileSync(full, "utf-8"));
      }
    }
  };
  walk(root);
  return out;
}

function writeSkill(dir: string, name: string, description: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\nbody\n`);
}

describe("KC5 (claude-heaven door): before/after fixture diff for the native launch plan", () => {
  let fixtureRoot: string;
  let home: string;
  let project: string;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "kc5-door-fixture-"));
    home = join(fixtureRoot, "home");
    project = join(fixtureRoot, "project");
    writeSkill(join(home, ".claude", "skills", "home-skill"), "home-skill", "lives in the fixture home");
    writeSkill(join(project, ".claude", "skills", "project-skill"), "project-skill", "lives in the fixture project");
    // Other shared roots KC5 names, present but irrelevant to this door —
    // included so the diff also proves the claude-heaven door doesn't reach
    // into them either.
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "auth.json"), '{"auth":"fixture"}\n');
    mkdirSync(join(home, ".pi"), { recursive: true });
    mkdirSync(join(home, ".grok"), { recursive: true });
    mkdirSync(join(home, ".cursor"), { recursive: true });
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("census reads are reads: nativeSkillRoots + censusStandingDose never mutate home/project", () => {
    const before = { home: snapshotTree(home), project: snapshotTree(project) };
    const roots = nativeSkillRoots({ home, projectDir: project });
    expect(roots).toEqual([join(home, ".claude", "skills"), join(project, ".claude", "skills")]);
    const census = censusStandingDose(roots);
    expect(census.skillCount).toBe(2); // proves the census actually read something (not vacuous)
    const after = { home: snapshotTree(home), project: snapshotTree(project) };
    expect(after).toEqual(before);
  });

  it("planNativeLaunch + the real-launch write sequence (manifest + settings) only ever writes inside the session dir", () => {
    const before = { home: snapshotTree(home), project: snapshotTree(project) };
    const sessionDir = mkdtempSync(join(tmpdir(), "kc5-door-session-"));
    try {
      const plan = planNativeLaunch({
        home,
        projectDir: project,
        sessionDir,
        statuslineBin: "/fixture/statusline.mjs",
      });
      // Both write targets must live inside the session dir (P3: "session
      // overrides", never shared config).
      expect(plan.manifestPath.startsWith(sessionDir)).toBe(true);
      expect(plan.settingsPath.startsWith(sessionDir)).toBe(true);
      // Reproduces cli.ts's `run()` real-launch write step verbatim (that
      // file is on the do-not-touch list — reproduced here rather than
      // imported/edited) — the two writeFileSync calls are the ONLY disk
      // writes a real `claude-heaven` launch performs.
      writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
      writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);

      const written = snapshotTree(sessionDir);
      expect(Object.keys(written).sort()).toEqual(["profile.json", "settings.json"]);

      const after = { home: snapshotTree(home), project: snapshotTree(project) };
      expect(after).toEqual(before);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("settings load the statusline ONLY — no eviction/suppression, nothing pointed back at ~/.claude (P1 native + P3)", () => {
    const sessionDir = mkdtempSync(join(tmpdir(), "kc5-door-settings-"));
    try {
      const plan = planNativeLaunch({ home, projectDir: project, sessionDir, statuslineBin: "/fixture/statusline.mjs" });
      expect(plan.settings).toEqual({ statusLine: { type: "command", command: "/fixture/statusline.mjs" } });
      expect(plan.argv).toEqual(["--settings", plan.settingsPath]);
      expect(JSON.stringify(plan.settings)).not.toMatch(/\.claude(?!-heaven)/); // no accidental ~/.claude reference
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("repeated native launches (the only transition slice 1 offers) never accumulate or restore anything in the fixture", () => {
    // Slice 1's LAUNCHABLE_POSTURES is ["native"] only (src/cli.ts, on the
    // do-not-touch list) — there is no other posture to transition to/from
    // through this door yet. What IS testable here is that repeated launches
    // (the closest analogue to a transition cycle available today) never
    // leave a mark, matching P3's "exiting a mode is switching modes, never
    // a restore" even in the degenerate one-posture case.
    const before = snapshotTree(home);
    for (let i = 0; i < 3; i++) {
      const sessionDir = mkdtempSync(join(tmpdir(), `kc5-door-repeat-${i}-`));
      try {
        const plan = planNativeLaunch({ home, projectDir: project, sessionDir, statuslineBin: "/fixture/statusline.mjs" });
        writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
        writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);
      } finally {
        rmSync(sessionDir, { recursive: true, force: true });
      }
      expect(snapshotTree(home)).toEqual(before);
    }
  });
});
