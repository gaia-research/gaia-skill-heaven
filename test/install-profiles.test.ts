import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
afterAll(() => rmSync(root, { recursive: true, force: true }), 30_000);

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
    writeFileSync(join(bin, executable), `#!/usr/bin/env node\nconst fs=require('node:fs');\nconst row={exe:${JSON.stringify(executable)},argv:process.argv.slice(2)};\nfs.appendFileSync(process.env.HOST_ARGV_LOG,JSON.stringify(row)+'\\n');\nconst n=fs.readFileSync(process.env.HOST_ARGV_LOG,'utf8').trim().split('\\n').length;\nprocess.exit(process.env.FAIL_HOST==='${executable}'||Number(process.env.FAIL_STEP)===n?73:0);\n`, { mode: 0o755 });
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

function call(result: RunResult, args: string[], failHost?: string, extraEnv: Record<string, string> = {}) {
  const bin = dirname(result.log);
  const env = { ...process.env, PATH: join(bin, "sealed PATH"), HOME: dirname(dirname(result.home)), HOST_ARGV_LOG: result.log, SKILL_HEAVEN_PLUGIN_HOME: result.home, ...(failHost ? { FAIL_HOST: failHost } : {}), ...extraEnv };
  return spawnSync(process.execPath, [GENERATED_INSTALLER, "--source", REPO, "--home", result.home, ...args], { cwd: REPO, encoding: "utf8", env, timeout: 30_000 });
}
function receipt(home: string): { profile: string; harness: string | null; registered: boolean; incomplete?: boolean } {
  return JSON.parse(readFileSync(join(home, "profile.json"), "utf8"));
}
function expectRegistered(output: string, steps: readonly { run: string }[]) {
  expect(output).toContain("--register completed:");
  expect(output).not.toContain("No harness was installed or reconfigured.");
  const completed = output.split("--register completed:")[1]!.split("\n\n")[0]!;
  const actualRuns = completed.split("\n").map(line => line.trim().replace(/^ok\s+/, "")).filter(Boolean);
  expect(actualRuns).toEqual(steps.length > 0 ? steps.map(step => step.run) : ["(no host commands were required)"]);
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
function switched(h: HarnessPath, from: "core" | "full", to: "core" | "full", paths: PlanPaths) {
  const p = planSwitch(h, from, to, paths);
  if (p.kind === "blocked") throw new Error(p.reason);
  return p.steps.map(s => {
    const argv = s.argv!.map(v => v.replaceAll("{{PLUGIN_DIR}}", paths.pluginDir).replaceAll("{{CONSOLE_DIR}}", paths.consoleDir).replaceAll("{{MARKETPLACE_DIR}}", paths.marketplaceDir));
    return { exe: argv[0]!, argv: argv.slice(1) };
  });
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
    const coreUpdatePlan = planProfile(harness, "core", "update", result.paths);
    if (coreUpdatePlan.kind !== "steps") throw new Error("Core update unexpectedly blocked");
    expectRegistered(repeatedCore.stdout, coreUpdatePlan.steps);
    expect(lines(result.log).slice(beforeCoreUpdate)).toEqual(coreUpdate);
    expect(receipt(result.home)).toMatchObject({ profile: "core", registered: true, incomplete: false });

    const fullPlan = planProfile(harness, "full", "register", result.paths);
    if (fullPlan.kind === "blocked") {
      const before = lines(result.log).length;
      expect(call(result, ["--profile", "full", "--register"]).status).not.toBe(0);
      expect(lines(result.log)).toHaveLength(before);
      expect(receipt(result.home)).toMatchObject({ profile: "core", registered: true, incomplete: false });
      expect(call(result, ["--uninstall", "--register"]).status).toBe(0);
      expect(lines(result.log).slice(before)).toEqual(planned(harness, "core", "remove", result.paths));
      return;
    }
    const beforeUp = lines(result.log).length;
    const toFull = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    expect(toFull.status, toFull.stderr).toBe(0);
    const upSteps = planSwitch(harness, "core", "full", result.paths);
    if (upSteps.kind !== "steps") throw new Error("Core → Full unexpectedly blocked");
    expectRegistered(toFull.stdout, upSteps.steps);
    expect(toFull.stdout).not.toContain("Then add the console (Full):");
    expect(lines(result.log).slice(beforeUp)).toEqual(switched(harness, "core", "full", result.paths));
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
    const fullUpdatePlan = planProfile(harness, "full", "update", result.paths);
    if (fullUpdatePlan.kind !== "steps") throw new Error("Full update unexpectedly blocked");
    expectRegistered(repeatedFull.stdout, fullUpdatePlan.steps);
    expect(lines(result.log).slice(beforeFullUpdate)).toEqual(fullUpdate);
    const beforeDown = lines(result.log).length;
    const toCore = call(result, ["--profile", "core", "--harness", harness.id, "--register"]);
    expect(toCore.status, toCore.stderr).toBe(0);
    const downSteps = planSwitch(harness, "full", "core", result.paths);
    if (downSteps.kind !== "steps") throw new Error("Full → Core unexpectedly blocked");
    expectRegistered(toCore.stdout, downSteps.steps);
    expect(toCore.stdout).not.toContain("You asked for Core and had Full");
    expect(lines(result.log).slice(beforeDown)).toEqual(switched(harness, "full", "core", result.paths));
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
    expect(afterUninstall).toEqual(removePlan);
  }, 120_000);

  it.each(lifecycleHarnesses.map((h) => [h.name, h] as const))("supports a fresh Full install on %s", (_name, harness) => {
    const result = makeSandbox(`fresh-full-${harness.id}`, [harness], false);
    const installed = call(result, ["--profile", "full", "--harness", harness.id, "--register"]);
    if (harness.consolePiece === null) {
      expect(installed.status).not.toBe(0); expect(existsSync(result.home)).toBe(false); expect(lines(result.log)).toEqual([]); return;
    }
    expect(installed.status, installed.stderr).toBe(0);
    expect(receipt(result.home)).toMatchObject({ profile: "full", harness: harness.id, registered: true, incomplete: false });
    expect(existsSync(result.paths.pluginDir)).toBe(true);
    expect(existsSync(result.paths.consoleDir)).toBe(true);
  }, 120_000);

  it("clones the Full marketplace with real payload files and independent child Git roots", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("marketplace-git-root", [h], false);
    const staged = call(r, ["--profile", "full", "--harness", h.id]);
    expect(staged.status, staged.stderr).toBe(0);
    expect(lines(r.log)).toEqual([]);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = env.GIT_CONFIG_SYSTEM = process.platform === "win32" ? "NUL" : "/dev/null";
    const git = (args: string[]) => {
      const run = spawnSync(join(dirname(r.log), "sealed PATH", "git"), args, { env, encoding: "utf8", timeout: 30_000 });
      expect(run.status, run.stderr).toBe(0);
      return run.stdout;
    };
    const tree = git(["-C", r.paths.marketplaceDir, "ls-tree", "-r", "HEAD"]);
    expect(tree).not.toMatch(/^160000 /m);
    expect(tree).toContain("plugins/skill-heaven/plugin.json");
    expect(tree).toContain("plugins/skill-heaven-console/extensions/console.mjs");
    const clone = join(dirname(r.log), "marketplace clone 'quoted'");
    git(["clone", "--quiet", "--no-local", r.paths.marketplaceDir, clone]);
    for (const file of [".claude-plugin/marketplace.json", "plugins/skill-heaven/plugin.json", "plugins/skill-heaven/mcp/skill-summon.mjs", "plugins/skill-heaven-console/package.json", "plugins/skill-heaven-console/extensions/console.mjs"]) {
      expect(readFileSync(join(clone, file))).toEqual(readFileSync(join(r.paths.marketplaceDir, file)));
    }
    expect(existsSync(join(clone, "plugins", "skill-heaven", ".git"))).toBe(false);
    expect(existsSync(join(clone, "plugins", "skill-heaven-console", ".git"))).toBe(false);
    // Nested sources remain clonable by file:// clients independently of the
    // outer marketplace, without requiring submodule setup or network access.
    for (const [label, source, payload] of [["core", r.paths.pluginDir, "plugin.json"], ["console", r.paths.consoleDir, "extensions/console.mjs"]]) {
      expect(realpathSync(git(["-C", source!, "rev-parse", "--show-toplevel"]).trim())).toBe(realpathSync(source!));
      const child = join(dirname(r.log), `${label} standalone clone`);
      git(["clone", "--quiet", "--no-local", source!, child]);
      expect(readFileSync(join(child, payload!))).toEqual(readFileSync(join(source!, payload!)));
    }
  });

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

  it.each([1, 2])("checkpoints a registration failure at step %s and resumes only unfinished steps", (failStep) => {
    const h = HARNESS_PATHS.find(h => h.id === "codex")!;
    const r = makeSandbox(`checkpoint-register-${failStep}`, [h], false);
    const expected = planned(h, "full", "register", r.paths);
    const failed = call(r, ["--profile", "full", "--harness", h.id, "--register"], undefined, { FAIL_STEP: String(failStep) });
    expect(failed.status).not.toBe(0);
    expect(lines(r.log)).toEqual(expected.slice(0, failStep));
    const saved = JSON.parse(readFileSync(join(r.home, "profile.json"), "utf8"));
    expect(saved.transaction.operation).toBe("register");
    expect(saved.transaction.previousProfile).toBe(null);
    expect(saved.transaction.completed).toEqual(saved.transaction.steps.slice(0, failStep - 1));
    const before = lines(r.log).length;
    expect(call(r, ["--uninstall", "--register"]).status).not.toBe(0);
    expect(call(r, ["--profile", "core", "--register"]).status).not.toBe(0);
    expect(call(r, ["--harness", "pi", "--register"]).status).not.toBe(0);
    expect(lines(r.log)).toHaveLength(before);
    expect(existsSync(r.paths.consoleDir)).toBe(true);
    const retry = call(r, ["--register", "--source", join(root, "missing-source")]);
    expect(retry.status, retry.stderr).toBe(0);
    const canonical = planProfile(h, "full", "register", r.paths);
    if (canonical.kind !== "steps") throw new Error("Full registration unexpectedly blocked");
    expectRegistered(retry.stdout, canonical.steps);
    expect(lines(r.log).slice(before)).toEqual(expected.slice(failStep - 1));
    expect(receipt(r.home)).toMatchObject({ profile: "full", registered: true, incomplete: false });
  });

  it("keeps --quiet output when a registration checkpoint resumes", () => {
    const h = HARNESS_PATHS.find(h => h.id === "codex")!;
    const r = makeSandbox("checkpoint-register-quiet", [h], false);
    expect(call(r, ["--profile", "full", "--harness", h.id, "--register"], undefined, { FAIL_STEP: "1" }).status).not.toBe(0);
    const retry = call(r, ["--register", "--quiet"]);
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.stdout.trim().split("\n")).toEqual([r.paths.pluginDir, r.paths.marketplaceDir]);
    expect(receipt(r.home)).toMatchObject({ profile: "full", harness: h.id, registered: true, incomplete: false });
  });

  it("resumes an incomplete update, not a registration plan", () => {
    const h = HARNESS_PATHS.find(h => h.id === "codex")!;
    const r = makeSandbox("checkpoint-update", [h]);
    const before = lines(r.log).length;
    const expected = planned(h, "core", "update", r.paths);
    expect(call(r, ["--register"], undefined, { FAIL_STEP: String(before + 2) }).status).not.toBe(0);
    const n = lines(r.log).length;
    expect(call(r, ["--uninstall", "--register"]).status).not.toBe(0);
    expect(lines(r.log)).toHaveLength(n);
    const retry = call(r, ["--register"]);
    expect(retry.status, retry.stderr).toBe(0);
    const canonical = planProfile(h, "core", "update", r.paths);
    if (canonical.kind !== "steps") throw new Error("Core update unexpectedly blocked");
    expectRegistered(retry.stdout, canonical.steps);
    expect(lines(r.log).slice(n)).toEqual(expected.slice(1));
  });

  it("checkpoints partial uninstall and keeps both sources until removal resolves", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("checkpoint-remove", [h], false);
    expect(call(r, ["--profile", "full", "--harness", h.id, "--register"]).status).toBe(0);
    const before = lines(r.log).length;
    const expected = planned(h, "full", "remove", r.paths);
    expect(call(r, ["--uninstall", "--register"], undefined, { FAIL_STEP: String(before + 2) }).status).not.toBe(0);
    expect(lines(r.log).slice(before)).toEqual(expected);
    expect(existsSync(r.paths.pluginDir)).toBe(true);
    expect(existsSync(r.paths.consoleDir)).toBe(true);
    expect(existsSync(join(r.home, "install-profile.mjs"))).toBe(true);
    const t = JSON.parse(readFileSync(join(r.home, "profile.json"), "utf8")).transaction;
    expect(t.completed).toEqual(t.steps.slice(0, 1));
    const n = lines(r.log).length;
    const retry = call(r, ["--uninstall", "--register"]);
    expect(retry.status, retry.stderr).toBe(0);
    expect(lines(r.log).slice(n)).toEqual(expected.slice(1));
    expect(existsSync(r.home)).toBe(false);
  });

  it("does not remove host registrations on stage-only downgrade or uninstall", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("stage-only", [h], false);
    expect(call(r, ["--profile", "full", "--harness", h.id]).status).toBe(0);
    expect(call(r, ["--profile", "core", "--register"]).status).toBe(0);
    expect(lines(r.log)).toEqual(planned(h, "core", "register", r.paths));
    const downgrade = makeSandbox("stage-only-downgrade", [h], false);
    expect(call(downgrade, ["--profile", "full", "--harness", h.id]).status).toBe(0);
    const stagedDowngrade = call(downgrade, ["--profile", "core"]);
    expect(stagedDowngrade.status).toBe(0);
    expect(stagedDowngrade.stdout).toContain("No harness was installed or reconfigured.");
    expect(stagedDowngrade.stdout).toContain("You asked for Core and had Full. Remove only the console:");
    expect(stagedDowngrade.stdout).not.toContain("--register completed:");
    expect(lines(downgrade.log)).toEqual([]);
    const stage = makeSandbox("stage-only-uninstall", [h], false);
    expect(call(stage, ["--profile", "full", "--harness", h.id]).status).toBe(0);
    expect(call(stage, ["--uninstall", "--register"]).status).toBe(0);
    expect(lines(stage.log)).toEqual([]);
  });

  it("preserves receipt defaults and upgrades a legacy marked Core artifact", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("legacy", [h], false);
    expect(call(r, []).status).toBe(0);
    rmSync(join(r.home, "profile.json"));
    expect(call(r, ["--harness", h.id, "--register"]).status).toBe(0);
    const before = lines(r.log).length;
    expect(call(r, ["--register"]).status).toBe(0);
    expect(receipt(r.home)).toMatchObject({ profile: "core", harness: h.id, registered: true });
    expect(lines(r.log).slice(before)).toEqual(planned(h, "core", "update", r.paths));
    expect(call(r, ["--harness", "codex", "--uninstall", "--register"]).status).not.toBe(0);
  });

  it("refuses drifted or malformed checkpoints without executing stored argv", () => {
    const h = HARNESS_PATHS.find(h => h.id === "codex")!;
    const r = makeSandbox("contract-drift", [h], false);
    expect(call(r, ["--harness", h.id, "--register"], undefined, { FAIL_STEP: "2" }).status).not.toBe(0);
    const file = join(r.home, "profile.json");
    const original = JSON.parse(readFileSync(file, "utf8"));
    const before = lines(r.log).length;
    for (const mutate of [
      (r: typeof original) => { r.transaction.steps[1] = JSON.stringify({ argv: ["node", "--evil"] }); },
      (r: typeof original) => { r.transaction.completed = ["not-canonical"]; },
      (r: typeof original) => { delete r.transaction; },
      (r: typeof original) => { r.transaction.pending = r.transaction.steps[1]; },
    ]) {
      const changed = structuredClone(original); mutate(changed); writeFileSync(file, JSON.stringify(changed));
      const retry = call(r, ["--register"]);
      expect(retry.status).not.toBe(0);
      expect(lines(r.log)).toHaveLength(before);
      expect(existsSync(r.paths.pluginDir)).toBe(true);
    }
  });

  it.each(["stage", "rename"])("keeps old sources and recovery receipt safe after a downgrade %s failure", (fault) => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox(`downgrade-${fault}`, [h], false);
    expect(call(r, ["--profile", "full", "--harness", h.id, "--register"]).status).toBe(0);
    const before = lines(r.log).length;
    // Inject filesystem failures in the child only; never add production fault knobs.
    const preload = join(dirname(r.log), "fault.cjs");
    writeFileSync(preload, `const fs=require('node:fs');
const rename=fs.renameSync, copy=fs.cpSync;
fs.renameSync=function(a,b,...args){if(process.env.TEST_FAULT==='rename'&&a.endsWith('/install')&&b===process.env.SKILL_HEAVEN_PLUGIN_HOME)throw new Error('synthetic rename failure');return rename(a,b,...args)};
fs.cpSync=function(a,b,...args){if(process.env.TEST_FAULT==='stage'&&b.endsWith('/install-profile.mjs'))throw new Error('synthetic staging failure');return copy(a,b,...args)};
require('node:module').syncBuiltinESMExports();`);
    const failed = call(r, ["--profile", "core", "--register"], undefined, { NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, TEST_FAULT: fault });
    expect(failed.status).not.toBe(0);
    expect(existsSync(r.paths.pluginDir)).toBe(true);
    expect(existsSync(r.paths.consoleDir)).toBe(true);
    expect(receipt(r.home).profile).toBe("full");
    const expected = switched(h, "full", "core", r.paths);
    expect(lines(r.log).slice(before)).toEqual(fault === "rename" ? expected : []);
    if (fault === "rename") {
      const t = JSON.parse(readFileSync(join(r.home, "profile.json"), "utf8")).transaction;
      expect(t.staged).toBe(false); expect(t.completed).toEqual(t.steps);
    }
    const n = lines(r.log).length;
    const retry = call(r, ["--profile", "core", "--register"]);
    expect(retry.status, retry.stderr).toBe(0);
    expect(lines(r.log).slice(n)).toEqual(fault === "rename" ? [] : expected);
    expect(receipt(r.home)).toMatchObject({ profile: "core", registered: true, incomplete: false });
    expect(existsSync(r.paths.consoleDir)).toBe(false);
  });

  it("resumes a failed Core → Full switch without touching Core", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("upgrade-host-failure", [h]);
    const before = lines(r.log).length;
    expect(call(r, ["--profile", "full", "--register"], "pi").status).not.toBe(0);
    expect(lines(r.log).slice(before)).toEqual(switched(h, "core", "full", r.paths));
    const t = JSON.parse(readFileSync(join(r.home, "profile.json"), "utf8")).transaction;
    expect(t).toMatchObject({ operation: "switch", previousProfile: "core", target: "full", completed: [] });
    const n = lines(r.log).length;
    expect(call(r, ["--uninstall", "--register"]).status).not.toBe(0);
    const retry = call(r, ["--register"]);
    expect(retry.status, retry.stderr).toBe(0);
    const canonical = planSwitch(h, "core", "full", r.paths);
    if (canonical.kind !== "steps") throw new Error("Core → Full unexpectedly blocked");
    expectRegistered(retry.stdout, canonical.steps);
    expect(lines(r.log).slice(n)).toEqual(switched(h, "core", "full", r.paths));
  });

  it("retains the console and checkpoint after failed downgrade removal", () => {
    const h = HARNESS_PATHS.find(h => h.id === "pi")!;
    const r = makeSandbox("downgrade-host-failure", [h], false);
    expect(call(r, ["--profile", "full", "--harness", h.id, "--register"]).status).toBe(0);
    expect(call(r, ["--profile", "core", "--register"], "pi").status).not.toBe(0);
    expect(existsSync(r.paths.consoleDir)).toBe(true);
    expect(receipt(r.home)).toMatchObject({ profile: "full", registered: true, incomplete: true });
    const before = lines(r.log).length;
    expect(call(r, ["--uninstall", "--register"]).status).not.toBe(0);
    const retry = call(r, ["--register"]);
    expect(retry.status, retry.stderr).toBe(0);
    const canonical = planSwitch(h, "full", "core", r.paths);
    if (canonical.kind !== "steps") throw new Error("Full → Core unexpectedly blocked");
    expectRegistered(retry.stdout, canonical.steps);
    expect(lines(r.log).slice(before)).toEqual(switched(h, "full", "core", r.paths));
  });

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
