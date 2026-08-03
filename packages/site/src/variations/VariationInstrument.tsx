import React from 'react'
import { HARNESSES, POSTURES, COMMANDS, CTA } from '../content'
import './variation-instrument.css'

// Honest Instrument — "numbers you can summon."
// A moody dark laboratory panel: glowing nixie tubes on a machined chassis,
// engraved plates, brass screws. This is the ONE variation where a warm amber
// glow is correct — the nixie idiom — because it proves the honest-dosing /
// HH-Index brand value: every skill benchmarked, two numbers always.

// Scroll-driven "tamper" beat: mid-page, --hell rises toward 1 and the tubes
// flicker / go cold, then recover. Neutralised under prefers-reduced-motion.
function useScrollHell(ref: React.RefObject<HTMLDivElement | null>) {
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
        const hell =
          Math.max(0, Math.min(1, (p - 0.3) / 0.18)) *
          Math.max(0, Math.min(1, (0.62 - p) / 0.18))
        el.style.setProperty('--hell', String(hell))
        el.style.setProperty('--p', String(p))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [ref])
}

// A single nixie tube: glass dome, inner reference grid, one warm glowing
// digit with a soft filament bloom. Pure CSS/SVG, no images.
function NixieTube({ digit, size = 'lg' }: { digit: string; size?: 'lg' | 'sm' }) {
  return (
    <span className={`vi-tube vi-tube--${size}`} aria-hidden>
      <span className="vi-tube__glass">
        <span className="vi-tube__grid" />
        {/* ghost cathodes — the unlit digits a real nixie shows faintly */}
        <span className="vi-tube__ghost">8</span>
        <span className="vi-tube__digit">{digit}</span>
        <span className="vi-tube__glow" />
        <span className="vi-tube__reflect" />
      </span>
      <span className="vi-tube__base">
        <span className="vi-tube__pin" />
        <span className="vi-tube__pin" />
        <span className="vi-tube__pin" />
      </span>
    </span>
  )
}

// The thin engraved-circle SVG icons for the feature cards — one line-weight,
// no fill, in the instrument idiom.
function IconCompose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.4" />
      <path d="M17 24h14M24 17v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconTwoNumbers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M15 19h6v12M27 19h6M27 25h6M27 31h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconProbe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="24" cy="24" r="9" stroke="currentColor" strokeWidth="1.4" />
      <path d="M24 6v6M24 36v6M6 24h6M36 24h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </svg>
  )
}

const FEATURES = [
  {
    Icon: IconCompose,
    title: 'Composed, Not Installed',
    body:
      'The launcher composes flags and execs — it never stashes, restores, or edits your ~/.claude, settings, or skills. Nothing mutated, nothing left behind.',
  },
  {
    Icon: IconTwoNumbers,
    title: 'Two Numbers, Always',
    body:
      'No skill is ever priced as one number. Standing is paid every session; invocation is paid on invoke. Both are reported, separately, every time.',
  },
  {
    Icon: IconProbe,
    title: 'Empirical Before Load-Bearing',
    body:
      'Nothing load-bearing ships ahead of an empirical probe on a pinned harness version. A negative result is a first-class finding — recorded, never papered over.',
  },
] as const

export function VariationInstrument() {
  const rootRef = React.useRef<HTMLDivElement>(null)
  useScrollHell(rootRef)

  // Which posture is currently selected on the machined rail.
  const [posture, setPosture] = React.useState<string>('product-floor')
  const active = POSTURES.find((p) => p.key === posture) ?? POSTURES[0]

  // The lit digits for the small readout mirror the active posture's dose —
  // real figures only. floor 19,661 / product-floor 20,176; the others are
  // dose *strings*, so the readout shows a dash row and defers to the plate.
  const READOUT: Record<string, string> = {
    floor: '19661',
    'product-floor': '20176',
    curated: '-----',
    native: '-----',
  }
  const readoutDigits = (READOUT[posture] ?? '-----').split('')

  return (
    <div className="vi" ref={rootRef}>
      {/* film-grain + vignette on the whole panel */}
      <div className="vi-grain" aria-hidden />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <header className="vi-hero">
        <div className="vi-hero__inner">
          <p className="vi-kicker">HELL · HEAVEN · INDEX</p>
          <h1 className="vi-display">Numbers you can summon.</h1>
          <p className="vi-sub">
            Every skill benchmarked, not guessed. Two numbers always — standing,
            paid every session; invocation, paid on invoke.
          </p>

          {/* The centerpiece instrument. */}
          <div className="vi-instrument" role="img" aria-label="Standing tokens at the product floor: 20,176 tokens, minus 28.9 percent versus native.">
            <div className="vi-chassis">
              <span className="vi-screw vi-screw--tl" aria-hidden />
              <span className="vi-screw vi-screw--tr" aria-hidden />
              <span className="vi-screw vi-screw--bl" aria-hidden />
              <span className="vi-screw vi-screw--br" aria-hidden />

              <div className="vi-tubes vi-tubes--hero">
                {'20176'.split('').map((d, i) => (
                  <NixieTube key={i} digit={d} size="lg" />
                ))}
              </div>

              <div className="vi-plate">STANDING TOKENS · PRODUCT FLOOR</div>

              <div className="vi-readout" aria-hidden>
                <span className="vi-readout__delta">−28.9%</span>
                <span className="vi-readout__unit">vs native</span>
              </div>
            </div>
          </div>

          <div className="vi-cta">
            <a className="vi-btn vi-btn--primary" href="#harness">
              {CTA.primary}
            </a>
            <a className="vi-btn vi-btn--ghost" href="#index">
              {CTA.secondary}
            </a>
          </div>
        </div>
      </header>

      {/* ── POSTURE RAIL ──────────────────────────────────────────────── */}
      <section className="vi-section" id="posture" aria-label="Posture selector">
        <div className="vi-section__inner">
          <div className="vi-section__head">
            <p className="vi-eyebrow">POSTURE · CALIBRATION</p>
            <h2 className="vi-section__title">Turn the dial. Read the dose.</h2>
            <p className="vi-lede">
              Four detented positions on a machined rail — from the byte-frozen
              floor to your harness as shipped. Select one; the readout lights with
              its measured dose.
            </p>
          </div>

          <div className="vi-panel">
            {/* smaller nixie readout, lit to the active posture */}
            <div className="vi-panel__display">
              <div className="vi-tubes vi-tubes--sm">
                {readoutDigits.map((d, i) => (
                  <NixieTube key={`${posture}-${i}`} digit={d} size="sm" />
                ))}
              </div>
              <div className="vi-panel__dose">
                <span className="vi-panel__doselabel">{active.label.toUpperCase()}</span>
                <span className="vi-panel__dosestr">{active.dose}</span>
              </div>
            </div>

            {/* the detented rail — real buttons, keyboard focusable */}
            <div className="vi-rail" role="group" aria-label="Choose a posture">
              <span className="vi-rail__track" aria-hidden />
              {POSTURES.map((p) => {
                const on = p.key === posture
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={'vi-detent' + (on ? ' is-on' : '')}
                    aria-pressed={on}
                    onClick={() => setPosture(p.key)}
                  >
                    <span className="vi-detent__notch" aria-hidden />
                    <span className="vi-detent__label">{p.label}</span>
                  </button>
                )
              })}
            </div>

            <p className="vi-panel__blurb">{active.blurb}</p>
          </div>
        </div>
      </section>

      {/* ── HH INDEX ──────────────────────────────────────────────────── */}
      <section className="vi-section vi-section--alt" id="index" aria-label="The Hell/Heaven Index">
        <div className="vi-section__inner">
          <div className="vi-index">
            <div className="vi-index__mark" aria-hidden>
              <span className="vi-index__glyph">HH</span>
            </div>
            <div className="vi-index__body">
              <p className="vi-eyebrow">THE MECHANISM</p>
              <h2 className="vi-section__title">Every skill has a Hell/Heaven Index.</h2>
              <p className="vi-index__lede">
                Each skill is benchmarked to a per-skill Hell/Heaven Index — a
                measured record of what it costs to stand and what it costs to
                invoke, on a pinned harness version. The Index is the mechanism a
                neighbor can&rsquo;t truthfully copy: you can restate a number, but
                you can&rsquo;t forge the probe behind it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section className="vi-section" aria-label="What the instrument guarantees">
        <div className="vi-section__inner">
          <div className="vi-cards">
            {FEATURES.map(({ Icon, title, body }) => (
              <article className="vi-card" key={title}>
                <Icon className="vi-card__icon" />
                <h3 className="vi-card__title">{title}</h3>
                <p className="vi-card__body">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HARNESSES ─────────────────────────────────────────────────── */}
      <section className="vi-section vi-section--alt" id="harness" aria-label="Install by harness">
        <div className="vi-section__inner">
          <div className="vi-section__head">
            <p className="vi-eyebrow">DOORS</p>
            <h2 className="vi-section__title">One door per harness.</h2>
            <p className="vi-lede">
              Install the flagship, ride the vanguard, or compile a recipe — then
              summon a lean, benchmarked skill surface at launch.
            </p>
          </div>

          <div className="vi-harness">
            {HARNESSES.map((h) => (
              <article className={'vi-harness__cell vi-harness__cell--' + h.status} key={h.id}>
                <header className="vi-harness__head">
                  <span className="vi-harness__name">{h.name}</span>
                  <span className={'vi-harness__tag vi-harness__tag--' + h.status}>{h.status}</span>
                </header>
                <pre className="vi-harness__install"><code>{h.install}</code></pre>
                <p className="vi-harness__note">{h.note}</p>
              </article>
            ))}
          </div>

          {/* commands, including the gated locked door */}
          <div className="vi-commands">
            <span className="vi-cmd">
              <code>{COMMANDS.invoke}</code>
              <em>invoke</em>
            </span>
            <span className="vi-cmd">
              <code>{COMMANDS.launch}</code>
              <em>launch</em>
            </span>
            <span className="vi-cmd vi-cmd--gated" aria-disabled>
              <code>{COMMANDS.break}</code>
              <em>gated · locked door</em>
              <span className="vi-cmd__lock" aria-hidden>&#9679;</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="vi-footer">
        <div className="vi-footer__inner">
          <span className="vi-footer__mark">Skill Heaven</span>
          <span className="vi-footer__note">
            Numbers you can summon · nothing installed · nothing mutated.
          </span>
        </div>
      </footer>
    </div>
  )
}
