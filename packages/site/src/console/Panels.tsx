import {
  CHIP_LABEL,
  RUNGS,
  describeEvent,
  eventLines,
  type HarnessPath,
  type SkillHeavenStatus,
} from '@gaia-skill-heaven/status'
import { RELEASE } from '../release'
import { commandForRung, degradeFlow, freshFlow, receiptHeader, receiptRows, scopeRows, syntheticFanOut, type FlowAgent } from './derive'
import { FlowTree } from './FlowTree'
import { DemoButton, EvidenceTag, FieldRows, Paint, Scroller, ValueOrUnknown } from './Pieces'
import type { EventEntry, ScopeCase } from './types'

/* ------------------------------------------------------------------ Session */

const EVIDENCE_LEGEND: ReadonlyArray<{ cls: 'observed' | 'reported' | 'inferred' | 'unknown'; meaning: string; visual: string }> = [
  { cls: 'observed', meaning: 'the console saw it happen in this session', visual: 'plain' },
  { cls: 'reported', meaning: 'the summon engine or manifest stated it; the source is named on inspect', visual: 'plain' },
  { cls: 'inferred', meaning: 'derived by this UI — for example “body not read” because no read was seen', visual: 'italic, tagged inferred' },
  { cls: 'unknown', meaning: 'no source', visual: 'an em dash and the word unknown — never blank' },
]

export function SessionPanel({ events }: { events: readonly EventEntry[] }) {
  return (
    <>
      <p className="cx-lede">
        A timeline of this session’s summons, newest first. Each row expands to its receipt. Every field says how it is
        known; the status line shows state, the pulse shows an event, the receipt shows evidence.
      </p>
      <Scroller label="Evidence classes: meaning and how each is shown" className="cx-tablewrap">
        <table className="cx-table cx-table--tight">
          <caption className="sr-only">Evidence classes</caption>
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Meaning</th>
              <th scope="col">Shown as</th>
            </tr>
          </thead>
          <tbody>
            {EVIDENCE_LEGEND.map((row) => (
              <tr key={row.cls}>
                <th scope="row">
                  <EvidenceTag evidence={row.cls} />
                </th>
                <td>{row.meaning}</td>
                <td>{row.visual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
      <p className="cx-fine cx-fine--block">
        Composition is always reported as relevance-only today. Nothing is Arbor-informed, so no Arbor colour is drawn
        anywhere on this page.
      </p>

      <h4 className="cx-h4">Timeline, newest first</h4>
      <ol className="cx-timeline">
        {events.map((entry, i) => {
          const header = receiptHeader(entry.event)
          const line1 = eventLines(entry.event)[0] ?? []
          return (
            <li key={entry.key}>
              <details id={`session-${entry.key}`} className="cx-row" open={i < 2 ? true : undefined}>
                <summary>
                  <Paint segments={line1} />
                  <span className="sr-only">{describeEvent(entry.event)}</span>
                  <span className="cx-row__meta">
                    {header.clock ?? 'time unknown'} · <span className={header.agent.evidence === 'inferred' ? 'cx-inferred' : undefined}>{header.agent.text}</span>
                  </span>
                </summary>
                <div className="cx-row__body">
                  <p className="cx-fine">
                    {entry.label} · agent <EvidenceTag evidence={header.agent.evidence} />
                  </p>
                  <FieldRows rows={receiptRows(entry.event)} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>

      <h4 id="session-empty" className="cx-h4">
        Empty session
      </h4>
      <p className="cx-empty">
        Nothing summoned yet. Try <code>/summon &lt;need&gt;</code> or <code>/lens &lt;need&gt;</code>.
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ Scope */

export function ScopePanel({ main, cases }: { main: ScopeCase; cases: readonly ScopeCase[] }) {
  const pick = (c: ScopeCase, label: string) => scopeRows(c.status, c.event).find((r) => r.label === label)?.value ?? null
  return (
    <>
      <p className="cx-lede">
        What Skill Heaven can see, what is active, what is allowed — and how to keep context small. There is no catalogue
        browser.
      </p>
      <h4 className="cx-h4">{main.label}</h4>
      <FieldRows rows={scopeRows(main.status, main.event)} />

      <h4 className="cx-h4">Pre-fill controls</h4>
      <p id="cx-prefill-note" className="cx-fine cx-fine--block">
        Prototype: these buttons do not act. The real controls pre-fill a command into the composer, or copy it; a person
        submits it. They never write silently. Repo loadouts are designed, not built.
      </p>
      <div className="cx-prefills">
        <div className="cx-prefill-group" role="group" aria-label="Choose a rung (pre-fills a command)">
          <span className="cx-prefill-group__k">Choose a rung</span>
          <div className="cx-prefill-group__row">
            {RUNGS.map((rung, i) => (
              <DemoButton key={rung} describedBy="cx-prefill-note" focusable={i === 0} label={`Pre-fill ${commandForRung(rung)} (demo)`}>
                <code>{commandForRung(rung)}</code>
              </DemoButton>
            ))}
          </div>
        </div>
        <div className="cx-prefill-group" role="group" aria-label="Cut and start clean">
          <span className="cx-prefill-group__k">Cut and start clean</span>
          <div className="cx-prefill-group__row">
            <DemoButton describedBy="cx-prefill-note" focusable={false} label="Cut: /skill-zero (demo)">
              Cut: <code>/skill-zero</code>
            </DemoButton>
            <DemoButton describedBy="cx-prefill-note" focusable={false} label="Start clean (copies): claude-zero --level zero (demo)">
              Start clean (copies): <code>claude-zero --level zero</code>
            </DemoButton>
          </div>
        </div>
      </div>

      <h4 className="cx-h4">Scope across states</h4>
      <Scroller label="Scope rows for each state" className="cx-tablewrap">
        <table className="cx-table">
          <caption className="sr-only">Scope rows for each state</caption>
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">can see</th>
              <th scope="col">active</th>
              <th scope="col">selected</th>
              <th scope="col">summon tool</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} id={`scope-${c.id}`}>
                <th scope="row">{c.label}</th>
                {(['can see', 'active', 'selected', 'summon tool'] as const).map((label) => (
                  <td key={label}>
                    <ValueOrUnknown value={pick(c, label)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </>
  )
}

/* ------------------------------------------------------------------ Flow */

export function FlowPanel({ agents }: { agents: readonly FlowAgent[] }) {
  return (
    <>
      <p className="cx-lede">
        Agents and the skills they summoned, read-only. Only agents the host reported appear. A summon with no agent id is
        attributed to main, and missing telemetry is said out loud.
      </p>
      <section id="flow-normal" aria-labelledby="flow-normal-h" className="cx-block">
        <h4 id="flow-normal-h" className="cx-h4">
          Host reported agent ids
        </h4>
        <FlowTree agents={agents} label="Agents and summons in this session" />
      </section>
      <section id="flow-fresh" aria-labelledby="flow-fresh-h" className="cx-block">
        <h4 id="flow-fresh-h" className="cx-h4">
          Fresh session
        </h4>
        <FlowTree agents={freshFlow(agents)} label="Agents in a fresh session" />
      </section>
      <section id="flow-degraded" aria-labelledby="flow-degraded-h" className="cx-block">
        <h4 id="flow-degraded-h" className="cx-h4">
          Degraded: no agent ids
        </h4>
        <FlowTree agents={degradeFlow(agents)} label="Agents when the host reports no agent ids" />
        <p className="cx-note">This host did not report agent ids. Every summon is attributed to main.</p>
      </section>
      <section id="flow-fanout" aria-labelledby="flow-fanout-h" className="cx-block">
        <h4 id="flow-fanout-h" className="cx-h4">
          Fan-out stress: 14 synthetic agents
        </h4>
        <p className="cx-fine cx-fine--block">Synthetic data generated for this page, not a fixture of any session. Beyond 12 agents the list collapses.</p>
        <FlowTree agents={syntheticFanOut(14)} label="Fourteen synthetic agents, collapsed beyond twelve" />
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ Trust */

export function TrustPanel({
  claude,
  connections,
}: {
  claude: HarnessPath
  connections: ReadonlyArray<{ label: string; status: SkillHeavenStatus }>
}) {
  const tool = (s: SkillHeavenStatus) => (s.summonTool === 'not-connected' ? 'not connected' : s.summonTool)
  return (
    <>
      <p className="cx-lede">What you installed and what it can do. Nothing is ranked and nothing is scored.</p>
      <section id="trust-panel" aria-labelledby="trust-panel-h" className="cx-block">
        <h4 id="trust-panel-h" className="cx-h4">
          Installed code
        </h4>
        <dl className="cx-kv">
          <div>
            <dt>skill-heaven</dt>
            <dd>
              {RELEASE.pluginVersion} · gaia-research/gaia-skill-heaven · bundles one MCP server (skill-summon)
            </dd>
          </div>
          <div>
            <dt>console (preview)</dt>
            <dd>same repository · runs inside Claude Code as local code</dd>
          </div>
          <div className="cx-kv__sub">
            <dt>reads</dt>
            <dd>summon tool results · your /skill-* commands · Read and Agent tool calls (to observe, never to change)</dd>
          </div>
          <div className="cx-kv__sub">
            <dt>writes</dt>
            <dd>nothing to disk · session-only state</dd>
          </div>
          <div className="cx-kv__sub">
            <dt>network</dt>
            <dd>none of its own; /lens calls the bundled summon tool, which fetches the skill source</dd>
          </div>
          <div className="cx-kv__sub">
            <dt>disable</dt>
            <dd>
              <code>/plugin disable skill-heaven-console</code> — the status entry, band and pane disappear; Skill Heaven is
              unchanged
            </dd>
          </div>
        </dl>
      </section>
      <section id="trust-harness" aria-labelledby="trust-harness-h" className="cx-block">
        <h4 id="trust-harness-h" className="cx-h4">
          Harness row
        </h4>
        <dl className="cx-kv">
          <div>
            <dt>harness</dt>
            <dd>
              {claude.name} &lt;your version&gt; · <span className={`cx-chip cx-chip--${claude.chip}`}>{CHIP_LABEL[claude.chip]}</span> for the
              plugin at {claude.probedVersion}; the console needs a local probe
            </dd>
          </div>
          <div className="cx-kv__sub">
            <dt>evidence</dt>
            <dd>{claude.evidence}</dd>
          </div>
          <div className="cx-kv__sub">
            <dt>status entry</dt>
            <dd>
              <span className="cx-chip">{claude.statusIntegration}</span> {claude.statusNote}
            </dd>
          </div>
        </dl>
      </section>
      <section id="trust-states" aria-labelledby="trust-states-h" className="cx-block">
        <h4 id="trust-states-h" className="cx-h4">
          The MCP row across states
        </h4>
        <ul className="cx-bullets">
          {connections.map((c) => (
            <li key={c.label}>
              {c.label}: <code>MCP: {tool(c.status)}</code>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
