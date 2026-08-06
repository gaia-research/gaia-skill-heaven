import { useEffect, useRef, useState } from 'react'
import { HEADLINE, COMMANDS, CTA } from '../content'
import { HarnessChooser } from '../components/HarnessChooser'
import { EntropyLadder } from '../components/EntropyLadder'
import { PrismDefs, GlassWing, AngelKatana, Halo } from '../components/Art'
import './variation-overdrive.css'

// ─────────────────────────────────────────────────────────────────────────
// VARIATION: OVERDRIVE
// Landing-page overdrive. Oversized kinetic typeset ("SKILL" / "HEAVEN"),
// single oversized glass wing, angel katana, scroll-world parallax, and the
// signature move: a HELL SLICE that glitches Heaven→Hell — the page inverts
// to black-on-white for a beat, Lucy becomes the fallen angel — then heals.
// Everything is CSS/SVG; no image assets, no animation libs.
// ─────────────────────────────────────────────────────────────────────────

// Small hook: normalized scroll progress [0,1] across the whole page, plus the
// raw scrollY. Drives the scroll-world parallax + the hell-slice reveal.
function useScrollProgress() {
  const [state, setState] = useState({ y: 0, p: 0 })
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = document.body.scrollHeight - window.innerHeight
        const y = window.scrollY
        setState({ y, p: max > 0 ? y / max : 0 })
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return state
}

export function VariationOverdrive() {
  const { y, p } = useScrollProgress()
  const rootRef = useRef<HTMLDivElement>(null)

  // Hell slice intensity: ramps up in the middle band of the scroll, then
  // releases. Peaks around 45–60% scroll — the "slice through" moment.
  const hell = Math.max(0, Math.min(1, (p - 0.34) / 0.18)) * Math.max(0, Math.min(1, (0.66 - p) / 0.18))
  const inHell = hell > 0.45

  // Expose scroll-driven values to CSS as custom properties.
  const vars = {
    ['--sy' as string]: String(y),
    ['--p' as string]: String(p),
    ['--hell' as string]: hell.toFixed(3),
  }

  return (
    <div
      ref={rootRef}
      className={'vo' + (inHell ? ' vo--hell' : '')}
      style={vars}
    >
      <PrismDefs />

      {/* ── Fixed atmospheric backdrop (scroll-world parallax layers) ── */}
      <div className="vo-sky" aria-hidden>
        <div className="vo-sky__grid" />
        <div className="vo-sky__glow" />
        {/* drifting light motes */}
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className="vo-mote" style={{ ['--i' as string]: i }} />
        ))}
      </div>

      {/* ── HERO: kinetic typeset ── */}
      <header className="vo-hero">
        <Halo className="vo-hero__halo" />

        {/* Oversized single wing bleeding off the right */}
        <GlassWing className="vo-hero__wing" />

        {/* Lucy — a translucent glass column with prismatic hair bloom */}
        <div className="vo-lucy" aria-hidden>
          <div className="vo-lucy__hair" />
          <div className="vo-lucy__body" />
          <AngelKatana className="vo-lucy__katana" />
        </div>

        <div className="vo-hero__type">
          <span className="vo-eyebrow">{HEADLINE.kicker}</span>
          <h1 className="vo-word vo-word--skill" data-text="SKILL">
            SKILL
          </h1>
          <h1 className="vo-word vo-word--heaven sh-prism-text" data-text="HEAVEN">
            HEAVEN
          </h1>
          <p className="vo-tagline">
            <b>{HEADLINE.line1}</b> {HEADLINE.line2}
          </p>
          <p className="vo-sub">{HEADLINE.sub}</p>
          <div className="vo-cta">
            <button className="vo-btn vo-btn--primary">{CTA.primary}</button>
            <button className="vo-btn vo-btn--ghost">{CTA.secondary} →</button>
          </div>
        </div>

        <div className="vo-scrollcue" aria-hidden>
          <span>scroll to summon</span>
          <span className="vo-scrollcue__bar" />
        </div>
      </header>

      {/* ── HELL SLICE: the glitch inversion band ── */}
      <section className="vo-slice" aria-hidden={!inHell}>
        <div className="vo-slice__scan" />
        <div className="vo-slice__glitch" data-text="/skill-hell">
          /skill-hell
        </div>
        <h2 className="vo-slice__title" data-text="HELL">
          HELL
        </h2>
        <p className="vo-slice__note">
          The locked door. Shown in every mode — gated, and visibly so. Break loose
          only when the hell lane opens.
        </p>
      </section>

      {/* ── Commands strip ── */}
      <section className="vo-cmds">
        <div className="vo-cmd">
          <code>{COMMANDS.invoke}</code>
          <span>to summon</span>
        </div>
        <div className="vo-cmd">
          <code>{COMMANDS.launch}</code>
          <span>to enter</span>
        </div>
        <div className="vo-cmd vo-cmd--break">
          <code>{COMMANDS.break}</code>
          <span>to break loose</span>
        </div>
      </section>

      {/* ── Posture ── */}
      <section className="vo-section">
        <div className="vo-section__head">
          <h3>Choose how clean you run.</h3>
          <p>
            Climb from off to your native harness. Every
            stop is priced honestly — standing and invocation, never one number.
          </p>
        </div>
        <EntropyLadder />
      </section>

      {/* ── Harness ── */}
      <section className="vo-section">
        <div className="vo-section__head">
          <h3>Pick your harness.</h3>
          <p>Claude is the flagship door. Pick yours; the install and launch script appears.</p>
        </div>
        <HarnessChooser />
      </section>

      <footer className="vo-footer">
        <span className="vo-footer__mark sh-prism-text">SKILL HEAVEN</span>
        <span className="vo-footer__note">
          prototype · overdrive · strip your agent's context bloat, run clean
        </span>
      </footer>
    </div>
  )
}
