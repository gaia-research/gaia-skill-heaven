// Install plans — Core vs Full, derived from the one compat table (#193).
//
// The POSIX installer, the PowerShell installer, the site's /start page, the
// console's Trust section and the docs all ask this module what to type for a
// (harness, profile, operation). Nothing else spells a registration command, so
// there is nothing to drift. Full is ALWAYS Core plus the console piece; a
// harness whose console cannot be registered safely is `blocked`, and a plan
// for it says so instead of quietly returning the Core steps.

import {
  AGENT_PLUGIN_INSTALL,
  type HarnessPath,
  type HarnessId,
  type InstallStep,
  type PieceSteps,
  type ProfileId,
} from "./compat.js";

export interface PlanPaths {
  pluginDir: string;
  marketplaceDir: string;
  consoleDir: string;
}

/** Stage-only bootstrap; host registration remains explicit and separate. */
export function profileInstallerCommand(harness: HarnessId, profile: ProfileId, platform: "posix" | "windows", register = false): string {
  if (platform === "windows") {
    const url = AGENT_PLUGIN_INSTALL.windows.replace(/^irm\s+|\s*\|\s*iex$/g, "");
    return `& ([scriptblock]::Create((Invoke-RestMethod '${url}'))) -Harness ${harness} -Profile ${profile}${register ? ' -Register' : ''}`;
  }
  return `${AGENT_PLUGIN_INSTALL.posix.replace(/\s*\|\s*sh$/, "")} | sh -s -- --harness ${harness} --profile ${profile}${register ? ' --register' : ''}`;
}

export const WINDOWS_PLAN_PATHS: PlanPaths = {
  pluginDir: "$env:LOCALAPPDATA/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven",
  marketplaceDir: "$env:LOCALAPPDATA/gaia-skill-heaven-agent-plugin/marketplace",
  consoleDir: "$env:LOCALAPPDATA/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven-console",
};

/** The paths the site prints: `$HOME`-relative, matching what the POSIX installer stages by default. */
export const DEFAULT_PLAN_PATHS: PlanPaths = {
  pluginDir: AGENT_PLUGIN_INSTALL.plugin,
  marketplaceDir: AGENT_PLUGIN_INSTALL.marketplace,
  consoleDir: `${AGENT_PLUGIN_INSTALL.root}/marketplace/plugins/skill-heaven-console`,
};

export interface RenderedStep extends InstallStep {
  /** Which piece the step belongs to. */
  piece: "core" | "console";
}

export type PlanOp = "register" | "update" | "remove";

export type Plan =
  | { kind: "steps"; steps: RenderedStep[] }
  | { kind: "blocked"; reason: string };

export function renderRun(run: string, paths: PlanPaths): string {
  return run
    .replaceAll("{{PLUGIN_DIR}}", paths.pluginDir)
    .replaceAll("{{MARKETPLACE_DIR}}", paths.marketplaceDir)
    .replaceAll("{{CONSOLE_DIR}}", paths.consoleDir);
}

function render(steps: readonly InstallStep[], piece: RenderedStep["piece"], paths: PlanPaths): RenderedStep[] {
  return steps.map((s) => ({
    ...s,
    run: renderRun(s.run, paths),
    ...(s.shell === undefined ? {} : { shell: renderRun(s.shell, paths) }),
    piece,
  }));
}

function pick(piece: PieceSteps, op: PlanOp): readonly InstallStep[] {
  return piece[op];
}

/**
 * The steps for one profile and operation on one harness.
 *
 * - `register`: Core's register steps; Full adds the console's.
 * - `update`:   Core's update steps; Full adds the console's.
 * - `remove`:   Full removes the console first, then Core.
 */
export function planProfile(harness: HarnessPath, profile: ProfileId, op: PlanOp, paths: PlanPaths = DEFAULT_PLAN_PATHS): Plan {
  if (profile === "core") return { kind: "steps", steps: render(pick(harness.core, op), "core", paths) };
  if (harness.consolePiece === null) {
    return { kind: "blocked", reason: harness.fullBlocked ?? `Core + Console is not available on ${harness.name}.` };
  }
  const core = render(pick(harness.core, op), "core", paths);
  const consoleSteps = render(pick(harness.consolePiece, op), "console", paths);
  return { kind: "steps", steps: op === "remove" ? [...consoleSteps, ...core] : [...core, ...consoleSteps] };
}

/**
 * Moving between profiles touches only the console piece:
 * Core → Full adds it; Full → Core removes it. Core is never re-registered or
 * removed by a switch.
 */
export function planSwitch(harness: HarnessPath, from: ProfileId, to: ProfileId, paths: PlanPaths = DEFAULT_PLAN_PATHS): Plan {
  if (from === to) return { kind: "steps", steps: [] };
  if (harness.consolePiece === null) {
    return { kind: "blocked", reason: harness.fullBlocked ?? `Core + Console is not available on ${harness.name}.` };
  }
  return {
    kind: "steps",
    steps: render(to === "full" ? harness.consolePiece.register : harness.consolePiece.remove, "console", paths),
  };
}

/** True when the plan is runnable (not blocked). */
export function isRunnable(plan: Plan): plan is Extract<Plan, { kind: "steps" }> {
  return plan.kind === "steps";
}

/** The commands a person types, in order, with where each is typed. */
export function commandLines(plan: Plan): string[] {
  return plan.kind === "steps" ? plan.steps.map((s) => s.run) : [];
}
