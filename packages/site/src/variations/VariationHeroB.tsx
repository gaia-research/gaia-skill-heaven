import { HERO_ASSETS } from './hero/heroAssets'
import { useHeroEngine } from './hero/useHeroEngine'
import './variation-hero.css'

// ─────────────────────────────────────────────────────────────────────────
// VARIATION: HERO B · GUILLOTINE
// Same 5-act engine as Hero A (src/variations/hero/useHeroEngine.ts), asymmetric
// frame-cropped layout: Lucy bleeds off the bottom-right corner, the wordmark
// runs edge-to-edge letter-spaced HELL, vertical rail labels ("COMPOSED · NOT
// INSTALLED" / "SLASH TO SUMMON") frame the scene. Ported 1:1 from the
// owner's design-tool prototype.
// ─────────────────────────────────────────────────────────────────────────

export function VariationHeroB() {
  const { v, dots, rungs, rootRef } = useHeroEngine('b')
  const assets = HERO_ASSETS[v.lucyState]

  return (
    <div
      ref={rootRef}
      className="vhb"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        transition: 'background 0ms,color 0ms',
        background: v.bg,
        color: v.fg,
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: v.hair2 }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '8vw', top: 0, bottom: 0, width: 1, background: v.hair, transition: 'opacity calc(600ms * var(--vh-t)) linear', opacity: v.oGround }} />
      <div aria-hidden="true" style={{ position: 'absolute', right: '8vw', top: 0, bottom: 0, width: 1, background: v.hair, transition: 'opacity calc(600ms * var(--vh-t)) linear', opacity: v.oGround }} />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '-4vw',
          bottom: 0,
          height: '96vh',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translate(${v.lucyXB}vw,${v.lucyY}vh) scale(${v.mLucy})`,
          transformOrigin: '100% 100%',
        }}
      >
        <img
          src={assets.lucy}
          alt=""
          style={{
            display: 'block',
            height: '96vh',
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
          left: '-8vw',
          bottom: '6vh',
          width: '96vw',
          transformOrigin: '0% 100%',
          transition: 'transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(400ms * var(--vh-t)) linear',
          transform: `rotate(-38deg) translateX(${v.bladeXB}%) scale(${v.mBlade})`,
          opacity: v.oBlade,
        }}
      >
        <img className="vh-asset vh-asset--sword" src={assets.katana} alt="" draggable={false} />
      </div>

      <div className="vh-slash-arc vhb-slash-arc" aria-hidden="true" style={{ opacity: v.oCut }}>
        <img src={assets.slashArc} alt="" draggable={false} />
      </div>

      <div style={{ position: 'absolute', left: '8vw', top: '9vh', display: 'flex', alignItems: 'baseline', gap: 14, pointerEvents: 'none' }}>
        <span style={{ fontSize: 11, letterSpacing: '.3em' }}>LAUNCHER</span>
        <span style={{ fontSize: 10, letterSpacing: '.2em', color: v.dim }}>/ GAIA RESEARCH</span>
      </div>

      <div aria-hidden="true" className="vhb-rail vhb-rail--left" style={{ color: v.dim }}>
        COMPOSED · NOT INSTALLED
      </div>
      <div aria-hidden="true" className="vhb-rail vhb-rail--right" style={{ color: v.dim }}>
        SLASH TO SUMMON
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(14vh + ${v.typeUp}vh)`,
          pointerEvents: 'none',
          transition: 'bottom calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateX(${v.glitchX}px) skewX(${v.glitchSkew}deg)`,
        }}
      >
        <div style={{ position: 'relative', zIndex: 5, padding: '0 8.4vw', marginBottom: '-.2vh' }}>
          <span className="vhb-eyebrow">SKILL</span>
        </div>
        <div style={{ position: 'relative', height: '22vw' }}>
          <div
            className="vhb-word"
            style={{ transform: `translateY(${v.heavenYB}vh) scale(${v.mHeavenB})`, opacity: v.oHeavenB }}
          >
            HEAVEN
          </div>
          <div
            className="vhb-word vhb-word--split-top"
            style={{ transform: `scale(${v.mType}) translate(${v.splitX}px,-14px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div
            className="vhb-word vhb-word--split-bottom"
            style={{ transform: `scale(${v.mType}) translate(-${v.splitX}px,14px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div className="vhb-hell" style={{ transform: `translateY(${v.hellYB}vh) scale(${v.hellScale})`, opacity: v.oHell }}>
            <span>H</span>
            <span>E</span>
            <span>L</span>
            <span>L</span>
          </div>
          <div className="vhb-ultra" style={{ opacity: v.oUltra }}>
            ULTRA
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="vhb-cut"
        style={{ transform: `rotate(${v.cutRot}deg) scaleX(${v.cutScale})`, opacity: v.oCut, boxShadow: `0 0 18px ${v.fg}`, background: v.fg }}
      />

      <div aria-hidden="true" className="vhb-flash" style={{ background: v.flashBg, opacity: v.flashOp }}>
        <div className="vhb-flash__wedge" style={{ background: v.flashInk, opacity: v.flashWedge }} />
      </div>

      <div aria-hidden="true" className="vhb-od" style={{ background: v.odSheet, opacity: v.odOp }}>
        <div className="vhb-od__wedge" style={{ background: v.odWedge }} />
      </div>

      <div
        aria-hidden="true"
        className="vhb-scan"
        style={{
          // See VariationHeroA: a full-viewport mix-blend-mode layer costs a
          // blend group every frame even at opacity 0. Only paint it while a
          // glitch/overdrive pulse is actually running.
          display: v.oScan ? 'block' : 'none',
          opacity: v.oScan,
          background: `repeating-linear-gradient(to bottom,${v.fg} 0 2px,transparent 2px 7px)`,
        }}
      />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '8vw', bottom: '7vh', display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span className="vhb-act">{v.actLabel}</span>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim }}>{v.actSub}</span>
        </div>

        <div style={{ position: 'absolute', right: '8vw', bottom: '7vh', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim, opacity: v.oCue }}>SCROLL</span>
          <span className="vhb-cue" style={{ color: v.dim, opacity: v.oCue }}>
            ↓
          </span>
          <span style={{ fontSize: 11, letterSpacing: '.22em' }}>{v.counter}</span>
        </div>

        <div style={{ position: 'absolute', right: '8vw', top: '50%', translate: '0 -50%', display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto' }}>
          {dots.map((d, i) => (
            <button key={i} onClick={d.pick} aria-label={d.aria} className="vhb-dot-btn">
              <span className="vhb-dot" style={{ width: d.w, background: d.c }} />
            </button>
          ))}
        </div>
      </div>

      <div
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
        }}
      >
        <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
          <div className="vhb-chip vhb-chip--heaven">HEAVEN</div>
          <div className="vhb-chip vhb-chip--hell">HELL</div>
          <div className="vhb-chip vhb-chip--ultra">ULTRA</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginBottom: 12 }}>
          {rungs.map((r, i) => (
            <button key={i} onClick={r.pick} aria-label={r.label} className="vhb-rung-btn">
              <span
                className={r.sel ? 'vhb-rung vhb-rung--sel' : 'vhb-rung'}
                style={{ height: r.h, background: r.bg, border: `1px solid ${r.line}`, opacity: r.op }}
              />
              <span style={{ fontSize: 9, letterSpacing: '.14em', transition: 'color 320ms linear', color: r.tone }}>{r.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '.18em', minHeight: 16, marginBottom: 22, color: v.noteTone }}>{v.stopNote}</div>
        <button
          className="vhb-cta-btn"
          onClick={(e) => e.preventDefault()}
          style={{ border: `1px solid ${v.ctaLine}`, background: v.ctaBg, color: v.ctaFg }}
        >
          {v.ctaLabel}
        </button>
      </div>
    </div>
  )
}
