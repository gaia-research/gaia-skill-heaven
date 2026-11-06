// #123 — the optional SessionStart context line, Full install profile only.
//
// Static and dry-run checks. The lifecycle (install, reinstall, toggle, disable,
// uninstall) is recorded from real Claude Code sessions in
// docs/evidence/hooks-123/PROBE.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { tokenize } from "../packages/core/src/vendor/census-pure.js";
import { AUTHORITY_PHRASES } from "../plugins/skill-heaven/scripts/render-ladder.mjs";
import {
  CONTEXT_SOURCES,
  SESSION_CONTEXT_TEXT,
  sessionContextOutput,
} from "../plugins/skill-heaven-console/scripts/session-context.mjs";

const ROOT = join(import.meta.dirname, "..");
const CORE = join(ROOT, "plugins", "skill-heaven");
const CONSOLE = join(ROOT, "plugins", "skill-heaven-console");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as any;

describe("Core installs no hooks", () => {
  test("no hooks directory or hooks file at the Core plugin root", () => {
    expect(existsSync(join(CORE, "hooks"))).toBe(false);
    expect(existsSync(join(CORE, "hooks.json"))).toBe(false);
  });

  test("the Core manifest declares no hooks and no SessionStart integration", () => {
    for (const manifest of [join(CORE, ".claude-plugin", "plugin.json"), join(CORE, "plugin.json")]) {
      if (!existsSync(manifest)) continue;
      const m = json(manifest);
      expect(m.hooks, manifest).toBeUndefined();
      expect(m.modules, manifest).toBeUndefined();
      expect(JSON.stringify(m), manifest).not.toMatch(/SessionStart/);
    }
  });

  test("no Core command, skill or script file names a SessionStart hook", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(md|json|mjs|js|ts|sh)$/.test(entry.name) && /"SessionStart"\s*:/.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    walk(CORE);
    expect(hits).toEqual([]);
  });
});

describe("Full (console) SessionStart hook", () => {
  const hooks = json(join(CONSOLE, "hooks", "hooks.json"));

  test("is the only standard hook, a SessionStart command that stays beside the module", () => {
    expect(Object.keys(hooks.hooks)).toEqual(["SessionStart"]);
    expect(hooks.hooks.SessionStart).toHaveLength(1);
    expect(hooks.hooks.SessionStart[0].matcher).toBe("startup|clear");
    expect(hooks.hooks.SessionStart[0].hooks).toEqual([
      { type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/session-context.mjs"' },
    ]);
    expect(hooks.modules).toEqual(["./register.tsx"]);
    expect(existsSync(join(CONSOLE, "scripts", "session-context.mjs"))).toBe(true);
  });

  test("the toggle is a console userConfig, off by default", () => {
    const option = json(join(CONSOLE, ".claude-plugin", "plugin.json")).userConfig.session_context;
    expect(option.options).toEqual(["off", "on"]);
    expect(option.default).toBe("off");
  });

  test("the hook source reads and writes nothing but stdin and stdout", () => {
    const source = readFileSync(join(CONSOLE, "scripts", "session-context.mjs"), "utf8");
    expect(source).not.toMatch(/node:(fs|child_process|net|http|https|os)\b|fetch\(|writeFile|appendFile|\.claude/);
  });
});

describe("the context text", () => {
  test("is facts only: no authority phrase (#85/#169)", () => {
    const lower = SESSION_CONTEXT_TEXT.toLowerCase();
    for (const phrase of AUTHORITY_PHRASES) expect(lower, phrase).not.toContain(phrase.toLowerCase());
  });

  test("is not instruction-shaped, grants nothing and claims no rung", () => {
    expect(SESSION_CONTEXT_TEXT).not.toMatch(/\b(you must|you should|always|never|do not|don't|must|ignore|remember|please)\b/i);
    expect(SESSION_CONTEXT_TEXT).not.toMatch(/\b(permission|permitted|allowed|authori[sz]e|grant|stored|persist)/i);
    expect(SESSION_CONTEXT_TEXT).not.toMatch(/\b(zero|low|med|high|xhigh|max|ultra)\b/i);
    expect(SESSION_CONTEXT_TEXT).toContain("No rung has been selected in this session yet.");
    expect(SESSION_CONTEXT_TEXT).toContain("/summon");
    expect(SESSION_CONTEXT_TEXT).not.toContain("skill-heaven.dev");
  });

  test("is one short block: standing dose (chars4) stays under 60 tokens", () => {
    const tokens = tokenize(SESSION_CONTEXT_TEXT);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(60);
  });
});

describe("the hook output", () => {
  test("emits nothing unless the option is exactly on", () => {
    for (const option of [undefined, "", "off", "ON", "true", "compact"]) {
      expect(sessionContextOutput(option, "startup"), String(option)).toBe("");
    }
  });

  test("on: one additionalContext object, only for conversation starts", () => {
    for (const source of [...CONTEXT_SOURCES, undefined]) {
      const out = JSON.parse(sessionContextOutput("on", source));
      expect(out).toEqual({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT_TEXT } });
    }
    for (const source of ["resume", "compact"]) expect(sessionContextOutput("on", source)).toBe("");
  });

  test("the real script, run as the harness runs it: stdout JSON on, nothing off", () => {
    const script = join(CONSOLE, "scripts", "session-context.mjs");
    const run = (option: string) =>
      execFileSync(process.execPath, [script], {
        input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
        env: { PATH: process.env.PATH ?? "", CLAUDE_PLUGIN_OPTION_SESSION_CONTEXT: option },
      }).toString();
    expect(JSON.parse(run("on")).hookSpecificOutput.additionalContext).toBe(SESSION_CONTEXT_TEXT);
    expect(run("off")).toBe("");
  });
});
