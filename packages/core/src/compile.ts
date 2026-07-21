// Pure profile compiler (M2 plan §4). compile() does ZERO I/O: it maps a
// posture × harness × mechanism onto the M0-verified in-harness flags and an
// fsPlan whose paths use the "$SESSION" placeholder; exec() substitutes it
// after mkdtemp. It composes flags and execs; it never stashes, restores, or
// mutates shared state (P3).

import type { ResolvedSkill } from "./skills.js";

export const POSTURES = ["floor", "curated", "native"] as const;
export type Posture = (typeof POSTURES)[number];

export const HARNESSES = ["claude", "pi", "codex", "cursor", "grok"] as const;
export type Harness = (typeof HARNESSES)[number];

export const MECHANISMS = ["plugin-dir", "config-dir"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

// Frozen by the T6 spike (see README "T6 spike result" + gaia-research
// docs/labs/harness-capability-matrix.md rows T6/T7).
export const DEFAULT_CLAUDE_MECHANISM: Mechanism = "plugin-dir";

// Heaven-lane levels only; med..max are the gated hell lane (P2, mapping OPEN
// item 3). Vocabulary per N3; provisional pending N4/N5.
export const LEVEL_ALIASES: Record<string, Posture> = { off: "floor", low: "curated" };
export const HELL_LEVELS = ["med", "high", "xhigh", "max"] as const;

export type FsOp =
  | { kind: "write"; path: string; contents: string }
  | { kind: "copyDir"; from: string; to: string }
  | { kind: "copyFileIfExists"; from: string; to: string };

export interface DoseSummary {
  tokenizer: "chars4";
  skills: Array<{ id: string; standingTokens: number; invocationTokens: number }>;
  standingTotal: number;
  invocationTotal: number;
}

export interface CompileInput {
  posture: Posture;
  harness: Harness;
  mechanism?: Mechanism;
  skills: ResolvedSkill[];
  model?: string;
  effort?: string;
  prompt?: string; // headless when present; interactive otherwise
  jsonOutput?: boolean; // force --output-format json (record mode)
  passthrough?: string[];
  homeDir?: string; // for config-dir credential copy; "$HOME" placeholder default
}

export interface CompileResult {
  command: string;
  argv: string[];
  env: Record<string, string>; // additions only — never removals
  fsPlan: FsOp[];
  notes: string[];
  doseSummary: DoseSummary;
  // "exec": verified cells allow spawning. "recipe": compiled from doc-verified
  // or unverified cells — print it, do not spawn (M2 plan §4).
  execSupport: "exec" | "recipe";
}

export function doseSummary(skills: ResolvedSkill[]): DoseSummary {
  return {
    tokenizer: "chars4",
    skills: skills.map((s) => ({
      id: s.id,
      standingTokens: s.standingTokens,
      invocationTokens: s.invocationTokens,
    })),
    standingTotal: skills.reduce((a, s) => a + s.standingTokens, 0),
    invocationTotal: skills.reduce((a, s) => a + s.invocationTokens, 0),
  };
}

export function compile(input: CompileInput): CompileResult {
  const { posture, harness, skills } = input;

  if (posture === "curated" && skills.length === 0) {
    throw new Error("--posture curated requires at least one --skill <path>");
  }
  if (posture !== "curated" && skills.length > 0) {
    throw new Error(`--skill is only valid with --posture curated (got posture ${posture})`);
  }

  const base: Omit<CompileResult, "command" | "argv" | "execSupport"> = {
    env: {},
    fsPlan: [],
    notes: [],
    doseSummary: doseSummary(skills),
  };

  switch (harness) {
    case "claude":
      return compileClaude(input, base);
    case "pi":
      return compilePi(input, base);
    case "codex":
      return compileCodex(input, base);
    case "cursor":
      return compileCursor(input, base);
    case "grok":
      return compileGrok(input, base);
  }
}

function tailArgs(input: CompileInput, harness: "claude" | "pi"): string[] {
  const argv: string[] = [];
  if (input.model) argv.push("--model", input.model);
  if (input.effort && harness === "claude") argv.push("--effort", input.effort);
  if (input.prompt !== undefined) {
    if (harness === "claude") {
      argv.push("-p", input.prompt);
      if (input.jsonOutput) argv.push("--output-format", "json");
    } else {
      argv.push("-p", input.prompt);
      if (input.jsonOutput) argv.push("--mode", "json");
    }
  }
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return argv;
}

// Claude Code — M0-verified flags (matrix, empirical, v2.1.211/2.1.215).
function compileClaude(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const floorArgv = [
    "--disable-slash-commands", // T2: full per-session skills suppression
    "--strict-mcp-config", // AT-H5 zero-server
    "--mcp-config",
    '{"mcpServers":{}}',
  ];
  const notes = [...base.notes];
  const fsPlan = [...base.fsPlan];
  const env = { ...base.env };
  let argv: string[];

  if (input.posture === "native") {
    argv = []; // P3: exiting = switching, literally — no flags, no env, no fsPlan
  } else if (input.posture === "floor") {
    // T9b (2.1.215): --setting-sources project + CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1
    // stacked on the T2 floor removes the bundled-CLI-skills listing AND the
    // user-CLAUDE.md residual — observed listing-probe answer: NONE, zero residual.
    argv = [...floorArgv, "--setting-sources", "project"];
    env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS = "1";
    notes.push(
      "floor (T9b route): skills+server floor with zero listing residual. CLAUDE_CODE_DISABLE_BUNDLED_SKILLS is an undocumented env knob (string-probed from the 2.1.215 binary, verified live) — version-pinned, re-verify on CLI upgrades. --setting-sources project also evicts user CLAUDE.md (prompt-content side effect; full prompt eviction remains M2b).",
    );
  } else {
    const mechanism = input.mechanism ?? DEFAULT_CLAUDE_MECHANISM;
    if (mechanism === "plugin-dir") {
      // T6 (2.1.215): --disable-slash-commands eats --plugin-dir skills too, so
      // curated CANNOT ride on the floor argv. T9: --setting-sources project
      // evicts user-dir skills AND the user CLAUDE.md while --plugin-dir
      // re-admission stays live, and CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1
      // removes the bundled-CLI-skills residual T8 had — observed listing:
      // the curated set only.
      argv = [
        "--setting-sources",
        "project",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--plugin-dir",
        "$SESSION/heaven-set",
      ];
      env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS = "1";
      fsPlan.push({
        kind: "write",
        path: "$SESSION/heaven-set/.claude-plugin/plugin.json",
        contents:
          JSON.stringify(
            {
              name: "heaven-set",
              description: "Session-scoped curated skill set (Skill Heaven launcher)",
              version: "0.0.0",
            },
            null,
            2,
          ) + "\n",
      });
      for (const s of input.skills) {
        fsPlan.push({ kind: "copyDir", from: s.dir, to: `$SESSION/heaven-set/skills/${s.id}` });
      }
      notes.push(
        "curated via --setting-sources project + --plugin-dir + CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 (T9; supersedes T8 — owner vetoed the bundled-skills residual). T6 was NEGATIVE on 2.1.215: --disable-slash-commands suppresses plugin-provided skills too, so curated does not use it. Zero listing residual observed (2/2 runs); the env knob is undocumented (string-probed from the 2.1.215 binary) — version-pinned, re-verify on CLI upgrades.",
      );
    } else {
      const home = input.homeDir ?? "$HOME";
      argv = []; // NO suppression flag — it would eat the curated set
      env.CLAUDE_CONFIG_DIR = "$SESSION/config";
      fsPlan.push({
        kind: "copyFileIfExists",
        from: `${home}/.claude/.credentials.json`,
        to: "$SESSION/config/.credentials.json",
      });
      for (const s of input.skills) {
        fsPlan.push({ kind: "copyDir", from: s.dir, to: `$SESSION/config/skills/${s.id}` });
      }
      notes.push(
        "curated via CLAUDE_CONFIG_DIR (T3 route). Known leaks: fresh config dirs are auto-seeded with bundled skills, and project-level .claude/skills of the cwd repo still load (T3 observation).",
      );
    }
  }

  argv.push(...tailArgs(input, "claude"));
  return { command: "claude", argv, env, fsPlan, notes, doseSummary: base.doseSummary, execSupport: "exec" };
}

// pi — native Heaven primitive: --no-skills (evict) + repeatable --skill
// (curated readmit). Re-verified empirically before live exec (M2 plan §4).
function compilePi(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  // pi 0.80.10 quirk (verified 2026-07-19): `--no-skills` immediately followed
  // by `-p` silently loses the suppression (vanilla listing returned); any
  // other ordering yields NONE. Tail args therefore go FIRST.
  const argv: string[] = [...tailArgs(input, "pi")];
  const notes = [
    ...base.notes,
    "pi argv ordering is load-bearing: `--no-skills -p` (adjacent) drops suppression on pi 0.80.10 — launcher emits -p before the skill flags.",
  ];
  if (input.posture === "floor") {
    argv.push("--no-skills");
  } else if (input.posture === "curated") {
    argv.push("--no-skills");
    for (const s of input.skills) argv.push("--skill", s.dir);
  }
  return { ...base, notes, command: "pi", argv, execSupport: "exec" };
}

// codex — recipe from matrix cells: $CODEX_HOME scoping + per-skill
// config.toml toggles. Stays a recipe unless the per-session -c scoping cell
// verifies (M2 plan §4); probe results recorded in the matrix.
function compileCodex(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const fsPlan = [...base.fsPlan];
  const notes = [...base.notes];
  const argv: string[] = ["exec"];
  if (input.posture !== "native") {
    env.CODEX_HOME = "$SESSION/codex";
    fsPlan.push({
      kind: "copyFileIfExists",
      from: `${input.homeDir ?? "$HOME"}/.codex/auth.json`,
      to: "$SESSION/codex/auth.json",
    });
    notes.push(
      "codex recipe: $CODEX_HOME scoping gives an empty skills surface (floor); curated adds skill dirs under $CODEX_HOME. Doc-verified + probe evidence only — launcher does not spawn codex (recipe track).",
    );
    if (input.posture === "curated") {
      for (const s of input.skills) {
        fsPlan.push({ kind: "copyDir", from: s.dir, to: `$SESSION/codex/skills/${s.id}` });
      }
    }
  }
  if (input.model) argv.push("-m", input.model);
  if (input.prompt !== undefined) argv.push(input.prompt);
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return { command: "codex", argv, env, fsPlan, notes, doseSummary: base.doseSummary, execSupport: "recipe" };
}

// cursor — documented-recipe track regardless (rules are tracked files;
// eviction dirties git — ratified posture).
function compileCursor(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const notes = [...base.notes];
  const argv: string[] = [];
  if (input.posture !== "native") {
    env.CURSOR_CONFIG_DIR = "$SESSION/cursor-config";
    notes.push(
      "cursor recipe: CURSOR_CONFIG_DIR scopes user config, but tracked .cursor/rules of the cwd repo cannot be suppressed per-session — cursor stays on the documented-recipe track (matrix 'eviction dirties git' = yes).",
    );
  }
  if (input.prompt !== undefined) argv.push("-p", input.prompt);
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return { command: "cursor-agent", argv, env, fsPlan: base.fsPlan, notes, doseSummary: base.doseSummary, execSupport: "recipe" };
}

// grok — in scope per D7, starting from zero. v0.2.103 probe: no skills
// surface (no --no-skills / skill flags in `grok --help`; config via
// ~/.grok/config.toml; plugins exist). No verified suppression/readmission
// mechanism — do not guess (M0 discipline): recipe is a stub that says so.
function compileGrok(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  if (input.posture !== "native") {
    throw new Error(
      "grok: no verified skills-suppression/re-admission mechanism (v0.2.103 --help probe found no skills surface). " +
        "Refusing to guess (D7 / M0 discipline) — see the grok column in gaia-research docs/labs/harness-capability-matrix.md. " +
        "Only --posture native compiles for grok today.",
    );
  }
  const notes = [
    ...base.notes,
    "grok v0.2.103: native posture only — no skill-discovery/suppression flags found (--help probe); capability-matrix grok column tracks the open cells.",
  ];
  const argv: string[] = [];
  if (input.model) argv.push("-m", input.model);
  if (input.prompt !== undefined) argv.push("-p", input.prompt);
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return { ...base, notes, command: "grok", argv, execSupport: "recipe" };
}
