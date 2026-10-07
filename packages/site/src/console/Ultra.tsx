import { describeStatus, sanitizeDisplay, type Segment, type SkillHeavenStatus } from '@gaia-skill-heaven/status'
import { StatusLine } from '../instrument/StatusLine'
import { Scroller, Paint, FixtureChip } from './Pieces'
import type { StatusEntry } from './types'

const seg = (text: string, role: Segment['role']): Segment => ({ text, role })

/**
 * The transition pulse, built from the controller's own `transition` field —
 * `◆ ultra  EXPLORE → CONVERGENCE · HUMAN` then the reason, dim. Only a
 * reported or fixture controller can carry one; a runtime adapter cannot
 * construct the fixture arm.
 */
export function transitionLines(status: SkillHeavenStatus): Segment[][] | null {
  const c = status.controller
  if (c.kind !== 'fixture' && c.kind !== 'reported') return null
  const t = c.transition
  if (!t) return null
  const head: Segment[] = []
  if (c.kind === 'fixture') head.push(seg('FIXTURE', 'amber'), seg(' ', 'dim'))
  head.push(
    seg('◆', 'ultra'),
    seg(' ultra  ', 'dim'),
    seg(sanitizeDisplay(t.from, 24).toUpperCase(), 'ultra'),
    seg(' → ', 'dim'),
    seg(sanitizeDisplay(t.to, 24).toUpperCase(), 'ultra'),
  )
  return [head, [seg('  ', 'dim'), seg(sanitizeDisplay(t.reason, 90), 'dim')]]
}

function UltraSpec({ entry, id }: { entry: StatusEntry; id: string }) {
  const { status, label, key } = entry
  const pulse = transitionLines(status)
  const c = status.controller
  const working = c.kind === 'fixture' || c.kind === 'reported' ? c.effective : undefined
  const transition = c.kind === 'fixture' || c.kind === 'reported' ? c.transition : undefined
  return (
    <article id={id} className="cx-spec" aria-labelledby={`${id}-h`}>
      <header className="cx-spec__head">
        <h3 id={`${id}-h`}>{label}</h3>
        <code className="cx-key">{key}</code>
        <p className="cx-fine">
          <span className="cx-fine__k">Screen reader</span>
          <span aria-hidden="true">{describeStatus(status)}</span>
        </p>
      </header>
      <Scroller label={`${label}: status line${pulse ? ' and transition pulse' : ''}`} className="cx-spec__body">
        <div className="cx-lines">
          <div className="cx-ln">
            <span className="cx-ln__k">full</span>
            <StatusLine status={status} mode="full" />
          </div>
          {pulse && (
            <div className="cx-ln">
              <span className="cx-ln__k">pulse</span>
              <span className="cx-pulse2">
                {pulse.map((line, i) => (
                  <Paint key={i} segments={line} className="cx-pulse2__line" />
                ))}
                <span className="sr-only">
                  Fixture, design state only. The Ultra controller moved from {sanitizeDisplay(transition?.from, 24)} to{' '}
                  {sanitizeDisplay(transition?.to, 24)}: {sanitizeDisplay(transition?.reason, 90)}.
                </span>
              </span>
            </div>
          )}
        </div>
        {working && (
          <p className="cx-fine cx-fine--block">
            <code>[ULTRA]</code> stays in the reading. <code>now {working.toUpperCase()}</code> is a separate field beside it.
          </p>
        )}
      </Scroller>
    </article>
  )
}

export function UltraSection({
  provisioned,
  future,
  copy,
}: {
  provisioned: StatusEntry
  future: readonly StatusEntry[]
  copy: string
}) {
  return (
    <section id="ultra" className="cx-sec" aria-labelledby="h-ultra">
      <h2 id="h-ultra">Ultra</h2>
      <p className="cx-lede">
        <code>[ULTRA]</code> is never replaced by the working rung. If a controller ever reports one, <code>now HIGH ›</code>{' '}
        is a separate field under it. Nothing on the line refuses; what is outstanding is implementation, not permission.
      </p>

      <div id="ultra-today" className="cx-block">
        <h3 className="cx-h3">Today’s truth</h3>
        <p className="cx-callout">
          <strong>{copy.slice(0, copy.indexOf('. ') + 1)}</strong>
          {copy.slice(copy.indexOf('. ') + 1)}
        </p>
        <UltraSpec entry={provisioned} id="ultra-provisioned" />
      </div>

      <div id="ultra-future" className="cx-future" role="group" aria-labelledby="ultra-future-h">
        <h3 id="ultra-future-h" className="cx-h3">
          Future states <FixtureChip>FIXTURE</FixtureChip> <span>— controller not built, #126</span>
        </h3>
        <p className="cx-fine cx-fine--block">
          These design states exist so the controller has somewhere to land. No adapter can produce them: the fixture
          controller is minted only by the status package’s fixtures, and every projection prints FIXTURE beside it. The
          steering vocabulary today is HOLD · EXPLORE · RECOVER · REOPEN · CHECKPOINT · CLOSE · STOP; #126 may add members,
          and unknown members print verbatim after sanitizing.
        </p>
        {future.map((entry) => (
          <UltraSpec key={entry.key} entry={entry} id={`ultra-${entry.key}`} />
        ))}
      </div>
    </section>
  )
}
