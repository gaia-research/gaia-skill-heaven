import { useEffect, useRef } from 'react'
import type { LucyLoadProgress } from '../rive/createLucyCharacter'
import { LUCY_LIVE } from '../rive/lucyLiveManifest'
import type { EntranceState } from './useEntrance'
import './entrance.css'

// ─────────────────────────────────────────────────────────────────────────
// Entrance · "Gateway" (owner's pick, design campaign 2026-11-04).
//
// The hero's own halo — a 1.5 px bone ring — closes as the world arrives.
// The arc advances by bytes; its leading edge carries the spectrum as four
// adjacent split-light stripes (never a gradient fill). Four ticks on the
// ring are the four worlds: west zero, north heaven, east hell, south ultra;
// each lights in its document hue when that state is switchable. Inside the
// ring the diamond eye outline breathes on Zero's 12 s clock. The wordmark
// waits under the rim. Then the house impact frame, and a cut.
//
// Copy never names the character (PRODUCT.md: the persona's public name is
// reserved); it says "the figure".
// ─────────────────────────────────────────────────────────────────────────

const WORLDS = ['zero', 'heaven', 'hell', 'ultra'] as const
const RIV_AND_SIDECARS = LUCY_LIVE.bytes + Object.values(LUCY_LIVE.sidecarBytes as Record<string, number>).reduce((a, b) => a + b, 0)
const mb = (n: number) => (n / 1e6).toFixed(1)

const STAGE_LABEL: Record<NonNullable<LucyLoadProgress['stage']> | 'runtime', string> = {
  runtime: 'runtime',
  figure: 'the figure',
  'first-frame': 'first frame',
  ultra: 'ultra',
  hell: 'hell',
  zero: 'zero',
  done: 'ready',
}

export interface EntranceProps {
  entrance: EntranceState
  progress: LucyLoadProgress | null
  onRetry(): void
}

export function Entrance({ entrance, progress, onRetry }: EntranceProps) {
  const { phase, visible, impact, late, skip } = entrance
  const skipRef = useRef<HTMLButtonElement>(null)
  const enterRef = useRef<HTMLButtonElement>(null)

  // Esc / S skip, as the hero's own skip control; the first tab stop is Skip
  useEffect(() => {
    if (!visible) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 's') {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, skip])

  useEffect(() => {
    if (phase === 'failed') enterRef.current?.focus()
    else if (late) skipRef.current?.focus()
  }, [phase, late])

  if (!visible) return null

  const received = progress?.received ?? 0
  const f = Math.max(0, Math.min(1, received / RIV_AND_SIDECARS))
  const stage: keyof typeof STAGE_LABEL = progress ? progress.stage : 'runtime'
  const arcOffset = 1000 - 1000 * f
  const status =
    phase === 'failed' ? (
      <>
        live figure · <b>unavailable</b>
      </>
    ) : phase === 'ready' ? (
      <>
        ready · <b>entering</b>
      </>
    ) : late ? (
      <>
        still preparing · <b>skip opens the still figure</b>
      </>
    ) : (
      <>
        preparing · <b>{STAGE_LABEL[stage]}</b>
      </>
    )

  return (
    <section
      className={`sh-entrance${impact ? ' is-impact' : ''}${phase === 'ready' ? ' is-ready' : ''}`}
      data-phase={phase}
      aria-busy={phase === 'loading'}
      aria-label="Skill Heaven is preparing"
    >
      <div className="sh-entrance__bloom" aria-hidden="true" />
      <span className="sh-entrance__reg sh-entrance__reg--tl" aria-hidden="true" />
      <span className="sh-entrance__reg sh-entrance__reg--bl" aria-hidden="true" />
      <span className="sh-entrance__reg sh-entrance__reg--br" aria-hidden="true" />

      <div className="sh-entrance__ring" aria-hidden="true">
        <svg viewBox="0 0 400 400">
          <circle className="sh-entrance__base" cx="200" cy="200" r="190" />
          <circle
            className="sh-entrance__arc"
            cx="200"
            cy="200"
            r="190"
            pathLength={1000}
            strokeDasharray="1000"
            style={{ strokeDashoffset: arcOffset }}
            transform="rotate(-90 200 200)"
          />
          <g transform="rotate(-90 200 200)" style={{ opacity: f > 0.01 ? 1 : 0 }}>
            {['#a58ae0', '#6f96d8', '#5fc2d6', '#71ccae'].map((c, i) => (
              <circle
                key={c}
                className="sh-entrance__tip"
                cx="200"
                cy="200"
                r="190"
                pathLength={1000}
                stroke={c}
                strokeDasharray="12 988"
                style={{ strokeDashoffset: -(1000 * f - 48 + i * 12) }}
              />
            ))}
          </g>
          {/* the four worlds on the ring: W zero · N heaven · E hell · S ultra */}
          <path className={`sh-entrance__tick${progress?.ready.zero ? ' is-lit' : ''}`} data-band="zero" d="M-2 200h20" />
          <text className="sh-entrance__ticklabel" x="30" y="203">
            zero
          </text>
          <path className={`sh-entrance__tick${progress?.ready.heaven && progress?.firstFrame ? ' is-lit' : ''}`} data-band="heaven" d="M200 -2v20" />
          <text className="sh-entrance__ticklabel" x="200" y="34" textAnchor="middle">
            heaven
          </text>
          <path className={`sh-entrance__tick${progress?.ready.hell ? ' is-lit' : ''}`} data-band="hell" d="M382 200h20" />
          <text className="sh-entrance__ticklabel" x="370" y="203" textAnchor="end">
            hell
          </text>
          <path className={`sh-entrance__tick${progress?.ready.ultra ? ' is-lit' : ''}`} data-band="ultra" d="M200 382v20" />
          <text className="sh-entrance__ticklabel" x="200" y="372" textAnchor="middle">
            ultra
          </text>
          <g className="sh-entrance__diamond-x">
            <path d="M200 112v176M112 200h176" />
          </g>
          <path className="sh-entrance__diamond" d="M200 112 288 200 200 288 112 200Z" />
        </svg>
      </div>

      <h1 className="sh-entrance__word" aria-label="Skill Heaven">
        HEAVEN
        <span className="sh-entrance__skill" aria-hidden="true">
          Skill
        </span>
      </h1>

      <div className="sh-entrance__status" role="status" aria-live="polite">
        <div className="sh-entrance__line">{status}</div>
        <div className="sh-entrance__line sh-entrance__num">
          {mb(received)} / {mb(RIV_AND_SIDECARS)} MB
        </div>
      </div>

      {phase === 'failed' && (
        <div className="sh-entrance__fail">
          <p>The live figure could not load here. Skill Heaven still opens, with the still figure.</p>
          <div className="sh-entrance__row">
            <button ref={enterRef} type="button" className="sh-entrance__btn sh-entrance__btn--primary" onClick={skip}>
              Enter now →
            </button>
            <button type="button" className="sh-entrance__btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}

      <button ref={skipRef} type="button" className="sh-entrance__skip" onClick={skip}>
        Skip · enter now → <small>still figure</small>
      </button>
    </section>
  )
}

export { WORLDS as ENTRANCE_WORLDS }
