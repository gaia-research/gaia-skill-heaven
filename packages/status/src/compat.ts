// The harness compatibility table — one source for the site's /start chooser
// and the console's Trust section (docs/CONTROL-PLANE.md §5.4).
//
// Every row states the version that was actually probed and the evidence
// class. A version installed on a user's machine (or on the machine that wrote
// this table) is NOT the probed version unless the row says so. Commands are
// only ones the client accepted in a recorded probe (PRODUCT.md principle 7);
// where no accepted command exists, `commands` is empty and `blocked` says why.

import type { HostIntegration, VerificationChip } from "./model.js";

export const AGENT_PLUGIN_INSTALL = {
  posix: "curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh",
  windows: "irm https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.ps1 | iex",
  root: "$HOME/.local/share/gaia-skill-heaven-agent-plugin",
  marketplace: "$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace",
  plugin: "$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven",
  uninstall: "$HOME/.local/share/gaia-skill-heaven-agent-plugin/uninstall.sh",
} as const;

export const LAUNCHER_INSTALL = {
  posix: "curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh",
  windows: "irm https://gaia-research.github.io/gaia-skill-heaven/install.ps1 | iex",
  uninstall: "$HOME/.local/share/gaia-skill-heaven/uninstall.sh",
} as const;

export type HarnessId = "claude" | "codex" | "pi" | "grok" | "hermes" | "agy" | "other";

export interface HarnessPath {
  id: HarnessId;
  name: string;
  /** Binary name a shell can look for; null for "another client". */
  bin: string | null;
  chip: VerificationChip;
  /** The version the evidence was recorded on. */
  probedVersion: string | null;
  /** One line: what the evidence is and where it lives. */
  evidence: string;
  evidenceHref: string | null;
  /** Does this path need the terminal installer first? */
  needsInstaller: boolean;
  /** Registration, in order. Run inside the harness when `inHarness`. */
  commands: readonly string[];
  inHarness: boolean;
  /** When there is no accepted command to print. */
  blocked: string | null;
  update: string;
  remove: readonly string[];
  /** What the persistent status entry can do on this harness. */
  statusIntegration: HostIntegration;
  statusNote: string;
  /** Optional launcher door for a clean-start floor. */
  launcher: string | null;
}

const REPO = "https://github.com/gaia-research/gaia-skill-heaven/blob/main";

export const HARNESS_PATHS: readonly HarnessPath[] = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    chip: "verified",
    probedVersion: "2.1.288",
    evidence: "Fresh-install receipt, 76/76 checks, GitHub main @ fdfd94e.",
    evidenceHref: `${REPO}/docs/RELEASE-ACCEPTANCE.md`,
    needsInstaller: false,
    commands: [
      "/plugin marketplace add gaia-research/gaia-skill-heaven",
      "/plugin install skill-heaven@gaia-skill-heaven",
    ],
    inHarness: true,
    blocked: null,
    update: "claude plugin marketplace update gaia-skill-heaven && claude plugin update skill-heaven@gaia-skill-heaven",
    remove: ["claude plugin uninstall skill-heaven@gaia-skill-heaven"],
    statusIntegration: "APPEND",
    statusNote:
      "The optional console (preview) adds a status entry beside yours — it never replaces your statusLine. Desktop paint needs a local probe.",
    launcher: "claude-zero",
  },
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    chip: "compatible",
    probedVersion: "0.146.0",
    evidence: "Live probe: plugin installed, five surfaces recognised, summon returned a card.",
    evidenceHref: `${REPO}/plugins/skill-heaven/PROBE.md`,
    needsInstaller: true,
    commands: [
      `codex plugin marketplace add "${AGENT_PLUGIN_INSTALL.marketplace}"`,
      "codex plugin add skill-heaven@gaia-skill-heaven",
    ],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then reinstall in Codex — Codex keeps its own cached copy.",
    remove: ["codex plugin remove skill-heaven@gaia-skill-heaven", AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "Codex has no public status contribution API. Summon receipts still print in the transcript.",
    launcher: "codex-zero",
  },
  {
    id: "pi",
    name: "Pi",
    bin: "pi",
    chip: "compatible",
    probedVersion: "0.84.2",
    evidence: "Live probe of the Pi adapter. Pi 1.0.x now ships `pi mcp`; the adapter needs a re-probe there.",
    evidenceHref: `${REPO}/plugins/skill-heaven/dev.skill-heaven.pi/PROBE.md`,
    needsInstaller: true,
    commands: [`pi install "${AGENT_PLUGIN_INSTALL.plugin}" --approve`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then `pi update`.",
    remove: [`pi remove "${AGENT_PLUGIN_INSTALL.plugin}"`, AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "NATIVE SLOT",
    statusNote: "The pi-zero extension draws a widget; the canonical entropy line is not wired there yet.",
    launcher: "pi-zero",
  },
  {
    id: "grok",
    name: "Grok",
    bin: "grok",
    chip: "compatible",
    probedVersion: "1.0.5",
    evidence: "Live probe on 1.0.5; `grok plugin validate` also passes on 1.0.46 (static).",
    evidenceHref: `${REPO}/plugins/skill-heaven/PROBE.md`,
    needsInstaller: true,
    commands: [`grok plugin install "${AGENT_PLUGIN_INSTALL.plugin}" --trust`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then `grok plugin update`.",
    remove: ["grok plugin uninstall skill-heaven", AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "A command-backed status line is possible on Grok but not built.",
    launcher: "grok-zero",
  },
  {
    id: "hermes",
    name: "Hermes",
    bin: "hermes",
    chip: "compatible",
    probedVersion: "0.20.0",
    evidence: "Live probe: plugin installed and enabled, summon loaded a skill.",
    evidenceHref: `${REPO}/plugins/skill-heaven/PROBE.md`,
    needsInstaller: true,
    commands: [`hermes plugins install "file://${AGENT_PLUGIN_INSTALL.plugin}" --enable`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then reinstall in Hermes. Remove the Hermes registration with Hermes's own plugin manager.",
    // Hermes's own removal command was not verified on the machine that wrote
    // this table (its `--help` could not run), so none is printed.
    remove: [AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "Hermes has no stable public status contribution. Receipts print in the transcript.",
    launcher: "hermes-zero",
  },
  {
    id: "agy",
    name: "Antigravity",
    bin: "agy",
    chip: "partial",
    probedVersion: "1.3.1",
    evidence:
      "Static: `agy plugin validate` (1.3.1) loads the five skills and five commands but reports the MCP server as not found — /summon would have no tool. Needs a local probe.",
    evidenceHref: `${REPO}/docs/CONTROL-PLANE.md`,
    needsInstaller: true,
    commands: [],
    inHarness: false,
    blocked:
      "No registration command is printed until a logged-in probe shows Antigravity loading the summon server. The agy-zero launcher (probed on 1.2.13) gives a clean start meanwhile.",
    update: "—",
    remove: [AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "A stacked status command is the target; not built.",
    launcher: "agy-zero",
  },
  {
    id: "other",
    name: "Another Agent Plugins client",
    bin: null,
    chip: "unverified",
    probedVersion: null,
    evidence: "The package follows Agent Plugins 1.0.0. Your client owns registration; it has not been probed here.",
    evidenceHref: "https://agent-plugins.org/specification",
    needsInstaller: true,
    commands: [],
    inHarness: false,
    blocked: `Point your client's own plugin install at ${AGENT_PLUGIN_INSTALL.plugin}. There is no universal registration command.`,
    update: "Re-run the installer; your client may keep its own cached copy.",
    remove: [AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "Depends on your client.",
    launcher: null,
  },
];

export const CHIP_LABEL: Readonly<Record<VerificationChip, string>> = {
  verified: "Verified",
  compatible: "Compatible",
  partial: "Partial",
  unverified: "Unverified",
  "needs-local-probe": "Needs local probe",
};

export const CHIP_MEANING: Readonly<Record<VerificationChip, string>> = {
  verified: "A fresh install was verified end to end on the pinned version.",
  compatible: "A live probe passed on the pinned version. Yours may differ.",
  partial: "Part of the plugin loads; something is proven missing.",
  unverified: "Not probed. The package is portable; this client is untested.",
  "needs-local-probe": "Could not be established without a logged-in session.",
};

export function harnessById(id: HarnessId): HarnessPath {
  const found = HARNESS_PATHS.find((h) => h.id === id);
  if (!found) throw new Error(`unknown harness ${id}`);
  return found;
}
