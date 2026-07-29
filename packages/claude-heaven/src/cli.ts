// claude-heaven CLI. Launches claude at a composed posture with the
// standing-dose statusline wired via a session-scoped --settings file. Every
// write lands in a fresh temp dir (P3: zero shared-config mutation) — including
// the materialized curated set. `--print` shows the plan without spawning claude
// (and without needing claude installed).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { materialize, type Posture } from "skill-heaven";
import { assertLevelAllowed, planLaunch } from "./launcher.js";

/**
 * The postures this door can actually compose today — the ONE place the answer
 * lives. Every surface that offers a `claude-heaven` relaunch must check against
 * this set: offering a relaunch the CLI then refuses is claiming a transition
 * the harness cannot perform (KC7), which is a broken affordance whichever way
 * you look at it.
 *
 * `plugin/scripts/render-posture.mjs` derives its `RELAUNCH_OFFERS` from a
 * MACHINE-COPY of this array (scripts/generate-p2-gate.ts → plugin/data), never
 * from a hand-written list, and a test asserts the two cannot drift apart.
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
  print: boolean;
  posture: string;
  level?: string;
  /** --skill <path>, repeatable */
  skills: string[];
  claudeArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let print = false;
  let posture = "native";
  let level: string | undefined;
  const skills: string[] = [];
  const claudeArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      claudeArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--print") print = true;
    else if (a === "--posture") posture = argv[++i] ?? "";
    else if (a === "--level") level = argv[++i];
    else if (a === "--skill") {
      const p = argv[++i];
      if (p !== undefined) skills.push(p);
    } else claudeArgs.push(a);
  }
  return { print, posture, level, skills, claudeArgs };
}

/** Absolute path to the statusline bin shipped alongside this CLI. */
function statuslineBinPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "statusline.mjs");
}

/** Absolute path to the door's own plugin dir (the one carrying /skill-heaven). */
function doorPluginDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "plugin");
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);

  // P2 gate first — never compose a gated (Hell-lane) posture.
  assertLevelAllowed(args.level);

  if (!LAUNCHABLE_POSTURES.includes(args.posture)) {
    process.stderr.write(
      `claude-heaven does not launch --posture ${args.posture}. ` +
        `Launchable: ${LAUNCHABLE_POSTURES.join(", ")}. ` +
        `The benchmark floor is not a door posture — it runs from core, for benchmark runs only.\n`,
    );
    return 2;
  }
  if (args.level !== undefined) {
    // off/low are heaven-lane aliases whose vocabulary is provisional (N3,
    // pending N4/N5). Reject rather than silently ignore the flag: --posture is
    // the ratified selector.
    process.stderr.write(
      `claude-heaven selects postures with --posture, not --level (got --level ${args.level}).\n`,
    );
    return 2;
  }

  const posture = args.posture as Posture;

  if (args.print) {
    // Dry run: show the plan (incl. the exact manifest, settings and fsPlan that
    // WOULD be written) without touching disk — no temp dir to leak. The session
    // dir stays core's own "$SESSION" placeholder so the printed paths say what
    // they are instead of pretending to be real.
    let plan;
    try {
      plan = planLaunch({
        posture,
        skillPaths: args.skills,
        sessionDir: "$SESSION",
        statuslineBin: statuslineBinPath(),
        doorPluginDir: doorPluginDir(),
        claudeArgs: args.claudeArgs,
      });
    } catch (e) {
      process.stderr.write(`claude-heaven: ${(e as Error).message}\n`);
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
  const sessionDir = mkdtempSync(join(tmpdir(), "claude-heaven-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture,
        skillPaths: args.skills,
        sessionDir,
        statuslineBin: statuslineBinPath(),
        doorPluginDir: doorPluginDir(),
        claudeArgs: args.claudeArgs,
      });
      materialize(live.fsPlan, sessionDir);
    } catch (e) {
      process.stderr.write(`claude-heaven: ${(e as Error).message}\n`);
      return 2;
    }
    writeFileSync(live.manifestPath, `${JSON.stringify(live.manifest, null, 2)}\n`);
    writeFileSync(live.settingsPath, `${JSON.stringify(live.settings, null, 2)}\n`);

    const r = spawnSync(live.command, live.argv, {
      stdio: "inherit",
      env: { ...process.env, ...live.env },
    });
    if (r.error) {
      const err = r.error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        process.stderr.write(`claude-heaven: could not find the \`claude\` binary on PATH.\n`);
        return 127;
      }
      process.stderr.write(`claude-heaven: failed to launch claude: ${err.message}\n`);
      return 1;
    }
    return r.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
