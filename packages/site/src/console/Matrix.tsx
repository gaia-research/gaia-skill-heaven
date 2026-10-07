import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { eventLines, renderStatusSegments, toPlain } from '@gaia-skill-heaven/status'
import { Scroller } from './Pieces'
import type { EventEntry, StatusEntry } from './types'

/**
 * The §6 interaction-state matrix. Text that a renderer produces is rendered
 * by that renderer (status compact line, Lens first and second lines); the
 * rest are links to the specimen on this page. A cell the model cannot express
 * says so, as a GAP — it is not filled with invented copy.
 */
type Cell =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'status'; key: string }
  | { kind: 'event'; key: string }
  | { kind: 'gap'; text: string }
  | { kind: 'route'; text: string; to: string }

const none: Cell = { kind: 'none' }
const link = (text: string, href: string): Cell => ({ kind: 'link', text, href })

interface Row {
  id: string
  state: string
  status: Cell
  lens: Cell
  session: Cell
  scope: Cell
  flow: Cell
  trust: Cell
  start: Cell
}

const COLUMNS = ['Status entry', 'Lens', 'Session', 'Scope', 'Flow', 'Trust', '/start'] as const

function rows(staleDays: number | null): Row[] {
  return [
    {
      id: 'empty',
      state: 'empty (fresh session)',
      status: { kind: 'status', key: 'fresh' },
      lens: link('nothing — the band is empty', '#lens-idle'),
      session: link('“Nothing summoned yet…”', '#session-empty'),
      scope: link('sources shown, active: none', '#scope-fresh'),
      flow: link('main · no skills', '#flow-fresh'),
      trust: link('normal', '#trust-panel'),
      start: none,
    },
    {
      id: 'loading',
      state: 'loading (/lens in flight)',
      status: { kind: 'text', text: 'unchanged' },
      lens: { kind: 'gap', text: 'The model has no in-flight state; nothing renders “looking…”.' },
      session: none,
      scope: none,
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'no-match',
      state: 'no-match',
      status: { kind: 'text', text: 'unchanged' },
      lens: { kind: 'event', key: 'noMatch' },
      session: link('row, refusal reason', '#session-noMatch'),
      scope: none,
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'stale',
      state: 'stale source',
      status: { kind: 'text', text: 'unchanged' },
      lens: { kind: 'event', key: 'stale' },
      session: link('flag on row', '#session-stale'),
      scope: link(staleDays === null ? 'index age unknown' : `index ${staleDays} days old`, '#scope-stale'),
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'unavailable',
      state: 'unavailable source',
      status: { kind: 'text', text: 'unchanged' },
      lens: { kind: 'event', key: 'unavailable' },
      session: link('row with reason', '#session-unavailable'),
      scope: link('unreachable', '#scope-unavailable'),
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'disconnected',
      state: 'disconnected (summon MCP not connected)',
      status: { kind: 'status', key: 'disconnected' },
      lens: { kind: 'gap', text: 'summonTool is in the model; no renderer has a sentence for it.' },
      session: { kind: 'gap', text: 'No banner state in the model.' },
      scope: link('summon tool: not connected', '#scope-disconnected'),
      flow: none,
      trust: link('MCP: not connected', '#trust-states'),
      start: none,
    },
    {
      id: 'partial',
      state: 'partially supported harness',
      status: none,
      lens: none,
      session: none,
      scope: none,
      flow: none,
      trust: link('chip Partial', '#doors-agy'),
      start: { kind: 'route', text: 'Antigravity path', to: '/start' },
    },
    {
      id: 'degraded',
      state: 'degraded (no agent ids, no read events)',
      status: { kind: 'text', text: 'unchanged' },
      lens: link('read not observed', '#event-terminal'),
      session: link('inferred marks', '#session-explore'),
      scope: none,
      flow: link('host did not report agent ids', '#flow-degraded'),
      trust: none,
      start: none,
    },
    {
      id: 'error',
      state: 'error (tool errored)',
      status: { kind: 'text', text: 'unchanged' },
      lens: { kind: 'event', key: 'error' },
      session: link('row with sanitized error', '#session-error'),
      scope: none,
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'offline',
      state: 'offline',
      status: { kind: 'text', text: 'reading unaffected' },
      lens: { kind: 'event', key: 'unavailable' },
      session: none,
      scope: link('source unreachable', '#scope-unavailable'),
      flow: none,
      trust: none,
      start: { kind: 'route', text: 'copy still works offline', to: '/start' },
    },
    {
      id: 'ultra',
      state: 'Ultra selected',
      status: { kind: 'status', key: 'ultraProvisioned' },
      lens: none,
      session: none,
      scope: link('selected ULTRA · controller unavailable', '#scope-ultra'),
      flow: none,
      trust: none,
      start: none,
    },
    {
      id: 'ultra-fixture',
      state: 'Ultra fixture',
      status: link('site only', '#ultra-future'),
      lens: none,
      session: none,
      scope: none,
      flow: none,
      trust: none,
      start: none,
    },
  ]
}

function Plain({ children }: { children: ReactNode }) {
  return <code className="cx-mcell">{children}</code>
}

export function MatrixSection({
  statuses,
  events,
  staleDays,
}: {
  statuses: readonly StatusEntry[]
  events: readonly EventEntry[]
  staleDays: number | null
}) {
  const status = (key: string) => statuses.find((s) => s.key === key)
  const event = (key: string) => events.find((e) => e.key === key)

  const render = (cell: Cell): ReactNode => {
    switch (cell.kind) {
      case 'none':
        return (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">not applicable</span>
          </>
        )
      case 'text':
        return cell.text
      case 'link':
        return <a href={cell.href}>{cell.text}</a>
      case 'route':
        return <Link to={cell.to}>{cell.text}</Link>
      case 'gap':
        return (
          <>
            <span className="cx-chip cx-chip--gap">model gap</span> {cell.text}
          </>
        )
      case 'status': {
        const s = status(cell.key)
        if (!s) return null
        return (
          <a href={`#status-${cell.key}`} className="cx-mbox">
            <Plain>{toPlain(renderStatusSegments(s.status, 'compact'))}</Plain>
          </a>
        )
      }
      case 'event': {
        const e = event(cell.key)
        if (!e) return null
        return (
          <a href={`#event-${cell.key}`} className="cx-mbox">
            {eventLines(e.event).map((line, i) => (
              <Plain key={i}>{toPlain(line)}</Plain>
            ))}
          </a>
        )
      }
    }
  }

  return (
    <section id="matrix" className="cx-sec" aria-labelledby="h-matrix">
      <h2 id="h-matrix">State matrix</h2>
      <p className="cx-lede">
        Every state in the interaction matrix against every projection. Each cell with a specimen links to it. A cell the
        status model cannot express is marked as a model gap rather than filled in.
      </p>
      <Scroller label="Interaction state matrix: states against projections" className="cx-tablewrap">
        <table className="cx-table cx-table--matrix">
          <caption className="sr-only">Interaction states against the status entry, Lens, Session, Scope, Flow, Trust and /start</caption>
          <thead>
            <tr>
              <th scope="col">State</th>
              {COLUMNS.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows(staleDays).map((row) => (
              <tr key={row.id} id={`matrix-${row.id}`}>
                <th scope="row">{row.state}</th>
                <td>{render(row.status)}</td>
                <td>{render(row.lens)}</td>
                <td>{render(row.session)}</td>
                <td>{render(row.scope)}</td>
                <td>{render(row.flow)}</td>
                <td>{render(row.trust)}</td>
                <td>{render(row.start)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </section>
  )
}
