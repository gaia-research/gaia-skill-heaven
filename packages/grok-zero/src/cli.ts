// grok-zero CLI. Grok's non-native routes perform WP14's session-local
// inspect/config composition after materializing GROK_HOME. --print shows the
// compiled plan without spawning Grok; a real launch discovers exact paths and
// observed plugin names before spawning the verified route.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEAVEN_LEVELS, HELL_LEVELS, SUMMON_ONLY_LEVELS, materialize, POSTURES, type Posture } from "skill-zero";
import { planLaunch, prepareGrokSession, resolveLevelAlias } from "./launcher.js";

interface CliArgs {
  help: boolean;
  print: boolean;
  posture: string;
  postureProvided: boolean;
  level?: string;
  skills: string[];
  model?: string;
  grokArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let help = false;
  let print = false;
  let posture = "product-floor";
  let postureProvided = false;
  let level: string | undefined;
  let model: string | undefined;
  const skills: string[] = [];
  const grokArgs: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      grokArgs.push(...argv.slice(index + 1));
      break;
    } else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--print") print = true;
    else if (arg === "--posture") {
      posture = argv[++index] ?? "";
      postureProvided = true;
    }
    else if (arg === "--level") level = argv[++index];
    else if (arg === "--model") model = argv[++index];
    else if (arg === "--skill") {
      const path = argv[++index];
      if (path !== undefined) skills.push(path);
    } else grokArgs.push(arg);
  }

  return { help, print, posture, postureProvided, level, skills, model, grokArgs };
}

function helpText(): string {
  return [
    "Usage: grok-zero [--level <level>] [options] [-- <grok args...>]",
    "",
    `  --level <level>    Heaven rung: ${HEAVEN_LEVELS.join("|")} (default: off)`,
    `                     Hell (${HELL_LEVELS.join("|")}) is armed live with /skill-hell`,
    "                     ultra is the crown rung, armed live with /skill-ultra",
    "  --level native     Explicitly keep the user's native setup",
    "  --skill <path>     Skill for low/curated (repeatable)",
    "  --posture <name>   Internal/benchmark vocabulary (compatibility)",
    "  --model <model>    Select a Grok model",
    "  --print            Print the composed recipe without launching",
    "  -h, --help         Show this help",
    "",
  ].join("\n");
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(helpText());
    return 0;
  }

  // Keep the refusal and uncaught-throw exit behavior identical to pi-zero.
  let posture = args.posture;
  if (args.level !== undefined) {
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      if ((SUMMON_ONLY_LEVELS as readonly string[]).includes(args.level)) {
        // Not a gate. The upper band is armed LIVE, in-session — a different
        // dial from the launcher's boot posture. Nothing on the line refuses (N13).
        const arm = args.level === "ultra" ? "/skill-ultra" : `/skill-hell ${args.level}`;
        process.stderr.write(
          `grok-zero: --level ${args.level} is a live summon rung, not a boot posture. ` +
            `Launch a Heaven rung (${HEAVEN_LEVELS.join("|")}), then run ${arm}.\n`,
        );
      } else {
        process.stderr.write(`grok-zero: unknown --level "${args.level}" — choose ${HEAVEN_LEVELS.join("|")}, or native.\n`);
      }
      return 2;
    }
    if (args.postureProvided && posture !== aliased) {
      process.stderr.write(`grok-zero: --level ${args.level} (= ${aliased}) contradicts --posture ${posture}.\n`);
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `grok-zero: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
    );
    return 2;
  }

  if (args.print) {
    let plan;
    try {
      plan = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        sessionDir: "$SESSION",
        grokArgs: args.grokArgs,
      });
    } catch (error) {
      process.stderr.write(`grok-zero: ${(error as Error).message}\n`);
      return 2;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          posture: plan.posture,
          skillCount: plan.skillCount,
          command: plan.command,
          argv: plan.argv,
          env: plan.env,
          fsPlan: plan.fsPlan,
          notes: plan.notes,
          execSupport: plan.execSupport,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const sessionDir = mkdtempSync(join(tmpdir(), "grok-zero-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        sessionDir,
        grokArgs: args.grokArgs,
      });
      materialize(live.fsPlan, sessionDir);
      prepareGrokSession(live);
    } catch (error) {
      process.stderr.write(`grok-zero: ${(error as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `grok-zero: ${live.posture} compiled as a recipe (cells not verified for portable live exec — see ../PROBE.md) — use --print.\n`,
      );
      return 2;
    }

    const result = spawnSync(live.command, live.argv, {
      stdio: "inherit",
      env: { ...process.env, ...live.env },
    });
    if (result.error) {
      const error = result.error as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        process.stderr.write("grok-zero: could not find the `grok` binary on PATH.\n");
        return 127;
      }
      process.stderr.write(`grok-zero: failed to launch grok: ${error.message}\n`);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
