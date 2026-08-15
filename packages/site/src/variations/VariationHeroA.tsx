import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { HERO_ASSET_SETS, normalizeLucyAssetSet } from './hero/heroAssets'
import { useHeroEngine } from './hero/useHeroEngine'
import { HeroInfo, HeroSummon } from './hero/HeroInfo'
import './variation-hero.css'

import wingLeft from '../assets/hero-commission/v01/wing-left.png'
import wingRight from '../assets/hero-commission/v01/wing-right.png'

// The commissioned GLASS wings (translucent PNGs), one symmetric wing each
// side. Kept at their own scale — never the figure's oversize. Zero carries no
// wings (canon).

// ─────────────────────────────────────────────────────────────────────────
// VARIATION: HERO A · REREDOS
// Ported 1:1 from the owner's design-tool prototype (current winner — wired
// to "/" as the live default in main.tsx). Full-viewport, wheel/keyboard/
// touch-driven 5-act scrollytelling piece, centered and monumental: the
// SKILL / HEAVEN typeset sits dead-center behind Lucy, single wing symmetric
// either side, the katana slashing in on Act III (SLASH). Act V (ENTER) hands
// off to the risk ladder (OFF..MAX, ULTRA sealed) driving Heaven/Hell/Ultra
// live.
// ─────────────────────────────────────────────────────────────────────────

export interface VariationHeroProps {
  /** Character set for reviewer routes; the layout remains Hero A. */
  assetSet?: string
}

export function VariationHeroA({ assetSet }: VariationHeroProps) {
  const { v, dots, rungs, rootRef } = useHeroEngine('a')
  const set = normalizeLucyAssetSet(assetSet)
  const assets = HERO_ASSET_SETS[set][v.lucyState]
  // Heaven stays on set-A: set-B's master ships a baked-in checkerboard (bad
  // export) and set-C's has an opaque white ground that can't sit on the black
  // Heaven back on set-A per owner.
  const lucyImg = assets.lucy
  // Hell inverts its wings too (the whole scene is an RGB inversion).
  const wingFilter = v.scene === 'hell' ? 'invert(1)' : 'none'

  // Photoshop-style: SOLID fill + a coloured TEXT BORDER (stroke). paint-order
  // keeps the border reading as an outer outline rather than eating the fill.
  const wordStyle = {
    color: v.wordFill,
    WebkitTextStroke: v.wordStroke,
    paintOrder: 'stroke' as const,
  }

  // "Skill" sticks to the dominant state word's scale so it grows/shrinks with
  // it through the acts: the big HEAVEN uses mType, HELL + the small ladder
  // words use hellScale.
  const skillScale = v.oHeaven > 0.5 || v.oSplit > 0.5 ? v.mType : v.hellScale

  // Fifth-scene CTA: the real launch/invocation one-liner per band + the
  // constant install one-liner, both copyable (mirrors the instrument).
  const BAND: Record<string, { cmd: string; hint: string }> = {
    zero: { cmd: 'claude-zero', hint: 'launch clean — only /summon available' },
    heaven: { cmd: '/skill-heaven', hint: 'converge · low↔med, default low' },
    hell: { cmd: '/skill-hell', hint: 'explore · high↔max, default high' },
    ultra: { cmd: '/skill-ultra', hint: 'auto · picks direction + depth for you' },
  }
  const band = BAND[v.scene]
  const INSTALL_ALL = 'curl -fsSL https://skill-heaven.dev/install | sh'
  const [copied, setCopied] = useState<string | null>(null)
  const [bare, setBare] = useState(false)
  // Click anywhere on empty backdrop → the MAIN TEXT gets out of the way
  // (slides + fades) so only Lucy + assets show; click again restores. Clicks
  // on controls, links, or the tooltips never trigger it.
  const [focus, setFocus] = useState(false)
  const onHeroClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, .vha-info, .vha-summon, .vha-bare-toggle')) return
    setFocus((f) => !f)
  }, [])
  // The "What is this?" hint stays out of the way until the visitor does
  // anything deliberate EXCEPT scrolling — a click on empty space, a control, or
  // a copy. Wheel/keyboard act-nav never triggers it.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const reveal = () => setRevealed(true)
    window.addEventListener('click', reveal, { once: true })
    return () => window.removeEventListener('click', reveal)
  }, [])
  // Per-scene accent for the quiet explainers (no red).
  const accent =
    v.scene === 'ultra' ? '#FFD24A' : v.scene === 'hell' ? '#5FC2D6' : v.scene === 'zero' ? v.fg : '#A58AE0'
  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key)
        window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
      },
      () => undefined,
    )
  }, [])

  return (
    <div
      ref={rootRef}
      className={`vha${bare ? ' vha--bare' : ''}${focus ? ' vha--focus' : ''}`}
      onClick={onHeroClick}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        transition: 'background 0ms,color 0ms',
        background: v.bg,
        color: v.fg,
      }}
    >
      {/* Opaque scene ground — guarantees the band colour paints behind the
         (often transparent) character masters, in every browser and capture. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: v.bg, pointerEvents: 'none' }} />
      <Link to="/landing" className="vha-skip" style={{ color: v.fg, borderColor: v.hair2 }}>
        Skip · Enter the door →
      </Link>
      {revealed && (
        <HeroInfo atLadder={v.atLadder} fg={v.fg} bg={v.bg} dim={v.dim} accent={accent} />
      )}
      <HeroSummon fg={v.fg} bg={v.bg} dim={v.dim} accent={accent} copy={copy} copied={copied} />

      {/* Immersive toggle — fade the whole interface to reveal just the artwork
         (and back). Stays visible so it can always be restored. */}
      <button
        type="button"
        className="vha-bare-toggle"
        onClick={() => setBare((b) => !b)}
        aria-pressed={bare}
        aria-label={bare ? 'Show interface' : 'Show artwork only'}
        title={bare ? 'Show interface' : 'Show artwork only'}
        style={{ color: v.fg, borderColor: v.hair2 }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.6" />
          <path d="M21 16l-5-5-4 4-2-2-4 4" />
        </svg>
      </button>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '-6%',
          width: '200%',
          height: '62%',
          marginLeft: '-100%',
          backgroundImage: `linear-gradient(to right,${v.hair} 1px,transparent 1px),linear-gradient(to bottom,${v.hair} 1px,transparent 1px)`,
          backgroundSize: '5% 12%',
          transformOrigin: '50% 100%',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(700ms * var(--vh-t)) linear',
          transform: `perspective(900px) rotateX(72deg) scale(${v.mGround})`,
          opacity: v.oGround,
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 100%,#000,transparent 78%)',
          maskImage: 'radial-gradient(ellipse at 50% 100%,#000,transparent 78%)',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '46%',
          width: 'min(72vh,86vw)',
          aspectRatio: '1',
          translate: '-50% -50%',
          border: `1.5px solid ${v.fg}`,
          borderRadius: '50%',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(600ms * var(--vh-t)) linear',
          transform: `scale(${v.mWing}) rotate(${v.haloRot}deg)`,
          opacity: v.oHalo,
        }}
      />

      {v.scene !== 'zero' && (
        <>
          <img
            className="vh-asset vha-wing vha-wing--left"
            src={wingLeft}
            alt=""
            draggable={false}
            style={{
              transform: `scale(${v.mWing})`,
              opacity: v.oWing,
              filter: wingFilter,
              transition:
                'opacity calc(600ms * var(--vh-t)) linear,transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
            }}
          />
          <img
            className="vh-asset vha-wing vha-wing--right"
            src={wingRight}
            alt=""
            draggable={false}
            style={{
              transform: `scale(${v.mWing})`,
              opacity: v.oWing,
              filter: wingFilter,
              transition:
                'opacity calc(600ms * var(--vh-t)) linear,transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
            }}
          />
        </>
      )}

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          height: '92vh',
          translate: '-50% 0',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateX(${v.figX}vh) translateY(${(v.lucyY + v.figY).toFixed(2)}vh) scale(${(Number(v.mLucy) * v.figZoom).toFixed(3)})`,
          transformOrigin: v.figOrigin,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <img
          src={lucyImg}
          alt=""
          style={{
            display: 'block',
            height: '92vh',
            width: 'auto',
            mixBlendMode: v.lucyBlend,
            transition: 'filter 0ms,opacity calc(600ms * var(--vh-t)) linear',
            opacity: v.oLucy,
            filter: v.lucyFilter,
          }}
        />
      </div>

      <div
        aria-hidden="true"
        className="vh-sword-frame"
        style={{
          position: 'absolute',
          left: '50%',
          top: '56%',
          zIndex: 2,
          pointerEvents: 'none',
          width: 'min(78vw,1180px)',
          translate: '-50% -50%',
          transition:
            'transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(400ms * var(--vh-t)) linear,filter calc(700ms * var(--vh-t)) linear',
          transform: `rotate(-28deg) translateX(${v.bladeX}%) scale(${v.mBlade})`,
          opacity: v.oBlade,
          filter: v.bladeBlur ? `blur(${v.bladeBlur}px)` : 'none',
        }}
      >
        <img className="vh-asset vh-asset--sword" src={assets.katana} alt="" draggable={false} />
      </div>

      <div className="vh-slash-arc vha-slash-arc" aria-hidden="true" style={{ opacity: v.oCut }}>
        <img src={assets.slashArc} alt="" draggable={false} />
      </div>

      <div
        className="vha-typewrap"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(3vh + ${v.typeUp}vh)`,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* SKILL layer + the glitch-transformed state word live here */}
        <div style={{ position: 'relative', zIndex: 2, transform: `translateX(${v.glitchX}px) skewX(${v.glitchSkew}deg)` }}>
          <div className="vha-word" style={{ ...wordStyle, transform: `scale(${v.mType})`, opacity: v.oHeaven }}>
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--split-top"
            style={{ ...wordStyle, transform: `scale(${v.mType}) translateX(${v.splitX}px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--split-bottom"
            style={{ ...wordStyle, transform: `scale(${v.mType}) translateX(-${v.splitX}px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div className="vha-hell" style={{ ...wordStyle, transform: `translateY(${v.hellY}vh) scale(${v.hellScale})`, opacity: v.oHell }}>
            HELL
          </div>
          <div
            className="vha-word vha-word--sm"
            style={{ ...wordStyle, transform: `scale(${v.hellScale})`, opacity: v.oHeavenSm }}
          >
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--sm"
            style={{ ...wordStyle, transform: `scale(${v.hellScale})`, opacity: v.oZero }}
          >
            ZERO
          </div>
          <div className="vha-hell" style={{ ...wordStyle, transform: `scale(${v.hellScale})`, opacity: v.oUltra }}>
            ULTRA
          </div>
          {/* "Skill" is CENTERED on the state word, layered on top (z-axis), and
             sticks to it: same scale factor as the dominant word + the wrapper's
             glitch skew, so it transforms the same way in size and shape. */}
          <span
            className="vha-eyebrow"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              zIndex: 5,
              transformOrigin: 'center',
              transform: `translate(-50%, -50%) scale(${skillScale}) rotate(-3deg)`,
              transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(0.16,1,0.3,1)',
              color: v.fg,
              fontSize: 'clamp(30px, 4.2vw, 68px)',
              textShadow: `0 2px 20px ${v.bg}, 0 0 8px ${v.bg}`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            SKILL
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="vha-cut"
        style={{ transform: `rotate(${v.cutRot}deg) scaleX(${v.cutScale})`, opacity: v.oCut, boxShadow: `0 0 18px ${v.fg}`, background: v.fg }}
      />

      <div aria-hidden="true" className="vha-flash" style={{ background: v.flashBg, opacity: v.flashOp }}>
        <div className="vha-flash__wedge" style={{ background: v.flashInk, opacity: v.flashWedge }} />
      </div>

      <div aria-hidden="true" className="vha-od" style={{ background: v.odSheet, opacity: v.odOp }}>
        <div className="vha-od__wedge" style={{ background: v.odWedge }} />
      </div>

      <div
        aria-hidden="true"
        className="vha-scan"
        style={{
          // mix-blend-mode on a full-viewport layer forces the whole hero into a
          // blend group every frame, even at opacity 0. The scanlines only exist
          // during a glitch/overdrive pulse, so keep the layer out of the paint
          // tree the rest of the time — this is most of Hero A's idle paint cost
          // over Hero B's, and it is what let the rung transitions starve.
          display: v.oScan ? 'block' : 'none',
          opacity: v.oScan,
          background: `repeating-linear-gradient(to bottom,${v.fg} 0 2px,transparent 2px 7px)`,
        }}
      />

      <div className="vha-chrome" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '8vw', bottom: '7vh', display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span className="vha-act">{v.actLabel}</span>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim, textShadow: `0 0 7px ${v.bg},0 1px 2px ${v.bg}` }}>{v.actSub}</span>
        </div>

        <div style={{ position: 'absolute', right: '8vw', bottom: '7vh', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim, opacity: v.oCue, textShadow: `0 0 7px ${v.bg},0 1px 2px ${v.bg}` }}>SCROLL</span>
          <span className="vha-cue" style={{ color: v.dim, opacity: v.oCue }}>
            ↓
          </span>
          <span style={{ fontSize: 11, letterSpacing: '.22em', textShadow: `0 0 7px ${v.bg},0 1px 2px ${v.bg}` }}>{v.counter}</span>
        </div>

        <div style={{ position: 'absolute', right: '8vw', top: '50%', translate: '0 -50%', display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto' }}>
          {dots.map((d, i) => (
            <button key={i} onClick={d.pick} aria-label={d.aria} className="vha-dot-btn">
              <span className="vha-dot" style={{ width: d.w, background: d.c }} />
            </button>
          ))}
        </div>
      </div>

      <div
        className="vha-ctawrap"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '7vh',
          translate: '-50% 0',
          width: 'min(90vw,660px)',
          zIndex: 6,
          textAlign: 'center',
          transition: 'opacity calc(500ms * var(--vh-t)) linear,transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          opacity: v.oCta,
          transform: `translateY(${v.ctaY}px)`,
          pointerEvents: v.ctaPE,
          // Legibility scrim so the ladder + commands read over the busy figure.
          background: `linear-gradient(to top, ${v.bg} 4%, ${v.bg}cc 52%, ${v.bg}00 100%)`,
          paddingTop: 26,
        }}
      >
        <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
          <div className="vha-chip vha-chip--zero">ZERO</div>
          <div className="vha-chip vha-chip--heaven">HEAVEN</div>
          <div className="vha-chip vha-chip--hell">HELL</div>
          <div className="vha-chip vha-chip--ultra">ULTRA</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginBottom: 12 }}>
          {rungs.map((r, i) => (
            <button key={i} onClick={r.pick} aria-label={r.label} className="vha-rung-btn">
              <span
                className={r.sel ? 'vha-rung vha-rung--sel' : 'vha-rung'}
                style={{ height: r.h, background: r.bg, border: `1px solid ${r.line}`, opacity: r.op }}
              />
              <span style={{ fontSize: 9, letterSpacing: '.14em', transition: 'color 320ms linear', color: r.tone }}>{r.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '.18em', minHeight: 16, marginBottom: 14, color: v.noteTone, textShadow: `0 0 7px ${v.bg},0 1px 2px ${v.bg}` }}>{v.stopNote}</div>
        <div className="vha-cta">
          <button
            type="button"
            className="vha-cta-cmd"
            onClick={() => copy(band.cmd, 'cmd')}
            style={{ background: v.fg, color: v.bg, borderColor: v.ctaLine }}
          >
            <span className="vha-cta-prompt" style={{ color: v.bg }}>$</span>
            <span className="vha-cta-text">{band.cmd}</span>
            <span className="vha-cta-tag" style={{ color: v.bg, opacity: 0.6 }}>{copied === 'cmd' ? 'copied ⏎' : 'copy'}</span>
          </button>
          <div className="vha-cta-hint" style={{ color: v.dim }}>{band.hint}</div>
          {v.scene === 'zero' ? (
            <Link
              to="/landing"
              className="vha-cta-cmd vha-cta-cmd--sm"
              style={{ background: 'transparent', color: v.fg, borderColor: v.ctaLine }}
            >
              <span className="vha-cta-prompt" style={{ color: v.dim }}>$</span>
              <span className="vha-cta-text">skill-zero</span>
              <span className="vha-cta-tag" style={{ color: v.dim }}>pick your harness →</span>
            </Link>
          ) : (
            <button
              type="button"
              className="vha-cta-cmd vha-cta-cmd--sm"
              onClick={() => copy(INSTALL_ALL, 'install')}
              style={{ background: 'transparent', color: v.fg, borderColor: v.ctaLine }}
            >
              <span className="vha-cta-prompt" style={{ color: v.dim }}>$</span>
              <span className="vha-cta-text">{INSTALL_ALL}</span>
              <span className="vha-cta-tag" style={{ color: v.dim }}>
                {copied === 'install' ? 'copied ⏎' : 'install all skills'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
