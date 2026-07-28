// claude-heaven CLI (WS4 slice 1). Launches claude at NATIVE posture with the
// standing-dose statusline wired via a session-scoped --settings file. Writes
// only to a fresh temp dir (P3: zero shared-config mutation). `--print` shows the
// plan without spawning claude (and without needing claude installed).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  // P2 gate first — never compose a gated (Hell-lane) posture.
  assertLevelAllowed(args.level);
  // Slice 1 is native-only. A non-native posture, OR any non-gated level (off/low
  // are heaven-lane aliases for the floors/curated), implies a posture slice 1
  // doesn't build yet — reject explicitly rather than silently ignore the flag.
  //
  // Note which floor this door will eventually launch: `product-floor`, the
  // doorful one (V5-5). The doorless benchmark `floor` is the placebo-of-record
  // (B2) and is core's to compose for a measurement run — a door that launched
  // it would be launching a session it cannot then talk to (F6).
  if (args.posture !== "native") {
    process.stderr.write(
      `claude-heaven slice 1 launches native only (got --posture ${args.posture}). ` +
        `The product-floor/curated postures land in a later WS4 slice. ` +
        `The benchmark floor is not a door posture — it runs from core, for benchmark runs only.\n`,
    );
    return 2;
  }
  if (args.level !== undefined) {
    process.stderr.write(
      `claude-heaven slice 1 launches native only; --level ${args.level} (heaven-lane) has no effect yet. ` +
        `Level selection lands in WS4 step 2 (/skill-heaven).\n`,
    );
    return 2;
  }

  const plan = planNativeLaunch({
    sessionDir: "<print>", // placeholder; --print never writes to disk
    statuslineBin: statuslineBinPath(),
    claudeArgs: args.claudeArgs,
  });

  if (args.print) {
    // Dry run: show the plan (incl. the exact manifest + settings that WOULD be
    // written) without touching disk — no temp dir to leak.
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
          manifest: plan.manifest,
          settings: plan.settings,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  // Real launch: write manifest + settings to a fresh temp dir, and remove it
  // once claude exits (spawnSync is synchronous). Nothing touches ~/.claude (P3);
  // nothing is left behind.
  const sessionDir = mkdtempSync(join(tmpdir(), "claude-heaven-"));
  try {
    const live = planNativeLaunch({
      sessionDir,
      statuslineBin: statuslineBinPath(),
      claudeArgs: args.claudeArgs,
    });
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
