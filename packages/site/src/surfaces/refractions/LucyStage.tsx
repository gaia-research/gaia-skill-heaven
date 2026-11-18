/**
 * LucyStage — the heroine's stage on /landing (Lucia Refractions, Study A).
 *
 * Desktop (`variant="stage"`): a fixed stage on the right of the viewport that
 * the document's glass slides past. Mobile (`variant="plate"`): a full-bleed
 * state plate that opens the page. Both are the hero's own room continued — the
 * same `LucyAtmosphere`, the same band grounds, the same approved v5 masters —
 * so the first frame after the door repeats the last frame of the hero.
 *
 * Canon this file keeps (docs/lucy/authority, gaia-research/lucy DECISIONS):
 *   · the figure is only ever an approved v5 delivery master: never mirrored,
 *     never re-coloured, never CSS-inverted (the Hell master already is one);
 *   · Zero carries no wings and no shards — its front glass is empty;
 *   · no flare or glow is attached to her eyes; the cut's streak crosses at
 *     ribbon height;
 *   · the only red is her own tear. The `?tear=1` leader (founder decision
 *     D-03, off by default) extends that one tear; it never adds another.
 *
 * Motion is transform/opacity except the bounded 46ms impact frame, and none
 * of it runs under prefers-reduced-motion.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LucyScene } from '../../lucy-scene/LucyScene'
import { LucyAtmosphere } from '../../lucy-scene/atmosphere/LucyAtmosphere'
import { LucyRiveFigure } from '../../lucy-scene/rive/LucyRiveFigure'
import lucyZero from '../../assets/lucy/v5/delivery/lucy-zero.webp'
import lucyHeaven from '../../assets/lucy/v5/delivery/lucy-heaven.webp'
import lucyHell from '../../assets/lucy/v5/delivery/lucy-hell.webp'
import lucyUltra from '../../assets/lucy/v5/delivery/lucy-ultra.webp'
import {
  LUCY_STATES,
  STAGE_GROUND,
  STATE_ALT,
  STATE_ANNOUNCE,
  STATE_WORD,
  TEAR_ORIGIN,
  type LucyState,
} from './lucyState'

const FIGURE: Record<LucyState, { src: string; w: number; h: number }> = {
  zero: { src: lucyZero, w: 2048, h: 3072 },
  heaven: { src: lucyHeaven, w: 2048, h: 3072 },
  hell: { src: lucyHell, w: 2048, h: 3072 },
  ultra: { src: lucyUltra, w: 2190, h: 2874 },
}

/** Front glass per state: the plane nearer than she is. Zero has none (canon). */
const FRONT: Record<LucyState, { x: number; y: number; w: number; h: number; r: number }[]> = {
  zero: [],
  heaven: [
    { x: 6, y: 18, w: 3.2, h: 15, r: -18 },
    { x: 82, y: 9, w: 2.6, h: 12, r: -18 },
    { x: 14, y: 64, w: 2.2, h: 9, r: -18 },
  ],
  hell: [
    { x: 78, y: 14, w: 3, h: 13, r: 26 },
    { x: 8, y: 40, w: 2.2, h: 8, r: -38 },
    { x: 70, y: 58, w: 1.8, h: 6, r: 52 },
  ],
  ultra: [
    { x: 10, y: 12, w: 2.8, h: 12, r: -34 },
    { x: 82, y: 10, w: 2.8, h: 12, r: 34 },
    { x: 46, y: 2, w: 2.2, h: 9, r: 2 },
  ],
}

/** The hero's own per-state treatment of the live figure (useHeroEngine), so the seam holds. */
const LIVE_FILTER: Record<LucyState, string> = {
  zero: 'grayscale(1) brightness(1.55) contrast(1.06)',
  heaven: 'none',
  hell: 'none',
  ultra: 'saturate(1.06) brightness(1.03) drop-shadow(0 0 26px rgba(255,210,74,0.42))',
}

/** The impact frame: 46ms, steps(3), shear + translate, at most 8px. */
const IMPACT: Keyframe[] = [
  { transform: 'translate(-6px, 0) skewX(-3deg)' },
  { transform: 'translate(8px, -2px) skewX(2deg)' },
  { transform: 'none' },
]

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export interface LucyStageProps {
  state: LucyState
  onState: (next: LucyState) => void
  variant: 'stage' | 'plate'
  /** The arrival header is in view: the hero's state word is still on stage. */
  arrival?: boolean
  /** The closing triptych or the footer is in view: the stage steps aside. */
  released?: boolean
  /** Founder-gated preview of "the tear points" (D-03). */
  tear?: boolean
  /**
   * D-07: the live Rive character (LucyLive) instead of the static master.
   * Rive supersedes the masters on the desktop stage; the masters stay the
   * phone plate, the reduced-motion path, `?lucy=static`, and the fallback.
   */
  live?: boolean
  /** Rive cannot run in this session (no WebGL2, download or runtime failure). */
  onLiveFailed?: () => void
}

export function LucyStage({
  state,
  onState,
  variant,
  arrival = true,
  released = false,
  tear = false,
  live = false,
  onLiveFailed,
}: LucyStageProps) {
  const [cut, setCut] = useState(0)
  const [announce, setAnnounce] = useState('')
  const first = useRef(true)
  const figRef = useRef<HTMLDivElement>(null)

  // Every cast after the first frame is a cut: impact frame + streak + announce.
  // The figure is animated in place (never remounted), so a live Rive
  // character keeps running and owns its own state transition.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setAnnounce(STATE_ANNOUNCE[state])
    if (reducedMotion()) return
    setCut((n) => n + 1)
    figRef.current?.animate?.(IMPACT, { duration: 46, easing: 'steps(3, end)' })
  }, [state])

  // Warm the other three masters once the page is idle, so a cut never waits.
  useEffect(() => {
    const warm = () => {
      for (const s of LUCY_STATES) {
        const img = new Image()
        img.decoding = 'async'
        img.src = FIGURE[s].src
      }
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    const handle = idle ? idle(warm, { timeout: 2400 }) : window.setTimeout(warm, 1200)
    return () => {
      if (!idle) window.clearTimeout(handle)
    }
  }, [])

  const fig = FIGURE[state]
  const origin = tear ? TEAR_ORIGIN[state] : undefined

  return (
    <aside
      className={`rf-stage rf-stage--${variant}`}
      data-state={state}
      data-arrival={arrival ? 'true' : 'false'}
      data-released={released ? 'true' : 'false'}
      style={{ '--rf-ground': STAGE_GROUND[state] } as CSSProperties}
      aria-label="Lucy, the line's figure"
    >
      {/* The scene root wraps everything that animates, so the atmosphere and
          the live figure both read its data-scene-running (offscreen, hidden
          tab, released) instead of running observers of their own. */}
      <LucyScene state={state} held={released} className="rf-stage__scene">
        <LucyAtmosphere state={state} />

        <div className="rf-stage__word" aria-hidden="true">
          <span className="rf-stage__word-ghost">{STATE_WORD[state]}</span>
        </div>

        <div
          ref={figRef}
          className={`rf-stage__fig${live ? ' is-live' : ''}`}
          style={{ aspectRatio: `${fig.w} / ${fig.h}` }}
        >
          <img
            src={fig.src}
            alt={STATE_ALT[state]}
            width={fig.w}
            height={fig.h}
            decoding="async"
            fetchPriority={variant === 'stage' && !live ? 'high' : 'auto'}
            draggable={false}
          />
          {live ? (
            <LucyRiveFigure
              state={state}
              figureStyle={{ filter: LIVE_FILTER[state] }}
              onFailed={onLiveFailed ?? (() => {})}
              veil
            />
          ) : null}
          {origin ? (
            <i
              className="rf-tear"
              aria-hidden="true"
              style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}
            />
          ) : null}
        </div>

        <div className="rf-stage__front" aria-hidden="true">
          {FRONT[state].map((g, i) => (
            <i
              key={`${state}-${i}`}
              className="rf-glass"
              style={{
                left: `${g.x}%`,
                top: `${g.y}%`,
                width: `${g.w}%`,
                height: `${g.h}%`,
                transform: `rotate(${g.r}deg)`,
                ['--rf-i' as string]: i,
              } as CSSProperties}
            />
          ))}
        </div>

        {cut > 0 ? <i key={`streak-${cut}`} className="rf-stage__streak" aria-hidden="true" /> : null}
        {cut > 0 ? <i key={`flash-${cut}`} className="rf-stage__flash" aria-hidden="true" /> : null}
      </LucyScene>

      <div className="rf-switch" role="group" aria-label="Lucy's state — play her directly">
        {LUCY_STATES.map((s) => (
          <button
            key={s}
            type="button"
            className={`rf-switch__btn rf-switch__btn--${s}${s === state ? ' is-on' : ''}`}
            aria-pressed={s === state}
            onClick={() => onState(s)}
          >
            {STATE_WORD[s]}
          </button>
        ))}
      </div>

      <p className="lp-sr" aria-live="polite">
        {announce}
      </p>
    </aside>
  )
}
