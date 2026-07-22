// The claude-heaven launch PLAN — pure, so it is unit-testable without spawning
// claude or touching disk. cli.ts turns a plan into files + a process.
//
// SLICE 1 = NATIVE DEFAULT (WS4 step 1, D10): claude at native posture, nothing
// evicted, nothing summoned, no flags injected beyond the session-scoped
// statusline wiring. The subtractive floor / curated postures are launched by
// later steps; this step only proves the native door + the standing-dose readout.

import { join } from "node:path";
import { HELL_LEVELS, type Posture } from "skill-heaven";
import { censusStandingDose, nativeSkillRoots } from "./census.js";
import type { ProfileManifest } from "./statusline.js";

// P2 (LOCKED): the Hell lane is gated. Every user-facing surface hard-errors on
// the Hell levels; /skill-hell is a locked door, not an activator, until Hell is
// proven safe. Sourced from core's canonical HELL_LEVELS (NOT re-listed here) so
// this gate can never drift from the engine's definition — if a Hell level is
// ever added/renamed upstream (e.g. the pending N4 "ultra"), the gate follows
// automatically. off/low are heaven-lane aliases (off→floor, low→curated) — out
// of scope for slice 1, which ships native only.
export const GATED_LEVELS: ReadonlySet<string> = new Set(HELL_LEVELS);

export interface LaunchOptions {
  home?: string;
  projectDir?: string;
  sessionDir: string; // temp dir for manifest + settings (P3: never shared config)
  statuslineBin: string; // absolute path to the statusline bin Claude will run
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
}

/** P2 gate: reject the Hell lane before it can compose anything. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && GATED_LEVELS.has(level)) {
    throw new Error(
      `level "${level}" is Hell-lane and gated (P2): /skill-hell is a locked door until Hell is proven safe. claude-heaven slice 1 launches native only.`,
    );
  }
}

export function planNativeLaunch(opts: LaunchOptions): LaunchPlan {
  const census = censusStandingDose(nativeSkillRoots({ home: opts.home, projectDir: opts.projectDir }));
  const manifestPath = join(opts.sessionDir, "profile.json");
  const settingsPath = join(opts.sessionDir, "settings.json");

  const manifest: ProfileManifest = {
    schema: "claude-heaven/profile@1",
    posture: "native",
    standingTokens: census.standingTotal,
    skillCount: census.skillCount,
    scope: census.scope,
    ...(census.incomplete ? { incomplete: true } : {}),
    launcherLocked: true, // launched via claude-heaven → the subtractive floor is reachable
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  };

  // Session-scoped settings: ONLY the statusline command. No eviction /
  // suppression flags — native is claude untouched (D10). Loaded via
  // `--settings <file>`, so ~/.claude is never mutated (P3).
  const settings = {
    statusLine: { type: "command", command: opts.statuslineBin },
  };

  return {
    posture: "native",
    manifest,
    manifestPath,
    settingsPath,
    settings,
    command: "claude",
    argv: ["--settings", settingsPath, ...(opts.claudeArgs ?? [])],
    env: { CLAUDE_HEAVEN_PROFILE: manifestPath },
  };
}
