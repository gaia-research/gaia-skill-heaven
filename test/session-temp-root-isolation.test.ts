import { vi } from "vitest";

const fsPromisesSpy = vi.hoisted(() => ({
  readdirPaths: [] as string[],
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  const readdirSpy = vi.fn(
    async (...args: Parameters<typeof actual.readdir>) => {
      fsPromisesSpy.readdirPaths.push(String(args[0]));
      return actual.readdir(...args);
    },
  );
  return {
    ...actual,
    readdir: readdirSpy,
  };
});

import { spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../packages/skill-summon/src/index.js";
import {
  listSessions,
  openSession,
  reapSessions,
  resolveSession,
  type SummonSession,
} from "../packages/skill-summon/src/summon/session.js";
import {
  createIsolatedTempNamespace,
  disposeIsolatedTempNamespace,
  getActiveWorkerTempNamespace,
  HERMETIC_TEMP_ENV_VARS,
  WORKER_TEMP_NAMESPACE_PREFIX,
} from "./hermetic-session-env.js";

const moduleLoadTmpdir = tmpdir();
const require = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === "win32";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DEAD_FIXTURE_PID = 99_999_999;
const CHILD_TIMEOUT_MS = 18_000;
const KILL_GRACE_MS = 400;
const CLOSE_GRACE_MS = 500;

const sessionsToClose: SummonSession[] = [];
const dirsToRemove: string[] = [];
const closeCallbacks: Array<() => Promise<void>> = [];
const activeChildCleanups = new Set<() => Promise<void>>();

afterEach(async () => {
  await Promise.all(
    closeCallbacks.splice(0).map(async (close) => {
      try {
        await close();
      } catch {
        // Best-effort cleanup for client/server pairs.
      }
    }),
  );
  await Promise.all(sessionsToClose.splice(0).map((s) => s.close()));
  await Promise.all(
    dirsToRemove
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
  await Promise.all(Array.from(activeChildCleanups).map((cleanup) => cleanup()));
  fsPromisesSpy.readdirPaths.length = 0;
});

function canonicalDir(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function makeOfflineDocs(): GaiaRegistryDocuments {
  return {
    generic: {
      generatedAt: "2026-07-16T00:00:00Z",
      skills: [
        {
          id: "testing",
          name: "Testing",
          type: "basic",
          description: "Testing workflows.",
          prerequisites: [],
          derivatives: [],
          evidence: [],
          status: "active",
        },
      ],
    },
    named: {
      generatedAt: "2026-07-16",
      buckets: {
        testing: [
          {
            id: "example/isolation-check",
            name: "Isolation Check",
            contributor: "example",
            genericSkillRef: "testing",
            status: "named",
            description: "Offline isolation fixture skill.",
            catalogRef: "example-isolation-check",
            tags: ["isolation"],
            links: {},
            evidence: [],
          },
        ],
      },
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
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

async function runBoundedVitestChild(
  suites: readonly string[],
  envOverrides: Record<string, string>,
): Promise<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  pipesForcedClosed: boolean;
  stdout: string;
  stderr: string;
}> {
  const vitestCliPath = resolveVitestCliPath();
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides,
    NO_COLOR: "1",
  };
  delete childEnv.FORCE_COLOR;

  const child = spawn(
    process.execPath,
    [vitestCliPath, "run", "--no-file-parallelism", ...suites],
    {
      cwd: repoRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: !IS_WINDOWS,
      windowsHide: true,
    },
  );

  let stdout = "";
  let stderr = "";
  const maxChars = 64 * 1024;
  let timedOut = false;
  let pipesForcedClosed = false;
  let settled = false;
  let closed = false;

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  let closeGraceTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (killTimer) clearTimeout(killTimer);
    if (reapTimer) clearTimeout(reapTimer);
    if (closeGraceTimer) clearTimeout(closeGraceTimer);
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
    }
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(force ? "SIGKILL" : "SIGTERM");
      } catch {
        // ignore
      }
    }
  };

  const cleanup = async () => {
    clearTimers();
    destroyPipes();
    if (typeof child.pid === "number" && child.pid > 0) {
      terminateTree(true);
    }
  };
  activeChildCleanups.add(cleanup);

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    if (stdout.length < maxChars) stdout += chunk.slice(0, maxChars - stdout.length);
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    if (stderr.length < maxChars) stderr += chunk.slice(0, maxChars - stderr.length);
  });

  try {
    return await new Promise((resolve, reject) => {
      const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimers();
        resolve({
          exitCode,
          signal,
          timedOut,
          pipesForcedClosed,
          stdout,
          stderr,
        });
      };

      deadlineTimer = setTimeout(() => {
        if (settled || closed) return;
        timedOut = true;
        terminateTree(false);
        killTimer = setTimeout(() => {
          if (settled || closed) return;
          terminateTree(true);
          reapTimer = setTimeout(() => {
            if (settled || closed) return;
            pipesForcedClosed = true;
            destroyPipes();
            finish(child.exitCode, child.signalCode);
          }, CLOSE_GRACE_MS);
          reapTimer.unref();
        }, KILL_GRACE_MS);
        killTimer.unref();
      }, CHILD_TIMEOUT_MS);
      deadlineTimer.unref();

      child.once("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimers();
        destroyPipes();
        reject(err);
      });
      child.once("exit", (code, signal) => {
        if (settled || closed || timedOut) return;
        closeGraceTimer = setTimeout(() => {
          if (settled || closed) return;
          pipesForcedClosed = true;
          terminateTree(true);
          destroyPipes();
          finish(code, signal);
        }, CLOSE_GRACE_MS);
        closeGraceTimer.unref();
      });
      child.once("close", (code, signal) => {
        closed = true;
        finish(code, signal);
      });
    });
  } finally {
    await cleanup();
    activeChildCleanups.delete(cleanup);
  }
}

describe("vitest worker temp-root namespace isolation", () => {
  it("establishes an isolated worker namespace before module-level tmpdir() snapshots", () => {
    const ns = getActiveWorkerTempNamespace();
    expect(ns).toBeDefined();
    expect(moduleLoadTmpdir).toBe(ns!.root);
    expect(tmpdir()).toBe(ns!.root);
    expect(canonicalDir(ns!.root)).not.toBe(canonicalDir(ns!.callerTmpdir));
    expect(path.basename(ns!.root).startsWith(WORKER_TEMP_NAMESPACE_PREFIX)).toBe(
      true,
    );
    expect(path.basename(ns!.root).startsWith("skill-summon-session-")).toBe(
      false,
    );
    for (const key of HERMETIC_TEMP_ENV_VARS) {
      expect(process.env[key]).toBe(ns!.root);
    }
  });

  it("default openSession() and resolveSession() use the isolated namespace and never readdir the original OS temp directory", async () => {
    const ns = getActiveWorkerTempNamespace()!;
    const callerReal = canonicalDir(ns.callerTmpdir);
    const isolatedReal = canonicalDir(ns.root);

    // 1. Default openSession() with clean env
    fsPromisesSpy.readdirPaths.length = 0;
    const opened = await openSession();
    sessionsToClose.push(opened);
    expect(canonicalDir(path.dirname(opened.root))).toBe(isolatedReal);
    expect(
      fsPromisesSpy.readdirPaths.some((p) => canonicalDir(p) === callerReal),
    ).toBe(false);

    // 2. Default resolveSession() with CLAUDE_CODE_SESSION_ID set (triggers reattach scan)
    process.env.CLAUDE_CODE_SESSION_ID = "iso-resolve-fixed-id";
    fsPromisesSpy.readdirPaths.length = 0;
    const resolved = await resolveSession();
    sessionsToClose.push(resolved.session);
    expect(resolved.created).toBe(true);
    expect(canonicalDir(path.dirname(resolved.session.root))).toBe(isolatedReal);

    const readdirCanonicals = fsPromisesSpy.readdirPaths.map(canonicalDir);
    expect(readdirCanonicals).toContain(isolatedReal);
    expect(readdirCanonicals).not.toContain(callerReal);

    // 3. Dead-PID reattach via default resolveSession() also scans only isolated namespace
    const manifestPath = path.join(resolved.session.root, "session.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.pid = DEAD_FIXTURE_PID;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    fsPromisesSpy.readdirPaths.length = 0;
    const reattached = await resolveSession();
    expect(reattached.created).toBe(false);
    expect(reattached.session.root).toBe(resolved.session.root);

    const reattachReadCanonicals = fsPromisesSpy.readdirPaths.map(canonicalDir);
    expect(reattachReadCanonicals).toContain(isolatedReal);
    expect(reattachReadCanonicals).not.toContain(callerReal);
  });

  it("default MCP server summon path uses the isolated namespace and never readdirs the original OS temp directory", async () => {
    const ns = getActiveWorkerTempNamespace()!;
    const callerReal = canonicalDir(ns.callerTmpdir);
    const isolatedReal = canonicalDir(ns.root);

    for (const harnessId of [undefined, "iso-mcp-fixed-id"] as const) {
      if (harnessId === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = harnessId;
      delete process.env.SKILL_SUMMON_SESSION;

      fsPromisesSpy.readdirPaths.length = 0;
      const service = new GaiaService(
        new InMemoryGaiaRegistrySource(makeOfflineDocs()),
        { now: () => new Date("2026-07-16T12:00:00Z") },
      );
      const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
      const client = new Client({
        name: `iso-mcp-client-${harnessId ?? "unset"}`,
        version: "1.0.0",
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      closeCallbacks.push(
        () => client.close(),
        () => server.close(),
      );

      const res = await client.callTool({
        name: "summon",
        arguments: { query: "isolation check", preview: true, surface: "any" },
      });
      expect(res.isError).toBeFalsy();
      const sessionRoot = (res.structuredContent as { sessionRoot: string })
        .sessionRoot;
      dirsToRemove.push(sessionRoot);

      expect(canonicalDir(path.dirname(sessionRoot))).toBe(isolatedReal);

      const readdirCanonicals = fsPromisesSpy.readdirPaths.map(canonicalDir);
      expect(readdirCanonicals).not.toContain(callerReal);
      if (harnessId !== undefined) {
        expect(readdirCanonicals).toContain(isolatedReal);
      }

      await client.close();
      await server.close();
    }
  });

  it("keeps explicit per-test tempRoot operations scoped to that explicit root", async () => {
    const ns = getActiveWorkerTempNamespace()!;
    const callerReal = canonicalDir(ns.callerTmpdir);
    const explicitRoot = await mkdtemp(path.join(tmpdir(), "explicit-temp-root-"));
    dirsToRemove.push(explicitRoot);
    const explicitReal = canonicalDir(explicitRoot);

    process.env.CLAUDE_CODE_SESSION_ID = "explicit-root-id";
    fsPromisesSpy.readdirPaths.length = 0;

    const first = await resolveSession({ tempRoot: explicitRoot });
    expect(first.created).toBe(true);
    expect(canonicalDir(path.dirname(first.session.root))).toBe(explicitReal);

    const listed = await listSessions({ tempRoot: explicitRoot });
    expect(listed.map((item) => item.root)).toEqual([first.session.root]);

    const manifestPath = path.join(first.session.root, "session.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.pid = DEAD_FIXTURE_PID;
    manifest.createdAt = "2026-04-01T00:00:00.000Z";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const reaped = await reapSessions({
      tempRoot: explicitRoot,
      ttlHours: 1,
      now: new Date("2026-04-01T12:00:00.000Z"),
    });
    expect(reaped.candidates.map((c) => c.root)).toEqual([first.session.root]);
    expect(existsSync(first.session.root)).toBe(false);

    const readdirCanonicals = fsPromisesSpy.readdirPaths.map(canonicalDir);
    expect(readdirCanonicals).toContain(explicitReal);
    expect(readdirCanonicals).not.toContain(callerReal);
  });

  it("saves/restores TMPDIR/TMP/TEMP and deletes only the worker-owned namespace without sweeping caller temp dirs", async () => {
    const callerRoot = await mkdtemp(
      path.join(tmpdir(), "caller-temp-no-sweep-"),
    );
    dirsToRemove.push(callerRoot);

    const unrelatedSession = path.join(
      callerRoot,
      "skill-summon-session-user-owned",
    );
    await mkdir(unrelatedSession, { recursive: true });
    await writeFile(
      path.join(unrelatedSession, "session.json"),
      JSON.stringify({
        id: "user-owned",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_FIXTURE_PID,
        skills: [],
      }),
      "utf8",
    );
    const sentinelFile = path.join(callerRoot, "keep-me.txt");
    await writeFile(sentinelFile, "preserve", "utf8");

    const syntheticEnv: NodeJS.ProcessEnv = {
      TMPDIR: callerRoot,
      TMP: undefined,
      TEMP: callerRoot,
    };

    const isolated = createIsolatedTempNamespace(syntheticEnv);
    expect(canonicalDir(path.dirname(isolated.root))).toBe(
      canonicalDir(callerRoot),
    );
    expect(syntheticEnv.TMPDIR).toBe(isolated.root);
    expect(syntheticEnv.TMP).toBe(isolated.root);
    expect(syntheticEnv.TEMP).toBe(isolated.root);
    expect(existsSync(isolated.root)).toBe(true);

    const insideSession = await openSession({ tempRoot: isolated.root });
    expect(existsSync(insideSession.root)).toBe(true);

    disposeIsolatedTempNamespace(isolated, syntheticEnv);

    expect(syntheticEnv.TMPDIR).toBe(callerRoot);
    expect(syntheticEnv.TMP).toBeUndefined();
    expect(syntheticEnv.TEMP).toBe(callerRoot);
    expect(existsSync(isolated.root)).toBe(false);
    expect(existsSync(callerRoot)).toBe(true);
    expect(existsSync(unrelatedSession)).toBe(true);
    expect(await readFile(sentinelFile, "utf8")).toBe("preserve");
  });

  it("gives nested Vitest runner children their own isolated namespaces without scanning or deleting caller roots", async () => {
    const callerRoot = await mkdtemp(
      path.join(tmpdir(), "nested-vitest-caller-root-"),
    );
    dirsToRemove.push(callerRoot);

    const callerSentinel = path.join(callerRoot, "caller-sentinel.txt");
    await writeFile(callerSentinel, "KEEP_CALLER_FILE", "utf8");

    const callerSession = path.join(
      callerRoot,
      "skill-summon-session-caller-owned",
    );
    await mkdir(callerSession, { recursive: true });
    const callerManifestPath = path.join(callerSession, "session.json");
    const callerManifestBody = JSON.stringify(
      {
        id: "caller-owned",
        harnessSessionId: "nested-child-fixed-id",
        createdAt: "2026-04-01T00:00:00.000Z",
        pid: DEAD_FIXTURE_PID,
        skills: [],
      },
      null,
      2,
    );
    await writeFile(callerManifestPath, callerManifestBody, "utf8");

    const result = await runBoundedVitestChild(
      ["packages/skill-summon/test/mcp-link-enrichment.test.ts"],
      {
        TMPDIR: callerRoot,
        TMP: callerRoot,
        TEMP: callerRoot,
        CLAUDE_CODE_SESSION_ID: "nested-child-fixed-id",
      },
    );

    expect(result.timedOut).toBe(false);
    expect(result.pipesForcedClosed).toBe(false);
    expect(result.signal).toBeNull();
    expect(
      result.exitCode,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);

    // Caller root and its files/sessions were never deleted, adopted, or mutated.
    expect(existsSync(callerRoot)).toBe(true);
    expect(await readFile(callerSentinel, "utf8")).toBe("KEEP_CALLER_FILE");
    expect(await readFile(callerManifestPath, "utf8")).toBe(callerManifestBody);

    // The child's own skill-heaven-vitest-tmp-* namespace was cleaned up on exit.
    expect(readdirSync(callerRoot).sort()).toEqual([
      "caller-sentinel.txt",
      "skill-summon-session-caller-owned",
    ]);
  });
});
