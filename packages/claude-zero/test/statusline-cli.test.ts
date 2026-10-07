// Integration test for the statusline IO entrypoint: spawns the real bin
// (bin/statusline.mjs → tsx → statusline-cli.ts) with a manifest env + piped
// stdin, exercising the path that runs on every prompt render. Guards the
// "never break the user's prompt" contract: malformed manifest / no env / empty
// stdin must degrade to a clean (often empty) segment, never hang or throw.
// Every child env is pinned explicitly (NO_COLOR, COLUMNS, TERM, the summon
// root) so the runner's own environment cannot change what is asserted.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "statusline.mjs");
const PINNED = ["NO_COLOR", "FORCE_COLOR", "COLUMNS", "SKILL_HEAVEN_STATUS", "SKILL_SUMMON_SESSION", "CLAUDE_ZERO_PROFILE", "TERM", "COLORTERM"];
const CTX_STDIN = '{"context_window":{"used_percentage":23}}';
const ANSI = /\u001b\[[0-9;]*m/g;

let dir: string;
let manifestPath: string;
let counter = 0;

/** Runs the bin. Defaults are plain text (NO_COLOR=1) with the native manifest
 * and the ctx stdin; a value of `null` removes that variable from the child. */
function run(env: Record<string, string | null> = {}, stdin = CTX_STDIN): { status: number | null; stdout: string } {
  const child: NodeJS.ProcessEnv = { ...process.env };
  for (const key of PINNED) delete child[key];
  child.NO_COLOR = "1";
  child.CLAUDE_ZERO_PROFILE = manifestPath;
  for (const [key, value] of Object.entries(env)) {
    if (value === null) delete child[key];
    else child[key] = value;
  }
  const r = spawnSync(process.execPath, [BIN], { input: stdin, env: child, encoding: "utf-8", timeout: 20000 });
  return { status: r.status, stdout: r.stdout ?? "" };
}

/** A fresh summon root, optionally seeded with session.json / summon-log.jsonl. */
function summonRoot(files: { session?: unknown | string; log?: string } = {}): string {
  const root = join(dir, `root-${counter++}`);
  mkdirSync(root, { recursive: true });
  if (files.session !== undefined) {
    writeFileSync(join(root, "session.json"), typeof files.session === "string" ? files.session : JSON.stringify(files.session));
  }
  if (files.log !== undefined) writeFileSync(join(root, "summon-log.jsonl"), files.log);
  return root;
}

const TWO_SKILLS = {
  skills: [
    { id: "mattpocock/grill-me", name: "grill-me" },
    { id: "acme/x-ray", name: "x-ray" },
  ],
};
const TWO_SUMMONS = '{"query":"a"}\n{"query":"b"}\n';

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
  it("renders the canonical compact line with '? skills' when no summon session is set", () => {
    const { status, stdout } = run({ SKILL_SUMMON_SESSION: null });
    expect(status).toBe(0);
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · ? skills · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("renders standing only when stdin is empty (does not hang)", () => {
    const { status, stdout } = run({ SKILL_SUMMON_SESSION: null }, "");
    expect(status).toBe(0);
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · ? skills · 4.8k standing (excl. bundled/plugin)");
  });

  it("reads 0 skills when the summon root is set but no session exists yet", () => {
    const { stdout } = run({ SKILL_SUMMON_SESSION: summonRoot() });
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("reads '? skills' for an unreadable session.json rather than 0", () => {
    const { stdout } = run({ SKILL_SUMMON_SESSION: summonRoot({ session: "{ not json" }) });
    expect(stdout).toContain("· ? skills ·");
  });

  it("reads '? skills' for a session.json of the wrong shape", () => {
    const { stdout } = run({ SKILL_SUMMON_SESSION: summonRoot({ session: { skills: [{ id: 7 }] } }) });
    expect(stdout).toContain("· ? skills ·");
  });

  it("full mode shows skills, summons from the log, and the last arrival", () => {
    const root = summonRoot({ session: TWO_SKILLS, log: TWO_SUMMONS });
    const { stdout } = run({ SKILL_SUMMON_SESSION: root, SKILL_HEAVEN_STATUS: "full" });
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 2 skills / 2 summons · +x-ray · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("full mode omits the summons count when the log is absent but skills exist (unknown, not 0)", () => {
    const root = summonRoot({ session: TWO_SKILLS });
    const { stdout } = run({ SKILL_SUMMON_SESSION: root, SKILL_HEAVEN_STATUS: "full" });
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 2 skills · +x-ray · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("full mode omits the summons count when the summon log is over the size cap", () => {
    const root = summonRoot({ session: TWO_SKILLS, log: TWO_SUMMONS + '{"pad":"'.concat("x".repeat(1024 * 1024), '"}\n') });
    const { stdout } = run({ SKILL_SUMMON_SESSION: root, SKILL_HEAVEN_STATUS: "full" });
    expect(stdout).not.toMatch(/summon/);
    expect(stdout).toContain("· 2 skills · +x-ray ·");
  });

  it("compact mode does not show summons or the arrival", () => {
    const root = summonRoot({ session: TWO_SKILLS, log: TWO_SUMMONS });
    const { stdout } = run({ SKILL_SUMMON_SESSION: root });
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 2 skills · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("SKILL_HEAVEN_STATUS=off prints nothing at all", () => {
    const { status, stdout } = run({ SKILL_HEAVEN_STATUS: "off" });
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("an unrecognized SKILL_HEAVEN_STATUS falls back to compact", () => {
    const { stdout } = run({ SKILL_SUMMON_SESSION: null, SKILL_HEAVEN_STATUS: "loud" });
    expect(stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · ? skills · 4.8k standing (excl. bundled/plugin) · 23% ctx");
  });

  it("NO_COLOR gives plain text with every word and glyph present", () => {
    const { stdout } = run({ NO_COLOR: "1", SKILL_SUMMON_SESSION: null });
    expect(stdout).not.toMatch(/\u001b/);
    for (const word of ["◇", "entropy", "‹‹", "[NATIVE]", "››", "? skills", "standing", "ctx"]) expect(stdout).toContain(word);
  });

  it("paints ANSI by default (Claude Code pipes stdout yet renders colour), and stripping it gives the plain line", () => {
    const painted = run({ NO_COLOR: null, TERM: "xterm-256color", SKILL_SUMMON_SESSION: null });
    const plain = run({ SKILL_SUMMON_SESSION: null });
    expect(painted.stdout).toMatch(/\u001b\[38;5;/);
    expect(painted.stdout.replace(ANSI, "")).toBe(plain.stdout);
  });

  it("a non-numeric COLUMNS is no budget: the full line is kept", () => {
    const { stdout } = run({ COLUMNS: "wide", SKILL_SUMMON_SESSION: null });
    expect(stdout).toContain("23% ctx");
  });

  it("a narrow COLUMNS drops ctx, then standing, before the instrument degrades", () => {
    // Native compact, 0 skills: richest 35 cells; standing tier 39; ctx tier 10.
    const root = summonRoot({ session: { skills: [] } });
    const wide = run({ COLUMNS: "90", SKILL_SUMMON_SESSION: root });
    const noCtx = run({ COLUMNS: "80", SKILL_SUMMON_SESSION: root });
    const noStanding = run({ COLUMNS: "60", SKILL_SUMMON_SESSION: root });
    const tiny = run({ COLUMNS: "12", SKILL_SUMMON_SESSION: root });
    expect(wide.stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills · 4.8k standing (excl. bundled/plugin) · 23% ctx");
    expect(noCtx.stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills · 4.8k standing (excl. bundled/plugin)");
    expect(noStanding.stdout).toBe("◇ entropy ‹‹ [NATIVE] ›› · 0 skills");
    // 12 cells is below every instrument level that carries a count: the reading alone remains.
    expect(tiny.stdout).toBe("[NATIVE]");
  });

  it("a hostile skill name cannot inject an escape, a second line or a fake ultra glyph", () => {
    const root = summonRoot({
      session: { skills: [{ id: "evil/skill", name: "\u001b[31m\n◆ [ULTRA APPROVED]" }] },
      log: TWO_SUMMONS,
    });
    const { status, stdout } = run({ SKILL_SUMMON_SESSION: root, SKILL_HEAVEN_STATUS: "full" });
    expect(status).toBe(0);
    expect(stdout).not.toMatch(/\u001b/);
    expect(stdout).not.toMatch(/[\r\n]/);
    expect(stdout).not.toContain("◆");
    expect(stdout).toContain("[NATIVE]");
    expect(stdout).not.toContain("[ULTRA]");
  });

  it("emits nothing when no profile env is set (mis-wired = silent, not noisy)", () => {
    const { status, stdout } = run({ CLAUDE_ZERO_PROFILE: null }, "{}");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("emits nothing for a malformed manifest file (degrades, never throws)", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not valid json");
    const { status, stdout } = run({ CLAUDE_ZERO_PROFILE: bad }, "{}");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
