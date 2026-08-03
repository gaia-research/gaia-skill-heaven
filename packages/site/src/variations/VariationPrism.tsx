import { useEffect, useState } from 'react'
import { HEADLINE, COMMANDS, CTA } from '../content'
import { HarnessChooser } from '../components/HarnessChooser'
import { PostureSlider } from '../components/PostureSlider'
import { PrismDefs, GlassWing, AngelKatana, Halo } from '../components/Art'
import './variation-prism.css'

// Luminance / Prismatic — "Lucy the Skill Angel".
// Near-black canvas, luminous white type, prismatic refraction used sparingly
// as split light. A translucent glass-shard angel: rainbow-hair bloom, one
// oversized crystalline wing, an angel katana. Soft, reverent, gorgeous.

// A few drifting light motes, deterministic so the layout never jitters.
const MOTES = [
  { left: '12%', size: 3, delay: 0, dur: 15 },
  { left: '27%', size: 2, delay: 4, dur: 19 },
  { left: '41%', size: 4, delay: 8, dur: 13 },
  { left: '58%', size: 2, delay: 2, dur: 21 },
  { left: '69%', size: 3, delay: 11, dur: 17 },
  { left: '81%', size: 2, delay: 6, dur: 23 },
  { left: '90%', size: 3, delay: 9, dur: 16 },
]

export function VariationPrism() {
  // Trigger the staggered headline reveal after mount so the fade-up plays
  // even when the route is entered client-side.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className={'vp' + (entered ? ' is-entered' : '')}>
      <PrismDefs />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <header className="vp-hero">
        {/* Drifting light motes rising through the whole hero. */}
        <div className="vp-motes" aria-hidden>
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="vp-mote"
              style={{
                left: m.left,
                width: m.size,
                height: m.size,
                animationDelay: `${m.delay}s`,
                animationDuration: `${m.dur}s`,
              }}
            />
          ))}
        </div>

        {/* Lucy — a tall translucent glass column with a rainbow-hair bloom. */}
        <div className="vp-lucy" aria-hidden>
          <div className="vp-lucy__hair" />
          <div className="vp-lucy__halo">
            <Halo className="vp-halo" />
          </div>
          <div className="vp-lucy__body" />
          <AngelKatana className="vp-katana" />
        </div>

        {/* The oversized single wing, bleeding off the right edge. */}
        <GlassWing className="vp-wing" />

        {/* Soft radial halo glow behind the headline. */}
        <div className="vp-hero__glow" aria-hidden />

        <div className="vp-hero__inner">
          <p className="vp-eyebrow vp-reveal" style={{ ['--i' as string]: 0 }}>
            {HEADLINE.kicker}
          </p>
          <h1 className="vp-display">
            <span className="vp-display__line vp-reveal" style={{ ['--i' as string]: 1 }}>
              {HEADLINE.line1}
            </span>
            <span
              className="vp-display__line sh-prism-text vp-reveal"
              style={{ ['--i' as string]: 2 }}
            >
              {HEADLINE.line2}
            </span>
          </h1>
          <p className="vp-sub vp-reveal" style={{ ['--i' as string]: 3 }}>
            {HEADLINE.sub}
          </p>
          <div className="vp-cta vp-reveal" style={{ ['--i' as string]: 4 }}>
            <a className="vp-btn vp-btn--primary" href="#harness">
              {CTA.primary}
            </a>
            <a className="vp-btn vp-btn--ghost" href="#method">
              {CTA.secondary}
            </a>
          </div>
        </div>

        <div className="vp-scroll" aria-hidden>
          <span className="vp-scroll__line" />
        </div>
      </header>

      {/* ── COMMANDS STRIP ────────────────────────────────────────────── */}
      <section className="vp-commands" aria-label="Commands">
        <div className="vp-commands__inner">
          <span className="vp-chip">
            <code>{COMMANDS.invoke}</code>
            <em>to summon</em>
          </span>
          <span className="vp-chip">
            <code>{COMMANDS.launch}</code>
            <em>to enter</em>
          </span>
          <span className="vp-chip vp-chip--break">
            <code>{COMMANDS.break}</code>
            <em>to break loose</em>
          </span>
        </div>
      </section>

      {/* ── POSTURE ───────────────────────────────────────────────────── */}
      <section className="vp-section" id="method">
        <div className="vp-section__inner">
          <div className="vp-section__head">
            <p className="vp-section__eyebrow">POSTURE</p>
            <h2 className="vp-section__title">Choose how clean you run.</h2>
            <p className="vp-section__lede">
              Slide from the byte-frozen floor to your harness as shipped. Every
              stop is priced honestly — standing and invocation, never one number.
            </p>
          </div>
          <div className="vp-slab">
            <PostureSlider />
          </div>
        </div>
      </section>

      {/* ── HARNESS ───────────────────────────────────────────────────── */}
      <section className="vp-section vp-section--alt" id="harness">
        <div className="vp-section__inner">
          <div className="vp-section__head">
            <p className="vp-section__eyebrow">DOORS</p>
            <h2 className="vp-section__title">Pick your harness.</h2>
            <p className="vp-section__lede">
              One door per harness. Install the flagship, ride the vanguard, or
              compile a recipe — then summon a lean skill surface at launch.
            </p>
          </div>
          <div className="vp-slab">
            <HarnessChooser />
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="vp-footer">
        <div className="vp-footer__inner">
          <span className="vp-footer__mark sh-prism-text">Skill Heaven</span>
          <span className="vp-footer__note">
            Nothing installed · nothing mutated · nothing left behind.
          </span>
        </div>
      </footer>
    </div>
  )
}
