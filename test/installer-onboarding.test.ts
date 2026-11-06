// Issue #147 — first-run onboarding in install.sh. The installer never prompts,
// so the same text must appear whether stdout is a TTY or not; only the closing
// line differs. These tests run the REAL script: --onboarding alone, and a full
// install against a local archive with a stubbed npm and a sealed PATH (no
// claude, so nothing outside the temp HOME is touched).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL_SH = join(REPO, "install.sh");
const INSTALL_PS1 = readFileSync(join(REPO, "install.ps1"), "utf8");
let root: string;
let archive: string;

const DOORS = ["claude", "pi", "codex", "hermes", "grok", "agy"];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sh-onboard-"));
  const src = join(root, "archive", "source");
  for (const d of DOORS) {
    mkdirSync(join(src, "packages", `${d}-zero`, "bin"), { recursive: true });
    writeFileSync(join(src, "packages", `${d}-zero`, "bin", `${d}-zero.mjs`), "#!/usr/bin/env node\n");
  }
  archive = join(root, "source.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", join(root, "archive"), "source"]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  home: string;
  installHome: string;
}

function sealedPath(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of ["node", "curl", "tar", "mktemp", "dirname", "mkdir", "ln", "cat", "chmod", "rm", "mv", "touch", "grep", "sh", "gzip"]) {
    const real = execFileSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
    symlinkSync(real, join(bin, tool));
  }
  // npm ci would hit the network; the onboarding does not depend on it.
  writeFileSync(join(bin, "npm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return bin;
}

function install(args: string[], env: Record<string, string> = {}): Run {
  const dir = mkdtempSync(join(root, "run-"));
  const home = join(dir, "home");
  mkdirSync(home);
  const installHome = join(home, "skill-heaven");
  const r = spawnSync("/bin/sh", [INSTALL_SH, ...args], {
    encoding: "utf8",
    input: "", // closed stdin: must not wait for anything
    timeout: 60_000,
    env: {
      PATH: sealedPath(dir),
      HOME: home,
      SKILL_HEAVEN_HOME: installHome,
      XDG_BIN_HOME: join(home, "ubin"),
      SKILL_HEAVEN_ARCHIVE_URL: `file://${archive}`,
      ...env,
    },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, home, installHome };
}

const MUST_SAY = [
  "== Skill Heaven: first run ==",
  "Installed:",
  "Not installed:",
  "Claude Code or any other harness",
  "no edits to ~/.claude",
  "Default: the zero rung",
  "zero . low . med . high . xhigh . max . ultra",
  "/skill-heaven (converge)",
  "/skill-hell (explore)",
  "claude-zero --print",
  "claude-zero --tools minimal --print",
  "claude-zero --remove-tools Bash,WebFetch",
  "mcp__skill-summon__summon",
  "Built-in tools and MCP tools are separate",
  "Change or reverse it: launch again without --tools/--remove-tools",
  "Uninstall:",
];

describe("install.sh --onboarding (guide only, no install)", () => {
  it("prints every required section and installs nothing", () => {
    const r = install(["--onboarding"]);
    expect(r.status, r.stderr).toBe(0);
    for (const s of MUST_SAY) expect(r.stdout, s).toContain(s);
    expect(r.stdout).toContain(`${r.installHome}/uninstall.sh`);
    expect(existsSync(r.installHome)).toBe(false);
  });
  it("non-interactive (flag, env, CI) says no prompts were used and offers no 'try it now'", () => {
    for (const r of [
      install(["--onboarding", "--non-interactive"]),
      install(["--onboarding"], { SKILL_HEAVEN_NONINTERACTIVE: "1" }),
      install(["--onboarding"], { CI: "true" }),
      install(["--onboarding", "--yes"]),
      install(["--onboarding"]), // spawnSync pipes stdout: not a TTY
    ]) {
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("Non-interactive install: no prompts were used.");
      expect(r.stdout).not.toContain("Try it now");
    }
  });
  it("--interactive forces the interactive wording", () => {
    const r = install(["--onboarding", "--interactive"]);
    expect(r.stdout).toContain("Try it now: run  claude-zero --print  first, then  claude-zero");
    expect(r.stdout).not.toContain("Non-interactive install");
  });
  it("rejects unknown flags", () => {
    const r = install(["--surprise"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("unknown argument: --surprise");
  });
});

describe("install.sh full install carries the onboarding", () => {
  it("non-interactive: installs from a closed stdin, ends with the guide, then the completion line", () => {
    const r = install(["--non-interactive"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    for (const s of MUST_SAY) expect(r.stdout, s).toContain(s);
    expect(r.stdout.indexOf("== Skill Heaven: first run ==")).toBeLessThan(r.stdout.indexOf("Install complete."));
    expect(r.stdout).toContain("Claude Code was not detected, so no harness was installed");
    expect(existsSync(join(r.installHome, "uninstall.sh"))).toBe(true);
    expect(existsSync(join(r.installHome, "bin", "claude-zero"))).toBe(true);
    // P3: nothing was written under ~/.claude
    expect(existsSync(join(r.home, ".claude"))).toBe(false);
  }, 60_000);
  it("interactive wording on a full install", () => {
    const r = install(["--interactive"]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("Try it now");
    expect(r.stdout).not.toContain("Non-interactive install");
  }, 60_000);
  it("the uninstall command it prints actually removes the install", () => {
    const r = install(["--non-interactive"]);
    expect(r.status, r.stderr).toBe(0);
    const u = spawnSync("/bin/sh", [join(r.installHome, "uninstall.sh")], { encoding: "utf8", env: { PATH: join(dirname(r.home), "bin"), HOME: r.home } });
    expect(u.status, u.stderr).toBe(0);
    expect(existsSync(r.installHome)).toBe(false);
  }, 60_000);
});

describe("install.ps1 carries the same onboarding", () => {
  it("has -Onboarding / -NonInteractive and the same required guidance", () => {
    expect(INSTALL_PS1).toContain("[switch]$Onboarding");
    expect(INSTALL_PS1).toContain("[switch]$NonInteractive");
    expect(INSTALL_PS1).toContain("SKILL_HEAVEN_NONINTERACTIVE");
    for (const s of [
      "== Skill Heaven: first run ==",
      "Not installed:",
      "claude-zero --print",
      "claude-zero --tools minimal --print",
      "claude-zero --remove-tools Bash,WebFetch",
      "Built-in tools and MCP tools are separate",
      "launch again without --tools/--remove-tools",
      "Non-interactive install: no prompts were used.",
    ]) {
      expect(INSTALL_PS1, s).toContain(s);
    }
    expect(INSTALL_PS1.indexOf("Show-Onboarding\n  Say-Message \"Install complete.")).toBeGreaterThan(0);
  });
});
