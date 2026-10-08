import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { ledgerState, agyState, jsonLines, readBounded, MAX_BYTES, unknownState } from "../src/reader.js";
import { harnessById, HARNESS_PATHS, buildConsoleView, renderConsoleText } from "../../status/src/index.js";
import consolePi from "../../../plugins/skill-heaven-console-pi/extensions/console.mjs";

const dirs: string[] = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), "console-test-")); dirs.push(path); return path; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const result = { query: "synthetic", surface: "any", summoned: [{ id: "synthetic", name: "Synthetic Skill", path: "/synthetic/skill" }], previewed: [], noMatch: null };

describe("bounded, exact-session readers", () => {
  it("does not confuse unknown with zero", () => {
    expect(unknownState().status.skills).toBeNull();
    const cli = fileURLToPath(new URL("../../../plugins/skill-heaven-console-codex/scripts/heaven.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [cli, "--host", "codex"], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Counts are unknown, not zero");
    expect(run.stdout).toContain("? skills");
    expect(run.stdout).not.toContain("pending recon");
  });
  it("reports only the explicit engine ledger and labels reads unknown", () => {
    const root = temp();
    writeFileSync(join(root, "session.json"), JSON.stringify({ skills: result.summoned }));
    writeFileSync(join(root, "summon-log.jsonl"), JSON.stringify({ query: "synthetic", surface: "any", chosen: [{ id: "synthetic" }] }) + "\n{partial");
    const state = ledgerState(root);
    expect(state.entries).toHaveLength(1);
    expect(state.status.skills).toBe(1);
    expect(state.entries[0]!.via).toBe("ledger");
    expect(state.entries[0]!.event.kind === "summoned" && state.entries[0]!.event.skills[0]!.stage).toBe("read-unobserved");
    for (const id of ["codex", "hermes", "grok", "agy"] as const) {
      const text = renderConsoleText(buildConsoleView(state, harnessById(id)));
      for (const title of ["Status", "Lens", "Session", "Scope", "Flow", "Trust"]) expect(text).toContain(`── ${title}`);
      expect(text).toContain("read not observed");
    }
  });
  it("bounds files and tolerates only a partial final line", () => {
    expect(jsonLines('{"a":1}\n{')).toEqual([{ a: 1 }]);
    expect(() => jsonLines('{bad}\n{}')).toThrow();
    const path = join(temp(), "large");
    writeFileSync(path, Buffer.alloc(MAX_BYTES + 1));
    expect(() => readBounded(path)).toThrow("bound");
  });
  const transcript = (rows: unknown[]) => {
    const root = temp(); const logs = join(root, ".system_generated", "logs"); mkdirSync(logs, { recursive: true });
    const path = join(logs, "transcript_full.jsonl"); writeFileSync(path, rows.map(x => JSON.stringify(x)).join("\n")); return { root, path };
  };
  const summon = { type: "PLANNER_RESPONSE", tool_calls: [{ name: "call_mcp_tool", args: { ServerName: "skill-heaven_skill-summon", ToolName: "summon", Arguments: { query: "synthetic" } } }] };
  const read = { type: "PLANNER_RESPONSE", tool_calls: [{ name: "view_file", args: { AbsolutePath: "/synthetic/skill/SKILL.md" } }] };
  it("requires an exact Agy tool and successful read result", () => {
    const { path } = transcript([summon, { type: "GENERIC", status: "DONE", content: JSON.stringify(result) }, read, { type: "VIEW_FILE", status: "FAILED", content: "error" }]);
    let state = agyState(path);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.event.kind === "summoned" && state.entries[0]!.event.skills[0]!.stage).toBe("materialized");
    writeFileSync(path, [summon, { type: "GENERIC", status: "DONE", content: JSON.stringify(result) }, read, { type: "VIEW_FILE", status: "DONE", content: "synthetic body" }].map(x => JSON.stringify(x)).join("\n"));
    state = agyState(path);
    expect(state.entries[0]!.readBy).toEqual(["main agent"]);
    expect(renderConsoleText(buildConsoleView(state, harnessById("agy")))).not.toContain("synthetic body");
  });
  it("rejects external/symlinked result files instead of reading another conversation", () => {
    const { root, path } = transcript([]); const steps = join(root, ".system_generated", "steps"); mkdirSync(join(steps, "4"), { recursive: true });
    const outside = join(temp(), "private"); writeFileSync(outside, JSON.stringify(result));
    const target = join(steps, "4", "output.txt"); symlinkSync(outside, target);
    writeFileSync(path, [summon, { type: "GENERIC", status: "DONE", content: "saved to: " + pathToFileURL(target).href }].map(x => JSON.stringify(x)).join("\n"));
    expect(() => agyState(path)).toThrow("escapes");
  });
});

function piFixture() {
  const handlers: Record<string, Function> = {}; const commands: Record<string, any> = {};
  const ui = { setStatus: (...args: any[]) => statuses.push(args), setWidget: (...args: any[]) => widgets.push(args), notify: () => {}, setEditorText: (text: string) => drafts.push(text) };
  const statuses: any[] = [], widgets: any[] = [], drafts: string[] = [];
  let listener: Function | undefined;
  const api: any = { on: (name: string, cb: Function) => { handlers[name] = cb; }, registerCommand: (name: string, c: any) => { commands[name] = c; }, events: { emit: (channel: string, req: any) => listener?.(channel, req) } };
  const ctx: any = { hasUI: true, cwd: "/synthetic", ui, sessionManager: { getBranch: () => [] } };
  consolePi(api); handlers.session_start!(null, ctx);
  return { handlers, commands, ctx, statuses, widgets, drafts, listen: (cb: Function) => { listener = cb; } };
}
describe("separate Pi extension", () => {
  it("owns only its status key; previews on the Core bridge and pre-fills only on explicit fill", async () => {
    const f = piFixture(); let requests = 0;
    f.listen((channel: string, req: any) => {
      expect(channel).toBe("skill-heaven:preview-request/v1"); requests++; req.accept(); req.reply({ structuredContent: { ...result, summoned: [], previewed: result.summoned } });
    });
    await f.commands.lens.handler("synthetic", f.ctx);
    expect(requests).toBe(1); expect(f.drafts).toEqual([]);
    await f.commands.heaven.handler("fill", f.ctx);
    expect(f.drafts).toEqual(["/summon Synthetic Skill"]);
    expect(f.statuses.every(args => args[0] === "skill-heaven-console")).toBe(true);
    expect(f.statuses.at(-1)[1]).toContain("0 skills");
    f.handlers.session_shutdown(null, f.ctx);
    expect(f.statuses.at(-1)).toEqual(["skill-heaven-console", undefined]);
  });
  it("does not mark failed or proposed reads as in context; no lookalike summon", async () => {
    const f = piFixture();
    f.handlers.tool_result({ toolName: "evil_summon", details: result, input: {} }, f.ctx);
    expect(f.statuses.at(-1)[1]).toContain("0 skills");
    f.handlers.tool_result({ toolName: "summon", details: result, input: {} }, f.ctx);
    f.handlers.tool_result({ toolName: "read", isError: true, input: { path: "/synthetic/skill/SKILL.md" } }, f.ctx);
    await f.commands.heaven.handler("session", f.ctx);
    expect(f.widgets.at(-1)[1].join("\n")).toContain("body not read");
    f.handlers.tool_result({ toolName: "read", isError: false, input: { path: "/synthetic/skill/SKILL.md" } }, f.ctx);
    await f.commands.heaven.handler("session", f.ctx);
    expect(f.widgets.at(-1)[1].join("\n")).toContain("body read");
  });
  it("fails closed without Core and ignores stale preview completion after branch change", async () => {
    const f = piFixture(); await f.commands.lens.handler("synthetic", f.ctx);
    expect(f.widgets.at(-1)[1].join("\n")).toContain("not connected");
    let request: any;
    f.listen((_channel: string, req: any) => { request = req; req.accept(); });
    const pending = f.commands.lens.handler("synthetic", f.ctx);
    f.handlers.session_tree(null, f.ctx);
    request.reply({ structuredContent: result }); await pending;
    expect(f.statuses.at(-1)[1]).toContain("0 skills");
  });
});

describe("install safety and independently removable artifacts", () => {
  it("has argv for every known canonical step; paths occupy individual arguments", () => {
    for (const host of HARNESS_PATHS.filter(h => h.id !== "other")) {
      for (const piece of [host.core, host.consolePiece]) {
        if (!piece) continue;
        for (const step of [...piece.register, ...piece.update, ...piece.remove]) {
          expect(step.argv?.length).toBeGreaterThan(0);
          expect(step.argv!.some(arg => arg.includes("&&") || arg.includes("sh -c"))).toBe(false);
          for (const arg of step.argv!) {
            const expanded = arg.replaceAll("{{CONSOLE_DIR}}", "/candidate path/' ;evil").replaceAll("{{PLUGIN_DIR}}", "/core path").replaceAll("{{MARKETPLACE_DIR}}", "/market path");
            expect(typeof expanded).toBe("string"); // substitution must not split arguments
          }
        }
      }
      expect(host.console.surfaces.flow.level).toBe(host.id === "claude" ? "native" : "unsupported");
    }
    expect(harnessById("claude").core.register[0]!.argv!.at(-1)).toBe("{{MARKETPLACE_DIR}}");
  });
  it("declares no new MCP authority or private TUI patch; generated artifacts stay independent", () => {
    const pi = readFileSync(new URL("../extension/console.ts", import.meta.url), "utf8");
    for (const forbidden of ["sendUserMessage", "registerTool(", "spawn(", "registerMcpServer", "sendMessage("]) expect(pi).not.toContain(forbidden);
    for (const id of ["pi", "codex", "hermes", "grok", "agy"]) {
      const rel = id === "pi" ? "extensions/console.mjs" : "scripts/heaven.mjs";
      const bundle = readFileSync(new URL(`../../../plugins/skill-heaven-console-${id}/${rel}`, import.meta.url), "utf8");
      expect(bundle).toContain("GENERATED by scripts/build-console.mjs");
      expect(bundle).not.toContain("STATUS_FIXTURES");
    }
  });
});
