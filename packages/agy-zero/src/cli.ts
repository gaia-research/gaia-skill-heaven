// agy-zero CLI. Launches Antigravity CLI (agy) at a composed posture.
// Every write lands in a fresh temp dir (P3: zero shared-config mutation).
// --print shows the plan without spawning agy.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEAVEN_LEVELS, HELL_LEVELS, SUMMON_ONLY_LEVELS, materialize, POSTURES, type Posture } from "skill-zero";
import { planLaunch, resolveLevelAlias } from "./launcher.js";

interface CliArgs {
  help: boolean;
  print: boolean;
  posture: string;
  postureProvided: boolean;
  level?: string;
  skills: string[];
  model?: string;
  prompt?: string;
  agyArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let help = false;
  let print = false;
  let posture = "product-floor";
  let postureProvided = false;
  let level: string | undefined;
  let model: string | undefined;
  let prompt: string | undefined;
  const skills: string[] = [];
  const agyArgs: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      agyArgs.push(...argv.slice(index + 1));
      break;
    } else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--print") print = true;
    else if (arg === "--posture") {
      posture = argv[++index] ?? "";
      postureProvided = true;
    } else if (arg === "--level") {
      level = argv[++index];
    } else if (arg === "--model") {
      model = argv[++index];
    } else if (arg === "-p" || arg === "--print-prompt" || arg === "--prompt") {
      prompt = argv[++index];
    } else if (arg === "--skill") {
      const path = argv[++index];
      if (path !== undefined) skills.push(path);
    } else {
      agyArgs.push(arg);
    }
  }

  return { help, print, posture, postureProvided, level, skills, model, prompt, agyArgs };
}

function helpText(): string {
  return [
    "Usage: agy-zero [--level <level>] [options] [-- <agy args...>]",
    "",
    `  --level <level>    Heaven rung: ${HEAVEN_LEVELS.join("|")} (default: zero)`,
    `                     Hell (${HELL_LEVELS.join("|")}) is armed live with /skill-hell`,
    "                     ultra is the crown rung, armed live with /skill-ultra",
    "  --level native     Explicitly keep the user's native setup",
    "  --skill <path>     Skill for low/curated (repeatable)",
    "  --posture <name>   Internal/benchmark vocabulary (compatibility)",
    "  --model <model>    Select an Antigravity model",
    "  -p, --prompt <msg> Run non-interactively with prompt",
    "  --print            Print the composed plan without launching",
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

  let posture = args.posture;
  if (args.level !== undefined) {
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      if ((SUMMON_ONLY_LEVELS as readonly string[]).includes(args.level)) {
        const arm = args.level === "ultra" ? "/skill-ultra" : `/skill-hell ${args.level}`;
        process.stderr.write(
          `agy-zero: --level ${args.level} is a live summon rung, not a boot posture. ` +
            `Launch a Heaven rung (${HEAVEN_LEVELS.join("|")}), then run ${arm}.\n`,
        );
      } else {
        process.stderr.write(`agy-zero: unknown --level "${args.level}" — choose ${HEAVEN_LEVELS.join("|")}, or native.\n`);
      }
      return 2;
    }
    if (args.postureProvided && posture !== aliased) {
      process.stderr.write(`agy-zero: --level ${args.level} (= ${aliased}) contradicts --posture ${posture}.\n`);
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `agy-zero: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
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
        prompt: args.prompt,
        sessionDir: "$SESSION",
        agyArgs: args.agyArgs,
      });
    } catch (error) {
      process.stderr.write(`agy-zero: ${(error as Error).message}\n`);
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

  const sessionDir = mkdtempSync(join(tmpdir(), "agy-zero-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        prompt: args.prompt,
        sessionDir,
        agyArgs: args.agyArgs,
      });
      materialize(live.fsPlan, sessionDir);
    } catch (error) {
      process.stderr.write(`agy-zero: ${(error as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `agy-zero: ${live.posture} compiled as a recipe (cells not verified for clean live exec — see ../PROBE.md) — use --print.\n`,
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
        process.stderr.write("agy-zero: could not find the `agy` binary on PATH.\n");
        return 127;
      }
      process.stderr.write(`agy-zero: failed to launch agy: ${error.message}\n`);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js");
if (isMain) process.exit(run(process.argv.slice(2)));
