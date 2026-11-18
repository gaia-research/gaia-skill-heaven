import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { HERMETIC_SESSION_ENV_VARS } from "../../../test/hermetic-session-env.js";
import {
  HARNESS_SESSION_ID_ENV_VARS,
  openSession,
  readHarnessSessionId,
  resolveSession,
} from "../src/summon/session.js";

const require = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === "win32";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const TARGET_SUITES = [
  "packages/skill-summon/test/mcp-link-enrichment.test.ts",
  "packages/skill-summon/test/summon-session.test.ts",
  "packages/skill-summon/test/campaign-session-reattach.test.ts",
] as const;

const CHILD_TIMEOUT_MS = 18_000;
const KILL_GRACE_MS = 400;
const CLOSE_GRACE_MS = 500;
const MAX_OUTPUT_CHARS = 128 * 1024;

const cleanupRoots: string[] = [];
const activeChildCleanups = new Set<() => Promise<void>>();

afterEach(async () => {
  await Promise.all([
    ...cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
    ...Array.from(activeChildCleanups).map((cleanup) => cleanup()),
  ]);
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-hermetic-test-"));
  cleanupRoots.push(root);
  return root;
}

type BoundedRunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  pipesForcedClosed: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

type BoundedCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  killGraceMs?: number;
  closeGraceMs?: number;
  maxOutputChars?: number;
};

type BoundedOutputBuffer = {
  push: (chunk: string) => void;
  render: () => string;
  readonly truncated: boolean;
};

function createBoundedOutputBuffer(
  maxChars: number = MAX_OUTPUT_CHARS,
): BoundedOutputBuffer {
  const headLimit = Math.floor(maxChars / 2);
  const tailLimit = maxChars - headLimit;
  let head = "";
  let tail = "";
  let totalChars = 0;
  let truncated = false;

  return {
    push(chunk: string): void {
      if (!chunk) return;
      totalChars += chunk.length;
      if (!truncated) {
        if (head.length + chunk.length <= maxChars) {
          head += chunk;
          return;
        }
        truncated = true;
        if (head.length < headLimit) {
          const need = headLimit - head.length;
          head += chunk.slice(0, need);
          const rest = chunk.slice(need);
          tail =
            rest.length > tailLimit ? rest.slice(rest.length - tailLimit) : rest;
        } else {
          const overflowHead = head.slice(headLimit);
          head = head.slice(0, headLimit);
          const tailSource = overflowHead + chunk;
          tail =
            tailSource.length > tailLimit
              ? tailSource.slice(tailSource.length - tailLimit)
              : tailSource;
        }
        return;
      }

      if (chunk.length >= tailLimit) {
        tail = chunk.slice(chunk.length - tailLimit);
      } else {
        const overflow = tail.length + chunk.length - tailLimit;
        tail = (overflow > 0 ? tail.slice(overflow) : tail) + chunk;
      }
    },
    render(): string {
      if (!truncated) return head;
      const omitted = Math.max(0, totalChars - head.length - tail.length);
      return `${head}\n...[output truncated: ${omitted} chars omitted]...\n${tail}`;
    },
    get truncated(): boolean {
      return truncated;
    },
  };
}

function resolveVitestCliPath(): string {
  const vitestPkgJsonPath = require.resolve("vitest/package.json");
  const vitestDir = path.dirname(vitestPkgJsonPath);
  const pkg = JSON.parse(readFileSync(vitestPkgJsonPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const binEntry =
    typeof pkg.bin === "string"
      ? pkg.bin
      : typeof pkg.bin?.vitest === "string"
        ? pkg.bin.vitest
        : "./vitest.mjs";
  const cliPath = path.resolve(vitestDir, binEntry);
  const rel = path.relative(vitestDir, cliPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Resolved vitest CLI path escaped package root: ${cliPath}`);
  }
  return cliPath;
}

function signalPosixGroup(pid: number, signal: NodeJS.Signals): boolean {
  if (IS_WINDOWS || pid <= 0) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      return false;
    }
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

async function runWindowsTaskkill(pid: number, force: boolean): Promise<boolean> {
  if (!IS_WINDOWS || pid <= 0) return false;
  return await new Promise<boolean>((resolve) => {
    const args = ["/PID", String(pid), "/T"];
    if (force) args.push("/F");

    let done = false;
    let killerTimeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (killerTimeout) clearTimeout(killerTimeout);
      resolve(ok);
    };

    let killer: ReturnType<typeof spawn>;
    try {
      killer = spawn("taskkill.exe", args, {
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }

    killerTimeout = setTimeout(() => {
      try {
        killer.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(false);
    }, 2_000);
    killerTimeout.unref();

    killer.once("error", () => finish(false));
    killer.once("close", (code) => finish(code === 0));
  });
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForPidExit(pid: number, maxWaitMs = 500): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (isProcessAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return true;
}

async function runBoundedCommand(
  command: string,
  args: readonly string[],
  options: BoundedCommandOptions,
): Promise<BoundedRunResult> {
  const killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
  const closeGraceMs = options.closeGraceMs ?? CLOSE_GRACE_MS;
  const maxOutputChars = options.maxOutputChars ?? MAX_OUTPUT_CHARS;

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    detached: !IS_WINDOWS,
    windowsHide: true,
  });

  const stdoutBuf = createBoundedOutputBuffer(maxOutputChars);
  const stderrBuf = createBoundedOutputBuffer(maxOutputChars);
  let settled = false;
  let exited = false;
  let closed = false;
  let timedOut = false;
  let escalated = false;
  let pipesForcedClosed = false;

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  let closeGraceTimer: ReturnType<typeof setTimeout> | undefined;

  const clearAllTimers = () => {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
    }
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
    if (reapTimer) {
      clearTimeout(reapTimer);
      reapTimer = undefined;
    }
    if (closeGraceTimer) {
      clearTimeout(closeGraceTimer);
      closeGraceTimer = undefined;
    }
  };

  const destroyPipes = () => {
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    if (child.stdout && !child.stdout.destroyed) child.stdout.destroy();
    if (child.stderr && !child.stderr.destroyed) child.stderr.destroy();
  };

  const terminateTree = (force: boolean) => {
    const pid = child.pid;
    if (typeof pid !== "number" || pid <= 0) return;

    if (!IS_WINDOWS) {
      signalPosixGroup(pid, force ? "SIGKILL" : "SIGTERM");
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill(force ? "SIGKILL" : "SIGTERM");
        } catch {
          // ignore if already gone
        }
      }
      return;
    }

    void runWindowsTaskkill(pid, force).then((ok) => {
      if (force && !ok && child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore if already gone
        }
      }
    });
  };

  const cleanup = async () => {
    clearAllTimers();
    destroyPipes();
    const pid = child.pid;
    if (typeof pid === "number" && pid > 0) {
      if (!IS_WINDOWS) {
        signalPosixGroup(pid, "SIGKILL");
      } else if (!exited || !closed) {
        await runWindowsTaskkill(pid, true);
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }
    }
  };
  activeChildCleanups.add(cleanup);

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuf.push(chunk);
  });
  child.stdout?.on("error", () => {});

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrBuf.push(chunk);
  });
  child.stderr?.on("error", () => {});

  try {
    return await new Promise<BoundedRunResult>((resolve, reject) => {
      const settleResolve = (
        exitCode: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        if (settled) return;
        settled = true;
        clearAllTimers();
        resolve({
          exitCode,
          signal,
          timedOut,
          pipesForcedClosed,
          stdout: stdoutBuf.render(),
          stderr: stderrBuf.render(),
          stdoutTruncated: stdoutBuf.truncated,
          stderrTruncated: stderrBuf.truncated,
        });
      };

      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        clearAllTimers();
        destroyPipes();
        reject(err);
      };

      deadlineTimer = setTimeout(() => {
        if (settled || closed) return;
        timedOut = true;
        terminateTree(false);

        killTimer = setTimeout(() => {
          if (settled || closed) return;
          escalated = true;
          terminateTree(true);

          reapTimer = setTimeout(() => {
            if (settled || closed) return;
            pipesForcedClosed = true;
            destroyPipes();
            settleResolve(child.exitCode, child.signalCode);
          }, closeGraceMs);
          reapTimer.unref();
        }, killGraceMs);
        killTimer.unref();
      }, options.timeoutMs);
      deadlineTimer.unref();

      child.once("error", (err) => {
        terminateTree(true);
        settleReject(err);
      });

      child.once("exit", (exitCode, signal) => {
        exited = true;
        if (settled || closed || timedOut || escalated) return;
        closeGraceTimer = setTimeout(() => {
          if (settled || closed) return;
          pipesForcedClosed = true;
          terminateTree(true);
          destroyPipes();
          settleResolve(exitCode, signal);
        }, closeGraceMs);
        closeGraceTimer.unref();
      });

      child.once("close", (exitCode, signal) => {
        closed = true;
        settleResolve(exitCode, signal);
      });
    });
  } finally {
    await cleanup();
    activeChildCleanups.delete(cleanup);
  }
}

async function runBoundedVitest(
  suites: readonly string[],
  envOverrides: Record<string, string>,
  timeoutMs: number,
): Promise<BoundedRunResult> {
  const vitestCliPath = resolveVitestCliPath();
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides,
    NO_COLOR: "1",
  };
  delete childEnv.FORCE_COLOR;

  return await runBoundedCommand(
    process.execPath,
    [vitestCliPath, "run", "--no-file-parallelism", ...suites],
    {
      cwd: repoRoot,
      env: childEnv,
      timeoutMs,
    },
  );
}

describe("hermetic session environment setup", () => {
  it("scrubs inherited harness-id and session-root env vars at test entry", () => {
    expect(HERMETIC_SESSION_ENV_VARS).toContain("SKILL_SUMMON_SESSION");
    for (const key of HARNESS_SESSION_ID_ENV_VARS) {
      expect(HERMETIC_SESSION_ENV_VARS).toContain(key);
      expect(process.env[key]).toBeUndefined();
    }
    expect(process.env.SKILL_SUMMON_SESSION).toBeUndefined();
    expect(readHarnessSessionId()).toBeUndefined();
  });

  it("still exercises real inherited-env reattachment and SKILL_SUMMON_SESSION reuse when explicitly set", async () => {
    const tempRoot = await makeTempRoot();

    // 1. Live SKILL_SUMMON_SESSION reuse with clean harness ID (the fixture pattern)
    const active = await openSession({ tempRoot });
    expect(active.harnessSessionId).toBeUndefined();
    process.env.SKILL_SUMMON_SESSION = active.root;
    const reused = await resolveSession({ tempRoot });
    expect(reused.created).toBe(false);
    expect(reused.session.root).toBe(active.root);
    delete process.env.SKILL_SUMMON_SESSION;

    // 2. Real inherited CLAUDE_CODE_SESSION_ID reattachment after deliberate env setup
    process.env.CLAUDE_CODE_SESSION_ID = "explicit-hermetic-id";
    expect(readHarnessSessionId()).toBe("explicit-hermetic-id");
    const seeded = await resolveSession({ tempRoot });
    expect(seeded.created).toBe(true);
    expect(seeded.session.harnessSessionId).toBe("explicit-hermetic-id");

    const manifestPath = path.join(seeded.session.root, "session.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.pid = 99_999_999;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const reattached = await resolveSession({ tempRoot });
    expect(reattached.created).toBe(false);
    expect(reattached.session.root).toBe(seeded.session.root);
    expect(reattached.session.pid).toBe(process.pid);
  });

  it("runs enrichment and session suites hermetically when CLAUDE_CODE_SESSION_ID=test-fixed is set at child startup", async () => {
    for (const suite of TARGET_SUITES) {
      expect(suite).not.toContain("hermetic-session-env.test.ts");
    }

    const result = await runBoundedVitest(
      TARGET_SUITES,
      {
        CLAUDE_CODE_SESSION_ID: "test-fixed",
        SKILL_SUMMON_SESSION: path.join(repoRoot, "nonexistent-inherited-host-root"),
      },
      CHILD_TIMEOUT_MS,
    );

    expect(result.timedOut).toBe(false);
    expect(result.pipesForcedClosed).toBe(false);
    expect(result.signal).toBeNull();
    expect(
      result.exitCode,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout).toMatch(/Test Files\s+3 passed \(3\)/u);
    expect(result.stdout).not.toMatch(/\bskipped\b/u);
    expect(process.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(process.env.SKILL_SUMMON_SESSION).toBeUndefined();
  });

  it("kills and reaps a timed-out child and pipe-holding descendant within bounded time", async () => {
    const parentScript = [
      'const { spawn } = require("node:child_process");',
      'process.on("SIGTERM", () => {});',
      "const gc = spawn(process.execPath, [",
      '  "-e",',
      '  "process.on(\\"SIGTERM\\", () => {}); process.stdout.write(\\"GC_READY:\\" + process.pid + \\"\\\\n\\"); setTimeout(() => {}, 5000);"',
      '], { stdio: "inherit" });',
      'process.stdout.write("PARENT_PID:" + process.pid + "\\n");',
      "setTimeout(() => {}, 5000);",
    ].join(" ");

    const startedAt = Date.now();
    const result = await runBoundedCommand(
      process.execPath,
      ["-e", parentScript],
      {
        cwd: repoRoot,
        timeoutMs: 500,
        killGraceMs: 150,
        closeGraceMs: 250,
      },
    );
    const elapsedMs = Date.now() - startedAt;

    expect(result.timedOut).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);

    const parentMatch = result.stdout.match(/PARENT_PID:(\d+)/u);
    const gcMatch = result.stdout.match(/GC_READY:(\d+)/u);
    expect(parentMatch, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).not.toBeNull();
    expect(gcMatch, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).not.toBeNull();

    const parentPid = Number(parentMatch![1]);
    const gcPid = Number(gcMatch![1]);
    expect(await waitForPidExit(parentPid)).toBe(true);
    expect(await waitForPidExit(gcPid)).toBe(true);
  });

  it("reaps pipe-holding descendants and bounds close when a wrapper exits early", async () => {
    const wrapperScript = [
      'const { spawn } = require("node:child_process");',
      "spawn(process.execPath, [",
      '  "-e",',
      '  "process.stdout.write(\\"ORPHAN_GC:\\" + process.pid + \\"\\\\n\\"); setTimeout(() => {}, 3000);"',
      '], { stdio: "inherit" });',
      "setTimeout(() => process.exit(0), 60);",
    ].join(" ");

    const startedAt = Date.now();
    const result = await runBoundedCommand(
      process.execPath,
      ["-e", wrapperScript],
      {
        cwd: repoRoot,
        timeoutMs: 5_000,
        killGraceMs: 150,
        closeGraceMs: 200,
      },
    );
    const elapsedMs = Date.now() - startedAt;

    expect(result.timedOut).toBe(false);
    expect(result.pipesForcedClosed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(elapsedMs).toBeLessThan(2_500);

    const gcMatch = result.stdout.match(/ORPHAN_GC:(\d+)/u);
    expect(gcMatch, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).not.toBeNull();
    if (!IS_WINDOWS) {
      expect(await waitForPidExit(Number(gcMatch![1]))).toBe(true);
    }
  });

  it("bounds captured stdout/stderr without losing head/tail markers", async () => {
    const noisyScript = [
      'process.stdout.write("HEAD_MARKER\\n");',
      'const chunk = "x".repeat(4096) + "\\n";',
      "for (let i = 0; i < 40; i += 1) process.stdout.write(chunk);",
      'process.stdout.write("TAIL_MARKER\\n");',
    ].join(" ");

    const result = await runBoundedCommand(
      process.execPath,
      ["-e", noisyScript],
      {
        cwd: repoRoot,
        timeoutMs: 5_000,
        maxOutputChars: 8_192,
      },
    );

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(8_192 + 128);
    expect(result.stdout).toContain("HEAD_MARKER");
    expect(result.stdout).toContain("TAIL_MARKER");
    expect(result.stdout).not.toMatch(/\bskipped\b/u);
  });
});
