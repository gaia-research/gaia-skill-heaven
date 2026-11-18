// Adapter I/O only. No engine import, process discovery, directory enumeration or writes.
import { openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync, constants } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initialConsoleState, recordEvent, recordRead, recordSelection, structuredOf,
  eventFromSummonResult, eventsFromLedger, skillsFromSessionManifest, selectionFromCommand,
  controllerFromCampaignStatus,
  type ConsoleCoreState, type Controller,
} from "../../status/src/index.js";

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_ROWS = 10_000;
export function readBounded(path: string, opts: { noFollow?: boolean } = {}): string {
  const flags = constants.O_RDONLY | (opts.noFollow ? (constants.O_NOFOLLOW ?? 0) : 0);
  const fd = openSync(path, flags);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("console input exceeds file bound");
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const n = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!n) break;
      offset += n;
    }
    return buffer.subarray(0, offset).toString("utf8");
  } finally { closeSync(fd); }
}
export function jsonLines(text: string): unknown[] {
  const lines = text.split("\n");
  if (lines.length > MAX_ROWS) throw new Error("console input exceeds row bound");
  return lines.flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line) as unknown]; }
    catch { throw new Error("invalid console JSONL; incomplete source is not a complete receipt"); }
  });
}
export function unknownState(): ConsoleCoreState {
  const state = initialConsoleState();
  return { ...state, status: { ...state.status, skills: null, summons: null, reading: { kind: "unknown" } } };
}
function readCampaignStatus(sessionRoot: string): Controller | null {
  const safeRoot = realpathSync(sessionRoot);
  const campaignDir = join(safeRoot, "campaign");
  let dirStat;
  try {
    dirStat = lstatSync(campaignDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
  if (dirStat.isSymbolicLink()) throw new Error("campaign status escapes session root");
  if (!dirStat.isDirectory()) return null;

  const statusPath = join(campaignDir, "status.json");
  let fileStat;
  try {
    fileStat = lstatSync(statusPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
  if (fileStat.isSymbolicLink()) throw new Error("campaign status escapes session root");
  if (!fileStat.isFile()) return null;
  if (!realpathSync(statusPath).startsWith(safeRoot + sep)) throw new Error("campaign status escapes session root");

  let raw: string;
  try {
    raw = readBounded(statusPath, { noFollow: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") throw new Error("campaign status escapes session root");
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return controllerFromCampaignStatus(parsed);
}

function readLedgerLines(safeRoot: string, allowMissing: boolean): unknown[] {
  const logPath = join(safeRoot, "summon-log.jsonl");
  let logStat;
  try {
    logStat = lstatSync(logPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (allowMissing && code === "ENOENT") return [];
    throw err;
  }
  if (logStat.isSymbolicLink()) throw new Error("summon log escapes session root");
  if (!logStat.isFile()) return jsonLines(readBounded(logPath, { noFollow: true }));
  if (!realpathSync(logPath).startsWith(safeRoot + sep)) throw new Error("summon log escapes session root");
  try {
    return jsonLines(readBounded(logPath, { noFollow: true }));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") throw new Error("summon log escapes session root");
    throw err;
  }
}

export function ledgerState(sessionRoot: string): ConsoleCoreState {
  // The caller must supply the exact sessionRoot returned by THEIR Core tool.
  const safeRoot = realpathSync(sessionRoot);
  const manifest: unknown = JSON.parse(readBounded(join(safeRoot, "session.json")));
  const controller = readCampaignStatus(safeRoot);
  const lines = readLedgerLines(safeRoot, controller !== null);
  let state = initialConsoleState();
  for (const event of eventsFromLedger(manifest, lines)) state = recordEvent(state, event, null, "ledger", { readObservable: false });
  const facts = skillsFromSessionManifest(manifest);
  state.status = { ...state.status, skills: facts.skills };
  if (controller) {
    // Campaign status is reported evidence, not an observed operator command.
    // Preserve the actual session reading and selectedFrom.
    state.status = {
      ...state.status,
      controller,
    };
  }
  return state;
}
type Rec = Record<string, any>;
const rec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

/** Agy 1.3.1 full transcript; the ONLY transcript opened is the exact path supplied.
 * Large results may point only into this conversation's steps directory, including through symlinks.
 * Reads are promoted only after a successful result, not at the planner's proposed call.
 */
export function agyState(transcript: string): ConsoleCoreState {
  const path = realpathSync(transcript);
  if (!path.endsWith(`${sep}.system_generated${sep}logs${sep}transcript_full.jsonl`)) throw new Error("not an agy full transcript");
  const steps = join(dirname(dirname(path)), "steps");
  const rows = jsonLines(readBounded(path));
  let state = initialConsoleState();
  let pending: Rec | null = null;
  for (const row of rows) {
    if (!rec(row)) continue;
    if (row.type === "USER_INPUT" && typeof row.content === "string") {
      const typed = (/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/.exec(row.content)?.[1] ?? row.content).trim();
      const reading = selectionFromCommand(typed);
      if (reading) state = recordSelection(state, reading, typed);
    }
    if (Array.isArray(row.tool_calls)) {
      // Multiple calls cannot be reliably paired by adjacency. Fail closed rather than misattribute.
      pending = null;
      if (row.tool_calls.length === 1) {
        const tool = row.tool_calls[0];
        if (rec(tool) && rec(tool.args)) {
          if (tool.name === "call_mcp_tool" && tool.args.ServerName === "skill-heaven_skill-summon" && tool.args.ToolName === "summon") pending = { kind: "summon", args: tool.args.Arguments ?? {}, at: row.created_at };
          if (tool.name === "view_file" && typeof tool.args.AbsolutePath === "string") pending = { kind: "read", path: tool.args.AbsolutePath };
        }
      }
    }
    if (!pending || !["GENERIC", "VIEW_FILE"].includes(row.type) || typeof row.content !== "string") continue;
    const call = pending; pending = null;
    if (row.status !== "DONE" && row.status !== "COMPLETED" && row.status !== "SUCCESS") continue;
    if (call.kind === "read") {
      state = recordRead(state, call.path, "main agent");
      continue;
    }
    let text = row.content;
    const saved = /saved to: (file:\/\/\S+)/.exec(text);
    if (saved) {
      const target = realpathSync(fileURLToPath(saved[1]!));
      const safeSteps = realpathSync(steps);
      if (!target.startsWith(safeSteps + sep) || !/^\d+\/output\.txt$/.test(target.slice(safeSteps.length + 1).replaceAll(sep, "/"))) throw new Error("result escapes conversation steps");
      text = readBounded(target);
    }
    const structured = structuredOf(text);
    if (structured) state = recordEvent(state, eventFromSummonResult(structured, { query: call.args.query, preview: call.args.preview === true, at: call.at }), null, "tool");
  }
  return state;
}

/** Hermes passes only bounded exact summon results from this live session, not prompts. */
export function observedState(rows: unknown[]): ConsoleCoreState {
  let state = initialConsoleState();
  if (rows.length > 50) throw new Error("too many observation rows");
  for (const row of rows) {
    if (!rec(row)) continue;
    const structured = structuredOf(row.result);
    if (structured) state = recordEvent(state, eventFromSummonResult(structured, { preview: row.preview === true }), null, "tool", { readObservable: false });
  }
  return state;
}
