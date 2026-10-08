import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HARNESS_PATHS, type HarnessPath } from "../packages/status/src/compat.js";
import { planProfile, planSwitch, type Plan, type PlanPaths } from "../packages/status/src/install-plan.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_INSTALLER = join(REPO, "scripts/install-profile.mjs");
const SENTINEL = "user config must remain byte-for-byte unchanged\n";
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sh-profile-lifecycle-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

type RunResult = { status: number | null; stdout: string; stderr: string; home: string; log: string; marker: string; paths: PlanPaths };

function makeSandbox(label: string, harnesses: readonly HarnessPath[], seedCore = true): RunResult {
  const dir = mkdtempSync(join(root, `${label}-`));
  const bin = join(dir, "sealed PATH");
  const marker = join(dir, "SHELL_INJECTION_RAN");
  const home = join(dir, `user home 'quoted' ; touch ${marker} ; echo '`);
  const installHome = join(home, "local data", "Skill Heaven's install");
  const userConfig = join(home, ".config", "agent", "settings.json");
  const log = join(dir, "host argv.jsonl");
  mkdirSync(bin, { recursive: true });
  mkdirSync(dirname(userConfig), { recursive: true });
  writeFileSync(userConfig, SENTINEL);
  writeFileSync(log, "");
  const git = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  symlinkSync(git, join(bin, "git"));
  symlinkSync(process.execPath, join(bin, "node"));

  const binaries = new Set<string>();
  for (const harness of harnesses) {
    for (const profile of ["core", "full"] as const) {
      const plan = planProfile(harness, profile, "register");
      if (plan.kind === "steps") {
        for (const step of plan.steps) {
          const argv = (step as typeof step & { argv?: readonly string[] }).argv;
          if (argv?.[0]) {
            if (argv[0].includes("/")) throw new Error(`refusing real host executable in test sandbox: ${argv[0]}`);
            binaries.add(argv[0]);
          }
        }
      }
    }
  }
  // Fake host commands use argv, never shell parsing. A selected failure allows
  // the failed-registration receipt path to be asserted deterministically.
  for (const executable of binaries) {
    if (executable.includes("/")) continue;
    writeFileSync(join(bin, executable), `#!/usr/bin/env node\nconst fs=require('node:fs');\nconst row={exe:${JSON.stringify(executable)},argv:process.argv.slice(2)};\nfs.appendFileSync(process.env.HOST_ARGV_LOG,JSON.stringify(row)+'\\n');\nprocess.exit(process.env.FAIL_HOST==='${executable}'?73:0);\n`, { mode: 0o755 });
  }

  const paths: PlanPaths = {
    pluginDir: join(installHome, "marketplace", "plugins", "skill-heaven"),
    consoleDir: join(installHome, "marketplace", "plugins", "skill-heaven-console"),
    marketplaceDir: join(installHome, "marketplace"),
  };
  const env = {
    ...process.env,
    PATH: bin,
    HOME: home,
    USERPROFILE: home,
    HOST_ARGV_LOG: log,
    SKILL_HEAVEN_PLUGIN_HOME: installHome,
  };
  const invoke = (args: string[], failHost?: string) => spawnSync(process.execPath, [GENERATED_INSTALLER, "--source", REPO, "--home", installHome, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...env, ...(failHost ? { FAIL_HOST: failHost } : {}) },
    timeout: 30_000,
  });
  // A fresh Core registration is the initial run; callers continue from the
  // same isolated installation and can inspect the real generated receipt.
  const first = harnesses[0];
  const core = first && seedCore ? invoke(["--profile", "core", "--harness", first.id, "--register"]) : { status: 0, stdout: "", stderr: "" };
  return { status: core.status, stdout: core.stdout, stderr: core.stderr, home: installHome, log, marker, paths };
}

function call(result: RunResult, args: string[], failHost?: string) {
  const bin = dirname(result.log);
  const env = { ...process.env, PATH: join(bin, "sealed PATH"), HOME: dirname(dirname(result.home)), HOST_ARGV_LOG: result.log, SKILL_HEAVEN_PLUGIN_HOME: result.home, ...(failHost ? { FAIL_HOST: failHost } : {}) };
  return spawnSync(process.execPath, [GENERATED_INSTALLER, "--source", REPO, "--home", result.home, ...args], { cwd: REPO, encoding: "utf8", env, timeout: 30_000 });
}
function receipt(home: string): { profile: string; harness: string | null; registered: boolean; incomplete?: boolean } {
  return JSON.parse(readFileSync(join(home, "profile.json"), "utf8"));
}
function lines(log: string): Array<{ exe: string; argv: string[] }> {
  const raw = readFileSync(log, "utf8").trim();
  return raw ? raw.split("\n").map((line) => JSON.parse(line)) : [];
}
function installPaths(home: string): PlanPaths {
  return { pluginDir: join(home, "marketplace", "plugins", "skill-heaven"), consoleDir: join(home, "marketplace", "plugins", "skill-heaven-console"), marketplaceDir: join(home, "marketplace") };
}
function planned(harness: HarnessPath, profile: "core" | "full", op: "register" | "update" | "remove", paths: PlanPaths): Array<{ exe: string; argv: string[] }> {
  const plan: Plan = planProfile(harness, profile, op, paths);
  if (plan.kind === "blocked") throw new Error(`fixture requests blocked plan: ${harness.id} ${profile}: ${plan.reason}`);
  return plan.steps.map((step) => {
    const argv = (step as typeof step & { argv?: readonly string[] }).argv;
    if (!argv?.length) throw new Error(`canonical plan lacks argv for ${harness.id} ${step.run}`);
    return { exe: argv[0]!, argv: [...argv.slice(1).map((part) => part
      .replaceAll("{{PLUGIN_DIR}}", paths.pluginDir)
      .replaceAll("{{CONSOLE_DIR}}", paths.consoleDir)
      .replaceAll("{{MARKETPLACE_DIR}}", paths.marketplaceDir))] };
  });
}
function countFor(observed: ReturnType<typeof lines>, expected: Array<{ exe: string; argv: string[] }>) {
  return observed.filter((row) => expected.some((step) => step.exe === row.exe && JSON.stringify(step.argv) === JSON.stringify(row.argv))).length;
}

const lifecycleHarnesses = HARNESS_PATHS.filter((h) => h.id !== "other");

describe("generated installer Core/Full lifecycle conformance", () => {
  it.each(lifecycleHarnesses.map((h) => [h.name, h] as const))("keeps Core intact across the %s lifecycle", (_name, harness) => {
    const result = makeSandbox(`lifecycle-${harness.id}`, [harness]);
    expect(result.status, result.stderr).toBe(0);
    expect(receipt(result.home)).toMatchObject({ profile: "core", harness: harness.id, registered: true, incomplete: false });
    expect(existsSync(result.paths.pluginDir)).toBe(true);
    expect(existsSync(result.paths.consoleDir)).toBe(false);

    // Repeating Core uses the canonical update operation rather than adding a
    // second registration. The install helper owns only the console on switches.
    const beforeCoreUpdate = lines(result.log).length;
    const coreUpdate = planned(harness, "core", "update", result.paths);
    const repeatedCore = call(result, ["--profile", "core", "--harness", harness.id, "--register"]);
    expect(repeatedCore.status, repeatedCore.stderr).toBe(0);
    for (const step of coreUpdate) expect(lines(result.log).slice(beforeCoreUpdate).some((row) => row.exe === step.exe && JSON.stringify(row.argv) === JSON.stringify(step.argv))).toBe(true);
    expect(receipt(result.home)).toMatchObject({ profile: "core", registered: true, incomplete: false });

    const fullPlan = planProfile(harness, "full", "register", result.paths);
    if (fullPlan.kind === "blocked") throw new Error(`Full unexpectedly blocked for ${harness.id}: ${fullPlan.reason}`);
    const toFull = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    expect(toFull.status, toFull.stderr).toBe(0);
    expect(receipt(result.home)).toMatchObject({ profile: "full", registered: true, incomplete: false });
    expect(existsSync(result.paths.pluginDir)).toBe(true);
    expect(existsSync(result.paths.consoleDir)).toBe(true);
    const marketplace = JSON.parse(readFileSync(join(result.paths.marketplaceDir, ".claude-plugin", "marketplace.json"), "utf8"));
    expect(marketplace.plugins.some((p: { source: string }) => p.source === "./plugins/skill-heaven")).toBe(true);
    expect(marketplace.plugins.some((p: { source: string }) => p.source === "./plugins/skill-heaven-console")).toBe(true);

    const beforeFullUpdate = lines(result.log).length;
    const fullUpdate = planned(harness, "full", "update", result.paths);
    const repeatedFull = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    expect(repeatedFull.status, repeatedFull.stderr).toBe(0);
    for (const step of fullUpdate) expect(lines(result.log).slice(beforeFullUpdate).some((row) => row.exe === step.exe && JSON.stringify(row.argv) === JSON.stringify(step.argv))).toBe(true);
    const toCore = call(result, ["--profile", "core", "--harness", harness.id, "--register"]);
    expect(toCore.status, toCore.stderr).toBe(0);
    expect(receipt(result.home)).toMatchObject({ profile: "core", registered: true, incomplete: false });
    expect(existsSync(result.paths.pluginDir)).toBe(true);
    expect(existsSync(result.paths.consoleDir)).toBe(false);
    const coreToFull = planSwitch(harness, "core", "full", result.paths);
    const fullToCore = planSwitch(harness, "full", "core", result.paths);
    if (coreToFull.kind === "blocked" || fullToCore.kind === "blocked") throw new Error(`profile switch unexpectedly blocked for ${harness.id}`);
    expect(coreToFull.steps.every((s) => s.piece === "console")).toBe(true);
    expect(fullToCore.steps.every((s) => s.piece === "console")).toBe(true);

    const beforeUninstall = lines(result.log).length;
    const removePlan = planned(harness, "core", "remove", result.paths);
    const uninstall = call(result, ["--uninstall", "--register"]);
    expect(uninstall.status, uninstall.stderr).toBe(0);
    expect(existsSync(result.home)).toBe(false);
    const afterUninstall = lines(result.log).slice(beforeUninstall);
    for (const step of removePlan) expect(afterUninstall.some((row) => row.exe === step.exe && JSON.stringify(row.argv) === JSON.stringify(step.argv))).toBe(true);
  }, 120_000);

  it.each(lifecycleHarnesses.map((h) => [h.name, h] as const))("supports a fresh Full install on %s", (_name, harness) => {
    const result = makeSandbox(`fresh-full-${harness.id}`, [harness], false);
    const installed = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    expect(installed.status, installed.stderr).toBe(0);
    expect(receipt(result.home)).toMatchObject({ profile: "full", harness: harness.id, registered: true, incomplete: false });
    expect(existsSync(result.paths.pluginDir)).toBe(true);
    expect(existsSync(result.paths.consoleDir)).toBe(true);
  }, 120_000);

  it("does not mark a failed host registration successful", () => {
    const harness = lifecycleHarnesses[0]!;
    const plan = planProfile(harness, "core", "register");
    if (plan.kind !== "steps") throw new Error("Core unexpectedly blocked");
    const argv = (plan.steps[0] as typeof plan.steps[number] & { argv?: readonly string[] }).argv;
    if (!argv?.[0]) throw new Error("canonical Core plan has no safe argv");
    const result = makeSandbox("failed-registration", [harness], false);
    const failed = call(result, ["--profile", "core", "--harness", harness.id, "--register"], argv[0]);
    expect(failed.status).not.toBe(0);
    expect(receipt(result.home)).toMatchObject({ registered: false, incomplete: true });
  }, 60_000);

  it("fails closed for an unknown harness without creating or changing an install", () => {
    const result = makeSandbox("unknown-harness", [], false);
    expect(result.status).toBe(0);
    rmSync(result.home, { recursive: true, force: true });
    const failed = call(result, ["--profile", "full", "--harness", "mystery-client", "--register"]);
    expect(failed.status).not.toBe(0);
    expect(existsSync(result.home)).toBe(false);
    expect(lines(result.log)).toEqual([]);
  });

  it("keeps paths with spaces and quotes as argv data, not shell syntax", () => {
    const harness = lifecycleHarnesses[0]!;
    const result = makeSandbox("quoted-path", [harness]);
    const marker = result.marker;
    const full = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    expect(full.status, full.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
    const plan = planned(harness, "full", "register", result.paths);
    const calls = lines(result.log);
    for (const step of plan) {
      expect(calls.some((row) => row.exe === step.exe && JSON.stringify(row.argv) === JSON.stringify(step.argv))).toBe(true);
    }
    expect(readFileSync(join(dirname(dirname(result.home)), ".config", "agent", "settings.json"), "utf8")).toBe(SENTINEL);
  }, 60_000);

  it("never installs harness binaries or replaces user configuration", () => {
    for (const harness of lifecycleHarnesses) {
      const result = makeSandbox(`no-host-install-${harness.id}`, [harness]);
      expect(result.status, result.stderr).toBe(0);
      const home = dirname(dirname(result.home));
      expect(readFileSync(join(home, ".config", "agent", "settings.json"), "utf8")).toBe(SENTINEL);
      expect(existsSync(join(result.home, "bin"))).toBe(false);
      expect(existsSync(join(home, harness.bin ?? "not-a-harness"))).toBe(false);
      expect(readdirSync(dirname(result.home))).not.toContain(harness.bin);
    }
  }, 120_000);
});
