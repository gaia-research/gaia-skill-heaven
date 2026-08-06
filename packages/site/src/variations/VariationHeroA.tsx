import lucyHero from '../assets/lucy-hero.png'
import { HeroAssetRouter, useHeroAssetVariation } from './hero/HeroAssetRouter'
import { useHeroEngine } from './hero/useHeroEngine'
import './variation-hero.css'

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

export function VariationHeroA() {
  const { v, dots, rungs, rootRef } = useHeroEngine('a')
  const { assets, variation, selectVariation } = useHeroAssetVariation()
  const assetFilter = v.bg === '#FFFFFF' ? 'invert(1)' : 'none'

  return (
    <div
      ref={rootRef}
      className="vha"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        transition: 'background 0ms,color 0ms',
        background: v.bg,
        color: v.fg,
      }}
    >
      <HeroAssetRouter variation={variation} onChange={selectVariation} />

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
          top: '50%',
          width: 'min(92vw,1500px)',
          height: '70vh',
          translate: '-50% -50%',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(600ms * var(--vh-t)) linear',
          transform: `scale(${v.mWing})`,
          opacity: v.oWing,
        }}
      >
        <img
          className="vh-asset vha-wing vha-wing--left"
          src={assets.wingLeft}
          alt=""
          draggable={false}
          style={{ filter: assetFilter }}
        />
        <img
          className="vh-asset vha-wing vha-wing--right"
          src={assets.wingRight}
          alt=""
          draggable={false}
          style={{ filter: assetFilter }}
        />
      </div>

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

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          height: '92vh',
          translate: '-50% 0',
          transition: 'transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateY(${v.lucyY}vh) scale(${v.mLucy})`,
        }}
      >
        <img
          src={lucyHero}
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
        <div
          className="vha-tear"
          style={{ left: '47.5%', top: '41%', height: '14%', animationDuration: '900ms', opacity: v.oTears }}
        />
        <div
          className="vha-tear"
          style={{ left: '52.5%', top: '42%', height: '9%', animationDuration: '1200ms', opacity: v.oTears }}
        />
      </div>

      <div
        aria-hidden="true"
        className="vh-sword-frame"
        style={{
          position: 'absolute',
          left: '50%',
          top: '56%',
          width: 'min(78vw,1180px)',
          translate: '-50% -50%',
          transition: 'transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(400ms * var(--vh-t)) linear',
          transform: `rotate(-28deg) translateX(${v.bladeX}%) scale(${v.mBlade})`,
          opacity: v.oBlade,
        }}
      >
        <img className="vh-asset vh-asset--sword" src={assets.sword} alt="" draggable={false} style={{ filter: assetFilter }} />
        <img className="vh-asset vh-asset--sword-debris" src={assets.swordDebris} alt="" draggable={false} style={{ filter: assetFilter }} />
      </div>

      <div className="vh-slash-arc vha-slash-arc" aria-hidden="true" style={{ opacity: v.oCut }}>
        <img src={assets.slashArc} alt="" draggable={false} style={{ filter: assetFilter }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(9vh + ${v.typeUp}vh)`,
          textAlign: 'center',
          pointerEvents: 'none',
          transition: 'bottom calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateX(${v.glitchX}px) skewX(${v.glitchSkew}deg)`,
        }}
      >
        <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginBottom: '1.8vh' }}>
          <span style={{ display: 'block', width: 'min(10vw,132px)', height: 1, background: v.hair2 }} />
          <span
            className="vha-eyebrow"
            style={{ fontSize: 'clamp(24px,3.5vw,52px)', textShadow: `0 0 26px ${v.bg},0 0 9px ${v.bg}` }}
          >
            SKILL
          </span>
          <span style={{ display: 'block', width: 'min(10vw,132px)', height: 1, background: v.hair2 }} />
        </div>
        <div style={{ position: 'relative' }}>
          <div className="vha-word" style={{ transform: `scale(${v.mType})`, opacity: v.oHeaven }}>
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--split-top"
            style={{ transform: `scale(${v.mType}) translateX(${v.splitX}px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--split-bottom"
            style={{ transform: `scale(${v.mType}) translateX(-${v.splitX}px)`, opacity: v.oSplit }}
          >
            HEAVEN
          </div>
          <div className="vha-hell" style={{ transform: `translateY(${v.hellY}vh) scale(${v.hellScale})`, opacity: v.oHell }}>
            HELL
          </div>
          <div
            className="vha-word vha-word--sm"
            style={{ transform: `scale(${v.hellScale})`, opacity: v.oHeavenSm }}
          >
            HEAVEN
          </div>
          <div className="vha-ultra" style={{ opacity: v.oUltra }}>
            ULTRA
          </div>
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

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '8vw', bottom: '7vh', display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span className="vha-act">{v.actLabel}</span>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim }}>{v.actSub}</span>
        </div>

        <div style={{ position: 'absolute', right: '8vw', bottom: '7vh', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 11, letterSpacing: '.22em', color: v.dim, opacity: v.oCue }}>SCROLL</span>
          <span className="vha-cue" style={{ color: v.dim, opacity: v.oCue }}>
            ↓
          </span>
          <span style={{ fontSize: 11, letterSpacing: '.22em' }}>{v.counter}</span>
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
        <div style={{ fontSize: 11, letterSpacing: '.18em', minHeight: 16, marginBottom: 22, color: v.noteTone }}>{v.stopNote}</div>
        <button
          className="vha-cta-btn"
          onClick={(e) => e.preventDefault()}
          style={{ border: `1px solid ${v.ctaLine}`, background: v.ctaBg, color: v.ctaFg }}
        >
          {v.ctaLabel}
        </button>
      </div>
    </div>
  )
}
