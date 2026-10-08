/**
 * The web projection of the one status model (docs/CONTROL-PLANE.md §2).
 *
 * It paints SEGMENTS produced by @gaia-skill-heaven/status — it never decides
 * what a field means. Colours come from the same ROLE_COLORS table the
 * terminal and the Claude Code console use, exposed as `--shi-*` custom
 * properties so the instrument palette cannot drift with the site's own
 * `--sh-*` tokens (which differ for zero/hell; see DESIGN.md).
 *
 * Accessibility: the visible line is aria-hidden glyph art; a visually hidden
 * sentence from describeStatus/describeEvent carries the meaning.
 */
import type { CSSProperties } from 'react'
import {
  ROLE_COLORS,
  type Role,
  type Segment,
  type SkillHeavenStatus,
  type StatusMode,
  type SummonEvent,
  describeEvent,
  describeStatus,
  eventLines,
  renderStatusSegments,
} from '@gaia-skill-heaven/status'
import './instrument.css'

export const INSTRUMENT_VARS = Object.fromEntries(
  (Object.keys(ROLE_COLORS) as Role[]).map((role) => [`--shi-${role}`, ROLE_COLORS[role].hex]),
) as CSSProperties

export function Segments({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={`shi-r shi-r--${s.role}`}>
          {s.text}
        </span>
      ))}
    </>
  )
}

export function StatusLine({
  status,
  mode = 'compact',
  width,
  className,
}: {
  status: SkillHeavenStatus
  mode?: StatusMode
  /** Cell budget, to show right-to-left degradation. */
  width?: number
  className?: string
}) {
  const segments = renderStatusSegments(status, mode, width)
  if (segments.length === 0) return null
  return (
    <span className={`shi-line${className ? ` ${className}` : ''}`} style={INSTRUMENT_VARS}>
      <span aria-hidden="true">
        <Segments segments={segments} />
      </span>
      <span className="shi-sr">{describeStatus(status)}</span>
    </span>
  )
}

export function EventPulse({ event, className }: { event: SummonEvent; className?: string }) {
  const lines = eventLines(event)
  return (
    <span className={`shi-pulse${className ? ` ${className}` : ''}`} style={INSTRUMENT_VARS}>
      <span aria-hidden="true">
        {lines.map((line, i) => (
          <span key={i} className="shi-pulse__line">
            <Segments segments={line} />
          </span>
        ))}
      </span>
      <span className="shi-sr">{describeEvent(event)}</span>
    </span>
  )
}
