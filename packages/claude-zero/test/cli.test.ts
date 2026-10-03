import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURATED_DOOR_ABSENCE_NOTE } from "../src/launcher.js";
import { parseArgs, run } from "../src/cli.js";

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

function captureStdout(fn: () => number): { code: number; out: string } {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    return { code: fn(), out: chunks.join("") };
  } finally {
    process.stdout.write = orig;
  }
}

function silenceStderr(fn: () => number): number {
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (s: string) => boolean) = () => true;
  try {
    return fn();
  } finally {
    process.stderr.write = orig;
  }
}

function captureStderr(fn: () => number): { code: number; err: string } {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    return { code: fn(), err: chunks.join("") };
  } finally {
    process.stderr.write = orig;
  }
}

// Issue #144: the CLI reads the user's Claude settings for a permission mode, so
// a test run must NEVER see the developer's real ~/.claude (a real one would
// change these expectations — the door inheriting a real `auto` is the fix
// working, not a test failure). Every case below runs against a throwaway
// CLAUDE_CONFIG_DIR with the ambient value saved and restored.
let isolatedConfigDir: string;
let priorConfigDir: string | undefined;

beforeEach(() => {
  isolatedConfigDir = mkdtempSync(join(tmpdir(), "cz144-cli-cfg-"));
  priorConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir;
});

afterEach(() => {
  if (priorConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = priorConfigDir;
  rmSync(isolatedConfigDir, { recursive: true, force: true });
});

/** Write a throwaway user settings file into the isolated config root. */
function configureUserSettings(settings: unknown): void {
  writeFileSync(join(isolatedConfigDir, "settings.json"), JSON.stringify(settings, null, 2));
}

describe("parseArgs", () => {
  it("defaults to off/product-floor, print off", () => {
    expect(parseArgs([])).toEqual({
      help: false,
      print: false,
      posture: "product-floor",
      postureProvided: false,
      level: undefined,
      skills: [],
      claudeArgs: [],
    });
  });
  it("captures --print, --posture, --level", () => {
    expect(parseArgs(["--print", "--posture", "native", "--level", "zero"])).toMatchObject({
      print: true,
      posture: "native",
      postureProvided: true,
      level: "zero",
    });
  });
  it("collects --skill repeatably, and does not leak it to claude", () => {
    const a = parseArgs(["--posture", "curated", "--skill", "/a", "--skill", "/b"]);
    expect(a.skills).toEqual(["/a", "/b"]);
    expect(a.claudeArgs).toEqual([]);
  });
  it("routes everything after -- to claude, plus unknown flags", () => {
    expect(parseArgs(["--", "-p", "hi"]).claudeArgs).toEqual(["-p", "hi"]);
    expect(parseArgs(["--model", "haiku"]).claudeArgs).toEqual(["--model", "haiku"]);
  });
});

// Issue #144: permission flags are CLAUDE's, and the wrapper's job is to hand
// them over untouched — including on the `--` path, which bypasses every
// wrapper branch by design.
describe("parseArgs — permission flags are forwarded, not interpreted (#144)", () => {
  it("forwards bypass and allow-bypass verbatim, directly and after --", () => {
    expect(parseArgs(["--dangerously-skip-permissions"]).claudeArgs).toEqual([
      "--dangerously-skip-permissions",
    ]);
    expect(parseArgs(["--allow-dangerously-skip-permissions"]).claudeArgs).toEqual([
      "--allow-dangerously-skip-permissions",
    ]);
    expect(parseArgs(["--", "--dangerously-skip-permissions"]).claudeArgs).toEqual([
      "--dangerously-skip-permissions",
    ]);
  });

  it("consumes a separate mode value as a unit, keeping the spelling and order", () => {
    expect(parseArgs(["--permission-mode", "acceptEdits"]).claudeArgs).toEqual([
      "--permission-mode",
      "acceptEdits",
    ]);
    expect(parseArgs(["--permission-mode=plan"]).claudeArgs).toEqual([
      "--permission-mode",
      "plan",
    ]);
    // ordering survives, and the wrapper's own flags are still its own
    expect(
      parseArgs(["--print", "--dangerously-skip-permissions", "--permission-mode", "manual"]).claudeArgs,
    ).toEqual(["--dangerously-skip-permissions", "--permission-mode", "manual"]);
    expect(parseArgs(["--print", "--permission-mode", "manual"]).print).toBe(true);
    expect(parseArgs(["--", "--permission-mode", "dontAsk"]).claudeArgs).toEqual([
      "--permission-mode",
      "dontAsk",
    ]);
  });

  it("refuses a missing, empty, or option-shaped mode VALUE instead of swallowing it", () => {
    // The old behaviour lost `--permission-mode` entirely, and read
    // `--permission-mode --print` as a mode named "--print".
    expect(() => parseArgs(["--permission-mode"])).toThrow(/needs a mode value/);
    expect(() => parseArgs(["--print", "--permission-mode"])).toThrow(/needs a mode value/);
    expect(() => parseArgs(["--permission-mode", ""])).toThrow(/needs a mode value/);
    expect(() => parseArgs(["--permission-mode", "--print"])).toThrow(/needs a mode value/);
    expect(() => parseArgs(["--permission-mode="])).toThrow(/needs a mode value/);
    expect(() => parseArgs(["--permission-mode=--print"])).toThrow(/needs a mode value/);
    // The diagnostic lists what is actually valid, without echoing the whole
    // command line back.
    let message = "";
    try {
      parseArgs(["--permission-mode"]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("bypassPermissions");
    expect(message).not.toContain("--posture");
  });

  it("does not validate the mode VALUE — claude owns its mode enum", () => {
    // Rejecting a mode a newer claude adds would be a self-inflicted version
    // lock; the door only insists a value is present.
    expect(parseArgs(["--permission-mode", "someFutureMode"]).claudeArgs).toEqual([
      "--permission-mode",
      "someFutureMode",
    ]);
  });
});

describe("run", () => {
  it("--print emits a valid renderable plan and exits 0 without spawning or writing to disk", () => {
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("product-floor");
    expect(plan.launcherLocked).toBe(true);
    expect(plan.command).toBe("claude");
    // the exact manifest that WOULD be written is shown inline (no temp dir)
    expect(plan.manifest.schema).toBe("claude-zero/profile@1");
    expect(plan.settings).toEqual({ statusLine: { type: "command", command: expect.stringContaining("statusline.mjs") } });
    expect(plan).not.toHaveProperty("sessionDir");
  });

  it("routes a summon rung to the command that arms it, ultra included", () => {
    for (const [level, arm] of [["max", "/skill-hell max"], ["ultra", "/skill-ultra"]] as const) {
      const { code, err } = captureStderr(() => run(["--level", level]));
      expect(code, level).toBe(2);
      expect(err).toContain("live summon rung, not a boot posture");
      expect(err).toContain(arm);
      expect(err).not.toMatch(/UNRATIFIED|P2|gated/i);
    }
  });

  it("refuses the doorless benchmark floor — it is core's, for measurement runs (exit 2)", () => {
    // F6: --disable-slash-commands suppresses plugin COMMANDS too, so a door
    // that launched it would be launching a session it cannot then talk to.
    expect(silenceStderr(() => run(["--posture", "floor"]))).toBe(2);
    expect(silenceStderr(() => run(["--posture", "nonsense"]))).toBe(2);
  });

  it("resolves --level zero to the product floor and rejects contradictions", () => {
    const { code, out } = captureStdout(() => run(["--level", "zero", "--print"]));
    expect(code).toBe(0);
    expect(JSON.parse(out).posture).toBe("product-floor");
    expect(silenceStderr(() => run(["--posture", "floor", "--level", "zero"]))).toBe(2);
  });

  it("--print composes a real curated plan: T9 argv, the env knob, and an fsPlan", () => {
    const { code, out } = captureStdout(() =>
      run(["--print", "--posture", "curated", "--skill", FIXTURE]),
    );
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("curated");
    expect(plan.skillCount).toBe(1);
    expect(plan.standingTokens).toBeGreaterThan(0);
    expect(plan.argv).toContain("--plugin-dir");
    expect(plan.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
    // the fsPlan IS the mechanism: a plugin manifest + the copied set
    expect(plan.fsPlan.map((op: { kind: string }) => op.kind)).toEqual(["write", "copyDir"]);
    // core's evidence travels with the plan rather than being restated by the door
    expect(plan.notes.join(" ")).toContain("T9");
    // --print writes nothing, so it leaks no temp dir and needs no claude binary
    expect(plan.argv.join(" ")).toContain("$SESSION");
  });

  it("--print composes product-floor with the door mounted, the summon server admitted, and an empty profile", () => {
    const { code, out } = captureStdout(() => run(["--print", "--posture", "product-floor"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("product-floor");
    expect(plan.standingTokens).toBe(0);
    expect(plan.skillCount).toBe(0);
    expect(plan.argv).not.toContain("--disable-slash-commands");
    expect(plan.argv.join(" ")).toMatch(/--plugin-dir \S*plugins[\\/]skill-heaven/);
    // #143: the summon MCP server is admitted through a session-local file the
    // real launch would materialize — and --print shows it WITHOUT writing it.
    expect(plan.argv).toContain("--strict-mcp-config");
    expect(plan.argv[plan.argv.indexOf("--mcp-config") + 1]).toBe("$SESSION/door-mcp.json");
    expect(plan.fsPlan).toHaveLength(1);
    expect(plan.fsPlan[0]).toMatchObject({ kind: "write", path: "$SESSION/door-mcp.json" });
    const parsed = JSON.parse(plan.fsPlan[0].contents);
    expect(Object.keys(parsed.mcpServers)).toEqual(["skill-summon"]);
    expect(parsed.mcpServers["skill-summon"].command).toBe("node");
    expect(parsed.mcpServers["skill-summon"].args[0]).toMatch(/skill-heaven[\\/]mcp[\\/]skill-summon\.mjs$/);
    expect(parsed.mcpServers["skill-summon"].env.SKILL_SOURCE).toBe("https://gaiaskilltree.com");
    // --print writes nothing: the plan still carries core's placeholder.
    expect(plan.argv.join(" ")).toContain("$SESSION");
    expect(existsSync(join(process.cwd(), "$SESSION"))).toBe(false);
  });

  // #143: SKILL_SOURCE is the launcher's explicit source override, and it must
  // reach BOTH the dry-run plan and the real launch.
  it("propagates SKILL_SOURCE into the admitted door MCP declaration, and restores the environment", () => {
    const previous = process.env.SKILL_SOURCE;
    try {
      process.env.SKILL_SOURCE = "https://github.com/example/skills";
      const { code, out } = captureStdout(() => run(["--print", "--posture", "product-floor"]));
      expect(code).toBe(0);
      const plan = JSON.parse(out);
      expect(JSON.parse(plan.fsPlan[0].contents).mcpServers["skill-summon"].env).toEqual({
        SKILL_SOURCE: "https://github.com/example/skills",
      });
      // and the plan says where the answer came from
      expect(plan.notes.join(" ")).toContain("explicit SKILL_SOURCE override");

      // The default (no override) path is the plugin manifest's own default, and
      // the ambient environment of the developer running the tests must not leak
      // into it — SKILL_SOURCE is isolated above and restored below.
      delete process.env.SKILL_SOURCE;
      const clean = JSON.parse(captureStdout(() => run(["--print", "--posture", "product-floor"])).out);
      expect(JSON.parse(clean.fsPlan[0].contents).mcpServers["skill-summon"].env).toEqual({
        SKILL_SOURCE: "https://gaiaskilltree.com",
      });
      expect(clean.notes.join(" ")).toContain("userConfig.skill_url.default");
    } finally {
      if (previous === undefined) delete process.env.SKILL_SOURCE;
      else process.env.SKILL_SOURCE = previous;
    }
  });

  it("documents SKILL_SOURCE and its precedence in --help", () => {
    const { code, out } = captureStdout(() => run(["--help"]));
    expect(code).toBe(0);
    expect(out).toContain("SKILL_SOURCE");
    expect(out).toMatch(/userConfig\.skill_url\.default/);
  });

  it("refuses a curated launch with no --skill instead of composing an empty set (exit 2)", () => {
    // The bare command a surface might be tempted to print. It must fail here so
    // no surface can offer it (KC7).
    expect(silenceStderr(() => run(["--print", "--posture", "curated"]))).toBe(2);
  });

  it("refuses --skill at a posture that cannot admit skills, rather than dropping it", () => {
    expect(
      silenceStderr(() => run(["--print", "--posture", "product-floor", "--skill", FIXTURE])),
    ).toBe(2);
    expect(silenceStderr(() => run(["--print", "--posture", "native", "--skill", FIXTURE]))).toBe(2);
  });

  it("reports an unreadable skill path as an error, not as a silently smaller set", () => {
    expect(
      silenceStderr(() => run(["--print", "--posture", "curated", "--skill", "/nope/not/here"])),
    ).toBe(2);
  });
});

// Issue #144, end to end through the CLI. The bug: the clean room
// (`--setting-sources ''`) evicts the user's settings, so a configured
// permission mode — including `dangerouslySkipPermissions` — was dropped and the
// session came back up in claude's own default. These cases pin the two halves
// of the fix: explicit flags survive, and a configured mode is carried through
// WITHOUT anything else from that file.
describe("run — permission handling (#144)", () => {
  it("--print shows the explicit bypass flag exactly once and injects no mode", () => {
    const { code, out } = captureStdout(() => run(["--print", "--dangerously-skip-permissions"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.argv.filter((a: string) => a === "--dangerously-skip-permissions")).toHaveLength(1);
    // No synthesized default/auto mode anywhere: the user's flag is the whole story.
    expect(plan.settings).not.toHaveProperty("permissions");
    expect(plan.argv).not.toContain("--permission-mode");
    expect(plan.permissionDisclosure).toBeNull();
  });

  it("--print shows an explicit mode on the argv, once, and nothing inherited", () => {
    const { code, out } = captureStdout(() => run(["--print", "--permission-mode", "acceptEdits"]));
    const plan = JSON.parse(out);
    expect(code).toBe(0);
    expect(plan.argv.filter((a: string) => a === "acceptEdits")).toHaveLength(1);
    expect(plan.argv.filter((a: string) => a === "--permission-mode")).toHaveLength(1);
    expect(plan.settings).not.toHaveProperty("permissions");
  });

  it("carries a configured permission mode into the printed session settings, with a note", () => {
    configureUserSettings({ permissions: { defaultMode: "acceptEdits" } });
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    // The clean room is still intact…
    const settingSourcesIdx = plan.argv.indexOf("--setting-sources");
    expect(settingSourcesIdx).toBeGreaterThanOrEqual(0);
    expect(plan.argv[settingSourcesIdx + 1]).toBe("");
    // …and the configured mode rides the session settings file.
    expect(plan.settings).toEqual({
      statusLine: { type: "command", command: expect.stringContaining("statusline.mjs") },
      permissions: { defaultMode: "acceptEdits" },
    });
    expect(plan.permissionDisclosure).toContain("permissions.defaultMode");
    expect(plan.notes.join(" ")).toContain("drop the permission mode configured");
    // A mode is not a flag: no duplicate signal on argv.
    expect(plan.argv).not.toContain("--permission-mode");
  });

  it("carries the issue's compatibility boolean into the real bypass flag", () => {
    configureUserSettings({ dangerouslySkipPermissions: true });
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.argv.filter((a: string) => a === "--dangerously-skip-permissions")).toHaveLength(1);
    expect(plan.settings).not.toHaveProperty("permissions");
    expect(plan.permissionDisclosure).toContain("dangerouslySkipPermissions=true");
  });

  it("imports NOTHING else from the user's settings file", () => {
    configureUserSettings({
      env: { ANTHROPIC_API_KEY: "sk-not-real" },
      hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "curl evil" }] }] },
      enabledPlugins: { "some-marketplace@market": true },
      permissions: {
        defaultMode: "acceptEdits",
        allow: ["Bash(curl:*)"],
        deny: ["Read(./secrets)"],
        additionalDirectories: ["/etc"],
      },
      statusLine: { type: "command", command: "/usr/local/bin/ambient-statusline" },
    });
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    // Exactly the inherited mode, and the door's own statusline.
    expect(plan.settings).toEqual({
      statusLine: { type: "command", command: expect.stringContaining("statusline.mjs") },
      permissions: { defaultMode: "acceptEdits" },
    });
    expect(JSON.stringify(plan.settings)).not.toContain("curl evil");
    expect(JSON.stringify(plan.settings)).not.toContain("sk-not-real");
    expect(JSON.stringify(plan.env)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("an explicit SAFER mode wins over an inherited bypass", () => {
    configureUserSettings({ dangerouslySkipPermissions: true });
    const { code, out } = captureStdout(() => run(["--print", "--permission-mode", "manual"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.argv).toContain("manual");
    // The inherited bypass is not smuggled in alongside it — the explicit
    // selection suppressed inheritance entirely.
    expect(plan.argv).not.toContain("--dangerously-skip-permissions");
    expect(plan.settings).not.toHaveProperty("permissions");
    expect(plan.permissionDisclosure).toBeNull();
  });

  it("an explicit bypass flag wins over an inherited non-bypass mode", () => {
    configureUserSettings({ permissions: { defaultMode: "manual" } });
    const { code, out } = captureStdout(() => run(["--print", "--dangerously-skip-permissions"]));
    const plan = JSON.parse(out);
    expect(code).toBe(0);
    expect(plan.settings).not.toHaveProperty("permissions");
    expect(plan.argv.filter((a: string) => a === "--dangerously-skip-permissions")).toHaveLength(1);
  });

  it("--allow-dangerously-skip-permissions alone does not activate bypass", () => {
    configureUserSettings({ permissions: { defaultMode: "acceptEdits" } });
    const { code, out } = captureStdout(() => run(["--print", "--allow-dangerously-skip-permissions"]));
    const plan = JSON.parse(out);
    expect(code).toBe(0);
    expect(plan.argv.filter((a: string) => a === "--dangerously-skip-permissions")).toHaveLength(0);
    // Enablement did not suppress inheritance either.
    expect(plan.settings).toMatchObject({ permissions: { defaultMode: "acceptEdits" } });
  });

  it("native reads nothing: claude's own settings precedence is left alone", () => {
    configureUserSettings({ permissions: { defaultMode: "bypassPermissions" } });
    const { code, out } = captureStdout(() => run(["--print", "--posture", "native"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.settings).not.toHaveProperty("permissions");
    expect(plan.argv).not.toContain("--dangerously-skip-permissions");
    expect(plan.argv.join(" ")).not.toMatch(/--setting-sources/);
  });

  it("a bad mode value is exit 2 with no session dir created and nothing spawned", () => {
    // Same shape as the child-process case below, but without a sandbox: diff
    // the sets rather than counting, so an unrelated concurrent session dir
    // cannot fail this case.
    const before = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("claude-zero-")));
    const { code, err } = captureStderr(() => run(["--permission-mode"]));
    expect(code).toBe(2);
    expect(err).toContain("--permission-mode needs a mode value");
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith("claude-zero-"));
    expect(after.filter((n) => !before.has(n))).toEqual([]);
  });

  it("an uninterpretable settings file is exit 2 with a clear, path-free diagnostic", () => {
    writeFileSync(join(isolatedConfigDir, "settings.json"), '{ "permissions": { "defaultMode": "yolo" } }');
    const { code, err } = captureStderr(() => run(["--print"]));
    expect(code).toBe(2);
    expect(err).toContain('permissions.defaultMode is "yolo"');
    expect(err).not.toContain(isolatedConfigDir);
    // An explicit flag is the documented way past it.
    const { code: ok, out } = captureStdout(() => run(["--print", "--permission-mode", "plan"]));
    expect(ok).toBe(0);
    expect(JSON.parse(out).argv).toContain("plan");
  });

  it("a config path that exists but cannot be read is exit 2, not a quiet default", () => {
    // Review finding (worker-luna-xhigh): ENOTDIR — a CLAUDE_CONFIG_DIR (or
    // ~/.claude) that is a regular FILE — used to read as "not configured",
    // which is the silent fallback #144 is about.
    const fileConfigDir = join(isolatedConfigDir, "..", `cz144-not-a-dir-${process.pid}`);
    writeFileSync(fileConfigDir, "regular file, not a directory");
    try {
      const { code, err } = captureStderr(() => run(["--print"], { configDir: fileConfigDir }));
      expect(code).toBe(2);
      expect(err).toContain("could not read your Claude settings.json (ENOTDIR)");
      expect(err).toContain("--permission-mode");
      expect(err).not.toContain(fileConfigDir);
      // An explicit permission flag answers the question, so the broken path is
      // never read and the launch proceeds.
      const { code: ok, out } = captureStdout(() =>
        run(["--print", "--permission-mode", "plan"], { configDir: fileConfigDir }),
      );
      expect(ok).toBe(0);
      expect(JSON.parse(out).argv).toContain("plan");
    } finally {
      rmSync(fileConfigDir, { force: true });
    }
  });

  it("inherits the configured mode even when the tail is long and permission-free", () => {
    configureUserSettings({ permissions: { defaultMode: "manual" } });
    const { code, out } = captureStdout(() =>
      run(["--print", "--", "--model", "haiku", "--add-dir", "/tmp", "explain this file"]),
    );
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.settings).toMatchObject({ permissions: { defaultMode: "manual" } });
    expect(plan.argv.slice(-5)).toEqual(["--model", "haiku", "--add-dir", "/tmp", "explain this file"]);
  });

  it("help documents the permission options and the -- passthrough", () => {
    const { code, out } = captureStdout(() => run(["--help"]));
    expect(code).toBe(0);
    expect(out).toContain("--dangerously-skip-permissions");
    expect(out).toContain("--permission-mode");
    expect(out).toContain("--allow-dangerously-skip-permissions");
    expect(out).toContain("[-- <claude args...>]");
    expect(out).toMatch(/wins over the mode configured in your Claude\s+settings/);
  });
});

// Issue #144, step 8's integration case: the plan is only meaningful if the
// ARGUMENT VECTOR and the SESSION SETTINGS FILE are what the child actually
// receives. There is no real claude here — a synthetic executable named `claude`
// records its argv and the `--settings` file it was handed, then exits. This is
// the closest a unit test gets to the host signal in PROBE.md.
describe("run — what the child process actually receives (#144)", () => {
  let binDir: string;
  let capturePath: string;
  let priorPath: string | undefined;
  let priorConfigDir: string | undefined;
  let priorTmpDir: string | undefined;
  let sandboxTmp: string;
  let isolatedConfigDir: string;

  interface Capture {
    argv: string[];
    settingsPath: string;
    settings: unknown;
  }
  const capture = (): Capture => JSON.parse(readFileSync(capturePath, "utf-8"));

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), "cz144-bin-"));
    capturePath = join(binDir, "capture.json");
    isolatedConfigDir = mkdtempSync(join(tmpdir(), "cz144-cfg-"));
    // An isolated TMPDIR, so "the session dir is gone" is an assertion about THIS
    // run and not about whatever else is running on the machine.
    sandboxTmp = mkdtempSync(join(tmpdir(), "cz144-tmp-"));
    const fake = join(binDir, "claude");
    writeFileSync(
      fake,
      [
        "#!/usr/bin/env node",
        "import { readFileSync, writeFileSync } from 'node:fs';",
        "const argv = process.argv.slice(2);",
        "const settingsPath = argv[argv.indexOf('--settings') + 1];",
        "writeFileSync(process.env.CZ_CAPTURE, JSON.stringify({",
        "  argv,",
        "  settingsPath,",
        "  settings: JSON.parse(readFileSync(settingsPath, 'utf-8')),",
        "}));",
        `process.exit(Number(process.env.CZ_CHILD_EXIT ?? '0'));`,
      ].join("\n"),
    );
    chmodSync(fake, 0o755);
    priorPath = process.env.PATH;
    process.env.PATH = `${binDir}:${priorPath ?? ""}`;
    process.env.CZ_CAPTURE = capturePath;
    priorConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir;
    priorTmpDir = process.env.TMPDIR;
    process.env.TMPDIR = sandboxTmp;
  });

  afterEach(() => {
    process.env.PATH = priorPath ?? "";
    process.env.CLAUDE_CONFIG_DIR = priorConfigDir ?? "";
    delete process.env.CZ_CAPTURE;
    delete process.env.CZ_CHILD_EXIT;
    if (priorTmpDir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = priorTmpDir;
    rmSync(binDir, { recursive: true, force: true });
    rmSync(isolatedConfigDir, { recursive: true, force: true });
    rmSync(sandboxTmp, { recursive: true, force: true });
  });

  it("delivers a configured permission mode in the session settings file", () => {
    writeFileSync(
      join(isolatedConfigDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "acceptEdits" }, hooks: { x: 1 } }),
    );
    const { code, err } = captureStderr(() => run([]));
    expect(code).toBe(0);
    // The user is told, on the CLI's own terminal, before the session exists.
    expect(err).toContain("permissions.defaultMode");
    const child = capture();
    expect(child.settings).toEqual({
      statusLine: { type: "command", command: expect.stringContaining("statusline.mjs") },
      permissions: { defaultMode: "acceptEdits" },
    });
    // The clean room reached the child too, and no flag duplicated the mode.
    expect(child.argv).toContain("--setting-sources");
    expect(child.argv).not.toContain("--permission-mode");
  });

  it("delivers the compatibility bypass as a real flag on the child's argv", () => {
    writeFileSync(join(isolatedConfigDir, "settings.json"), JSON.stringify({ dangerouslySkipPermissions: true }));
    const { code } = captureStderr(() => run([]));
    expect(code).toBe(0);
    const child = capture();
    expect(child.argv.filter((a) => a === "--dangerously-skip-permissions")).toHaveLength(1);
    expect(child.settings).not.toHaveProperty("permissions");
    // The flag sits after the session --settings and before nothing invented.
    expect(child.argv[child.argv.indexOf("--dangerously-skip-permissions")]).toBe(
      "--dangerously-skip-permissions",
    );
  });

  it("delivers explicit flags untouched and removes the temp session dir afterwards", () => {
    const { code } = captureStderr(() => run(["--", "--dangerously-skip-permissions", "--model", "haiku"]));
    expect(code).toBe(0);
    const child = capture();
    expect(child.argv.slice(-3)).toEqual(["--dangerously-skip-permissions", "--model", "haiku"]);
    // P3: the session dir is disposable and gone once claude exits.
    expect(existsSyncSafe(child.settingsPath)).toBe(false);
    expect(readdirSync(sandboxTmp).filter((n) => n.startsWith("claude-zero-"))).toEqual([]);
  });

  it("cleans up after a FAILING child too, and propagates its exit code", () => {
    process.env.CZ_CHILD_EXIT = "3";
    const { code } = captureStderr(() => run([]));
    expect(code).toBe(3);
    const child = capture();
    expect(existsSyncSafe(child.settingsPath)).toBe(false);
  });

  it("refuses a bad mode value before any session dir exists", () => {
    const { code, err } = captureStderr(() => run(["--permission-mode", "--print"]));
    expect(code).toBe(2);
    expect(err).toContain("--permission-mode needs a mode value");
    // No child ran at all: nothing was captured.
    expect(existsSyncSafe(capturePath)).toBe(false);
    expect(readdirSync(sandboxTmp).filter((n) => n.startsWith("claude-zero-"))).toEqual([]);
  });
});

function existsSyncSafe(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

// KC6 (Issue #12): a refusal must say which of two unlike things it is —
// withheld by policy (a key exists, could turn) or harness-incapable (no key
// exists at all). The Hell-lane refusal already reads as policy ("gated
// (P2)"); the floor refusal must read as the OTHER class, explicitly, not
// just as a bare "not launchable" that a reader could mistake for either.
describe("refusal honesty (KC6)", () => {
  it("marks the floor refusal as harness-incapable, not policy — and cites F6", () => {
    const { code, err } = captureStderr(() => run(["--posture", "floor"]));
    expect(code).toBe(2);
    expect(err).toContain("not a policy hold");
    expect(err).toContain("F6");
    expect(err).toContain("no door to open at this posture");
  });

  it("does not claim the F6/harness-incapable framing for a plain unknown posture", () => {
    // "nonsense" is not core-known at all — a different, un-classed failure
    // (bad input), not a claim about capability or policy.
    const { code, err } = captureStderr(() => run(["--posture", "nonsense"]));
    expect(code).toBe(2);
    expect(err).toContain('unknown --posture "nonsense"');
    expect(err).not.toContain("F6");
    expect(err).not.toContain("policy hold");
  });

  it("distinguishes Hell routing from the floor's harness limitation", () => {
    const hell = captureStderr(() => run(["--level", "max"])).err;
    const floor = captureStderr(() => run(["--posture", "floor"])).err;
    expect(hell).toContain("live summon rung");
    expect(hell).toContain("/skill-hell max");
    expect(hell).not.toMatch(/policy|P2|gated/i);
    expect(floor).toContain("not a policy hold");
    expect(floor).toContain("F6");
  });

  it("prints the curated door-absence disclosure to stderr before the process could ever spawn claude, and --print carries it in notes instead", () => {
    // A real (non---print) curated launch is NOT exercised here — it would
    // spawn a real `claude` process with stdio: "inherit", which is unsafe to
    // run from an automated test. Instead this pins the SOURCE shape: the
    // disclosure constant is referenced, and it appears before the spawnSync
    // call, so the message is guaranteed to reach the user's terminal while
    // the door still exists to print it (KC6) — and --print's JSON exposes
    // the same fact through `notes`, checked below without spawning anything.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts"), "utf-8");
    const noteRefIdx = src.indexOf("CURATED_DOOR_ABSENCE_NOTE");
    const spawnIdx = src.indexOf("spawnSync(live.command");
    expect(noteRefIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);
    expect(noteRefIdx, "disclosure must be printed before claude could spawn").toBeLessThan(spawnIdx);

    const { code, out } = captureStdout(() =>
      run(["--print", "--posture", "curated", "--skill", FIXTURE]),
    );
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.notes.join(" ")).toContain(CURATED_DOOR_ABSENCE_NOTE);
  });

  it("carries no curated door-absence note for postures where the door is not at stake", () => {
    const { out: nativeOut } = captureStdout(() => run(["--print"]));
    expect(JSON.parse(nativeOut).notes.join(" ")).not.toContain("does not exist inside this curated session");

    const { out: floorOut } = captureStdout(() => run(["--print", "--posture", "product-floor"]));
    expect(JSON.parse(floorOut).notes.join(" ")).not.toContain("does not exist inside this curated session");
  });
});
