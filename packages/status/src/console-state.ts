// Observations → console state. The pure half of the portable console.
//
// A host adapter OBSERVES something (a summon tool result, a Read of a
// materialized SKILL.md, a typed `/skill-*` command, an agent id) or READS the
// summon engine's own ledger, and hands it here. These reducers fold it into
// `ConsoleCoreState`; `console-view.ts` turns the state into the six surfaces.
//
// No I/O, no host API, no `node:`. The reducers are lifted from the Claude Code
// console (plugins/skill-heaven-console/hooks/model.ts) so every host folds
// observations the same way — one state model, many paints (#192).

import { emptyStatus, type EntropyReading, type SkillHeavenStatus, type SummonEvent } from "./model.js";
import { markRead, reduceStatus, withReading } from "./adapters.js";
import { sanitizeDisplay } from "./sanitize.js";
import type { ConsoleProjection } from "./console-host.js";

/** One summon-tool call the console observed (a real summon, or a /lens preview). */
export interface ConsoleEntry {
  id: number;
  event: SummonEvent;
  /** The agent the host reported for the call; null = the main conversation. */
  agent: string | null;
  /** How the console came to know: a tool call it watched, a /lens preview of its own, or the engine ledger. */
  via: "tool" | "lens" | "ledger";
  /** One slot per stored skill: who read its materialized SKILL.md (a label, never a path), or null. */
  readBy: (string | null)[];
  /** Skills the result named beyond the bounded number stored here. */
  omitted: number;
}

/** What the Lens band shows. null = nothing (the default). */
export type ConsoleBand =
  | { kind: "event"; id: number }
  | { kind: "looking"; query: string }
  | { kind: "draft"; query: string }
  | { kind: "not-connected" }
  | null;

/** An agent the host reported (an id on a tool call, or an Agent call). */
export interface ConsoleAgent {
  /** The Agent call's tool_use_id until the host names the agent, then its agent id. */
  key: string;
  id: string | null;
  /** Sanitized: subagent type and the call's own description. */
  label: string;
  /** running = a foreground call is open; started = launched in the background, end not observed; returned = observed to finish. */
  state: "running" | "started" | "returned";
}

export interface ConsoleCoreState {
  status: SkillHeavenStatus;
  /** Newest last, at most MAX_ENTRIES. */
  entries: ConsoleEntry[];
  band: ConsoleBand;
  agents: ConsoleAgent[];
  /** True once the host reported any agent id this session. */
  agentIdsSeen: boolean;
  /** The rung command the person typed, sanitized, for the Scope surface. */
  selectedFrom: string | null;
  /** The host's version string, when it reported one. */
  hostVersion: string | null;
  seq: number;
}

export const MAX_ENTRIES = 50;
/** Agents kept in Flow, newest last. */
export const MAX_AGENTS = 100;
/** Skills stored per entry; the rest are counted in `omitted`. */
export const MAX_SKILLS_PER_ENTRY = 20;

/** The console watches the whole session, so zero is honest at the start. */
export function initialConsoleState(): ConsoleCoreState {
  return {
    status: {
      ...emptyStatus(),
      reading: { kind: "native", source: "no-launcher" },
      skills: 0,
      summons: 0,
      summonTool: "unknown",
    },
    entries: [],
    band: null,
    agents: [],
    agentIdsSeen: false,
    selectedFrom: null,
    hostVersion: null,
    seq: 0,
  };
}

/* ------------------------------------------------------------------------- *
 * Reading a tool result
 * ------------------------------------------------------------------------- */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

const looksLikeSummon = (v: unknown): v is Rec => isRec(v) && ("summoned" in v || "previewed" in v || "noMatch" in v);

/**
 * The summon tool's `structuredContent`, wherever the host put it.
 *
 * Observed on Claude Code 2.1.294 (PR #187): an MCP tool's result is
 * `{ ref, result, text }` where `result` is a STRING — the server's JSON text —
 * and `structuredContent` appears nowhere. Other hosts hand over the object, a
 * `content[]` block list, or the bare JSON text. Every form is tried; none is
 * assumed.
 */
export function structuredOf(r: unknown): unknown {
  if (typeof r === "string") {
    const parsed = parseJson(r);
    if (looksLikeSummon(parsed)) return parsed;
    const embedded = firstJsonObject(r);
    return looksLikeSummon(embedded) ? embedded : undefined;
  }
  if (!isRec(r)) return undefined;
  if (looksLikeSummon(r as unknown)) return r;
  const result = r.result;
  if (isRec(result)) {
    if (looksLikeSummon(result.structuredContent)) return result.structuredContent;
    if (looksLikeSummon(result)) return result;
  }
  if (looksLikeSummon(r.structuredContent)) return r.structuredContent;
  const texts: string[] = [];
  if (typeof r.text === "string") texts.push(r.text);
  if (typeof result === "string" && result !== r.text) texts.push(result);
  for (const holder of [result, r]) {
    if (isRec(holder) && Array.isArray(holder.content)) {
      for (const block of holder.content) {
        if (isRec(block) && typeof block.text === "string") texts.push(block.text);
      }
    }
  }
  for (const text of texts) {
    const parsed = parseJson(text);
    if (looksLikeSummon(parsed)) return parsed;
    const embedded = firstJsonObject(text);
    if (looksLikeSummon(embedded)) return embedded;
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The first balanced `{ ... }` in `text` that parses as JSON. Strings are skipped
 * over so a brace inside one does not unbalance the scan. */
export function firstJsonObject(text: string): unknown {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break; // not JSON from here; try the next opening brace
        }
      }
    }
  }
  return undefined;
}

/** Is `name` this host's summon tool? Whole-name match against the projection's list — never a suffix,
 * so a look-alike server (`mcp__evil-skill-summon__summon`) is neither observed nor sent a query. */
export function isSummonTool(projection: Pick<ConsoleProjection, "summonTools">, name: string): boolean {
  return projection.summonTools.includes(name);
}

/* ------------------------------------------------------------------------- *
 * Agents (Flow)
 * ------------------------------------------------------------------------- */

const shortId = (id: string) => sanitizeDisplay(id, 12);

/** A label for an agent the host named only by id. */
export function agentLabelFor(state: ConsoleCoreState, id: string | null | undefined): string {
  if (id === null || id === undefined) return "main agent";
  const row = state.agents.find((a) => a.id === id);
  return row ? row.label : `agent ${shortId(id)}`;
}

/** subagent type + the call's own description, both sanitized (they are the model's words). */
export function agentCallLabel(subagentType: unknown, description: unknown): string {
  const type = typeof subagentType === "string" && subagentType ? sanitizeDisplay(subagentType, 24) : "agent";
  const desc = typeof description === "string" && description ? sanitizeDisplay(description, 48) : "";
  return desc ? `${type}  "${desc}"` : type;
}

/** The host reported an agent id on a call: remember that it did, and the agent. */
export function noteAgentId<S extends ConsoleCoreState>(state: S, id: string): S {
  if (state.agents.some((a) => a.id === id)) return state.agentIdsSeen ? state : { ...state, agentIdsSeen: true };
  const agents: ConsoleAgent[] = [
    ...state.agents,
    { key: id, id, label: `agent ${shortId(id)}`, state: "running" as const },
  ].slice(-MAX_AGENTS);
  return { ...state, agentIdsSeen: true, agents };
}

export function startAgentCall<S extends ConsoleCoreState>(state: S, key: string, label: string, background: boolean): S {
  if (state.agents.some((a) => a.key === key)) return state;
  return {
    ...state,
    agents: [...state.agents, { key, id: null, label, state: background ? ("started" as const) : ("running" as const) }].slice(-MAX_AGENTS),
  };
}

/** The Agent call was refused or failed: it started nothing, so it leaves no row. */
export function dropAgentCall<S extends ConsoleCoreState>(state: S, key: string): S {
  return state.agents.some((a) => a.key === key) ? { ...state, agents: state.agents.filter((a) => a.key !== key) } : state;
}

/** The Agent call's result arrived. It may carry the new agent's id. */
export function finishAgentCall<S extends ConsoleCoreState>(state: S, key: string, agentId: string | null, background: boolean): S {
  const agents = state.agents
    .filter((a) => agentId === null || a.key !== agentId || a.key === key)
    .map((a) =>
      a.key === key ? { ...a, id: agentId ?? a.id, state: background ? ("started" as const) : ("returned" as const) } : a,
    );
  return { ...state, agents, agentIdsSeen: state.agentIdsSeen || agentId !== null };
}

/** The agent's own loop finished. */
export function agentReturned<S extends ConsoleCoreState>(state: S, agentId: string): S {
  if (!state.agents.some((a) => a.id === agentId && a.state !== "returned")) return state;
  return { ...state, agents: state.agents.map((a) => (a.id === agentId ? { ...a, state: "returned" as const } : a)) };
}

/* ------------------------------------------------------------------------- *
 * Events
 * ------------------------------------------------------------------------- */

/** Keep a bounded number of skills per entry; the rest are counted, not stored. */
function bounded(event: SummonEvent): { event: SummonEvent; omitted: number } {
  if ((event.kind === "summoned" || event.kind === "previewed") && event.skills.length > MAX_SKILLS_PER_ENTRY) {
    return { event: { ...event, skills: event.skills.slice(0, MAX_SKILLS_PER_ENTRY) }, omitted: event.skills.length - MAX_SKILLS_PER_ENTRY };
  }
  return { event, omitted: 0 };
}

/**
 * A host that cannot observe reads must not infer "body not read" — it never
 * saw the reads it would have needed. Materialized skills become
 * `read-unobserved` ("materialized · read not observed", evidence unknown).
 */
export function withReadObservability(event: SummonEvent, readObservable: boolean): SummonEvent {
  if (readObservable || event.kind !== "summoned") return event;
  return {
    ...event,
    skills: event.skills.map((s) => (s.stage === "materialized" ? { ...s, stage: "read-unobserved" as const } : s)),
  };
}

export interface RecordOptions {
  /** False when the call never got an answer from the tool (an aborted /lens preview): says nothing about connection. */
  reached?: boolean;
  /** Can this host observe a Read of a materialized SKILL.md? Defaults to true. */
  readObservable?: boolean;
}

/** Fold one observed summon-tool call into state. */
export function recordEvent<S extends ConsoleCoreState>(
  state: S,
  event: SummonEvent,
  agent: string | null,
  via: ConsoleEntry["via"],
  opts: RecordOptions = {},
): S {
  const reached = opts.reached ?? true;
  const shaped = withReadObservability(event, opts.readObservable ?? true);
  const id = state.seq + 1;
  const kept = bounded(shaped);
  const entry: ConsoleEntry = {
    id,
    event: kept.event,
    omitted: kept.omitted,
    agent,
    via,
    readBy: "skills" in kept.event ? kept.event.skills.map(() => null) : [],
  };
  const entries = [...state.entries, entry].slice(-MAX_ENTRIES);
  const withAgent = agent !== null ? noteAgentId(state, agent) : state;
  const status = reduceStatus(state.status, shaped);
  return {
    ...withAgent,
    status: reached ? { ...status, summonTool: "connected" } : status,
    entries,
    band: { kind: "event", id },
    seq: id,
  };
}

/** Only a proven complete read establishes context. A successful read whose
 * completeness is unknown records uncertainty, never erasing a prior full read. */
export function recordRead<S extends ConsoleCoreState>(state: S, path: string, reader: string, complete = true): S {
  let changed = false;
  const entries = state.entries.map((entry) => {
    const next = markRead(entry.event, path, complete ? "in-context" : "read-unobserved");
    if (next === entry.event) return entry;
    changed = true;
    const readBy = [...entry.readBy];
    if (next.kind === "summoned" && entry.event.kind === "summoned") {
      const before = entry.event.skills;
      next.skills.forEach((skill, i) => {
        if (skill.stage === "in-context" && before[i]?.stage !== "in-context") readBy[i] = reader;
      });
    }
    return { ...entry, event: next, readBy };
  });
  return changed ? { ...state, entries } : state;
}

/** A rung command was typed and observed. */
export function recordSelection<S extends ConsoleCoreState>(state: S, reading: EntropyReading, typed: string): S {
  return { ...state, status: withReading(state.status, reading), selectedFrom: sanitizeDisplay(typed, 40) };
}

export function entryById(state: ConsoleCoreState, id: number): ConsoleEntry | undefined {
  return state.entries.find((e) => e.id === id);
}

/** A name that may be put in the prompt after the summon command: plain words
 * only. Tree skills carry display names with spaces ("Frontend Code Review",
 * observed live), which are safe and are what the engine matches exactly. */
export function summonableName(skill: { name: string } | undefined): string | null {
  if (!skill) return null;
  const name = sanitizeDisplay(skill.name, 64);
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*(?: [A-Za-z0-9._:/-]+)*$/.test(name) ? name : null;
}

/** The five Skill Heaven surfaces a pre-fill may name. */
const SURFACE_COMMANDS = new Set(["summon", "skill-zero", "skill-heaven", "skill-hell", "skill-ultra"]);

/**
 * The spelling of a Skill Heaven command this host accepts, for a pre-fill or a
 * printed instruction. Observed on Claude Code 2.1.294 and Antigravity 1.3.1: a
 * bare `/skill-zero` is not a command there (Claude: the portable skill is
 * `user-invocable: false`; Antigravity: plugin skills are namespaced), while
 * the plugin-qualified `/skill-heaven:skill-zero` reaches it. Always the one
 * plugin's own name: a look-alike `other:summon` is never produced.
 */
export function qualifyCommand(text: string, prefix: "" | "skill-heaven:" = "skill-heaven:"): string {
  const m = /^\/([a-z-]+)(\s.*)?$/.exec(text);
  if (!m || !SURFACE_COMMANDS.has(m[1]!)) return text;
  return `/${prefix}${m[1]!}${m[2] ?? ""}`;
}
