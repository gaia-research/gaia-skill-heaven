// Skill Heaven console (preview) — a Claude Code mod.
//
// It projects the one status model (status-model.mjs) into the desktop and the
// terminal: a status entry, the Lens band above the prompt, and the /heaven
// pane. It OBSERVES summons; it never rewrites, refuses or issues one. Every
// tool.call hook below calls `next`, records what came back, and returns the
// result untouched. A button pre-fills a command for the person to submit; the
// UI is not an authority channel. Nothing is written to disk or to settings.
//
// The engine reads this file's source: every helper that is handed `$` is a
// function declared at the top level of this file.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import {
  describeEvent,
  eventFromSummonResult,
  renderStatusSegments,
  sanitizeDisplay,
  selectionFromCommand,
  toPlain,
} from './status-model.mjs'
import type { StatusMode, SummonEvent } from './status-model.mjs'
import { PANE_ID } from './meta.ts'
import {
  LAUNCHER_SUMMON_TOOL,
  MARKETPLACE_SUMMON_TOOL,
  SUMMON_TOOL,
  agentCallLabel,
  agentLabelFor,
  agentReturned,
  finishAgentCall,
  fromData,
  initialState,
  noteAgentId,
  recordEvent,
  recordRead,
  recordSelection,
  startAgentCall,
  structuredOf,
  toData,
} from './model.ts'
import type { ConsoleSection, ConsoleState } from './model.ts'
import { renderBand, renderPane } from './views.tsx'
import type { BandActions, PaneActions } from './views.tsx'

const stateAtom = atom({ plugin: 'skill-heaven-console', key: 'state' } as const, toData(initialState()))

const SECTIONS: readonly ConsoleSection[] = ['session', 'scope', 'flow', 'trust']

// True while this console's own /lens preview is in flight, so the summon
// observer does not record the same call twice.
let lensInFlight = false

function modeOf(options: PluginOptions): StatusMode {
  const v = options.status
  return v === 'off' || v === 'full' ? v : 'compact'
}

const isoOf = (ms: number): string => new Date(ms).toISOString()

/** Re-set the status entry from state. `off` removes it; it never touches statusLine. */
function paintStatus($: EngineInterface, mode: StatusMode, state: ConsoleState): void {
  $.ui.status(mode === 'off' ? undefined : toPlain(renderStatusSegments(state.status, mode)))
}

async function load($: EngineInterface): Promise<ConsoleState> {
  return fromData(await read($, stateAtom))
}

/** Change state, then re-set the status entry. */
async function change($: EngineInterface, mode: StatusMode, fn: (s: ConsoleState) => ConsoleState): Promise<ConsoleState> {
  const next = fromData(await update($, stateAtom, (data) => toData(fn(fromData(data)))))
  paintStatus($, mode, next)
  return next
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE_ID, title: 'Skill Heaven' })
}

/** Ask the summon tool what it would summon, with `preview: true`. */
async function previewSummon(
  $: EngineInterface,
  query: string,
): Promise<{ event: SummonEvent } | { notConnected: true } | { denied: string }> {
  const names: string[] = []
  try {
    for (const t of await $.tool.list()) if (SUMMON_TOOL.test(t.name)) names.push(t.name)
  } catch {
    // listing is a convenience; the two known spellings are tried next
  }
  for (const known of [MARKETPLACE_SUMMON_TOOL, LAUNCHER_SUMMON_TOOL]) if (!names.includes(known)) names.push(known)
  const at = isoOf(await $.clock.now())
  for (const name of names) {
    let result
    try {
      result = await $.tool.call({
        tool: name as `mcp__${string}__${string}`,
        query,
        surface: 'any',
        preview: true,
      })
    } catch {
      continue // no tool by that name in this session
    }
    if (result.deny !== undefined) return { denied: result.deny }
    const failure = result.isError === true ? ({ isError: true, text: result.text ?? null } as const) : undefined
    return {
      event: eventFromSummonResult(failure ? undefined : structuredOf(result), { at, agent: null, preview: true, query }, failure),
    }
  }
  return { notConnected: true }
}

export const register: Register = (on, options) => {
  const mode = modeOf(options)

  /* ----------------------------------------------------------------------- *
   * Session
   * ----------------------------------------------------------------------- */

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'heaven', description: 'Open the Skill Heaven console', argumentHint: '[session|scope|flow|trust]' })
    await $.command.register({
      name: 'lens',
      description: 'Preview which skill would be summoned — nothing is materialized',
      argumentHint: '<intent>',
    })
    let hostVersion: string | null = null
    try {
      hostVersion = (await $.session.version()).version
    } catch {
      hostVersion = null
    }
    await change($, mode, (s) => ({ ...s, hostVersion }))
    return next(e)
  })

  // A /clear ends the conversation without a new session.start: what the console
  // counted belongs to the conversation that is gone.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      try {
        await change($, mode, (s) => ({ ...initialState(), hostVersion: s.hostVersion }))
      } catch {
        // leave the old state rather than break the session
      }
    }
    return next(e)
  })

  /* ----------------------------------------------------------------------- *
   * Commands
   * ----------------------------------------------------------------------- */

  on('command.run', { command: 'heaven' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const section = SECTIONS.find((s) => s === arg)
    if (section) await change($, mode, (s) => ({ ...s, section }))
    await openPane($)
    return { text: 'Skill Heaven console opened. It observes this session; it changes nothing.' }
  })

  on('command.run', { command: 'lens' }, async ($, e) => {
    const query = sanitizeDisplay(e.args, 200)
    if (query === '') {
      return { text: 'Usage: /lens <intent>. It ranks skills for the intent and shows what would be summoned. Nothing is materialized.' }
    }
    await change($, mode, (s) => ({ ...s, band: { kind: 'looking' } }))
    lensInFlight = true
    let outcome: { event: SummonEvent } | { notConnected: true } | { denied: string }
    try {
      outcome = await previewSummon($, query)
    } finally {
      lensInFlight = false
    }
    if ('notConnected' in outcome) {
      await change($, mode, (s) => ({
        ...s,
        band: { kind: 'notice', text: 'summon tool not connected' },
        status: { ...s.status, summonTool: 'not-connected' },
      }))
      return { text: 'The summon tool is not connected, so there is nothing to preview. Nothing was materialized.' }
    }
    if ('denied' in outcome) {
      const reason = sanitizeDisplay(outcome.denied, 120)
      await change($, mode, (s) => ({ ...s, band: { kind: 'notice', text: `preview refused: ${reason}` } }))
      return { text: `The preview was refused: ${reason}. Nothing was materialized.` }
    }
    const { event } = outcome
    await change($, mode, (s) => recordEvent(s, event, null, 'lens'))
    return { text: `${describeEvent(event)} Nothing was materialized.` }
  })

  /* ----------------------------------------------------------------------- *
   * Observing (never changing) tool calls
   * ----------------------------------------------------------------------- */

  // Agents: the host reports an agent id on calls made inside a subagent, and the
  // Agent tool starts one. Both only add rows to Flow.
  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    const isAgentCall = String(e.tool) === 'Agent' || String(e.tool) === 'Task'
    const key = typeof e.tool_use_id === 'string' ? e.tool_use_id : ''
    const background = args.run_in_background !== false
    try {
      const reported = typeof e.agentId === 'string' ? e.agentId : null
      if (reported !== null) {
        const seen = await load($)
        if (!seen.agentIdsSeen || !seen.agents.some((a) => a.id === reported)) {
          await change($, mode, (s) => noteAgentId(s, reported))
        }
      }
      if (isAgentCall && key) {
        const label = agentCallLabel(args.subagent_type, args.description)
        await change($, mode, (s) => startAgentCall(s, key, label, background))
      }
    } catch {
      // observing must never get in the way of the call
    }
    const r = await next(e)
    try {
      if (isAgentCall && key) {
        const record = (r as { result?: unknown }).result
        const rec = typeof record === 'object' && record !== null ? (record as Record<string, unknown>) : {}
        const id = typeof rec.agentId === 'string' ? rec.agentId : typeof rec.agent_id === 'string' ? rec.agent_id : null
        await change($, mode, (s) => finishAgentCall(s, key, id, background))
      }
    } catch {
      // see above
    }
    return r
  }).catch(($, e, next) => next(e))

  // Summons: record what came back. The result is returned exactly as received.
  on('tool.call', { tool: /skill-summon__summon$/ }, async ($, e, next) => {
    const r = await next(e)
    try {
      const args = e as unknown as Record<string, unknown>
      const preview = args.preview === true
      if (r.deny === undefined && !(lensInFlight && preview)) {
        const at = isoOf(await $.clock.now())
        const agent = typeof e.agentId === 'string' ? e.agentId : null
        const failure = r.isError === true ? ({ isError: true, text: r.text ?? null } as const) : undefined
        const event = eventFromSummonResult(
          failure ? undefined : structuredOf(r),
          { at, agent, preview, query: typeof args.query === 'string' ? args.query : undefined },
          failure,
        )
        await change($, mode, (s) => recordEvent(s, event, agent, 'tool'))
      }
    } catch {
      // see above
    }
    return r
  }).catch(($, e, next) => next(e))

  // Body reads: a Read of a summoned skill's materialized SKILL.md is what puts
  // it in context. The result is returned exactly as received.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.deny === undefined && r.isError !== true && typeof e.file_path === 'string') {
        const path = e.file_path
        const current = await load($)
        const reader = agentLabelFor(current, typeof e.agentId === 'string' ? e.agentId : null)
        if (recordRead(current, path, reader) !== current) {
          await change($, mode, (s) => recordRead(s, path, reader))
        }
      }
    } catch {
      // see above
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      if (typeof e.agentId === 'string') {
        const id = e.agentId
        await change($, mode, (s) => agentReturned(s, id))
      }
    } catch {
      // see above
    }
    return next(e)
  })

  // Rung selection: the person typed /skill-heaven, /skill-hell, /skill-ultra or
  // /skill-zero. The console reads it; the prompt goes on unchanged.
  on('prompt.submit', async ($, e, next) => {
    try {
      const reading = selectionFromCommand(e.text)
      await change($, mode, (s) => {
        const seen = reading ? recordSelection(s, reading, e.text.trim()) : s
        // The band hides on the next prompt (a /lens in flight keeps its own).
        return seen.band !== null && seen.band.kind !== 'looking' ? { ...seen, band: null } : seen
      })
    } catch {
      // see above
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  /* ----------------------------------------------------------------------- *
   * Drawing
   * ----------------------------------------------------------------------- */

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const state = await load($)
    if (state.band === null) return next(e)
    const actions: BandActions = {
      inspect: (id) => {
        void change($, mode, (s) => ({ ...s, section: 'session', openEntry: id })).then(() => openPane($))
      },
      dismiss: () => {
        void change($, mode, (s) => ({ ...s, band: null }))
      },
      summon: (name) => {
        void $.prompt.fill({ text: `/summon ${name}`, mode: 'replace' })
      },
    }
    const tree = renderBand($.ui.resolve(e), state, actions, e.props.bodyColumns)
    return tree ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'skill-heaven' }, async ($, e) => {
    const state = await load($)
    const actions: PaneActions = {
      section: (section) => {
        void change($, mode, (s) => ({ ...s, section }))
      },
      toggle: (id) => {
        void change($, mode, (s) => ({ ...s, openEntry: s.openEntry === id ? null : id }))
      },
      fill: (text) => {
        void $.prompt.fill({ text, mode: 'replace' })
      },
      copy: (text) => {
        void $.ui.copy({ text, surface: e.surface })
      },
    }
    return renderPane($.ui.resolve(e), state, actions, e.props.bodyColumns)
  })
}
