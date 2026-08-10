// Issue #11 (P1) — Verify zero shared-state mutation (P3), claude-zero door.
//
// KC5 (verbatim): "No shared config or skill directory is mutated (P3),
// verified by before/after diff."
//
// This complements packages/core/test/no-shared-mutation.test.ts, which
// covers compile()/materialize() across every posture x harness x mechanism
// at the ENGINE level. This file covers the claude-zero DOOR specifically:
// `planNativeLaunch`/`planLaunch` (src/launcher.ts), the census reads native
// depends on (src/census.ts), and — for the non-native postures — the real
// write sequence a live `claude-zero` launch performs (materialize(fsPlan,
// sessionDir) + the manifest/settings writeFileSync calls, reproduced from
// cli.ts's `run()` without importing or editing that file, which stays on the
// do-not-touch list).
//
// GAP CLOSED (Issue #11 re-verification, 2026-07-30): this file used to cover
// native only, on the premise that `src/cli.ts`'s `LAUNCHABLE_POSTURES` was
// `["native"]` — the only posture reachable through this door at the time.
// PR #18 widened `LAUNCHABLE_POSTURES` to `["native", "curated",
// "product-floor"]`; the `curated` route carries a REAL fsPlan (it writes
// `heaven-set/.claude-plugin/plugin.json` and copies each selected skill into
// `$SESSION/heaven-set/skills/<id>`), so the KC5 guarantee had never actually
// been re-established against the widened door's write path. The describe
// block below closes that gap: it drives `planLaunch` (not just
// `planNativeLaunch`) at every posture this door now offers, materializes the
// real fsPlan into a real session dir, reproduces cli.ts's manifest/settings
// write step, and diffs a multi-root fixture ($HOME analogue with a skills
// dir, credentials, other harnesses' dirs, plus a separate "door" dir)
// before/after — mirroring the core-level "KC5 dynamic" pattern, but through
// the door's own entry point instead of calling core's compile() directly.
//
// Fixtures only — never the founder's real ~/.claude.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materialize } from "skill-zero";
import { censusStandingDose, nativeSkillRoots } from "../src/census.js";
import { LAUNCHABLE_POSTURES } from "../src/cli.js";
import { planLaunch, planNativeLaunch } from "../src/launcher.js";

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

describe("KC5 (claude-zero door): before/after fixture diff for the native launch plan", () => {
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
    // included so the diff also proves the claude-zero door doesn't reach
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
      // writes a real `claude-zero` launch performs.
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

  it("repeated native launches never accumulate or restore anything in the fixture", () => {
    // Repeated launches of the SAME posture never leave a mark, matching P3's
    // "exiting a mode is switching modes, never a restore" even in the
    // degenerate same-posture case. Real cross-posture transitions through
    // this door (native <-> curated <-> product-floor, per the now-widened
    // LAUNCHABLE_POSTURES) are covered in the describe block below.
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

describe("KC5 (claude-zero door): before/after fixture diff for the curated & product-floor launch plans", () => {
  // The gap this block closes: PR #18 widened src/cli.ts's LAUNCHABLE_POSTURES
  // from ["native"] to ["native", "curated", "product-floor"]. The `curated`
  // route is the one that actually writes: it composes
  // `heaven-set/.claude-plugin/plugin.json` plus a copyDir per selected skill
  // into `$SESSION/heaven-set/skills/<id>` (packages/core/src/compile.ts's
  // "plugin-dir" mechanism). Before this block, nothing in this package drove
  // `planLaunch` (as opposed to the native-only `planNativeLaunch` alias) all
  // the way through a REAL `materialize()` call against a multi-root fixture
  // and asserted the fixture came back byte-identical — the door-level "KC5"
  // file only ever exercised native. `packages/core/test/no-shared-mutation.test.ts`
  // does drive curated's real fsPlan through core's own compile()+materialize(),
  // but never through this door's planLaunch/cli.ts entry point, so it does not
  // stand in for coverage of the door itself.
  let fixtureRoot: string;
  let home: string;
  let project: string;
  let doorDir: string;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "kc5-door-curated-fixture-"));
    home = join(fixtureRoot, "home");
    project = join(fixtureRoot, "project");
    doorDir = join(fixtureRoot, "door");
    writeSkill(join(home, ".claude", "skills", "home-skill"), "home-skill", "lives in the fixture home");
    writeSkill(join(project, ".claude", "skills", "project-skill"), "project-skill", "lives in the fixture project");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "auth.json"), '{"auth":"fixture"}\n');
    writeFileSync(join(home, ".claude", ".credentials.json"), '{"token":"fixture"}\n');
    mkdirSync(join(home, ".pi"), { recursive: true });
    writeFileSync(join(home, ".pi", "config.toml"), "# fixture pi config\n");
    mkdirSync(join(home, ".grok"), { recursive: true });
    mkdirSync(join(home, ".cursor"), { recursive: true });
    // A separate "door" dir (stands in for claude-zero's own bundled plugin
    // dir, cli.ts's doorPluginDir()) — product-floor takes this as a caller
    // path only (argv passthrough), never an fsPlan target; included in the
    // diff to prove that holds.
    mkdirSync(doorDir, { recursive: true });
    writeFileSync(join(doorDir, ".claude-plugin.json"), '{"name":"door"}\n');
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  /** Reproduces cli.ts's real-launch write sequence (materialize the fsPlan,
   * then write manifest + settings) for one posture, against a fresh session
   * dir, then tears the session dir down — mirroring `run()`'s try/finally. */
  function realLaunch(posture: "native" | "curated" | "product-floor"): void {
    const sessionDir = mkdtempSync(join(tmpdir(), `kc5-door-real-${posture}-`));
    try {
      const plan = planLaunch({
        posture,
        skillPaths: posture === "curated" ? [join(home, ".claude", "skills", "home-skill")] : [],
        home,
        projectDir: project,
        sessionDir,
        statuslineBin: "/fixture/statusline.mjs",
        ...(posture === "product-floor" ? { doorPluginDir: doorDir } : {}),
      });
      materialize(plan.fsPlan, sessionDir);
      writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
      writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  it("this door's LAUNCHABLE_POSTURES is exactly {native, curated, product-floor} — pins the set this block exercises", () => {
    // If a future posture is added/removed from the door, this fails loudly
    // rather than letting the block below silently stop covering the real set.
    expect([...LAUNCHABLE_POSTURES].sort()).toEqual(["curated", "native", "product-floor"]);
  });

  it("curated: materialize(fsPlan) + the manifest/settings write sequence writes real bytes into the session, and leaves home/project/door byte-identical", () => {
    const before = { home: snapshotTree(home), project: snapshotTree(project), door: snapshotTree(doorDir) };
    const sessionDir = mkdtempSync(join(tmpdir(), "kc5-door-curated-session-"));
    try {
      const plan = planLaunch({
        posture: "curated",
        skillPaths: [join(home, ".claude", "skills", "home-skill")],
        home,
        projectDir: project,
        sessionDir,
        statuslineBin: "/fixture/statusline.mjs",
      });
      materialize(plan.fsPlan, sessionDir);
      writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
      writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);

      // Non-vacuous: this is the write the whole test exists to check. The
      // plugin manifest that makes --plugin-dir resolve, plus the copied
      // skill, with real bytes — both inside the session dir.
      const pluginJson = join(sessionDir, "heaven-set", ".claude-plugin", "plugin.json");
      expect(existsSync(pluginJson)).toBe(true);
      expect(JSON.parse(readFileSync(pluginJson, "utf-8")).name).toBe("heaven-set");
      const copiedSkill = join(sessionDir, "heaven-set", "skills", "home-skill", "SKILL.md");
      expect(readFileSync(copiedSkill, "utf-8")).toBe(
        readFileSync(join(home, ".claude", "skills", "home-skill", "SKILL.md"), "utf-8"),
      );
      expect(existsSync(join(sessionDir, "profile.json"))).toBe(true);
      expect(existsSync(join(sessionDir, "settings.json"))).toBe(true);

      // Every fsPlan write target is session-scoped, no exceptions.
      for (const op of plan.fsPlan) {
        const to = op.kind === "write" ? op.path : op.to;
        expect(to.startsWith(sessionDir), `${to} escapes the session dir`).toBe(true);
      }

      const after = { home: snapshotTree(home), project: snapshotTree(project), door: snapshotTree(doorDir) };
      expect(after).toEqual(before);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("product-floor: the real-launch write sequence writes only manifest+settings (no fsPlan ops), and leaves home/project/door byte-identical", () => {
    const before = { home: snapshotTree(home), project: snapshotTree(project), door: snapshotTree(doorDir) };
    const sessionDir = mkdtempSync(join(tmpdir(), "kc5-door-productfloor-session-"));
    try {
      const plan = planLaunch({
        posture: "product-floor",
        home,
        projectDir: project,
        sessionDir,
        statuslineBin: "/fixture/statusline.mjs",
        doorPluginDir: doorDir,
      });
      expect(plan.fsPlan).toEqual([]); // product-floor never writes fsPlan ops at all
      materialize(plan.fsPlan, sessionDir);
      writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
      writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);

      const written = snapshotTree(sessionDir);
      expect(Object.keys(written).sort()).toEqual(["profile.json", "settings.json"]);

      const after = { home: snapshotTree(home), project: snapshotTree(project), door: snapshotTree(doorDir) };
      expect(after).toEqual(before);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("posture TRANSITIONS through every posture this door offers (native -> curated -> product-floor -> native) never mutate or restore the fixture", () => {
    // P3, verbatim: "exiting a mode is switching modes, never a restore." Uses
    // the real LAUNCHABLE_POSTURES set (asserted above) rather than a
    // hand-written cycle, so this can't silently stop covering a posture the
    // door adds later.
    const before = snapshotTree(home);
    const cycle = [...LAUNCHABLE_POSTURES, LAUNCHABLE_POSTURES[0]] as Array<
      "native" | "curated" | "product-floor"
    >;
    for (const posture of cycle) {
      realLaunch(posture);
      // Diff after EVERY step, not just at the end — a stash-then-restore-later
      // bug could otherwise cancel out by the time the cycle completes.
      expect(snapshotTree(home)).toEqual(before);
    }
  });
});
