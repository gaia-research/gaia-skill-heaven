// pi-heaven CLI. Launches pi at a composed posture. Every write lands in a
// fresh temp dir (P3: zero shared-config mutation), for symmetry with the
// other doors — pi's compiled fsPlan is empty at every posture verified so
// far (../PROBE.md), so nothing is written there today. `--print` shows the
// plan without spawning pi (and without needing pi installed).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LADDER_LEVELS, materialize, POSTURES, type Posture } from "skill-heaven";
import { assertLevelAllowed, planLaunch, resolveLevelAlias } from "./launcher.js";

// Guinea-pig model for this prototype (WP2 dispatch brief) — cheap and
// consistent, verified working against pi 0.83.0 (PROBE.md). Only applied
// when the caller does not pass --model.
const DEFAULT_MODEL = "openai-codex/gpt-5.6-luna:low";
const PROFILE_ENV = "PI_HEAVEN_PROFILE";
const PROFILE_FILE = "pi-heaven-profile.json";
const BUNDLED_EXTENSION = join(dirname(fileURLToPath(import.meta.url)), "..", "extension", "pi-heaven.ts");

function piArgsWithDoor(posture: string, piArgs: string[]): string[] {
  // The benchmark floor is intentionally doorless. Do not add the extension
  // there: changing that route would invalidate the placebo-of-record.
  return posture === "floor" ? piArgs : ["--extension", BUNDLED_EXTENSION, ...piArgs];
}

function profileManifest(plan: ReturnType<typeof planLaunch>): string {
  return `${JSON.stringify(
    {
      schema: "pi-heaven/profile@1",
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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      piArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--help" || a === "-h") help = true;
    else if (a === "--print") print = true;
    else if (a === "--posture") {
      posture = argv[++i] ?? "";
      postureProvided = true;
    }
    else if (a === "--level") level = argv[++i];
    else if (a === "--model") model = argv[++i];
    else if (a === "--skill") {
      const p = argv[++i];
      if (p !== undefined) skills.push(p);
    } else piArgs.push(a);
  }
  return { help, print, posture, postureProvided, level, skills, model, piArgs };
}

function helpText(): string {
  return [
    "Usage: pi-heaven [--level <level>] [options] [-- <pi args...>]",
    "",
    `  --level <level>    Ladder rung: ${LADDER_LEVELS.join("|")} (default: off)`,
    "                     med..max are P2-gated; ultra is unratified",
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

  // P2 gate first — never compose a gated (Hell-lane) level. Same wording and
  // uncaught-throw behavior as claude-heaven (packages/claude-heaven/src/
  // cli.ts + src/launcher.ts's assertLevelAllowed) — the refusal reads the
  // same on every door.
  assertLevelAllowed(args.level);

  let posture = args.posture;
  if (args.level !== undefined) {
    // Unlike claude-heaven (which refuses --level outright — --posture is its
    // ratified selector), pi-heaven implements off/low as working aliases per
    // the WP2 brief. Gated levels never reach here (refused above).
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      process.stderr.write(
        `pi-heaven: unknown --level "${args.level}" — choose ${LADDER_LEVELS.join("|")}, or native.\n`,
      );
      return 2;
    }
    if (args.postureProvided && posture !== aliased) {
      process.stderr.write(`pi-heaven: --level ${args.level} (= ${aliased}) contradicts --posture ${posture}.\n`);
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `pi-heaven: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
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
      process.stderr.write(`pi-heaven: ${(e as Error).message}\n`);
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
  const sessionDir = mkdtempSync(join(tmpdir(), "pi-heaven-"));
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
      process.stderr.write(`pi-heaven: ${(e as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `pi-heaven: ${live.posture} compiled as a recipe (cells not verified for live exec) — use --print.\n`,
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
        process.stderr.write(`pi-heaven: could not find the \`pi\` binary on PATH.\n`);
        return 127;
      }
      process.stderr.write(`pi-heaven: failed to launch pi: ${err.message}\n`);
      return 1;
    }
    return r.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
