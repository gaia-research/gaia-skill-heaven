// The installer's onboarding epilogue (docs/CONTROL-PLANE.md section 1 and 5.4,
// issues #161 / #147 / #94). Runs the real install-agent-plugin.sh against a
// local source archive with a SEALED PATH so the tests do not depend on which
// harnesses happen to be installed on the host, and so a harness binary being
// executed is observable (the stubs fail loudly and leave a marker).
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AGENT_PLUGIN_INSTALL,
  CHIP_LABEL,
  HARNESS_PATHS,
} from "../packages/status/src/compat.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SH_INSTALLER = join(REPO, "install-agent-plugin.sh");
const PS1_INSTALLER = join(REPO, "install-agent-plugin.ps1");
const START_URL = "https://gaia-research.github.io/gaia-skill-heaven/#/start";

// Everything the installer (and the git it drives) needs; nothing else is on PATH.
const TOOLS = [
  "node", "curl", "tar", "mktemp", "git", "dirname", "basename", "mkdir", "cp", "mv", "rm",
  "touch", "chmod", "cat", "sh", "env", "sed", "grep", "awk", "ls", "head", "tr", "uname",
  "id", "ln", "readlink", "sort", "cut", "date", "sleep", "find", "xargs", "gzip", "gunzip",
  "wc", "expr", "pwd",
];

let root: string;
let archive: string;

function which(tool: string): string | null {
  const r = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
  const p = r.stdout.trim();
  return r.status === 0 && p.startsWith("/") ? p : null;
}

function makeSealedBin(dir: string): string {
  mkdirSync(dir, { recursive: true });
  for (const tool of TOOLS) {
    const real = which(tool);
    if (real) symlinkSync(real, join(dir, tool));
  }
  return dir;
}

/** Stub harnesses that must never run: executing one fails and leaves a marker. */
function addStubs(dir: string, names: string[], marker: string): void {
  for (const name of names) {
    const stub = join(dir, name);
    writeFileSync(
      stub,
      `#!/bin/sh\necho "${name} was executed: $*" >> '${marker}'\necho "STUB ${name} MUST NOT BE EXECUTED" >&2\nexit 97\n`,
    );
    chmodSync(stub, 0o755);
  }
}

function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      out.push(relative(dir, full));
      if (lstatSync(full).isDirectory()) walk(full);
    }
  };
  walk(dir);
  return out.sort();
}

interface Run {
  stdout: string;
  stderr: string;
  status: number | null;
  home: string;
  installHome: string;
  marketplace: string;
  plugin: string;
  executed: string[];
}

function runInstaller(opts: {
  harnesses?: string[];
  args?: string[];
  shell?: string;
  installHomeOverride?: boolean;
}): Run {
  const dir = mkdtempSync(join(root, "run-"));
  const home = join(dir, "home");
  mkdirSync(home, { recursive: true });
  const bin = makeSealedBin(join(dir, "bin"));
  const marker = join(dir, "executed.log");
  addStubs(bin, opts.harnesses ?? [], marker);
  // Default location: $HOME/.local/share/gaia-skill-heaven-agent-plugin.
  const installHome = opts.installHomeOverride
    ? join(dir, "custom location", "plugin home")
    : join(home, ".local", "share", "gaia-skill-heaven-agent-plugin");
  const env: Record<string, string> = {
    PATH: bin,
    HOME: home,
    SKILL_HEAVEN_ARCHIVE_URL: `file://${archive}`,
    SKILL_HEAVEN_REF: "probe",
  };
  if (opts.installHomeOverride) env.SKILL_HEAVEN_PLUGIN_HOME = installHome;
  const r = spawnSync(opts.shell ?? "/bin/sh", [SH_INSTALLER, ...(opts.args ?? [])], {
    encoding: "utf8",
    env,
  });
  const marketplace = join(installHome, "marketplace");
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    status: r.status,
    home,
    installHome,
    marketplace,
    plugin: join(marketplace, "plugins", "skill-heaven"),
    executed: existsSync(marker) ? readFileSync(marker, "utf8").trim().split("\n") : [],
  };
}

/** The epilogue only: everything from "Installed the portable". */
function epilogue(stdout: string): string {
  const i = stdout.indexOf("Installed the portable Skill Heaven Agent Plugin.");
  expect(i).toBeGreaterThanOrEqual(0);
  return stdout.slice(i);
}

/** The lines of one section, from its heading to the next blank line. */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start, `missing section "${heading}"`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start);
  const end = rest.indexOf("\n\n");
  return end === -1 ? rest : rest.slice(0, end);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "skill-heaven-epilogue-"));
  const archiveRoot = join(root, "archive", "gaia-skill-heaven-probe");
  mkdirSync(archiveRoot, { recursive: true });
  cpSync(join(REPO, "plugins"), join(archiveRoot, "plugins"), { recursive: true });
  cpSync(join(REPO, ".claude-plugin"), join(archiveRoot, ".claude-plugin"), { recursive: true });
  archive = join(root, "source.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", join(root, "archive"), "gaia-skill-heaven-probe"]);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("install-agent-plugin.sh onboarding epilogue", () => {
  it("lists the harnesses found, with chip + probed version and the real, copy-pasteable commands", () => {
    const run = runInstaller({ harnesses: ["claude", "codex"], installHomeOverride: true });
    expect(run.status).toBe(0);
    const out = epilogue(run.stdout);

    const found = section(out, "Harnesses found on PATH");
    expect(found).toMatch(/claude\s+Claude Code - Verified \(2\.1\.288\)/);
    expect(found).toContain("Inside Claude Code, type:");
    expect(found).toContain("/plugin marketplace add gaia-research/gaia-skill-heaven");
    expect(found).toContain("/plugin install skill-heaven@gaia-skill-heaven");
    expect(found).toMatch(/codex\s+Codex - Compatible \(probed 0\.146\.0\)/);
    // The override location (with a space in it) is substituted, quoted.
    expect(run.marketplace).toContain(" ");
    expect(found).toContain(`codex plugin marketplace add "${run.marketplace}"`);
    expect(found).toContain("codex plugin add skill-heaven@gaia-skill-heaven");
    // Not-installed harnesses are not offered commands.
    expect(found).not.toMatch(/\bagy\b/);
    expect(found).not.toContain("pi install");
    expect(found).not.toContain("grok plugin install");
    expect(found).not.toContain("hermes plugins install");
    expect(found).not.toContain("(none found)");

    expect(section(out, "Not found:")).toBe("Not found: pi, grok, hermes, agy");
    // What changed + update/remove/first-run/choose.
    const changed = section(out, "What changed on this machine");
    expect(changed).toContain(`+ ${run.plugin}`);
    expect(changed).toContain(`+ ${run.marketplace}`);
    expect(changed).toContain("No harness was installed or reconfigured.");
    expect(out).toContain("First run: inside your harness, type /summon <what you need>.");
    expect(out).toContain("Update:    re-run this installer");
    expect(out).toContain(`Remove:    ${run.installHome}/uninstall.sh`);
    expect(out).toContain(`Choose your harness and read what each step does: ${START_URL}`);
    // The remove command that is printed actually exists.
    expect(existsSync(join(run.installHome, "uninstall.sh"))).toBe(true);
  }, 30_000);

  it("prints plugin-directory commands for pi, grok and hermes with the real plugin dir", () => {
    const run = runInstaller({ harnesses: ["pi", "grok", "hermes"], installHomeOverride: true });
    expect(run.status).toBe(0);
    const found = section(epilogue(run.stdout), "Harnesses found on PATH");
    expect(found).toContain(`pi install "${run.plugin}" --approve`);
    expect(found).toContain(`grok plugin install "${run.plugin}" --trust`);
    expect(found).toContain(`hermes plugins install "file://${run.plugin}" --enable`);
    expect(found).toMatch(/pi\s+Pi - Compatible \(probed 0\.84\.2\)/);
    expect(found).toMatch(/grok\s+Grok - Compatible \(probed 1\.0\.5\)/);
    expect(found).toMatch(/hermes\s+Hermes - Compatible \(probed 0\.20\.0\)/);
  }, 30_000);

  it("reports a Partial harness honestly: no command, blocked text, never executed", () => {
    const run = runInstaller({ harnesses: ["agy"] });
    expect(run.status).toBe(0);
    const out = epilogue(run.stdout);
    const found = section(out, "Harnesses found on PATH");
    expect(found).toMatch(/agy\s+Antigravity - Partial \(static check on 1\.3\.1\)/);
    expect(found).toContain(
      "No registration command is printed until a logged-in probe shows Antigravity loading the summon server.",
    );
    expect(found).not.toMatch(/agy plugin/);
    expect(section(out, "Not found:")).toBe("Not found: claude, codex, pi, grok, hermes");
    expect(run.executed).toEqual([]);
  }, 30_000);

  it("with no harness on PATH says so honestly and never offers to install one", () => {
    const run = runInstaller({});
    expect(run.status).toBe(0);
    const out = epilogue(run.stdout);
    expect(out).toContain("(none found)");
    expect(out).toContain(
      "No supported harness was found on PATH. Skill Heaven runs inside a harness you already use; it never installs one.",
    );
    expect(out).toContain(`When you have one, run its command from ${START_URL}`);
    expect(section(out, "Not found:")).toBe("Not found: claude, codex, pi, grok, hermes, agy");
    // No per-harness commands at all.
    for (const cmd of ["/plugin install", "codex plugin", "pi install", "grok plugin", "hermes plugins"]) {
      expect(out).not.toContain(cmd);
    }
    // The always-true generic client line is still there.
    expect(out).toContain("Another Agent Plugins client (Unverified)");
    expect(out).toContain(`Point your client's own plugin install at ${run.plugin}.`);
  }, 30_000);

  it("never executes a harness binary and writes nothing outside the install home", () => {
    const run = runInstaller({ harnesses: ["claude", "codex", "pi", "grok", "hermes", "agy"] });
    expect(run.status).toBe(0);
    expect(run.executed).toEqual([]);
    expect(run.stderr).not.toContain("MUST NOT BE EXECUTED");

    // HOME started empty (runInstaller creates it fresh), so everything in it is a write.
    const owned = join(".local", "share", "gaia-skill-heaven-agent-plugin");
    const ancestors = new Set([".local", join(".local", "share")]);
    for (const entry of listTree(run.home)) {
      const ok = ancestors.has(entry) || entry === owned || entry.startsWith(owned + "/");
      expect(ok, `unexpected write outside the install home: ${entry}`).toBe(true);
    }
    // No staging leftovers next to the install home either.
    expect(readdirSync(join(run.home, ".local", "share"))).toEqual([
      "gaia-skill-heaven-agent-plugin",
    ]);
    // No harness configuration was created.
    for (const name of [".claude", ".codex", ".pi", ".grok", ".hermes", ".config", ".claude.json"]) {
      expect(existsSync(join(run.home, name))).toBe(false);
    }
  }, 30_000);

  it("--quiet prints only the plugin and marketplace directories, one per line", () => {
    const run = runInstaller({ harnesses: ["claude"], args: ["--quiet"], installHomeOverride: true });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${run.plugin}\n${run.marketplace}\n`);
    expect(run.stderr).toBe("");
    expect(run.executed).toEqual([]);
    expect(existsSync(join(run.plugin, "plugin.json"))).toBe(true);
  }, 30_000);

  it("keeps --print-path and --help working, documents --quiet, rejects unknown flags", () => {
    const printed = runInstaller({ args: ["--print-path"], installHomeOverride: true });
    expect(printed.stdout).toBe(`${printed.plugin}\n`);
    const quietPrint = runInstaller({ args: ["--quiet", "--print-path"], installHomeOverride: true });
    expect(quietPrint.stdout).toBe(`${quietPrint.plugin}\n`);

    const help = runInstaller({ args: ["--help"] });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--quiet");
    expect(help.stdout).toContain("--print-path");
    expect(help.stdout).toContain("--uninstall");
    expect(help.stdout).toContain("never runs one");

    const bad = runInstaller({ args: ["--nope"] });
    expect(bad.status).not.toBe(0);
  }, 30_000);

  it("emits no colour escape sequences", () => {
    const run = runInstaller({ harnesses: ["claude"] });
    expect(run.stdout).not.toContain("\u001b[");
  }, 30_000);

  for (const shell of ["/usr/bin/dash", "/usr/bin/bash"]) {
    it.skipIf(!existsSync(shell))(`produces the same epilogue under ${shell}`, () => {
      const run = runInstaller({ harnesses: ["claude", "codex"], shell, installHomeOverride: true });
      expect(run.status).toBe(0);
      const out = epilogue(run.stdout);
      expect(section(out, "Harnesses found on PATH")).toContain(
        `codex plugin marketplace add "${run.marketplace}"`,
      );
      expect(section(out, "Not found:")).toBe("Not found: pi, grok, hermes, agy");
      expect(run.executed).toEqual([]);
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// Drift: both scripts mirror packages/status/src/compat.ts (HARNESS_PATHS).
// The scripts cannot import it, so this is the guard.
// ---------------------------------------------------------------------------

/** Turn a compat.ts template into the form the scripts print: $HOME paths -> variables. */
function toScriptForm(template: string): string {
  return template
    .replaceAll(AGENT_PLUGIN_INSTALL.plugin, "$PLUGIN_DIR")
    .replaceAll(AGENT_PLUGIN_INSTALL.marketplace, "$MARKETPLACE_DIR")
    .replaceAll(AGENT_PLUGIN_INSTALL.root, "$INSTALL_HOME");
}

/** Drop the string-escape of an inner double quote (\" in sh, `" in PowerShell). */
function unescapeQuotes(source: string): string {
  return source.replaceAll('\\"', '"').replaceAll('`"', '"');
}

describe("installer epilogue vs packages/status/src/compat.ts (drift)", () => {
  const sh = unescapeQuotes(readFileSync(SH_INSTALLER, "utf8"));
  const ps1 = unescapeQuotes(readFileSync(PS1_INSTALLER, "utf8"));
  const detectable = HARNESS_PATHS.filter((h) => h.bin !== null);
  const scripts = [
    { label: "install-agent-plugin.sh", text: sh, isPs1: false },
    { label: "install-agent-plugin.ps1", text: ps1, isPs1: true },
  ];

  it("the table still has the shape the epilogue relies on", () => {
    expect(detectable.map((h) => h.id)).toEqual(["claude", "codex", "pi", "grok", "hermes", "agy"]);
    expect(HARNESS_PATHS.filter((h) => h.bin === null).map((h) => h.id)).toEqual(["other"]);
  });

  for (const { label, text, isPs1 } of scripts) {
    describe(label, () => {
      for (const h of detectable) {
        it(`${h.id}: name, chip, probed version and detection by name`, () => {
          const chip = CHIP_LABEL[h.chip];
          const lines = text.split("\n").filter((l) => l.includes(`"${h.name}"`) && l.includes(chip));
          expect(lines.length, `no line carries both "${h.name}" and "${chip}"`).toBeGreaterThan(0);
          if (h.probedVersion) {
            const expected =
              h.chip === "verified"
                ? `${chip} (${h.probedVersion})`
                : h.chip === "partial"
                  ? `${chip} (static check on ${h.probedVersion})`
                  : `${chip} (probed ${h.probedVersion})`;
            expect(
              lines.some((l) => l.includes(expected)),
              `expected "${expected}"`,
            ).toBe(true);
          }
          expect(text).toContain(isPs1 ? `Test-Harness "${h.bin}"` : `have ${h.bin}`);
        });

        it(`${h.id}: every registration command and blocked sentence`, () => {
          for (const command of h.commands) {
            expect(text, `missing command: ${toScriptForm(command)}`).toContain(toScriptForm(command));
          }
          if (h.blocked) {
            for (const sentence of h.blocked.split(/(?<=\.) /)) {
              expect(text, `missing blocked text: ${sentence}`).toContain(toScriptForm(sentence));
            }
          }
          if (h.commands.length === 0) {
            expect(h.blocked, `${h.id} has no commands and no blocked text`).not.toBeNull();
          }
        });
      }

      it("the generic-client lines, uninstall path and /start URL match", () => {
        const other = HARNESS_PATHS.find((h) => h.id === "other")!;
        expect(text).toContain(`${other.name.replace("Another Agent Plugins client", "Another Agent Plugins client")} (${CHIP_LABEL[other.chip]})`);
        expect(text).toContain(
          toScriptForm(`Point your client's own plugin install at ${AGENT_PLUGIN_INSTALL.plugin}.`),
        );
        expect(text).toContain("There is no universal registration command.");
        expect(text).toContain(START_URL);
        expect(text).toContain(
          isPs1 ? "$INSTALL_HOME\\uninstall.ps1" : toScriptForm(AGENT_PLUGIN_INSTALL.uninstall),
        );
      });

      it("never runs a harness and offers no npm/npx route", () => {
        for (const h of detectable) {
          expect(text).not.toMatch(new RegExp(`\\b${h.bin}\\s+(--version|-v|--help)`));
        }
        expect(text).not.toMatch(/\bnpx\b|npm install|skill-heaven\.dev/);
      });
    });
  }

  it("PowerShell has the new surface: -Quiet, Test-Harness, the same section copy", () => {
    expect(ps1).toContain("[switch]$Quiet");
    expect(ps1).toContain("Get-Command $Bin -CommandType Application,ExternalScript -ErrorAction SilentlyContinue");
    for (const copy of [
      "Installed the portable Skill Heaven Agent Plugin.",
      "What changed on this machine",
      "No harness was installed or reconfigured.",
      "Harnesses found on PATH",
      "(none found)",
      "No supported harness was found on PATH. Skill Heaven runs inside a harness you already use; it never installs one.",
      "Not found: ",
      "First run: inside your harness, type /summon <what you need>.",
      "Update:    re-run this installer",
      "Remove:    ",
    ]) {
      expect(ps1).toContain(copy);
      expect(sh).toContain(copy);
    }
  });

  it.skipIf(!which("pwsh"))("PowerShell parses and prints its help (only where pwsh exists)", () => {
    const r = spawnSync("pwsh", ["-NoProfile", "-File", PS1_INSTALLER, "-Help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("-Quiet");
  });
});
