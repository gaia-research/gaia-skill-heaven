// Pure profile compiler (M2 plan §4). compile() does ZERO I/O: it maps a
// posture × harness × mechanism onto the M0-verified in-harness flags and an
// fsPlan whose paths use the "$SESSION" placeholder; exec() substitutes it
// after mkdtemp. It composes flags and execs; it never stashes, restores, or
// mutates shared state (P3).

import type { ResolvedSkill } from "./skills.js";

// THE FLOOR SPLIT (founder ruling V5-5, 2026-07-28).
//
// There are TWO floors and they are different objects. F6 proved they cannot be
// the same one: `--disable-slash-commands` at the ratified T9b floor suppresses
// plugin COMMANDS as well as plugin skills, so `/skill-heaven` does not exist
// there — "the clean room as currently composed has no door".
//
//   "floor"          the BENCHMARK floor. Completely doorless. It is the
//                    placebo-of-record (B2) and its route is byte-frozen at
//                    T9b — nothing in this split touches it.
//   "product-floor"  the DOORFUL floor. It keeps the minimum control surface;
//                    P8 also uses an empty setting-sources allowlist so project
//                    scope is not admitted. F7 prices the door at +515 tok
//                    (20,176 vs 19,661), still -28.9% off native's 28,379.
//
// They are measured and named separately and priced as SEPARATE ARMS (B1).
// Never average them into one number, and never let one stand in for the other:
// the placebo-of-record is the doorless floor and only the doorless floor.
export const POSTURES = ["floor", "product-floor", "curated", "native"] as const;
export type Posture = (typeof POSTURES)[number];

/** Which floor a posture is, or null when it is not a floor at all. */
export type FloorKind = "benchmark" | "product";

export function floorOf(posture: Posture): FloorKind | null {
  if (posture === "floor") return "benchmark";
  if (posture === "product-floor") return "product";
  return null;
}

// Unambiguous spellings, so no surface has to rely on a bare "floor" meaning
// one of the two. `floor` is retained as the benchmark floor's canonical value
// (it is what the ratified T9b route and every existing placebo record call it).
export const POSTURE_ALIASES: Record<string, Posture> = {
  "benchmark-floor": "floor",
};

// F6/F7, PR #4, Claude Code 2.1.216, probed 2026-07-24. Recorded here so no
// surface re-derives or re-guesses these numbers; a test asserts the arithmetic
// and that no averaged floor number is exported.
export const FLOOR_EVIDENCE = {
  finding: "F6/F7",
  harness: { name: "claude", version: "2.1.216" },
  probedAt: "2026-07-24",
  /** native standing dose, same harness */
  nativeTokens: 28379,
  /** the doorless benchmark floor (T9b) — placebo-of-record */
  benchmarkFloorTokens: 19661,
  /** the doorful product floor (T9b minus --disable-slash-commands) */
  productFloorTokens: 20176,
  /** what the door costs, priced on its own and never folded into either floor */
  doorTokens: 515,
  /** product floor vs native, one decimal, as reported in F7 */
  productFloorVsNativePct: -28.9,
} as const;

export const HARNESSES = ["claude", "pi", "codex", "hermes", "cursor", "grok"] as const;
export type Harness = (typeof HARNESSES)[number];

export const MECHANISMS = ["plugin-dir", "config-dir"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

// Frozen by the T6 spike (see README "T6 spike result" + gaia-research
// docs/labs/harness-capability-matrix.md rows T6/T7).
export const DEFAULT_CLAUDE_MECHANISM: Mechanism = "plugin-dir";

// Heaven-lane levels only; med..max are the gated hell lane (P2, mapping OPEN
// item 3). Vocabulary per N3; provisional pending N4/N5.
export const LEVEL_ALIASES: Record<string, Posture> = { off: "product-floor", low: "curated" };
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
  // product-floor only: the caller's own door plugin dir, mounted with
  // --plugin-dir. Caller-supplied on purpose — core does not know, and must not
  // assume, which package the door ships in (the package topology is
  // deliberately open; V5-4). Omit it and product-floor still compiles: the
  // route permits a door, mounting one is the door package's business.
  doorPluginDir?: string;
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
  if (input.doorPluginDir && posture !== "product-floor") {
    throw new Error(
      `doorPluginDir is only valid with --posture product-floor (got posture ${posture}) — ` +
        "the benchmark floor is doorless by ruling (V5-5/B2) and curated mounts its own set",
    );
  }
  // M0 discipline: the doorful floor exists as a measured cell on claude (F7,
  // 2.1.216) and, as of WP2 (PROBE.md, pi 0.83.0, probed 2026-08-07), pi. No
  // Hermes 0.20.0 also has a probed best-effort distinction: --safe-mode is
  // the maximal benchmark floor, while --ignore-user-config --ignore-rules
  // preserves plugins/MCP for the doorful floor. Neither suppresses Hermes'
  // installed-skills index; compileHermes discloses that negative result and
  // remains recipe-only.
  const PRODUCT_FLOOR_VERIFIED_HARNESSES: readonly Harness[] = ["claude", "pi", "hermes", "grok"];
  if (posture === "product-floor" && !PRODUCT_FLOOR_VERIFIED_HARNESSES.includes(harness)) {
    throw new Error(
      `--posture product-floor has no verified cell for harness ${harness} — only claude (F7, 2.1.216), ` +
        "pi (PROBE.md, 0.83.0), hermes (PROBE.md, 0.20.0), and grok (PROBE.md, 0.2.118) were probed. This is a harness-capability gap, not a policy hold (P2 gates the Hell lane only): nobody has verified whether this composes here at all, so there is nothing to " +
        "withhold or grant a key to. Refusing to guess (M0 discipline); use --posture floor, or add the row " +
        "to the harness capability matrix first.",
    );
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
    case "hermes":
      return compileHermes(input, base);
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
      "floor (T9b route) = the BENCHMARK floor: completely doorless, the placebo-of-record (B2, V5-5). skills+server floor with zero listing residual. F6: --disable-slash-commands suppresses plugin COMMANDS too, so /skill-heaven does not exist here — that is intended, not a defect. CLAUDE_CODE_DISABLE_BUNDLED_SKILLS is an undocumented env knob (string-probed from the 2.1.215 binary, verified live) — version-pinned, re-verify on CLI upgrades. --setting-sources project also evicts user CLAUDE.md (prompt-content side effect; full prompt eviction remains M2b).",
    );
  } else if (input.posture === "product-floor") {
    // F7 (2.1.216): T9b MINUS --disable-slash-commands. Dropping that one flag
    // is what keeps the door: the plugin command resolves and /skill-heaven
    // exists. Priced at +515 tok (20,176 vs T9b's 19,661), still -28.9% off
    // native's 28,379. This is a SEPARATE ARM from the benchmark floor (B1) —
    // the two are never averaged, and this one is never the placebo.
    argv = [
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--setting-sources",
      "",
    ];
    env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS = "1";
    if (input.doorPluginDir) argv.push("--plugin-dir", input.doorPluginDir);
    notes.push(
      `product-floor (F7 route, P8 scope fix) = the DOORFUL floor: retaining the minimum control surface and using --setting-sources '' so project scope is not admitted. F7's locked evidence prices the door at +${FLOOR_EVIDENCE.doorTokens} tok (${FLOOR_EVIDENCE.productFloorTokens} vs the benchmark floor's ${FLOOR_EVIDENCE.benchmarkFloorTokens}), still ${FLOOR_EVIDENCE.productFloorVsNativePct}% off native's ${FLOOR_EVIDENCE.nativeTokens} — ${FLOOR_EVIDENCE.harness.name} ${FLOOR_EVIDENCE.harness.version}, probed ${FLOOR_EVIDENCE.probedAt}. Measured and named separately from the benchmark floor and priced as its own arm (B1): never average the two. Keeping slash commands live also leaves the built-in CLI commands present, so this posture is NOT a valid placebo — the placebo-of-record stays the doorless floor (B2). Same undocumented, version-pinned env knob as T9b — re-verify on CLI upgrades.`,
    );
    if (!input.doorPluginDir) {
      notes.push(
        "no doorPluginDir supplied: the route permits a door but none is mounted. Mounting one is the door package's call (core does not assume a package topology).",
      );
    }
  } else {
    const mechanism = input.mechanism ?? DEFAULT_CLAUDE_MECHANISM;
    if (mechanism === "plugin-dir") {
      // T6 (2.1.215): --disable-slash-commands eats --plugin-dir skills too, so
      // curated CANNOT ride on the floor argv.
      //
      // KC4 (2026-07-29/30): `--setting-sources project` was T9's route, but
      // `--setting-sources` is an ALLOWLIST — naming `project` explicitly KEEPS
      // project-scope skills live, which is exactly the residual KC4 measured
      // (probe-kc4-listing-residual.sh, claude 2.1.220: cwd's project-scope
      // skill showed up in system:init `skills` alongside the curated set).
      // Founder ruling: curated is a personal-profile clean room + the caller's
      // own named skills, never a benchmark arm — so a project-scope leak is
      // not tolerable. Fix is `--setting-sources ''` — an EMPTY VALUE, not the
      // flag omitted. Omitting the flag entirely restores the full ~68-entry
      // bundled listing; empty-string is structurally "no ambient sources" and
      // was chosen over `local` because a clean `local` listing on one machine
      // only proves that machine had no local-scope skills, not that the route
      // is clean in general. `--plugin-dir` is a separate flag (not a setting
      // source), so the curated set still mounts under an empty allowlist.
      // CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 still removes the bundled-CLI-skills
      // residual T8 had. Re-probed clean (see KC4 note below); the sole
      // remaining residual is `doctor`, which survives the env knob and is an
      // upstream harness limitation the founder has ruled stays as-is.
      argv = [
        "--setting-sources",
        "",
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
        "curated via --setting-sources '' (empty allowlist) + --plugin-dir + CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1. T9 (--setting-sources project) is SUPERSEDED as of KC4 (2026-07-30): naming `project` keeps project-scope skills live (an allowlist, not a suppression flag), which is the residual KC4 measured. T6 remains NEGATIVE on 2.1.215: --disable-slash-commands suppresses plugin-provided skills too, so curated does not use it. " +
          "KC4 re-probe (claude 2.1.220, packages/claude-heaven/scripts/probe-kc4-listing-residual.sh) with the empty-value composition: system:init `skills` array contains only the curated marker plus `doctor` — no project-scope leak, no marketplace-plugin leak (system:init `plugins` showed only heaven-set). " +
          "`doctor` survives CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 in every scenario tested — an upstream harness limitation (founder-ruled acceptable residual), not a composition defect. " +
          "The env knob is undocumented (string-probed from the 2.1.215 binary) — version-pinned, re-verify on CLI upgrades.",
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
  //
  // CORRECTION (2026-08-07, WP2, packages/pi-heaven/PROBE.md, pi 0.83.0):
  // re-probed before writing any door code (M0 discipline), per the dispatch
  // brief's explicit instruction not to silently "fix" this comment on
  // assumption. Argv order does NOT matter on 0.83.0 — `--no-skills` before
  // vs. after `-p --no-session` both measured ~4371 totalTokens (repeated)
  // against an 11271-token unsuppressed baseline, via `--mode json`'s real
  // token usage (the free-text "list your skills" self-report the quirk was
  // originally diagnosed with turned out to confabulate under a cheap model
  // and was NOT used as evidence — see PROBE.md's method note). The 0.80.10
  // quirk is real history and is not reproduced on 0.83.0. Tail-args-first is
  // left in place below anyway: it remains correct (harmless-neutral) on
  // 0.83.0, and `floor`'s route is byte-frozen as the placebo-of-record — this
  // is the honest correction, not a silent rewrite.
  const argv: string[] = [...tailArgs(input, "pi")];
  const notes = [
    ...base.notes,
    "pi argv ordering is load-bearing: `--no-skills -p` (adjacent) drops suppression on pi 0.80.10 — launcher emits -p before the skill flags. CORRECTION (2026-08-07, PROBE.md): re-probed on pi 0.83.0 before writing any door code — order no longer matters there (--no-skills before vs. after -p/--no-session both measured ~4371 totalTokens vs an 11271 baseline, --mode json ground truth). The quirk does not reproduce on 0.83.0; kept here as the historical 0.80.10 finding, not current guidance.",
  ];
  if (input.posture === "floor") {
    argv.push("--no-skills");
  } else if (input.posture === "curated") {
    argv.push("--no-skills");
    for (const s of input.skills) argv.push("--skill", s.dir);
  } else if (input.posture === "product-floor") {
    // product-floor (WP2, PROBE.md, pi 0.83.0, probed 2026-08-07) = the
    // nearest achievable zero a user can actually launch at, with the door
    // still open: `--no-skills` + `--no-context-files` + `--no-prompt-templates`,
    // leaving extensions untouched (no `--no-extensions`) since extensions are
    // pi's door surface (an extension is how a `/skill-heaven`-equivalent
    // command would be registered here; suppressing them would close the
    // door, same reasoning as claude's product-floor keeping slash commands).
    // Measured in PROBE.md (this repo's cwd, which has a tracked 5608-byte
    // CLAUDE.md and no prompt-template files): unsuppressed baseline 11271
    // totalTokens → --no-skills alone 4371 → + --no-context-files 2831 (a
    // further ~1540, isolated to CLAUDE.md discovery) → + --no-prompt-templates:
    // no additional measured delta in THIS repo (no prompt-template files
    // here to suppress — not a claim the flag is a no-op elsewhere). These
    // are cwd-and-date-specific measurements, not a general dose claim;
    // re-probe before citing any of them as a benchmark arm.
    argv.push("--no-skills", "--no-context-files", "--no-prompt-templates");
  }
  return { ...base, notes, command: "pi", argv, execSupport: "exec" };
}

// Hermes Agent 0.20.0 — verified clean-room routes
// (packages/hermes-heaven/PROBE.md, 2026-08-07).
//
// The original probe correctly found that --safe-mode/--ignore-rules/
// --ignore-user-config do not suppress the 108-name installed-skills index.
// Source inspection explains why: skill-index construction is gated by the
// three tools in the `skills` toolset, independently of those customization
// flags. An explicit --toolsets allowlist without `skills` suppresses the
// index. For curated, a scoped HERMES_HOME with the no-seeding marker and
// session-copied skill dirs produced exactly the copied skill and preloaded it
// by resolved name. Every route below was repeated and authenticated.
function compileHermes(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const fsPlan = [...base.fsPlan];
  const notes = [...base.notes];
  const argv: string[] =
    input.prompt === undefined
      ? []
      : input.posture === "curated"
        ? ["chat", "-q", input.prompt, "--quiet"]
        : ["-z", input.prompt];
  const skillsLessToolsets = "terminal,web,file";

  if (input.posture === "floor") {
    argv.push("--toolsets", skillsLessToolsets, "--safe-mode");
    notes.push(
      "Hermes 0.20.0 benchmark floor: explicit terminal,web,file toolset allowlist omits the skills toolset, so the implementation never builds the skills index; --safe-mode additionally suppresses user config, context files/memory, plugins, and MCP. Repeated authenticated probes answered successfully with identical prompt-side usage. No priced dose is claimed.",
    );
  } else if (input.posture === "product-floor") {
    argv.push("--toolsets", skillsLessToolsets, "--ignore-user-config", "--ignore-rules");
    notes.push(
      "Hermes 0.20.0 product floor: the verified terminal,web,file allowlist omits the skills toolset/index; --ignore-user-config --ignore-rules suppresses behavioral config and context files/memory while leaving plugins/MCP available as the door-capable control surface. Repeated authenticated probes answered successfully. No priced dose is claimed.",
    );
  } else if (input.posture === "curated") {
    env.HERMES_HOME = "$SESSION/hermes";
    fsPlan.push(
      {
        kind: "copyFileIfExists",
        from: `${input.homeDir ?? "$HOME"}/.hermes/auth.json`,
        to: "$SESSION/hermes/auth.json",
      },
      { kind: "write", path: "$SESSION/hermes/.no-bundled-skills", contents: "" },
    );
    for (const skill of input.skills) {
      fsPlan.push({ kind: "copyDir", from: skill.dir, to: `$SESSION/hermes/skills/${skill.id}` });
      argv.push("--skills", skill.id);
    }
    argv.push("--safe-mode");
    notes.push(
      "Hermes 0.20.0 curated clean room: session-scoped HERMES_HOME receives only auth.json, the .no-bundled-skills marker, and copies of the named skill directories. --skills then preloads each resolved name; --safe-mode suppresses other customizations. Hard listing probes showed exactly one copied local skill and zero bundled skills, and the copied marker skill loaded under safe mode twice. config.yaml is deliberately not copied, avoiding re-imported behavioral customizations. For headless curated runs core uses `hermes chat -q --quiet`, because Hermes 0.20.0's top-level -z oneshot path does not pass --skills through.",
    );
  } else {
    notes.push("Hermes native posture is untouched.");
  }

  if (input.model) argv.push("--model", input.model);
  if (input.passthrough?.length) argv.push(...input.passthrough);

  return {
    command: "hermes",
    argv,
    env,
    fsPlan,
    notes,
    doseSummary: base.doseSummary,
    execSupport: "exec",
  };
}

// codex — $CODEX_HOME scoping + per-skill config.toml/`-c` toggles.
//
// A2 (2026-07-29/30): the per-session `-c` scoping cell this comment used to
// gate on HAS resolved — `-c 'skills.config=[{path="<abs SKILL.md>",
// enabled=false}]'` reaches the skills surface per-invocation, no restart,
// nothing written to config.toml (codex-cli 0.145.0; gaia-research PR #133,
// harness-capability-matrix.md row "Skills listing suppressible per-session?"
// / G1-skills-config-override: 2/2 reproduced upstream. Committed run record
// gaia-research/scripts/hell-heaven-bench/harness-probes/runs/
// codex-g1-2026-07-29.run.json shows 67→66 entries — targeted fixture skill
// absent, all 66 others unchanged, input_tokens 18,986→18,925, 2/2
// byte-identical. Correction, 2026-07-31: this comment previously read
// "74→73 entries" — that figure never matched the PR #133 / G1 row it cited
// and traced to no separate committed probe; a citation error, fixed here.
// That is no longer the open question.
//
// The reason codex STAYS A RECIPE is a different one: the matrix's own
// "Skill discovery" row documents codex skill roots beyond $CODEX_HOME —
// `.agents/skills` (repo, cwd→root scan), `~/.agents/skills` (user),
// `/etc/codex/skills`, and bundled system skills. $CODEX_HOME scoping alone
// does not evict any of them (confirmed independently: `~/.agents/skills`
// alone holds 70 entries on this machine), and the per-session `-c` cell
// above only suppresses skills named in that one flag — it does not compute
// a disable entry for every skill discovered across every root. So a live
// `--posture floor --harness codex` exec today would not be an empty
// surface, and a live `--posture curated` exec would not be a clean room
// either: both would leak the other roots' skills into the model-visible
// listing. exec.ts:43 refuses to spawn anything whose execSupport isn't
// "exec", and cli.ts:169 prints a recipe instead of running — that refusal
// is what keeps a research driver from spawning a codex "floor" that is
// actually near-native and recording a benchmark under a posture the
// session never had. So: the mechanism is proven, but the resulting surface
// is not a floor — execSupport stays "recipe" until the other skill roots
// are computed into the `-c` disable set too (a mechanism redesign, not a
// stale-claim correction, and out of scope here). Probe results recorded in
// the matrix.
//
// RE-PROBED (2026-08-07, WP4, packages/codex-heaven/PROBE.md, codex-cli
// 0.146.0): before writing any codex-heaven door code, per M0 discipline.
// A2's per-session `-c 'skills.config=[...]'` toggle still holds on 0.146.0
// (46-item baseline listing, minus exactly the one disabled skill, 10,092 ->
// 10,058 tokens used). The "STAYS A RECIPE" reasoning above is now backed by
// fresh, direct evidence, not just inference from the matrix's skill-roots
// row: `--ignore-user-config --ignore-rules` together do NOT suppress the
// listing to NONE — they swap it for a DIFFERENT, larger (~70-item) listing
// (a distinct skill root becomes visible once the config pointing at the
// baseline set is ignored), 10,092 -> 6,294 tokens. That is a second root
// switching in, not eviction. No cell tried gets anywhere near an empty
// surface, so execSupport stays "recipe" — this is a re-confirmation, not a
// promotion (D8: the negative result is the finding).
//
// PRODUCT-FLOOR (informed by the same re-probe): no branch for it here,
// deliberately. "Product-floor" means the nearest a user can launch at while
// the door still resolves — but no composition observed in the 0.146.0
// re-probe gets codex CLOSER to zero while leaving a door reachable; the
// only flags that move the token count at all (`--ignore-user-config
// --ignore-rules`) do it by swapping to an unrelated, comparably-sized skill
// root, not by shrinking the session's own set. That is not a verified
// product-floor cell by any reading, so `compile()`'s own
// `PRODUCT_FLOOR_VERIFIED_HARNESSES` gate (only "claude" and "pi") is left
// unchanged — codex is not added to it. Same M0 refusal as grok: nothing is
// withheld by policy, nobody has found a real cell yet.
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
      "codex recipe: $CODEX_HOME scoping (floor); curated adds skill dirs under $CODEX_HOME. The per-session `-c 'skills.config=[...]'` scoping cell is now empirically verified (matrix G1-skills-config-override, codex-cli 0.145.0, gaia-research PR #133) — the mechanism itself is proven, live exec. Stays a recipe anyway: $CODEX_HOME scoping does not evict `.agents/skills`, `~/.agents/skills`, `/etc/codex/skills`, or bundled system skills (matrix Skill discovery row), so neither floor nor curated is yet a verified-clean surface on codex. Doc-verified + probe evidence only — launcher does not spawn codex (recipe track).",
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

// Grok 0.2.118 — session-scoped config route, pinned by packages/grok-heaven/
// PROBE.md. Grok has no --no-skills primitive. GROK_HOME does evict Grok's
// own user config, but Claude-compatible roots, project roots, bundled skills,
// and installed plugins remain independent surfaces. The config below is the
// strongest composition actually observed: it ignores the ambient skill roots,
// disables the observed plugin names on the benchmark machine, and leaves the
// session bundled root out. It intentionally stays recipe-only: there is no
// portable wildcard for arbitrary symlinked roots or an unknown plugin inventory.
const grokSkillFlags = ["--no-memory", "--no-subagents", "--no-plan", "--disable-web-search"];

const grokCleanConfig = `[compat.claude]
skills = false

[compat.cursor]
skills = false

[skills]
ignore = [
  "~/.agents/skills",
  "~/.claude/skills",
  "~/.cursor/skills",
  "$CWD/.grok/skills",
  "$CWD/.agents/skills",
  "$CWD/.claude/skills",
  "$CWD/.cursor/skills",
  "$SESSION/grok/bundled/skills",
  "$SYMLINK_IGNORES",
  "$ANCESTOR_IGNORES"
]

[plugins]
disabled = ["frontend-design", "rock-favor", "claude-heaven"]
`;

const grokProductConfig = grokCleanConfig.replace(
  '\n[plugins]\ndisabled = ["frontend-design", "rock-favor", "claude-heaven"]\n',
  "\n",
);

function tailGrok(input: CompileInput): string[] {
  const argv: string[] = [];
  if (input.model) argv.push("-m", input.model);
  if (input.prompt !== undefined) argv.push("-p", input.prompt);
  if (input.jsonOutput) argv.push("--output-format", "json");
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return argv;
}

function compileGrok(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const fsPlan = [...base.fsPlan];
  const notes = [...base.notes];
  let argv: string[] = [];

  if (input.posture === "native") {
    notes.push("grok native posture is untouched: no GROK_HOME override, config copy, or suppression flags.");
  } else {
    env.GROK_HOME = "$SESSION/grok";
    fsPlan.push({
      kind: "copyFileIfExists",
      from: `${input.homeDir ?? "$HOME"}/.grok/auth.json`,
      to: "$SESSION/grok/auth.json",
    });

    if (input.posture === "floor" || input.posture === "curated") {
      fsPlan.push({ kind: "write", path: "$SESSION/grok/config.toml", contents: grokCleanConfig });
    } else {
      fsPlan.push({ kind: "write", path: "$SESSION/grok/config.toml", contents: grokProductConfig });
    }

    argv = [...grokSkillFlags];
    if (input.posture === "curated") {
      for (const skill of input.skills) {
        fsPlan.push({ kind: "copyDir", from: skill.dir, to: `$SESSION/grok/skills/${skill.id}` });
      }
      notes.push(
        "grok curated recipe (0.2.118): session-scoped GROK_HOME receives auth.json, a clean-room config, and only the named skill directories. The pinned probe reached Skills (1) and loaded a marker skill, but this remains recipe-only because unknown plugin inventories and symlinked roots have no portable wildcard suppression.",
      );
    } else if (input.posture === "floor") {
      notes.push(
        "grok floor recipe (0.2.118): GROK_HOME plus auth.json, --no-memory, --no-subagents, --no-plan, --disable-web-search, ambient-root ignores, and observed-plugin disable entries. The pinned config reached Skills (0) twice and answered OK twice; path/plugin inventory is not a universal exec license, so this remains recipe-only.",
      );
    } else {
      notes.push(
        "grok product-floor recipe (0.2.118): GROK_HOME plus auth.json and the documented suppression flags, with ambient roots ignored but the installed plugin surface left available as the door. The pinned composition reached Skills (9) and answered OK twice; plugin inventories vary, so this remains recipe-only.",
      );
    }
  }

  argv.push(...tailGrok(input));
  return {
    ...base,
    notes,
    command: "grok",
    argv,
    env,
    fsPlan,
    execSupport: "recipe",
  };
}
