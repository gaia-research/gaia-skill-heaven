// The claude-heaven launch PLAN — pure enough to unit-test without spawning
// claude: it reads skill sources (census / resolveSkill) but writes nothing.
// cli.ts turns a plan into files + a process.
//
// NATIVE is still the default posture: claude as-is, nothing evicted, nothing
// summoned, no flags injected beyond the session-scoped statusline wiring (P1).
//
// The non-native postures are NOT composed here. They are composed by core's
// `compile()` — the one place the empirically probed, version-pinned routes
// live — and this module only:
//   (a) resolves --skill paths into core's ResolvedSkill shape,
//   (b) substitutes core's "$SESSION" placeholder with the real session dir,
//   (c) appends the session `--settings` file so the statusline still wires up,
//   (d) writes a manifest describing WHAT WAS ACTUALLY LAUNCHED.
// Nothing here re-derives a route, invents a flag, or edits the compiled argv.
// If a posture's composition is wrong, it is wrong in packages/core.

import { join } from "node:path";
import {
  compile,
  HELL_LEVELS,
  resolveSkill,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-heaven";
import { censusStandingDose, nativeSkillRoots } from "./census.js";
import type { ProfileManifest } from "./statusline.js";

// P2 (LOCKED): the Hell lane is gated. Every user-facing surface hard-errors on
// the Hell levels; /skill-hell is a locked door, not an activator, until Hell is
// proven safe. Sourced from core's canonical HELL_LEVELS (NOT re-listed here) so
// this gate can never drift from the engine's definition — if a Hell level is
// ever added/renamed upstream (e.g. the pending N4 "ultra"), the gate follows
// automatically. off/low are heaven-lane aliases (off→floor, low→curated); the
// launcher takes `--posture`, not those aliases, whose vocabulary is provisional
// (N3, pending N4/N5).
export const GATED_LEVELS: ReadonlySet<string> = new Set(HELL_LEVELS);

// KC6 (Issue #12): a refusal must say WHICH of two unlike things it is —
// withheld by policy (a key exists, and could turn) or incapable in the
// harness (no key exists at all, the surface would be lying if it acted
// otherwise). Conflating them tells a "locked" story where the truth is
// "impossible", which implies a way in that does not exist.
//
// KC6 honesty disclosure (flagged, not improvised around, in PR #18's "Known
// gap"), UPDATED for the KC4 clean-room fix (2026-07-30, dev/kc4-clean-room):
// a curated launch now composes `--setting-sources ''` (an intentionally
// EMPTY allowlist — the fix for KC4's project-scope leak; supersedes T9's
// `--setting-sources project`). An empty allowlist drops EVERY
// setting-sourced install, user scope included, so the conclusion below is
// unchanged (if anything, more firmly true than under the old flag value):
// core mounts ONLY $SESSION/heaven-set as the sole --plugin-dir — the door's
// own plugin is never re-admitted. So `/skill-heaven`, this door's own
// posture control, does not exist inside a curated session. This is neither
// of the two refusal classes: it is not withheld by policy (P2 gates the
// Hell lane only, and nothing here is a trust-coverage decision), and it is
// not proven harness-incapable either — `--plugin-dir` is documented as
// repeatable, so mounting the door alongside the curated set would likely
// work. Core rejects a second `doorPluginDir` for anything but
// `product-floor` (an unprobed composition), so it is left undone rather
// than guessed (M0 discipline) — same restraint as the rest of this door.
// Disclosed HERE, at compose time, because this is the last surface where
// the door still exists to say so: once the session is running, there is
// nothing inside it that can print this for itself.
export const CURATED_DOOR_ABSENCE_NOTE =
  "claude-heaven: /skill-heaven does not exist inside this curated session — " +
  "--setting-sources '' (an intentionally empty allowlist) drops every " +
  "setting-sourced install, user scope included, and only $SESSION/heaven-set " +
  "(the curated set) is mounted via --plugin-dir, so the door itself is " +
  "never re-admitted. Not withheld by policy, and not proven impossible " +
  "either: mounting the door alongside the curated set is an unprobed " +
  "composition (core rejects a second --plugin-dir for anything but " +
  "product-floor), so it is left undone rather than guessed. Use --posture " +
  "product-floor if you need /skill-heaven to survive in-session.";

export interface LaunchOptions {
  /** default "native" */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated only; core rejects it elsewhere. */
  skillPaths?: string[];
  home?: string;
  projectDir?: string;
  /** session dir for manifest + settings + the materialized set (P3: never
   * shared config). Pass "$SESSION" for a dry run — nothing is written, and the
   * printed plan then carries core's own placeholder rather than a fake path. */
  sessionDir: string;
  statuslineBin: string; // absolute path to the statusline bin Claude will run
  /** the door's own plugin dir, so `/skill-heaven` survives at product-floor.
   * Core takes this for product-floor only (it does not assume a package
   * topology); passing it anywhere else is a compile-time error upstream. */
  doorPluginDir?: string;
  createdAt?: string;
  claudeArgs?: string[]; // passthrough to claude (after our flags)
}

export interface LaunchPlan {
  posture: Posture;
  manifest: ProfileManifest;
  manifestPath: string;
  settingsPath: string;
  settings: unknown;
  command: string;
  argv: string[];
  env: Record<string, string>; // additions only (never removals)
  /** core's fsPlan, already substituted for this session dir. Empty for native.
   * cli.ts materializes it; nothing outside the session dir is ever touched (P3). */
  fsPlan: FsOp[];
  /** core's compile notes, carried verbatim so the evidence travels with the plan. */
  notes: string[];
}

/** P2 gate: reject the Hell lane before it can compose anything. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && GATED_LEVELS.has(level)) {
    throw new Error(
      `level "${level}" is Hell-lane and gated (P2) — withheld by policy, not a harness limit: it is ` +
        `technically composable but deliberately locked until Hell is proven safe. /skill-hell is a locked ` +
        `door, not an activator: the key exists and can turn once that bar is met. claude-heaven composes ` +
        `Heaven-lane postures only.`,
    );
  }
}

const substSession = (s: string, sessionDir: string) => s.replaceAll("$SESSION", sessionDir);

/**
 * Plan a launch at any posture this door composes.
 *
 * MANIFEST HONESTY. `posture`, `standingTokens`, `skillCount` and `scope` describe
 * the session that is actually being launched — never what native would have
 * been. Both the statusline and the `/skill-heaven` session line read this one
 * file; a manifest that lied would make both surfaces lie at once.
 */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "native";
  const manifestPath = join(opts.sessionDir, "profile.json");
  const settingsPath = join(opts.sessionDir, "settings.json");

  // Session-scoped settings: ONLY the statusline command. Loaded via
  // `--settings <file>`, so ~/.claude is never mutated (P3). `--settings` is an
  // explicit-provision channel, separate from `--setting-sources` (which selects
  // among user/project/local) — so it survives the eviction flags core composes
  // for the non-native postures.
  const settings = {
    statusLine: { type: "command", command: opts.statuslineBin },
  };

  if (posture === "native") {
    // Mirrors core's `--skill is only valid with --posture curated` guard, which
    // native alone never reaches because native never calls compile(). Silently
    // dropping the flag would hand the user a session missing the skills they
    // asked for, and no error saying so.
    if (opts.skillPaths?.length) {
      throw new Error("--skill is only valid with --posture curated (got posture native)");
    }
    const census = censusStandingDose(
      nativeSkillRoots({ home: opts.home, projectDir: opts.projectDir }),
    );
    const manifest: ProfileManifest = {
      schema: "claude-heaven/profile@1",
      posture: "native",
      standingTokens: census.standingTotal,
      skillCount: census.skillCount,
      scope: census.scope,
      ...(census.incomplete ? { incomplete: true } : {}),
      launcherLocked: true, // launched via claude-heaven → a subtractive posture is reachable
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    };
    return {
      posture: "native",
      manifest,
      manifestPath,
      settingsPath,
      settings,
      command: "claude",
      // No eviction / suppression flags — native is claude untouched (P1).
      argv: ["--settings", settingsPath, ...(opts.claudeArgs ?? [])],
      env: { CLAUDE_HEAVEN_PROFILE: manifestPath },
      fsPlan: [],
      notes: [],
    };
  }

  // Non-native: core composes it. Skill ids come from frontmatter `name`,
  // falling back to the directory name (core's resolveSkill).
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((p) => resolveSkill(p));
  const compiled = compile({
    posture,
    harness: "claude",
    skills,
    // Product-floor keeps slash commands, which is only worth anything if the
    // door is actually mounted: `--setting-sources project` drops the user-scope
    // install. Core rejects this field for every other posture, so it is passed
    // for product-floor and nowhere else.
    ...(posture === "product-floor" && opts.doorPluginDir
      ? { doorPluginDir: opts.doorPluginDir }
      : {}),
  });

  const env: Record<string, string> = { CLAUDE_HEAVEN_PROFILE: manifestPath };
  for (const [k, v] of Object.entries(compiled.env)) env[k] = substSession(v, opts.sessionDir);

  const manifest: ProfileManifest = {
    schema: "claude-heaven/profile@1",
    posture,
    // The composed session's real standing dose: the tokens compile() priced
    // for the curated set (zero skills submitted at product-floor, since
    // product-floor takes no --skill — but see the `incomplete` note below:
    // zero PRICED skills is not the same claim as zero skills PRESENT in the
    // session, and this comment used to conflate the two). NOT a native
    // census.
    //
    // KC4 CORRECTION (2026-07-29/30, packages/claude-heaven/scripts/
    // probe-kc4-listing-residual.sh, 2/2 live runs, claude 2.1.220): the T9
    // route this comment used to call "zero listing residual" was NOT zero —
    // a project-scope skill (<cwd>/.claude/skills, kept live by
    // `--setting-sources project`) and a bundled skill named `doctor`
    // (unaffected by CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1) both showed up
    // alongside the curated set in a real session's skill listing. See
    // compile.ts's curated note for the full finding.
    //
    // CURATED — RESOLVED (dev/kc4-clean-room, 2026-07-30, verified by a
    // second probe run + full suite green): curated now composes
    // `--setting-sources ''` (an intentionally empty allowlist) instead of
    // `project`, which was an ALLOWLIST that kept project scope live, not a
    // suppression flag. Re-probed 2/2: `skills = ["heaven-set:<id>", "doctor"]`
    // — the project-scope leak is gone; `doctor` is the one remaining,
    // founder-ruled-permanent residual. `scopeCaveat`/`scopeNote` disclose it
    // for `scope: "session"` below (A3). This fix lands on this same
    // integration branch via a separate PR — if that PR has not merged by
    // the time this one does, curated's real residual is still the wider
    // pre-fix set, and the "doctor only" caveat text under-discloses until
    // it lands; check the integration branch's compile.ts before trusting
    // this comment at face value.
    //
    // PRODUCT-FLOOR — NOT RESOLVED, DELIBERATELY OUT OF SCOPE HERE: unlike
    // curated, product-floor's composition still names `--setting-sources
    // project` (F7 route, unchanged) — the SAME allowlist shape KC4 found
    // leaky, un-probed for product-floor specifically but structurally
    // identical to what leaked under curated. A live probe (2026-07-30,
    // orchestrator-run, 2/2 byte-identical reps, claude 2.1.220) confirms it:
    // a planted project-scope marker skill in cwd shows up in product-floor's
    // session:init `skills` array alongside `doctor`. Changing product-floor's
    // composition is a founder call (it is a measured benchmark arm, F7 —
    // altering it invalidates a recorded number) and is explicitly NOT made
    // here. What IS fixed here: `standingTokens: 0` was being presented as an
    // exact, complete count for a posture that can silently carry
    // project-scope skills this number never prices. `incomplete: true`
    // below marks that honestly — the existing "floor, not exact" idiom
    // (see census.ts / statusline.ts's trailing "+") — rather than printing
    // an optimistic, unconditional zero.
    standingTokens: compiled.doseSummary.standingTotal,
    skillCount: skills.length,
    // product-floor cannot rule out a project-scope leak (see above) — mark
    // the dose as a floor, not an exact count, using the same mechanism
    // native's census already uses for "we could not fully verify this
    // number." Curated is NOT marked incomplete: the KC4 fix closes its
    // project-scope leak, and its one remaining residual (`doctor`) is a
    // known, permanent exclusion disclosed via the scope caveat text
    // instead (A3) — a fixed, always-true exclusion, not a floor.
    ...(posture === "product-floor" ? { incomplete: true } : {}),
    // "session" — the profile IS the session's SET (what was admitted to the
    // curated skill dir), enumerated exactly rather than censused. That is
    // NOT the same claim as "nothing else appears in a session's skill
    // LISTING" — the KC4 correction above measured that curated sessions
    // CAN show skills outside this enumerated set, and product-floor still
    // can too (see above). The comment that used to sit here asserted a
    // zero-residual claim this measurement had already disproven — that
    // assertion has been removed, not repeated.
    //
    // A3 (Issue #9 follow-up): the "session" scope now DOES render an
    // exclusion caveat — src/statusline.ts `scopeCaveat` and render-
    // posture.mjs `scopeNote` both disclose the `doctor` residual for this
    // scope value.
    scope: "session",
    launcherLocked: true,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  };

  return {
    posture,
    manifest,
    manifestPath,
    settingsPath,
    settings,
    command: compiled.command,
    argv: [
      ...compiled.argv.map((a) => substSession(a, opts.sessionDir)),
      "--settings",
      settingsPath,
      ...(opts.claudeArgs ?? []),
    ],
    env,
    fsPlan: compiled.fsPlan.map((op) =>
      op.kind === "write"
        ? { ...op, path: substSession(op.path, opts.sessionDir) }
        : { ...op, from: substSession(op.from, opts.sessionDir), to: substSession(op.to, opts.sessionDir) },
    ),
    // KC6: the curated door-absence disclosure travels with the plan itself
    // (surfaced by --print's JSON and printed to stderr by a real launch in
    // cli.ts), same as every other compose-time note core hands back.
    notes: [...compiled.notes, ...(posture === "curated" ? [CURATED_DOOR_ABSENCE_NOTE] : [])],
  };
}

/** Back-compat alias for the native path (the door's default posture). */
export function planNativeLaunch(opts: Omit<LaunchOptions, "posture" | "skillPaths">): LaunchPlan {
  return planLaunch({ ...opts, posture: "native" });
}
