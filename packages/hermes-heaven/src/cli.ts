// hermes-heaven CLI. Hermes 0.20.0 clean-room routes are verified in
// ../PROBE.md: floor/product-floor omit the skills toolset, while curated
// copies arbitrary skill directories into a session-scoped HERMES_HOME.
// --print shows the plan; real launches materialize only session-local files.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialize, POSTURES, type Posture } from "skill-heaven";
import { assertLevelAllowed, planLaunch, resolveLevelAlias } from "./launcher.js";

interface CliArgs {
  print: boolean;
  posture: string;
  level?: string;
  skills: string[];
  model?: string;
  hermesArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let print = false;
  let posture = "native";
  let level: string | undefined;
  let model: string | undefined;
  const skills: string[] = [];
  const hermesArgs: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      hermesArgs.push(...argv.slice(index + 1));
      break;
    } else if (arg === "--print") print = true;
    else if (arg === "--posture") posture = argv[++index] ?? "";
    else if (arg === "--level") level = argv[++index];
    else if (arg === "--model") model = argv[++index];
    else if (arg === "--skill") {
      const path = argv[++index];
      if (path !== undefined) skills.push(path);
    } else hermesArgs.push(arg);
  }

  return { print, posture, level, skills, model, hermesArgs };
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
        `hermes-heaven: unknown --level "${args.level}" — known aliases: off, low (off→floor, low→curated). ` +
          `Hell-lane levels (med, high, xhigh, max) are gated (P2) and refused before reaching here.\n`,
      );
      return 2;
    }
    posture = aliased;
  }

  if (!(POSTURES as readonly string[]).includes(posture)) {
    process.stderr.write(
      `hermes-heaven: unknown --posture "${posture}" — not a posture core knows at all. Known: ${POSTURES.join(", ")}.\n`,
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
        hermesArgs: args.hermesArgs,
      });
    } catch (error) {
      process.stderr.write(`hermes-heaven: ${(error as Error).message}\n`);
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

  const sessionDir = mkdtempSync(join(tmpdir(), "hermes-heaven-"));
  try {
    let live;
    try {
      live = planLaunch({
        posture: posture as Posture,
        skillPaths: args.skills,
        model: args.model,
        sessionDir,
        hermesArgs: args.hermesArgs,
      });
      materialize(live.fsPlan, sessionDir);
    } catch (error) {
      process.stderr.write(`hermes-heaven: ${(error as Error).message}\n`);
      return 2;
    }

    if (live.execSupport !== "exec") {
      process.stderr.write(
        `hermes-heaven: ${live.posture} compiled as a recipe (cells not verified for clean live exec — see ../PROBE.md) — use --print.\n`,
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
        process.stderr.write("hermes-heaven: could not find the `hermes` binary on PATH.\n");
        return 127;
      }
      process.stderr.write(`hermes-heaven: failed to launch hermes: ${error.message}\n`);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
