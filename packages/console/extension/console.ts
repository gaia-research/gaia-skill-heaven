import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, ScrollView, truncateToWidth, wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";
import {
  initialConsoleState, recordEvent, recordRead, recordSelection, structuredOf,
  eventFromSummonResult, selectionFromCommand, buildConsoleView, renderConsoleText,
  harnessById, CONSOLE_SURFACES, SURFACE_LABEL, type ConsoleSurface, type ConsoleView,
} from "../../status/src/index.js";

const KEY = "skill-heaven-console";
const projection = harnessById("pi");

// Presentation only: every fact/body comes from the shared ConsoleView painter.
// ScrollView owns offset clamping; this custom component paints its viewport,
// rather than relying on an overlay's maxHeight to discard unreachable lines.
export class ConsolePane implements Component {
  private section: number;
  private closed = false;
  private width = 1;
  private readonly scroll: ScrollView;
  private lines: string[] = [];
  constructor(private readonly tui: TUI, private readonly theme: Theme,
    private readonly view: () => ConsoleView, surface: ConsoleSurface,
    private readonly done: () => void, private details = false) {
    this.section = CONSOLE_SURFACES.indexOf(surface);
    this.scroll = new ScrollView({ render: () => this.lines, invalidate: () => {} }, { scrollbar: "hidden", overscroll: "contain" });
  }
  invalidate(): void {} // no cached theme strings or layout
  dispose(): void { this.closed = true; this.lines = []; }
  close(): void {
    if (this.closed) return;
    this.dispose(); this.done(); // ctx.ui.custom owns overlay disposal/focus restoration
  }
  handleInput(data: string): void {
    if (this.closed) return;
    if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, Key.ctrl("c"))) { this.close(); return; }
    // Render once to synchronize public terminal size/layout before paging.
    this.render(this.width);
    const numbered = (["1", "2", "3", "4", "5", "6"] as const).findIndex(key => matchesKey(data, key));
    let section = this.section;
    if (numbered >= 0) section = numbered;
    else if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) section = (section + 1) % CONSOLE_SURFACES.length;
    else if (matchesKey(data, Key.shift(Key.tab)) || matchesKey(data, Key.left)) section = (section + CONSOLE_SURFACES.length - 1) % CONSOLE_SURFACES.length;
    else if (matchesKey(data, "i")) { this.details = !this.details; this.scroll.scrollToStart(); }
    else if (this.details && matchesKey(data, Key.up)) this.scroll.scrollBy(-1);
    else if (this.details && matchesKey(data, Key.down)) this.scroll.scrollBy(1);
    else if (this.details && matchesKey(data, Key.pageUp)) this.scroll.scrollBy(-Math.max(1, this.scroll.viewportHeight - 1));
    else if (this.details && matchesKey(data, Key.pageDown)) this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight - 1));
    else if (this.details && matchesKey(data, Key.home)) this.scroll.scrollToStart();
    else if (this.details && matchesKey(data, Key.end)) this.scroll.scrollToEnd();
    else return;
    if (section !== this.section) { this.section = section; this.details = false; this.scroll.scrollToStart(); }
    this.invalidate(); this.tui.requestRender();
  }
  render(available: number): string[] {
    if (this.closed || available < 1 || this.tui.terminal.columns < 1) return [];
    const width = Math.max(1, Math.min(Math.floor(available), this.tui.terminal.columns));
    this.width = width;
    const rows = Math.max(0, this.tui.terminal.rows - 8);
    if (!rows) return [];
    const surface = CONSOLE_SURFACES[this.section]!;
    const title = `Skill Heaven · ${this.section + 1} ${SURFACE_LABEL[surface]} · ${this.details ? "inspect" : "summary"}`;
    const help = wrapTextWithAnsi(this.details
      ? "1–6/←→ section · i summary · ↑↓/PgUp/PgDn/Home/End scroll · Esc/q close"
      : "1–6/←→ section · i inspect · Esc/q close", width);
    const footerRows = Math.min(help.length, Math.max(0, rows - 2));
    const nav = CONSOLE_SURFACES.map((s, i) => `${i + 1} ${SURFACE_LABEL[s]}`).join(" · ");
    const top = [this.theme.fg("accent", truncateToWidth(title, width, "")),
      ...wrapTextWithAnsi(nav, width).map(line => this.theme.fg("muted", line))]
      .slice(0, Math.min(3, Math.max(1, rows - footerRows - 1)));
    const height = Math.max(1, Math.min(this.details ? rows : 8, rows - footerRows - top.length));
    // `details` belongs to the shared renderer contract. Never manufacture
    // diagnostic/summary semantics in this wrapper, only wrap/bound its lines.
    const opts = { surface, details: this.details };
    this.lines = wrapTextWithAnsi(renderConsoleText(this.view(), opts), width).map(line => truncateToWidth(line, width, ""));
    if (!this.details) this.lines = this.lines.slice(0, 8);
    this.scroll.updateLayout(this.lines.length, height, () => { if (!this.closed) this.tui.requestRender(); });
    const body = this.scroll.render(width).slice(this.details ? this.scroll.scrollTop : 0, (this.details ? this.scroll.scrollTop : 0) + height);
    return [...top, ...body,
      ...(footerRows ? help.slice(-footerRows).map(line => this.theme.fg("muted", truncateToWidth(line, width, ""))) : [])]
      .map(line => truncateToWidth(line, width, "")).slice(0, rows);
  }
}

export default function consolePi(pi: ExtensionAPI): void {
  let state = initialConsoleState();
  let pane: ConsolePane | undefined;
  const closePane = () => { pane?.close(); pane = undefined; };
  const band = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const view = buildConsoleView(state, projection);
    if (!view.lens) { ctx.ui.setWidget(KEY, undefined); return; }
    // Keep only one shared band notice, not stages, diagnostics or draft JSON.
    const short = view.lens.lines.slice(0, 1).map(line => line.map(segment => segment.text).join(""));
    short.push("/heaven inspect lens · /heaven fill: prefill only");
    ctx.ui.setWidget(KEY, (tui) => ({
      invalidate() {},
      render(width) {
        const columns = Math.max(1, Math.min(width, tui.terminal.columns));
        return short.map(line => truncateToWidth(line, columns)).slice(0, Math.min(2, Math.max(0, tui.terminal.rows - 8)));
      },
    }), { placement: "belowEditor" });
  };
  const paint = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(KEY, process.env.SKILL_HEAVEN_STATUS === "off" ? undefined : buildConsoleView(state, projection).status.compact);
    band(ctx); pane?.invalidate();
  };
  // Reconstruct only the active branch; abandoned tree branches never enter this console.
  const rebuild = (ctx: ExtensionContext) => {
    closePane(); state = initialConsoleState();
    // Replay bounded branch tool results, without copying prompts or writing new transcript entries.
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch.slice(-1000)) {
      if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
      const message = entry.message;
      if (message.toolName === "summon") {
        const structured = structuredOf(message.details);
        if (structured) state = recordEvent(state, eventFromSummonResult(structured), null, "tool", { readObservable: false });
      }
    }
    if (branch.length > 1000) state.status = { ...state.status, skills: null, summons: null };
    paint(ctx);
    if (ctx.hasUI) ctx.ui.setWidget(KEY, undefined);
  };
  pi.on("session_start", (_e, ctx) => rebuild(ctx));
  pi.on("session_tree", (_e, ctx) => rebuild(ctx));
  pi.on("tool_result", (event, ctx) => {
    // Whole-name match: only the Core native tool, not another MCP server or a suffix match.
    if (event.toolName === "summon") {
      const structured = structuredOf(event.details) ?? structuredOf({ content: event.content });
      state = recordEvent(state, eventFromSummonResult(structured, { preview: event.input.preview === true }, event.isError ? { isError: true, text: "Core summon failed" } : undefined), null, "tool");
    } else if (event.toolName === "read" && !event.isError && typeof event.input.path === "string") {
      state = recordRead(state, resolve(ctx.cwd, event.input.path), "main agent");
    }
    paint(ctx);
  });
  pi.on("input", (event, ctx) => {
    // Core aliases re-dispatch as /skill:<name>; do not retain unrelated input.
    const typed = event.text.replace(/^\/skill:/, "/");
    const reading = selectionFromCommand(typed);
    if (reading) { state = recordSelection(state, reading, typed); paint(ctx); }
  });
  const show = async (ctx: ExtensionContext, surface: ConsoleSurface | "all" = "all", details = false) => {
    if (ctx.mode !== "tui") { ctx.ui.notify("The scrollable /heaven pane requires interactive terminal mode.", "info"); return; }
    closePane();
    let opened: ConsolePane | undefined;
    try {
      await ctx.ui.custom<void>((tui, theme, _keys, done) => {
        opened = new ConsolePane(tui, theme, () => buildConsoleView(state, projection), surface === "all" ? "status" : surface, done, details);
        pane = opened;
        return opened;
      }, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } });
    } finally { opened?.dispose(); if (pane === opened) pane = undefined; }
  };
  pi.registerCommand("heaven", {
    description: "Compact console; 1–6 sections, i inspect, Esc/q close; [all|status|lens|session|scope|flow|trust|inspect <section>|dismiss|fill]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const sub = args.trim() || "all";
      if (sub === "dismiss") { closePane(); state = { ...state, band: null }; ctx.ui.setWidget(KEY, undefined); return; }
      if (sub === "fill") {
        const draft = buildConsoleView(state, projection).lens?.prefill;
        if (draft) ctx.ui.setEditorText(draft); // never sends a message
        return;
      }
      const inspect = /^inspect (status|lens|session|scope|flow|trust)$/.exec(sub);
      if (inspect) await show(ctx, inspect[1] as ConsoleSurface, true);
      else if (sub === "all" || CONSOLE_SURFACES.includes(sub as ConsoleSurface)) await show(ctx, sub as ConsoleSurface | "all");
      else ctx.ui.notify("Usage: /heaven [status|lens|session|scope|flow|trust|inspect <section>|dismiss|fill]", "info");
    },
  });
  pi.registerCommand("lens", {
    description: "Draft a preview handoff; /heaven fill prefills, you submit it",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query || query.length > 4096 || !ctx.hasUI) return;
      // There is no public API to run a model tool through ALL host/extension
      // permission hooks from a command. Draft only: normal tool approval wins.
      state = { ...state, band: { kind: "draft", query } };
      band(ctx);
      // No Core call, event bridge, editor overwrite, prompt or materialization.
      // Human explicitly uses /heaven fill and presses Enter; tool_result observes it.
    },
  });
  pi.on("session_shutdown", (_e, ctx) => {
    closePane();
    if (ctx.hasUI) { ctx.ui.setStatus(KEY, undefined); ctx.ui.setWidget(KEY, undefined); }
  });
}
