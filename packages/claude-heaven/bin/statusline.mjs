#!/usr/bin/env node
// Statusline segment shim: runs ../src/statusline-cli.ts through tsx. Resolves
// tsx by package location so it works under workspace hoisting (mirrors core's
// skill-heaven.mjs). Claude Code invokes this as the statusLine.command; stdin
// is inherited so the CLI can read the statusline JSON.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "statusline-cli.ts");
const require = createRequire(import.meta.url);

// Hot path (runs every render). If tsx can't be resolved — e.g. this door was
// installed standalone, outside the monorepo's hoisted node_modules — degrade to
// an EMPTY segment rather than throwing and breaking the user's prompt.
let tsxCli;
try {
  tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
} catch {
  process.exit(0);
}

const r = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
