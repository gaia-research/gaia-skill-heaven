import { describeEvent } from '@gaia-skill-heaven/status'
import { EventPulse } from '../instrument/StatusLine'
import { lensActions, stageOf, summonPrefill, type LensAction } from './derive'
import { DemoButton, EvidenceTag, Scroller } from './Pieces'
import type { EventEntry } from './types'

const ACTION_LABEL: Readonly<Record<LensAction, string>> = {
  summon: 'Summon',
  inspect: 'Inspect',
  dismiss: 'Dismiss',
}

function LensBand({ entry, id, note }: { entry: EventEntry; id: string; note?: string }) {
  const { event, label, key } = entry
  const stage = stageOf(event)
  const actions = lensActions(event)
  const prefill = summonPrefill(event)
  const noteId = `${id}-note`
  return (
    <article id={id} className="cx-spec cx-spec--lens" aria-labelledby={`${id}-h`}>
      <header className="cx-spec__head">
        <h3 id={`${id}-h`}>{label}</h3>
        <code className="cx-key">{key}</code>
        {note && <p className="cx-fine">{note}</p>}
        <p className="cx-fine">
          <span className="cx-fine__k">Screen reader</span>
          <span aria-hidden="true">{describeEvent(event)}</span>
        </p>
      </header>
      <div className="cx-spec__body">
        <div className="cx-band">
          <Scroller label={`${label}: Lens band text`} className="cx-band__pulse">
            <EventPulse event={event} />
          </Scroller>
          <div className="cx-band__stage">
            <span className="cx-band__k">stage</span>
            {stage.text ? (
              <>
                <span className={stage.evidence === 'inferred' ? 'cx-inferred' : undefined}>{stage.text}</span>
                {stage.evidence && <EvidenceTag evidence={stage.evidence} />}
              </>
            ) : (
              <span className="cx-dim">none — no skill was returned</span>
            )}
          </div>
          <div className="cx-band__actions" role="group" aria-label="Lens actions (prototype)">
            {actions.map((a) => (
              <DemoButton key={a} describedBy={noteId}>
                {ACTION_LABEL[a]}
              </DemoButton>
            ))}
          </div>
        </div>
        <p id={noteId} className="cx-fine cx-fine--block">
          Prototype: these buttons do not act.
          {prefill && (
            <>
              {' '}
              Summon would pre-fill <code>{prefill}</code> in the composer; you press Enter. It never calls the tool itself.
            </>
          )}
          {!prefill && actions.includes('inspect') && <> Inspect would open the receipt in the console pane.</>}
        </p>
      </div>
    </article>
  )
}

const STAGES: ReadonlyArray<{ stage: string; by: string; shown: string }> = [
  { stage: 'previewed', by: 'a /lens preview call (preview: true, nothing on disk)', shown: 'N candidates · nothing materialized' },
  { stage: 'materialized', by: 'the summon result, summoned[]', shown: 'card returned · body not read' },
  { stage: 'in context', by: 'a Read of that skill’s materialized SKILL.md', shown: 'in context · body read' },
  { stage: 'unknown', by: 'terminal projections, which cannot observe reads', shown: 'materialized · read not observed' },
]

export function LensSection({ events, terminal }: { events: readonly EventEntry[]; terminal: EventEntry | null }) {
  return (
    <section id="lens" className="cx-sec" aria-labelledby="h-lens">
      <h2 id="h-lens">Events and the Lens band</h2>
      <p className="cx-lede">
        A summon returns a <strong>card</strong>. The card is a listing entry, not the skill body and not a grant. The
        skill enters context only when the agent reads the materialized <code>SKILL.md</code>. Lens is the smallest
        prompt-time band that shows which of those happened.
      </p>
      <ul className="cx-bullets">
        <li>The band is empty by default. It never opens a chooser and never runs a retrieval on its own.</li>
        <li>
          <strong>Summon</strong> pre-fills <code>/summon &lt;name&gt;</code> into the composer. The person submits it.
        </li>
        <li>The band hides after Dismiss, after the next prompt, and whenever the host shows a survey.</li>
        <li>“Close call” is a retrieval fact (margin below .10). It is never a claim about behaviour.</li>
      </ul>

      <h3 className="cx-h3">Card versus context</h3>
      <div className="cx-tablewrap">
        <table className="cx-table">
          <caption className="sr-only">The four stages a summoned skill can have reached</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Observed by</th>
              <th scope="col">Shown as</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.stage}>
                <th scope="row">{s.stage}</th>
                <td>{s.by}</td>
                <td>
                  <code>{s.shown}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cx-fine cx-fine--block">The terminal never claims a skill is “in context”; it says materialized.</p>

      <h3 className="cx-h3">Every band state</h3>
      <div className="cx-specs">
        <article id="lens-idle" className="cx-spec cx-spec--lens" aria-labelledby="lens-idle-h">
          <header className="cx-spec__head">
            <h3 id="lens-idle-h">Idle</h3>
            <code className="cx-key">no event</code>
          </header>
          <div className="cx-spec__body">
            <div className="cx-band cx-band--empty">
              <span className="cx-dim">nothing — the band is empty by default</span>
            </div>
          </div>
        </article>
        {events.map((entry) => (
          <LensBand key={entry.key} entry={entry} id={`event-${entry.key}`} />
        ))}
        {terminal && (
          <LensBand
            entry={terminal}
            id="event-terminal"
            note="The same event as a terminal projection sees it: it cannot observe reads, so the stage is unknown."
          />
        )}
      </div>
    </section>
  )
}
