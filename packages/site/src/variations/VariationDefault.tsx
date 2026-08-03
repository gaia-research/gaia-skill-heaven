import { HEADLINE, COMMANDS, CTA } from '../content'
import { HarnessChooser } from '../components/HarnessChooser'
import { PostureSlider } from '../components/PostureSlider'
import './variation-default.css'

// "Skill Heaven default — White on black. Restraint."
// The clean, developer-first cut: Swiss/typographic, negative space, one crisp
// prism accent. Type-driven, not illustrative. Prism spectrum appears exactly
// once (the hairline rule) plus a single gradient word in the headline.

const COMMAND_ROWS = [
  { cmd: COMMANDS.invoke, label: 'summon', desc: 'Compose a lean skill surface, in place.' },
  { cmd: COMMANDS.launch, label: 'enter', desc: 'Launch the native-default door.' },
  { cmd: COMMANDS.break, label: 'break loose', desc: 'The locked door — gated, and visibly so.' },
] as const

export function VariationDefault() {
  return (
    <main className="vd">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="vd-hero">
        <div className="vd-wrap">
          <p className="vd-kicker vd-stagger" style={{ ['--i' as string]: 0 }}>
            <span className="vd-dot" aria-hidden="true" />
            {HEADLINE.kicker}
          </p>

          <h1 className="vd-display vd-stagger" style={{ ['--i' as string]: 1 }}>
            <span className="vd-line">{HEADLINE.line1}</span>
            <span className="vd-line">
              START <span className="sh-prism-text">SUMMONING</span> THEM.
            </span>
          </h1>

          <p className="vd-sub vd-stagger" style={{ ['--i' as string]: 2 }}>
            {HEADLINE.sub}
          </p>

          <div className="vd-actions vd-stagger" style={{ ['--i' as string]: 3 }}>
            <a className="vd-btn vd-btn--solid" href="#harness">
              {CTA.primary}
            </a>
            <a className="vd-btn vd-btn--ghost" href="#posture">
              {CTA.secondary}
              <span className="vd-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── The single spectrum moment ─────────────────────────────────── */}
      <div className="vd-rule" role="separator" aria-hidden="true" />

      {/* ── 3 commands ─────────────────────────────────────────────────── */}
      <section className="vd-section">
        <div className="vd-wrap">
          <div className="vd-cards">
            {COMMAND_ROWS.map((row) => (
              <div className="vd-card" key={row.cmd}>
                <span className="vd-card__label">{row.label}</span>
                <code className="vd-card__cmd">{row.cmd}</code>
                <p className="vd-card__desc">{row.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Posture ────────────────────────────────────────────────────── */}
      <section className="vd-section" id="posture">
        <div className="vd-wrap">
          <header className="vd-lead">
            <h2 className="vd-h2">Dial in the posture.</h2>
            <p className="vd-lead__note">
              Floor to native — each stop priced honestly, standing and invocation kept
              separate. Hell stays gated.
            </p>
          </header>
          <PostureSlider />
        </div>
      </section>

      {/* ── Harness ────────────────────────────────────────────────────── */}
      <section className="vd-section" id="harness">
        <div className="vd-wrap">
          <header className="vd-lead">
            <h2 className="vd-h2">Pick your harness.</h2>
            <p className="vd-lead__note">
              One door per harness. Nothing installed, nothing mutated, nothing left
              behind.
            </p>
          </header>
          <HarnessChooser />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="vd-footer">
        <div className="vd-wrap vd-footer__row">
          <span className="vd-wordmark">Skill Heaven</span>
          <span className="vd-footer__note">Prototype — white on black. Restraint.</span>
        </div>
      </footer>
    </main>
  )
}
