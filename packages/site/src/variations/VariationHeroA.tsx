import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { HERO_ASSET_SETS, normalizeLucyAssetSet } from './hero/heroAssets'
import { useHeroEngine } from './hero/useHeroEngine'
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

  // Fifth-scene CTA: the real launch/invocation one-liner per band + the
  // constant install one-liner, both copyable (mirrors the instrument).
  const BAND: Record<string, { cmd: string; hint: string }> = {
    zero: { cmd: 'claude-zero', hint: 'launch clean — only /summon available' },
    heaven: { cmd: '/skill-heaven', hint: 'converge · low↔med, default low' },
    hell: { cmd: '/skill-hell', hint: 'explore · high↔max, default high' },
    ultra: { cmd: '/skill-ultra', hint: 'auto · picks direction + depth for you' },
  }
  const band = BAND[v.scene]
  const INSTALL_CMD = 'curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh'
  const [copied, setCopied] = useState<string | null>(null)
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
      {/* Opaque scene ground — guarantees the band colour paints behind the
         (often transparent) character masters, in every browser and capture. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: v.bg }} />
      <Link to="/landing" className="vha-skip" style={{ color: v.fg, borderColor: v.hair2 }}>
        Skip · Enter the door →
      </Link>
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
          transform: `translateY(${(v.lucyY + v.figY).toFixed(2)}vh) scale(${(Number(v.mLucy) * v.figZoom).toFixed(3)})`,
          transformOrigin: v.figOrigin,
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
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(3vh + ${v.typeUp}vh)`,
          textAlign: 'center',
          pointerEvents: 'none',
          transition: 'bottom calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateX(${v.glitchX}px) skewX(${v.glitchSkew}deg)`,
        }}
      >
        <div style={{ position: 'relative' }}>
          <span
            className="vha-eyebrow"
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              transform: 'translate(-50%, -62%) rotate(-3deg)',
              zIndex: 7,
              color: v.fg,
              fontSize: 'clamp(30px, 4.2vw, 68px)',
              textShadow: `0 2px 20px ${v.bg}, 0 0 8px ${v.bg}`,
              pointerEvents: 'none',
            }}
          >
            SKILL
          </span>
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
        <div style={{ fontSize: 11, letterSpacing: '.18em', minHeight: 16, marginBottom: 14, color: v.noteTone }}>{v.stopNote}</div>
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
          <button
            type="button"
            className="vha-cta-install"
            onClick={() => copy(INSTALL_CMD, 'install')}
            style={{ color: v.dim }}
          >
            {copied === 'install' ? 'install one-liner copied ⏎' : '⧉ copy install one-liner'}
          </button>
        </div>
      </div>
    </div>
  )
}
