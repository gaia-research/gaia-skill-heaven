import type { CSSProperties } from 'react'
import {
  describeStatus,
  paintAnsi,
  renderStatusSegments,
  statusLevels,
} from '@gaia-skill-heaven/status'
import { StatusLine } from '../instrument/StatusLine'
import { Paint, Scroller } from './Pieces'
import type { StatusEntry } from './types'

/** Cell budgets the strip shows. The renderer drops fields from the right; the reading goes last. */
export const WIDTHS = [80, 48, 33, 18, 14, 6] as const

function Spec({ entry }: { entry: StatusEntry }) {
  const { key, label, status } = entry
  const full = renderStatusSegments(status, 'full')
  return (
    <article id={`status-${key}`} className="cx-spec" aria-labelledby={`status-${key}-h`}>
      <header className="cx-spec__head">
        <h3 id={`status-${key}-h`}>{label}</h3>
        <code className="cx-key">{key}</code>
        <p className="cx-fine">
          <span className="cx-fine__k">Screen reader</span>
          {/* The same sentence is already in the page for assistive tech (StatusLine); this copy is for sighted reviewers. */}
          <span aria-hidden="true">{describeStatus(status)}</span>
        </p>
      </header>
      <Scroller label={`${label}: the status line in each mode and at each width`} className="cx-spec__body">
        <div className="cx-lines">
          <div className="cx-ln">
            <span className="cx-ln__k">compact</span>
            <Paint segments={renderStatusSegments(status, 'compact')} />
          </div>
          <div className="cx-ln">
            <span className="cx-ln__k">full</span>
            <StatusLine status={status} mode="full" />
          </div>
          <div className="cx-ln cx-ln--muted">
            <span className="cx-ln__k">NO_COLOR</span>
            <code className="cx-plain" aria-hidden="true">
              {paintAnsi(full, 'none')}
            </code>
          </div>
          <p className="cx-strip__k" aria-hidden="true">
            same status, full mode, at a width of N cells — the dashed edge marks that width
          </p>
          {WIDTHS.map((w) => (
            <div className="cx-ln" key={w}>
              <span className="cx-ln__k">
                <span className="sr-only">at </span>
                {w}
                <span className="sr-only"> cells</span>
              </span>
              <span className="cx-cellbox" style={{ '--w': w } as CSSProperties}>
                <Paint segments={renderStatusSegments(status, 'full', w)} />
              </span>
            </div>
          ))}
        </div>
      </Scroller>
    </article>
  )
}

export function InstrumentSection({ statuses }: { statuses: readonly StatusEntry[] }) {
  const first = statuses[0]
  const offLevels = first ? statusLevels(first.status, 'off').length : 0
  return (
    <section id="instrument" className="cx-sec" aria-labelledby="h-instrument">
      <h2 id="h-instrument">The instrument</h2>
      <p className="cx-lede">
        The one status line, rendered by <code>renderStatusSegments</code> from the same model the terminal and the
        desktop console use. A projection may drop fields to fit; it may never promote an event into state. Degradation
        drops fields from the right and the reading is the last thing removed. No percentage, no score, no count per rung.
      </p>
      <dl className="cx-modes">
        <div>
          <dt>compact</dt>
          <dd>The reading and skills in the session.</dd>
        </div>
        <div>
          <dt>full</dt>
          <dd>Adds summons, the Ultra controller field and the last arrival.</dd>
        </div>
        <div id="status-off">
          <dt>off</dt>
          <dd>
            <code>SKILL_HEAVEN_STATUS=off</code> removes the status entry. The renderer has {offLevels} levels to draw, so
            nothing replaces it; your own status line is untouched. <code>/summon</code> still prints its own receipt,
            because an explicit action must disclose what happened.
          </dd>
        </div>
      </dl>
      <div className="cx-specs">
        {statuses.map((entry) => (
          <Spec key={entry.key} entry={entry} />
        ))}
      </div>
    </section>
  )
}
