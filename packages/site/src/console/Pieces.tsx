/**
 * Small shared pieces for /console. None of them decides what a field means:
 * colour comes from the status package's segments via the instrument paint,
 * and every unknown is spelled out.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Segment } from '@gaia-skill-heaven/status'
import { Segments } from '../instrument/StatusLine'
import type { RowEvidence } from './derive'

/** The instrument art for sighted readers. The accessible text is the visible
 * "Screen reader" sentence or the hidden one StatusLine/EventPulse carry. */
export function Paint({ segments, className }: { segments: readonly Segment[]; className?: string }) {
  return (
    <span className={`shi-line cx-paint${className ? ` ${className}` : ''}`} aria-hidden="true">
      <Segments segments={segments} />
    </span>
  )
}

/**
 * A horizontal scroll box for long instrument strings. It only becomes a tab
 * stop when it really overflows, so keyboard users can scroll it and nobody
 * tabs through boxes that have nothing to scroll.
 */
export function Scroller({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`cx-scroll${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
      tabIndex={overflowing ? 0 : undefined}
    >
      {children}
    </div>
  )
}

export function FixtureChip({ children = 'FIXTURE' }: { children?: ReactNode }) {
  return <span className="cx-chip cx-chip--fixture">{children}</span>
}

/**
 * Prototype-only control. It is focusable and announced as disabled, never
 * acts, and says why. The real console pre-fills the composer; a person
 * submits it. The UI is never an authority channel.
 */
export function DemoButton({ children, describedBy }: { children: ReactNode; describedBy?: string }) {
  return (
    <button
      type="button"
      className="cx-demo"
      aria-disabled="true"
      aria-describedby={describedBy}
      title="prototype — this button does not act"
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

const EVIDENCE_TITLE: Readonly<Record<RowEvidence, string>> = {
  observed: 'the console saw it happen in this session',
  reported: 'the summon engine or manifest stated it',
  inferred: 'derived by this UI, not seen directly',
  unknown: 'no source',
}

export function EvidenceTag({ evidence }: { evidence: RowEvidence }) {
  return (
    <span className={`cx-ev cx-ev--${evidence}`} title={EVIDENCE_TITLE[evidence]}>
      {evidence}
    </span>
  )
}

/** A value, or the em dash plus the word "unknown" — never blank. */
export function ValueOrUnknown({ value }: { value: string | null }) {
  if (value !== null) return <>{value}</>
  return (
    <>
      <span aria-hidden="true">—</span> <span className="cx-unknown">unknown</span>
    </>
  )
}

export function FieldRows({ rows }: { rows: ReadonlyArray<{ label: string; value: string | null; evidence: RowEvidence }> }) {
  return (
    <dl className="cx-fields">
      {rows.map((row) => (
        <div key={row.label} className="cx-fields__row">
          <dt>{row.label}</dt>
          <dd className={row.evidence === 'inferred' ? 'cx-inferred' : undefined}>
            <ValueOrUnknown value={row.value} />
          </dd>
          <dd className="cx-fields__ev">
            <EvidenceTag evidence={row.evidence} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
