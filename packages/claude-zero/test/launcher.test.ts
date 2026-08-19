import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materialize, resolveSkill } from "skill-zero";
import { assertLevelAllowed, CURATED_DOOR_ABSENCE_NOTE, planLaunch, planNativeLaunch } from "../src/launcher.js";

/** A real skill dir with real bytes — core's own compile fixture. */
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "impeccable-skill",
);

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

describe("assertLevelAllowed", () => {
  it("allows every boot-dial rung", () => {
    for (const level of ["off", "low", "med", "native"]) {
      expect(() => assertLevelAllowed(level)).not.toThrow();
    }
    expect(() => assertLevelAllowed(undefined)).not.toThrow();
  });

  // N13: nothing on the line refuses. `ultra` is the crown rung, and the upper
  // band as a whole is armed LIVE — a different dial from the launcher's boot
  // posture. So this guard is a REDIRECT, and it must not read as a gate.
  it("redirects every summon-line rung to the command that arms it, never as a gate", () => {
    for (const [level, arm] of [
      ["high", "/skill-hell high"],
      ["xhigh", "/skill-hell xhigh"],
      ["max", "/skill-hell max"],
      ["ultra", "/skill-ultra"],
    ] as const) {
      let message = "";
      try {
        assertLevelAllowed(level);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, `${level} produced no redirect`).toContain("not a boot posture");
      expect(message).toContain(arm);
      expect(message).not.toMatch(/UNRATIFIED|P2|gated|locked/i);
    }
  });
});

describe("planNativeLaunch", () => {
  const plan = () => planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/statusline.mjs" });

  it("is native posture, launcher-locked, with a census-derived standing dose", () => {
    const p = plan();
    expect(p.posture).toBe("native");
    expect(p.manifest.posture).toBe("native");
    expect(p.manifest.launcherLocked).toBe(true);
    expect(p.manifest.schema).toBe("claude-zero/profile@1");
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
    expect(p.env.CLAUDE_ZERO_PROFILE).toBe(join(sessionDir, "profile.json"));
  });

  it("passes through extra claude args after our flags", () => {
    const p = planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/s.mjs", claudeArgs: ["-p", "hi"] });
    expect(p.argv).toEqual(["--settings", join(sessionDir, "settings.json"), "-p", "hi"]);
  });

  it("plans no filesystem work at all — native evicts nothing, so it summons nothing", () => {
    expect(plan().fsPlan).toEqual([]);
  });
});

describe("planLaunch(curated) — the door calling core's compiler", () => {
  const plan = (opts: Record<string, unknown> = {}) =>
    planLaunch({
      posture: "curated",
      skillPaths: [FIXTURE],
      sessionDir,
      statuslineBin: "/abs/statusline.mjs",
      ...opts,
    });

  it("carries core's KC4 clean-room route verbatim — the door composes nothing of its own", () => {
    // If this list ever needs editing here, the change belongs in packages/core.
    // The door's ONLY additions are the session --settings file (statusline) and
    // the $SESSION substitution.
    //
    // KC4 (2026-07-30): --setting-sources is an ALLOWLIST. core moved off T9's
    // `--setting-sources project` (which kept project-scope skills live — the
    // measured residual) to an EMPTY value, which is structurally "no ambient
    // sources" rather than the flag being omitted (which would restore the
    // full bundled listing). See packages/core/src/compile.ts and README.md.
    const p = plan();
    expect(p.command).toBe("claude");
    expect(p.argv.slice(0, 6)).toEqual([
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--plugin-dir",
    ]);
    expect(p.argv[6]?.replace(/\\/g, "/")).toBe(join(sessionDir, "heaven-set").replace(/\\/g, "/"));
    expect(p.argv.slice(7)).toEqual(["--settings", join(sessionDir, "settings.json")]);
    // The undocumented, string-probed, version-pinned knob. Do not "clean up".
    expect(p.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
    expect(p.env.CLAUDE_ZERO_PROFILE).toBe(join(sessionDir, "profile.json"));
    // T6 was NEGATIVE: this flag eats plugin-provided skills, so curated must
    // never carry it.
    expect(p.argv).not.toContain("--disable-slash-commands");
    // No "$SESSION" placeholder may survive into a spawn.
    expect(JSON.stringify([p.argv, p.env, p.fsPlan])).not.toContain("$SESSION");
  });

  it("writes a manifest describing what was LAUNCHED, not what native would have been", () => {
    // Both the statusline and the /skill-zero session line read this one file.
    const p = plan();
    const resolved = resolveSkill(FIXTURE);
    expect(p.manifest.posture).toBe("curated");
    expect(p.manifest.skillCount).toBe(1);
    expect(p.manifest.standingTokens).toBe(resolved.standingTokens);
    expect(p.manifest.scope).toBe("session");
    expect(p.manifest.incomplete).toBeUndefined(); // the set is enumerated, not censused
    expect(p.manifest.launcherLocked).toBe(true);
  });

  it("takes the skill id from frontmatter `name`, not the directory name", () => {
    const p = plan();
    const copy = p.fsPlan.find((op) => op.kind === "copyDir");
    // dir is "impeccable-skill"; frontmatter name is "impeccable"
    expect(copy && "to" in copy && copy.to && copy.to.replace(/\\/g, "/")).toBe(
      join(sessionDir, "heaven-set", "skills", "impeccable").replace(/\\/g, "/"),
    );
  });

  it("materializes into the session dir and mutates NOTHING outside it (P3)", () => {
    const session = mkdtempSync(join(tmpdir(), "ch-materialize-"));
    const before = readdirSync(FIXTURE).sort();
    const beforeMtime = statSync(join(FIXTURE, "SKILL.md")).mtimeMs;
    try {
      const p = planLaunch({
        posture: "curated",
        skillPaths: [FIXTURE],
        sessionDir: session,
        statuslineBin: "/abs/statusline.mjs",
      });
      materialize(p.fsPlan, session);

      // the plugin manifest that makes --plugin-dir resolve
      const pluginJson = join(session, "heaven-set", ".claude-plugin", "plugin.json");
      expect(existsSync(pluginJson)).toBe(true);
      expect(JSON.parse(readFileSync(pluginJson, "utf-8")).name).toBe("heaven-set");
      // the curated set itself, with real bytes
      const copied = join(session, "heaven-set", "skills", "impeccable", "SKILL.md");
      expect(readFileSync(copied, "utf-8")).toBe(readFileSync(join(FIXTURE, "SKILL.md"), "utf-8"));

      // every planned path is inside the session dir — no exceptions
      for (const op of p.fsPlan) {
        const to = op.kind === "write" ? op.path : op.to;
        expect(to.startsWith(session), `${to} escapes the session dir`).toBe(true);
      }
      // the source skill is READ, never written
      expect(readdirSync(FIXTURE).sort()).toEqual(before);
      expect(statSync(join(FIXTURE, "SKILL.md")).mtimeMs).toBe(beforeMtime);
    } finally {
      rmSync(session, { recursive: true, force: true });
    }
  });

  it("refuses to compose a curated session with no skills (core's guard, surfaced)", () => {
    expect(() => plan({ skillPaths: [] })).toThrow(/requires at least one --skill/);
  });

  it("refuses --skill at a posture that cannot admit skills", () => {
    expect(() =>
      planLaunch({
        posture: "product-floor",
        skillPaths: [FIXTURE],
        sessionDir,
        statuslineBin: "/abs/s.mjs",
      }),
    ).toThrow(/only valid with --posture curated/);
  });

  // KC6 (Issue #12 / the "known gap" flagged in PR #18): curated evicts the
  // user-scope plugin install and mounts only $SESSION/heaven-set, so
  // claude-zero's own /skill-zero does not exist inside a curated
  // session. Nothing inside that session can disclose this for itself, so it
  // must travel in the plan's own notes — the one channel both --print and a
  // real launch (cli.ts) both read.
  it("discloses that /skill-zero does not exist inside a curated session (KC6)", () => {
    const p = plan();
    expect(p.notes.join(" ")).toContain(CURATED_DOOR_ABSENCE_NOTE);
    // Honest about what it is NOT: neither policy-gated nor proven impossible.
    expect(p.notes.join(" ")).toContain("Not withheld by policy, and not proven impossible either");
  });
});

describe("planLaunch(product-floor) — the doorful floor", () => {
  const plan = () =>
    planLaunch({
      posture: "product-floor",
      sessionDir,
      statuslineBin: "/abs/statusline.mjs",
      doorPluginDir: "/abs/door-plugin",
    });

  it("keeps slash commands AND mounts the door, or the surviving door is theoretical", () => {
    // F7's whole point: product-floor keeps --disable-slash-commands absent, so
    // /skill-zero exists. P8 also uses an empty setting-sources allowlist, so
    // the door has to be mounted explicitly or the posture keeps a command
    // surface with no command on it.
    const p = plan();
    expect(p.argv).not.toContain("--disable-slash-commands");
    const settingSourcesIdx = p.argv.indexOf("--setting-sources");
    expect(settingSourcesIdx).toBeGreaterThanOrEqual(0);
    expect(p.argv[settingSourcesIdx + 1]).toBe("");
    expect(p.argv).toContain("--plugin-dir");
    expect(p.argv).toContain("/abs/door-plugin");
    expect(p.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
    expect(p.fsPlan).toEqual([]); // nothing to summon: the clean room admits no skills
  });

  it("reports an empty profile honestly rather than echoing native's census", () => {
    const p = plan();
    expect(p.manifest.posture).toBe("product-floor");
    expect(p.manifest.standingTokens).toBe(0);
    expect(p.manifest.skillCount).toBe(0);
    expect(p.manifest.scope).toBe("session");
  });

  // P8: product-floor now uses the empty setting-sources allowlist, so the
  // project-scope leak is closed and the zero selected-skill dose is exact.
  it("does not mark the selected-skill dose incomplete after the P8 scope fix", () => {
    expect(plan().manifest.incomplete).toBeUndefined();
  });

  // KC6: the door-absence disclosure is curated-specific — product-floor is
  // exactly the posture that keeps the door (F7's whole point), so carrying
  // the note here would be a false claim, the opposite defect.
  it("carries no curated door-absence note — this posture keeps the door", () => {
    expect(plan().notes.join(" ")).not.toContain(CURATED_DOOR_ABSENCE_NOTE);
  });
});
