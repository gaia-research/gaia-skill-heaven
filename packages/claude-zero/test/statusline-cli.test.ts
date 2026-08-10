// Integration test for the statusline IO entrypoint: spawns the real bin
// (bin/statusline.mjs → tsx → statusline-cli.ts) with a manifest env + piped
// stdin, exercising the path that runs on every prompt render. Guards the
// "never break the user's prompt" contract: malformed manifest / no env / empty
// stdin must degrade to a clean (often empty) segment, never hang or throw.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "statusline.mjs");
let dir: string;
let manifestPath: string;

function runStatusline(env: NodeJS.ProcessEnv, stdin: string): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, [BIN], { input: stdin, env: { ...process.env, ...env }, encoding: "utf-8", timeout: 20000 });
  return { status: r.status, stdout: r.stdout ?? "" };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ch-slcli-"));
  manifestPath = join(dir, "profile.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ schema: "claude-zero/profile@1", posture: "native", standingTokens: 4802, skillCount: 67, scope: "user+project", launcherLocked: true }),
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("statusline bin (IO path)", () => {
  it("renders standing + live ctx from a manifest and piped JSON", () => {
    const { status, stdout } = runStatusline({ CLAUDE_ZERO_PROFILE: manifestPath }, '{"context_window":{"used_percentage":23}}');
    expect(status).toBe(0);
    expect(stdout).toBe("⚡ native · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("renders standing only when stdin is empty (does not hang)", () => {
    const { status, stdout } = runStatusline({ CLAUDE_ZERO_PROFILE: manifestPath }, "");
    expect(status).toBe(0);
    expect(stdout).toBe("⚡ native · 4.8k standing (excl. bundled/plugin)");
  });

  it("emits nothing when no profile env is set (mis-wired = silent, not noisy)", () => {
    const env = { ...process.env };
    delete env.CLAUDE_ZERO_PROFILE;
    const r = spawnSync(process.execPath, [BIN], { input: "{}", env, encoding: "utf-8", timeout: 20000 });
    expect(r.status).toBe(0);
    expect(r.stdout ?? "").toBe("");
  });

  it("emits nothing for a malformed manifest file (degrades, never throws)", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not valid json");
    const { status, stdout } = runStatusline({ CLAUDE_ZERO_PROFILE: bad }, "{}");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
