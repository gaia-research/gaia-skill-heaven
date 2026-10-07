// /console — the inspectable prototype of every projection (docs/CONTROL-PLANE.md §5.5).
//
// This is the ONE site surface (with /start) allowed to import the status
// fixtures. It hands the fixture rows down as props; nothing in `../console/`
// imports a fixture, and every value on the page is rendered by the real
// status model — never from a hand-written string that pretends to be output.
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { harnessById } from '@gaia-skill-heaven/status'
import { EVENT_FIXTURES, FLOW_FIXTURE, STATUS_FIXTURES } from '@gaia-skill-heaven/status/fixtures'
import { INSTRUMENT_VARS } from '../instrument/StatusLine'
import { DoorsSection } from '../console/Doors'
import { InstrumentSection } from '../console/Instrument'
import { LensSection } from '../console/Lens'
import { MatrixSection } from '../console/Matrix'
import { FlowPanel, ScopePanel, SessionPanel, TrustPanel } from '../console/Panels'
import { FixtureChip } from '../console/Pieces'
import { TokensSection } from '../console/Tokens'
import { UltraSection } from '../console/Ultra'
import { useRovingTabs } from '../console/tabs'
import type { EventEntry, ScopeCase, StatusEntry } from '../console/types'
import '../styles/system.css'
import './console.css'

/** Permanent and not dismissable: there is no close control and no stored state. */
const BANNER_TEXT =
  'FIXTURE — design states, not your session. Every value on this page is example data rendered by the real status model.'

/** docs/CONTROL-PLANE.md §2.4 — the copy that appears everywhere Ultra appears today. */
const ULTRA_COPY =
  'Skill Ultra · provisioned. Controller unavailable — no controller is choosing direction or depth yet. Ultra is the rung you selected; each summon is still judged per use. The long-horizon controller is tracked in #126 and is not yet empirically validated.'

const STATUSES: StatusEntry[] = Object.entries(STATUS_FIXTURES).map(([key, v]) => ({ key, label: v.label, status: v.status }))
const EVENTS: EventEntry[] = Object.entries(EVENT_FIXTURES).map(([key, v]) => ({ key, label: v.label, event: v.event }))

const statusOf = (key: string): StatusEntry => {
  const found = STATUSES.find((s) => s.key === key)
  if (!found) throw new Error(`missing status fixture ${key}`)
  return found
}
const eventOf = (key: string): EventEntry => {
  const found = EVENTS.find((e) => e.key === key)
  if (!found) throw new Error(`missing event fixture ${key}`)
  return found
}

/** Newest first. Lens previews are not summons, so they have no Session row. */
const SESSION_ORDER = ['explore', 'inContext', 'manual', 'converge', 'stale', 'noMatch', 'unavailable', 'error', 'hostile']
const SESSION_EVENTS = SESSION_ORDER.map(eventOf)

const SCOPE_CASES: ScopeCase[] = [
  { id: 'fresh', label: 'Fresh session', status: statusOf('fresh').status, event: null },
  { id: 'explore', label: 'Selected HIGH, fresh source', status: statusOf('explore').status, event: eventOf('explore').event },
  { id: 'stale', label: 'Stale source', status: statusOf('explore').status, event: eventOf('stale').event },
  { id: 'unavailable', label: 'Unavailable source', status: statusOf('explore').status, event: eventOf('unavailable').event },
  { id: 'disconnected', label: 'Summon tool not connected', status: statusOf('disconnected').status, event: null },
  { id: 'ultra', label: 'Ultra selected', status: statusOf('ultraProvisioned').status, event: null },
]

/** The explicit-summon event as a terminal projection sees it: reads are not observable there. */
const TERMINAL_EVENT: EventEntry | null = (() => {
  const manual = eventOf('manual')
  if (manual.event.kind !== 'summoned') return null
  return {
    key: 'manual',
    label: 'Explicit /summon · terminal view',
    event: { ...manual.event, skills: manual.event.skills.map((s) => ({ ...s, stage: 'read-unobserved' as const })) },
  }
})()

const STALE_DAYS = (() => {
  const e = eventOf('stale').event
  if ((e.kind === 'summoned' || e.kind === 'previewed' || e.kind === 'no-match') && e.sourceHealth.kind === 'stale') return e.sourceHealth.indexAgeDays
  return null
})()

const ULTRA_FUTURE = ['ultraHold', 'ultraExplore', 'ultraConvergence'].map(statusOf)

const TABS = [
  { key: 'session', label: 'Session' },
  { key: 'scope', label: 'Scope' },
  { key: 'flow', label: 'Flow' },
  { key: 'trust', label: 'Trust' },
] as const
type TabKey = (typeof TABS)[number]['key']
const TAB_KEYS = TABS.map((t) => t.key) as readonly TabKey[]

const INDEX = [
  ['instrument', 'Instrument'],
  ['lens', 'Events and Lens'],
  ['pane', 'Console pane'],
  ['ultra', 'Ultra'],
  ['doors', 'Door matrix'],
  ['matrix', 'State matrix'],
  ['tokens', 'Tokens'],
] as const

function Pane() {
  const [tab, setTab] = useState<TabKey>('session')
  const { setRef, onKeyDown } = useRovingTabs(TAB_KEYS, tab, setTab)

  // In-page anchors cannot be real hash links under a HashRouter (a bare #id is read as a route and bounces
  // to the hero), so the root intercepts them. Targets inside a hidden tab panel select that tab first.
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      const el = document.getElementById(id)
      const panel = el?.closest('[role="tabpanel"]')
      if (panel) setTab(panel.id.replace('panel-', '') as TabKey)
    }
    window.addEventListener('cx:reveal', open)
    return () => window.removeEventListener('cx:reveal', open)
  }, [])

  return (
    <section id="pane" className="cx-sec" aria-labelledby="h-pane">
      <h2 id="h-pane">Console pane</h2>
      <p className="cx-lede">
        One pane, four sections, opened only by the person — by command or by button, never unasked. It reads; it does
        not write, and nothing in it is required for Skill Heaven to be correct.
      </p>
      <div className="cx-pane">
        <div className="cx-pane__bar">
          <span className="cx-pane__title">Skill Heaven console (preview)</span>
          <FixtureChip />
        </div>
        <div role="tablist" aria-label="Console sections" className="cx-tabs" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.key}
              ref={setRef(t.key)}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className="cx-tab"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="panel-session" aria-labelledby="tab-session" tabIndex={0} hidden={tab !== 'session'} className="cx-panel">
          <h3 className="cx-h3">Session</h3>
          <SessionPanel events={SESSION_EVENTS} />
        </div>
        <div role="tabpanel" id="panel-scope" aria-labelledby="tab-scope" tabIndex={0} hidden={tab !== 'scope'} className="cx-panel">
          <h3 className="cx-h3">Scope</h3>
          <ScopePanel main={SCOPE_CASES[1]!} cases={SCOPE_CASES} />
        </div>
        <div role="tabpanel" id="panel-flow" aria-labelledby="tab-flow" tabIndex={0} hidden={tab !== 'flow'} className="cx-panel">
          <h3 className="cx-h3">Flow</h3>
          <FlowPanel agents={FLOW_FIXTURE} />
        </div>
        <div role="tabpanel" id="panel-trust" aria-labelledby="tab-trust" tabIndex={0} hidden={tab !== 'trust'} className="cx-panel">
          <h3 className="cx-h3">Trust</h3>
          <TrustPanel
            claude={harnessById('claude')}
            connections={[
              { label: 'Summon tool reachable', status: statusOf('explore').status },
              { label: 'Summon tool not connected', status: statusOf('disconnected').status },
            ]}
          />
        </div>
      </div>
    </section>
  )
}

export default function Console() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Console prototype — Skill Heaven'
    window.scrollTo(0, 0)
    return () => {
      document.title = previous
    }
  }, [])

  const onAnchorClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#/')) return
    const id = href.slice(1)
    const el = id ? document.getElementById(id) : null
    if (!el) return
    e.preventDefault()
    const panel = el.closest('[role="tabpanel"]')
    if (panel?.hasAttribute('hidden')) {
      flushSync(() => window.dispatchEvent(new CustomEvent('cx:reveal', { detail: id })))
    }
    if (el instanceof HTMLDetailsElement) el.open = true
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
  }, [])

  const [bannerLead, ...bannerRest] = BANNER_TEXT.split(' — ')

  return (
    <div className="cx" style={INSTRUMENT_VARS} onClick={onAnchorClick}>
      <a className="cx-skip" href="#main">
        Skip to main content
      </a>
      <div className="cx-banner" role="note" aria-label="Fixture notice">
        <FixtureChip>{bannerLead}</FixtureChip>
        <p>{bannerRest.join(' — ')}</p>
      </div>
      <header className="cx-top">
        <nav className="cx-nav" aria-label="Primary">
          <Link to="/" className="cx-nav__back">
            <span aria-hidden="true">←</span> Back to the site
          </Link>
          <span className="cx-nav__links">
            <Link to="/start">/start</Link>
            <Link to="/live">/live</Link>
          </span>
        </nav>
      </header>

      <main id="main" className="cx-main" tabIndex={-1}>
        <div className="cx-head">
          <h1>Console prototype</h1>
          <p className="cx-lede cx-lede--lead">
            Every state of every projection of the one status model: the status entry, the Lens band, the console pane,
            Ultra, and the door matrix. This is the hand-off page for builders and the review surface for owners. The
            buttons here are demonstrations; in the product a button only pre-fills a command that a person submits.
          </p>
          <nav aria-label="On this page" className="cx-index">
            <ul>
              {INDEX.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <InstrumentSection statuses={STATUSES} />
        <LensSection events={EVENTS} terminal={TERMINAL_EVENT} />
        <Pane />
        <UltraSection provisioned={statusOf('ultraProvisioned')} future={ULTRA_FUTURE} copy={ULTRA_COPY} />
        <DoorsSection />
        <MatrixSection statuses={STATUSES} events={EVENTS} staleDays={STALE_DAYS} />
        <TokensSection />
      </main>

      <footer className="cx-foot">
        <p>
          Rendered by <code>@gaia-skill-heaven/status</code> from design fixtures. Nothing on this page is a measured
          result, a ranking or a score.
        </p>
      </footer>
    </div>
  )
}
