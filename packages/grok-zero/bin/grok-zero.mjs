#!/usr/bin/env node
// grok-zero launcher shim: runs ../src/cli.ts through tsx. Resolves tsx by
// package location so it works under workspace hoisting.
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
  process.stderr.write("grok-zero: could not resolve tsx (is the package installed with its dependencies?)\n");
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
