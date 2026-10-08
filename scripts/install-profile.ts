// Shared installer for POSIX and PowerShell. Commands and capabilities come
// from packages/status, not a second shell table. This is local installation
// code, never a runtime authority path. No eval, shell interpolation or prompts.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_PATHS, type HarnessId, type HarnessPath, type ProfileId } from "../packages/status/src/compat.js";
import { planProfile, planSwitch, renderRun, type PlanPaths, type RenderedStep } from "../packages/status/src/install-plan.js";
import { renderInstallEpilogue } from "../packages/status/src/install-epilogue.js";

const MARKER = ".skill-heaven-agent-plugin-install";
type Operation = "register" | "update" | "switch" | "remove";
interface Transaction {
  operation: Operation; previousProfile: ProfileId | null; target: ProfileId;
  steps: string[]; completed: string[]; staged: boolean; pending?: string;
}
interface Receipt { schema: "skill-heaven/install@1"; profile: ProfileId; harness: HarnessId | null; registered: boolean; incomplete?: boolean; transaction?: Transaction; }
interface Options { home: string; source?: string; profile?: ProfileId; harness?: HarnessId; register: boolean; uninstall: boolean; quiet: boolean; printPath: boolean; }

export function parseOptions(args: string[], env = process.env): Options {
  const o: Options = { home: env.SKILL_HEAVEN_PLUGIN_HOME ?? join(env.XDG_DATA_HOME ?? join(env.HOME ?? env.USERPROFILE ?? ".", ".local", "share"), "gaia-skill-heaven-agent-plugin"), register: false, uninstall: false, quiet: false, printPath: false };
  if (env.SKILL_HEAVEN_PROFILE) o.profile = env.SKILL_HEAVEN_PROFILE as ProfileId;
  if (env.SKILL_HEAVEN_HARNESS) o.harness = env.SKILL_HEAVEN_HARNESS as HarnessId;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--home", "--source", "--profile", "--harness"].includes(arg!)) {
      const value = args[++i]; if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--home") o.home = value;
      if (arg === "--source") o.source = value;
      if (arg === "--profile") o.profile = value as ProfileId;
      if (arg === "--harness") o.harness = value as HarnessId;
    } else if (arg === "--register") o.register = true;
    else if (arg === "--uninstall") o.uninstall = true;
    else if (arg === "--quiet" || arg === "-q") o.quiet = true;
    else if (arg === "--print-path") o.printPath = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (o.profile && o.profile !== "core" && o.profile !== "full") throw new Error("profile must be core or full");
  if (o.harness && !HARNESS_PATHS.some(h => h.id === o.harness)) throw new Error("unknown harness");
  o.home = resolve(o.home);
  if (o.home === dirname(o.home)) throw new Error("installation root cannot be a filesystem root");
  return o;
}
function pathsFor(home: string): PlanPaths { return { pluginDir: join(home, "marketplace", "plugins", "skill-heaven"), consoleDir: join(home, "marketplace", "plugins", "skill-heaven-console"), marketplaceDir: join(home, "marketplace") }; }
function previousAt(home: string): Receipt | null {
  if (!existsSync(home)) return null;
  if (lstatSync(home).isSymbolicLink() || !existsSync(join(home, MARKER))) throw new Error(`refusing to change unverified directory: ${home}`);
  if (!existsSync(join(home, "profile.json"))) return null; // legacy runtime-only artifact
  const r = JSON.parse(readFileSync(join(home, "profile.json"), "utf8")) as Receipt;
  if (r.schema !== "skill-heaven/install@1" || !["core", "full"].includes(r.profile) || (r.harness !== null && !HARNESS_PATHS.some(h => h.id === r.harness)) || typeof r.registered !== "boolean") throw new Error("invalid installation receipt; refusing mutation");
  if (r.incomplete !== undefined && typeof r.incomplete !== "boolean") throw new Error("invalid installation receipt; refusing mutation");
  if (r.incomplete && !r.transaction) throw new Error("legacy incomplete receipt: host ownership is unknown; recover the original registration manually before changing this artifact");
  if (r.transaction) {
    const t = r.transaction;
    if (!r.incomplete || !r.harness || !["register", "update", "switch", "remove"].includes(t.operation) || !["core", "full"].includes(t.target) || (t.previousProfile !== null && !["core", "full"].includes(t.previousProfile)) || typeof t.staged !== "boolean" || !Array.isArray(t.steps) || !Array.isArray(t.completed) || t.steps.some(s => typeof s !== "string") || t.completed.some(s => typeof s !== "string") || t.completed.length > t.steps.length || t.completed.some((s, i) => s !== t.steps[i]) ||
      (t.operation === "register" && (r.registered || t.previousProfile !== null)) ||
      (t.operation !== "register" && (!r.registered || t.previousProfile === null)) ||
      (t.operation === "switch" && t.previousProfile === t.target) ||
      (t.operation !== "switch" && t.previousProfile !== null && t.previousProfile !== t.target) ||
      (r.profile !== (t.staged ? t.target : t.previousProfile)) ||
      (!t.staged && !(t.operation === "switch" && t.target === "core"))) throw new Error("invalid transaction checkpoint; refusing mutation");
    let steps: RenderedStep[];
    try { steps = transactionSteps(r.harness, t, pathsFor(home)); }
    catch { throw new Error("operation contract unavailable; keep the artifact and checkpoint, recover with the original installer contract before retrying"); }
    if (JSON.stringify(t.steps) !== JSON.stringify(steps.map(stepIdentity))) throw new Error("operation contract changed; keep the artifact and checkpoint, recover with the original installer contract before retrying");
    if (t.pending !== undefined) throw new Error("interrupted host step has an unknown outcome; keep sources and checkpoint, reconcile that canonical step with the host before retrying; automatic removal is unsafe");
  }
  return r;
}
function saveReceipt(home: string, receipt: Receipt): void {
  const file = join(home, "profile.json");
  writeFileSync(file + ".next", JSON.stringify(receipt, null, 2) + "\n");
  renameSync(file + ".next", file);
}
function stepIdentity(s: RenderedStep): string {
  return JSON.stringify({ piece: s.piece, run: s.run, argv: s.argv, stdin: s.stdin ?? "" });
}
function transactionSteps(harness: HarnessId, t: Transaction, paths: PlanPaths): RenderedStep[] {
  const h = HARNESS_PATHS.find(h => h.id === harness)!;
  const plan = t.operation === "switch" ? planSwitch(h, t.previousProfile!, t.target, paths) : planProfile(h, t.target, t.operation, paths);
  if (plan.kind === "blocked") throw new Error(plan.reason);
  return plan.steps;
}
function checkpoint(home: string, receipt: Receipt): void {
  const t = receipt.transaction!;
  const steps = transactionSteps(receipt.harness!, t, pathsFor(home));
  for (let i = t.completed.length; i < steps.length; i++) {
    // A process interruption or failed post-success write cannot be mistaken
    // for a known failure. Such an ambiguous step requires manual recovery.
    t.pending = stepIdentity(steps[i]!); saveReceipt(home, receipt);
    try { executeSteps([steps[i]!], pathsFor(home)); }
    catch (e) { delete t.pending; saveReceipt(home, receipt); throw e; }
    t.completed.push(t.pending); delete t.pending;
    saveReceipt(home, receipt);
  }
}
function finish(home: string, receipt: Receipt): void {
  receipt.registered = true; receipt.incomplete = false; delete receipt.transaction;
  saveReceipt(home, receipt);
}
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
}
function gitRepository(path: string): void {
  const env = cleanGitEnv(); const nullDev = process.platform === "win32" ? "NUL" : "/dev/null";
  for (const args of [["init", "-q"], ["add", "--all"], ["-c", "commit.gpgsign=false", "-c", "user.name=Skill Heaven installer", "-c", "user.email=installer@skill-heaven.invalid", "commit", "--no-gpg-sign", "-qm", "Install Skill Heaven Agent Plugin"]]) {
    const r = spawnSync("git", ["-c", `core.hooksPath=${nullDev}`, ...args], { cwd: path, env, encoding: "utf8" });
    if (r.status !== 0) throw new Error("could not prepare the complete local plugin repository");
  }
}
// Each host owns registration. These argv templates are repository-controlled;
// paths are substituted AFTER tokenization, never interpreted as shell syntax.
export function executeSteps(steps: readonly RenderedStep[], paths: PlanPaths): void {
  for (const s of steps) {
    const data = s as RenderedStep & { argv?: readonly string[]; stdin?: string };
    if (!data.argv?.length) throw new Error(`no safe argv registration for ${s.run}`);
    const argv = data.argv.map(v => renderRun(v, paths));
    const result = spawnSync(argv[0]!, argv.slice(1), { stdio: ["pipe", "inherit", "inherit"], input: data.stdin ?? "", shell: false });
    if (result.status !== 0 || result.error) throw new Error(`host registration failed: ${argv[0]} (exit ${result.status ?? "unknown"}); keep the artifact and retry, do not assume the host cache refreshed`);
  }
}
function consoleSource(h: HarnessPath): string { return h.id === "claude" ? "skill-heaven-console" : `skill-heaven-console-${h.id}`; }
function required(path: string): void { if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error(`source archive is missing or redirects required artifact: ${path}`); }
function uninstallScripts(next: string): void {
  writeFileSync(join(next, "uninstall.sh"), `#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -P "$(dirname "$0")" && pwd)\n[ -f "$ROOT/${MARKER}" ] && [ -f "$ROOT/marketplace/plugins/skill-heaven/plugin.json" ] || { printf '%s\\n' 'refusing to remove unverified directory' >&2; exit 1; }\nexec node "$ROOT/install-profile.mjs" --home "$ROOT" --uninstall --register "$@"\n`, { mode: 0o755 });
  writeFileSync(join(next, "uninstall.ps1"), `$ErrorActionPreference = 'Stop'\nif (-not (Test-Path (Join-Path $PSScriptRoot '${MARKER}')) -or -not (Test-Path (Join-Path $PSScriptRoot 'marketplace/plugins/skill-heaven/plugin.json'))) { throw 'refusing to remove unverified directory' }\n& node (Join-Path $PSScriptRoot 'install-profile.mjs') --home $PSScriptRoot --uninstall --register @args\nif ($LASTEXITCODE -ne 0) { throw 'Uninstall failed' }\n`);
}
export function install(o: Options): void {
  const paths = pathsFor(o.home);
  if (o.printPath) { console.log(paths.pluginDir); return; }
  const previous = previousAt(o.home);
  if (previous?.harness && o.harness && previous.harness !== o.harness && (previous.registered || previous.incomplete)) throw new Error("uninstall the registered harness before changing --harness");
  if (previous?.transaction) {
    const t = previous.transaction;
    if (!o.register || o.uninstall !== (t.operation === "remove") || (o.profile && o.profile !== t.target)) throw new Error(`unfinished ${t.operation}: keep the artifact; retry --register${t.operation === "remove" ? " --uninstall" : ` --profile ${t.target}`} to resume the exact operation before requesting another operation; automatic partial-registration cleanup is unsafe`);
    if (t.staged && t.operation !== "remove") {
      checkpoint(o.home, previous); finish(o.home, previous);
      console.log(`Resumed ${t.operation} for ${previous.harness}.`); return;
    }
  }
  if (o.uninstall) {
    if (!existsSync(o.home)) { console.log(`Skill Heaven Agent Plugin is not installed at ${o.home}`); return; }
    if ((previous?.registered || previous?.incomplete) && !o.register) throw new Error("registered installation: use --uninstall --register to remove installer-owned host registrations first");
    if (o.register && previous?.harness && (previous.registered || previous.incomplete)) {
      const h = HARNESS_PATHS.find(h => h.id === previous.harness)!;
      if (!previous.transaction) {
        const t: Transaction = { operation: "remove", previousProfile: previous.profile, target: previous.profile, steps: [], completed: [], staged: true };
        t.steps = transactionSteps(h.id, t, paths).map(stepIdentity);
        previous.transaction = t; previous.incomplete = true; saveReceipt(o.home, previous);
      }
      checkpoint(o.home, previous);
    }
    rmSync(o.home, { recursive: true });
    console.log(`Removed the local Skill Heaven Agent Plugin artifact from ${o.home}`);
    console.log(previous?.registered ? "Installer-managed host registrations were removed. Other client-managed copies are untouched." : "Client-managed plugin copies and registrations were not removed.");
    return;
  }
  const profile = o.profile ?? previous?.transaction?.target ?? previous?.profile ?? "core";
  const harness = o.harness ?? previous?.harness ?? null;
  const h = harness === null ? null : HARNESS_PATHS.find(h => h.id === harness)!;
  if (profile === "full" && (!h || h.consolePiece === null)) throw new Error(h?.fullBlocked ?? "Full requires --harness claude|pi|codex|hermes|grok|agy");
  if (o.register && (!h || h.id === "other")) throw new Error("--register requires one known harness; an unknown client owns its own registration");
  if (previous?.harness && previous.harness !== harness && (previous.registered || previous.incomplete)) throw new Error("uninstall the registered harness before changing --harness");
  if (previous?.registered && previous.profile !== profile && !o.register) throw new Error("registered profile switch requires --register to change only the installer-owned console registration");
  if (!o.source) throw new Error("install requires an extracted --source archive");
  const source = resolve(o.source);
  for (const file of ["plugin.json", "mcp.json", "skills/summon/SKILL.md", "mcp/skill-summon.mjs"]) required(join(source, "plugins", "skill-heaven", file));
  required(join(source, "scripts", "install-profile.mjs"));
  required(join(source, ".claude-plugin", "marketplace.json"));
  if (profile === "full") required(join(source, "plugins", consoleSource(h!)));
  mkdirSync(dirname(o.home), { recursive: true });
  const work = mkdtempSync(join(dirname(o.home), ".gaia-skill-heaven-agent-plugin."));
  const next = join(work, "install"), old = join(work, "old");
  try {
    const staged = pathsFor(next); mkdirSync(join(next, "marketplace", "plugins"), { recursive: true });
    cpSync(join(source, "plugins", "skill-heaven"), staged.pluginDir, { recursive: true });
    if (profile === "full") cpSync(join(source, "plugins", consoleSource(h!)), staged.consoleDir, { recursive: true });
    const market = JSON.parse(readFileSync(join(source, ".claude-plugin", "marketplace.json"), "utf8"));
    market.plugins = market.plugins.filter((p: { source: string }) => p.source === "./plugins/skill-heaven" || (profile === "full" && p.source === "./plugins/skill-heaven-console"));
    if (market.plugins.length !== (profile === "full" ? 2 : 1)) throw new Error("could not write the local marketplace manifest");
    mkdirSync(join(next, "marketplace", ".claude-plugin"));
    writeFileSync(join(next, "marketplace", ".claude-plugin", "marketplace.json"), JSON.stringify(market, null, 2) + "\n");
    // Commit the marketplace payload before nested repositories exist: local
    // marketplace clones need real files, not gitlinks to standalone pieces.
    gitRepository(staged.marketplaceDir);
    gitRepository(staged.pluginDir); if (profile === "full") gitRepository(staged.consoleDir);
    cpSync(join(source, "scripts", "install-profile.mjs"), join(next, "install-profile.mjs"));
    writeFileSync(join(next, MARKER), "skill-heaven/install@1\n"); uninstallScripts(next);
    const receipt: Receipt = { schema: "skill-heaven/install@1", profile, harness, registered: previous?.registered ?? false, incomplete: false };
    if (o.register && h) {
      const t: Transaction = previous?.transaction ?? {
        operation: !previous?.registered ? "register" : previous.profile === profile ? "update" : "switch",
        previousProfile: previous?.registered ? previous.profile : null, target: profile,
        steps: [], completed: [], staged: true,
      };
      if (!previous?.transaction) t.steps = transactionSteps(h.id, t, paths).map(stepIdentity);
      receipt.transaction = t; receipt.incomplete = true;
      if (t.operation === "switch" && profile === "core") {
        // Checkpoint removal while the console source/helper is still present.
        // A failed stage/rename leaves this recoverable receipt at the old home.
        t.staged = false; previous!.transaction = t; previous!.incomplete = true;
        saveReceipt(o.home, previous!); checkpoint(o.home, previous!);
      }
      receipt.transaction = { ...t, staged: true };
    }
    saveReceipt(next, receipt);
    if (existsSync(o.home)) renameSync(o.home, old);
    try { renameSync(next, o.home); } catch (e) {
      if (existsSync(old)) {
        try { renameSync(old, o.home); }
        catch { throw new Error(`could not restore the previous artifact; it is preserved at ${old}; restore it to ${o.home} before retrying`); }
      }
      throw e;
    }
    if (o.register && h) {
      checkpoint(o.home, receipt); finish(o.home, receipt);
    }
    if (o.quiet) console.log(`${paths.pluginDir}\n${paths.marketplaceDir}`);
    else {
      const found = h?.bin ? [h.id] : HARNESS_PATHS.filter(x => x.bin && onPath(x.bin)).map(x => x.id);
      console.log(renderInstallEpilogue({ profile, previous: previous?.profile ?? null, found, paths: { ...paths, installHome: o.home, uninstall: join(o.home, process.platform === "win32" ? "uninstall.ps1" : "uninstall.sh") } }));
      if (o.register) console.log(`Registered ${profile} for ${h!.name} using its own plugin manager. Restart the harness (Pi: /reload).`);
      else console.log("Artifact staged only. Run the printed registration/removal commands; cached client copies do not refresh automatically.");
    }
  } finally {
    // Never delete the only remaining source/helper when restoration failed.
    if (!(existsSync(old) && !existsSync(o.home))) rmSync(work, { recursive: true, force: true });
  }
}
function onPath(bin: string): boolean {
  const separator = process.platform === "win32" ? ";" : ":";
  return (process.env.PATH ?? "").split(separator).some(dir => [bin, ...(process.platform === "win32" ? [bin + ".exe", bin + ".cmd"] : [])].some(name => existsSync(join(dir, name))));
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { install(parseOptions(process.argv.slice(2))); } catch (e) { console.error(`skill-heaven-agent-plugin-install: ${e instanceof Error ? e.message : "installation failed"}`); process.exitCode = 1; }
}
