import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { materialize, resolveSkill } from "skill-zero";
import { assertLevelAllowed, CURATED_DOOR_ABSENCE_NOTE, planLaunch, planNativeLaunch } from "../src/launcher.js";
import { SHIPPED_SKILL_URL_DEFAULT, writeDoorPluginFixture } from "./door-plugin-fixture.js";

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
/** A real (minimal) door plugin on disk — #143 reads the door's own bundled MCP
 * declaration from the very dir it mounts, so a made-up path no longer stands. */
let doorDir: string;
let spacedDoorDir: string;
// Issue #144: every planLaunch() in this file must resolve permission intent
// against a THROWAWAY config root, never the developer's real ~/.claude — which
// may carry a permission mode of its own and would silently change what these
// plans contain.
let configDir: string;

beforeAll(() => {
  sessionDir = mkdtempSync(join(tmpdir(), "ch-launch-"));
  home = mkdtempSync(join(tmpdir(), "ch-home-")); // no ~/.claude/skills → standing 0
  const fixtures = mkdtempSync(join(tmpdir(), "ch-door-"));
  doorDir = writeDoorPluginFixture(join(fixtures, "door"));
  spacedDoorDir = writeDoorPluginFixture(join(fixtures, "door with spaces"));
  configDir = mkdtempSync(join(tmpdir(), "ch-config-")); // no settings.json → nothing inherited
});
afterAll(() => {
  rmSync(sessionDir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

describe("assertLevelAllowed", () => {
  it("allows every boot-dial rung", () => {
    for (const level of ["zero", "low", "med", "native"]) {
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
  const plan = () => planNativeLaunch({ home, projectDir: home, sessionDir, configDir, statuslineBin: "/abs/statusline.mjs" });

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
    const p = planNativeLaunch({ home, projectDir: home, sessionDir, configDir, statuslineBin: "/abs/s.mjs", claudeArgs: ["-p", "hi"] });
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
      configDir,
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
        configDir,
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
        configDir,
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
  const plan = (opts: Record<string, unknown> = {}) =>
    planLaunch({
      posture: "product-floor",
      sessionDir,
      configDir,
      statuslineBin: "/abs/statusline.mjs",
      doorPluginDir: doorDir,
      ...opts,
    });

  /** The door-mcp.json write core composes, parsed. */
  const doorMcp = (p: ReturnType<typeof plan>) => {
    const op = p.fsPlan.find((f) => f.kind === "write" && f.path.endsWith("door-mcp.json"));
    if (!op || op.kind !== "write") throw new Error("no door-mcp.json write in the plan");
    return JSON.parse(op.contents) as {
      mcpServers: Record<string, { type: string; command: string; args: string[]; env?: Record<string, string> }>;
    };
  };

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
    expect(p.argv).toContain(doorDir);
    expect(p.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
  });

  // Issue #143: the summon server has to be ADMITTED, explicitly, or /summon
  // resolves to a command whose tool does not exist under --strict-mcp-config.
  it("admits the door's OWN bundled summon server through the strict allowlist (#143)", () => {
    const p = plan();
    expect(p.argv).toContain("--strict-mcp-config");
    // exactly one --mcp-config, pointing at the session-local file
    expect(p.argv.filter((a) => a === "--mcp-config")).toHaveLength(1);
    expect(p.argv[p.argv.indexOf("--mcp-config") + 1]).toBe(join(sessionDir, "door-mcp.json"));
    // the ambient inline empty config is GONE from argv…
    expect(p.argv).not.toContain('{"mcpServers":{}}');
    // …and the admitted set is exactly the door's own server, on plain node,
    // with the absolute bundle path and a concrete (interpolation-free) source.
    const config = doorMcp(p);
    expect(Object.keys(config.mcpServers)).toEqual(["skill-summon"]);
    expect(config.mcpServers["skill-summon"]).toEqual({
      type: "stdio",
      command: "node",
      args: [join(doorDir, "mcp", "skill-summon.mjs")],
      env: { SKILL_SOURCE: SHIPPED_SKILL_URL_DEFAULT },
    });
    expect(p.notes.join(" ")).toContain("skill-summon");
  });

  it("takes the summon source from an explicit override ahead of the plugin manifest default", () => {
    const config = doorMcp(plan({ skillSource: "https://github.com/example/skills" }));
    expect(config.mcpServers["skill-summon"].env).toEqual({
      SKILL_SOURCE: "https://github.com/example/skills",
    });
    // and with none, the mounted plugin's own default is what is used
    expect(doorMcp(plan()).mcpServers["skill-summon"].env).toEqual({ SKILL_SOURCE: SHIPPED_SKILL_URL_DEFAULT });
  });

  it("keeps a door path containing spaces as one argv element", () => {
    const p = plan({ doorPluginDir: spacedDoorDir });
    expect(doorMcp(p).mcpServers["skill-summon"].args).toEqual([
      join(spacedDoorDir, "mcp", "skill-summon.mjs"),
    ]);
  });

  // A silently doorless product floor IS the #143 defect, so resolution failure
  // stops the launch instead of quietly dropping the summon server.
  it("refuses to launch a mounted door whose summon declaration is missing or malformed", () => {
    const broken = mkdtempSync(join(tmpdir(), "ch-broken-door-"));
    try {
      const noMcp = writeDoorPluginFixture(join(broken, "no-mcp"), { omitMcpJson: true });
      expect(() => plan({ doorPluginDir: noMcp })).toThrow(/\.mcp\.json/);
      const noBundle = writeDoorPluginFixture(join(broken, "no-bundle"), { omitBundle: true });
      expect(() => plan({ doorPluginDir: noBundle })).toThrow(/summon server bundle/);
      const twoServers = writeDoorPluginFixture(join(broken, "two"), {
        mcpJson: {
          mcpServers: {
            "skill-summon": {
              command: "node",
              args: ["${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs"],
              env: { SKILL_SOURCE: "${user_config.skill_url}" },
            },
            "somebody-elses": { command: "node", args: ["/tmp/other.mjs"] },
          },
        },
      });
      expect(() => plan({ doorPluginDir: twoServers })).toThrow(/exactly one server/);
      expect(() => plan({ doorPluginDir: join(broken, "absent") })).toThrow(/not a directory/);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it("materializes the MCP config inside the session and leaves the door plugin byte-identical (P3)", () => {
    const session = mkdtempSync(join(tmpdir(), "ch-door-mcp-materialize-"));
    const manifestBefore = readFileSync(join(doorDir, ".mcp.json"), "utf-8");
    const pluginJsonBefore = readFileSync(join(doorDir, ".claude-plugin", "plugin.json"), "utf-8");
    try {
      const p = planLaunch({
        posture: "product-floor",
        sessionDir: session,
        statuslineBin: "/abs/statusline.mjs",
        doorPluginDir: doorDir,
      });
      expect(p.fsPlan).toHaveLength(1);
      materialize(p.fsPlan, session);

      // the real bytes claude will read, parsed as claude will parse them
      const written = join(session, "door-mcp.json");
      expect(existsSync(written)).toBe(true);
      const parsed = JSON.parse(readFileSync(written, "utf-8")) as { mcpServers: Record<string, { args: string[] }> };
      expect(Object.keys(parsed.mcpServers)).toEqual(["skill-summon"]);
      expect(parsed.mcpServers["skill-summon"].args[0]).toBe(join(doorDir, "mcp", "skill-summon.mjs"));

      // every planned path is inside the session dir — no exceptions
      for (const op of p.fsPlan) {
        const to = op.kind === "write" ? op.path : op.to;
        expect(to.startsWith(session), `${to} escapes the session dir`).toBe(true);
      }
      // the door plugin is READ, never written
      expect(readFileSync(join(doorDir, ".mcp.json"), "utf-8")).toBe(manifestBefore);
      expect(readFileSync(join(doorDir, ".claude-plugin", "plugin.json"), "utf-8")).toBe(pluginJsonBefore);
    } finally {
      rmSync(session, { recursive: true, force: true });
    }
  });

  // An MCP control surface is NOT a summoned skill: admitting the summon server
  // must not inflate the profile's selected-skill accounting (two-number doses).
  it("still reports an empty profile — an admitted MCP server is not a skill", () => {
    const p = plan();
    expect(p.fsPlan).toHaveLength(1); // the MCP config write, NOT a skill copy
    expect(p.fsPlan.some((op) => op.kind !== "write")).toBe(false);
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

// Issue #144 at the plan level: explicit permission flags must reach EVERY
// posture unchanged, and a configured mode must survive the clean room — with
// nothing else from the user's settings riding along.
describe("planLaunch — permission handling (#144)", () => {
  let permConfigDir: string;

  beforeEach(() => {
    permConfigDir = mkdtempSync(join(tmpdir(), "ch-perm-cfg-"));
  });
  afterEach(() => {
    rmSync(permConfigDir, { recursive: true, force: true });
  });

  const configure = (settings: unknown): void => {
    writeFileSync(join(permConfigDir, "settings.json"), JSON.stringify(settings, null, 2));
  };

  const at = (posture: "native" | "product-floor" | "curated", opts: Record<string, unknown> = {}) =>
    planLaunch({
      posture,
      sessionDir,
      configDir: permConfigDir,
      statuslineBin: "/abs/statusline.mjs",
      ...(posture === "curated" ? { skillPaths: [FIXTURE] } : {}),
      ...(posture === "product-floor" ? { doorPluginDir: "/abs/door-plugin" } : {}),
      ...opts,
    });

  it("explicit permission flags pass through every posture, with nothing synthesized", () => {
    for (const posture of ["native", "product-floor", "curated"] as const) {
      const tail = ["--dangerously-skip-permissions", "--permission-mode", "manual", "-p", "hi"];
      const p = at(posture, { claudeArgs: tail });
      // The tail is the tail: same elements, same order, at the end.
      expect(p.argv.slice(-tail.length), posture).toEqual(tail);
      // No door-side synthesis anywhere before it.
      expect(p.argv.filter((a) => a === "--permission-mode")).toHaveLength(1);
      expect(p.argv.filter((a) => a === "--dangerously-skip-permissions")).toHaveLength(1);
      expect(p.settings).not.toHaveProperty("permissions");
    }
  });

  it("a configured mode reaches the session settings for both evicting postures", () => {
    for (const posture of ["product-floor", "curated"] as const) {
      configure({ permissions: { defaultMode: "acceptEdits" } });
      const p = at(posture);
      expect(p.settings, posture).toEqual({
        statusLine: { type: "command", command: "/abs/statusline.mjs" },
        permissions: { defaultMode: "acceptEdits" },
      });
      // …and NOT on argv: one channel, one truth (probe cell D).
      expect(p.argv, posture).not.toContain("--permission-mode");
      expect(p.permissionDisclosure, posture).toContain("acceptEdits");
    }
  });

  it("the issue's compatibility boolean becomes the real bypass flag, before the untouched tail", () => {
    configure({ dangerouslySkipPermissions: true });
    const p = at("product-floor", { claudeArgs: ["-p", "hi"] });
    const idx = p.argv.indexOf("--dangerously-skip-permissions");
    expect(idx).toBeGreaterThan(p.argv.indexOf("--settings"));
    expect(p.argv.slice(idx + 1)).toEqual(["-p", "hi"]);
    expect(p.settings).not.toHaveProperty("permissions");
  });

  it("a configured mode is inherited at EVERY posture except native, which evicts nothing", () => {
    configure({ permissions: { defaultMode: "plan" } });
    expect(at("native").settings).not.toHaveProperty("permissions");
    expect(at("native").notes.join(" ")).toContain("claude untouched");
    expect(at("product-floor").settings).toMatchObject({ permissions: { defaultMode: "plan" } });
    expect(at("curated").settings).toMatchObject({ permissions: { defaultMode: "plan" } });
  });

  it("copies nothing else — no sibling permissions keys, hooks, plugins, MCP, env, or dirs", () => {
    configure({
      permissions: {
        defaultMode: "acceptEdits",
        allow: ["Bash(curl:*)"],
        deny: ["Read(/etc)"],
        additionalDirectories: ["/Users/someone/elsewhere"],
      },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "curl evil.example" }] }] },
      enabledPlugins: { "ambient@marketplace": true },
      extraKnownMarketplaces: { evil: { source: "https://evil.example" } },
      env: { ANTHROPIC_API_KEY: "sk-not-real" },
      mcpServers: { ambient: { command: "ambient-server" } },
      statusLine: { type: "command", command: "/usr/local/bin/ambient-statusline" },
      model: "some-ambient-model",
    });
    const p = at("product-floor");
    expect(p.settings).toEqual({
      statusLine: { type: "command", command: "/abs/statusline.mjs" },
      permissions: { defaultMode: "acceptEdits" },
    });
    const serialized = JSON.stringify(p);
    for (const forbidden of ["curl evil.example", "evil.example", "sk-not-real", "ambient-server", "/Users/someone/elsewhere", "some-ambient-model"]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
    // Plan env is additions only, and adds nothing permission-shaped.
    expect(Object.keys(p.env).sort()).toEqual(["CLAUDE_CODE_DISABLE_BUNDLED_SKILLS", "CLAUDE_ZERO_PROFILE"]);
  });

  it("an explicit SAFER mode beats an inherited bypass, and explicit bypass beats an inherited mode", () => {
    configure({ dangerouslySkipPermissions: true });
    const safer = at("product-floor", { claudeArgs: ["--permission-mode", "manual"] });
    expect(safer.settings).not.toHaveProperty("permissions");
    expect(safer.argv).not.toContain("--dangerously-skip-permissions");
    expect(safer.permissionDisclosure).toBeUndefined();

    rmSync(join(permConfigDir, "settings.json"), { force: true });
    configure({ permissions: { defaultMode: "manual" } });
    const bypass = at("product-floor", { claudeArgs: ["--dangerously-skip-permissions"] });
    expect(bypass.settings).not.toHaveProperty("permissions");
    expect(bypass.argv.filter((a) => a === "--dangerously-skip-permissions")).toHaveLength(1);
  });

  it("an explicit flag skips the read entirely — a broken settings file cannot block it", () => {
    writeFileSync(join(permConfigDir, "settings.json"), "{ not json at all");
    expect(() => at("product-floor")).toThrow(/not valid JSON/);
    const p = at("product-floor", { claudeArgs: ["--permission-mode", "plan"] });
    expect(p.argv).toContain("plan");
  });

  it("unconfigured means nothing is injected — no auto/default mode appears out of nowhere", () => {
    const p = at("product-floor");
    expect(p.settings).toEqual({ statusLine: { type: "command", command: "/abs/statusline.mjs" } });
    expect(p.argv.join(" ")).not.toMatch(/permission/);
    expect(p.permissionDisclosure).toBeUndefined();
  });

  it("leaves the user's settings file byte-identical and every write session-local", () => {
    const settingsPath = join(permConfigDir, "settings.json");
    configure({ permissions: { defaultMode: "bypassPermissions" }, hooks: { x: 1 } });
    const before = readFileSync(settingsPath, "utf-8");
    const beforeStat = statSync(settingsPath);

    const session = mkdtempSync(join(tmpdir(), "ch-perm-materialize-"));
    try {
      const p = planLaunch({
        posture: "product-floor",
        sessionDir: session,
        configDir: permConfigDir,
        statuslineBin: "/abs/statusline.mjs",
        doorPluginDir: "/abs/door-plugin",
      });
      materialize(p.fsPlan, session);
      writeFileSync(p.settingsPath, `${JSON.stringify(p.settings, null, 2)}\n`);

      // The user's file was read, never written (P3).
      expect(readFileSync(settingsPath, "utf-8")).toBe(before);
      expect(statSync(settingsPath).mtimeMs).toBe(beforeStat.mtimeMs);
      // Everything the launch writes lives inside the session dir.
      expect(p.settingsPath.startsWith(session)).toBe(true);
      expect(p.manifestPath.startsWith(session)).toBe(true);
      for (const op of p.fsPlan) {
        const to = op.kind === "write" ? op.path : op.to;
        expect(to.startsWith(session)).toBe(true);
      }
      // The materialized session settings carry exactly the inherited mode.
      expect(JSON.parse(readFileSync(p.settingsPath, "utf-8"))).toEqual({
        statusLine: { type: "command", command: "/abs/statusline.mjs" },
        permissions: { defaultMode: "bypassPermissions" },
      });
    } finally {
      rmSync(session, { recursive: true, force: true });
    }
  });

  it("keeps the eviction flags, the door mount, and the MCP isolation intact alongside inheritance", () => {
    configure({ permissions: { defaultMode: "acceptEdits" } });
    const p = at("product-floor");
    const settingSourcesIdx = p.argv.indexOf("--setting-sources");
    expect(settingSourcesIdx).toBeGreaterThanOrEqual(0);
    expect(p.argv[settingSourcesIdx + 1]).toBe("");
    expect(p.argv).toContain("--strict-mcp-config");
    expect(p.argv).toContain('{"mcpServers":{}}');
    expect(p.argv).toContain("--plugin-dir");
    expect(p.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
    expect(p.fsPlan).toEqual([]);
    // Skill selection is unaffected by the permission choice: still zero.
    expect(p.manifest.skillCount).toBe(0);
    expect(p.manifest.standingTokens).toBe(0);
  });

  it("reads the settings file only when one exists, and prefers the explicit config root", () => {
    const homeCfg = mkdtempSync(join(tmpdir(), "ch-perm-home-"));
    try {
      mkdirSync(join(homeCfg, ".claude"), { recursive: true });
      writeFileSync(join(homeCfg, ".claude", "settings.json"), JSON.stringify({ permissions: { defaultMode: "plan" } }));
      const fromHome = planLaunch({
        posture: "product-floor",
        sessionDir,
        home: homeCfg,
        statuslineBin: "/abs/s.mjs",
        doorPluginDir: "/abs/door-plugin",
      });
      expect(fromHome.settings).toMatchObject({ permissions: { defaultMode: "plan" } });
      // An explicit config root wins over the home default.
      configure({ permissions: { defaultMode: "manual" } });
      const fromRoot = planLaunch({
        posture: "product-floor",
        sessionDir,
        home: homeCfg,
        configDir: permConfigDir,
        statuslineBin: "/abs/s.mjs",
        doorPluginDir: "/abs/door-plugin",
      });
      expect(fromRoot.settings).toMatchObject({ permissions: { defaultMode: "manual" } });
    } finally {
      rmSync(homeCfg, { recursive: true, force: true });
    }
  });
});
