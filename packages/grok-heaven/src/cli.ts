// grok-heaven CLI. Grok's non-native routes perform WP14's session-local
// inspect/config composition after materializing GROK_HOME. --print shows the
// compiled plan without spawning Grok; a real launch discovers exact paths and
// observed plugin names before spawning the verified route.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialize, POSTURES, type Posture } from "skill-heaven";
import { assertLevelAllowed, planLaunch, prepareGrokSession, resolveLevelAlias } from "./launcher.js";

interface CliArgs {
  print: boolean;
  posture: string;
  level?: string;
  skills: string[];
  model?: string;
  grokArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let print = false;
  let posture = "native";
  let level: string | undefined;
  let model: string | undefined;
  const skills: string[] = [];
  const grokArgs: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      grokArgs.push(...argv.slice(index + 1));
      break;
    } else if (arg === "--print") print = true;
    else if (arg === "--posture") posture = argv[++index] ?? "";
    else if (arg === "--level") level = argv[++index];
    else if (arg === "--model") model = argv[++index];
    else if (arg === "--skill") {
      const path = argv[++index];
      if (path !== undefined) skills.push(path);
    } else grokArgs.push(arg);
  }

  return { print, posture, level, skills, model, grokArgs };
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);

  // Keep the refusal and uncaught-throw exit behavior identical to pi-heaven.
  assertLevelAllowed(args.level);

  let posture = args.posture;
  if (args.level !== undefined) {
    const aliased = resolveLevelAlias(args.level);
    if (!aliased) {
      process.stderr.write(
        `grok-heaven: unknown --level "${args.level}" — known aliases: off, low (off→product-floor, low→curated). ` +
          `Hell-lane levels (med, high, xhigh, max) are gated (P2) and refused before reaching here.\n`,
      );
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `grok-heaven: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
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
      process.stderr.write(`grok-heaven: ${(error as Error).message}\n`);
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

  const sessionDir = mkdtempSync(join(tmpdir(), "grok-heaven-"));
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
      process.stderr.write(`grok-heaven: ${(error as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `grok-heaven: ${live.posture} compiled as a recipe (cells not verified for portable live exec — see ../PROBE.md) — use --print.\n`,
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
        process.stderr.write("grok-heaven: could not find the `grok` binary on PATH.\n");
        return 127;
      }
      process.stderr.write(`grok-heaven: failed to launch grok: ${error.message}\n`);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
