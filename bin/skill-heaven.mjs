#!/usr/bin/env node
// Thin bin shim: runs src/cli.ts through the locally installed tsx.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r = spawnSync(
  process.execPath,
  [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "src/cli.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
