import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HERO_ASSET_SETS, normalizeLucyAssetSet, preloadLucyAssets } from './hero/heroAssets'
import { useHeroEngine } from './hero/useHeroEngine'
import { HeroInfo, HeroSummon } from './hero/HeroInfo'
import { DOORS, PLATFORM_COMMANDS, type Platform } from '../product'
import { HarnessMark } from '../harnessMarks'
import { PlatformToggle } from '../components/PlatformToggle'
import { LucyTunerHUD } from './hero/LucyTunerHUD'
import { WingsTunerHUD } from './hero/WingsTunerHUD'
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

// Zero-scene only: /skill-zero is the one command that has to name a
// harness before it means anything, so this is the one CTA that shows the
// harness marks. Heaven/Hell/Ultra never repeat it — by the time a visitor is
// on those bands the harness choice is already made (issue: mobile viewport
// pass).
function ZeroCompat({ fg }: { fg: string }) {
  return (
    <div className="vha-cta-compat" style={{ color: fg }}>
      <span className="vha-cta-compat__label">Runs on</span>
      <span className="vha-cta-compat__marks">
        {DOORS.map((d) => (
          <HarnessMark
            key={d.id}
            id={d.id}
            harness={d.harness}
            className="vha-cta-compat__mark"
            letterClassName="vha-cta-compat__mark vha-cta-compat__mark--letter"
          />
        ))}
      </span>
    </div>
  )
}

function isTunerRequested(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const hash = window.location.hash
  if (params.get('tuner') === 'lucy' || params.get('tuner') === 'true' || params.get('dev') === 'true') return true
  if (hash.includes('tuner=lucy') || hash.includes('tuner=true')) return true
  try {
    if (localStorage.getItem('lucy-tuner') === 'true') return true
  } catch {}
  return false
}

export function VariationHeroA({ assetSet }: VariationHeroProps) {
  const { v, act, actCount, dots, rungs, rootRef, enterStory, enterLadder, resetZoom } = useHeroEngine('a')
  const navigate = useNavigate()
  const [showTuner, setShowTuner] = useState(isTunerRequested)

  // Hotkey toggle: Ctrl+Shift+L or Cmd+Shift+L toggles the Lucy tuner anytime
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setShowTuner((prev) => {
          const next = !prev
          try {
            if (next) localStorage.setItem('lucy-tuner', 'true')
            else localStorage.removeItem('lucy-tuner')
          } catch {}
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const atLadder = act === actCount - 1
  const set = normalizeLucyAssetSet(assetSet)
  const assets = HERO_ASSET_SETS[set][v.lucyState]

  const onSelectScene = useCallback(
    (targetScene: 'zero' | 'heaven' | 'hell' | 'ultra') => {
      const idx = targetScene === 'zero' ? 0 : targetScene === 'heaven' ? 1 : targetScene === 'hell' ? 3 : 6
      rungs[idx]?.pick()
    },
    [rungs],
  )
  // Heaven stays on set-A: set-B's master ships a baked-in checkerboard (bad
  // export) and set-C's has an opaque white ground that can't sit on the black
  // Heaven back on set-A per owner.
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
  // door lands at section 01 (#doors); Heaven, Hell, and Ultra land at
  // section 04 (#directions).
  const BAND: Record<string, { cmd: string; hint: string; anchor: string; tab?: string; doorLabel: string }> = {
    zero: {
      cmd: '/skill-zero',
      hint: 'the floor · /summon by hand, nothing automatic',
      anchor: 'doors',
      doorLabel: `Open the door · all ${DOORS.length} harnesses`,
    },
    heaven: {
      cmd: '/skill-heaven',
      hint: 'converge · low↔med, opens at low',
      anchor: 'run',
      tab: 'heaven',
      doorLabel: 'Open the door · demo converge',
    },
    hell: {
      cmd: '/skill-hell',
      hint: 'explore · high↔max, opens at high',
      anchor: 'run',
      tab: 'hell',
      doorLabel: 'Open the door · demo explore',
    },
    ultra: {
      cmd: '/skill-ultra',
      hint: 'the crown · picks direction + position per gap',
      anchor: 'run',
      tab: 'ultra',
      doorLabel: 'Open the door · demo ultra',
    },
  }
  const band = BAND[v.scene]
  const openLandingSection = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement>, anchor: string, tab?: string) => {
      e.preventDefault()
      const search = tab ? `?section=${anchor}&tab=${tab}` : `?section=${anchor}`
      navigate(`/landing${search}`, { state: { scrollTo: anchor, tab } })
    },
    [navigate],
  )
  // Mobile-only, Variation E: the state word repeated to fill the screen
  // (owner reference: a magazine "BRAND BRAND BRAND" tile, subject in
  // front). Reuses the same word the single-instance wordmark shows, so it
  // never drifts out of sync with the band.
  const stateWord: Record<typeof v.scene, string> = { zero: 'ZERO', heaven: 'HEAVEN', hell: 'HELL', ultra: 'ULTRA' }
  const [platform, setPlatform] = useState<Platform>('posix')
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
  // Preload and pre-decode all character and weapon assets into memory/GPU cache
  useEffect(() => {
    preloadLucyAssets(set)
    const wings = [wingLeft, wingRight]
    wings.forEach((src) => {
      const img = new Image()
      img.src = src
      img.decode?.().catch(() => {})
    })
  }, [set])

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
      onDoubleClick={resetZoom}
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
              bottom: `calc(0vh + var(--wing-y, 0vh))`,
              left: `calc(2% + var(--wing-x, 0vh))`,
              transformOrigin: 'bottom center',
              transform: `scale(calc(${v.mWing} * var(--wing-scale, 1))) rotate(calc(0deg - var(--wing-rot, 0deg)))`,
              opacity: `calc(${v.oWing} * var(--wing-opacity-mul, 1))`,
              filter: wingFilter,
              transition:
                'var(--wing-drag-transition, opacity calc(600ms * var(--vh-t)) linear,transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1))',
            }}
          />
          <img
            className="vh-asset vha-wing vha-wing--right"
            src={wingRight}
            alt=""
            draggable={false}
            style={{
              bottom: `calc(0vh + var(--wing-y, 0vh))`,
              right: `calc(2% + var(--wing-x, 0vh))`,
              transformOrigin: 'bottom center',
              transform: `scale(calc(${v.mWing} * var(--wing-scale, 1))) rotate(calc(0deg + var(--wing-rot, 0deg)))`,
              opacity: `calc(${v.oWing} * var(--wing-opacity-mul, 1))`,
              filter: wingFilter,
              transition:
                'var(--wing-drag-transition, opacity calc(600ms * var(--vh-t)) linear,transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1))',
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
          // Positioning only — scale is moved onto the <img> so Safari samples
          // from the full-resolution source bitmap rather than a GPU-rasterized
          // layout-size texture. The transition/origin still live here so the
          // face-anchor easing is preserved.
          transition:
            'var(--lucy-drag-transition, transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)),transform-origin calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1)',
          transform: `translateX(calc(${v.figX}vh + var(--lucy-offset-x, 0vh))) translateY(calc(${(v.lucyY + v.figY).toFixed(2)}vh + var(--lucy-offset-y, 0vh)))`,
          transformOrigin: v.figOrigin,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {(['zero', 'heaven', 'hell', 'ultra'] as const).map((state) => {
          const isCurrent = v.lucyState === state
          const scale = (Number(v.mLucy) * v.figZoom).toFixed(3)
          return (
            <img
              key={state}
              className="vha-lucy"
              src={HERO_ASSET_SETS[set][state].lucy}
              alt=""
              loading="eager"
              decoding="sync"
              style={{
                display: isCurrent ? 'block' : 'none',
                height: '92vh',
                width: 'auto',
                // Scale on the img itself: Safari then samples from the source
                // bitmap at the true rendered size rather than upscaling a
                // composited layer texture. transformOrigin mirrors the
                // face-anchor origin from the engine so framing is identical.
                // Multiplied by --lucy-user-zoom via trackpad gesture pinch-to-zoom.
                transform: `scale(calc(${scale} * var(--lucy-user-zoom, 1)))`,
                transformOrigin: v.figOrigin,
                mixBlendMode: v.lucyBlend,
                transition: `var(--lucy-drag-transition, var(--lucy-zoom-transition, transform calc(900ms * var(--vh-t)) cubic-bezier(.16,1,.3,1))),filter 0ms,opacity calc(600ms * var(--vh-t)) linear`,
                opacity: isCurrent ? v.oLucy : 0,
                filter: isCurrent ? v.lucyFilter : 'none',
              }}
            />
          )
        })}
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
          transition: v.bladeTransition,
          transform: `rotate(-28deg) translateX(${v.bladeX}%) scale(${v.mBlade})`,
          opacity: v.oBlade,
          filter: v.bladeBlur ? `blur(${v.bladeBlur}px)` : 'none',
        }}
      >
        {(['zero', 'heaven', 'hell', 'ultra'] as const).map((state) => {
          const isCurrent = v.lucyState === state
          return (
            <img
              key={state}
              className="vh-asset vh-asset--sword"
              src={HERO_ASSET_SETS[set][state].katana}
              alt=""
              loading="eager"
              decoding="sync"
              style={{ display: isCurrent ? 'block' : 'none' }}
              draggable={false}
            />
          )
        })}
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
            className="vha-word vha-word--sm vha-word--heaven"
            style={{ ...wordStyle, transform: 'scaleX(1.12) scale(var(--vha-word-scale))', opacity: v.oHeavenSm }}
          >
            HEAVEN
          </div>
          <div
            className="vha-word vha-word--sm vha-word--zero"
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

          {/* The "wordmark shadow" (Variation E, mobile only): Heaven/Hell/
              Ultra multiply the exact main instance above — same position,
              size and font, anchored at n=0 which is precisely where the
              Variation D title sits — and propagate copies of it up (n<0)
              and down (n>0) at a fixed spacing. Only the true main slot
              carries the fill and the SKILL script; every shadow copy is
              stroke-only, and thinner than the main's stroke (a full-weight
              outline repeated this many times reads heavier than a shadow
              should). Zero keeps just the single title, no shadow. Desktop
              never sees these (`.vha-word--bg`, variation-hero.css). MUST
              stay inside this wrapper — it's what carries --vha-word-scale,
              and a shadow copy outside it silently drops the whole
              `transform` (an unresolved var() in `scale()` invalidates the
              entire property, not just that function).
              More copies downward than up (1..5 vs -2..-1): the main sits
              high already, so upward mostly runs off-screen after two, while
              downward is what actually fills a tall/large display. */}
          {v.atLadder && v.scene !== 'zero' && (
            <>
              {[-2, -1, 1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  aria-hidden="true"
                  className={`vha-word--bg ${v.scene === 'heaven' ? 'vha-word vha-word--sm vha-word--heaven' : 'vha-hell'}`}
                  style={{
                    ...wordStyle,
                    color: 'transparent',
                    WebkitTextStroke: v.wordStroke.replace(/^\S+/, '1.25px'),
                    transform: `translateY(${n * 17}vh) ${v.scene === 'heaven' ? 'scaleX(1.12) ' : ''}scale(var(--vha-word-scale))`,
                  }}
                >
                  {stateWord[v.scene]}
                </div>
              ))}
            </>
          )}
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
          {/* Open the door is the primary action on every band (zero, heaven,
              hell, ultra alike) — it's the one link that actually goes
              somewhere. The copy-command control below it is secondary: handy
              once you've already got the plugin, not the first thing to reach
              for. */}
          <Link
            className="vha-cta-cmd"
            to={`/landing?section=${band.anchor}${band.tab ? `&tab=${band.tab}` : ''}`}
            onClick={(e) => openLandingSection(e, band.anchor, band.tab)}
            style={{ background: v.fg, color: v.bg, borderColor: v.ctaLine }}
          >
            <span className="vha-cta-text">{band.doorLabel}</span>
            <span className="vha-cta-tag" style={{ color: v.bg, opacity: 0.6 }}>→</span>
          </Link>
          <div className="vha-cta-hint" style={{ color: v.dim }}>{band.hint}</div>
          <button
            type="button"
            className="vha-cta-door vha-cta-door--cmd"
            onClick={() => copy(band.cmd, 'cmd')}
            style={{ color: v.fg, borderColor: v.ctaLine }}
          >
            {/* every band command is a slash command typed in-session, never a shell line */}
            <span className="vha-cta-prompt" style={{ opacity: 0.8 }}>›</span>
            <span className="vha-cta-text">{band.cmd}</span>
            <span className="vha-cta-tag">{copied === 'cmd' ? 'copied ⏎' : 'copy'}</span>
          </button>
          {v.scene === 'zero' && <ZeroCompat fg={v.fg} />}
        </div>

        <div className="vha-cta vha-cta--right">
          {/* The portable Agent Plugin installer is primary. It prints the
              local plugin/marketplace paths; clients load the installed
              directory without this page pretending to rewrite an unknown
              harness config. Claude's marketplace flow lives behind the
              "Claude tested" tab on /landing, not stacked here too. */}
          <div className="vha-cta-term" style={{ borderColor: v.ctaLine }}>
            <div className="vha-cta-termhead" style={{ color: v.dim, borderColor: v.hair2 }}>
              <span>Install · Agent Plugins</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <PlatformToggle platform={platform} onToggle={setPlatform} />
                <button
                  type="button"
                  className="vha-cta-termcopy"
                  onClick={() => copy(PLATFORM_COMMANDS[platform].agentPlugin, 'install')}
                  style={{ color: v.fg, borderColor: v.ctaLine }}
                >
                  {copied === 'install' ? 'copied ⏎' : 'copy install'}
                </button>
              </div>
            </div>
            <div className="vha-cta-termline">
              <span className="vha-cta-prompt" style={{ color: v.dim }}>
                {PLATFORM_COMMANDS[platform].sigil}
              </span>
              <span className="vha-cta-text">{PLATFORM_COMMANDS[platform].agentPlugin}</span>
            </div>
            <div className="vha-cta-termline">
              <span className="vha-cta-prompt" style={{ color: v.dim }}>↳</span>
              <span className="vha-cta-text">prints a directory any Agent Plugins client can load</span>
            </div>
          </div>

          {/* Star/Contribute pulled per owner request — repo actions were
              competing with the install for attention. Intro (desktop-only,
              hidden on mobile — see .vha-cta-mini--btn in variation-hero.css)
              is the one action worth keeping here. */}
          <div className="vha-cta-row">
            <button type="button" className="vha-cta-mini vha-cta-mini--btn" onClick={enterStory} style={{ color: v.dim }}>
              Intro
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Wings Tuner HUD for repositioning and scaling wings */}
      <WingsTunerHUD
        scene={v.scene}
        rootRef={rootRef}
        onSelectScene={onSelectScene}
      />

      {/* Interactive Dev Tool HUD for dragging Lucy and tracking live coordinates & zoom (triggered via ?tuner=lucy or Cmd+Shift+L) */}
      {showTuner && (
        <LucyTunerHUD
          scene={v.scene}
          figBase={v.figBase}
          rootRef={rootRef}
          onReset={resetZoom}
          onSelectScene={onSelectScene}
        />
      )}
    </div>
  )
}
