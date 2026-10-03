// Issue #144 — the narrow permission-intent contract, unit-level.
//
// Everything here is a THROWAWAY FIXTURE. No test reads the developer's real
// `~/.claude`, and none launches claude: the behavioural evidence is the pinned
// probe in ../../PROBE.md (6 cells on 2.1.288), and these tests pin the
// decisions that probe licenses.
//
// The contract under test, in one line: a permission MODE configured in the
// user's own settings must survive claude-zero's clean room, and NOTHING else
// from that file may.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLI_PERMISSION_MODES,
  explicitPermissionSelection,
  NATIVE_NO_INHERITANCE_NOTE,
  readUserPermissionIntent,
  resolveLaunchPermissions,
  SETTINGS_PERMISSION_MODES,
  userSettingsPath,
} from "../src/permissions.js";

let root: string;
let configDir: string;
let home: string;

function writeSettings(settings: unknown): void {
  writeFileSync(join(configDir, "settings.json"), JSON.stringify(settings, null, 2));
}

function writeRaw(text: string): void {
  writeFileSync(join(configDir, "settings.json"), text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cz144-perm-"));
  configDir = join(root, "config");
  // `home` is the HOME DIRECTORY (the reader appends `.claude` itself), created
  // so `join(home, ".claude", "settings.json")` is a real path whose absence
  // reads as "not configured" (ENOENT), not as a broken path.
  home = join(root, "home");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readUserPermissionIntent — the only user file the door reads", () => {
  it("an absent settings file is NORMAL: no permission intent, no error", () => {
    expect(readUserPermissionIntent({ configDir })).toEqual({ bypass: false });
  });

  it("an absent config root and an absent home both read as unconfigured", () => {
    expect(readUserPermissionIntent({ configDir: join(root, "nope") })).toEqual({ bypass: false });
    expect(readUserPermissionIntent({ home: join(root, "nope-home") })).toEqual({ bypass: false });
  });

  it("prefers an explicit config root over home (CLAUDE_CONFIG_DIR wins)", () => {
    writeSettings({ permissions: { defaultMode: "plan" } });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ permissions: { defaultMode: "auto" } }));
    expect(readUserPermissionIntent({ configDir, home }).mode).toBe("plan");
    // …and the home-sourced read alone sees the other value
    expect(readUserPermissionIntent({ home }).mode).toBe("auto");
    expect(userSettingsPath({ configDir })).toBe(join(configDir, "settings.json"));
    expect(userSettingsPath({ home })).toBe(join(home, ".claude", "settings.json"));
  });

  it("admits the canonical permissions.defaultMode for every probed mode", () => {
    for (const mode of SETTINGS_PERMISSION_MODES) {
      writeSettings({ permissions: { defaultMode: mode } });
      expect(readUserPermissionIntent({ configDir }), mode).toEqual({
        mode,
        bypass: false,
        modeKey: "permissions.defaultMode",
      });
    }
  });

  it("`default` is a SETTINGS mode but not a --permission-mode choice", () => {
    // The two enums are not the same set, and the difference is why the reader
    // and the flag path validate against different lists.
    expect(SETTINGS_PERMISSION_MODES).toContain("default");
    expect(CLI_PERMISSION_MODES as readonly string[]).not.toContain("default");
  });

  it("treats a null permissions block as absence, not corruption", () => {
    writeSettings({ permissions: null });
    expect(readUserPermissionIntent({ configDir })).toEqual({ bypass: false });
  });

  it("ignores settings with no permission key at all", () => {
    writeSettings({ model: "opus", hooks: {}, permissions: { allow: ["Bash(ls:*)"] } });
    expect(readUserPermissionIntent({ configDir })).toEqual({ bypass: false });
  });
});

describe("readUserPermissionIntent — the issue-reported compatibility keys", () => {
  it("accepts a root permissionMode as a mode source", () => {
    writeSettings({ permissionMode: "acceptEdits" });
    expect(readUserPermissionIntent({ configDir })).toEqual({
      mode: "acceptEdits",
      bypass: false,
      modeKey: "permissionMode",
    });
  });

  it("dangerouslySkipPermissions: true is explicit bypass intent; false grants nothing", () => {
    writeSettings({ dangerouslySkipPermissions: true });
    expect(readUserPermissionIntent({ configDir })).toEqual({
      bypass: true,
      bypassKey: "dangerouslySkipPermissions",
    });
    writeSettings({ dangerouslySkipPermissions: false });
    expect(readUserPermissionIntent({ configDir })).toEqual({ bypass: false });
  });

  it("rejects a non-boolean dangerouslySkipPermissions instead of guessing", () => {
    for (const value of ["true", 1, null, {}]) {
      writeSettings({ dangerouslySkipPermissions: value });
      expect(() => readUserPermissionIntent({ configDir }), String(value)).toThrow(
        /dangerouslySkipPermissions" in your Claude settings\.json must be a boolean/,
      );
    }
  });

  it("rejects a non-object permissions block rather than reading through it", () => {
    writeSettings({ permissions: "bypass" });
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/must be an object/);
    writeSettings({ permissions: ["defaultMode"] });
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/must be an object/);
  });
});

describe("readUserPermissionIntent — refusals (a silent fallback is the bug)", () => {
  it("rejects an unsupported mode, names the supported set, and leaks neither path nor content", () => {
    writeSettings({ permissions: { defaultMode: "yolo" }, model: "opus-secret-model" });
    let message = "";
    try {
      readUserPermissionIntent({ configDir });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('permissions.defaultMode is "yolo"');
    expect(message).toContain("does not support");
    for (const mode of SETTINGS_PERMISSION_MODES) expect(message).toContain(mode);
    expect(message).toContain("--permission-mode");
    expect(message).not.toContain(configDir);
    expect(message).not.toContain("opus-secret-model");
  });

  it("rejects a non-string mode", () => {
    for (const value of [true, 3, null, ["plan"]]) {
      writeSettings({ permissions: { defaultMode: value } });
      expect(() => readUserPermissionIntent({ configDir }), JSON.stringify(value)).toThrow(
        /must be a permission mode string/,
      );
    }
  });

  it("rejects malformed JSON WITHOUT echoing the fragment node quotes back", () => {
    // Node's JSON.parse message embeds a slice of the input; the door must not
    // put that on the user's terminal.
    writeRaw('{ "model": "sekrit-value", oops }');
    let message = "";
    try {
      readUserPermissionIntent({ configDir });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("not valid JSON");
    expect(message).toContain("Refusing to guess a permission mode");
    expect(message).not.toContain("sekrit-value");
    expect(message).not.toContain(configDir);
  });

  it("rejects a settings file that is not a JSON object", () => {
    writeRaw("[]");
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/not a JSON object/);
    writeRaw('"just a string"');
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/not a JSON object/);
  });

  it("refuses to pick between two modes the user configured at once", () => {
    writeSettings({ permissions: { defaultMode: "acceptEdits" }, permissionMode: "plan" });
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/disagree with themselves/);
    // agreeing is not a conflict
    writeSettings({ permissions: { defaultMode: "plan" }, permissionMode: "plan" });
    expect(readUserPermissionIntent({ configDir }).mode).toBe("plan");
  });

  it("refuses to reconcile boolean bypass with a non-bypass mode", () => {
    writeSettings({ permissions: { defaultMode: "acceptEdits" }, dangerouslySkipPermissions: true });
    expect(() => readUserPermissionIntent({ configDir })).toThrow(/disagree with themselves/);
    // bypass + the matching mode is not a conflict
    writeSettings({ permissions: { defaultMode: "bypassPermissions" }, dangerouslySkipPermissions: true });
    expect(readUserPermissionIntent({ configDir })).toEqual({
      mode: "bypassPermissions",
      bypass: true,
      modeKey: "permissions.defaultMode",
      bypassKey: "dangerouslySkipPermissions",
    });
  });

  it("refuses an unreadable settings file rather than treating it as unconfigured", () => {
    // A settings.json that is a DIRECTORY: exists, and cannot be read. This is
    // not "unset", so it must not silently launch in claude's default mode.
    mkdirSync(join(configDir, "settings.json"), { recursive: true });
    let message = "";
    try {
      readUserPermissionIntent({ configDir });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/could not read your Claude settings\.json/);
    expect(message).toContain("--permission-mode");
    expect(message).not.toContain(configDir);
  });
});

describe("explicitPermissionSelection — option POSITIONS, not substrings", () => {
  it("finds the bypass flag and the mode in both spellings", () => {
    expect(explicitPermissionSelection(["--dangerously-skip-permissions"])).toEqual({
      bypass: true,
      allowBypass: false,
    });
    expect(explicitPermissionSelection(["--permission-mode", "plan"]).mode).toBe("plan");
    expect(explicitPermissionSelection(["--permission-mode=acceptEdits"]).mode).toBe("acceptEdits");
    expect(explicitPermissionSelection(["--allow-dangerously-skip-permissions"])).toEqual({
      bypass: false,
      allowBypass: true,
    });
  });

  it("does NOT mistake a prompt value for a flag", () => {
    // The failure mode the issue's own prose invites.
    expect(explicitPermissionSelection(["-p", "use --dangerously-skip-permissions"]).bypass).toBe(false);
    expect(explicitPermissionSelection(["--print", "please run --permission-mode bypassPermissions"]).mode)
      .toBeUndefined();
    expect(
      explicitPermissionSelection(["--model", "haiku", "--dangerously-skip-permissions"]).bypass,
    ).toBe(true);
  });

  it("knows which options consume the next token", () => {
    for (const opt of ["--settings", "--mcp-config", "--model", "--permission-prompts"]) {
      expect(
        explicitPermissionSelection([opt, "--dangerously-skip-permissions"]).bypass,
        opt,
      ).toBe(false);
    }
  });

  it("stops at a literal -- : claude's own tail is not ours to interpret", () => {
    expect(explicitPermissionSelection(["--", "--dangerously-skip-permissions"]).bypass).toBe(false);
    expect(explicitPermissionSelection(["foo", "--", "--permission-mode", "plan"]).mode).toBeUndefined();
    // …but a real flag BEFORE the delimiter still counts
    expect(explicitPermissionSelection(["--dangerously-skip-permissions", "--", "x"]).bypass).toBe(true);
  });

  it("ignores a mode value that is itself an option (cli.ts refuses it earlier)", () => {
    expect(explicitPermissionSelection(["--permission-mode", "--print"]).mode).toBeUndefined();
  });
});

describe("resolveLaunchPermissions", () => {
  it("native is claude untouched: no read, no flag, no disclosure", () => {
    // A malformed settings file must not even be consulted at native.
    writeRaw("{ not json");
    const r = resolveLaunchPermissions({ posture: "native", configDir, home });
    expect(r).toEqual({ source: "default", argv: [], notes: [NATIVE_NO_INHERITANCE_NOTE] });
  });

  it("nothing configured means NOTHING is injected — claude keeps its own default", () => {
    const r = resolveLaunchPermissions({ posture: "product-floor", configDir, home });
    expect(r.source).toBe("default");
    expect(r.argv).toEqual([]);
    expect(r.settingsMode).toBeUndefined();
    expect(r.disclosure).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/carry no permission mode/);
  });

  it("a configured mode rides the session settings channel, not argv", () => {
    writeSettings({ permissions: { defaultMode: "bypassPermissions" } });
    const r = resolveLaunchPermissions({ posture: "product-floor", configDir, home });
    expect(r.source).toBe("user-settings");
    expect(r.settingsMode).toBe("bypassPermissions");
    // Probe cell D: the settings channel alone carries a bypass correctly, so
    // the flag is NOT also added — two channels saying the same thing is how a
    // door starts lying about what it composed.
    expect(r.argv).toEqual([]);
    expect(r.notes.join(" ")).toContain('permissions.defaultMode="bypassPermissions"');
    expect(r.notes.join(" ")).toContain("Nothing else from your settings was imported");
    expect(r.disclosure).toBeTruthy();
  });

  it("a compatibility mode is disclosed as a compatibility input, not as claude's schema", () => {
    writeSettings({ permissionMode: "acceptEdits" });
    const r = resolveLaunchPermissions({ posture: "curated", configDir, home });
    expect(r.settingsMode).toBe("acceptEdits");
    expect(r.notes.join(" ")).toContain("via permissionMode");
  });

  it("boolean bypass intent emits the real bypass flag and says where it came from", () => {
    writeSettings({ dangerouslySkipPermissions: true });
    const r = resolveLaunchPermissions({ posture: "product-floor", configDir, home });
    expect(r.source).toBe("user-settings");
    expect(r.argv).toEqual(["--dangerously-skip-permissions"]);
    expect(r.settingsMode).toBeUndefined();
    expect(r.notes.join(" ")).toContain("dangerouslySkipPermissions=true");
    // The door must not auto-acknowledge the bypass prompt — that is the user's
    // safeguard, not ours to pre-grant.
    expect(r.notes.join(" ")).toContain("skipDangerousModePermissionPrompt");
  });

  it("an explicit flag WINS over inheritance, including a SAFER mode over a bypass", () => {
    writeSettings({ dangerouslySkipPermissions: true });
    const r = resolveLaunchPermissions({
      posture: "product-floor",
      configDir,
      home,
      claudeArgs: ["--permission-mode", "manual"],
    });
    expect(r.source).toBe("cli");
    expect(r.settingsMode).toBeUndefined();
    expect(r.argv).toEqual([]); // never duplicate the user's own flag
    expect(r.notes.join(" ")).toContain("wins over the permission mode configured");
  });

  it("an explicit flag skips the inheritance read entirely, errors included", () => {
    writeRaw("{ broken");
    const r = resolveLaunchPermissions({
      posture: "product-floor",
      configDir,
      home,
      claudeArgs: ["--dangerously-skip-permissions"],
    });
    expect(r.source).toBe("cli");
    expect(r.argv).toEqual([]);
  });

  it("--allow-dangerously-skip-permissions alone is enablement, not bypass", () => {
    writeSettings({ permissions: { defaultMode: "acceptEdits" } });
    const r = resolveLaunchPermissions({
      posture: "product-floor",
      configDir,
      home,
      claudeArgs: ["--allow-dangerously-skip-permissions"],
    });
    // It did not select a permission mode, so inheritance still stands…
    expect(r.source).toBe("user-settings");
    expect(r.settingsMode).toBe("acceptEdits");
    expect(r.argv).toEqual([]); // …and it was never promoted to the bypass flag.
    expect(r.notes.join(" ")).toContain("only makes bypass AVAILABLE");
  });

  it("a conflict in the user's own settings fails loudly instead of picking one", () => {
    writeSettings({ permissions: { defaultMode: "acceptEdits" }, permissionMode: "plan" });
    expect(() =>
      resolveLaunchPermissions({ posture: "product-floor", configDir, home }),
    ).toThrow(/disagree with themselves/);
    // …and an explicit flag is the documented way out.
    expect(
      resolveLaunchPermissions({
        posture: "product-floor",
        configDir,
        home,
        claudeArgs: ["--permission-mode", "plan"],
      }).source,
    ).toBe("cli");
  });
});