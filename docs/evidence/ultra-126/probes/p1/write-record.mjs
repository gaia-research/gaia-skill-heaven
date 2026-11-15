#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const logPath = process.env.P1_LOG;
if (!logPath) {
  process.stderr.write("P1_LOG environment variable is required\n");
  process.exit(1);
}

const outPath = `${logPath}.cmd.json`;
mkdirSync(dirname(outPath), { recursive: true });

const record = {
  ts: new Date().toISOString(),
  argv: process.argv.slice(2),
  pid: process.pid,
};

writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
process.stdout.write(`P1_PREEXEC_STDOUT ${record.ts} ${record.argv.join(" ")}\n`);
