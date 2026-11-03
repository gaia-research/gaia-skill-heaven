// Drawing: the Lens band and the /heaven pane, as trees of the surface's own
// elements. Pure functions of state — no `$`, no writes. A press is handed back
// to the hook that drew the tree through the `actions` objects below, so this
// file cannot change anything by itself.
//
// Every string that came from the network or from a model (skill names, queries,
// sources, reasons, agent labels) reaches the screen through the status model's
// sanitizer or its renderers. Colour is never the only carrier of meaning: each
// state keeps its glyph and its word.

import type { Elements, RenderElement } from 'claude-code'

import {
  ROLE_COLORS,
  buildConsoleView,
  renderConsoleText,
  flowView,
  harnessById,
  lensView,
  renderStatusSegments,
  scopeView,
  sessionView,
  trustView,
  evidenceWord,
} from './status-model.mjs'
import type { Role, Row, Segment } from './status-model.mjs'
import { qualifyCommand, summonSuggestion, entryById } from './model.ts'
import type { ConsoleSection, ConsoleState } from './model.ts'

const CLAUDE = harnessById('claude')

/** The elements every surface that draws a band or a pane has in common. */
export type UI = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button'>

export interface BandActions {
  inspect: (id: number) => void
  dismiss: () => void
  /** Pre-fills `/summon <name>` into the prompt. The person submits it. */
  summon: (name: string) => void
}

export interface PaneActions {
  inspect: () => void
  close: () => void
  section: (section: ConsoleSection) => void
  toggle: (id: number) => void
  /** Pre-fills a command into the prompt. The person submits it. */
  fill: (text: string) => void
  copy: (text: string) => void
}

/* ------------------------------------------------------------------------- *
 * Colour: roles from the one palette. `ink` is the theme's own text colour,
 * `dim` is the theme's dim; every other role is its palette hex.
 * ------------------------------------------------------------------------- */

type StyleProps = { color?: string; dimColor?: boolean; italic?: boolean; bold?: boolean }

function styleOf(role: Role): StyleProps {
  if (role === 'ink') return {}
  if (role === 'dim') return { dimColor: true }
  return { color: ROLE_COLORS[role].hex }
}

function runs(ui: UI, segments: readonly Segment[], extra: StyleProps = {}): RenderElement {
  const { Text } = ui
  return (
    <Text>
      {segments.map((s) => (
        <Text {...styleOf(s.role)} {...extra}>
          {s.text}
        </Text>
      ))}
    </Text>
  )
}

/* ------------------------------------------------------------------------- *
 * The Lens band — empty by default (the hook returns next(e) for null).
 * ------------------------------------------------------------------------- */

export function renderBand(ui: UI, state: ConsoleState, actions: BandActions, columns: number): RenderElement | null {
  const { Box, Text, Button } = ui
  const view = lensView(state, CLAUDE.console)
  if (view === null || !state.bandRequested) return null
  const width = Math.max(20, columns)
  const [first] = view.lines

  if (view.entryId === null) {
    return (
      <Box flexDirection="column" width={width}>
        {first ? runs(ui, first) : null}
        <Button key="dismiss" label="Dismiss" role="dismiss" onPress={() => actions.dismiss()} />
      </Box>
    )
  }

  const entry = entryById(state, view.entryId)
  if (!entry) return null
  const name = summonSuggestion(entry)
  return (
    <Box flexDirection="column" width={width}>
      {first ? runs(ui, first) : null}
      {/* a preview's second line already says "nothing materialized" (seen twice live on 2.1.294) */}
      {view.stage === null ? null : (
        <Text key="stage" dimColor italic={view.stage.inferred}>
          {'  '}
          {view.stage.text}
          {view.stage.inferred ? ' (inferred)' : ''}
        </Text>
      )}
      <Box flexDirection="row" gap={1}>
        {name !== null ? <Button key="summon" label="Summon" variant="primary" onPress={() => actions.summon(name)} /> : null}
        <Button key="inspect" label="Inspect" onPress={() => actions.inspect(entry.id)} />
        <Button key="dismiss" label="Dismiss" role="dismiss" onPress={() => actions.dismiss()} />
      </Box>
    </Box>
  )
}

/* ------------------------------------------------------------------------- *
 * The /heaven pane
 * ------------------------------------------------------------------------- */

const SECTIONS: ReadonlyArray<{ id: ConsoleSection; label: string; hotkey: string }> = [
  { id: 'session', label: 'Session', hotkey: '1' },
  { id: 'scope', label: 'Scope', hotkey: '2' },
  { id: 'flow', label: 'Flow', hotkey: '3' },
  { id: 'trust', label: 'Trust', hotkey: '4' },
]

export function renderPane(ui: UI, state: ConsoleState, actions: PaneActions, columns: number): RenderElement {
  const { Box, Text, Button } = ui
  const width = Math.max(24, columns)
  return (
    <Box flexDirection="column" width={width} gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold>Skill Heaven</Text>
          <Text color={ROLE_COLORS.amber.hex}>{'  PREVIEW'}</Text>
          <Text dimColor>{'  console · observes, never changes'}</Text>
        </Text>
        {runs(ui, renderStatusSegments(state.status, 'full'))}
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {SECTIONS.map((s) => (
          <Button
            key={`section-${s.id}`}
            label={s.label}
            hotkey={s.hotkey}
            variant={state.section === s.id ? 'primary' : 'secondary'}
            onPress={() => actions.section(s.id)}
          />
        ))}
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="inspect-section" label={state.inspectSection ? 'Back to summary' : 'Inspect section'} onPress={() => actions.inspect()} />
        <Button key="close-pane" label="Close" role="dismiss" onPress={() => actions.close()} />
      </Box>
      {!state.inspectSection ? <Text>{renderConsoleText(buildConsoleView(state, CLAUDE), { surface: state.section }).split('\n').slice(1, -1).join('\n')}</Text> : null}
      {state.inspectSection && state.section === 'session' ? sessionSection(ui, state, actions) : null}
      {state.inspectSection && state.section === 'scope' ? scopeSection(ui, state, actions) : null}
      {state.inspectSection && state.section === 'flow' ? flowSection(ui, state) : null}
      {state.inspectSection && state.section === 'trust' ? trustSection(ui, state) : null}
    </Box>
  )
}

/* -- evidence-labelled rows ------------------------------------------------ */

const FIELD_WIDTH = 16

function fieldRow(ui: UI, f: Row, key: string): RenderElement {
  const { Box, Text } = ui
  const known = f.value !== null && f.value !== '' && f.evidence !== 'unknown'
  return (
    <Box key={key} flexDirection="row" flexWrap="wrap">
      <Text dimColor>{f.label.padEnd(FIELD_WIDTH)}</Text>
      <Text italic={f.evidence === 'inferred'}>{known ? f.value : '—'}</Text>
      <Text dimColor>{`  ${evidenceWord(f)}`}</Text>
    </Box>
  )
}

/* -- Session ----------------------------------------------------------------- */

function sessionSection(ui: UI, state: ConsoleState, actions: PaneActions): RenderElement {
  const { Box, Text, Button } = ui
  const view = sessionView(state, CLAUDE.console)
  return (
    <Box flexDirection="column" gap={1}>
      {view.notConnected ? (
        <Text>
          <Text color={ROLE_COLORS.amber.hex}>{'? '}</Text>
          <Text>{'summon tool: not connected'}</Text>
          <Text dimColor>{`  /summon and /lens cannot reach the Skill Heaven plugin. ${CLAUDE.core.register[1]?.run ?? ''}`}</Text>
        </Text>
      ) : null}
      {view.empty !== null ? (
        <Text>
          {'Nothing summoned yet. Try '}
          <Text bold>{`${qualifyCommand('/summon')} <need>`}</Text>
          {' or '}
          <Text bold>{'/lens <need>'}</Text>
          {'.'}
        </Text>
      ) : null}
      {view.entries.map((entry) => {
        const open = state.openEntry === entry.id
        const [line1, line2] = entry.lines
        return (
          <Box key={`entry-${entry.id}`} flexDirection="column">
            {line1 ? runs(ui, [...line1, { text: entry.meta ? `   ${entry.meta}` : '', role: 'dim' }]) : null}
            {line2 ? runs(ui, line2) : null}
            <Button
              key={`toggle-${entry.id}`}
              label={open ? 'Hide receipt' : 'Receipt'}
              plain
              dimColor
              onPress={() => actions.toggle(entry.id)}
            />
            {open
              ? (
                  <Box flexDirection="column" marginLeft={2} gap={1}>
                    {entry.groups.map((group, gi) => (
                      <Box key={`group-${gi}`} flexDirection="column">
                        {group.map((f, fi) => fieldRow(ui, f, `f-${gi}-${fi}`))}
                      </Box>
                    ))}
                  </Box>
                )
              : null}
          </Box>
        )
      })}
      <Text dimColor>{view.legend}</Text>
    </Box>
  )
}

/* -- Scope ------------------------------------------------------------------- */

const RUNG_KEYS = ['fill-heaven', 'fill-hell', 'fill-ultra'] as const
const KEEP_KEYS = ['fill-zero', 'fill-zero-all', 'copy-clean'] as const

function scopeSection(ui: UI, state: ConsoleState, actions: PaneActions): RenderElement {
  const { Box, Text, Button } = ui
  const view = scopeView(state, CLAUDE)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">{view.rows.map((f, i) => fieldRow(ui, f, `scope-${i}`))}</Box>
      {view.note !== null ? <Text dimColor>{view.note}</Text> : null}
      {view.ultra !== null ? <Text color={ROLE_COLORS.ultra.hex}>{view.ultra}</Text> : null}
      <Box flexDirection="column">
        <Text bold>Choose a rung</Text>
        <Text dimColor>These fill your prompt. You press Enter; nothing runs until you do.</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {view.rungControls.map((c, i) => (
            <Button key={RUNG_KEYS[i] ?? `rung-${i}`} label={c.label} onPress={() => actions.fill(c.text)} />
          ))}
        </Box>
        <Text dimColor>{view.otherRungs}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Keep context small</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {view.keepSmall.map((c, i) => (
            <Button
              key={KEEP_KEYS[i] ?? `keep-${i}`}
              label={c.label}
              onPress={() => (c.kind === 'copy' ? actions.copy(c.text) : actions.fill(c.text))}
            />
          ))}
        </Box>
        {view.keepSmallNote !== null ? <Text dimColor>{view.keepSmallNote}</Text> : null}
      </Box>
    </Box>
  )
}

/* -- Flow -------------------------------------------------------------------- */

function flowSection(ui: UI, state: ConsoleState): RenderElement {
  const { Box, Text } = ui
  const view = flowView(state, CLAUDE.console)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold>main</Text>
          <Text dimColor>{`   ${view.main.line}`}</Text>
        </Text>
        {view.agents.map((agent) => (
          <Text>
            <Text dimColor>{agent.last ? '└─ ' : '├─ '}</Text>
            <Text>{agent.label}</Text>
            <Text dimColor>{`   ${agent.line}`}</Text>
          </Text>
        ))}
        {view.more > 0 ? <Text dimColor>{`└─ +${view.more} more`}</Text> : null}
      </Box>
      {view.telemetryNote !== null ? <Text dimColor>{view.telemetryNote}</Text> : null}
      {view.windowNote !== null ? <Text dimColor>{view.windowNote}</Text> : null}
      <Text dimColor>{view.footer}</Text>
    </Box>
  )
}

/* -- Trust ------------------------------------------------------------------- */

function trustSection(ui: UI, state: ConsoleState): RenderElement {
  const { Box, Text } = ui
  const view = trustView(state, CLAUDE)
  const row = (r: Row, key: string) => fieldRow(ui, { ...r, label: r.label }, key)
  return (
    <Box flexDirection="column" gap={1}>
      {view.components.map((c) => (
        <Box key={`c-${c.id}`} flexDirection="column">
          <Text>
            <Text bold>{c.id}</Text>
            <Text dimColor>{`  ${c.version} · ${c.profile === 'full' ? 'Full only' : 'Core'} · ${c.kind}`}</Text>
          </Text>
          <Text dimColor>{c.summary}</Text>
          <Box flexDirection="column" marginLeft={2}>
            {c.rows.map((r, i) => row(r, `c-${c.id}-${i}`))}
            {c.notes.map((n, i) => (
              <Text key={`c-${c.id}-n-${i}`} dimColor>{n}</Text>
            ))}
          </Box>
        </Box>
      ))}
      <Box flexDirection="column">{view.rows.map((r, i) => row(r, `t-${i}`))}</Box>
      <Text dimColor>{view.footer}</Text>
    </Box>
  )
}
