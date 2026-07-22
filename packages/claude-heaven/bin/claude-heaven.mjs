#!/usr/bin/env node
// claude-heaven launcher shim: runs ../src/cli.ts through tsx. Resolves tsx by
// package location so it works under workspace hoisting (mirrors core's
// skill-heaven.mjs).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "cli.ts");
const require = createRequire(import.meta.url);

let tsxCli;
try {
  tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
} catch {
  process.stderr.write("claude-heaven: could not resolve tsx (is the package installed with its dependencies?)\n");
  process.exit(1);
}

const r = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
