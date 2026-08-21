// pi-zero CLI. Launches pi at a composed posture. Every write lands in a
// fresh temp dir (P3: zero shared-config mutation), for symmetry with the
// other doors — pi's compiled fsPlan is empty at every posture verified so
// far (../PROBE.md), so nothing is written there today. `--print` shows the
// plan without spawning pi (and without needing pi installed).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEAVEN_LEVELS, HELL_LEVELS, SUMMON_ONLY_LEVELS, materialize, POSTURES, type Posture } from "skill-zero";
import { planLaunch, resolveLevelAlias } from "./launcher.js";

// Guinea-pig model for this prototype (WP2 dispatch brief) — cheap and
// consistent, verified working against pi 0.83.0 (PROBE.md). Only applied
// when the caller does not pass --model.
const DEFAULT_MODEL = "openai-codex/gpt-5.6-luna:low";
const PROFILE_ENV = "PI_ZERO_PROFILE";
const PROFILE_FILE = "pi-zero-profile.json";
const BUNDLED_EXTENSION = join(dirname(fileURLToPath(import.meta.url)), "..", "extension", "pi-zero.ts");

function piArgsWithDoor(posture: string, piArgs: string[]): string[] {
  // The benchmark floor is intentionally doorless. Do not add the extension
  // there: changing that route would invalidate the placebo-of-record.
  return posture === "floor" ? piArgs : ["--extension", BUNDLED_EXTENSION, ...piArgs];
}

function profileManifest(plan: ReturnType<typeof planLaunch>): string {
  return `${JSON.stringify(
    {
      schema: "pi-zero/profile@1",
      posture: plan.posture,
      command: plan.command,
      argv: plan.argv,
      // Native admits ambient skills that the launcher does not enumerate.
      // The extension reports pi's live loaded count instead of calling zero.
      admittedSkillCount: plan.posture === "native" ? null : plan.skillCount,
      notes: plan.notes,
    },
    null,
    2,
  )}\n`;
}

interface CliArgs {
  help: boolean;
  print: boolean;
  posture: string;
  postureProvided: boolean;
  level?: string;
  /** --skill <path>, repeatable */
  skills: string[];
  model?: string;
  piArgs: string[];
  errors: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let help = false;
  let print = false;
  let posture = "product-floor";
  let postureProvided = false;
  let level: string | undefined;
  let model: string | undefined;
  const skills: string[] = [];
  const piArgs: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      piArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--help" || a === "-h") help = true;
    else if (a === "--print") print = true;
    else if (a === "--posture") {
      if (i + 1 >= argv.length) {
        errors.push("option '--posture' requires an argument");
      } else {
        posture = argv[++i] ?? "";
        postureProvided = true;
      }
    } else if (a === "--level") {
      if (i + 1 >= argv.length) {
        errors.push("option '--level' requires an argument");
      } else {
        level = argv[++i];
      }
    } else if (a === "--model") {
      if (i + 1 >= argv.length) {
        errors.push("option '--model' requires an argument");
      } else {
        model = argv[++i];
      }
    } else if (a === "--skill") {
      if (i + 1 >= argv.length) {
        errors.push("option '--skill' requires an argument");
      } else {
        const p = argv[++i];
        if (p !== undefined) skills.push(p);
      }
    } else piArgs.push(a);
  }
  return { help, print, posture, postureProvided, level, skills, model, piArgs, errors };
}

function helpText(): string {
  return [
    "Usage: pi-zero [--level <level>] [options] [-- <pi args...>]",
    "",
    `  --level <level>    Heaven rung: ${HEAVEN_LEVELS.join("|")} (default: zero)`,
    `                     Hell (${HELL_LEVELS.join("|")}) is armed live with /skill-hell`,
    "                     ultra is the crown rung, armed live with /skill-ultra",
    "  --level native     Explicitly keep the user's native setup",
    "  --skill <path>     Skill for low/curated (repeatable)",
    "  --posture <name>   Internal/benchmark vocabulary (compatibility)",
    "  --model <model>    Override the default model",
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

  if (args.errors.length > 0) {
    for (const err of args.errors) {
      process.stderr.write(`pi-zero: ${err}\n`);
    }
    return 2;
  }

  // The upper band (high · xhigh · max · ultra) is armed live, in-session.
  // It routes below to
  // the live /skill-hell surface instead of being treated as postures.
  let posture = args.posture;
  if (args.level !== undefined) {
    // Heaven aliases select boot postures. Hell levels have no posture mapping
    // and are routed to /skill-hell below.
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      if ((SUMMON_ONLY_LEVELS as readonly string[]).includes(args.level)) {
        // Not a gate. The upper band is armed LIVE, in-session — a different
        // dial from the launcher's boot posture. Nothing on the line refuses (N13).
        const arm = args.level === "ultra" ? "/skill-ultra" : `/skill-hell ${args.level}`;
        process.stderr.write(
          `pi-zero: --level ${args.level} is a live summon rung, not a boot posture. ` +
            `Launch a Heaven rung (${HEAVEN_LEVELS.join("|")}), then run ${arm}.\n`,
        );
      } else {
        process.stderr.write(`pi-zero: unknown --level "${args.level}" — choose ${HEAVEN_LEVELS.join("|")}, or native.\n`);
      }
      return 2;
    }
    if (args.postureProvided && posture !== aliased) {
      process.stderr.write(`pi-zero: --level ${args.level} (= ${aliased}) contradicts --posture ${posture}.\n`);
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `pi-zero: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
    );
    return 2;
  }

  const model = args.model ?? DEFAULT_MODEL;

  if (args.print) {
    // Dry run: show the plan without touching disk — no temp dir to leak. The
    // session dir stays core's own "$SESSION" placeholder so the printed
    // paths say what they are instead of pretending to be real.
    let plan;
    try {
      plan = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model,
        sessionDir: "$SESSION",
        piArgs: piArgsWithDoor(posture, args.piArgs),
      });
    } catch (e) {
      let msg = (e as Error).message;
      if (args.level) {
        msg = msg.replace("--posture curated", `--level ${args.level}`);
      }
      process.stderr.write(`pi-zero: ${msg}\n`);
      return 2;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          posture: plan.posture,
          skillCount: plan.skillCount,
          command: plan.command,
          argv: plan.argv,
          env:
            posture === "floor"
              ? plan.env
              : { ...plan.env, [PROFILE_ENV]: `$SESSION/${PROFILE_FILE}` },
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

  // Real launch: materialize the (currently always empty) fsPlan into a fresh
  // temp dir, spawn pi, then remove it once pi exits (spawnSync is
  // synchronous). Nothing touches the user's real pi config (P3).
  const sessionDir = mkdtempSync(join(tmpdir(), "pi-zero-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model,
        sessionDir,
        piArgs: piArgsWithDoor(posture, args.piArgs),
      });
      materialize(live.fsPlan, sessionDir);
      if (posture !== "floor") {
        writeFileSync(join(sessionDir, PROFILE_FILE), profileManifest(live), {
          encoding: "utf8",
          mode: 0o600,
        });
      }
    } catch (e) {
      let msg = (e as Error).message;
      if (args.level) {
        msg = msg.replace("--posture curated", `--level ${args.level}`);
      }
      process.stderr.write(`pi-zero: ${msg}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `pi-zero: ${live.posture} compiled as a recipe (cells not verified for live exec) — use --print.\n`,
      );
      return 2;
    }

    const profileEnv =
      posture === "floor" ? {} : { [PROFILE_ENV]: join(sessionDir, PROFILE_FILE) };
    const r = spawnSync(live.command, live.argv, {
      stdio: "inherit",
      env: { ...process.env, ...live.env, ...profileEnv },
    });
    if (r.error) {
      const err = r.error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        process.stderr.write(`pi-zero: could not find the \`pi\` binary on PATH.\n`);
        return 127;
      }
      process.stderr.write(`pi-zero: failed to launch pi: ${err.message}\n`);
      return 1;
    }
    return r.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
