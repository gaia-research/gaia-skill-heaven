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
import type { EngineInterface, PluginOptions, Register, RenderSurface } from 'claude-code'

import {
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
  dropAgentCall,
  finishAgentCall,
  fromData,
  initialState,
  noteAgentId,
  qualifyCommand,
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

// The shape tag: a reload whose code names another tag starts from a clean state
// instead of reading a value an older layout wrote.
const stateAtom = atom({ plugin: 'skill-heaven-console', key: 'state' } as const, toData(initialState()), {
  shape: 'skill-heaven-console/state@2',
})

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
  $.ui.status(mode === 'off' ? undefined : toPlain(renderStatusSegments(state.status, 'compact')))
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
  await $.ui.open({ id: PANE_ID, title: 'Skill Heaven', focus: true, closeOnEscape: true, rows: 12 })
}

/** Fire and forget, but never leave a rejection unhandled. */
function later(work: Promise<unknown>): void {
  work.catch(() => {})
}

/** Pre-fill the prompt without wiping a draft; say so when the box could not take it.
 * Skill Heaven commands are filled in the spelling the session accepts. */
async function fillPrompt($: EngineInterface, command: string): Promise<void> {
  const text = qualifyCommand(command)
  try {
    const filled = await $.prompt.fill({ text, mode: 'insert' })
    if (!filled.isFilled) $.ui.toast(`Type this: ${text}`)
  } catch {
    $.ui.toast(`Type this: ${text}`)
  }
}

async function copyText($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  try {
    const copied = await $.ui.copy({ text, surface })
    if (!copied.isCopied) $.ui.toast(`Copy this: ${text}`)
  } catch {
    $.ui.toast(`Copy this: ${text}`)
  }
}

type Preview = { event: SummonEvent; reached: boolean } | { notConnected: true }

/**
 * Ask the summon tool what it would summon, with `preview: true`.
 *
 * A tool is absent only when it is not in the session's tool list. A call to a
 * tool the list names that is rejected was aborted or failed: that is an error
 * event, and says nothing about whether the tool is connected.
 */
/** MCP servers connect in the background after session.start: observed on
 * 2.1.294, `$.tool.list()` names no MCP tool at session.start and a /lens typed in
 * the first seconds found no summon tool. An absent tool is checked again, a few
 * times, before the band says "not connected". */
const CONNECT_CHECKS = 4
const CONNECT_WAIT_MS = 1500

async function previewSummon($: EngineInterface, query: string): Promise<Preview> {
  for (let check = 1; ; check++) {
    const outcome = await previewOnce($, query)
    if (!('notConnected' in outcome) || check >= CONNECT_CHECKS) return outcome
    try {
      await $.clock.sleep(CONNECT_WAIT_MS)
    } catch {
      return outcome
    }
  }
}

async function previewOnce($: EngineInterface, query: string): Promise<Preview> {
  const listed: string[] = []
  try {
    for (const t of await $.tool.list()) if (SUMMON_TOOL.test(t.name)) listed.push(t.name)
  } catch {
    // listing is a convenience; the two known spellings are tried next
  }
  const names = [...listed]
  for (const known of [MARKETPLACE_SUMMON_TOOL, LAUNCHER_SUMMON_TOOL]) if (!names.includes(known)) names.push(known)
  const at = isoOf(await $.clock.now())
  const failed = (text: string): Preview => ({
    event: eventFromSummonResult(undefined, { at, agent: null, preview: true, query }, { isError: true, text }),
    reached: false,
  })
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
      if (listed.includes(name)) return failed('preview aborted or failed')
      continue // not in this session
    }
    if (result.deny !== undefined) return failed(`preview refused: ${result.deny}`)
    const failure = result.isError === true ? ({ isError: true, text: result.text ?? null } as const) : undefined
    return {
      event: eventFromSummonResult(failure ? undefined : structuredOf(result), { at, agent: null, preview: true, query }, failure),
      reached: true,
    }
  }
  return { notConnected: true }
}

/** The one-line result of /lens. The model reads it, so it is fixed text: nothing a
 * skill source, a tool error or a refusal supplied ever goes in it. The detail is in the band. */
function lensResultText(event: SummonEvent): string {
  if (event.kind === 'summoned' && event.delta > 0) {
    return 'Lens: this summon tool ignored preview; a skill was materialized. See the band.'
  }
  if (event.kind === 'previewed') return 'Lens preview shown in the band. Nothing was summoned.'
  if (event.kind === 'no-match') return 'Lens: no match. Nothing was summoned.'
  return 'Lens: the preview failed; see the band.'
}

export const register: Register = (on, options) => {
  const mode = modeOf(options)

  /* ----------------------------------------------------------------------- *
   * Session
   * ----------------------------------------------------------------------- */

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'heaven', description: 'Open the Skill Heaven console', argumentHint: '[inspect] [session|scope|flow|trust] | dismiss' })
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
    const args = e.args.trim().toLowerCase().split(/\s+/)
    if (args[0] === 'dismiss') {
      await $.ui.close({ id: PANE_ID })
      await change($, mode, (s) => ({ ...s, band: null, bandRequested: false }))
      return { text: 'Skill Heaven console dismissed.' }
    }
    const inspectSection = args[0] === 'inspect'
    const section = SECTIONS.find((s) => s === args[inspectSection ? 1 : 0])
    await change($, mode, (s) => ({ ...s, section: section ?? s.section, inspectSection, openEntry: null }))
    await openPane($)
    // The model reads this row: fixed text only.
    return { text: 'Skill Heaven console opened.' }
  })

  on('command.run', { command: 'lens' }, async ($, e) => {
    const query = sanitizeDisplay(e.args, 200)
    if (query === '') return { text: 'Usage: /lens <intent>. Nothing was summoned.' }
    await change($, mode, (s) => ({ ...s, band: { kind: 'looking', query }, bandRequested: true }))
    lensInFlight = true
    try {
      let outcome: Preview
      try {
        outcome = await previewSummon($, query)
      } finally {
        lensInFlight = false
      }
      if ('notConnected' in outcome) {
        await change($, mode, (s) => ({
          ...s,
          band: { kind: 'not-connected' },
          status: { ...s.status, summonTool: 'not-connected' },
        }))
        return { text: 'Lens: the summon tool is not connected.' }
      }
      const { event, reached } = outcome
      await change($, mode, (s) => recordEvent(s, event, null, 'lens', reached))
      return { text: lensResultText(event) }
    } finally {
      // however it ended, the in-flight band does not stay up
      try {
        await change($, mode, (s) => (s.band !== null && s.band.kind === 'looking' ? { ...s, band: null } : s))
      } catch {
        // nothing more to do
      }
    }
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
    let r
    try {
      r = await next(e)
    } catch (error) {
      // aborted: the call started nothing
      if (isAgentCall && key) later(change($, mode, (s) => dropAgentCall(s, key)))
      throw error
    }
    try {
      if (isAgentCall && key) {
        if (r.deny !== undefined || r.isError === true) {
          // refused or failed: no agent was started, so no row is left
          await change($, mode, (s) => dropAgentCall(s, key))
        } else {
          const record = (r as { result?: unknown }).result
          const rec = typeof record === 'object' && record !== null ? (record as Record<string, unknown>) : {}
          const id = typeof rec.agentId === 'string' ? rec.agentId : typeof rec.agent_id === 'string' ? rec.agent_id : null
          await change($, mode, (s) => finishAgentCall(s, key, id, background))
        }
      }
    } catch {
      // see above
    }
    return r
  }).catch(($, e, next) => next(e))

  // Summons: record what came back. The result is returned exactly as received.
  on('tool.call', { tool: /^mcp__(?:plugin_skill-heaven_)?skill-summon__summon$/ }, async ($, e, next) => {
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
      const args = e as unknown as Record<string, unknown>
      // a partial read (an offset or a limit) is not the body read
      const isWhole = (args.offset === undefined || args.offset === null) && (args.limit === undefined || args.limit === null)
      if (isWhole && r.deny === undefined && r.isError !== true && typeof e.file_path === 'string') {
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
    // A subagent's hand-back arrives as a prompt too (origin `peer`, observed on
    // 2.1.294): it is not the person's next prompt and selects no rung.
    if ((e as { origin?: { kind?: string } }).origin?.kind === 'peer') return next(e)
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
    if (state.band === null || !state.bandRequested) return next(e)
    const actions: BandActions = {
      inspect: (id) => {
        later(change($, mode, (s) => ({ ...s, section: 'session', openEntry: id, inspectSection: true })).then(() => openPane($)))
      },
      dismiss: () => {
        later(change($, mode, (s) => ({ ...s, band: null, bandRequested: false })))
      },
      summon: (name) => {
        later(fillPrompt($, `/summon ${name}`))
      },
    }
    const tree = renderBand($.ui.resolve(e), state, actions, e.props.bodyColumns)
    return tree ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'skill-heaven' }, async ($, e) => {
    const state = await load($)
    const actions: PaneActions = {
      inspect: () => { later(change($, mode, (s) => ({ ...s, inspectSection: !s.inspectSection, openEntry: null }))) },
      close: () => { later($.ui.close({ id: PANE_ID })) },
      section: (section) => {
        later(change($, mode, (s) => ({ ...s, section, inspectSection: false, openEntry: null })))
      },
      toggle: (id) => {
        later(change($, mode, (s) => ({ ...s, openEntry: s.openEntry === id ? null : id })))
      },
      fill: (text) => {
        later(fillPrompt($, text))
      },
      copy: (text) => {
        later(copyText($, text, e.surface))
      },
    }
    return renderPane($.ui.resolve(e), state, actions, e.props.bodyColumns)
  })
}
