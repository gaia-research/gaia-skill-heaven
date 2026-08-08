// The grok-heaven launch plan. Core owns the version-pinned Grok route; this
// module resolves --skill paths, substitutes session placeholders, and carries
// the plan to the CLI. It never writes shared Grok state.

import { spawnSync } from "node:child_process";
import { readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  compile,
  LEVEL_ALIASES,
  UNRATIFIED_LEVELS,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-heaven";

export const UNRATIFIED: ReadonlySet<string> = new Set(UNRATIFIED_LEVELS);

/** Refuse only values with no ratified product meaning. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && UNRATIFIED.has(level)) {
    throw new Error(
      `level "${level}" is UNRATIFIED. Ultra has no approved ` +
        `product mapping to compose, so grok-heaven refuses rather than guessing.`,
    );
  }
}

export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "product-floor" (`--level off`) */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated copies each directory into the scoped profile. */
  skillPaths?: string[];
  model?: string;
  /** Pass "$SESSION" for dry-run output. */
  sessionDir: string;
  grokArgs?: string[];
}

export interface LaunchPlan {
  posture: Posture;
  command: string;
  argv: string[];
  env: Record<string, string>;
  fsPlan: FsOp[];
  notes: string[];
  skillCount: number;
  /** The resolved names copied into the session for curated readmission. */
  skillIds: string[];
  /** The cwd whose project-scope skills must be discovered. */
  workingDirectory: string;
  execSupport: CompileResult["execSupport"];
}

const subst = (value: string, sessionDir: string): string =>
  value.replaceAll("$SESSION", sessionDir).replaceAll("$CWD", process.cwd());

function formatIgnoreEntries(paths: string[]): string {
  return paths.map((path) => `  ${JSON.stringify(path)},`).join("\n");
}

function discoverSymlinkIgnores(): string[] {
  const root = join(homedir(), ".agents", "skills");
  try {
    return readdirSync(root).flatMap((name) => {
      const path = join(root, name);
      try {
        const target = realpathSync(path);
        return target === path ? [] : [target];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function discoverAncestorIgnores(): string[] {
  const roots = [".grok", ".agents", ".claude", ".cursor"];
  const paths: string[] = [];
  let current = process.cwd();
  while (true) {
    for (const root of roots) paths.push(join(current, root, "skills"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths;
}

function substituteConfig(value: string, sessionDir: string): string {
  const symlinkIgnores = discoverSymlinkIgnores();
  return subst(value, sessionDir)
    .replace(
      '  "$SYMLINK_IGNORES",\n',
      formatIgnoreEntries(symlinkIgnores) + (symlinkIgnores.length ? "\n" : ""),
    )
    .replace('  "$ANCESTOR_IGNORES"\n', formatIgnoreEntries(discoverAncestorIgnores()) + "\n");
}

function parseWorkingDirectory(args: string[]): string {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--cwd") {
      const value = args[index + 1];
      if (value) return resolve(value);
    }
    if (arg.startsWith("--cwd=")) return resolve(arg.slice("--cwd=".length));
  }
  return process.cwd();
}

interface GrokSkillMetadata {
  name: string;
  source: { path: string };
}

interface GrokPluginMetadata {
  name: string;
  enabled: boolean;
}

interface GrokInspectReport {
  skills: GrokSkillMetadata[];
  plugins?: GrokPluginMetadata[];
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function inspectGrok(home: string, cwd: string): GrokInspectReport {
  const result = spawnSync("grok", ["inspect", "--json"], {
    cwd,
    env: { ...process.env, GROK_HOME: home },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`could not run grok inspect: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || "").trim();
    throw new Error(`grok inspect failed${detail ? `: ${detail}` : ""}`);
  }
  try {
    const report = JSON.parse(String(result.stdout || "")) as GrokInspectReport;
    if (!Array.isArray(report.skills)) throw new Error("grok inspect returned no skill data");
    return report;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`grok inspect returned invalid JSON: ${error.message}`);
    throw error;
  }
}

function writeGrokSessionConfig(home: string, ignores: Set<string>, disabledPlugins: Set<string>): void {
  let config = "[compat.claude]\nskills = false\n\n[compat.cursor]\nskills = false\n\n";
  if (disabledPlugins.size) {
    config += `[plugins]\ndisabled = [${[...disabledPlugins].sort().map((name) => JSON.stringify(name)).join(", ")}]\n\n`;
  }
  config += "[skills]\nignore = [\n";
  for (const path of [...ignores].sort()) config += `  ${JSON.stringify(path)},\n`;
  config += "]\n";
  writeFileSync(join(home, "config.toml"), config);
}

/**
 * Complete WP14's Grok composition after the base fsPlan is materialized.
 * `grok inspect --json` is the hard disk enumerator. A few passes are needed:
 * disabling Claude compatibility can expose a second user root, and plugin
 * skills require the observed plugin names in addition to path ignores.
 */
export function prepareGrokSession(plan: LaunchPlan): void {
  if (plan.command !== "grok" || plan.posture === "native") return;
  const home = plan.env.GROK_HOME;
  if (!home) throw new Error("grok session is missing GROK_HOME");

  const readmitted = new Set(
    plan.skillIds.map((id) => canonicalPath(join(home, "skills", id, "SKILL.md"))),
  );
  const ignores = new Set<string>();
  const disabledPlugins = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const before = `${[...ignores].sort().join("\n")}\0${[...disabledPlugins].sort().join("\n")}`;
    const report = inspectGrok(home, plan.workingDirectory);
    for (const skill of report.skills) {
      if (readmitted.has(canonicalPath(skill.source.path))) continue;
      ignores.add(skill.source.path);
      ignores.add(dirname(skill.source.path));
    }
    if (plan.posture === "floor" || plan.posture === "curated") {
      for (const plugin of report.plugins ?? []) {
        if (plugin.enabled) disabledPlugins.add(plugin.name);
      }
    }
    writeGrokSessionConfig(home, ignores, disabledPlugins);
    const after = `${[...ignores].sort().join("\n")}\0${[...disabledPlugins].sort().join("\n")}`;
    if (before === after) break;
  }
}

function substituteFsOp(op: FsOp, sessionDir: string): FsOp {
  if (op.kind === "write") {
    return { ...op, path: subst(op.path, sessionDir), contents: substituteConfig(op.contents, sessionDir) };
  }
  return { ...op, from: subst(op.from, sessionDir), to: subst(op.to, sessionDir) };
}

/** Plan a Grok launch grounded in ../PROBE.md. */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "product-floor";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((path) => resolveSkill(path));

  const compiled = compile({
    posture,
    harness: "grok",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.grokArgs?.length ? { passthrough: opts.grokArgs } : {}),
  });

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(compiled.env)) env[key] = subst(value, opts.sessionDir);

  return {
    posture,
    command: compiled.command,
    argv: compiled.argv.map((arg) => subst(arg, opts.sessionDir)),
    env,
    fsPlan: compiled.fsPlan.map((op) => substituteFsOp(op, opts.sessionDir)),
    notes: compiled.notes,
    skillCount: skills.length,
    skillIds: skills.map((skill) => skill.id),
    workingDirectory: parseWorkingDirectory(opts.grokArgs ?? []),
    execSupport: compiled.execSupport,
  };
}
