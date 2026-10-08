import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  initialConsoleState, recordEvent, recordRead, recordSelection, structuredOf,
  eventFromSummonResult, selectionFromCommand, buildConsoleView, renderConsoleText,
  harnessById, CONSOLE_SURFACES, type ConsoleSurface,
} from "../../status/src/index.js";

const KEY = "skill-heaven-console";
const projection = harnessById("pi");
export default function consolePi(pi: ExtensionAPI): void {
  let state = initialConsoleState();
  const paint = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(KEY, process.env.SKILL_HEAVEN_STATUS === "off" ? undefined : buildConsoleView(state, projection).status.compact);
  };
  // Reconstruct only the active branch; abandoned tree branches never enter this console.
  const rebuild = (ctx: ExtensionContext) => {
    state = initialConsoleState();
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
  const show = (ctx: ExtensionContext, surface: ConsoleSurface | "all" = "all") => {
    if (ctx.hasUI) ctx.ui.setWidget(KEY, renderConsoleText(buildConsoleView(state, projection), { surface }).split("\n"), { placement: "belowEditor" });
  };
  pi.registerCommand("heaven", {
    description: "Skill Heaven console; [status|lens|session|scope|flow|trust|dismiss|fill]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const sub = args.trim() || "all";
      if (sub === "dismiss") { state = { ...state, band: null }; ctx.ui.setWidget(KEY, undefined); return; }
      if (sub === "fill") {
        const draft = buildConsoleView(state, projection).lens?.prefill;
        if (draft) ctx.ui.setEditorText(draft); // never sends a message
        return;
      }
      if (sub === "all" || CONSOLE_SURFACES.includes(sub as ConsoleSurface)) show(ctx, sub as ConsoleSurface | "all");
      else ctx.ui.notify("Usage: /heaven [status|lens|session|scope|flow|trust|dismiss|fill]", "info");
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
      show(ctx, "lens");
      // No Core call, event bridge, editor overwrite, prompt or materialization.
      // Human explicitly uses /heaven fill and presses Enter; tool_result observes it.
    },
  });
  pi.on("session_shutdown", (_e, ctx) => {
    if (ctx.hasUI) { ctx.ui.setStatus(KEY, undefined); ctx.ui.setWidget(KEY, undefined); }
  });
}
