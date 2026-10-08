// The installer's onboarding epilogue, written once (#193).
//
// install-agent-plugin.sh and install-agent-plugin.ps1 used to each carry their
// own copy of this text, one `if have <harness>` block per harness, kept equal
// to compat.ts by a drift test. Both scripts now stage the artifact and hand the
// rest to `scripts/install-profile.mjs`, a generated bundle of this module — so
// the two installers, /start and the docs cannot disagree about a command.
//
// Pure: it formats text from the compat table. Detection (is a harness on
// PATH?) and execution (`--register`) belong to the installer, which passes in
// what it found and what it ran.

import {
  CHIP_LABEL,
  HARNESS_PATHS,
  PROFILE_PITCH,
  type HarnessId,
  type HarnessPath,
  type ProfileId,
} from "./compat.js";
import { planProfile, planSwitch, type PlanPaths, type RenderedStep } from "./install-plan.js";

export const START_URL = "https://gaia-research.github.io/gaia-skill-heaven/#/start";

/** `Verified (2.1.288)` · `Compatible (probed 0.161.0)` · `Partial (static check on X)`. */
export function chipText(h: HarnessPath): string {
  const chip = CHIP_LABEL[h.chip];
  if (!h.probedVersion) return chip;
  if (h.chip === "verified") return `${chip} (${h.probedVersion})`;
  if (h.chip === "partial") return `${chip} (static check on ${h.probedVersion})`;
  return `${chip} (probed ${h.probedVersion})`;
}

/** Outcome of an explicit `--register` run for one step. */
export interface RanStep {
  run: string;
  ok: boolean;
  /** One line of the client's own output or error; never a credential. */
  detail: string;
}

export interface EpilogueInput {
  profile: ProfileId;
  /** The profile the previous run recorded, if any. */
  previous: ProfileId | null;
  /** Harness ids found on PATH, in table order. */
  found: readonly HarnessId[];
  paths: PlanPaths & { installHome: string; uninstall: string };
  /** `--register` results per harness, when it was used. */
  ran?: Readonly<Partial<Record<HarnessId, readonly RanStep[]>>>;
  /** `harness` blocked on Full: the harnesses that could not take the console. */
  quiet?: boolean;
}

const indent = (n: number) => " ".repeat(n);

function stepLines(steps: readonly RenderedStep[], pad: number): string[] {
  return steps.map((s) => `${indent(pad)}${s.run}`);
}

function harnessBlock(h: HarnessPath, input: EpilogueInput): string[] {
  const { profile, previous, paths } = input;
  const out: string[] = [`  ${h.bin!.padEnd(8)} ${h.name} - ${chipText(h)}`];
  const core = planProfile(h, "core", "register", paths);
  const coreSteps = core.kind === "steps" ? core.steps : [];
  if (coreSteps[0]?.where === "harness") out.push(`${indent(11)}Inside ${h.name}, type:`);
  out.push(...stepLines(coreSteps, 13));
  if (profile === "full") {
    const full = planProfile(h, "full", "register", paths);
    if (full.kind === "blocked") {
      out.push(`${indent(11)}Full is not available on ${h.name}: ${full.reason}`);
      out.push(`${indent(11)}Core above still works; no console was added.`);
    } else {
      const piece = previous === "core" ? planSwitch(h, "core", "full", paths) : null;
      const consoleSteps = (piece && piece.kind === "steps" ? piece.steps : full.steps.filter((s) => s.piece === "console")) as readonly RenderedStep[];
      out.push(`${indent(11)}Then add the console (Full):`);
      out.push(...stepLines(consoleSteps, 13));
    }
  } else if (previous === "full" && h.consolePiece) {
    const down = planSwitch(h, "full", "core", paths);
    if (down.kind === "steps" && down.steps.length > 0) {
      out.push(`${indent(11)}You asked for Core and had Full. Remove only the console:`);
      out.push(...stepLines(down.steps, 13));
    }
  }
  const ran = input.ran?.[h.id];
  if (ran) {
    out.push(`${indent(11)}--register ran:`);
    for (const r of ran) out.push(`${indent(13)}${r.ok ? "ok  " : "FAIL"} ${r.run}${r.ok || !r.detail ? "" : ` — ${r.detail}`}`);
  }
  return out;
}

export function renderInstallEpilogue(input: EpilogueInput): string {
  const { profile, paths } = input;
  const pitch = PROFILE_PITCH[profile];
  const found = input.found.map((id) => HARNESS_PATHS.find((h) => h.id === id)!).filter((h) => h.bin !== null);
  const missing = HARNESS_PATHS.filter((h) => h.bin !== null && !input.found.includes(h.id));
  const lines: string[] = [];
  lines.push(`Installed the portable Skill Heaven Agent Plugin.`);
  lines.push("");
  lines.push(`Profile: ${pitch.name} — ${pitch.line}`);
  lines.push("");
  lines.push("What changed on this machine");
  lines.push(`  + ${paths.pluginDir}  (the plugin, one directory)`);
  lines.push(`  + ${paths.marketplaceDir}  (a local marketplace that lists it)`);
  if (profile === "full") lines.push(`  + ${paths.consoleDir}  (the console pieces, Full only)`);
  lines.push("  No harness was installed or reconfigured.");
  lines.push("");
  lines.push("Harnesses found on PATH");
  for (const h of found) lines.push(...harnessBlock(h, input));
  if (found.length === 0) {
    lines.push("  (none found)");
    lines.push("  No supported harness was found on PATH. Skill Heaven runs inside a harness you already use; it never installs one.");
    lines.push(`  When you have one, run its command from ${START_URL}`);
  }
  if (missing.length > 0) {
    lines.push("");
    lines.push(`Not found: ${missing.map((h) => h.bin).join(", ")}`);
  }
  lines.push("");
  const other = HARNESS_PATHS.find((h) => h.id === "other")!;
  lines.push(`${other.name} (${CHIP_LABEL[other.chip]})`);
  lines.push(`  Point your client's own plugin install at ${paths.pluginDir}.`);
  lines.push("  There is no universal registration command.");
  lines.push("");
  lines.push(
    "First run: inside your harness, type /summon <what you need> (Claude Code and Antigravity: /skill-heaven:summon <what you need>).",
  );
  lines.push("Update:    re-run this installer (clients that cache plugins also need their own update).");
  lines.push(
    profile === "full"
      ? "Switch:    re-run with --profile core to drop only the console; Core keeps working."
      : "Switch:    re-run with --profile full to add the native console; Core is not touched.",
  );
  lines.push(`Remove:    ${paths.uninstall}   (client registrations are removed in each client)`);
  lines.push(`Choose your harness and read what each step does: ${START_URL}`);
  return lines.join("\n");
}
