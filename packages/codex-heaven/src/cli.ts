// codex-heaven CLI. Launches codex at a composed posture. Every write lands
// in a fresh temp dir (P3: zero shared-config mutation) — core's compiled
// fsPlan copies auth.json in and, at curated, skill dirs under
// $SESSION/codex; nothing outside the session dir is ever touched. `--print`
// shows the plan without spawning codex (and without needing codex
// installed).
//
// Non-native postures perform WP14's session-local exact-path discovery after
// materializing CODEX_HOME and before spawning codex. --print remains pure and
// shows the compiled route; a real launch asks codex app-server skills/list for
// the paths present in that disposable session, writes its skills.config there,
// and then starts the verified clean-room process.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialize, POSTURES, type Posture } from "skill-heaven";
import { assertLevelAllowed, planLaunch, prepareCodexSession, resolveLevelAlias } from "./launcher.js";

interface CliArgs {
  print: boolean;
  posture: string;
  level?: string;
  /** --skill <path>, repeatable */
  skills: string[];
  model?: string;
  codexArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let print = false;
  let posture = "native";
  let level: string | undefined;
  let model: string | undefined;
  const skills: string[] = [];
  const codexArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      codexArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--print") print = true;
    else if (a === "--posture") posture = argv[++i] ?? "";
    else if (a === "--level") level = argv[++i];
    else if (a === "--model") model = argv[++i];
    else if (a === "--skill") {
      const p = argv[++i];
      if (p !== undefined) skills.push(p);
    } else codexArgs.push(a);
  }
  return { print, posture, level, skills, model, codexArgs };
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);

  // P2 gate first — never compose a gated (Hell-lane) level. Same wording and
  // uncaught-throw behavior as claude-heaven and pi-heaven — the refusal
  // reads the same on every door.
  assertLevelAllowed(args.level);

  let posture = args.posture;
  if (args.level !== undefined) {
    // Like pi-heaven (and unlike claude-heaven, whose --posture is its sole
    // ratified selector), codex-heaven implements off/low as working
    // aliases. Gated levels never reach here (refused above).
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      process.stderr.write(
        `codex-heaven: unknown --level "${args.level}" — known aliases: off, low (off→product-floor, low→curated). ` +
          `Hell-lane levels (med, high, xhigh, max) are gated (P2) and refused before reaching here.\n`,
      );
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `codex-heaven: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
    );
    return 2;
  }

  if (args.print) {
    // Dry run: show the plan without touching disk — no temp dir to leak. The
    // session dir stays core's own "$SESSION" placeholder so the printed
    // paths say what they are instead of pretending to be real.
    let plan;
    try {
      plan = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        sessionDir: "$SESSION",
        codexArgs: args.codexArgs,
      });
    } catch (e) {
      process.stderr.write(`codex-heaven: ${(e as Error).message}\n`);
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

  // Real launch: materialize the fsPlan (auth.json copy, curated skill dirs)
  // into a fresh temp dir, spawn codex, then remove it once codex exits
  // (spawnSync is synchronous). Nothing touches the user's real ~/.codex
  // (P3) — codex reads its scoped $CODEX_HOME from the session dir only.
  const sessionDir = mkdtempSync(join(tmpdir(), "codex-heaven-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        sessionDir,
        codexArgs: args.codexArgs,
      });
      materialize(live.fsPlan, sessionDir);
      prepareCodexSession(live);
    } catch (e) {
      process.stderr.write(`codex-heaven: ${(e as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `codex-heaven: ${live.posture} compiled as a recipe (cells not verified for live exec — see ../PROBE.md) — use --print.\n`,
      );
      return 2;
    }

    const r = spawnSync(live.command, live.argv, {
      stdio: "inherit",
      env: { ...process.env, ...live.env },
    });
    if (r.error) {
      const err = r.error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        process.stderr.write(`codex-heaven: could not find the \`codex\` binary on PATH.\n`);
        return 127;
      }
      process.stderr.write(`codex-heaven: failed to launch codex: ${err.message}\n`);
      return 1;
    }
    return r.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
