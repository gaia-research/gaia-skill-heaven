// Pure profile compiler (M2 plan §4). compile() does ZERO I/O: it maps a
// posture × harness × mechanism onto the M0-verified in-harness flags and an
// fsPlan whose paths use the "$SESSION" placeholder; exec() substitutes it
// after mkdtemp. It composes flags and execs; it never stashes, restores, or
// mutates shared state (P3).

import { isAbsolute, join, resolve } from "node:path";
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

export const HARNESSES = ["claude", "pi", "codex", "hermes", "cursor", "grok", "agy"] as const;
export type Harness = (typeof HARNESSES)[number];

export const MECHANISMS = ["plugin-dir", "config-dir"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

// Frozen by the T6 spike (see README "T6 spike result" + gaia-research
// docs/labs/harness-capability-matrix.md rows T6/T7).
export const DEFAULT_CLAUDE_MECHANISM: Mechanism = "plugin-dir";

// The user-facing ladder. `native` remains an explicit escape hatch through
// LEVEL_ALIASES, but is not a rung: it means "leave my setup untouched".
export const LADDER_LEVELS = ["zero", "low", "med", "high", "xhigh", "max", "ultra"] as const;
export const HEAVEN_LEVELS = ["zero", "low", "med"] as const;
export const LEVEL_ALIASES: Record<string, Posture> = {
  zero: "product-floor",
  low: "curated",
  med: "native",
  native: "native",
};
export const HELL_LEVELS = ["high", "xhigh", "max"] as const;

// ---------------------------------------------------------------------------
// THE SUMMON LINE (founder ruling N13, docs/LADDER-FLOW.md)
//
// WHAT THIS LINE MEASURES: skill entropy — how much skill variety and volume
// enters a session. `LADDER_LEVELS` are entropy readings, not settings:
// `zero` is zero skills (zero skill entropy, and why the floor is spelled
// `zero` rather than `off` — `off` named a switch position, `zero` names a
// quantity on the same scale as everything above it); `low → med → high →
// xhigh → max` are rising skill entropy; `ultra` picks the entropy per gap —
// direction and depth both — rather than reading one fixed value, which is
// why it sits at the top of this same line instead of beside it. Full
// argument, not restated here: docs/LADDER-FLOW.md, "What the ladder
// measures — skill entropy".
//
// One ladder, one line. The four surfaces are contiguous BANDS on it, read from
// the current rung — a session sits at exactly one rung and does not hold a
// Heaven position and a Hell position at once. Heaven (`low·med`) is the
// lower-entropy, converging direction; Hell (`high·xhigh·max`) is the
// higher-entropy, exploring direction — two directions along one quantity,
// which is what makes them one line and not two products.
//
// This is a DIFFERENT DIAL from the launcher's boot dial above. `HEAVEN_LEVELS`
// / `LEVEL_ALIASES` map `zero|low|med` onto boot POSTURES: how much of the user's
// ambient setup is withheld at launch, decidable only at boot (D12). The line
// below is additive: how freely skills are SUMMONED IN on top of whatever the
// session booted at. LADDER-FLOW is explicit that the shared `low|med` spellings
// are "the collision of names is historical" — do not fuse the two.
//
// THERE ARE NO PER-RUNG NUMBERS. Nothing assigns a count to a rung and nothing
// caps a summon: how deep `low` or `high` reaches is the agent's call, worked
// out in use while the benchmark is being built. Three tables used to disagree
// about counts (plugin code said high 1 · xhigh 3 · max 5); the disagreement is
// resolved by there being nothing to disagree about. What a rung DOES carry is
// its band — the direction — and that is what downstream reads from here.
// Skill entropy is a product concept, not an information-theoretic one: no
// formula, no unit, no threshold, no number is computed anywhere in this file
// or downstream of it, and nothing should start.
// ---------------------------------------------------------------------------

export const BANDS = ["zero", "heaven", "hell", "ultra"] as const;
export type Band = (typeof BANDS)[number];

/** Which band a rung belongs to. The surface is READ from the rung (N13). */
export const RUNG_BANDS: Record<(typeof LADDER_LEVELS)[number], Band> = {
  zero: "zero",
  low: "heaven",
  med: "heaven",
  high: "hell",
  xhigh: "hell",
  max: "hell",
  ultra: "ultra",
};

export interface BandInfo {
  /** the surface's product name */
  surface: string;
  /** the slash command that opens on this band */
  command: string;
  /** the rung a bare invocation of that command opens on */
  defaultRung: (typeof LADDER_LEVELS)[number];
  /** the one-word direction: what climbing inside this band does */
  direction: string;
}

export const BAND_INFO: Record<Band, BandInfo> = {
  zero: { surface: "Skill Zero", command: "/skill-zero", defaultRung: "zero", direction: "floor" },
  heaven: { surface: "Skill Heaven", command: "/skill-heaven", defaultRung: "low", direction: "converge" },
  hell: { surface: "Skill Hell", command: "/skill-hell", defaultRung: "high", direction: "explore" },
  ultra: { surface: "Skill Ultra", command: "/skill-ultra", defaultRung: "ultra", direction: "controller" },
};

/** The mark every rendering of the line must carry. */
export const LADDER_WIP =
  "WIP \u00b7 PROVISIONAL \u2014 what each rung means is being worked out against the benchmark.";

/** Rungs that are armed live, in-session, and have no boot-posture mapping.
 * They do not refuse: `ultra` is ratified (N13). They are simply a different
 * dial from `--level`, and saying so is the honest answer to `--level ultra`. */
export const SUMMON_ONLY_LEVELS = ["high", "xhigh", "max", "ultra"] as const;

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

/** The one MCP server the door is allowed to admit: the summon engine bundled
 * inside the plugin. `--strict-mcp-config` is an ALLOWLIST, so a name here is a
 * grant, not a description — it is deliberately a single constant and the
 * compiler rejects anything else. */
export const DOOR_MCP_SERVER_NAME = "skill-summon";

/** Where the admitted door declaration is written inside the session dir. The
 * contents are fully resolved (absolute bundle path, concrete source), so the
 * file never needs session substitution — only its path does. */
export const DOOR_MCP_CONFIG_PATH = "$SESSION/door-mcp.json";

/** Where the door's own bundle lives INSIDE the plugin dir it mounts. Checked
 * against the mount so an admitted entry can only ever be that program. */
export const DOOR_MCP_BUNDLE_RELATIVE = join("mcp", "skill-summon.mjs");

/** The one env key the door's server carries. */
export const DOOR_MCP_SOURCE_ENV_KEY = "SKILL_SOURCE";

/** A RESOLVED stdio MCP server declaration. "Resolved" is the whole contract:
 * every value is a literal — no `${...}` interpolation survives, because
 * Claude does NOT interpolate a plugin manifest supplied through an explicit
 * `--mcp-config` file (probe, 2.1.288 — see packages/claude-zero/PROBE.md). */
export interface DoorMcpServer {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DoorMcpConfig {
  mcpServers: Record<string, DoorMcpServer>;
}

function hasUnresolvedPlaceholder(value: string): boolean {
  const start = value.indexOf("${");
  return start !== -1 && value.indexOf("}", start + 2) !== -1;
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
  // product-floor on claude only: the door's OWN bundled summon MCP server,
  // already resolved by the door package into one explicit stdio declaration.
  //
  // WHY THIS IS AN INPUT AND NOT A DISCOVERY. Under `--strict-mcp-config` a
  // plugin's own `.mcp.json` is not started at all (measured, 2.1.288:
  // `mcp_servers: []` on the door route) — which is exactly right for the
  // product floor (ambient servers must stay suppressed) and exactly wrong for
  // the one server the door itself ships. So the door hands core a fully
  // resolved declaration and core routes it: strict mode stays on, ambient
  // servers stay out, and the door's own `skill-summon` is admitted.
  //
  // Core validates the shape and owns the ROUTE. It never reads a plugin
  // manifest, never discovers the repository topology, and never imports
  // skill-summon: resolving the declaration is the door package's job.
  doorMcpConfig?: DoorMcpConfig;
  // agy only: opt in to session-scoped HOME and auth copying (default false).
  // When false, agy runs under the real HOME so the macOS login keychain and
  // vanilla credentials work without popping auth prompts or creating second accounts.
  isolateHome?: boolean;
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

/** A `${...}` placeholder Claude will not expand in an explicit `--mcp-config`
 * file (measured, claude 2.1.288: the server starts and immediately FAILS with
 * the raw placeholder as its argv). Core rejects it here rather than shipping a
 * route that silently loses the door. */
function rejectUnresolved(field: string, value: string): void {
  if (hasUnresolvedPlaceholder(value)) {
    throw new Error(
      `doorMcpConfig: ${field} still contains an unresolved \${…} placeholder (${JSON.stringify(value)}). ` +
        "Claude does not interpolate plugin placeholders in an explicit --mcp-config file, so the door " +
        "must resolve the bundle path and the skill source to literal values first.",
    );
  }
}

/**
 * The door's MCP admission is a GRANT, so it is validated as one: exactly the
 * one known server, a stdio/node shape, literal argv/env, and — when the mount
 * is known — the bundle that actually ships inside it. A malformed declaration
 * throws rather than degrading to "no servers": a silently doorless product
 * floor is the exact failure this composition exists to fix (#143).
 *
 * `doorPluginDir` is the dir the caller mounts with `--plugin-dir`. Supplying it
 * is what lets core enforce the strongest part of the contract: the admitted
 * argv must BE the mounted door's own `mcp/skill-summon.mjs`, not merely some
 * absolute path. Core cannot read the manifest to check that (zero I/O, and no
 * topology knowledge), so it checks the shape instead and the DOOR resolves the
 * declaration — the two together are the contract.
 */
export function assertDoorMcpConfig(config: DoorMcpConfig, doorPluginDir?: string): void {
  const servers = (config as { mcpServers?: unknown } | null)?.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error("doorMcpConfig must be an object with a mcpServers map");
  }
  const names = Object.keys(servers as Record<string, unknown>);
  if (names.length !== 1 || names[0] !== DOOR_MCP_SERVER_NAME) {
    throw new Error(
      `doorMcpConfig must admit exactly one server, "${DOOR_MCP_SERVER_NAME}" ` +
        `(got ${names.length === 0 ? "none" : names.join(", ")}). --strict-mcp-config is an allowlist: ` +
        "anything else here would either break the door or admit a server the product floor exists to keep out.",
    );
  }
  const server = (servers as Record<string, DoorMcpServer>)[DOOR_MCP_SERVER_NAME];
  if (!server || typeof server !== "object") throw new Error(`doorMcpConfig: ${DOOR_MCP_SERVER_NAME} is not an object`);
  if (server.type !== "stdio") {
    throw new Error(`doorMcpConfig: ${DOOR_MCP_SERVER_NAME} must be declared as a stdio server (got ${JSON.stringify(server.type)})`);
  }
  if (server.command !== "node") {
    throw new Error(
      `doorMcpConfig: ${DOOR_MCP_SERVER_NAME} must run on plain node — no npx, no external binary ` +
        `(got ${JSON.stringify(server.command)})`,
    );
  }
  if (!Array.isArray(server.args) || server.args.length === 0 || server.args.some((a) => typeof a !== "string")) {
    throw new Error(`doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.args must be a non-empty array of strings`);
  }
  for (const arg of server.args) {
    rejectUnresolved(`${DOOR_MCP_SERVER_NAME}.args`, arg);
  }
  if (!isAbsolute(server.args[0])) {
    throw new Error(
      `doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.args[0] must be an ABSOLUTE path to the bundled server ` +
        `(got ${JSON.stringify(server.args[0])}) — the door resolves ${"${CLAUDE_PLUGIN_ROOT}"} itself`,
    );
  }
  // ONE argv element. The admitted entry is a grant to start this bundle, not to
  // pass it flags; a trailing `--some-flag` would be an unreviewed second input.
  if (server.args.length !== 1) {
    throw new Error(
      `doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.args must be exactly one entry — the bundle path ` +
        `(got ${server.args.length} entries)`,
    );
  }
  if (doorPluginDir !== undefined) {
    const expectedBundle = resolve(doorPluginDir, DOOR_MCP_BUNDLE_RELATIVE);
    if (resolve(server.args[0]) !== expectedBundle) {
      throw new Error(
        `doorMcpConfig: ${DOOR_MCP_SERVER_NAME} must admit the mounted door plugin's own bundle ` +
          `(${JSON.stringify(expectedBundle)}), got ${JSON.stringify(server.args[0])}. The door ships ` +
          "one summon server; admitting a different program under its name would not be the door.",
      );
    }
  }
  if (server.env !== undefined) {
    if (typeof server.env !== "object" || Array.isArray(server.env)) {
      throw new Error(`doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.env must be a map of string values`);
    }
    for (const [key, value] of Object.entries(server.env)) {
      // An env entry on an admitted stdio server changes how `node` ITSELF
      // starts (NODE_OPTIONS, PATH, LD_*), so the allowlist stays minimal.
      if (key !== DOOR_MCP_SOURCE_ENV_KEY) {
        throw new Error(
          `doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.env may carry only ${DOOR_MCP_SOURCE_ENV_KEY} (got ${key})`,
        );
      }
      if (typeof value !== "string") {
        throw new Error(`doorMcpConfig: ${DOOR_MCP_SERVER_NAME}.env.${key} must be a string (got ${typeof value})`);
      }
      rejectUnresolved(`${DOOR_MCP_SERVER_NAME}.env.${key}`, value);
    }
  }
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
  if (input.doorMcpConfig) {
    if (input.harness !== "claude") {
      throw new Error(
        `doorMcpConfig is only valid with harness claude (got harness ${input.harness}) — the admission route ` +
          "is claude's --strict-mcp-config allowlist; core has not probed any other harness's equivalent (M0 discipline)",
      );
    }
    if (posture !== "product-floor") {
      throw new Error(
        `doorMcpConfig is only valid with --posture product-floor (got posture ${posture}) — the benchmark floor ` +
          "is doorless by ruling (V5-5/B2) and curated mounts its own set",
      );
    }
    if (!input.doorPluginDir) {
      throw new Error(
        "doorMcpConfig requires doorPluginDir — the admitted server ships INSIDE the mounted door plugin, so " +
          "admitting its MCP without mounting the plugin would split the door's control surface in half",
      );
    }
    assertDoorMcpConfig(input.doorMcpConfig, input.doorPluginDir);
  }
  // M0 discipline: the doorful floor exists as a measured cell on claude (F7,
  // 2.1.216) and, as of WP2 (PROBE.md, pi 0.83.0, probed 2026-08-07), pi. No
  // Hermes 0.20.0 also has a probed best-effort distinction: --safe-mode is
  // the maximal benchmark floor, while --ignore-user-config --ignore-rules
  // preserves plugins/MCP for the doorful floor. Neither suppresses Hermes'
  // installed-skills index; compileHermes discloses that negative result and
  // remains recipe-only.
  const PRODUCT_FLOOR_VERIFIED_HARNESSES: readonly Harness[] = ["claude", "pi", "codex", "hermes", "grok", "agy"];
  if (posture === "product-floor" && !PRODUCT_FLOOR_VERIFIED_HARNESSES.includes(harness)) {
    throw new Error(
      `--posture product-floor has no verified cell for harness ${harness} — only claude (F7, 2.1.216), ` +
        "pi (PROBE.md, 0.83.0), codex (PROBE.md, 0.146.0), hermes (PROBE.md, 0.20.0), grok (PROBE.md, 0.2.118), and agy (PROBE.md, 1.2.13) were probed. This is a harness-capability gap, not a policy hold: nobody has verified whether this composes here at all, so there is nothing to " +
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
    case "agy":
      return compileAgy(input, base);
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
    //
    // ISSUE #143 — the door's OWN summon server. `--strict-mcp-config` is an
    // ALLOWLIST, so it suppresses plugin-declared MCP as thoroughly as it
    // suppresses ambient ones: measured on claude 2.1.288, this exact argv
    // yields `mcp_servers: []` and no `mcp__skill-summon__summon` in the tool
    // inventory (packages/claude-zero/PROBE.md). That is the correct default
    // for isolation and the wrong one for the door's own control surface, so
    // the door hands core a RESOLVED one-server declaration and core swaps the
    // inline empty config for a session-local file containing exactly it.
    // Measured on the same pin with the file substituted: exactly ONE
    // `skill-summon` server, status connected, tool present once, ambient
    // project `.mcp.json` server absent, plugin slash commands intact.
    const doorMcp = input.doorMcpConfig;
    argv = [
      "--strict-mcp-config",
      "--mcp-config",
      doorMcp ? DOOR_MCP_CONFIG_PATH : '{"mcpServers":{}}',
      "--setting-sources",
      "",
    ];
    env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS = "1";
    if (doorMcp) {
      // Contents are literal — an absolute bundle path and a concrete source —
      // so only the PATH needs the "$SESSION" substitution, not the bytes.
      fsPlan.push({
        kind: "write",
        path: DOOR_MCP_CONFIG_PATH,
        contents: `${JSON.stringify(doorMcp, null, 2)}\n`,
      });
    }
    if (input.doorPluginDir) argv.push("--plugin-dir", input.doorPluginDir);
    notes.push(
      `product-floor (F7 route, P8 scope fix) = the DOORFUL floor: retaining the minimum control surface and using --setting-sources '' so project scope is not admitted. F7's locked evidence prices the door at +${FLOOR_EVIDENCE.doorTokens} tok (${FLOOR_EVIDENCE.productFloorTokens} vs the benchmark floor's ${FLOOR_EVIDENCE.benchmarkFloorTokens}), still ${FLOOR_EVIDENCE.productFloorVsNativePct}% off native's ${FLOOR_EVIDENCE.nativeTokens} — ${FLOOR_EVIDENCE.harness.name} ${FLOOR_EVIDENCE.harness.version}, probed ${FLOOR_EVIDENCE.probedAt}. Measured and named separately from the benchmark floor and priced as its own arm (B1): never average the two. Keeping slash commands live also leaves the built-in CLI commands present, so this posture is NOT a valid placebo — the placebo-of-record stays the doorless floor (B2). Same undocumented, version-pinned env knob as T9b — re-verify on CLI upgrades.`,
    );
    notes.push(
      doorMcp
        ? `--strict-mcp-config is an ALLOWLIST, so it suppresses plugin-declared MCP exactly as thoroughly as ambient MCP (measured: ${FLOOR_EVIDENCE.harness.name} 2.1.288, this route alone gave mcp_servers: [] and no mcp__${DOOR_MCP_SERVER_NAME}__summon tool). The door therefore resolves its own bundled server to ONE literal stdio declaration and points the same strict allowlist at ${DOOR_MCP_CONFIG_PATH}; ambient user/project MCP stays suppressed, and exactly one server starts. F7's token arithmetic above is HISTORICAL and was measured WITHOUT this server admitted — it does not price the MCP-enabled route, and no priced dose is claimed for it (#143).`
        : `--strict-mcp-config is an ALLOWLIST and no server was admitted: --mcp-config carries the empty inline set, so ambient user/project MCP AND any plugin-declared MCP stay suppressed. That includes the door's own bundled "${DOOR_MCP_SERVER_NAME}" server, which therefore does NOT start here (#143) — /summon can resolve as a command while its tool is absent. This route is door-optional by contract; mounting and admitting the door is the door package's call.`,
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
          "KC4 re-probe (claude 2.1.220, packages/claude-zero/scripts/probe-kc4-listing-residual.sh) with the empty-value composition: system:init `skills` array contains only the curated marker plus `doctor` — no project-scope leak, no marketplace-plugin leak (system:init `plugins` showed only heaven-set). " +
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
  // CORRECTION (2026-08-07, WP2, packages/pi-zero/PROBE.md, pi 0.83.0):
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
// (packages/hermes-zero/PROBE.md, 2026-08-07).
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

// Codex 0.146.0 — config-home scoping plus a session-local exact-path disable
// set. The older flag-only negative remains important: CODEX_HOME alone does
// not evict .agents/skills, user roots, bundled system skills, or other roots.
// WP14 (packages/codex-zero/PROBE.md, pane w8:p11) proved the missing step:
// ask the pinned app-server skills/list instrument for every path after the
// scoped home is materialized, then write skills.config entries for every
// path except named curated readmissions. The door performs that dynamic step;
// compile() remains pure and only describes the isolation argv/fsPlan.
function compileCodex(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const fsPlan = [...base.fsPlan];
  const notes = [...base.notes];
  // CompileInput's contract: headless when a prompt is present, interactive
  // otherwise. `codex exec` with nothing to run exits "No prompt provided", so a
  // bare door launch opens the interactive TUI. The exec-only flags
  // (--skip-git-repo-check, --ephemeral, --ignore-rules) are rejected by the
  // interactive CLI, and a read-only sandbox would leave an interactive session
  // unable to work. Skill isolation (scoped CODEX_HOME + skills.config) is the
  // same on both routes.
  const headless = input.prompt !== undefined || (input.passthrough?.length ?? 0) > 0;
  const argv: string[] = headless ? ["exec"] : [];

  if (input.posture !== "native") {
    if (headless) {
      argv.push(
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--ignore-rules",
      );
    } else {
      notes.push(
        "codex-cli 0.154.0 interactive route: no prompt or passthrough, so the door opens the Codex TUI with the same session-scoped CODEX_HOME and skills.config disables instead of `codex exec`, which refuses to start without a prompt.",
      );
    }
    env.CODEX_HOME = "$SESSION/codex";
    fsPlan.push({
      kind: "copyFileIfExists",
      from: `${input.homeDir ?? "$HOME"}/.codex/auth.json`,
      to: "$SESSION/codex/auth.json",
    });
    if (input.posture === "curated") {
      for (const skill of input.skills) {
        fsPlan.push({ kind: "copyDir", from: skill.dir, to: `$SESSION/codex/skills/${skill.id}` });
      }
    }
    notes.push(
      `codex-cli 0.146.0 live route: the launcher copies auth.json into session-scoped CODEX_HOME, materializes curated skills when requested, asks app-server skills/list for exact discovered SKILL.md paths, and writes a session-local skills.config disable entry for every non-readmitted path before spawning. The flag-only negative remains true; dynamic exact-path discovery is the WP14 license. ${input.posture === "product-floor" ? "Codex has no separate in-session door/plugin surface, so product-floor uses the same verified clean-room composition as floor." : "No shared ~/.codex state is mutated."}`,
    );
  }

  if (input.model) argv.push("-m", input.model);
  if (input.prompt !== undefined) argv.push(input.prompt);
  if (input.passthrough?.length) argv.push(...input.passthrough);
  return { command: "codex", argv, env, fsPlan, notes, doseSummary: base.doseSummary, execSupport: "exec" };
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

// Grok 0.2.118 — session-scoped config route, pinned by packages/grok-zero/
// PROBE.md. GROK_HOME scopes auth/config, but Grok can read several
// Claude-compatible roots and plugin skills. The door starts with this minimal
// session config, then launcher code asks `grok inspect --json` for the exact
// paths and observed plugin names and rewrites this file inside the session.
const grokSkillFlags = ["--no-memory", "--no-subagents", "--no-plan", "--disable-web-search"];

const grokBaseConfig = `[compat.claude]
skills = false

[compat.cursor]
skills = false

[skills]
ignore = []
`;

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

    fsPlan.push({ kind: "write", path: "$SESSION/grok/config.toml", contents: grokBaseConfig });

    argv = [...grokSkillFlags];
    if (input.posture === "curated") {
      for (const skill of input.skills) {
        fsPlan.push({ kind: "copyDir", from: skill.dir, to: `$SESSION/grok/skills/${skill.id}` });
      }
      notes.push(
        "grok curated exec route (WP14, 0.2.118): session-scoped GROK_HOME receives auth.json, the named skill directories, and a dynamic inspect-derived exact-path ignore config. Four discovery passes reached exactly one readmitted canary skill and answered successfully twice; observed plugin names are disabled only in this session.",
      );
    } else if (input.posture === "floor") {
      notes.push(
        "grok floor exec route (WP14, 0.2.118): GROK_HOME plus auth.json, --no-memory, --no-subagents, --no-plan, --disable-web-search, iterative inspect-derived exact-path ignores, and session-local disables for the observed plugin names. Repeated pinned scans reached Skills (0) and answered successfully; no global plugin state is mutated.",
      );
    } else {
      notes.push(
        "grok product-floor exec route (WP14, 0.2.118): GROK_HOME plus auth.json and the documented suppression flags, with iterative inspect-derived exact-path ignores while leaving observed plugins as the door surface. Repeated pinned scans reached the 9-skill plugin surface and answered successfully; the route does not claim zero plugin skills.",
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
    execSupport: "exec",
  };
}

// Agy (Google Antigravity CLI) 1.2.13 — real HOME default route with opt-in
// session-scoped HOME isolation (`isolateHome: true`).
//
// Invariant: agy-zero must never redirect HOME unless explicitly opted in.
// Redirecting HOME causes macOS `security` to drop the user's login keychain,
// making keyring credentials unreachable and causing repeated keychain dialogs
// and fallback re-authentication ("second agy account").
//
// When isolateHome is false (default):
// - No env.HOME override, no auth copying, no settings copying.
// - Launcher runs against the user's real profile, preserving vanilla credentials and keychain.
// - floor: --dangerously-skip-permissions + --disable-slash-commands (in print mode).
// - product-floor: --dangerously-skip-permissions.
// - curated: requires isolateHome: true (curated without isolation would mutate shared ~/.gemini, forbidden by P3).
//
// When isolateHome is true:
// - env.HOME = "$SESSION" and copies auth files into the session directory.
// - Used for explicit isolation / second account runs.
// Verified empirically in packages/agy-zero/PROBE.md.
function compileAgy(
  input: CompileInput,
  base: Omit<CompileResult, "command" | "argv" | "execSupport">,
): CompileResult {
  const env = { ...base.env };
  const fsPlan = [...base.fsPlan];
  const notes = [...base.notes];
  const argv: string[] = [];

  const isolateHome = input.isolateHome ?? false;

  if (input.posture === "native") {
    notes.push("agy native posture is untouched: no session HOME override, auth copy, or suppression flags.");
  } else if (isolateHome) {
    env.HOME = "$SESSION";
    const home = input.homeDir ?? "$HOME";
    fsPlan.push(
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/antigravity-cli/antigravity-oauth-token`,
        to: "$SESSION/.gemini/antigravity-cli/antigravity-oauth-token",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/jetski-standalone-oauth-token`,
        to: "$SESSION/.gemini/jetski-standalone-oauth-token",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/oauth_creds.json`,
        to: "$SESSION/.gemini/oauth_creds.json",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/google_accounts.json`,
        to: "$SESSION/.gemini/google_accounts.json",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/installation_id`,
        to: "$SESSION/.gemini/installation_id",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/installation_id`,
        to: "$SESSION/.gemini/antigravity-cli/installation_id",
      },
      {
        kind: "copyFileIfExists",
        from: `${home}/.gemini/settings.json`,
        to: "$SESSION/.gemini/settings.json",
      },
    );

    if (input.posture === "floor") {
      if (input.prompt !== undefined) {
        argv.push("--disable-slash-commands");
      }
      argv.push("--dangerously-skip-permissions");
      notes.push(
        "agy floor route with isolateHome (WP14/M0, agy 1.2.13): session-scoped HOME isolates .gemini/config and .gemini/antigravity-cli while copying OAuth credentials. Note: on macOS this drops login keychain access.",
      );
    } else if (input.posture === "product-floor") {
      argv.push("--dangerously-skip-permissions");
      notes.push(
        "agy product-floor route with isolateHome (WP14/M0, agy 1.2.13): session-scoped HOME isolates user skills and plugins while leaving native slash commands active. Note: on macOS this drops login keychain access.",
      );
    } else if (input.posture === "curated") {
      argv.push("--dangerously-skip-permissions");
      for (const skill of input.skills) {
        fsPlan.push({
          kind: "copyDir",
          from: skill.dir,
          to: `$SESSION/.gemini/config/skills/${skill.id}`,
        });
      }
      notes.push(
        "agy curated clean room with isolateHome (WP14/M0, agy 1.2.13): session-scoped HOME receives auth files and copies of named skill directories under .gemini/config/skills. Verified live via canary skill returning CANARY_AGY_LOADED.",
      );
    }
  } else {
    // isolateHome: false (vanilla login invariant: never redirect HOME by default)
    // Runs against the user's real HOME directory so existing credentials and macOS login keychain work seamlessly.
    if (input.posture === "floor") {
      if (input.prompt !== undefined) {
        argv.push("--disable-slash-commands");
      }
      argv.push("--dangerously-skip-permissions");
      notes.push(
        "agy floor route (WP14/M0, agy 1.2.13): real HOME preserves vanilla credentials and macOS login keychain without repeated auth dialogs. --disable-slash-commands suppresses slash commands and skill expansion in print mode, --dangerously-skip-permissions allows non-interactive execution.",
      );
    } else if (input.posture === "product-floor") {
      argv.push("--dangerously-skip-permissions");
      notes.push(
        "agy product-floor route (WP14/M0, agy 1.2.13): real HOME preserves vanilla credentials and macOS login keychain without repeated auth dialogs. --dangerously-skip-permissions allows execution with native slash commands active as door surface.",
      );
    } else if (input.posture === "curated") {
      throw new Error(
        "agy curated posture requires --isolate-home (writing into real ~/.gemini is forbidden by P3). Pass --isolate-home to accept the keychain trade-off, or launch at a Heaven rung that does not need a scoped profile.",
      );
    }
  }

  if (input.model) argv.push("--model", input.model);
  if (input.prompt !== undefined) argv.push("-p", input.prompt);
  if (input.passthrough?.length) argv.push(...input.passthrough);

  return {
    ...base,
    command: "agy",
    argv,
    env,
    fsPlan,
    notes,
    execSupport: "exec",
  };
}
