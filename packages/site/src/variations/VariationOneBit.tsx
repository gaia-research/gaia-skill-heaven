import React from 'react'
import { HEADLINE, HARNESSES, POSTURES, COMMANDS, CTA } from '../content'
import './variation-onebit.css'

// ─────────────────────────────────────────────────────────────────────────
// VARIATION: ONE-BIT INVERT
// A classic 1-bit black-and-white Macintosh desktop, rebuilt for Skill Heaven.
// Dithered dot wallpaper, pixel-font chrome, hard-bevel windows with striped
// title bars and close boxes, a menu bar, desktop icons. STRICTLY monochrome:
// pure #000 / #fff (with a single near-black/near-white pair). No greys are
// used as fill in the flip — the Heaven→Hell duality is done at the pixel level
// as a literal `filter: invert(1)`, which turns the white desktop black.
//
// The invert IS the material: on scroll a --hell 0..1 var (peaks mid-page,
// heals at the ends) drives the whole desktop through invert(1), intensifying
// scanlines/dither as it flips. /skill-hell is a real LOCKED door (P2 gated,
// shown-but-disabled); clicking it raises a 1-bit modal dialog, never window.alert.
// Everything is CSS + SVG; no image assets, no animation libraries.
// ─────────────────────────────────────────────────────────────────────────

// rAF-throttled scroll listener. Writes --hell (0..1, peaks mid-band, heals at
// the ends) and --p (raw progress) onto the wrapper's style, so the invert +
// dither intensification are pure CSS off a single custom property.
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
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

// ── Pixel icon glyphs (crisp 1-bit SVG, no anti-aliasing sheen) ────────────
type IconName = 'system' | 'skills' | 'postures' | 'terminal' | 'trash'

function PixelIcon({ name }: { name: IconName }) {
  const common = {
    width: 32,
    height: 32,
    viewBox: '0 0 16 16',
    shapeRendering: 'crispEdges' as const,
    'aria-hidden': true,
    focusable: false as const,
  }
  switch (name) {
    case 'system':
      return (
        <svg {...common} className="vb-ico">
          <rect x="1" y="2" width="14" height="10" fill="none" strokeWidth="1" />
          <rect x="3" y="4" width="10" height="1" />
          <rect x="3" y="6" width="7" height="1" />
          <rect x="3" y="8" width="9" height="1" />
          <rect x="5" y="13" width="6" height="1" />
          <rect x="6" y="12" width="4" height="1" />
        </svg>
      )
    case 'skills':
      return (
        <svg {...common} className="vb-ico">
          <rect x="2" y="1" width="10" height="14" fill="none" strokeWidth="1" />
          <rect x="12" y="1" width="2" height="14" />
          <rect x="4" y="4" width="6" height="1" />
          <rect x="4" y="6" width="6" height="1" />
          <rect x="4" y="8" width="4" height="1" />
        </svg>
      )
    case 'postures':
      return (
        <svg {...common} className="vb-ico">
          <rect x="1" y="2" width="14" height="12" fill="none" strokeWidth="1" />
          <rect x="3" y="5" width="10" height="1" />
          <rect x="3" y="9" width="10" height="1" />
          <rect x="4" y="4" width="2" height="3" />
          <rect x="10" y="8" width="2" height="3" />
        </svg>
      )
    case 'terminal':
      return (
        <svg {...common} className="vb-ico">
          <rect x="1" y="2" width="14" height="12" fill="none" strokeWidth="1" />
          <rect x="1" y="2" width="14" height="2" />
          <rect x="3" y="6" width="1" height="1" />
          <rect x="4" y="7" width="1" height="1" />
          <rect x="3" y="8" width="1" height="1" />
          <rect x="6" y="8" width="4" height="1" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common} className="vb-ico">
          <rect x="4" y="2" width="8" height="1" />
          <rect x="3" y="4" width="10" height="1" />
          <rect x="4" y="5" width="8" height="9" fill="none" strokeWidth="1" />
          <rect x="6" y="7" width="1" height="5" />
          <rect x="9" y="7" width="1" height="5" />
        </svg>
      )
  }
}

// Pixel wing logo — the 🕮 stand-in, drawn in 1-bit blocks.
function PixelLogo() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className="vb-logo"
    >
      <rect x="7" y="2" width="2" height="12" />
      <rect x="5" y="4" width="2" height="1" />
      <rect x="3" y="5" width="2" height="1" />
      <rect x="1" y="6" width="2" height="1" />
      <rect x="9" y="4" width="2" height="1" />
      <rect x="11" y="5" width="2" height="1" />
      <rect x="13" y="6" width="2" height="1" />
    </svg>
  )
}

const MENU_ITEMS = ['Summon', 'Doors', 'Postures', 'Method'] as const

const DESKTOP_ICONS: { name: IconName; label: string }[] = [
  { name: 'system', label: 'System' },
  { name: 'skills', label: 'Skills' },
  { name: 'postures', label: 'Postures' },
  { name: 'terminal', label: 'Terminal' },
  { name: 'trash', label: 'Trash' },
]

const STATUS_WORD: Record<string, string> = {
  flagship: 'FLAGSHIP',
  vanguard: 'VANGUARD',
  recipe: 'RECIPE',
  gated: 'GATED',
}

export function VariationOneBit() {
  const rootRef = React.useRef<HTMLDivElement>(null)
  useScrollHell(rootRef)

  // Which harness folder is focused → reveals its install command.
  const [focusedHarness, setFocusedHarness] = React.useState<string>(HARNESSES[0].id)
  // Which posture radio is selected in the control panel.
  const [posture, setPosture] = React.useState<string>(POSTURES[1].key)
  // The gated-hell modal dialog (P2). A 1-bit modal, NOT window.alert().
  const [hellDialog, setHellDialog] = React.useState<boolean>(false)

  return (
    <div className="vb" ref={rootRef}>
      {/* ── Dithered dot wallpaper ─────────────────────────────────────── */}
      <div className="vb-wallpaper" aria-hidden="true" />
      {/* ── Scanline / dither overlay — intensifies during the invert ──── */}
      <div className="vb-scanlines" aria-hidden="true" />

      {/* ── Top menu bar ──────────────────────────────────────────────── */}
      <div className="vb-menubar" role="menubar" aria-label="Skill Heaven menu">
        <span className="vb-menubar__brand">
          <PixelLogo />
          SKILL HEAVEN
        </span>
        {MENU_ITEMS.map((m) => (
          <span className="vb-menu" role="menuitem" key={m}>
            {m}
          </span>
        ))}
        <button
          type="button"
          className="vb-menu vb-menu--gated"
          aria-disabled="true"
          aria-label="skill-hell — locked door, gated"
          onClick={() => setHellDialog(true)}
        >
          [ {COMMANDS.break} ] <span className="vb-lock" aria-hidden="true">▓</span>
        </button>
        <span className="vb-menubar__clock" aria-hidden="true">
          HEAVEN ◆ 1-bit
        </span>
      </div>

      {/* ── Desktop surface ───────────────────────────────────────────── */}
      <div className="vb-desktop">
        {/* ── Desktop icons down the left ──────────────────────────────── */}
        <div className="vb-icons" role="list" aria-label="Desktop">
          {DESKTOP_ICONS.map((ic) => (
            <button type="button" className="vb-icon" role="listitem" key={ic.name}>
              <span className="vb-icon__glyph">
                <PixelIcon name={ic.name} />
              </span>
              <span className="vb-icon__label">{ic.label}</span>
            </button>
          ))}
          {/* The gated /skill-hell door — a real disabled control, shown in
              all modes (P2 "gated, and visibly so"), never an activator. */}
          <button
            type="button"
            className="vb-icon vb-icon--gated"
            aria-disabled="true"
            aria-label="skill-hell — locked door, gated (P2)"
            onClick={() => setHellDialog(true)}
          >
            <span className="vb-icon__glyph vb-icon__glyph--locked">
              <PixelIcon name="trash" />
              <span className="vb-icon__padlock" aria-hidden="true">▓</span>
            </span>
            <span className="vb-icon__label">HELL.app</span>
          </button>
        </div>

        {/* ── Window canvas ────────────────────────────────────────────── */}
        <div className="vb-canvas">
          {/* ── HEAVEN.app — the hero window ─────────────────────────── */}
          <section className="vb-win vb-win--hero" aria-labelledby="vb-hero-title">
            <header className="vb-titlebar">
              <button
                type="button"
                className="vb-close"
                aria-label="Close window (decorative)"
                tabIndex={-1}
              >
                <span aria-hidden="true">×</span>
              </button>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
              <span className="vb-titlebar__title" id="vb-hero-title">
                [ HEAVEN.app ]
              </span>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
            </header>

            <div className="vb-win__body vb-hero">
              <p className="vb-kicker">{HEADLINE.kicker}</p>
              <h1 className="vb-display">SUMMON THE SKILLS</h1>
              <p className="vb-sub">{HEADLINE.sub}</p>

              <div className="vb-hero__actions">
                <button type="button" className="vb-btn">
                  <span aria-hidden="true">▶ </span>
                  {COMMANDS.invoke}
                </button>
                <button type="button" className="vb-btn">
                  <span aria-hidden="true">▶ </span>
                  {COMMANDS.launch}
                </button>
              </div>

              <p className="vb-hero__foot">
                <span className="vb-strong">{HEADLINE.line1}</span>{' '}
                <span className="vb-strong">{HEADLINE.line2}</span>
              </p>
            </div>
          </section>

          {/* ── PROJECTS — harness doors as folder items ─────────────── */}
          <section className="vb-win vb-win--projects" aria-labelledby="vb-proj-title">
            <header className="vb-titlebar">
              <button
                type="button"
                className="vb-close"
                aria-label="Close window (decorative)"
                tabIndex={-1}
              >
                <span aria-hidden="true">×</span>
              </button>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
              <span className="vb-titlebar__title" id="vb-proj-title">
                [ PROJECTS ]
              </span>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
            </header>

            <div className="vb-win__body">
              <p className="vb-win__hint">Focus a door to read its install.</p>
              <div className="vb-files" role="list">
                {HARNESSES.map((h) => {
                  const active = focusedHarness === h.id
                  return (
                    <div className="vb-file-row" key={h.id} role="listitem">
                      <button
                        type="button"
                        className={'vb-file' + (active ? ' vb-file--active' : '')}
                        aria-pressed={active}
                        onClick={() => setFocusedHarness(h.id)}
                        onFocus={() => setFocusedHarness(h.id)}
                        onMouseEnter={() => setFocusedHarness(h.id)}
                      >
                        <span className="vb-file__ico" aria-hidden="true">
                          {h.status === 'flagship' ? '▣' : '▢'}
                        </span>
                        <span className="vb-file__name">{h.name}</span>
                        <span className="vb-file__status">
                          {STATUS_WORD[h.status] ?? h.status}
                        </span>
                      </button>
                      {active && (
                        <div className="vb-file__detail">
                          <pre className="vb-install">
                            <code>{h.install}</code>
                          </pre>
                          <p className="vb-file__note">{h.note}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ── POSTURES — control-panel window with radio detents ───── */}
          <section className="vb-win vb-win--postures" aria-labelledby="vb-post-title">
            <header className="vb-titlebar">
              <button
                type="button"
                className="vb-close"
                aria-label="Close window (decorative)"
                tabIndex={-1}
              >
                <span aria-hidden="true">×</span>
              </button>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
              <span className="vb-titlebar__title" id="vb-post-title">
                [ POSTURES · control panel ]
              </span>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
            </header>

            <div className="vb-win__body">
              <p className="vb-win__hint">
                Two-number dosing — standing (per session) and invocation (on
                invoke) are always priced separately.
              </p>
              <fieldset className="vb-radios">
                <legend className="vb-sr">Select a posture</legend>
                {POSTURES.map((p) => {
                  const checked = posture === p.key
                  return (
                    <label
                      className={'vb-radio' + (checked ? ' vb-radio--on' : '')}
                      key={p.key}
                    >
                      <input
                        type="radio"
                        name="vb-posture"
                        value={p.key}
                        checked={checked}
                        onChange={() => setPosture(p.key)}
                        className="vb-radio__input"
                      />
                      <span className="vb-radio__detent" aria-hidden="true">
                        {checked ? '◉' : '○'}
                      </span>
                      <span className="vb-radio__body">
                        <span className="vb-radio__label">{p.label}</span>
                        <span className="vb-radio__dose">{p.dose}</span>
                        <span className="vb-radio__blurb">{p.blurb}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            </div>
          </section>

          {/* ── WELCOME.md — brand-voice text window ─────────────────── */}
          <section className="vb-win vb-win--welcome" aria-labelledby="vb-wel-title">
            <header className="vb-titlebar">
              <button
                type="button"
                className="vb-close"
                aria-label="Close window (decorative)"
                tabIndex={-1}
              >
                <span aria-hidden="true">×</span>
              </button>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
              <span className="vb-titlebar__title" id="vb-wel-title">
                [ WELCOME.md ]
              </span>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
            </header>

            <div className="vb-win__body vb-md">
              <p className="vb-md__h"># Skill Heaven</p>
              <p>
                Stop installing skills. Start summoning them. Skill Heaven
                composes a lean, benchmarked skill surface at launch — nothing
                installed, nothing mutated, nothing left behind.
              </p>
              <p className="vb-md__h">## Two numbers, always</p>
              <p>
                A skill is never priced as one figure. <b>Standing</b> is the
                listing line you pay every session; <b>invocation</b> is the
                full body you pay only when you invoke. We report both, honestly.
              </p>
              <p className="vb-md__h">## Hell is gated</p>
              <p>
                <code>{COMMANDS.break}</code> is a locked door — shown in every
                mode, never an activator. It stays gated (P2) until the probe
                clears.
              </p>
              <p className="vb-md__sig">— composed at launch · exits clean</p>
            </div>
          </section>
        </div>
      </div>

      {/* ── Bottom features strip ─────────────────────────────────────── */}
      <div className="vb-strip">
        <span className="vb-strip__cell">NOTHING INSTALLED</span>
        <span className="vb-strip__sep" aria-hidden="true">◆</span>
        <span className="vb-strip__cell">NOTHING MUTATED</span>
        <span className="vb-strip__sep" aria-hidden="true">◆</span>
        <span className="vb-strip__cell">TWO NUMBERS ALWAYS</span>
        <span className="vb-strip__sep" aria-hidden="true">◆</span>
        <span className="vb-strip__cell">BENCHMARKED, NOT GUESSED</span>
        <span className="vb-strip__sep" aria-hidden="true">◆</span>
        <span className="vb-strip__cell">HELL IS GATED</span>
      </div>

      {/* ── Colophon / method CTA ─────────────────────────────────────── */}
      <footer className="vb-footer">
        <span className="vb-wordmark">SKILL HEAVEN</span>
        <span className="vb-footer__note">
          {CTA.primary} · {CTA.secondary}
        </span>
        <span className="vb-footer__meta">Prototype — one-bit desktop. Invert is the material.</span>
      </footer>

      {/* ── Gated HELL modal dialog (P2) — 1-bit alert, not window.alert ─ */}
      {hellDialog && (
        <div className="vb-modal-scrim" role="presentation" onClick={() => setHellDialog(false)}>
          <div
            className="vb-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vb-modal-title"
            aria-describedby="vb-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="vb-titlebar vb-titlebar--alert">
              <span className="vb-titlebar__stripes" aria-hidden="true" />
              <span className="vb-titlebar__title" id="vb-modal-title">
                [ SYSTEM ]
              </span>
              <span className="vb-titlebar__stripes" aria-hidden="true" />
            </header>
            <div className="vb-modal__body">
              <span className="vb-modal__bang" aria-hidden="true">▲</span>
              <p className="vb-modal__msg" id="vb-modal-desc">
                <b>HELL IS GATED.</b> {COMMANDS.break} is a locked door, not an
                activator. It stays gated until P2 opens.
              </p>
            </div>
            <div className="vb-modal__actions">
              <button
                type="button"
                className="vb-btn vb-btn--ok"
                onClick={() => setHellDialog(false)}
                autoFocus
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
