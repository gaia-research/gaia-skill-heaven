import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
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
  stdout: string;
  stderr: string;
};

async function runBoundedVitest(
  suites: readonly string[],
  envOverrides: Record<string, string>,
  timeoutMs: number,
): Promise<BoundedRunResult> {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    npxCommand,
    ["--no-install", "vitest", "run", "--no-file-parallelism", ...suites],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  try {
    const exit = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 1_500);
        killTimer.unref();
      }, timeoutMs);
      timer.unref();

      child.once("error", reject);
      child.once("close", (exitCode, signal) => {
        resolve({ exitCode, signal });
      });
    });

    return {
      exitCode: exit.exitCode,
      signal: exit.signal,
      timedOut,
      stdout,
      stderr,
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
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
});
