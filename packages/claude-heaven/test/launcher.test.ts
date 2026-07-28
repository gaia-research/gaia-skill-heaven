import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLevelAllowed, planNativeLaunch } from "../src/launcher.js";

let sessionDir: string;
let home: string;

beforeAll(() => {
  sessionDir = mkdtempSync(join(tmpdir(), "ch-launch-"));
  home = mkdtempSync(join(tmpdir(), "ch-home-")); // no ~/.claude/skills → standing 0
});
afterAll(() => {
  rmSync(sessionDir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("assertLevelAllowed (P2)", () => {
  it("hard-errors on the Hell lane (med…max)", () => {
    for (const lvl of ["med", "high", "xhigh", "max"]) {
      expect(() => assertLevelAllowed(lvl)).toThrow(/gated \(P2\)/);
    }
  });
  it("allows heaven-lane aliases and no level", () => {
    expect(() => assertLevelAllowed("off")).not.toThrow();
    expect(() => assertLevelAllowed("low")).not.toThrow();
    expect(() => assertLevelAllowed(undefined)).not.toThrow();
  });
});

describe("planNativeLaunch", () => {
  const plan = () => planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/statusline.mjs" });

  it("is native posture, launcher-locked, with a census-derived standing dose", () => {
    const p = plan();
    expect(p.posture).toBe("native");
    expect(p.manifest.posture).toBe("native");
    expect(p.manifest.launcherLocked).toBe(true);
    expect(p.manifest.schema).toBe("claude-heaven/profile@1");
    expect(typeof p.manifest.standingTokens).toBe("number");
  });

  it("injects NO eviction/suppression flags — native is claude untouched (P1)", () => {
    const p = plan();
    const argvStr = p.argv.join(" ");
    expect(argvStr).not.toMatch(/--setting-sources/);
    expect(argvStr).not.toMatch(/--plugin-dir/);
    expect(argvStr).not.toMatch(/--disable-slash-commands/);
    expect(argvStr).not.toMatch(/--strict-mcp-config/);
    expect(p.env).not.toHaveProperty("CLAUDE_CODE_DISABLE_BUNDLED_SKILLS");
  });

  it("wires ONLY the statusline via a session --settings file", () => {
    const p = plan();
    expect(p.argv).toEqual(["--settings", join(sessionDir, "settings.json")]);
    expect(p.settings).toEqual({ statusLine: { type: "command", command: "/abs/statusline.mjs" } });
    expect(p.env.CLAUDE_HEAVEN_PROFILE).toBe(join(sessionDir, "profile.json"));
  });

  it("passes through extra claude args after our flags", () => {
    const p = planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/s.mjs", claudeArgs: ["-p", "hi"] });
    expect(p.argv).toEqual(["--settings", join(sessionDir, "settings.json"), "-p", "hi"]);
  });
});
