// The harness compatibility table — one source for the site's /start chooser
// and the console's Trust section (docs/CONTROL-PLANE.md §5.4).
//
// Every row states the version that was actually probed and the evidence
// class. A version installed on a user's machine (or on the machine that wrote
// this table) is NOT the probed version unless the row says so. Commands are
// only ones the client accepted in a recorded probe (PRODUCT.md principle 7);
// where no accepted command exists, `commands` is empty and `blocked` says why.

import type { HostIntegration, VerificationChip } from "./model.js";
import type { ConsoleProjection } from "./console-host.js";

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

/** Where an install step is typed: inside the harness, or in a shell. */
export type StepWhere = "harness" | "shell";

/**
 * One registration step, in the harness's own terms. `run` may carry the
 * tokens `{{PLUGIN_DIR}}`, `{{MARKETPLACE_DIR}}` and `{{CONSOLE_DIR}}`; a
 * consumer substitutes the real staged paths (the installers) or the default
 * `$HOME/...` ones (the site). Nothing here is ever a command the client was
 * not seen to accept (PRODUCT.md principle 7).
 */
export interface InstallStep {
  where: StepWhere;
  run: string;
  /**
   * The same step as a shell command, when `run` is typed inside the harness
   * but the client also has a CLI for it (Claude's `/plugin install` is
   * `claude plugin install`). The installers' explicit `--register` executes
   * this form; the site prints `run`. Absent = `run` is already a shell command.
   */
  shell?: string;
  /** What this step changes, one line. */
  effect: string;
}

/** Register, update and unregister ONE piece (the runtime, or the console). */
export interface PieceSteps {
  register: readonly InstallStep[];
  update: readonly InstallStep[];
  remove: readonly InstallStep[];
}

/** The two install profiles (#191). Core = runtime only. Full = Core + the native console. */
export type ProfileId = "core" | "full";
export const PROFILES: readonly ProfileId[] = ["core", "full"];

export const PROFILE_PITCH: Readonly<Record<ProfileId, { name: string; line: string }>> = {
  core: { name: "Core", line: "The Skill Heaven runtime. Summon and the entropy controls. No extra console UI." },
  full: {
    name: "Full",
    line: "Core, plus the native Skill Heaven console for your harness — status, Lens, Session, Scope, Flow and Trust where the harness supports them.",
  },
};

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
  /** Should this path tell the user to run the terminal installer now? False
   * where installing would only strand files (no accepted registration yet). */
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
  /** The first summon, spelled the way a probe saw this client accept it. */
  firstRun: string;
  /** What Full adds on this harness: the console projection (#191). */
  console: ConsoleProjection;
  /**
   * The runtime piece (Core). `commands` / `update` / `remove` above are the
   * rendered, default-path form of this piece.
   */
  core: PieceSteps;
  /**
   * The console piece (Full = Core + this). `null` means Full cannot be
   * registered safely on this harness; the installer then fails closed and
   * says `fullBlocked` rather than falling back to Core and calling it Full.
   */
  consolePiece: PieceSteps | null;
  fullBlocked: string | null;
}

// TEMPORARY (removed once the per-harness recon lands): keeps the table typed while entries are authored.
const PENDING = (name: string): Pick<HarnessPath, "console" | "core" | "consolePiece" | "fullBlocked"> => ({
  console: {
    kind: "command-backed",
    mechanism: `pending recon for ${name}`,
    command: null,
    commandPrefix: "",
    surfaces: {
      status: { level: "unsupported", via: "pending", note: "pending" },
      lens: { level: "unsupported", via: "pending", note: "pending" },
      session: { level: "unsupported", via: "pending", note: "pending" },
      scope: { level: "unsupported", via: "pending", note: "pending" },
      flow: { level: "unsupported", via: "pending", note: "pending" },
      trust: { level: "unsupported", via: "pending", note: "pending" },
    },
    observes: { summon: "unavailable", read: "unavailable", agents: "unavailable", rung: "unavailable" },
    summonTools: [],
    trust: [],
    probe: { version: null, summary: "pending", href: null },
  },
  core: { register: [], update: [], remove: [] },
  consolePiece: null,
  fullBlocked: "pending recon",
});

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
      "The optional console (preview) adds a status entry beside yours — it never replaces your statusLine. Probed live in the terminal on 2.1.294; its desktop paint is not probed.",
    launcher: "claude-zero",
    // 2.1.294 refuses a bare /summon: it resolves to the portable skill, which is user-invocable: false.
    firstRun: "/skill-heaven:summon <what you need>",
    console: {
      kind: "pane",
      mechanism:
        "Claude Code's Mods API (function hooks, early access since 2.1.293): $.ui.status appends a status entry beside your own, an AbovePrompt band carries Lens, and /heaven opens a pane with Session, Scope, Flow and Trust.",
      command: "/heaven",
      commandPrefix: "skill-heaven:",
      surfaces: {
        status: { level: "native", via: "$.ui.status (APPEND — never touches statusLine)", note: "Probed live in the terminal on 2.1.294; desktop paint is not probed." },
        lens: { level: "native", via: "AbovePrompt band + $.prompt.fill", note: "A button only pre-fills the prompt; you press Enter." },
        session: { level: "native", via: "the /heaven pane", note: "Every field carries an evidence class." },
        scope: { level: "native", via: "the /heaven pane", note: "Rung controls pre-fill commands; nothing runs until you submit." },
        flow: { level: "native", via: "agentId on tool.call and turn.complete", note: "Only agents the host reported appear." },
        trust: { level: "native", via: "the /heaven pane", note: "Lists what the console reads and writes; it does not rate it." },
      },
      observes: { summon: "observed", read: "observed", agents: "observed", rung: "observed" },
      summonTools: ["mcp__plugin_skill-heaven_skill-summon__summon", "mcp__skill-summon__summon"],
      trust: [
        {
          id: "skill-heaven",
          profile: "core",
          kind: "Claude Code plugin",
          version: "0.1.2",
          summary: "The runtime: five commands and one bundled MCP server (skill-summon).",
          reads: ["the skill source you configure (network, by the summon tool)"],
          writes: ["a disposable session directory under your temp dir"],
          network: "the summon tool fetches the skill source",
          disable: "claude plugin uninstall skill-heaven@gaia-skill-heaven",
        },
        {
          id: "skill-heaven-console",
          profile: "full",
          kind: "Claude Code plugin (Mods, preview)",
          version: "0.1.0",
          summary: "The console: a status entry, the Lens band and the /heaven pane. Runs inside Claude Code as local code.",
          notes: ["/lens and /heaven print a one-line result that the model can read. It is fixed text and carries nothing a skill source supplied."],
          reads: ["summon tool results", "your /skill-* commands", "Read and Agent tool calls — to observe, never to change"],
          writes: ["nothing to disk", "session-only $.state"],
          network: "none of its own; /lens calls the bundled summon tool, which fetches the skill source",
          disable: "claude plugin uninstall skill-heaven-console@gaia-skill-heaven",
        },
      ],
      probe: {
        version: "2.1.294",
        summary: "the console was probed live in the terminal on 2.1.294; desktop paint is not probed",
        href: `${REPO}/plugins/skill-heaven-console/README.md`,
      },
    },
    core: {
      register: [
        { where: "harness", run: "/plugin marketplace add gaia-research/gaia-skill-heaven", shell: "claude plugin marketplace add gaia-research/gaia-skill-heaven", effect: "adds the gaia-skill-heaven marketplace to Claude Code's plugin registry" },
        { where: "harness", run: "/plugin install skill-heaven@gaia-skill-heaven", shell: "claude plugin install skill-heaven@gaia-skill-heaven", effect: "installs the skill-heaven plugin (runtime only)" },
      ],
      update: [
        { where: "shell", run: "claude plugin marketplace update gaia-skill-heaven", effect: "refreshes the marketplace listing" },
        { where: "shell", run: "claude plugin update skill-heaven@gaia-skill-heaven", effect: "updates the plugin to the listed version" },
      ],
      remove: [{ where: "shell", run: "claude plugin uninstall skill-heaven@gaia-skill-heaven", effect: "removes the plugin" }],
    },
    consolePiece: {
      register: [
        { where: "harness", run: "/plugin install skill-heaven-console@gaia-skill-heaven", shell: "claude plugin install skill-heaven-console@gaia-skill-heaven", effect: "installs the console plugin beside skill-heaven" },
      ],
      update: [{ where: "shell", run: "claude plugin update skill-heaven-console@gaia-skill-heaven", effect: "updates the console plugin" }],
      remove: [{ where: "shell", run: "claude plugin uninstall skill-heaven-console@gaia-skill-heaven", effect: "removes only the console; skill-heaven is unchanged" }],
    },
    fullBlocked: null,
  },
  {
    id: "codex",
    ...PENDING("Codex"),
    name: "Codex",
    bin: "codex",
    chip: "compatible",
    probedVersion: "0.161.0",
    evidence:
      "Live smoke on 0.161.0: plugin added, codex mcp list resolves skill-summon, a summon call completed. Headless codex exec asks approval for MCP calls. Surfaces last probed on 0.146.0.",
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
    firstRun: "/summon <what you need>",
  },
  {
    id: "pi",
    ...PENDING("Pi"),
    name: "Pi",
    bin: "pi",
    chip: "compatible",
    probedVersion: "1.0.4",
    evidence:
      "Live probe on 1.0.4: pi install, five commands, summon materialized a skill, the four surfaces expanded. The adapter keeps its own summon tool rather than Pi's MCP runtime, which an MCP extension can replace.",
    evidenceHref: `${REPO}/plugins/skill-heaven/dev.skill-heaven.pi/PROBE.md`,
    needsInstaller: true,
    commands: [`pi install "${AGENT_PLUGIN_INSTALL.plugin}" --approve`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then pi update.",
    remove: [`pi remove "${AGENT_PLUGIN_INSTALL.plugin}"`, AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "NATIVE SLOT",
    statusNote:
      "Pi's status API takes the canonical entropy line (probed on 1.0.4, appended under its own key); the plugin does not draw it yet. The pi-zero extension draws a widget.",
    launcher: "pi-zero",
    firstRun: "/summon <what you need>",
  },
  {
    id: "grok",
    ...PENDING("Grok"),
    name: "Grok",
    bin: "grok",
    chip: "compatible",
    probedVersion: "1.0.5",
    evidence:
      "Live probe on 1.0.5. On 1.0.46, grok plugin install and details find the skills, commands and MCP server (static: no signed-in session to run a summon).",
    evidenceHref: `${REPO}/plugins/skill-heaven/PROBE.md`,
    needsInstaller: true,
    commands: [`grok plugin install "${AGENT_PLUGIN_INSTALL.plugin}" --trust`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then grok plugin update.",
    remove: ["grok plugin uninstall skill-heaven", AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "A command-backed status line is possible on Grok but not built.",
    launcher: "grok-zero",
    firstRun: "/summon <what you need>",
  },
  {
    id: "hermes",
    ...PENDING("Hermes"),
    name: "Hermes",
    bin: "hermes",
    chip: "compatible",
    probedVersion: "0.20.0",
    evidence: "Live probe, repeated on 0.20.0 (2026-10-08): plugin installed and enabled, a summon call completed.",
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
    firstRun: "/summon <what you need>",
  },
  {
    id: "agy",
    ...PENDING("Antigravity"),
    name: "Antigravity",
    bin: "agy",
    chip: "compatible",
    probedVersion: "1.3.1",
    evidence:
      "Live probe on 1.3.1 with your real HOME: agy plugin install loads the skills, commands and the summon server; /skill-heaven:summon and the four surfaces ran.",
    evidenceHref: `${REPO}/packages/agy-zero/PROBE.md`,
    needsInstaller: true,
    commands: [`agy plugin install "${AGENT_PLUGIN_INSTALL.plugin}"`],
    inHarness: false,
    blocked: null,
    update: "Re-run the installer, then agy plugin uninstall skill-heaven and install it again — Antigravity keeps its own copy.",
    remove: ["agy plugin uninstall skill-heaven", AGENT_PLUGIN_INSTALL.uninstall],
    statusIntegration: "UNSUPPORTED",
    statusNote: "A stacked status command is the target; not built.",
    launcher: "agy-zero",
    // Antigravity namespaces plugin skills: its / menu lists /skill-heaven:summon, and a bare /summon is not a command.
    firstRun: "/skill-heaven:summon <what you need>",
  },
  {
    id: "other",
    ...PENDING("Another"),
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
    firstRun: "/summon <what you need>, or the spelling your client lists for the skill-heaven plugin",
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
