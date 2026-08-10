// The codex-zero launch plan resolves skill sources and carries core's
// version-pinned argv/fsPlan to the CLI. The real launcher has one additional
// session-only step: after materializing CODEX_HOME, prepareCodexSession asks
// codex app-server for exact discovered skill paths and writes the disable set
// into that disposable home. It never edits shared state or the compiled argv.

import { spawnSync } from "node:child_process";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compile,
  LEVEL_ALIASES,
  UNRATIFIED_LEVELS,
  resolveSkill,
  type CompileResult,
  type FsOp,
  type Posture,
  type ResolvedSkill,
} from "skill-zero";

export const UNRATIFIED: ReadonlySet<string> = new Set(UNRATIFIED_LEVELS);

/** Refuse only values with no ratified product meaning. */
export function assertLevelAllowed(level: string | undefined): void {
  if (level && UNRATIFIED.has(level)) {
    throw new Error(
      `level "${level}" is UNRATIFIED. Ultra has no approved ` +
        `product mapping to compose, so codex-zero refuses rather than guessing.`,
    );
  }
}

/** Resolve a Heaven --level alias to its posture, or undefined. */
export function resolveLevelAlias(level: string): Posture | undefined {
  return LEVEL_ALIASES[level];
}

export interface LaunchOptions {
  /** default "product-floor" (`--level off`) */
  posture?: Posture;
  /** --skill <path>, repeatable. Curated only; core rejects it elsewhere. */
  skillPaths?: string[];
  model?: string;
  /** session dir: real writes land here (auth.json copy, curated skill dirs
   * under $SESSION/codex — see core's compileCodex). Pass "$SESSION" for a
   * dry run — nothing is written, and the printed plan then carries core's
   * own placeholder rather than a fake path. */
  sessionDir: string;
  codexArgs?: string[]; // passthrough to codex (after our flags, e.g. the prompt)
}

export interface LaunchPlan {
  posture: Posture;
  command: string;
  argv: string[];
  env: Record<string, string>; // additions only (never removals)
  /** core's fsPlan, already substituted for this session dir. cli.ts
   * materializes it before the dynamic skills/list composition; nothing outside
   * the session dir is ever touched (P3). */
  fsPlan: FsOp[];
  /** core's compile notes, carried verbatim so the evidence travels with the plan. */
  notes: string[];
  skillCount: number;
  /** The resolved names copied into the session for curated readmission. */
  skillIds: string[];
  /** The cwd used by Codex's project-scope skill discovery. */
  workingDirectory: string;
  /** WP14's exact-path discovery licenses live exec on codex-cli 0.146.0. */
  execSupport: CompileResult["execSupport"];
}

const substSession = (s: string, sessionDir: string) => s.replaceAll("$SESSION", sessionDir);

function parseWorkingDirectory(args: string[]): string {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-C" || arg === "--cd") {
      const value = args[index + 1];
      if (value) return resolve(value);
    }
    if (arg.startsWith("--cd=")) return resolve(arg.slice("--cd=".length));
  }
  return process.cwd();
}

interface CodexSkillMetadata {
  path: string;
  enabled: boolean;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function discoverCodexSkills(home: string, cwd: string): CodexSkillMetadata[] {
  const requestPath = join(home, ".skill-list-request.jsonl");
  const request = [
    {
      method: "initialize",
      id: 1,
      params: {
        clientInfo: { name: "codex-zero", version: "0.0.0" },
        capabilities: { experimentalApi: true },
      },
    },
    { method: "initialized" },
    { method: "skills/list", id: 2, params: { cwds: [cwd], forceReload: true } },
  ]
    .map((message) => JSON.stringify(message))
    .join("\n");
  writeFileSync(requestPath, `${request}\n`);

  try {
    // app-server performs the disk scan asynchronously. Keep stdin open long
    // enough for the response, while keeping every write under CODEX_HOME.
    const shell = `{ cat ${shellQuote(requestPath)}; sleep 3; } | codex app-server --stdio`;
    const result = spawnSync("sh", ["-c", shell], {
      cwd,
      env: { ...process.env, CODEX_HOME: home },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw new Error(`could not run codex skills/list: ${result.error.message}`);
    if (result.status !== 0) {
      const detail = String(result.stderr || "").trim();
      throw new Error(`codex skills/list failed${detail ? `: ${detail}` : ""}`);
    }

    const rows = String(result.stdout || "")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as { id?: number; result?: { data?: Array<{ skills?: CodexSkillMetadata[] }> } });
    const response = rows.find((row) => row.id === 2)?.result;
    const skills = response?.data?.flatMap((entry) => entry.skills ?? []);
    if (!skills) throw new Error("codex skills/list returned no skill data");
    return skills;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`codex skills/list returned invalid JSON: ${error.message}`);
    throw error;
  } finally {
    rmSync(requestPath, { force: true });
  }
}

/**
 * Complete WP14's dynamic Codex composition after the base fsPlan is materialized.
 * The app-server scan is intentionally outside core's pure compile() function:
 * --print remains a dry plan, while a real door launch discovers the exact roots
 * present in this session and writes only the disposable CODEX_HOME config.
 */
export function prepareCodexSession(plan: LaunchPlan): void {
  if (plan.command !== "codex" || plan.posture === "native") return;
  const home = plan.env.CODEX_HOME;
  if (!home) throw new Error("codex session is missing CODEX_HOME");

  const readmitted = new Set(
    plan.skillIds.map((id) => canonicalPath(join(home, "skills", id, "SKILL.md"))),
  );
  const discovered = discoverCodexSkills(home, plan.workingDirectory);
  const config = discovered
    .filter((skill) => !readmitted.has(canonicalPath(skill.path)))
    .map(
      (skill) =>
        `[[skills.config]]\npath = ${JSON.stringify(skill.path)}\nenabled = false\n`,
    )
    .join("\n");
  writeFileSync(join(home, "config.toml"), config);
}

/** Plan a launch at any posture core composes for codex (see ../PROBE.md for what was verified). */
export function planLaunch(opts: LaunchOptions): LaunchPlan {
  const posture: Posture = opts.posture ?? "product-floor";
  const skills: ResolvedSkill[] = (opts.skillPaths ?? []).map((p) => resolveSkill(p));

  const compiled = compile({
    posture,
    harness: "codex",
    skills,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.codexArgs?.length ? { passthrough: opts.codexArgs } : {}),
  });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(compiled.env)) env[k] = substSession(v, opts.sessionDir);

  return {
    posture,
    command: compiled.command,
    argv: compiled.argv.map((a) => substSession(a, opts.sessionDir)),
    env,
    fsPlan: compiled.fsPlan.map((op) =>
      op.kind === "write"
        ? { ...op, path: substSession(op.path, opts.sessionDir) }
        : { ...op, from: substSession(op.from, opts.sessionDir), to: substSession(op.to, opts.sessionDir) },
    ),
    notes: compiled.notes,
    skillCount: skills.length,
    skillIds: skills.map((skill) => skill.id),
    workingDirectory: parseWorkingDirectory(opts.codexArgs ?? []),
    execSupport: compiled.execSupport,
  };
}
