// The console's pure logic for Claude Code: how observed facts fold into session state.
//
// The folding itself is shared by every host — `packages/status/src/console-state.ts`,
// reached here through the committed bundle (`status-model.mjs`) — so Claude Code,
// Pi, Codex, Hermes, Grok and Antigravity all treat an observation the same way.
// This file only adds what is Claude-specific: the pane's own UI state (`section`,
// `openEntry`), the exact tool names the host spells, and the `reached` shorthand
// the hooks use.
//
// No `$`, no engine, no I/O here.

import {
  agentCallLabel,
  agentLabelFor,
  agentReturned,
  dropAgentCall,
  entryById,
  finishAgentCall,
  initialConsoleState,
  noteAgentId,
  qualifyCommand as qualifyShared,
  recordEvent as recordShared,
  recordRead,
  recordSelection,
  startAgentCall,
  stageText,
  structuredOf,
  summonSuggestion,
  summonableName,
  timeLabel,
} from './status-model.mjs'
import type { SkillHeavenStatus, SummonEvent } from './status-model.mjs'
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

export { MAX_ENTRIES, MAX_AGENTS, MAX_SKILLS_PER_ENTRY } from './status-model.mjs'

/** The summon tool, however the session spells it:
 * `mcp__plugin_skill-heaven_skill-summon__summon` (marketplace install) or
 * `mcp__skill-summon__summon` (launcher). Anchored at both ends: a server that
 * merely ends in "skill-summon" (`mcp__evil-skill-summon__summon`) is not it.
 * register.tsx spells the same pattern as a literal in its tool.call matcher;
 * a repository test holds the two equal. */
export const SUMMON_TOOL = /^mcp__(?:plugin_skill-heaven_)?skill-summon__summon$/
export const MARKETPLACE_SUMMON_TOOL = 'mcp__plugin_skill-heaven_skill-summon__summon'
export const LAUNCHER_SUMMON_TOOL = 'mcp__skill-summon__summon'

/** The console watches the whole session, so zero is honest at the start. */
export function initialState(): ConsoleState {
  return { ...initialConsoleState(), section: 'session', openEntry: null } as unknown as ConsoleState
}

/** Fold one observed summon-tool call into state. `reached` is false when the call
 * never got an answer from the tool (a /lens preview that was aborted or refused):
 * that says nothing about whether the tool is connected. Claude Code shows every
 * Read, so a materialized skill whose body was not read is *inferred* "not read". */
export function recordEvent(
  state: ConsoleState,
  event: SummonEvent,
  agent: string | null,
  via: ConsoleEntry['via'],
  reached = true,
): ConsoleState {
  return recordShared(state, event, agent, via, { reached, readObservable: true })
}

/** The spelling of a Skill Heaven command this session accepts (Claude Code 2.1.294 refuses the bare ones). */
export const qualifyCommand = (text: string): string => qualifyShared(text, 'skill-heaven:')

export {
  agentCallLabel,
  agentLabelFor,
  agentReturned,
  dropAgentCall,
  entryById,
  finishAgentCall,
  noteAgentId,
  recordRead,
  recordSelection,
  startAgentCall,
  stageText,
  structuredOf,
  summonSuggestion,
  summonableName,
  timeLabel,
}
