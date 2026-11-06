#!/usr/bin/env node
// Credential-free harness compatibility checks (#35).
//
//   node scripts/compat-check.mjs <pi|codex> [--pin <version>]
//
// Runs against whatever `pi` / `codex` is on PATH. Every line it prints is tagged with
// the evidence level it actually reaches:
//
//   [structural] reads the installed harness binary (version / --help / a local
//                protocol call) and compares it with what the door composes.
//                No model call, no credentials.
//   [dry-run]    runs the door's `--print` (composes a plan; never execs the harness,
//                so it does NOT vary with the installed harness version).
//
// There is deliberately no [session] level here: CI has no harness credentials, and a
// session cell must never be faked. See docs/COMPAT-MATRIX.md.
//
// Harness invocations use a throwaway HOME / config dir; nothing of the caller's is read.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [, , harness, ...rest] = process.argv;
const pinAt = rest.indexOf("--pin");
const pin = pinAt >= 0 ? rest[pinAt + 1] : undefined;

if (!["pi", "codex"].includes(harness ?? "")) {
  console.error("usage: compat-check.mjs <pi|codex> [--pin <version>]");
  process.exit(2);
}

const sandbox = mkdtempSync(join(tmpdir(), "compat-check-"));
const env = { ...process.env, HOME: sandbox, USERPROFILE: sandbox, CODEX_HOME: join(sandbox, "codex"), PI_CODING_AGENT_DIR: join(sandbox, "pi") };
mkdirSync(env.CODEX_HOME, { recursive: true });
mkdirSync(env.PI_CODING_AGENT_DIR, { recursive: true });
let failed = 0;
const report = (level, name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${level}] ${name}${detail ? ` -- ${detail}` : ""}`);
};

// 1. installed version (and equality with the pin, when pinned)
const ver = spawnSync(harness, ["--version"], { env, encoding: "utf8" });
const installed = /\d+\.\d+\.\d+(?:[-.\w]*)?/.exec(`${ver.stdout}${ver.stderr}`)?.[0];
report("structural", `${harness} --version`, ver.status === 0 && !!installed, (ver.stdout || ver.stderr).trim());
if (pin) report("structural", `installed version equals pin ${pin}`, installed === pin, `installed ${installed}`);

// 2. the door composes (dry run; does not touch the harness)
const door = join(REPO, "packages", `${harness}-zero`, "bin", `${harness}-zero.mjs`);
const printed = spawnSync(process.execPath, [door, "--print"], { env, encoding: "utf8", cwd: REPO });
let plan;
try {
  plan = JSON.parse(printed.stdout);
} catch {
  /* reported below */
}
report("dry-run", `${harness}-zero --print exits 0 and prints a plan`, printed.status === 0 && plan?.command === harness);

// 3. every long flag the door puts on the harness argv is known to that harness's --help
const flags = (plan?.argv ?? []).filter((a) => /^--[a-z][\w-]*$/.test(a));
if (flags.length) {
  const help = spawnSync(harness, ["--help"], { env, encoding: "utf8" });
  const text = `${help.stdout}${help.stderr}`;
  const missing = flags.filter((f) => !text.includes(f));
  report(
    "structural",
    `door argv flags are present in \`${harness} --help\``,
    help.status === 0 && missing.length === 0,
    `${flags.length} flag(s) checked${missing.length ? `; missing ${missing.join(", ")}` : ""}`,
  );
}

// 4. codex: the door's dynamic discovery speaks codex's app-server protocol (local stdio,
//    no model call, no auth). This is the one cell where a codex release can break the door.
if (harness === "codex") {
  const req = [
    { method: "initialize", id: 1, params: { clientInfo: { name: "codex-zero", version: "0.0.0" }, capabilities: { experimentalApi: true } } },
    { method: "initialized" },
    { method: "skills/list", id: 2, params: { cwds: [sandbox], forceReload: true } },
  ]
    .map((m) => JSON.stringify(m))
    .join("\n");
  const r = spawnSync("sh", ["-c", "{ cat; sleep 4; } | codex app-server --stdio"], { env, input: `${req}\n`, encoding: "utf8", timeout: 60_000 });
  const rows = String(r.stdout ?? "")
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return {};
      }
    });
  const skills = rows.find((x) => x.id === 2)?.result?.data?.flatMap((e) => e.skills ?? []);
  report("structural", "codex app-server skills/list returns skill data (door discovery protocol)", Array.isArray(skills), Array.isArray(skills) ? `${skills.length} skill(s) in a fresh CODEX_HOME` : "no id:2 result");
}

rmSync(sandbox, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
