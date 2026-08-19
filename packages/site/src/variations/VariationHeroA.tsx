import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { HERO_ASSET_SETS, normalizeLucyAssetSet } from './hero/heroAssets'
import { useHeroEngine } from './hero/useHeroEngine'
import { HeroInfo, HeroSummon } from './hero/HeroInfo'
import { DOORS, INSTALL, SITE } from '../product'
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
// off to the one line — ZERO..MAX plus ULTRA at its crown — driving
// Zero/Heaven/Hell/Ultra live. Every rung is reachable; nothing on the line
// refuses (N13).
// ─────────────────────────────────────────────────────────────────────────

export interface VariationHeroProps {
  /** Character set for reviewer routes; the layout remains Hero A. */
  assetSet?: string
}

export function VariationHeroA({ assetSet }: VariationHeroProps) {
  const { v, act, actCount, dots, rungs, rootRef, enterStory, enterLadder } = useHeroEngine('a')
  const atLadder = act === actCount - 1
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
  const skillScale = v.oHeaven > 0.5 || v.oSplit > 0.5 ? String(v.mType) : 'var(--vha-word-scale)'

  // Fifth-scene CTA: the real launch/invocation one-liner per band + the
  // constant install one-liner, both copyable (mirrors the instrument).
  // Per band: the command, what it means, and where its door opens. Zero's
  // door lands at the top of the document; the summon bands land on the
  // converge/explore section; Ultra lands on what Ultra is (issue #47).
  const BAND: Record<string, { cmd: string; hint: string; door: string; doorLabel: string }> = {
    zero: {
      cmd: '/skill-zero',
      hint: 'the floor · /summon by hand, nothing automatic',
      door: '/landing#doors',
      doorLabel: `Open the door · all ${DOORS.length} harnesses`,
    },
    heaven: {
      cmd: '/skill-heaven',
      hint: 'converge · low↔med, opens at low',
      door: '/landing#directions',
      doorLabel: 'Open the door · heaven or hell',
    },
    hell: {
      cmd: '/skill-hell',
      hint: 'explore · high↔max, opens at high',
      door: '/landing#directions',
      doorLabel: 'Open the door · heaven or hell',
    },
    ultra: {
      cmd: '/skill-ultra',
      hint: 'the crown · picks direction + position per gap',
      door: '/landing#directions',
      doorLabel: 'Open the door · what Ultra is',
    },
  }
  const band = BAND[v.scene]
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
        // The band colour reaches CSS as variables so scrims and plates can be
        // authored in the stylesheet instead of inline. Set on the root because
        // two independent layers need them: the CTA wrap and the wordmark.
        ['--vha-bg' as string]: v.bg,
        ['--vha-bg-soft' as string]: `${v.bg}cc`,
        ['--vha-bg-none' as string]: `${v.bg}00`,
      }}
    >
      {/* Opaque scene ground — guarantees the band colour paints behind the
         (often transparent) character masters, in every browser and capture. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: v.bg, pointerEvents: 'none' }} />
      {/* The hero lands on the ladder, so "skip" only means something while
          the optional five-act story is running (issue #47). */}
      {atLadder ? (
        <Link
          to="/landing"
          className="vha-skip"
          style={{ color: v.fg, borderColor: v.hair2, background: `${v.bg}b3`, backdropFilter: 'blur(6px)' }}
        >
          Go to Site →
        </Link>
      ) : (
        <button
          type="button"
          className="vha-skip"
          onClick={enterLadder}
          style={{ color: v.fg, borderColor: v.hair2, background: `${v.bg}b3`, backdropFilter: 'blur(6px)' }}
        >
          Skip to the line →
        </button>
      )}
      {revealed && (
        <HeroInfo atLadder={v.atLadder} fg={v.fg} bg={v.bg} dim={v.dim} accent={accent} />
      )}
      <HeroSummon fg={v.fg} bg={v.bg} dim={v.dim} accent={accent} />

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
          className="vha-lucy"
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

      {/* The engine owns the narrative offset and scale; both reach CSS as
          variables so the flank breakpoint can drop the Act 5 wordmark to the
          base of the poster (and let it grow, since it no longer has to dodge
          the face) without moving hero layout back into JS. Acts 1-4 and Hero B
          are untouched. */}
      <div
        className={`vha-typewrap${v.atLadder ? ' vha-typewrap--base' : ''}`}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(3vh + var(--vha-type-up))',
          textAlign: 'center',
          pointerEvents: 'none',
          // The engine's per-act values arrive under `-act` names. CSS then
          // picks which one wins, because an inline custom property beats any
          // stylesheet rule — including a media query — so the breakpoint could
          // never override a value written straight onto `--vha-type-up`.
          ['--vha-type-up-act' as string]: `${v.typeUp}vh`,
          ['--vha-word-scale-act' as string]: String(v.hellScale),
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
          <div className="vha-hell" style={{ ...wordStyle, transform: `translateY(${v.hellY}vh) scale(var(--vha-word-scale))`, opacity: v.oHell }}>
            HELL
          </div>
          <div
            className="vha-word vha-word--sm"
            style={{ ...wordStyle, transform: 'scale(var(--vha-word-scale))', opacity: v.oHeavenSm }}
          >
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--sm"
            style={{ ...wordStyle, transform: 'scale(var(--vha-word-scale))', opacity: v.oZero }}
          >
            ZERO
          </div>
          <div className="vha-hell" style={{ ...wordStyle, transform: 'scale(var(--vha-word-scale))', opacity: v.oUltra }}>
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

      {/* Act 5 · the triptych. On a wide viewport the interface FLANKS the
          figure — the ladder centred above her collar, the command left, the
          install right — and the monumental wordmark drops to the base of the
          poster. The centre column from her crown to her collar carries nothing,
          so no type or control ever crosses her face (owner ruling, PR #71).
          Narrow viewports keep the single centred stack: there the type is
          width-bound (26vw wins over 34vh) and already sits below the face. */}
      <div
        className={`vha-ctawrap${v.atLadder ? ' vha-ctawrap--flank' : ''}`}
        style={{
          transition: 'opacity calc(500ms * var(--vh-t)) linear,transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          opacity: v.oCta,
          transform: `translateY(${v.ctaY}px)`,
          // Hit-testing is CSS-owned: the wrapper is click-transparent and only
          // its three zones take pointer events, so in the flank composition —
          // where the wrapper spans the viewport — the act dots underneath stay
          // reachable. `--flank` is applied exactly on Act 5, which is the only
          // act where any of this is interactive.
        }}
      >
        <div className="vha-ladderband">
          <div className="vha-chiprow">
            <div className="vha-chip vha-chip--zero">ZERO</div>
            <div className="vha-chip vha-chip--heaven">HEAVEN</div>
            <div className="vha-chip vha-chip--hell">HELL</div>
            <div className="vha-chip vha-chip--ultra">ULTRA</div>
          </div>
          <div className="vha-rungrow">
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
          <div className="vha-stopnote" style={{ color: v.noteTone, textShadow: `0 0 7px ${v.bg},0 1px 2px ${v.bg}` }}>{v.stopNote}</div>
        </div>

        <div className="vha-cta vha-cta--left">
          <button
            type="button"
            className="vha-cta-cmd"
            onClick={() => copy(band.cmd, 'cmd')}
            style={{ background: v.fg, color: v.bg, borderColor: v.ctaLine }}
          >
            {/* every band command is a slash command typed in-session, never a shell line */}
            <span className="vha-cta-prompt" style={{ color: v.bg }}>›</span>
            <span className="vha-cta-text">{band.cmd}</span>
            <span className="vha-cta-tag" style={{ color: v.bg, opacity: 0.6 }}>{copied === 'cmd' ? 'copied ⏎' : 'copy'}</span>
          </button>
          <div className="vha-cta-hint" style={{ color: v.dim }}>{band.hint}</div>
          {/* The door is routed per band, so it belongs beside the band's own
              command rather than with the repo actions (issue #47). */}
          <Link className="vha-cta-door" to={band.door} style={{ color: v.fg, borderColor: v.ctaLine }}>
            {band.doorLabel} →
          </Link>
        </div>

        <div className="vha-cta vha-cta--right">
          {/* One block, both lines, one copy — the install is two lines typed
              inside Claude Code and it should read and paste as one thing
              (docs/AGENT-PLUGIN.md, issue #47). */}
          <div className="vha-cta-term" style={{ borderColor: v.ctaLine }}>
            <div className="vha-cta-termhead" style={{ color: v.dim, borderColor: v.hair2 }}>
              <span>Install · Claude Code</span>
              <button
                type="button"
                className="vha-cta-termcopy"
                onClick={() => copy(INSTALL.plugin.join('\n'), 'install')}
                style={{ color: v.fg, borderColor: v.ctaLine }}
              >
                {copied === 'install' ? 'copied ⏎' : 'copy both'}
              </button>
            </div>
            {INSTALL.plugin.map((line) => (
              <div key={line} className="vha-cta-termline">
                <span className="vha-cta-prompt" style={{ color: v.dim }}>›</span>
                <span className="vha-cta-text">{line}</span>
              </div>
            ))}
          </div>

          {/* The repo actions — quiet, and never competing with the install. */}
          <div className="vha-cta-row">
            <a
              className="vha-cta-link"
              href={SITE.repoUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: v.fg, borderColor: v.hair2 }}
            >
              ★ Star
            </a>
            <a className="vha-cta-mini" href={SITE.issuesUrl} target="_blank" rel="noreferrer" style={{ color: v.dim }}>
              Contribute
            </a>
            <button type="button" className="vha-cta-mini vha-cta-mini--btn" onClick={enterStory} style={{ color: v.dim }}>
              Intro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
