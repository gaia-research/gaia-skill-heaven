// claude-zero CLI. Launches claude at a composed posture with the
// standing-dose statusline wired via a session-scoped --settings file. Every
// write lands in a fresh temp dir (P3: zero shared-config mutation) — including
// the materialized curated set and the session-scoped door-mcp.json core's
// fsPlan writes when the door's own summon MCP server is admitted (#143), which
// `materialize()` lays down before the spawn and the finally-block teardown
// removes on success AND failure. `--print` shows the plan without spawning
// claude (and without needing claude installed).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEAVEN_LEVELS, HELL_LEVELS, SUMMON_ONLY_LEVELS, LEVEL_ALIASES, materialize, POSTURES, type Posture } from "skill-zero";
import { CURATED_DOOR_ABSENCE_NOTE, planLaunch } from "./launcher.js";
import { CLI_PERMISSION_MODES } from "./permissions.js";

/**
 * The postures this door can actually compose today — the ONE place the answer
 * lives. Every surface that offers a `claude-zero` relaunch must check against
 * this set: offering a relaunch the CLI then refuses is claiming a transition
 * the harness cannot perform (KC7), which is a broken affordance whichever way
 * you look at it.
 *
 * The zero-dependency plugin gets a machine-copy of this array through
 * scripts/generate-ladder.ts → plugin/data/ladder.json, and a freshness test
 * asserts the artifact cannot drift.
 *
 * REMOVING A POSTURE IS ONE LINE: delete its entry below and regenerate the
 * artifact. Nothing else keys off a specific member — the renderer intersects
 * this list with its rows, and the launcher dispatches on core's `POSTURES`.
 *
 * WHAT IS DELIBERATELY ABSENT: the doorless benchmark `floor`. It is the
 * placebo-of-record (B2) and core's to compose for measurement runs only — F6
 * established that `--disable-slash-commands` suppresses plugin COMMANDS too, so
 * a door that launched it would be launching a session it cannot then talk to.
 */
export const LAUNCHABLE_POSTURES: readonly string[] = [
  "native",
  "curated",
  "product-floor",
];

interface CliArgs {
  help: boolean;
  print: boolean;
  posture: string;
  postureProvided: boolean;
  level?: string;
  /** --skill <path>, repeatable */
  skills: string[];
  claudeArgs: string[];
}

/**
 * A bad ARGUMENT (exit 2), distinct from a refused posture or a failed plan.
 *
 * Issue #144: `--permission-mode` used to fall through the generic
 * unknown-argument branch, so `--permission-mode` with nothing after it quietly
 * vanished and `--permission-mode --print` swallowed the wrapper's own `--print`
 * as a MODE. Those are silent loss and a corrupted mode value respectively. The
 * mode VALUE is now consumed atomically and a missing/empty/option-shaped value
 * throws here — before any session dir exists and before anything spawns.
 */
export class CliArgumentError extends Error {}

const isPermissionFlag = (a: string): boolean =>
  a === "--dangerously-skip-permissions" || a === "--allow-dangerously-skip-permissions";

export function parseArgs(argv: string[]): CliArgs {
  let help = false;
  let print = false;
  let posture = "product-floor";
  let postureProvided = false;
  let level: string | undefined;
  const skills: string[] = [];
  const claudeArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      claudeArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--help" || a === "-h") help = true;
    else if (a === "--print") print = true;
    else if (a === "--posture") {
      posture = argv[++i] ?? "";
      postureProvided = true;
    } else if (a === "--level") level = argv[++i];
    else if (a === "--skill") {
      const p = argv[++i];
      if (p !== undefined) skills.push(p);
    }
    // Issue #144 — PERMISSION FLAGS ARE CLAUDE'S, so they are forwarded, not
    // interpreted. Named branches exist so a value-taking option is consumed as
    // a unit instead of falling through to the unknown-argument branch. The
    // MODE VALUE is not validated here: claude owns its mode enum (and may add
    // modes), so the door only insists the value is actually present.
    else if (isPermissionFlag(a)) {
      claudeArgs.push(a);
    } else if (a === "--permission-mode") {
      const mode = argv[++i];
      if (mode === undefined || mode === "" || mode.startsWith("-")) {
        throw new CliArgumentError(
          `--permission-mode needs a mode value. Got ${mode === undefined ? "nothing" : `"${mode}"`}. ` +
            `Supported (claude 2.1.288): ${CLI_PERMISSION_MODES.join(", ")}.`,
        );
      }
      claudeArgs.push("--permission-mode", mode);
    } else if (a.startsWith("--permission-mode=")) {
      const mode = a.slice("--permission-mode=".length);
      if (mode === "" || mode.startsWith("-")) {
        throw new CliArgumentError(
          `--permission-mode= needs a mode value. Got ${mode === "" ? "an empty value" : `"${mode}"`}. ` +
            `Supported (claude 2.1.288): ${CLI_PERMISSION_MODES.join(", ")}.`,
        );
      }
      claudeArgs.push("--permission-mode", mode);
    } else claudeArgs.push(a);
  }
  return { help, print, posture, postureProvided, level, skills, claudeArgs };
}

/** Absolute path to the statusline bin shipped alongside this CLI. */
function statuslineBinPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "statusline.mjs");
}

/** Absolute path to the door's own plugin dir (the one carrying /skill-zero),
 * or undefined when it is not on disk beside us.
 *
 * The plugin moved OUT of this package to the repo root (`plugins/skill-heaven`)
 * when the marketplace consolidated to a single plugin. install.sh unpacks the
 * whole source tree, so the dir is there for every supported install; a bare
 * `npm i claude-zero` has no plugins/ beside it, and core is explicit that
 * omitting doorPluginDir still compiles product-floor ("mounting one is the
 * door package's business"). So this degrades to a doorless product-floor
 * rather than composing a --plugin-dir that points at nothing. */
function doorPluginDir(): string | undefined {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "plugins", "skill-heaven");
  return existsSync(dir) ? dir : undefined;
}

function helpText(): string {
  return [
    "Usage: claude-zero [--level <level>] [options] [-- <claude args...>]",
    "",
    `  --level <level>    Heaven rung: ${HEAVEN_LEVELS.join("|")} (default: zero)`,
    `                     Hell (${HELL_LEVELS.join("|")}) is armed live with /skill-hell`,
    "                     ultra is the crown rung, armed live with /skill-ultra",
    "  --level native     Explicitly keep the user's native setup",
    "  --skill <path>     Skill for low/curated (repeatable)",
    "  --posture <name>   Internal/benchmark vocabulary (compatibility)",
    "  --print            Print the composed plan without launching",
    "  -h, --help         Show this help",
    "",
    "Permission handling (#144): --dangerously-skip-permissions,",
    "  --allow-dangerously-skip-permissions and --permission-mode <mode> are",
    "  CLAUDE's flags and are forwarded verbatim, directly or after --:",
    "    claude-zero --permission-mode acceptEdits",
    "    claude-zero -- --dangerously-skip-permissions",
    "  An explicit permission flag wins over the mode configured in your Claude",
    "  settings. The clean room (--setting-sources '') would otherwise drop that",
    `  configuration, so a configured defaultMode is carried through: modes`,
    `  ${CLI_PERMISSION_MODES.join(", ")} (settings also accept \`default\`).`,
    "  Nothing else is imported from your settings, and no bypass is ever",
    "  granted on your behalf — claude's managed policy and its own bypass",
    "  acknowledgment still apply.",
    "",
    "Environment:",
    "  SKILL_SOURCE       One absolute http(s) summon source URL for this launch",
    "                     (a Skill Tree website root — the default — or a GitHub",
    "                     repository). Precedence: this override, then the mounted",
    "                     door plugin's own userConfig.skill_url.default. No other",
    "                     preference file is read.",
    "",
  ].join("\n");
}

export interface RunOptions {
  /** Issue #144: deterministic settings lookup for tests and for callers that
   * run under a `CLAUDE_CONFIG_DIR`. Omitted means the ambient environment /
   * `~/.claude`. Never causes a write to either. */
  configDir?: string;
  home?: string;
}

export function run(argv: string[], opts: RunOptions = {}): number {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    // Argument errors are reported and refused BEFORE a session dir exists and
    // before anything can spawn, so a malformed flag never half-launches.
    if (e instanceof CliArgumentError) {
      process.stderr.write(`claude-zero: ${e.message}\n`);
      return 2;
    }
    throw e;
  }

  if (args.help) {
    process.stdout.write(helpText());
    return 0;
  }

  // The upper band (high · xhigh · max · ultra) is handled below as live
  // summon rungs, never boot postures. Nothing on the line refuses (N13).
  let posture = args.posture;
  if (args.level !== undefined) {
    const aliased = LEVEL_ALIASES[args.level];
    if (!aliased) {
      if ((SUMMON_ONLY_LEVELS as readonly string[]).includes(args.level)) {
        // Not a gate. The upper band is armed LIVE, in-session — a different
        // dial from the launcher's boot posture. Nothing on the line refuses (N13).
        const arm = args.level === "ultra" ? "/skill-ultra" : `/skill-hell ${args.level}`;
        process.stderr.write(
          `claude-zero: --level ${args.level} is a live summon rung, not a boot posture. ` +
            `Launch a Heaven rung (${HEAVEN_LEVELS.join("|")}), then run ${arm}.\n`,
        );
      } else {
        process.stderr.write(
          `claude-zero: unknown --level "${args.level}" — choose ${HEAVEN_LEVELS.join("|")}, or native.\n`,
        );
      }
      return 2;
    }
    if (args.postureProvided && posture !== aliased) {
      process.stderr.write(
        `claude-zero: --level ${args.level} (= ${aliased}) contradicts --posture ${posture}.\n`,
      );
      return 2;
    }
    posture = aliased;
  }

  if (!LAUNCHABLE_POSTURES.includes(posture)) {
    // KC6: a refusal must say which of two unlike things it is. `floor` is
    // core-known but harness-incapable FOR A DOOR SPECIFICALLY — not withheld
    // by policy (nothing here decided to keep it from you), and not even a
    // capability gap in claude itself: F6 established `--disable-slash-commands`
    // suppresses plugin COMMANDS as well as plugin skills, so a door launched
    // there has no /skill-zero to talk to. There is no key to turn; the door
    // does not exist at that address. Anything else here is simply not a
    // posture core knows at all — a plain unknown-input error, neither class.
    if (posture === "floor") {
      process.stderr.write(
        `claude-zero cannot launch --posture floor: this is not a policy hold — ` +
          `the doorless benchmark floor suppresses plugin commands as well as plugin skills (F6), ` +
          `so a claude-zero session launched there would have no /skill-zero to talk to. There is no ` +
          `door to open at this posture; it is core's to compose, for benchmark runs only: ` +
          `\`skill-zero --posture floor\`.\n`,
      );
    } else if ((POSTURES as readonly string[]).includes(posture)) {
      process.stderr.write(
        `claude-zero does not launch --posture ${posture}. Launchable: ${LAUNCHABLE_POSTURES.join(", ")}. ` +
          `core knows this posture, but this door has no composition wired for it.\n`,
      );
    } else {
      process.stderr.write(
        `claude-zero: unknown --posture "${posture}" — not a posture core knows at all. ` +
          `Launchable: ${LAUNCHABLE_POSTURES.join(", ")}.\n`,
      );
    }
    return 2;
  }

  const selectedPosture = posture as Posture;

  if (args.print) {
    // Dry run: show the plan (incl. the exact manifest, settings and fsPlan that
    // WOULD be written) without touching disk — no temp dir to leak. The session
    // dir stays core's own "$SESSION" placeholder so the printed paths say what
    // they are instead of pretending to be real.
    let plan;
    try {
      plan = planLaunch({
        posture: selectedPosture,
        skillPaths: args.skills,
        sessionDir: "$SESSION",
        statuslineBin: statuslineBinPath(),
        doorPluginDir: doorPluginDir(),
        skillSource: process.env.SKILL_SOURCE,
        claudeArgs: args.claudeArgs,
        // Same lookup as a live launch — --print must show the same argv,
        // settings and disclosure the real launch would use.
        configDir: opts.configDir ?? process.env.CLAUDE_CONFIG_DIR,
        home: opts.home,
      });
    } catch (e) {
      process.stderr.write(`claude-zero: ${(e as Error).message}\n`);
      return 2;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          posture: plan.posture,
          standingTokens: plan.manifest.standingTokens,
          skillCount: plan.manifest.skillCount,
          scope: plan.manifest.scope,
          incomplete: plan.manifest.incomplete ?? false,
          launcherLocked: plan.manifest.launcherLocked,
          command: plan.command,
          argv: plan.argv,
          env: plan.env,
          fsPlan: plan.fsPlan,
          notes: plan.notes,
          permissionDisclosure: plan.permissionDisclosure ?? null,
          manifest: plan.manifest,
          settings: plan.settings,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  // Real launch: materialize the fsPlan and write manifest + settings into a
  // fresh temp dir, then remove it once claude exits (spawnSync is synchronous).
  // Nothing touches ~/.claude and no skill source is mutated — copyDir reads the
  // source and writes the session copy (P3). Nothing is left behind.
  const sessionDir = mkdtempSync(join(tmpdir(), "claude-zero-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: selectedPosture,
        skillPaths: args.skills,
        sessionDir,
        statuslineBin: statuslineBinPath(),
        doorPluginDir: doorPluginDir(),
        skillSource: process.env.SKILL_SOURCE,
        claudeArgs: args.claudeArgs,
        configDir: opts.configDir ?? process.env.CLAUDE_CONFIG_DIR,
        home: opts.home,
      });
      materialize(live.fsPlan, sessionDir);
    } catch (e) {
      process.stderr.write(`claude-zero: ${(e as Error).message}\n`);
      return 2;
    }
    writeFileSync(live.manifestPath, `${JSON.stringify(live.manifest, null, 2)}\n`);
    writeFileSync(live.settingsPath, `${JSON.stringify(live.settings, null, 2)}\n`);

    // KC6: disclose the curated door-absence HERE, on the CLI's own terminal,
    // because this is the last surface where the door still exists to say so.
    // Once claude spawns, the session is the whole world for the user, and
    // nothing inside a curated session can print this for itself (that IS the
    // gap being disclosed). --print readers already get this in `notes`.
    if (posture === "curated") {
      process.stderr.write(`${CURATED_DOOR_ABSENCE_NOTE}\n`);
    }

    // Issue #144: disclose an INHERITED permission policy here, on the CLI's own
    // terminal, before claude exists. The clean room dropped this decision from
    // the user's settings; the session is about to run under it, so the user is
    // told which mode is in force and that an explicit flag would have won.
    // One line, no settings content, no paths.
    if (live.permissionDisclosure) {
      process.stderr.write(`claude-zero: ${live.permissionDisclosure}\n`);
    }

    const r = spawnSync(live.command, live.argv, {
      stdio: "inherit",
      env: { ...process.env, ...live.env },
    });
    if (r.error) {
      const err = r.error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        process.stderr.write(`claude-zero: could not find the \`claude\` binary on PATH.\n`);
        return 127;
      }
      process.stderr.write(`claude-zero: failed to launch claude: ${err.message}\n`);
      return 1;
    }
    return r.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
