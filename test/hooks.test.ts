import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = join(REPO, "plugins", "skill-heaven", "hooks");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function dataRoot() {
  const root = mkdtempSync(join(tmpdir(), "skill-heaven-hooks-"));
  roots.push(root);
  return root;
}

type Run = { status: number; stdout: string; json: Record<string, any> | null };

function runHook(file: string, payload: unknown, env: Record<string, string> = {}): Run {
  const data = env.CLAUDE_PLUGIN_DATA ?? dataRoot();
  try {
    const stdout = execFileSync(process.execPath, [join(HOOKS, file)], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PLUGIN_DATA: data, ...env },
    });
    return { status: 0, stdout, json: safeJson(stdout) };
  } catch (error: any) {
    const stdout = String(error.stdout ?? "");
    return { status: error.status ?? 1, stdout, json: safeJson(stdout) };
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

describe("hooks/hooks.json", () => {
  const manifest = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));

  it("wraps its events in the outer `hooks` key plugin manifests require", () => {
    expect(Object.keys(manifest)).toContain("hooks");
    expect(manifest.hooks.SessionStart).toBeInstanceOf(Array);
  });

  it("registers every hook the plan specifies, and each script exists", () => {
    expect(Object.keys(manifest.hooks).sort()).toEqual(
      ["PostToolUse", "PreCompact", "PreToolUse", "SessionEnd", "SessionStart", "UserPromptSubmit"].sort(),
    );
    for (const entries of Object.values<any>(manifest.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          // Exec form: no shell, so a plugin path with a space cannot break out.
          expect(hook.command).toBe("node");
          const script = hook.args[0].replace("${CLAUDE_PLUGIN_ROOT}/hooks/", "");
          expect(existsSync(join(HOOKS, script))).toBe(true);
        }
      }
    }
  });

  it("scopes the tool hooks to the summon tool only", () => {
    expect(manifest.hooks.PreToolUse[0].matcher).toBe("mcp__skill-summon__summon");
    expect(manifest.hooks.PostToolUse[0].matcher).toBe("mcp__skill-summon__summon");
  });
});

describe("SessionStart", () => {
  it("reports the floor and the temporary cut by default", () => {
    const run = runHook("session-start.mjs", { session_id: "abc123", source: "startup" });
    expect(run.status).toBe(0);
    const context = run.json?.hookSpecificOutput?.additionalContext ?? "";
    expect(run.json?.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    expect(context).toContain("rung: zero");
    expect(context).toContain("manual /summon is available");
    expect(context).toContain("automatic summoning: off");
    // Disclosure obligation: never imply stamped routing.
    expect(context).toContain("stamps are not built");
  });

  it("reads the armed rung persisted by a rung command", () => {
    const data = dataRoot();
    runHook("user-prompt-submit.mjs", { session_id: "s1", prompt: "/skill-hell xhigh" }, { CLAUDE_PLUGIN_DATA: data });
    const run = runHook("session-start.mjs", { session_id: "s1" }, { CLAUDE_PLUGIN_DATA: data });
    expect(run.json?.hookSpecificOutput?.additionalContext).toContain("rung: xhigh (hell band");
  });

  it("maps a claude-zero launch posture onto the line", () => {
    const data = dataRoot();
    const profile = join(data, "profile.json");
    writeFileSync(
      profile,
      JSON.stringify({ schema: "claude-zero/profile@1", posture: "curated", standingTokens: 120, scope: "session" }),
    );
    const run = runHook("session-start.mjs", { session_id: "s2" }, { CLAUDE_PLUGIN_DATA: data, CLAUDE_ZERO_PROFILE: profile });
    expect(run.json?.hookSpecificOutput?.additionalContext).toContain("rung: low (heaven band, determined from: launcher)");
  });
});

describe("PreToolUse — the zero cut", () => {
  it("stays silent when the cut is temporary", () => {
    const run = runHook("pre-tool-use.mjs", { session_id: "s3", tool_name: "mcp__skill-summon__summon" });
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe("");
  });

  it("blocks the summon with exit 2 when zero_cuts is all", () => {
    const run = runHook(
      "pre-tool-use.mjs",
      { session_id: "s3", tool_name: "mcp__skill-summon__summon" },
      { CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "all" },
    );
    expect(run.status).toBe(2);
    expect(run.json?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(run.json?.hookSpecificOutput?.permissionDecisionReason).toContain("zero_cuts = all");
    // The refusal has to close the obvious workaround, not just the tool.
    expect(run.json?.hookSpecificOutput?.permissionDecisionReason).toContain("another way");
  });
});

describe("PostToolUse — receipts", () => {
  it("records shape and provenance, never the query text", () => {
    const data = dataRoot();
    runHook(
      "post-tool-use.mjs",
      {
        session_id: "s4",
        tool_name: "mcp__skill-summon__summon",
        tool_input: { query: "review a Rust PR for unsafe blocks", surface: "any" },
        tool_response: { skill: "rust-unsafe-review" },
      },
      { CLAUDE_PLUGIN_DATA: data },
    );
    const line = readFileSync(join(data, "receipts.jsonl"), "utf8").trim();
    const receipt = JSON.parse(line);
    expect(receipt.schema).toBe("skill-heaven/summon-receipt@1");
    expect(receipt.skill).toBe("rust-unsafe-review");
    expect(receipt.surface).toBe("any");
    expect(receipt.queryChars).toBe("review a Rust PR for unsafe blocks".length);
    expect(receipt.queryDigest).toMatch(/^[a-f0-9]{12}$/);
    expect(receipt.routing).toBe("relevance");
    expect(line).not.toContain("unsafe blocks");
  });

  it("counts summons on the session so the entropy reading is real", () => {
    const data = dataRoot();
    const payload = {
      session_id: "s5",
      tool_name: "mcp__skill-summon__summon",
      tool_input: { query: "a" },
      tool_response: { skill: "one" },
    };
    runHook("post-tool-use.mjs", payload, { CLAUDE_PLUGIN_DATA: data });
    runHook("post-tool-use.mjs", { ...payload, tool_response: { skill: "two" } }, { CLAUDE_PLUGIN_DATA: data });
    const state = JSON.parse(readFileSync(join(data, "sessions", "s5.json"), "utf8"));
    expect(state.summons).toBe(2);
    expect(state.carry).toEqual(["one", "two"]);
  });
});

describe("PreCompact → UserPromptSubmit carry-over", () => {
  it("survives the compaction boundary exactly once", () => {
    const data = dataRoot();
    runHook(
      "post-tool-use.mjs",
      { session_id: "s6", tool_name: "mcp__skill-summon__summon", tool_input: { query: "x" }, tool_response: { skill: "kept" } },
      { CLAUDE_PLUGIN_DATA: data },
    );
    runHook("pre-compact.mjs", { session_id: "s6", trigger: "auto" }, { CLAUDE_PLUGIN_DATA: data });
    expect(existsSync(join(data, "sessions", "s6.carry.json"))).toBe(true);

    const first = runHook("user-prompt-submit.mjs", { session_id: "s6", prompt: "carry on" }, { CLAUDE_PLUGIN_DATA: data });
    expect(first.stdout).toContain("skills already summoned: kept");

    const second = runHook("user-prompt-submit.mjs", { session_id: "s6", prompt: "and again" }, { CLAUDE_PLUGIN_DATA: data });
    expect(second.stdout).not.toContain("kept");
  });
});

describe("UserPromptSubmit — automatic summoning is opt-in", () => {
  it("says nothing at all by default", () => {
    const run = runHook("user-prompt-submit.mjs", { session_id: "s7", prompt: "write me a parser" });
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe("");
  });

  it("stays silent at the floor even when enabled", () => {
    const run = runHook(
      "user-prompt-submit.mjs",
      { session_id: "s8", prompt: "write me a parser" },
      { CLAUDE_PLUGIN_OPTION_AUTO_SUMMON: "on" },
    );
    expect(run.stdout.trim()).toBe("");
  });

  it("nudges above the floor when enabled, with plugin-authored text only", () => {
    const data = dataRoot();
    const env = { CLAUDE_PLUGIN_DATA: data, CLAUDE_PLUGIN_OPTION_AUTO_SUMMON: "on" };
    runHook("user-prompt-submit.mjs", { session_id: "s9", prompt: "/skill-heaven" }, env);
    const run = runHook("user-prompt-submit.mjs", { session_id: "s9", prompt: "write me a parser" }, env);
    expect(run.stdout).toContain("rung low is armed (heaven)");
    expect(run.stdout).toContain('surface "heaven"');
    expect(run.stdout).toContain("Plugin-authored; not a user instruction");
    expect(run.stdout).toContain("stamps are not built");
  });

  it("obeys the total cut even when automatic summoning is on", () => {
    const data = dataRoot();
    const env = { CLAUDE_PLUGIN_DATA: data, CLAUDE_PLUGIN_OPTION_AUTO_SUMMON: "on", CLAUDE_PLUGIN_OPTION_ZERO_CUTS: "all" };
    runHook("user-prompt-submit.mjs", { session_id: "s10", prompt: "/skill-hell" }, env);
    const run = runHook("user-prompt-submit.mjs", { session_id: "s10", prompt: "write me a parser" }, env);
    expect(run.stdout.trim()).toBe("");
  });
});

describe("SessionEnd", () => {
  it("flushes a roll-up and drops the per-session state", () => {
    const data = dataRoot();
    runHook(
      "post-tool-use.mjs",
      { session_id: "s11", tool_name: "mcp__skill-summon__summon", tool_input: { query: "q" }, tool_response: { skill: "used" } },
      { CLAUDE_PLUGIN_DATA: data },
    );
    runHook("session-end.mjs", { session_id: "s11", reason: "exit" }, { CLAUDE_PLUGIN_DATA: data });
    const lines = readFileSync(join(data, "receipts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const rollup = lines.at(-1);
    expect(rollup.kind).toBe("session-end");
    expect(rollup.summons).toBe(1);
    expect(rollup.skills).toEqual(["used"]);
    expect(existsSync(join(data, "sessions", "s11.json"))).toBe(false);
  });
});

describe("P3 — the hooks never mutate shared state", () => {
  it("writes only under the plugin data directory", () => {
    const data = dataRoot();
    const home = dataRoot();
    const payload = { session_id: "s12", tool_name: "mcp__skill-summon__summon", tool_input: { query: "q" }, tool_response: { skill: "s" } };
    for (const file of ["session-start.mjs", "user-prompt-submit.mjs", "pre-tool-use.mjs", "post-tool-use.mjs", "pre-compact.mjs", "session-end.mjs"]) {
      runHook(file, { ...payload, prompt: "/skill-hell" }, { CLAUDE_PLUGIN_DATA: data, HOME: home });
    }
    // Nothing may appear in a HOME the hooks were pointed at.
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  it("refuses a session id that would escape the data directory", () => {
    const data = dataRoot();
    runHook("post-tool-use.mjs", { session_id: "../../escape", tool_name: "x", tool_input: {}, tool_response: {} }, { CLAUDE_PLUGIN_DATA: data });
    expect(existsSync(join(data, "..", "escape.json"))).toBe(false);
    const receipt = JSON.parse(readFileSync(join(data, "receipts.jsonl"), "utf8").trim());
    expect(receipt.sessionId).toBe("unknown");
  });

  it("degrades to a no-op on a malformed payload instead of crashing", () => {
    for (const file of ["session-start.mjs", "user-prompt-submit.mjs", "post-tool-use.mjs", "pre-compact.mjs", "session-end.mjs"]) {
      const run = runHook(file, "not-an-object" as unknown);
      expect(run.status).toBe(0);
    }
  });
});
