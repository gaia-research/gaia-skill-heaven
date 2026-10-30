// Native Windows validation for install.ps1 and install-agent-plugin.ps1 (#94).
//
// Runs on Windows (`windows-latest` in CI) across both Windows PowerShell 5.1
// (`powershell.exe`) and PowerShell 7+ (`pwsh.exe`). Every test uses a
// disposable temp root, local HTTP server, and mock harness binaries — never
// mutating real user configuration or contacting production endpoints.

import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL_PS1 = join(REPO, "install.ps1");
const INSTALL_PLUGIN_PS1 = join(REPO, "install-agent-plugin.ps1");
const IS_WINDOWS = process.platform === "win32";

type PowerShellEngine = {
  id: "powershell" | "pwsh";
  label: string;
  bin: string;
};

type ProcResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

/**
 * Asynchronous process runner so the Vitest worker event loop (and both its
 * birpc `onTaskUpdate` heartbeat and the local HTTP fixture server) stays
 * responsive during multi-second PowerShell and `npm ci` runs.
 */
function runProcess(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; timeout?: number } = {},
): Promise<ProcResult> {
  return new Promise((resolveProc, rejectProc) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => outChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        child.kill();
      }, options.timeout);
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      rejectProc(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolveProc({
        status: code,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
      });
    });
  });
}

function detectEngines(): PowerShellEngine[] {
  if (!IS_WINDOWS) return [];
  const candidates: PowerShellEngine[] = [
    { id: "powershell", label: "Windows PowerShell 5.1 (powershell.exe)", bin: "powershell.exe" },
    { id: "pwsh", label: "PowerShell 7+ (pwsh.exe)", bin: "pwsh.exe" },
  ];
  return candidates.filter((engine) => {
    const probe = spawnSync(
      engine.bin,
      ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.Major"],
      { encoding: "utf8", timeout: 15_000 },
    );
    return probe.status === 0;
  });
}

const ENGINES = detectEngines();

describe.skipIf(!IS_WINDOWS)("native Windows PowerShell installers (#94)", () => {
  let root: string;
  let archiveZip: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "sh-win-installer-"));

    // Build a deterministic zip archive with a single top-level directory
    // (`gaia-skill-heaven-probe`) to exercise Expand-Archive + top-level unwrap.
    const stageTree = join(root, "archive-stage", "gaia-skill-heaven-probe");
    mkdirSync(stageTree, { recursive: true });
    for (const item of [
      "package.json",
      "package-lock.json",
      ".claude-plugin",
      "plugins",
      "scripts",
    ]) {
      cpSync(join(REPO, item), join(stageTree, item), { recursive: true });
    }
    for (const pkg of [
      "core",
      "status",
      "claude-zero",
      "pi-zero",
      "codex-zero",
      "hermes-zero",
      "grok-zero",
      "agy-zero",
      "skill-summon",
    ]) {
      const srcPkg = join(REPO, "packages", pkg);
      if (!existsSync(srcPkg)) continue;
      const dstPkg = join(stageTree, "packages", pkg);
      mkdirSync(dstPkg, { recursive: true });
      for (const sub of ["package.json", "bin", "src", "skills"]) {
        const subPath = join(srcPkg, sub);
        if (existsSync(subPath)) {
          cpSync(subPath, join(dstPkg, sub), { recursive: true });
        }
      }
    }

    archiveZip = join(root, "source.zip");
    const zipRun = await runProcess(
      "pwsh.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Compress-Archive -LiteralPath $env:__SH_STAGE -DestinationPath $env:__SH_ZIP -Force",
      ],
      {
        env: { ...process.env, __SH_STAGE: stageTree, __SH_ZIP: archiveZip },
        timeout: 60_000,
      },
    );
    expect(zipRun.status, zipRun.stderr).toBe(0);
    expect(existsSync(archiveZip)).toBe(true);

    const installPs1Bytes = readFileSync(INSTALL_PS1);
    const installPluginPs1Bytes = readFileSync(INSTALL_PLUGIN_PS1);
    const archiveBytes = readFileSync(archiveZip);

    server = createServer((req, res) => {
      if (req.url === "/install.ps1") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(installPs1Bytes);
        return;
      }
      if (req.url === "/install-agent-plugin.ps1") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(installPluginPs1Bytes);
        return;
      }
      if (req.url === "/source.zip") {
        res.writeHead(200, { "content-type": "application/zip" });
        res.end(archiveBytes);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });

    await new Promise<void>((resolveListen) => {
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  function makeSandbox(label: string) {
    const dir = mkdtempSync(join(root, `${label}-`));
    const userProfile = join(dir, "User Space's Profile");
    const localAppData = join(userProfile, "AppData", "Local");
    const userBin = join(userProfile, ".local", "bin");
    const mockBin = join(dir, "mock-bin");
    const installHome = join(localAppData, "gaia-skill-heaven");
    const pluginHome = join(localAppData, "gaia-skill-heaven-agent-plugin");
    const claudeLog = join(dir, "claude-calls.jsonl");
    const claudeState = join(dir, "claude-state.json");
    mkdirSync(localAppData, { recursive: true });
    mkdirSync(userBin, { recursive: true });
    mkdirSync(mockBin, { recursive: true });
    writeFileSync(claudeLog, "");
    writeFileSync(claudeState, JSON.stringify({ marketplace: false, plugin: false }));

    const npmCache =
      process.env.NPM_CONFIG_CACHE ??
      process.env.npm_config_cache ??
      (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm-cache") : join(root, "npm-cache"));

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: userProfile,
      USERPROFILE: userProfile,
      LOCALAPPDATA: localAppData,
      NPM_CONFIG_CACHE: npmCache,
      npm_config_cache: npmCache,
      SKILL_HEAVEN_HOME: installHome,
      SKILL_HEAVEN_PLUGIN_HOME: pluginHome,
      SKILL_HEAVEN_ARCHIVE_URL: `${baseUrl}/source.zip`,
      SKILL_HEAVEN_REF: "probe",
      MOCK_CLAUDE_LOG: claudeLog,
      MOCK_CLAUDE_STATE: claudeState,
      // Include userBin on PATH so install.ps1 does not touch User registry PATH by default
      Path: `${mockBin};${userBin};${process.env.Path ?? process.env.PATH ?? ""}`,
      PATH: `${mockBin};${userBin};${process.env.Path ?? process.env.PATH ?? ""}`,
    };

    return {
      dir,
      userProfile,
      localAppData,
      userBin,
      mockBin,
      installHome,
      pluginHome,
      claudeLog,
      claudeState,
      baseEnv,
    };
  }

  function writeMockClaudeCmd(mockBin: string, mode: "working" | "broken" = "working"): void {
    const jsHelper = join(mockBin, "mock-claude.cjs");
    writeFileSync(
      jsHelper,
      [
        "const fs = require('node:fs');",
        "const args = process.argv.slice(2);",
        "const logFile = process.env.MOCK_CLAUDE_LOG;",
        "const stateFile = process.env.MOCK_CLAUDE_STATE;",
        "if (logFile) fs.appendFileSync(logFile, JSON.stringify({ argv: args }) + '\\n');",
        `if (${JSON.stringify(mode)} === 'broken') {`,
        "  process.stderr.write('claude: simulated missing native binary\\n');",
        "  process.exit(42);",
        "}",
        "const state = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { marketplace: false, plugin: false };",
        "if (args[0] === '--version') {",
        "  process.stdout.write('2.1.288 (mock)\\n');",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {",
        "  process.stdout.write(JSON.stringify(state.plugin ? [{ id: 'skill-heaven@gaia-skill-heaven', enabled: true }] : []) + '\\n');",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {",
        "  process.stdout.write(state.marketplace ? 'gaia-skill-heaven\\n' : '');",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {",
        "  state.marketplace = true;",
        "  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state));",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'install') {",
        "  state.plugin = true;",
        "  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state));",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'uninstall') {",
        "  state.plugin = false;",
        "  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state));",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'remove') {",
        "  state.marketplace = false;",
        "  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state));",
        "  process.exit(0);",
        "}",
        "process.exit(0);",
      ].join("\n"),
    );
    writeFileSync(
      join(mockBin, "claude.cmd"),
      `@echo off\r\n"${process.execPath}" "${jsHelper}" %*\r\n`,
      "ascii",
    );
  }

  async function compileMockClaudeExe(mockBin: string): Promise<string> {
    const jsHelper = join(mockBin, "mock-claude.cjs");
    if (!existsSync(jsHelper)) writeMockClaudeCmd(mockBin, "working");
    const csFile = join(mockBin, "MockClaude.cs");
    const exeFile = join(mockBin, "claude.exe");
    writeFileSync(
      csFile,
      [
        "using System;",
        "using System.Diagnostics;",
        "using System.IO;",
        "using System.Text;",
        "class Program {",
        "  static string Quote(string a) {",
        "    return \"\\\"\" + a.Replace(\"\\\"\", \"\\\\\\\"\") + \"\\\"\";",
        "  }",
        "  static int Main(string[] args) {",
        `    string node = ${JSON.stringify(process.execPath)};`,
        `    string script = ${JSON.stringify(jsHelper)};`,
        "    var sb = new StringBuilder();",
        "    sb.Append(Quote(script));",
        "    foreach (var a in args) { sb.Append(' '); sb.Append(Quote(a)); }",
        "    var psi = new ProcessStartInfo(node, sb.ToString()) { UseShellExecute = false };",
        "    var p = Process.Start(psi);",
        "    p.WaitForExit();",
        "    return p.ExitCode;",
        "  }",
        "}",
      ].join("\r\n"),
    );
    const cscCandidates = [
      "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
      "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
    ];
    const csc = cscCandidates.find((candidate) => existsSync(candidate));
    expect(csc, "csc.exe must exist on windows-latest").toBeDefined();
    const compile = await runProcess(csc!, ["/nologo", `/out:${exeFile}`, csFile], {
      timeout: 30_000,
    });
    expect(compile.status, compile.stderr || compile.stdout).toBe(0);
    rmSync(join(mockBin, "claude.cmd"), { force: true });
    return exeFile;
  }

  function readClaudeLog(logPath: string): Array<{ argv: string[] }> {
    const raw = readFileSync(logPath, "utf8").trim();
    return raw ? raw.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  }

  it("discovers both Windows PowerShell 5.1 (powershell.exe) and PowerShell 7+ (pwsh.exe) on the Windows runner", () => {
    expect(ENGINES.map((e) => e.id)).toEqual(["powershell", "pwsh"]);
  });

  describe.each(ENGINES)("[$id] $label", (engine) => {
    it("1. Piped execution (irm | iex) stages install-agent-plugin.ps1 without relying on $PSScriptRoot", async () => {
      const sb = makeSandbox(`irm-plugin-${engine.id}`);
      const run = await runProcess(
        engine.bin,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `irm '${baseUrl}/install-agent-plugin.ps1' | iex`,
        ],
        { env: sb.baseEnv, timeout: 60_000 },
      );
      expect(run.status, run.stderr || run.stdout).toBe(0);

      const pluginDir = join(sb.pluginHome, "marketplace", "plugins", "skill-heaven");
      expect(run.stdout).toContain("[1/4] Checking prerequisites...");
      expect(run.stdout).toContain("[4/4] Staging portable Agent Plugin artifact...");
      expect(run.stdout).toContain("No harness was installed or reconfigured.");
      expect(existsSync(join(pluginDir, "plugin.json"))).toBe(true);
      expect(existsSync(join(pluginDir, "mcp.json"))).toBe(true);
      expect(existsSync(join(pluginDir, "skills", "summon", "SKILL.md"))).toBe(true);
      expect(existsSync(join(pluginDir, "mcp", "skill-summon.mjs"))).toBe(true);
      expect(existsSync(join(sb.pluginHome, ".skill-heaven-agent-plugin-install"))).toBe(true);
      expect(existsSync(join(sb.pluginHome, "uninstall.ps1"))).toBe(true);
    }, 90_000);

    it("2. Direct execution & switch parameters (-Help, -PrintPath, -Quiet, -Profile, -Uninstall) and file:// archive work", async () => {
      const sb = makeSandbox(`params-plugin-${engine.id}`);
      const expectedPluginDir = join(sb.pluginHome, "marketplace", "plugins", "skill-heaven");
      const expectedMarketplaceDir = join(sb.pluginHome, "marketplace");

      const help = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1, "-Help"],
        { env: sb.baseEnv, timeout: 30_000 },
      );
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("Skill Heaven Agent Plugin - Core / Full");
      expect(help.stdout).toContain("Registered Full -> Core requires -Register.");
      expect(existsSync(sb.pluginHome)).toBe(false);

      const printPath = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1, "-PrintPath"],
        { env: sb.baseEnv, timeout: 30_000 },
      );
      expect(printPath.status, printPath.stderr).toBe(0);
      expect(printPath.stdout.trim()).toBe(expectedPluginDir);
      expect(existsSync(sb.pluginHome)).toBe(false);

      const fileUrl = new URL(`file:///${archiveZip.replace(/\\/g, "/")}`).href;
      const quiet = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1, "-Quiet"],
        {
          env: { ...sb.baseEnv, SKILL_HEAVEN_ARCHIVE_URL: fileUrl },
          timeout: 60_000,
        },
      );
      expect(quiet.status, quiet.stderr || quiet.stdout).toBe(0);
      expect(quiet.stdout.trim().split(/\r?\n/)).toEqual([expectedPluginDir, expectedMarketplaceDir]);
      expect(existsSync(join(expectedPluginDir, "plugin.json"))).toBe(true);

      const fullStage = await runProcess(
        engine.bin,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          INSTALL_PLUGIN_PS1,
          "-Profile",
          "full",
          "-Harness",
          "claude",
        ],
        { env: sb.baseEnv, timeout: 60_000 },
      );
      expect(fullStage.status, fullStage.stderr || fullStage.stdout).toBe(0);
      expect(existsSync(join(sb.pluginHome, "marketplace", "plugins", "skill-heaven-console", "hooks", "status-model.mjs"))).toBe(true);

      const unverified = join(sb.dir, "unverified-dir");
      mkdirSync(unverified, { recursive: true });
      writeFileSync(join(unverified, "keep.txt"), "keep");
      const refused = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1, "-Uninstall"],
        {
          env: { ...sb.baseEnv, SKILL_HEAVEN_PLUGIN_HOME: unverified },
          timeout: 30_000,
        },
      );
      expect(refused.status).not.toBe(0);
      expect(existsSync(join(unverified, "keep.txt"))).toBe(true);

      const uninstall = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1, "-Uninstall"],
        { env: sb.baseEnv, timeout: 30_000 },
      );
      expect(uninstall.status, uninstall.stderr || uninstall.stdout).toBe(0);
      expect(uninstall.stdout).toContain("Removed the local Skill Heaven Agent Plugin artifact");
      expect(existsSync(sb.pluginHome)).toBe(false);
    }, 120_000);

    it("3. Hermes local Git repository initialization & hostile global gitconfig isolation on Windows", async () => {
      const sb = makeSandbox(`hermes-git-${engine.id}`);
      const hooksDir = join(sb.dir, "hostile-hooks");
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 99\n");
      const hostileGitConfig = join(sb.dir, "hostile.gitconfig");
      writeFileSync(
        hostileGitConfig,
        `[commit]\n\tgpgsign = true\n[core]\n\thooksPath = ${hooksDir.replace(/\\/g, "/")}\n`,
      );

      const run = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1],
        {
          env: {
            ...sb.baseEnv,
            GIT_CONFIG_GLOBAL: hostileGitConfig,
            GIT_DIR: join(sb.dir, "wrong-git-dir"),
          },
          timeout: 60_000,
        },
      );
      expect(run.status, run.stderr || run.stdout).toBe(0);

      const pluginDir = join(sb.pluginHome, "marketplace", "plugins", "skill-heaven");
      const emptyGitConfig = join(sb.dir, "empty.gitconfig");
      writeFileSync(emptyGitConfig, "");
      const cleanGitEnv: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: emptyGitConfig,
        GIT_CONFIG_SYSTEM: emptyGitConfig,
      };
      for (const k of Object.keys(cleanGitEnv)) {
        if (k.startsWith("GIT_") && !["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"].includes(k)) {
          delete cleanGitEnv[k];
        }
      }

      const workTree = await runProcess("git", ["-C", pluginDir, "rev-parse", "--is-inside-work-tree"], {
        env: cleanGitEnv,
      });
      expect(workTree.status, workTree.stderr).toBe(0);
      expect(workTree.stdout.trim()).toBe("true");

      const author = await runProcess("git", ["-C", pluginDir, "log", "-1", "--format=%an <%ae>"], {
        env: cleanGitEnv,
      });
      expect(author.status, author.stderr).toBe(0);
      expect(author.stdout.trim()).toBe("Skill Heaven installer <installer@skill-heaven.invalid>");

      const tracked = await runProcess(
        "git",
        ["-C", pluginDir, "ls-files", "--error-unmatch", "plugin.json", "mcp.json", "skills/summon/SKILL.md", "mcp/skill-summon.mjs"],
        { env: cleanGitEnv },
      );
      expect(tracked.status, tracked.stderr).toBe(0);

      const hermesClone = join(sb.dir, "hermes-clone");
      const cloneRun = await runProcess(
        "git",
        ["-c", "core.longpaths=true", "clone", "--quiet", "--no-local", pluginDir, hermesClone],
        { env: cleanGitEnv },
      );
      expect(cloneRun.status, cloneRun.stderr).toBe(0);
      expect(existsSync(join(hermesClone, "plugin.json"))).toBe(true);
      expect(existsSync(join(hermesClone, "mcp", "skill-summon.mjs"))).toBe(true);
    }, 90_000);

    it("4. Claude Code integration in install-agent-plugin.ps1 works for both claude.cmd and claude.exe (-Register and -Uninstall -Register)", async () => {
      for (const binaryKind of ["cmd", "exe"] as const) {
        const sb = makeSandbox(`plugin-claude-${binaryKind}-${engine.id}`);
        if (binaryKind === "cmd") {
          writeMockClaudeCmd(sb.mockBin, "working");
        } else {
          await compileMockClaudeExe(sb.mockBin);
        }

        const stageOnly = await runProcess(
          engine.bin,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PLUGIN_PS1],
          { env: sb.baseEnv, timeout: 60_000 },
        );
        expect(stageOnly.status, stageOnly.stderr || stageOnly.stdout).toBe(0);
        expect(stageOnly.stdout).toContain("Claude Code");
        expect(readClaudeLog(sb.claudeLog)).toEqual([]);

        const reg = await runProcess(
          engine.bin,
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            INSTALL_PLUGIN_PS1,
            "-Profile",
            "core",
            "-Harness",
            "claude",
            "-Register",
          ],
          { env: sb.baseEnv, timeout: 60_000 },
        );
        expect(reg.status, reg.stderr || reg.stdout).toBe(0);
        const marketplaceDir = join(sb.pluginHome, "marketplace");
        expect(readClaudeLog(sb.claudeLog)).toEqual([
          { argv: ["plugin", "marketplace", "add", marketplaceDir] },
          { argv: ["plugin", "install", "skill-heaven@gaia-skill-heaven"] },
        ]);

        const uninstallPs1 = join(sb.pluginHome, "uninstall.ps1");
        const unreg = await runProcess(
          engine.bin,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", uninstallPs1],
          { env: sb.baseEnv, timeout: 60_000 },
        );
        expect(unreg.status, unreg.stderr || unreg.stdout).toBe(0);
        expect(existsSync(sb.pluginHome)).toBe(false);
        expect(readClaudeLog(sb.claudeLog).at(-1)).toEqual({
          argv: ["plugin", "uninstall", "skill-heaven@gaia-skill-heaven"],
        });
      }
    }, 180_000);

    it("5. install.ps1 piped execution (irm | iex), claude.cmd auto-registration, idempotent update, door .cmd execution, and uninstall", async () => {
      const sb = makeSandbox(`doors-full-${engine.id}`);
      writeMockClaudeCmd(sb.mockBin, "working");

      const first = await runProcess(
        engine.bin,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `irm '${baseUrl}/install.ps1' | iex`,
        ],
        { env: sb.baseEnv, timeout: 120_000 },
      );
      expect(first.status, first.stderr || first.stdout).toBe(0);
      expect(first.stdout).toContain("[1/5] Checking prerequisites...");
      expect(first.stdout).toContain("[5/5] Installing launcher runtime dependencies ...");
      expect(first.stdout).toContain("Claude plugin ready:");
      expect(first.stdout).toContain("claude: yes (functional)");
      expect(first.stdout).toContain("PATH already includes door launchers.");

      for (const door of ["claude", "pi", "codex", "hermes", "grok", "agy"]) {
        expect(existsSync(join(sb.installHome, "bin", `${door}-zero.cmd`))).toBe(true);
        expect(existsSync(join(sb.userBin, `${door}-zero.cmd`))).toBe(true);
      }
      expect(existsSync(join(sb.installHome, ".claude-marketplace-managed"))).toBe(true);
      expect(existsSync(join(sb.installHome, ".claude-plugin-managed"))).toBe(true);

      const doorPrint = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-Command", "& $env:__SH_DOOR --print"],
        {
          env: { ...sb.baseEnv, __SH_DOOR: join(sb.userBin, "claude-zero.cmd") },
          timeout: 30_000,
        },
      );
      expect(doorPrint.status, doorPrint.stderr || doorPrint.stdout).toBe(0);
      const parsedPlan = JSON.parse(doorPrint.stdout) as { posture: string; command: string };
      expect(parsedPlan.posture).toBe("product-floor");
      expect(parsedPlan.command).toBe("claude");

      const firstCalls = readClaudeLog(sb.claudeLog).map((entry) => entry.argv.join(" "));
      expect(firstCalls).toContain("plugin marketplace add https://github.com/gaia-research/gaia-skill-heaven.git");
      expect(firstCalls).toContain("plugin install --scope user skill-heaven@gaia-skill-heaven");

      writeFileSync(sb.claudeLog, "");
      const second = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PS1],
        { env: sb.baseEnv, timeout: 120_000 },
      );
      expect(second.status, second.stderr || second.stdout).toBe(0);
      const secondCalls = readClaudeLog(sb.claudeLog).map((entry) => entry.argv.join(" "));
      expect(secondCalls).toContain("plugin marketplace update gaia-skill-heaven");
      expect(secondCalls).toContain("plugin update skill-heaven@gaia-skill-heaven");
      expect(secondCalls).not.toContain("plugin install --scope user skill-heaven@gaia-skill-heaven");

      const help = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PS1, "-Help"],
        { env: sb.baseEnv, timeout: 30_000 },
      );
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("Usage: irm https://gaia-research.github.io/gaia-skill-heaven/install.ps1 | iex");

      writeFileSync(sb.claudeLog, "");
      const uninstall = await runProcess(
        engine.bin,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PS1, "-Uninstall"],
        { env: sb.baseEnv, timeout: 60_000 },
      );
      expect(uninstall.status, uninstall.stderr || uninstall.stdout).toBe(0);
      expect(existsSync(sb.installHome)).toBe(false);
      for (const door of ["claude", "pi", "codex", "hermes", "grok", "agy"]) {
        expect(existsSync(join(sb.userBin, `${door}-zero.cmd`))).toBe(false);
      }
      const uninstallCalls = readClaudeLog(sb.claudeLog).map((entry) => entry.argv.join(" "));
      expect(uninstallCalls).toContain("plugin uninstall skill-heaven@gaia-skill-heaven");
      expect(uninstallCalls).toContain("plugin marketplace remove gaia-skill-heaven");
    }, 240_000);

    it("6. install.ps1 handles broken claude binary (--version failure with stderr) and User PATH addition/removal cleanly", async () => {
      const sb = makeSandbox(`doors-broken-claude-${engine.id}`);
      writeMockClaudeCmd(sb.mockBin, "broken");

      const envWithoutUserBin: NodeJS.ProcessEnv = {
        ...sb.baseEnv,
        Path: `${sb.mockBin};${process.env.Path ?? process.env.PATH ?? ""}`,
        PATH: `${sb.mockBin};${process.env.Path ?? process.env.PATH ?? ""}`,
      };

      const run = await runProcess(
        engine.bin,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          [
            "$origUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
            "try {",
            `  & '${INSTALL_PS1.replace(/'/g, "''")}'`,
            "  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
            "  $afterInstallPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
            "  Write-Output ('USER_PATH_AFTER_INSTALL=' + $afterInstallPath)",
            `  & (Join-Path '${sb.installHome.replace(/'/g, "''")}' 'uninstall.ps1')`,
            "  $afterUninstallPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
            "  Write-Output ('USER_PATH_AFTER_UNINSTALL=' + $afterUninstallPath)",
            "} finally {",
            "  [Environment]::SetEnvironmentVariable('Path', $origUserPath, 'User')",
            "}",
          ].join("\n"),
        ],
        { env: envWithoutUserBin, timeout: 120_000 },
      );
      expect(run.status, run.stderr || run.stdout).toBe(0);
      expect(run.stdout).toContain("Claude Code binary detected, but 'claude --version' failed.");
      expect(run.stdout).toContain("Skipping Claude plugin auto-registration.");
      expect(run.stdout).toContain("claude: binary present, but failed execution (--version failed)");
      const expectedBinDir = join(sb.installHome, "bin");
      expect(run.stdout).toContain(`Added ${expectedBinDir} to User PATH.`);
      expect(run.stdout).toContain(`USER_PATH_AFTER_INSTALL=${expectedBinDir}`);
      expect(run.stdout).not.toContain(`USER_PATH_AFTER_UNINSTALL=${expectedBinDir}`);
      expect(existsSync(sb.installHome)).toBe(false);
    }, 180_000);
  });
});
