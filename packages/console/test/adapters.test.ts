import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { ledgerState, agyState, jsonLines, readBounded, MAX_BYTES, unknownState } from "../src/reader.js";
import { harnessById, HARNESS_PATHS, buildConsoleView, renderConsoleText } from "../../status/src/index.js";
import { build } from "esbuild";
import { visibleWidth } from "@earendil-works/pi-tui";

// Exercise the owned typed source, not a potentially stale integration bundle.
// pi-tui stays host-provided in production; here its public exports are resolved
// explicitly because this in-memory test module has no package directory.
const built = await build({ entryPoints: [fileURLToPath(new URL("../extension/console.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node", external: ["@earendil-works/pi-tui"] });
const code = built.outputFiles![0]!.text.replaceAll('"@earendil-works/pi-tui"', JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("@earendil-works/pi-tui")).href));
const { default: consolePi } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

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
    expect(run.stdout).not.toContain("Supply the sessionRoot");
    expect(run.stdout.trim().split("\n")).toHaveLength(8);
    expect(run.stdout).toContain("? skills");
    expect(run.stdout).not.toContain("pending recon");
  });
  it("reports only the explicit engine ledger and labels reads unknown", () => {
    const root = temp();
    writeFileSync(join(root, "session.json"), JSON.stringify({ skills: result.summoned }));
    writeFileSync(join(root, "summon-log.jsonl"), JSON.stringify({ query: "synthetic", surface: "any", chosen: [{ id: "synthetic" }] }) + "\n");
    const state = ledgerState(root);
    expect(state.entries).toHaveLength(1);
    expect(state.status.skills).toBe(1);
    expect(state.entries[0]!.via).toBe("ledger");
    expect(state.entries[0]!.event.kind === "summoned" && state.entries[0]!.event.skills[0]!.stage).toBe("read-unobserved");
    for (const id of ["codex", "hermes", "grok", "agy"] as const) {
      const text = renderConsoleText(buildConsoleView(state, harnessById(id)), { details: true });
      for (const title of ["Status", "Lens", "Session", "Scope", "Flow", "Trust"]) expect(text).toContain(`── ${title}`);
      expect(text).toContain("read not observed");
    }
  });
  it("bounds files and rejects incomplete final rows rather than silently undercounting", () => {
    expect(() => jsonLines('{"a":1}\n{')).toThrow("incomplete source");
    expect(() => jsonLines('{bad}\n{}')).toThrow();
    const path = join(temp(), "large");
    writeFileSync(path, Buffer.alloc(MAX_BYTES + 1));
    expect(() => readBounded(path)).toThrow("bound");
    const root = temp();
    writeFileSync(join(root, "session.json"), JSON.stringify({ skills: result.summoned }));
    writeFileSync(join(root, "summon-log.jsonl"), '{"chosen":[]}\n{partial');
    expect(() => ledgerState(root)).toThrow("incomplete source");
    const cli = fileURLToPath(new URL("../../../plugins/skill-heaven-console-codex/scripts/heaven.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [cli, "--host", "codex", "--session-root", root], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain("skills");
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
  const statuses: any[] = [], widgets: any[] = [], drafts: string[] = [], overlays: any[] = [], notices: string[] = [];
  const tui = { terminal: { rows: 40, columns: 80 }, renders: 0, requestRender() { this.renders++; } };
  const theme = { fg: (_role: string, text: string) => `\x1b[36m${text}\x1b[0m` };
  const ui = {
    setStatus: (...args: any[]) => statuses.push(args), setWidget: (...args: any[]) => widgets.push(args), notify: (text: string) => notices.push(text), setEditorText: (text: string) => drafts.push(text),
    custom: (factory: Function, options: any) => new Promise<void>(resolve => {
      const overlay: any = { options, disposed: false, completions: 0 };
      overlay.component = factory(tui, theme, {}, () => { overlay.completions++; overlay.component.dispose(); overlay.disposed = true; resolve(); });
      overlays.push(overlay);
    }),
  };
  let listener: Function | undefined;
  const api: any = { on: (name: string, cb: Function) => { handlers[name] = cb; }, registerCommand: (name: string, c: any) => { commands[name] = c; }, events: { emit: (channel: string, req: any) => listener?.(channel, req) } };
  const ctx: any = { hasUI: true, mode: "tui", cwd: "/synthetic", ui, sessionManager: { getBranch: () => [] } };
  consolePi(api); handlers.session_start!(null, ctx);
  return { handlers, commands, ctx, statuses, widgets, drafts, tui, theme, overlays, notices, listen: (cb: Function) => { listener = cb; } };
}
function widgetText(f: ReturnType<typeof piFixture>): string {
  const value = f.widgets.at(-1)?.[1];
  if (!value) return "";
  return (typeof value === "function" ? value(f.tui, f.theme).render(f.tui.terminal.columns) : value).join("\n");
}
function openPane(f: ReturnType<typeof piFixture>, command: string) {
  const pending = f.commands.heaven.handler(command, f.ctx);
  const overlay = f.overlays.at(-1)!;
  const render = () => overlay.component.render(f.tui.terminal.columns);
  render();
  return { pending, overlay, render, text: () => render().join("\n"), close: async () => { overlay.component.handleInput("\x1b"); await pending; } };
}
describe("separate Pi extension", () => {
  it("owns only its status key; drafts without any direct Core call and fills only explicitly", async () => {
    const f = piFixture(); let requests = 0;
    f.listen(() => { requests++; throw new Error("Tool policy must not be bypassed"); });
    await f.commands.lens.handler("synthetic", f.ctx);
    expect(requests).toBe(0); expect(f.drafts).toEqual([]);
    expect(widgetText(f)).toContain("not requested yet; no tool called");
    expect(widgetText(f)).not.toMatch(/"preview"|JSON arguments|approval path|Nothing materialized/);
    await f.commands.heaven.handler("fill", f.ctx);
    expect(f.drafts[0]).toContain('"preview":true');
    // Only a normal host tool result can turn the draft into a real preview.
    f.handlers.tool_result({ toolName: "summon", details: { ...result, summoned: [], previewed: result.summoned }, input: { preview: true } }, f.ctx);
    await f.commands.heaven.handler("fill", f.ctx);
    expect(f.drafts.at(-1)).toBe("/summon Synthetic Skill");
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
    const beforeRead = openPane(f, "inspect session");
    beforeRead.overlay.component.handleInput("\x1b[F");
    expect(beforeRead.text()).toContain("body not read"); await beforeRead.close();
    f.handlers.tool_result({ toolName: "read", isError: false, input: { path: "/synthetic/skill/SKILL.md" } }, f.ctx);
    const afterRead = openPane(f, "inspect session");
    afterRead.overlay.component.handleInput("\x1b[F");
    expect(afterRead.text()).toContain("body read"); await afterRead.close();
  });
  it.each([[40, 80], [40, 40], [18, 28], [10, 5], [8, 40]])("bounds physical rows and columns at %s×%s, including resize and wide text", async (rows, columns) => {
    const f = piFixture(); f.tui.terminal.rows = rows; f.tui.terminal.columns = columns;
    await f.commands.lens.handler("漢字 emoji 👩‍💻 " + "x".repeat(100), f.ctx);
    expect(widgetText(f).split("\n").filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(widgetText(f)).not.toContain('"query"');
    const pane = openPane(f, "inspect trust");
    for (const [r, c] of [[rows, columns], [12, 7], [40, 80]]) {
      f.tui.terminal.rows = r!; f.tui.terminal.columns = c!;
      pane.overlay.component.handleInput("\x1b[F");
      const output = pane.render();
      expect(output.length).toBeLessThanOrEqual(Math.max(0, r! - 8));
      for (const line of output) expect(visibleWidth(line)).toBeLessThanOrEqual(c!);
    }
    await pane.close();
    expect(pane.overlay.disposed).toBe(true); expect(pane.render()).toEqual([]);
  });
  it("navigates six scoped sections, toggles inspection and pages only inspected content", async () => {
    const f = piFixture(); const pane = openPane(f, "all");
    const initial = pane.text();
    expect(initial).toContain("1 Status");
    pane.overlay.component.handleInput("\x1b[6~"); expect(pane.text()).toBe(initial);
    pane.overlay.component.handleInput("\x1b[C"); expect(pane.text()).toContain("2 Lens");
    pane.overlay.component.handleInput("\x1b[D"); expect(pane.text()).toContain("1 Status");
    for (const [i, label] of ["Status", "Lens", "Session", "Scope", "Flow", "Trust"].entries()) {
      pane.overlay.component.handleInput(String(i + 1)); expect(pane.text()).toContain(`${i + 1} ${label}`);
    }
    pane.overlay.component.handleInput("i");
    expect(pane.text()).toContain("inspect");
    const top = pane.text();
    pane.overlay.component.handleInput("\x1b[6~"); expect(pane.text()).not.toBe(top);
    pane.overlay.component.handleInput("\x1b[F"); expect(pane.text()).toContain("It does not rate it");
    const end = pane.text(); pane.overlay.component.handleInput("\x1b[6~"); expect(pane.text()).toBe(end);
    pane.overlay.component.handleInput("\x1b[5~"); expect(pane.text()).not.toBe(end);
    pane.overlay.component.handleInput("\x1b[H"); expect(pane.text()).toBe(top);
    pane.overlay.component.handleInput("\x1b[B"); expect(pane.text()).not.toBe(top);
    pane.overlay.component.handleInput("i"); expect(pane.text()).toContain("summary");
    pane.overlay.component.handleInput("q"); await pane.pending;
    pane.overlay.component.handleInput("q"); expect(pane.overlay.completions).toBe(1);
    expect(f.drafts).toEqual([]);
  });
  it("keeps defaults concise and hides JSON, fallback recipes and capability diagnostics until scoped inspection", async () => {
    const f = piFixture();
    await f.commands.lens.handler("synthetic", f.ctx);
    for (const surface of ["status", "lens", "session", "scope", "flow", "trust"]) {
      const pane = openPane(f, surface);
      try {
        // At 80 columns: at most 8 body rows + title/nav/help (3 rows).
        expect(pane.render().length).toBeLessThanOrEqual(11);
        expect(pane.text()).not.toMatch(/JSON arguments|"preview":true|Call the existing|\bvia |pi (?:install|remove)|configured skill source|Saved .*API\/layout/);
      } finally { await pane.close(); }
    }
    const detail = openPane(f, "inspect lens");
    detail.overlay.component.handleInput("\x1b[F");
    expect(detail.text()).toContain('"preview":true');
    await detail.close();
    expect(f.drafts).toEqual([]);
  });

  it("cleans up only the owned pane/widget/status on dismiss, branch change and removal", async () => {
    const f = piFixture();
    await f.commands.lens.handler("synthetic", f.ctx);
    let pane = openPane(f, "lens");
    await f.commands.heaven.handler("dismiss", f.ctx); await pane.pending;
    expect(pane.overlay.disposed).toBe(true); expect(widgetText(f)).toBe("");
    pane = openPane(f, "trust"); f.handlers.session_tree(null, f.ctx); await pane.pending;
    expect(pane.overlay.disposed).toBe(true);
    pane = openPane(f, "session"); f.handlers.session_shutdown(null, f.ctx); await pane.pending;
    expect(pane.overlay.disposed).toBe(true);
    expect(f.widgets.at(-1)).toEqual(["skill-heaven-console", undefined]);
    expect(f.statuses.at(-1)).toEqual(["skill-heaven-console", undefined]);
    expect(f.drafts).toEqual([]);
  });
  it("does not open terminal overlays in RPC/no-UI mode or accept unscoped inspection", async () => {
    const f = piFixture(); f.ctx.mode = "rpc";
    await f.commands.heaven.handler("trust", f.ctx);
    expect(f.overlays).toEqual([]); expect(f.notices.at(-1)).toContain("interactive terminal");
    f.ctx.mode = "tui";
    await f.commands.heaven.handler("inspect all", f.ctx);
    expect(f.overlays).toEqual([]);
    f.ctx.hasUI = false;
    await f.commands.heaven.handler("trust", f.ctx); await f.commands.lens.handler("synthetic", f.ctx);
    expect(f.overlays).toEqual([]); expect(f.drafts).toEqual([]);
  });

  it("works without Core without calling anything and clears drafts on branch change", async () => {
    const f = piFixture(); await f.commands.lens.handler("synthetic", f.ctx);
    expect(widgetText(f)).toContain("no tool called");
    f.handlers.session_tree(null, f.ctx);
    await f.commands.heaven.handler("fill", f.ctx);
    expect(f.drafts).toEqual([]);
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
    for (const forbidden of ["sendUserMessage", "registerTool(", "spawn(", "registerMcpServer", "sendMessage(", "pi.events.emit"]) expect(pi).not.toContain(forbidden);
    const core = readFileSync(new URL("../../../plugins/skill-heaven/dev.skill-heaven.pi/skill-heaven.ts", import.meta.url), "utf8");
    expect(core).not.toContain("skill-heaven:preview-request");
    const hermes = readFileSync(new URL("../../../plugins/skill-heaven-console-hermes/__init__.py", import.meta.url), "utf8");
    expect(hermes).not.toContain("ctx.dispatch_tool(");
    expect(hermes).not.toContain("tools.registry");
    expect(hermes).toContain('"--preview-draft", query');
    for (const id of ["pi", "codex", "hermes", "grok", "agy"]) {
      const rel = id === "pi" ? "extensions/console.mjs" : "scripts/heaven.mjs";
      const bundle = readFileSync(new URL(`../../../plugins/skill-heaven-console-${id}/${rel}`, import.meta.url), "utf8");
      expect(bundle).toContain("GENERATED by scripts/build-console.mjs");
      expect(bundle).not.toContain("STATUS_FIXTURES");
    }
  });
});
