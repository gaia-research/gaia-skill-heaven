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
  CHIP_LABEL,
  HARNESS_PATHS,
  ROLE_COLORS,
  eventLines,
  formatMs,
  formatScore,
  readingRung,
  renderStatusSegments,
  sanitizeDisplay,
} from './status-model.mjs'
import type { EvidenceClass, Role, Segment, SkillReceipt } from './status-model.mjs'
import { CONSOLE_VERSION, SKILL_HEAVEN_VERSION } from './meta.ts'
import { agentLabelFor, entryById, stageText, summonSuggestion, timeLabel } from './model.ts'
import type { ConsoleAgent, ConsoleEntry, ConsoleSection, ConsoleState } from './model.ts'

/** The elements every surface that draws a band or a pane has in common. */
export type UI = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button'>

export interface BandActions {
  inspect: (id: number) => void
  dismiss: () => void
  /** Pre-fills `/summon <name>` into the prompt. The person submits it. */
  summon: (name: string) => void
}

export interface PaneActions {
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
  const band = state.band
  if (band === null) return null
  const width = Math.max(20, columns)

  if (band.kind === 'looking') {
    return (
      <Box flexDirection="column" width={width}>
        {runs(ui, [
          { text: '◇', role: 'umbrella' },
          { text: ' lens  ', role: 'dim' },
          { text: 'looking…', role: 'ink' },
        ])}
        <Button key="dismiss" label="Dismiss" role="dismiss" onPress={() => actions.dismiss()} />
      </Box>
    )
  }

  if (band.kind === 'notice') {
    return (
      <Box flexDirection="column" width={width}>
        {runs(ui, [
          { text: '◇', role: 'umbrella' },
          { text: ' lens  ', role: 'dim' },
          { text: '? ', role: 'amber' },
          { text: sanitizeDisplay(band.text, 90), role: 'ink' },
        ])}
        <Button key="dismiss" label="Dismiss" role="dismiss" onPress={() => actions.dismiss()} />
      </Box>
    )
  }

  const entry = entryById(state, band.id)
  if (!entry) return null
  const [line1, line2] = eventLines(entry.event)
  const stage = stageText(entry)
  const name = summonSuggestion(entry)
  return (
    <Box flexDirection="column" width={width}>
      {line1 ? runs(ui, line1) : null}
      {line2 ? runs(ui, line2) : null}
      <Text dimColor italic={stage.inferred}>
        {'  '}
        {stage.text}
        {stage.inferred ? ' (inferred)' : ''}
      </Text>
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
      {state.section === 'session' ? sessionSection(ui, state, actions) : null}
      {state.section === 'scope' ? scopeSection(ui, state, actions) : null}
      {state.section === 'flow' ? flowSection(ui, state) : null}
      {state.section === 'trust' ? trustSection(ui, state) : null}
    </Box>
  )
}

/* -- evidence-labelled rows ------------------------------------------------ */

interface Field {
  name: string
  value: string | null
  evidence: EvidenceClass
}

const FIELD_WIDTH = 16

function fieldRow(ui: UI, f: Field, key: string): RenderElement {
  const { Box, Text } = ui
  const known = f.value !== null && f.value !== '' && f.evidence !== 'unknown'
  const label = f.evidence === 'inferred' ? 'inferred' : f.evidence === 'unknown' || !known ? 'unknown' : f.evidence
  return (
    <Box key={key} flexDirection="row" flexWrap="wrap">
      <Text dimColor>{f.name.padEnd(FIELD_WIDTH)}</Text>
      <Text italic={f.evidence === 'inferred'}>{known ? f.value : '—'}</Text>
      <Text dimColor>{`  ${label}`}</Text>
    </Box>
  )
}

const DIRECTION_WORD: Record<string, string> = {
  manual: 'any (explicit /summon)',
  converge: 'heaven (converge)',
  explore: 'hell (explore)',
  unspecified: 'unspecified',
}

const LANE_WORD: Record<string, string> = {
  'human-led': 'human-led (Skill Heaven lane)',
  'model-led': 'model-led (Skill Hell lane)',
  unspecified: 'unspecified (the source did not classify it)',
}

function healthText(entry: ConsoleEntry): string | null {
  const event = entry.event
  if (!('sourceHealth' in event)) return null
  const h = event.sourceHealth
  if (h.kind === 'unknown') return null
  const age = h.indexAgeDays === null ? '' : ` · index ${h.indexAgeDays} days old`
  return h.kind === 'stale' ? `? stale${age} · ranking still ran` : `fresh${age}`
}

function skillFields(skill: SkillReceipt, entry: ConsoleEntry): Field[] {
  const stage: Field =
    skill.stage === 'in-context'
      ? { name: 'what entered', value: `body read (in context) by ${entry.readBy[skill.id] ?? 'an agent'}`, evidence: 'observed' }
      : skill.stage === 'materialized'
        ? { name: 'what entered', value: 'card returned · body not read', evidence: 'inferred' }
        : skill.stage === 'previewed'
          ? { name: 'what entered', value: 'previewed · nothing materialized', evidence: 'reported' }
          : { name: 'what entered', value: 'materialized · read not observed', evidence: 'inferred' }
  const rank: string[] = []
  if (skill.matchKind !== 'unknown') rank.push(skill.matchKind)
  const score = formatScore(skill.score)
  if (score) rank.push(score)
  const margin = formatScore(skill.margin)
  if (margin) rank.push(`Δ ${margin} (margin is a retrieval diagnostic)`)
  const from: string[] = []
  if (skill.source) from.push(sanitizeDisplay(skill.source, 48))
  if (skill.repoUrl) from.push(sanitizeDisplay(skill.repoUrl, 64) + (skill.ref ? `@${sanitizeDisplay(skill.ref, 24)}` : ''))
  if (skill.subpath) from.push(sanitizeDisplay(skill.subpath, 48))
  if (skill.sha256) from.push(`sha256 ${sanitizeDisplay(skill.sha256, 12)}…`)
  const cache: string[] = []
  if (skill.cache !== 'unknown') cache.push(skill.cache)
  const ms = formatMs(skill.ms)
  if (ms) cache.push(ms)
  const installability =
    skill.installability === 'unknown' ? null : sanitizeDisplay(skill.installability, 40)
  return [
    stage,
    { name: 'ranking', value: rank.length ? rank.join(' · ') : null, evidence: rank.length ? 'reported' : 'unknown' },
    { name: 'from', value: from.length ? from.join(' · ') : null, evidence: from.length ? 'reported' : 'unknown' },
    {
      name: 'lane',
      value: LANE_WORD[skill.lane] ?? null,
      evidence: LANE_WORD[skill.lane] ? 'reported' : 'unknown',
    },
    {
      name: 'installability',
      value: installability,
      evidence: installability ? 'reported' : 'unknown',
    },
    { name: 'cache', value: cache.length ? cache.join(' · ') : null, evidence: cache.length ? 'reported' : 'unknown' },
    { name: 'on disk', value: skill.path ? sanitizeDisplay(skill.path, 96) : null, evidence: skill.path ? 'reported' : 'unknown' },
  ]
}

function receiptFields(entry: ConsoleEntry, state: ConsoleState): Field[][] {
  const event = entry.event
  const common: Field[] = []
  const query = 'query' in event && event.query ? `query "${sanitizeDisplay(event.query, 80)}" · surface ${DIRECTION_WORD[event.direction] ?? 'unspecified'}` : null
  const health = healthText(entry)
  const agent: Field = {
    name: 'agent',
    value: agentLabelFor(state, entry.agent),
    evidence: 'observed',
  }
  if (event.kind === 'summoned' || event.kind === 'previewed') {
    const groups: Field[][] = []
    common.push({ name: 'why', value: query, evidence: query ? 'reported' : 'unknown' })
    if (event.kind === 'summoned') {
      const comp =
        event.composition === 'relevance-only'
          ? `relevance-only · Arbor: ${event.arbor === 'governed-record' ? 'governed record' : event.arbor === 'no-record' ? 'no governed record' : event.arbor}`
          : null
      common.push({ name: 'composition', value: comp, evidence: comp ? 'reported' : 'unknown' })
    }
    common.push({ name: 'source health', value: health, evidence: health ? 'reported' : 'unknown' }, agent)
    groups.push(common)
    for (const skill of event.skills.slice(0, 3)) groups.push([{ name: 'skill', value: sanitizeDisplay(skill.name, 48), evidence: 'reported' }, ...skillFields(skill, entry)])
    return groups
  }
  if (event.kind === 'no-match') {
    return [
      [
        { name: 'what entered', value: 'nothing materialized', evidence: 'reported' },
        { name: 'why', value: query, evidence: query ? 'reported' : 'unknown' },
        {
          name: 'refusal',
          value:
            (event.considered === null ? '0 admitted' : `${event.considered} considered · 0 admitted`) +
            (event.reason ? ` · ${sanitizeDisplay(event.reason, 60)}` : ''),
          evidence: 'reported',
        },
        { name: 'source health', value: health, evidence: health ? 'reported' : 'unknown' },
        agent,
      ],
    ]
  }
  return [
    [
      { name: 'what entered', value: 'nothing materialized', evidence: 'reported' },
      { name: 'reason', value: sanitizeDisplay(event.reason, 120), evidence: 'observed' },
      agent,
    ],
  ]
}

/* -- Session ----------------------------------------------------------------- */

function sessionSection(ui: UI, state: ConsoleState, actions: PaneActions): RenderElement {
  const { Box, Text, Button } = ui
  const rows = [...state.entries].reverse()
  return (
    <Box flexDirection="column" gap={1}>
      {state.status.summonTool === 'not-connected' ? (
        <Text>
          <Text color={ROLE_COLORS.amber.hex}>{'? '}</Text>
          <Text>{'summon tool: not connected'}</Text>
          <Text dimColor>{`  /summon and /lens cannot reach the Skill Heaven plugin. ${HARNESS_PATHS.find((h) => h.id === 'claude')?.commands[1] ?? ''}`}</Text>
        </Text>
      ) : null}
      {rows.length === 0 ? (
        <Text>
          {'Nothing summoned yet. Try '}
          <Text bold>{'/summon <need>'}</Text>
          {' or '}
          <Text bold>{'/lens <need>'}</Text>
          {'.'}
        </Text>
      ) : null}
      {rows.map((entry) => {
        const lines = eventLines(entry.event)
        const open = state.openEntry === entry.id
        const meta = [timeLabel(entry.event.at), agentLabelFor(state, entry.agent), entry.via === 'lens' ? '/lens' : ''].filter(Boolean).join(' · ')
        return (
          <Box key={`entry-${entry.id}`} flexDirection="column">
            {lines[0] ? runs(ui, [...lines[0], { text: meta ? `   ${meta}` : '', role: 'dim' }]) : null}
            {lines[1] ? runs(ui, lines[1]) : null}
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
                    {receiptFields(entry, state).map((group, gi) => (
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
      <Text dimColor>
        {'Evidence: observed = this console saw it · reported = the summon engine said so · inferred = derived here · unknown = no source.'}
      </Text>
    </Box>
  )
}

/* -- Scope ------------------------------------------------------------------- */

export const ULTRA_COPY =
  'Skill Ultra · provisioned. Controller unavailable — no controller is choosing direction or depth yet. Ultra is the rung you selected; each summon is still judged per use. The long-horizon controller is tracked in #126 and is not yet empirically validated.'

function latestSource(state: ConsoleState): { source: string | null; health: string | null; unavailable: boolean } {
  const last = state.entries[state.entries.length - 1]
  const unavailable = last?.event.kind === 'unavailable'
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const e = state.entries[i]!
    const event = e.event
    if ('skills' in event) {
      const withSource = event.skills.find((s) => s.source)
      if (withSource?.source) return { source: sanitizeDisplay(withSource.source, 56), health: healthText(e), unavailable }
    }
  }
  return { source: null, health: last ? healthText(last) : null, unavailable }
}

function scopeSection(ui: UI, state: ConsoleState, actions: PaneActions): RenderElement {
  const { Box, Text, Button } = ui
  const { source, health, unavailable } = latestSource(state)
  const reading = state.status.reading
  const rung = reading.kind === 'selected' ? reading.rung : null
  const ultra = readingRung(reading) === 'ultra'
  const skills = state.status.skills
  const fields: Field[] = [
    {
      name: 'can see',
      value: unavailable
        ? `skill source ${source ?? ''} · unreachable`.replace('  ', ' ')
        : source
          ? `skill source ${source}${health ? ` · ${health}` : ''}`
          : null,
      evidence: source || unavailable ? 'reported' : 'unknown',
    },
    {
      name: 'active',
      value:
        skills === null
          ? null
          : `${skills} ${skills === 1 ? 'skill' : 'skills'} materialized this session (temporary — gone when the session ends)`,
      evidence: skills === null ? 'unknown' : 'observed',
    },
    {
      name: 'inherited',
      value: 'boot reading NATIVE — no launcher observed; this console cannot see how the session was started',
      evidence: 'inferred',
    },
    {
      name: 'selected',
      value:
        rung === null
          ? 'none — no rung selected in this session'
          : ultra
            ? 'rung ULTRA · controller unavailable'
            : `rung ${rung.toUpperCase()} — observed from ${state.selectedFrom ?? 'a rung command'} · not enforced`,
      evidence: rung === null ? 'unknown' : 'observed',
    },
    { name: 'allowed', value: '/summon by hand: yes · zero cut: temporary (default)', evidence: 'reported' },
    { name: 'keep small', value: '/skill-zero cuts temporary skills · claude-zero --level zero starts clean', evidence: 'reported' },
  ]
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">{fields.map((f, i) => fieldRow(ui, f, `scope-${i}`))}</Box>
      {rung !== null && !ultra ? (
        <Text dimColor>{`You selected ${rung.toUpperCase()}. Skill Heaven does not enforce a rung; each summon is still judged per use.`}</Text>
      ) : null}
      {ultra ? <Text color={ROLE_COLORS.ultra.hex}>{ULTRA_COPY}</Text> : null}
      <Box flexDirection="column">
        <Text bold>Choose a rung</Text>
        <Text dimColor>These fill your prompt. You press Enter; nothing runs until you do.</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="fill-heaven" label="/skill-heaven low" onPress={() => actions.fill('/skill-heaven low')} />
          <Button key="fill-hell" label="/skill-hell high" onPress={() => actions.fill('/skill-hell high')} />
          <Button key="fill-ultra" label="/skill-ultra" onPress={() => actions.fill('/skill-ultra')} />
        </Box>
        <Text dimColor>{'Other rungs: /skill-heaven med · /skill-hell xhigh · /skill-hell max'}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Keep context small</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="fill-zero" label="/skill-zero" onPress={() => actions.fill('/skill-zero')} />
          <Button key="fill-zero-all" label="/skill-zero all" onPress={() => actions.fill('/skill-zero all')} />
          <Button key="copy-clean" label="Copy: claude-zero --level zero" onPress={() => actions.copy('claude-zero --level zero')} />
        </Box>
        <Text dimColor>Start clean is run in a terminal before a session: it is copied, not run.</Text>
      </Box>
    </Box>
  )
}

/* -- Flow -------------------------------------------------------------------- */

const MAX_AGENT_ROWS = 12

function agentLine(state: ConsoleState, agent: ConsoleAgent): string {
  const mine = state.entries.filter((e) => e.agent !== null && e.agent === agent.id && e.event.kind === 'summoned')
  const skills = mine.reduce((n, e) => n + (e.event.kind === 'summoned' ? e.event.delta : 0), 0)
  const word = agent.state === 'started' ? 'started in background' : agent.state
  return `${word} · ${mine.length === 0 ? 'no skills' : `${mine.length} ${mine.length === 1 ? 'summon' : 'summons'}`}${skills > 0 && skills !== mine.length ? ` (${skills} skills)` : ''}`
}

function flowSection(ui: UI, state: ConsoleState): RenderElement {
  const { Box, Text } = ui
  const mainSummons = state.entries.filter((e) => e.agent === null && e.event.kind === 'summoned')
  const mainInContext = mainSummons.reduce(
    (n, e) => n + (e.event.kind === 'summoned' ? e.event.skills.filter((s) => s.stage === 'in-context').length : 0),
    0,
  )
  const shown = state.agents.slice(0, MAX_AGENT_ROWS)
  const more = state.agents.length - shown.length
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          <Text bold>main</Text>
          <Text dimColor>{`   ${mainSummons.length} ${mainSummons.length === 1 ? 'summon' : 'summons'} · ${mainInContext} in context`}</Text>
        </Text>
        {shown.map((agent, i) => {
          const last = i === shown.length - 1 && more <= 0
          return (
            <Text>
              <Text dimColor>{last ? '└─ ' : '├─ '}</Text>
              <Text>{sanitizeDisplay(agent.label, 64)}</Text>
              <Text dimColor>{`   ${agentLine(state, agent)}`}</Text>
            </Text>
          )
        })}
        {more > 0 ? (
          <Text dimColor>{`└─ +${more} more`}</Text>
        ) : null}
      </Box>
      {!state.agentIdsSeen ? (
        <Text dimColor>
          {'This host did not report agent ids. Summons are attributed to main.'}
        </Text>
      ) : null}
      {state.entries.length >= 50 ? <Text dimColor>Counts cover the last 50 events.</Text> : null}
      <Text dimColor>Read-only. Only agents the host reported appear.</Text>
    </Box>
  )
}

/* -- Trust ------------------------------------------------------------------- */

function trustSection(ui: UI, state: ConsoleState): RenderElement {
  const { Box, Text } = ui
  const claude = HARNESS_PATHS.find((h) => h.id === 'claude')!
  const mcp = state.status.summonTool
  const mcpText =
    mcp === 'connected' ? 'connected (a summon result was seen)' : mcp === 'not-connected' ? 'not connected' : 'unknown until the first summon or /lens'
  const row = (name: string, value: string, key: string) => (
    <Box key={key} flexDirection="row" flexWrap="wrap">
      <Text dimColor>{name.padEnd(FIELD_WIDTH)}</Text>
      <Text>{value}</Text>
    </Box>
  )
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {row('skill-heaven', `${SKILL_HEAVEN_VERSION} · gaia-research/gaia-skill-heaven · bundles one MCP server (skill-summon)`, 't1')}
        {row('console (preview)', `${CONSOLE_VERSION} · same repository · runs inside Claude Code as local code`, 't2')}
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {row('reads', 'summon tool results · your /skill-* commands · Read/Agent tool calls (to observe, never to change)', 't3')}
        {row('writes', 'nothing to disk · session-only $.state', 't4')}
        {row('network', "none of its own; /lens calls the bundled summon tool, which fetches the skill source", 't5')}
        {row('disable', '/plugin disable skill-heaven-console — the status entry, band and pane disappear; Skill Heaven is unchanged', 't6')}
      </Box>
      <Box flexDirection="column">
        {row('summon tool', `MCP: ${mcpText}`, 't7')}
        {row(
          'harness',
          `Claude Code ${state.hostVersion ? sanitizeDisplay(state.hostVersion, 24) : '(version not reported)'} · ${CHIP_LABEL[claude.chip]} for the plugin at ${claude.probedVersion ?? 'unknown'}; the console needs a local probe`,
          't8',
        )}
        {row('evidence', claude.evidence, 't9')}
      </Box>
      <Text dimColor>This lists what the code can do. It does not rate it.</Text>
    </Box>
  )
}
