import React from 'react'
import { HEADLINE, HARNESSES, POSTURES, COMMANDS, CTA } from '../content'
import './variation-manifesto.css'

// ─────────────────────────────────────────────────────────────────────────
// VARIATION: MANIFESTO
// Wood-type letterpress conviction (1914). Deliberately INVERTED from the
// other cuts: near-black condensed wood-type on a luminous paper field
// (dark-on-light). Oversized stacked imperative verbs, numbered ordinals on
// the right rail, a ticker strip of caps phrases, diagonal clip-path cuts.
// The signature move: on scroll a diagonal HELL BLADE sweeps the middle band
// and the panel it crosses flips to inverted ink/paper — the type looks torn
// where the blade passes — then heals as you scroll past. One accent only:
// a single warm letterpress red (--vm-red), used ONLY for the destroy state.
// Everything is CSS; no image assets, no animation libraries.
// ─────────────────────────────────────────────────────────────────────────

// rAF-throttled scroll listener. Writes --hell (0..1, peaks in the middle
// band, heals at the ends) and --p (raw progress) onto the wrapper's style,
// so the blade + inversion are pure CSS off a single custom property.
function useScrollHell(ref: React.RefObject<HTMLDivElement>) {
  React.useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = ref.current
        if (!el) return
        const max = document.body.scrollHeight - window.innerHeight
        const p = max > 0 ? window.scrollY / max : 0
        // hell peaks in the middle band, heals at the two ends:
        const hell =
          Math.max(0, Math.min(1, (p - 0.3) / 0.18)) *
          Math.max(0, Math.min(1, (0.62 - p) / 0.18))
        el.style.setProperty('--hell', String(hell))
        el.style.setProperty('--p', String(p))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

// Right-rail ordinals. 03 is the gated hell door — a locked panel, shown in
// all modes (P2 "gated, and visibly so"), NEVER an activator.
const ORDINALS = [
  { n: '01', verb: 'SUMMON', cmd: COMMANDS.invoke, note: 'Compose a lean skill surface, in place.', gated: false },
  { n: '02', verb: 'ENTER', cmd: COMMANDS.launch, note: 'Launch the native-default door.', gated: false },
  { n: '03', verb: 'GATED', cmd: COMMANDS.break, note: 'The locked door — gated, and visibly so.', gated: true },
] as const

const TICKER = [
  'NOTHING INSTALLED',
  'NOTHING MUTATED',
  'TWO NUMBERS ALWAYS',
  'HELL IS GATED',
  'BENCHMARKED NOT GUESSED',
] as const

const STATUS_WORD: Record<string, string> = {
  flagship: 'FLAGSHIP',
  vanguard: 'VANGUARD',
  recipe: 'RECIPE',
  gated: 'GATED',
}

export function VariationManifesto() {
  const rootRef = React.useRef<HTMLDivElement>(null)
  useScrollHell(rootRef)

  // The ticker is doubled so the marquee loops seamlessly. When reduced-motion
  // is on, the animation is neutralized globally and it simply reads static.
  const tickerRun = [...TICKER, ...TICKER]

  return (
    <div className="vm" ref={rootRef}>
      {/* ── The diagonal HELL BLADE — sweeps the middle scroll band ─────── */}
      <div className="vm-blade" aria-hidden="true" />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="vm-hero">
        <div className="vm-wrap vm-hero__grid">
          <div className="vm-hero__main">
            <p className="vm-kicker">
              <span className="vm-mark" aria-hidden="true">▚</span>
              {HEADLINE.kicker}
            </p>

            <h1 className="vm-display" aria-label={`${HEADLINE.line1} ${HEADLINE.line2}`}>
              <span className="vm-verb vm-verb--1">SUMMON<span className="vm-verb__them"> THEM.</span></span>
              <span className="vm-verb vm-verb--2">RESTRAIN.</span>
              <span className="vm-slash" aria-hidden="true" />
              <span className="vm-verb vm-verb--3 vm-verb--cut">BREAK LOOSE</span>
            </h1>

            <p className="vm-sub">{HEADLINE.sub}</p>

            <div className="vm-actions">
              <a className="vm-btn vm-btn--solid" href="#vm-harness">
                {CTA.primary}
              </a>
              <a className="vm-btn vm-btn--ghost" href="#vm-method">
                {CTA.secondary}
                <span className="vm-arrow" aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          {/* ── Right rail: numbered ordinals ─────────────────────────── */}
          <ol className="vm-rail" aria-label="How Skill Heaven runs">
            {ORDINALS.map((o) => (
              <li
                key={o.n}
                className={'vm-rail__item' + (o.gated ? ' vm-rail__item--gated' : '')}
              >
                <span className="vm-rail__n" aria-hidden="true">{o.n}</span>
                <div className="vm-rail__body">
                  <span className="vm-rail__verb">
                    {o.verb}
                    {o.gated && (
                      <span className="vm-rail__lock" aria-label="locked, not an activator"> ▓</span>
                    )}
                  </span>
                  <code className="vm-rail__cmd">{o.cmd}</code>
                  <span className="vm-rail__note">{o.note}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Ticker strip ────────────────────────────────────────────────── */}
      <div className="vm-ticker" aria-hidden="true">
        <div className="vm-ticker__run">
          {tickerRun.map((t, i) => (
            <span className="vm-ticker__cell" key={`${t}-${i}`}>
              {t}
              <span className="vm-ticker__sep">//</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Entropy ladder (rendered inline, wood-type idiom) ───────────── */}
      <section className="vm-section" id="vm-method">
        <div className="vm-wrap">
          <header className="vm-lead">
            <span className="vm-lead__ord" aria-hidden="true">A.</span>
            <h2 className="vm-h2">CLIMB THE LADDER.</h2>
            <p className="vm-lead__note">
              Off to native — every rung priced honestly. Standing (paid each
              session) and invocation (paid on invoke) are always two numbers,
              never one.
            </p>
          </header>

          <div className="vm-postures">
            {POSTURES.map((posture, i) => (
              <article className="vm-posture" key={posture.key}>
                <span className="vm-posture__ord" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="vm-posture__label">{posture.label}</h3>
                <p className="vm-posture__blurb">{posture.blurb}</p>
                <code className="vm-posture__dose">{posture.dose}</code>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Harness install grid ────────────────────────────────────────── */}
      <section className="vm-section" id="vm-harness">
        <div className="vm-wrap">
          <header className="vm-lead">
            <span className="vm-lead__ord" aria-hidden="true">B.</span>
            <h2 className="vm-h2">PICK YOUR DOOR.</h2>
            <p className="vm-lead__note">
              One door per harness. Nothing installed, nothing mutated, nothing
              left behind.
            </p>
          </header>

          <div className="vm-harnesses">
            {HARNESSES.map((h) => (
              <article
                className={'vm-harness vm-harness--' + h.status}
                key={h.id}
              >
                <header className="vm-harness__head">
                  <h3 className="vm-harness__name">{h.name}</h3>
                  <span className="vm-harness__status">{STATUS_WORD[h.status] ?? h.status}</span>
                </header>
                <pre className="vm-harness__install"><code>{h.install}</code></pre>
                <p className="vm-harness__note">{h.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Commands ────────────────────────────────────────────────────── */}
      <section className="vm-section">
        <div className="vm-wrap">
          <header className="vm-lead">
            <span className="vm-lead__ord" aria-hidden="true">C.</span>
            <h2 className="vm-h2">THREE MOVES.</h2>
          </header>

          <dl className="vm-commands">
            <div className="vm-command">
              <dt className="vm-command__label">SUMMON</dt>
              <dd className="vm-command__cmd"><code>{COMMANDS.invoke}</code></dd>
            </div>
            <div className="vm-command">
              <dt className="vm-command__label">ENTER</dt>
              <dd className="vm-command__cmd"><code>{COMMANDS.launch}</code></dd>
            </div>
            <div className="vm-command vm-command--gated">
              <dt className="vm-command__label">
                BREAK LOOSE <span className="vm-command__lock" aria-hidden="true">▓</span>
              </dt>
              <dd className="vm-command__cmd">
                <code>{COMMANDS.break}</code>
                <span className="vm-command__gate">LOCKED · GATED</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Colophon ────────────────────────────────────────────────────── */}
      <footer className="vm-footer">
        <div className="vm-wrap vm-footer__row">
          <span className="vm-wordmark">SKILL HEAVEN</span>
          <span className="vm-footer__note">
            Prototype — wood-type manifesto. Set in the letterpress idiom.
          </span>
        </div>
      </footer>
    </div>
  )
}
