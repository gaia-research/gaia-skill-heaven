// claude-heaven CLI (WS4 slice 1). Launches claude at NATIVE posture with the
// standing-dose statusline wired via a session-scoped --settings file. Writes
// only to a fresh temp dir (P3: zero shared-config mutation). `--print` shows the
// plan without spawning claude (and without needing claude installed).

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLevelAllowed, planNativeLaunch } from "./launcher.js";

interface CliArgs {
  print: boolean;
  posture: string;
  level?: string;
  claudeArgs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let print = false;
  let posture = "native";
  let level: string | undefined;
  const claudeArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      claudeArgs.push(...argv.slice(i + 1));
      break;
    } else if (a === "--print") print = true;
    else if (a === "--posture") posture = argv[++i] ?? "";
    else if (a === "--level") level = argv[++i];
    else claudeArgs.push(a);
  }
  return { print, posture, level, claudeArgs };
}

/** Absolute path to the statusline bin shipped alongside this CLI. */
function statuslineBinPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "bin", "statusline.mjs");
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);

  // P2 gate first — never compose a gated posture.
  assertLevelAllowed(args.level);
  if (args.posture !== "native") {
    process.stderr.write(
      `claude-heaven slice 1 launches native only (got --posture ${args.posture}). ` +
        `The floor/curated postures land in WS4 step 2 (/skill-heaven).\n`,
    );
    return 2;
  }

  const sessionDir = mkdtempSync(join(tmpdir(), "claude-heaven-"));
  const plan = planNativeLaunch({
    sessionDir,
    statuslineBin: statuslineBinPath(),
    claudeArgs: args.claudeArgs,
  });

  writeFileSync(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);
  writeFileSync(plan.settingsPath, `${JSON.stringify(plan.settings, null, 2)}\n`);

  if (args.print) {
    process.stdout.write(
      `${JSON.stringify(
        {
          posture: plan.posture,
          standingTokens: plan.manifest.standingTokens,
          skillCount: plan.manifest.skillCount,
          scope: plan.manifest.scope,
          launcherLocked: plan.manifest.launcherLocked,
          command: plan.command,
          argv: plan.argv,
          env: plan.env,
          sessionDir,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const r = spawnSync(plan.command, plan.argv, {
    stdio: "inherit",
    env: { ...process.env, ...plan.env },
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
}

const isMain = process.argv[1]?.endsWith("cli.ts");
if (isMain) process.exit(run(process.argv.slice(2)));
