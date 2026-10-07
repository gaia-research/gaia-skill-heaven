// The console's pure logic: how observed facts fold into session state.
//
// No `$`, no engine, no I/O here. Every function takes a ConsoleState and
// returns the next one; the hooks in register.tsx do the observing and the
// engine does the keeping. The meaning of every field comes from the one status
// model (status-model.mjs), never from this file.

import {
  emptyStatus,
  markRead,
  reduceStatus,
  sanitizeDisplay,
  withReading,
} from './status-model.mjs'
import type { EntropyReading, SkillHeavenStatus, SkillReceipt, SummonEvent } from './status-model.mjs'
import type { ConsoleAgent, ConsoleBand, ConsoleEntryData, ConsoleSection, ConsoleStateData } from '../types'

export type { ConsoleAgent, ConsoleBand, ConsoleSection }

/** The state contract (types/index.d.ts) keeps `status` and `event` opaque because
 * the engine wants that file self-contained; these are their real types, and
 * `fromData` / `toData` are the only place the two meet. */
export type ConsoleEntry = Omit<ConsoleEntryData, 'event'> & { event: SummonEvent }
export type ConsoleState = Omit<ConsoleStateData, 'status' | 'entries'> & {
  status: SkillHeavenStatus
  entries: ConsoleEntry[]
}
export const fromData = (data: ConsoleStateData): ConsoleState => data as unknown as ConsoleState
export const toData = (state: ConsoleState): ConsoleStateData => state as unknown as ConsoleStateData

export const MAX_ENTRIES = 50

/** The summon tool, however the session spells it:
 * `mcp__plugin_skill-heaven_skill-summon__summon` (marketplace install) or
 * `mcp__skill-summon__summon` (launcher). */
export const SUMMON_TOOL = /skill-summon__summon$/
export const MARKETPLACE_SUMMON_TOOL = 'mcp__plugin_skill-heaven_skill-summon__summon'
export const LAUNCHER_SUMMON_TOOL = 'mcp__skill-summon__summon'

/** The console watches the whole session, so zero is honest at the start. */
export function initialState(): ConsoleState {
  return {
    status: {
      ...emptyStatus(),
      reading: { kind: 'native', source: 'no-launcher' },
      skills: 0,
      summons: 0,
      summonTool: 'unknown',
    },
    entries: [],
    band: null,
    agents: [],
    agentIdsSeen: false,
    section: 'session',
    openEntry: null,
    selectedFrom: null,
    hostVersion: null,
    seq: 0,
  }
}

/* ------------------------------------------------------------------------- *
 * Reading a tool result
 * ------------------------------------------------------------------------- */

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

const looksLikeSummon = (v: unknown): v is Rec =>
  isRec(v) && ('summoned' in v || 'previewed' in v || 'noMatch' in v)

/**
 * The summon tool's `structuredContent`, wherever the host put it. The d.ts
 * says a `tool.call` result's `result` is the tool's record and does not say
 * its shape for an MCP tool, so this looks in the places it can be and falls
 * back to the JSON text block the summon server always sends beside it.
 */
export function structuredOf(r: unknown): unknown {
  if (!isRec(r)) return undefined
  const result = r.result
  if (isRec(result)) {
    if (looksLikeSummon(result.structuredContent)) return result.structuredContent
    if (looksLikeSummon(result)) return result
  }
  if (looksLikeSummon(r.structuredContent)) return r.structuredContent
  const texts: string[] = []
  if (typeof r.text === 'string') texts.push(r.text)
  if (isRec(result) && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (isRec(block) && typeof block.text === 'string') texts.push(block.text)
    }
  }
  for (const text of texts) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (looksLikeSummon(parsed)) return parsed
    } catch {
      // not JSON: keep looking
    }
  }
  return undefined
}

/* ------------------------------------------------------------------------- *
 * Agents (Flow)
 * ------------------------------------------------------------------------- */

const shortId = (id: string) => sanitizeDisplay(id, 12)

/** A label for an agent the host named only by id. */
export function agentLabelFor(state: ConsoleState, id: string | null | undefined): string {
  if (id === null || id === undefined) return 'main agent'
  const row = state.agents.find((a) => a.id === id)
  return row ? row.label : `agent ${shortId(id)}`
}

/** subagent type + the call's own description, both sanitized (they are the model's words). */
export function agentCallLabel(subagentType: unknown, description: unknown): string {
  const type = typeof subagentType === 'string' && subagentType ? sanitizeDisplay(subagentType, 24) : 'agent'
  const desc = typeof description === 'string' && description ? sanitizeDisplay(description, 48) : ''
  return desc ? `${type}  "${desc}"` : type
}

/** The host reported an agent id on a call: remember that it did, and the agent. */
export function noteAgentId(state: ConsoleState, id: string): ConsoleState {
  if (state.agents.some((a) => a.id === id)) return state.agentIdsSeen ? state : { ...state, agentIdsSeen: true }
  // An Agent call that has not been given its id yet and is still open: leave it for finishAgentCall.
  const agents: ConsoleAgent[] = [
    ...state.agents,
    { key: id, id, label: `agent ${shortId(id)}`, state: 'running' },
  ]
  return { ...state, agentIdsSeen: true, agents }
}

export function startAgentCall(state: ConsoleState, key: string, label: string, background: boolean): ConsoleState {
  if (state.agents.some((a) => a.key === key)) return state
  return {
    ...state,
    agents: [...state.agents, { key, id: null, label, state: background ? 'started' : 'running' }],
  }
}

/** The Agent call's `next` resolved. The result may carry the new agent's id. */
export function finishAgentCall(state: ConsoleState, key: string, agentId: string | null, background: boolean): ConsoleState {
  // The agent may have shown up by id (a stub row) before its call resolved: keep one, labelled row.
  const agents = state.agents
    .filter((a) => agentId === null || a.key !== agentId || a.key === key)
    .map((a) =>
      a.key === key ? { ...a, id: agentId ?? a.id, state: background ? ('started' as const) : ('returned' as const) } : a,
    )
  return { ...state, agents, agentIdsSeen: state.agentIdsSeen || agentId !== null }
}

/** The agent's own loop finished (its `turn.complete`). */
export function agentReturned(state: ConsoleState, agentId: string): ConsoleState {
  if (!state.agents.some((a) => a.id === agentId && a.state !== 'returned')) return state
  return { ...state, agents: state.agents.map((a) => (a.id === agentId ? { ...a, state: 'returned' as const } : a)) }
}

/* ------------------------------------------------------------------------- *
 * Events
 * ------------------------------------------------------------------------- */

/** Fold one observed summon-tool call into state. */
export function recordEvent(
  state: ConsoleState,
  event: SummonEvent,
  agent: string | null,
  via: ConsoleEntry['via'],
): ConsoleState {
  const id = state.seq + 1
  const entry: ConsoleEntry = { id, event, agent, via, readBy: {} }
  const entries = [...state.entries, entry].slice(-MAX_ENTRIES)
  const withAgent = agent !== null ? noteAgentId(state, agent) : state
  return {
    ...withAgent,
    status: { ...reduceStatus(state.status, event), summonTool: 'connected' },
    entries,
    band: { kind: 'event', id },
    seq: id,
  }
}

/** A Read of a path: any summoned skill whose materialized SKILL.md it is, is now in context. */
export function recordRead(state: ConsoleState, path: string, reader: string): ConsoleState {
  let changed = false
  const entries = state.entries.map((entry) => {
    const next = markRead(entry.event, path)
    if (next === entry.event) return entry
    changed = true
    const readBy = { ...entry.readBy }
    if (next.kind === 'summoned' && entry.event.kind === 'summoned') {
      const before = entry.event.skills
      next.skills.forEach((skill, i) => {
        if (skill.stage === 'in-context' && before[i]?.stage !== 'in-context') readBy[skill.id] = reader
      })
    }
    return { ...entry, event: next, readBy }
  })
  return changed ? { ...state, entries } : state
}

export function recordSelection(state: ConsoleState, reading: EntropyReading, typed: string): ConsoleState {
  return { ...withStatusReading(state, reading), selectedFrom: sanitizeDisplay(typed, 40) }
}

function withStatusReading(state: ConsoleState, reading: EntropyReading): ConsoleState {
  return { ...state, status: withReading(state.status, reading) }
}

export function entryById(state: ConsoleState, id: number): ConsoleEntry | undefined {
  return state.entries.find((e) => e.id === id)
}

/* ------------------------------------------------------------------------- *
 * What the person sees about an entry
 * ------------------------------------------------------------------------- */

export interface StageText {
  text: string
  /** True when the claim is derived by this UI (no read seen), not observed. */
  inferred: boolean
}

/** §2.3 — the card versus context distinction, in the console's own words. */
export function stageText(entry: ConsoleEntry): StageText {
  const event = entry.event
  if (event.kind !== 'summoned') return { text: 'nothing materialized', inferred: false }
  const skills = event.skills
  const inContext = skills.filter((s) => s.stage === 'in-context')
  if (skills.length > 0 && inContext.length === skills.length) {
    const readers = Array.from(new Set(inContext.map((s) => entry.readBy[s.id] ?? 'an agent')))
    return { text: `in context · body read by ${readers.join(', ')}`, inferred: false }
  }
  if (inContext.length > 0) {
    return { text: `${inContext.length} of ${skills.length} in context · the rest: card returned · body not read`, inferred: false }
  }
  return { text: 'card returned · body not read', inferred: true }
}

/** A name that may be put in the prompt as `/summon <name>`: plain characters only. */
export function summonableName(skill: SkillReceipt | undefined): string | null {
  if (!skill) return null
  const name = sanitizeDisplay(skill.name, 64)
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(name) ? name : null
}

/** §5.2: Summon is offered for a /lens preview with exactly one candidate. */
export function summonSuggestion(entry: ConsoleEntry): string | null {
  const event = entry.event
  if (event.kind !== 'previewed' || event.skills.length !== 1) return null
  return summonableName(event.skills[0])
}

export function timeLabel(at: string | null): string {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}
