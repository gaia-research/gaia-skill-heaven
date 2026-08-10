#!/usr/bin/env node
// Thin bin shim: runs ../src/cli.ts through tsx. Resolves tsx by package
// location (not a hardcoded node_modules path) so it works whether tsx is
// hoisted to the monorepo root or installed under this package.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "cli.ts");
const require = createRequire(import.meta.url);
const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");

const r = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
