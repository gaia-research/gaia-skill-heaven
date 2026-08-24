// exec() semantics (M2 plan §4): materialize the fsPlan inside a disposable
// mkdtemp dir, substitute "$SESSION", spawn (interactive → inherited stdio;
// headless → capture stdout), delete the temp dir unless --keep-temp.
// Crash-safe by construction (AT-H2): the only writes are inside the tmp dir.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CompileResult, FsOp } from "./compile.js";
import { provisionHarness, type HarnessBundlePin } from "./provision.js";

export interface ProvisionEvidence {
  pinnedVersion: string;
  reportedVersion: string;
  entry: string;
  bundleContentSha256: string;
  entryContentSha256: string;
}

export interface ExecResult {
  status: number;
  stdout: string | null; // null in interactive mode (inherited stdio)
  wallClockMs: number;
  sessionDir: string;
  keptTemp: boolean;
  provision?: ProvisionEvidence;
}

const subst = (p: string, session: string) =>
  p.replaceAll("$SESSION", session).replaceAll("$HOME", homedir());

export function materialize(fsPlan: FsOp[], session: string): void {
  for (const op of fsPlan) {
    if (op.kind === "write") {
      const path = subst(op.path, session);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, op.contents);
    } else if (op.kind === "copyDir") {
      cpSync(subst(op.from, session), subst(op.to, session), { recursive: true });
    } else {
      const from = subst(op.from, session);
      if (existsSync(from)) {
        const to = subst(op.to, session);
        mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to);
      }
    }
  }
}

export function exec(
  compiled: CompileResult,
  opts: { keepTemp?: boolean; harnessBundle?: HarnessBundlePin } = {},
): ExecResult {
  if (compiled.execSupport !== "exec") {
    throw new Error(
      `${compiled.command}: compiled as a recipe (cells not verified for live exec) — use --print`,
    );
  }
  const session = mkdtempSync(join(tmpdir(), "hh-heaven-"));
  try {
    materialize(compiled.fsPlan, session);
    const argv = compiled.argv.map((a) => subst(a, session));
    const env = { ...process.env };
    for (const [k, v] of Object.entries(compiled.env)) env[k] = subst(v, session);

    let command = compiled.command;
    let provision: ProvisionEvidence | undefined;
    if (opts.harnessBundle) {
      const copied = provisionHarness(opts.harnessBundle, session);
      command = copied.command;
      const reportedVersion = harnessVersion(command);
      if (reportedVersion !== opts.harnessBundle.pinnedVersion) {
        throw new Error(
          `harness version mismatch: pinned ${JSON.stringify(opts.harnessBundle.pinnedVersion)}, ` +
            `reported ${JSON.stringify(reportedVersion)}`,
        );
      }
      provision = { ...copied, pinnedVersion: opts.harnessBundle.pinnedVersion, reportedVersion };
    }

    const headless = compiled.argv.includes("-p");
    const t0 = Date.now();
    const res = spawnSync(command, argv, {
      env,
      stdio: headless ? ["ignore", "pipe", "inherit"] : "inherit",
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const wallClockMs = Date.now() - t0;
    if (res.error) throw res.error;
    return {
      status: res.status ?? 1,
      stdout: headless ? (res.stdout as string) : null,
      wallClockMs,
      sessionDir: session,
      keptTemp: !!opts.keepTemp,
      ...(provision ? { provision } : {}),
    };
  } finally {
    if (!opts.keepTemp) rmSync(session, { recursive: true, force: true });
  }
}

export function harnessVersion(command: string): string {
  const res = spawnSync(command, ["--version"], { encoding: "utf-8" });
  return (res.stdout || res.stderr || "unknown").trim().split("\n")[0];
}
