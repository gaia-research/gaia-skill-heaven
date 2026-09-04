import { useCallback, useEffect, useRef, useState } from 'react'

// Shared state machine behind VariationHeroA / VariationHeroB. Both routes
// render the same 5-act, wheel/keyboard/touch-driven scrollytelling engine
// and the same 7-rung skill-entropy ladder (ZERO..MAX plus ULTRA at its
// crown) — they differ only in layout (Reredos vs Guillotine), so the machine
// lives here once.

const ACT_LABEL = ['FOCUS', 'SUMMON', 'SLASH', 'BREAK LOOSE', 'ENTER']
const ACT_SUB = ["converge, don't collect", 'one skill · one session', 'cut the context bloat', 'explore · trust the agent', 'one line']
const CAM = [0, 180, 340, 430, 120]
const P = 1200
const N = 5

// Real perspective parallax: one camera push, per-layer depth.
const mag = (d: number, camZ: number) => ((P - d) / (P - d - camZ)).toFixed(4)

export type Lane = 'z' | 'h' | 'x' | 'u'

// The one line (N13). A single ladder — zero·low·med·high·xhigh·max·ultra —
// measuring SKILL ENTROPY, whose four surfaces are contiguous BANDS read from
// the current rung:
//   ZERO                 → lane 'z'  the floor, ships /summon, none automated
//   LOW·MED              → lane 'h'  Skill Heaven · converge
//   HIGH·XHIGH·MAX       → lane 'x'  Skill Hell · explore
//   ULTRA                → lane 'u'  Skill Ultra · the crown rung / controller
// A rung names a direction and a position, never a count. Nothing on the line
// refuses — every rung is reachable (N13).
export const LADDER: { label: string; lane: Lane; note: string }[] = [
  { label: 'ZERO', lane: 'z', note: 'zero · the floor — ships /summon, none of it automated' },
  { label: 'LOW', lane: 'h', note: 'heaven · converge — the band opens here' },
  { label: 'MED', lane: 'h', note: 'heaven · converge — further along the band' },
  { label: 'HIGH', lane: 'x', note: 'hell · explore — the band opens here' },
  { label: 'XHIGH', lane: 'x', note: 'hell · explore — further along the band' },
  { label: 'MAX', lane: 'x', note: 'hell · explore — the far end of the band' },
  { label: 'ULTRA', lane: 'u', note: 'ultra · the crown — picks direction + position per gap' },
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

// Acts 1-4 are the optional scrollytelling intro; Act 5 is the one line. On a
// phone the intro is disabled outright (mobile viewport pass) — the hero
// lands on, and stays on, the ladder. Desktop keeps the full five-act story.
// Matches the .vha-chrome / .vha-cta-mini--btn mobile breakpoint in
// variation-hero.css, so the dots/Intro button that would drive this
// disappear in lockstep with the behaviour.
function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 640px)').matches
    : false
}

function getViewportCategory(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop'
  if (window.matchMedia('(max-width: 640px)').matches) return 'mobile'
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet'
  return 'desktop'
}

type EngineState = {
  act: number
  flash: 0 | 1 | 2
  stop: number
  glitch: 0 | 1 | 2
  od: 0 | 1 | 2
}

// Hero palette — the single source of truth for every colour the hero draws,
// mirroring the brand tokens (styles/system.css, DESIGN.md). This ported hero
// computes its styles in JS rather than from CSS custom properties, so the
// palette lives here as named constants instead of scattered hex literals.
const HERO = {
  ink: '#0A0A0A',
  bone: '#EDEDEA',
  paper: '#F4F2EE',
  inkPanel: '#171618',
  zeroBg: '#1B1A1C', // our charcoal token (the established "black-grey", never #000)
  zeroFg: '#EEEBE6', // bone — white figure + type on charcoal
  ultraBg: '#080604',
  ultraFg: '#F2E4C0',
  cyan: '#5FC2D6', // prismatic palette (Heaven)
  violet: '#A58AE0',
  blue: '#7CC4FF',
  gold: '#FFD24A', // Ultra
  grey: '#8B8890', // Zero rung
  hellTeal: '#3F9B8A', // inverted, non-red (Hell)
  hellBlue: '#4F86B8',
  // Sampled off the Hell master's own hair (weighted average of its dominant
  // orange pixel cluster) rather than a generic "amber" — reads as HER
  // colour, not a swatch-picker amber. Shared token: also the MAX rung
  // border, so this change reaches both.
  hellAmber: '#DB6F07',
} as const

// Lucy's print on the ladder, mobile only: <100% of the desktop scale, same
// proportions (a uniform CSS `scale()`, so nothing stretches). The face-anchor
// MATH (FIG.origin, FIG.y) stays exactly what it is on desktop — only the
// zoom factor shrinks — because that anchor formula is what keeps her face
// clear of the CTA stack below it; touching the box height instead (an
// earlier version of this fix) dragged the anchor itself down into the CTA
// stack, which is the opposite of what "mobile viewport" pass needed.
const MOBILE_FIG_SCALE = 0.62

// Per-band figure framing presets, FACE-ANCHORED.
export const FIG_CONFIG = {
  zero: { zoom: 1.00, x: 0.60, y: 3.68, origin: '47% 30%' },
  heaven: { zoom: 1.59, x: -3.25, y: -1.63, origin: '49% 27%' },
  hell: { zoom: 1.68, x: 2.66, y: -0.25, origin: '47% 30%' },
  ultra: { zoom: 1.40, x: 3.55, y: 2.00, origin: '45% 24%' },
} as const

// Per-band wing framing presets across responsive viewports.
export const WING_CONFIG = {
  heaven: { scale: 0.95, x: 8.2, y: 30.0, rot: 0.0 },
  hell:   { scale: 0.95, x: 8.2, y: 30.0, rot: 0.0 },
  ultra:  { scale: 0.95, x: 8.2, y: 30.0, rot: 0.0 },
} as const

export const WING_CONFIG_TABLET = {
  heaven: { scale: 0.80, x: -6.3, y: 23.9, rot: 0.0 },
  hell:   { scale: 0.80, x: -6.3, y: 23.9, rot: 0.0 },
  ultra:  { scale: 0.80, x: -6.3, y: 23.9, rot: 0.0 },
} as const

export const WING_CONFIG_MOBILE = {
  heaven: { scale: 1.66, x: -5.0, y: 45.2, rot: 0.0 },
  hell:   { scale: 1.66, x: -5.0, y: 45.2, rot: 0.0 },
  ultra:  { scale: 1.66, x: -5.0, y: 45.2, rot: 0.0 },
} as const

// Pure translation of state -> every derived style value. Nothing here
// mutates state; `variant` only steers the two style knobs (cut angle, CTA
// alignment) that differ between the Reredos and Guillotine layouts.
function computeVals(
  state: EngineState,
  variant: 'a' | 'b',
  mobile: boolean,
  viewport: 'desktop' | 'tablet' | 'mobile' = 'desktop',
) {
  const { act, flash, stop, glitch, od } = state
  const lane = LADDER[stop].lane
  const atLadder = act === N - 1
  // Below act 5 the act owns the palette (heaven build → hell reveal); at act 5
  // the ladder's current rung owns it, so the whole page repaints to the band.
  const scene: 'zero' | 'heaven' | 'hell' | 'ultra' = atLadder
    ? lane === 'z'
      ? 'zero'
      : lane === 'x'
        ? 'hell'
        : lane === 'u'
          ? 'ultra'
          : 'heaven'
    : act >= 3
      ? 'hell'
      : 'heaven'
  const hell = scene === 'hell'
  // Zero has no bespoke master — it borrows Heaven's figure under a monochrome
  // wash (owner: "even Lucy is rendered monochrome up top"). Hell and Ultra use
  // their own approved masters.
  const lucyState =
    scene === 'ultra'
      ? ('ultra' as const)
      : scene === 'hell'
        ? ('hell' as const)
        : scene === 'zero'
          ? ('zero' as const)
          : ('heaven' as const)
  const camZ = CAM[act]

  // Four bands, four palettes (N13 motif):
  //   zero   — zen washed monochrome; ink grey is the darkest tone, never black
  //   heaven — the full PRISMATIC spectrum on deep ground
  //   hell   — the INVERTED spectrum on paper; it reads red because that is what
  //            the prism becomes when inverted
  //   ultra  — heaven with a GOLD highlight laid over it: the
  //            final form, not flat gold
  const PAL = {
    zero: { bg: HERO.zeroBg, fg: HERO.zeroFg, dim: 'rgba(241,240,237,.5)', hair: 'rgba(241,240,237,.09)', hair2: 'rgba(241,240,237,.22)' },
    heaven: { bg: '#000000', fg: HERO.bone, dim: 'rgba(237,237,234,.46)', hair: 'rgba(237,237,234,.09)', hair2: 'rgba(237,237,234,.22)' },
    hell: { bg: HERO.paper, fg: HERO.ink, dim: 'rgba(10,10,10,.48)', hair: 'rgba(10,10,10,.10)', hair2: 'rgba(10,10,10,.22)' },
    ultra: { bg: HERO.ultraBg, fg: HERO.ultraFg, dim: 'rgba(242,228,192,.5)', hair: 'rgba(242,228,192,.08)', hair2: 'rgba(255,210,74,.32)' },
  } as const
  const P0 = PAL[scene]
  const bg = P0.bg
  const fg = P0.fg
  const dim = P0.dim

  // Photoshop-style treatment: a SOLID fill + a coloured TEXT BORDER (stroke).
  // HEAVEN white, HELL black, ULTRA white, ZERO bone. The border carries the
  // palette splash: prismatic (heaven), inverted non-red (hell), gold (ultra).
  const WORD_FILL = { zero: HERO.bone, heaven: '#FFFFFF', hell: '#0A0A0A', ultra: '#FFFFFF' } as const
  // Zero's stroke reads noticeably thinner than the other three bands even at
  // the same weight — bumped to match on mobile, where the wordmark now sits
  // behind Lucy and has to hold up as a title rather than a quiet watermark.
  // Desktop keeps the original 2px.
  const WORD_STROKE = {
    zero: `${mobile ? 3 : 2}px ${HERO.grey}`,
    heaven: `3px ${HERO.violet}`,
    // Hell's word border defaults to "max"'s amber rather than "high"'s
    // teal — the band reads one colour regardless of which Hell rung
    // (high/xhigh/max) is actually selected, and amber was the pick.
    hell: `3px ${HERO.hellAmber}`,
    ultra: `3px ${HERO.gold}`,
  } as const
  const wordFill = WORD_FILL[scene]
  const wordStroke = WORD_STROKE[scene]

  // Per-band figure framing, FACE-ANCHORED. origin is the measured FACE centre
  // (% of the master) so the zoom pivots on the face; y (vh) then places that
  // face on the GOLDEN-RATIO line (~37vh from top) — face-first, never covered.
  // Because origin is the face, face-y ≈ 8 + originY%*92 + lucyY + y, i.e. y
  // moves the face 1:1 in vh. PROVISIONAL, verified against screenshots.
  const fig = FIG_CONFIG[scene]

  const pick = <T,>(arr: T[]) => arr[act]

  return {
    atLadder,
    bg,
    fg,
    dim,
    lucyState,
    scene,
    wordFill,
    wordStroke,
    figBase: FIG_CONFIG[scene],
    figZoom: mobile ? fig.zoom * MOBILE_FIG_SCALE : fig.zoom,
    figX: fig.x,
    figY: fig.y,
    figOrigin: fig.origin,
    hair: P0.hair,
    hair2: P0.hair2,
    stripe: P0.hair,
    chromeBg: scene === 'hell' ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.5)',

    mType: mag(0, camZ),
    mLucy: mag(-260, camZ),
    mWing: mag(-420, camZ),
    mGround: mag(-700, camZ),
    mBlade: mag(120, camZ),

    oHeaven: pick([1, 1, 1, 0, 0]),
    oHeavenSm: atLadder && scene === 'heaven' ? 1 : 0,
    oZero: atLadder && scene === 'zero' ? 1 : 0,
    oHeavenB: act < 3 ? 1 : atLadder && scene === 'heaven' ? 1 : 0,
    mHeavenB: act === N - 1 ? (Number(mag(0, camZ)) * 0.62).toFixed(4) : mag(0, camZ),
    heavenYB: act === N - 1 ? -11 : pick([0, -1, -2, 0, 0]),
    oUltra: act === N - 1 && lane === 'u' ? 1 : 0,
    glitchX: glitch === 1 ? -11 : glitch === 2 ? 8 : od === 1 ? -7 : od === 2 ? 5 : 0,
    glitchSkew: glitch === 1 ? -2.4 : glitch === 2 ? 1.6 : od === 1 ? -1.6 : od === 2 ? 1.1 : 0,
    oScan: glitch ? 0.5 : od ? 0.34 : 0,
    odSheet: od === 1 ? HERO.gold : od === 2 ? HERO.inkPanel : 'transparent',
    odWedge: od === 1 ? HERO.inkPanel : HERO.gold,
    odOp: od ? (od === 1 ? 0.88 : 1) : 0,
    oSplit: pick([0, 0, 1, 0, 0]),
    splitX: pick([0, 0, 34, 90, 90]),
    oHell: act === 3 || (act === N - 1 && hell) ? 1 : 0,
    hellScale: pick([1.25, 1.25, 1.25, 1, 0.5]),
    hellY: 0,
    hellYB: pick([0, 0, 0, 0, -11]),
    typeUp: pick([0, 0, 0, 0, 36]),
    oGround: pick([0.55, 0.45, 0.3, 0.2, 0.14]),
    oHalo: pick([0.5, 0.34, 0.14, 0, 0]),
    // Glass wings: translucent, their OWN scale (never the figure's oversize),
    // present through the intro and at the ladder for heaven/hell/ultra; Zero
    // carries none (canon).
    oWing: atLadder ? (scene === 'zero' ? 0 : 0.55) : [0.5, 0.4, 0.28, 0.14, 0][act],
    wingScale:
      scene === 'zero'
        ? 1.0
        : (viewport === 'mobile' ? WING_CONFIG_MOBILE : viewport === 'tablet' ? WING_CONFIG_TABLET : WING_CONFIG)[scene].scale,
    wingX:
      scene === 'zero'
        ? 0.0
        : (viewport === 'mobile' ? WING_CONFIG_MOBILE : viewport === 'tablet' ? WING_CONFIG_TABLET : WING_CONFIG)[scene].x,
    wingY:
      scene === 'zero'
        ? 0.0
        : (viewport === 'mobile' ? WING_CONFIG_MOBILE : viewport === 'tablet' ? WING_CONFIG_TABLET : WING_CONFIG)[scene].y,
    wingRot:
      scene === 'zero'
        ? 0.0
        : (viewport === 'mobile' ? WING_CONFIG_MOBILE : viewport === 'tablet' ? WING_CONFIG_TABLET : WING_CONFIG)[scene].rot,
    haloRot: pick([0, -3, -7, -12, -12]),
    lucyY: pick([0, -1.5, -3, 0, 0]),
    lucyXB: pick([0, -1, -2, 1, 6]),
    lucyBlend: 'normal' as const,
    lucyFilter:
      scene === 'zero'
        ? 'grayscale(1) brightness(1.55) contrast(1.06)'
        : scene === 'ultra'
          ? 'saturate(1.06) brightness(1.03) drop-shadow(0 0 26px rgba(255,210,74,0.42))'
          : 'none',
    // The ladder's own act (index 4) reads a hair under full opacity on
    // desktop — barely visible there, but on mobile, where she's the main
    // Full opacity at all acts and on desktop — the 0.88 cap was causing the
    // wordmark to bleed through hair and torso edges, killing perceived sharpness.
    oLucy: 1,

    // At the ladder, the blade is otherwise parked off-scene (oBlade reads 0
    // at act===N-1 by the Act 1-4 table below) — so a band switch used to cut
    // straight from one figure/background to the next with nothing to sell
    // the change. Reuse the SAME glitch clock pickStop already runs for every
    // band crossing: a two-frame swipe (blade flying one way, then the other)
    // timed to land right as the flash/scan pulse covers the repaint, so the
    // cut reads as a katana slash rather than a jump cut.
    oBlade: atLadder ? (glitch ? 1 : 0) : pick([0, 1, 0.9, 0, 0]),
    // Narrower swipe than the desktop story ever used: the frame itself is
    // capped at 78vw, and on a phone that's most of the screen already — an
    // 85% throw swung almost the whole blade off the narrow viewport on each
    // tick, so it barely registered before it was already gone.
    bladeX: atLadder ? (glitch === 1 ? -50 : glitch === 2 ? 50 : 0) : pick([-58, -14, 46, 120, 120]),
    bladeXB: pick([-62, -18, 40, 110, 110]),
    // Horizontal motion blur on the katana, synced to the swing: heavy as it
    // flies in and out, sharp at the pose. Eases with the blade transition.
    bladeBlur: atLadder ? (glitch ? 20 : 0) : pick([0, 12, 5, 18, 0]),
    // The scrollytelling swing (Acts 1-4) wants the full 700ms cinematic
    // ease. The ladder's glitch swipe is a 46ms-stepped hard cut like every
    // other glitch element on this surface (the wordmark shear has no
    // transition at all) — left at 700ms it never caught up between ticks and
    // read as a slow smear instead of two decisive strokes.
    bladeTransition:
      atLadder && glitch
        ? 'transform 40ms linear,opacity calc(120ms * var(--vh-t)) linear,filter 40ms linear'
        : 'transform calc(700ms * var(--vh-t)) cubic-bezier(.16,1,.3,1),opacity calc(400ms * var(--vh-t)) linear,filter calc(700ms * var(--vh-t)) linear',

    oCut: pick([0, 0, 1, 0.14, 0]),
    cutRot: variant === 'b' ? -38 : -28,
    cutScale: pick([0, 0.14, 1, 1, 1]),

    flashBg: flash === 1 ? '#FFFFFF' : flash === 2 ? '#000000' : 'transparent',
    flashOp: flash ? 1 : 0,
    flashInk: flash === 1 ? '#000000' : '#FFFFFF',
    flashWedge: flash ? 1 : 0,

    actLabel: ACT_LABEL[act],
    actSub: ACT_SUB[act],
    counter: '0' + (act + 1) + ' / 0' + N,
    oCue: act === N - 1 ? 0 : 1,

    oCta: act === N - 1 ? 1 : 0,
    ctaY: act === N - 1 ? 0 : 24,
    ctaPE: act === N - 1 ? ('auto' as const) : ('none' as const),

    stopNote: LADDER[stop].note,
    noteTone: lane === 'u' ? HERO.gold : dim,
    ctaLabel:
      lane === 'z'
        ? 'START CLEAN · SKILL ZERO'
        : lane === 'h'
          ? 'ENTER SKILL HEAVEN'
          : lane === 'x'
            ? 'ENTER SKILL HELL'
            : 'LET ULTRA DECIDE',
    ctaBg: lane === 'u' ? HERO.ink : lane === 'z' ? 'transparent' : fg,
    ctaFg: lane === 'u' ? HERO.gold : lane === 'z' ? fg : bg,
    ctaLine: lane === 'u' ? HERO.gold : fg,
  }
}

export type HeroVals = ReturnType<typeof computeVals>

// `variant` is fixed per route (Hero A = 'a', Hero B = 'b') — each is its own
// switcher entry now, so unlike the source design tool there is no in-page
// A/B toggle to reproduce.
// Below this speed-scale, a crossing reads as noise rather than an impact —
// suppress the flash/glitch treatment and just cut.
const FLASH_FLOOR = 0.45

export function useHeroEngine(variant: 'a' | 'b') {
  // The hero LANDS ON THE LADDER (issue #47): a visitor arrives on the one
  // line with the install in reach, not at the top of a five-act story. Acts
  // 1–4 are the optional narrative, entered deliberately from the ladder.
  const [act, setAct] = useState(N - 1)
  const [flash, setFlash] = useState<0 | 1 | 2>(0)
  // Default open at Skill Heaven LOW (issue: Skill Heaven Low default open)
  const [stop, setStop] = useState(1)
  const [glitch, setGlitch] = useState<0 | 1 | 2>(0)
  const [od, setOd] = useState<0 | 1 | 2>(0)
  const [mobile, setMobile] = useState(isMobileViewport)
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(getViewportCategory)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mqMobile = window.matchMedia('(max-width: 640px)')
    const mqTablet = window.matchMedia('(max-width: 1024px)')
    const onChange = () => {
      setMobile(mqMobile.matches)
      setViewport(getViewportCategory())
    }
    mqMobile.addEventListener?.('change', onChange)
    mqTablet.addEventListener?.('change', onChange)
    return () => {
      mqMobile.removeEventListener?.('change', onChange)
      mqTablet.removeEventListener?.('change', onChange)
    }
  }, [])

  const actRef = useRef(act)
  actRef.current = act
  const stopRef = useRef(stop)
  stopRef.current = stop

  const accRef = useRef(0)
  const lockRef = useRef(0)
  const touchYRef = useRef<number | null>(null)
  const touchTsRef = useRef(0)
  const glitchIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const flashT1Ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flashT2Ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const userZoomRef = useRef(1)
  const pinchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resetZoom = useCallback(() => {
    userZoomRef.current = 1
    if (rootRef.current) {
      rootRef.current.style.setProperty('--lucy-user-zoom', '1')
      rootRef.current.style.removeProperty('--lucy-zoom-transition')
      rootRef.current.style.removeProperty('--lucy-offset-x')
      rootRef.current.style.removeProperty('--lucy-offset-y')
    }
    window.dispatchEvent(new CustomEvent('lucy-user-zoom-change', { detail: { zoom: 1 } }))
  }, [])

  const handlePinchZoom = useCallback((deltaY: number) => {
    // Zoom sensitivity tuned for desktop trackpad pinch gestures (Chrome, Safari, Firefox).
    // Clamped per-event delta prevents abrupt spikes.
    const clampedDelta = Math.max(-60, Math.min(60, deltaY))
    const factor = Math.exp(-clampedDelta * 0.008)
    const nextZoom = Math.min(4.0, Math.max(0.3, userZoomRef.current * factor))
    userZoomRef.current = nextZoom

    if (rootRef.current) {
      rootRef.current.style.setProperty('--lucy-user-zoom', nextZoom.toFixed(4))
      rootRef.current.style.setProperty(
        '--lucy-zoom-transition',
        'transform 50ms cubic-bezier(.16,1,.3,1)',
      )
    }

    window.dispatchEvent(new CustomEvent('lucy-user-zoom-change', { detail: { zoom: nextZoom } }))

    if (pinchTimerRef.current != null) {
      clearTimeout(pinchTimerRef.current)
    }
    pinchTimerRef.current = setTimeout(() => {
      rootRef.current?.style.removeProperty('--lucy-zoom-transition')
      pinchTimerRef.current = undefined
    }, 180)
  }, [])

  // Fast scrolling should breeze through the choreography instead of forcing
  // every act transition to play at full cinematic length. `--vh-t` is a time
  // scale (1 = full pacing) written imperatively to the root element so every
  // `calc(<duration> * var(--vh-t))` in variation-hero.css speeds up with it —
  // no React re-render per input event. Hero A paints far more per frame
  // (full-resolution Lucy, perspective ground) than Hero B, so it gets a
  // harder floor: under fast scroll its long interpolations would stall
  // rather than play, so snapping beats a half-framerate crossfade.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const speedRef = useRef(0) // EWMA, px/ms
  const lastTsRef = useRef(0)
  const decayRef = useRef<number | undefined>(undefined)
  const FLOOR = variant === 'a' ? 0.22 : 0.32
  const V_SLOW = 1.2
  const V_FAST = 6.0

  const scaleFor = (v: number) =>
    prefersReducedMotion() ? 1 : Math.max(FLOOR, Math.min(1, 1 - ((v - V_SLOW) / (V_FAST - V_SLOW)) * (1 - FLOOR)))

  const setScale = useCallback((t: number) => {
    rootRef.current?.style.setProperty('--vh-t', t.toFixed(3))
  }, [])

  // Eases --vh-t back to 1 once input has been quiet for a beat, so the last
  // fast transition doesn't leave the page permanently sped up.
  const armDecay = useCallback(() => {
    if (decayRef.current != null) return
    const step = () => {
      const current = Number(rootRef.current?.style.getPropertyValue('--vh-t') || 1)
      const next = current + (1 - current) * 0.08
      if (next > 0.99) {
        setScale(1)
        decayRef.current = undefined
        return
      }
      setScale(next)
      decayRef.current = requestAnimationFrame(step)
    }
    decayRef.current = requestAnimationFrame(step)
  }, [setScale])

  const registerInput = useCallback(
    (inst: number, now: number) => {
      const dt = now - lastTsRef.current
      lastTsRef.current = now
      speedRef.current = dt > 400 ? inst : speedRef.current * 0.7 + inst * 0.3
      const t = scaleFor(speedRef.current)
      setScale(t)
      if (decayRef.current != null) {
        cancelAnimationFrame(decayRef.current)
        decayRef.current = undefined
      }
      armDecay()
      return t
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [armDecay, setScale],
  )

  useEffect(() => {
    document.body.classList.add('vh-hero-page')
    return () => document.body.classList.remove('vh-hero-page')
  }, [])

  useEffect(
    () => () => {
      if (decayRef.current != null) cancelAnimationFrame(decayRef.current)
    },
    [],
  )

  const go = useCallback((n: number, opts?: { steps?: number; t?: number }) => {
    // Mobile never leaves the ladder — Acts 1-4 are desktop-only.
    const nextAct = isMobileViewport() ? N - 1 : Math.max(0, Math.min(N - 1, n))
    const from = actRef.current
    if (nextAct === from) return
    const steps = opts?.steps ?? 1
    const t = opts?.t ?? 1
    const crossing = (from < 3 && nextAct >= 3) || (from >= 3 && nextAct < 3)
    // Scrolling into ENTER arrives in Hell — the ladder's High rung, not Off.
    if (nextAct === N - 1 && from < N - 1 && LADDER[stopRef.current].lane === 'h') {
      setStop(3)
    }
    // A multi-act jump or a fast-enough scroll turns the crossing flash — an
    // impact frame meant for a single crossing — into noise. Cut instead.
    if (crossing && steps === 1 && t >= FLASH_FLOOR && !prefersReducedMotion()) {
      setAct(nextAct)
      setFlash(1)
      clearTimeout(flashT1Ref.current)
      clearTimeout(flashT2Ref.current)
      flashT1Ref.current = setTimeout(() => setFlash(2), 60)
      flashT2Ref.current = setTimeout(() => setFlash(0), 150)
    } else {
      setAct(nextAct)
    }
  }, [])

  // Crossing the ladder's heaven/hell line at act 5 repaints the whole page,
  // so it gets the same violence as the scroll-driven impact frame. Rung
  // clicks are a deliberate action, not a scroll gesture — always run at
  // full pacing.
  const pickStop = useCallback(
    (i: number) => {
      setScale(1)
      // The slice fires only when the BAND changes — i.e. you switch modes
      // (Zero ↔ Heaven ↔ Hell ↔ Ultra). Moving WITHIN a band (high→xhigh, both
      // Hell) does not, since the surface identity has not changed.
      const bandChanged = LADDER[i].lane !== LADDER[stopRef.current].lane
      setStop(i)
      if (!bandChanged || actRef.current !== N - 1 || prefersReducedMotion()) return
      clearInterval(glitchIntervalRef.current)
      let n = 0
      setGlitch(1)
      setFlash(1)
      glitchIntervalRef.current = setInterval(() => {
        n += 1
        if (n > 6) {
          clearInterval(glitchIntervalRef.current)
          setGlitch(0)
          setFlash(0)
          return
        }
        setGlitch(n % 2 ? 2 : 1)
        setFlash(n < 3 ? (n % 2 ? 2 : 1) : 0)
      }, 46)
    },
    [setScale],
  )

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()

      // Trackpad pinch-to-zoom: desktop browsers synthesize wheel with ctrlKey=true.
      // Explicitly for trackpad pinch gestures, not touchscreen interactions.
      if (e.ctrlKey) {
        handlePinchZoom(e.deltaY)
        return
      }

      const now = Date.now()
      // A new gesture after a pause starts cinematic — don't let a stale EWMA
      // from a prior fast scroll bleed into it.
      const dt = Math.max(8, now - lastTsRef.current)
      const inst = dt > 400 ? Math.abs(e.deltaY) / 16 : Math.abs(e.deltaY) / dt
      const t = registerInput(inst, now)
      if (now < lockRef.current) return
      accRef.current += e.deltaY
      if (Math.abs(accRef.current) > 48) {
        const dir = accRef.current > 0 ? 1 : -1
        const steps = Math.min(N - 1, Math.max(1, Math.round(Math.abs(accRef.current) / 190)))
        go(actRef.current + dir * steps, { steps, t })
        accRef.current = 0
        // The lock scales with the same time-scale as the CSS, so a fast
        // scroller isn't rate-limited back to normal pacing by the gate even
        // once the transitions themselves are breezing through. Floor keeps
        // one gesture from firing several acts on an inertial trackpad tail.
        lockRef.current = now + Math.max(120, (steps > 1 ? 400 : 620) * t)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now()
      // Key-repeat while a key is held fires every ~30ms — treat that
      // cadence as scroll velocity too so holding an arrow also compresses.
      const dt = now - lastTsRef.current
      const t = registerInput(dt > 0 && dt < 400 ? 100 / dt : 0, now)
      if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        go(actRef.current + 1, { t })
      }
      if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault()
        go(actRef.current - 1, { t })
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // Multi-touch on touchscreens is intentionally ignored for Lucy zoom and act swipes
        touchYRef.current = null
        return
      }
      touchYRef.current = e.touches[0].clientY
      touchTsRef.current = Date.now()
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchYRef.current == null) return
      const dy = touchYRef.current - e.changedTouches[0].clientY
      const now = Date.now()
      const elapsed = Math.max(16, now - touchTsRef.current)
      const t = registerInput(Math.abs(dy) / elapsed, now)
      if (Math.abs(dy) > 40) {
        const steps = Math.min(N - 1, Math.max(1, Math.round(Math.abs(dy) / 260)))
        go(actRef.current + (dy > 0 ? steps : -steps), { steps, t })
      }
      touchYRef.current = null
    }

    // Prevent Safari desktop full-page zoom on trackpad pinch gestures, leaving touchscreens unaffected
    const onGesture = (e: Event) => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(pointer: fine)').matches &&
        (navigator.maxTouchPoints === 0 || !('ontouchstart' in window))
      ) {
        e.preventDefault()
      }
    }

    const onSetZoom = (e: Event) => {
      const custom = e as CustomEvent<{ zoom: number }>
      if (typeof custom.detail?.zoom === 'number') {
        userZoomRef.current = custom.detail.zoom
        rootRef.current?.style.setProperty('--lucy-user-zoom', custom.detail.zoom.toFixed(4))
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('gesturestart', onGesture, { passive: false })
    window.addEventListener('gesturechange', onGesture, { passive: false })
    window.addEventListener('gestureend', onGesture, { passive: false })
    window.addEventListener('lucy-set-zoom', onSetZoom)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('gesturestart', onGesture)
      window.removeEventListener('gesturechange', onGesture)
      window.removeEventListener('gestureend', onGesture)
      window.removeEventListener('lucy-set-zoom', onSetZoom)
      clearTimeout(flashT1Ref.current)
      clearTimeout(flashT2Ref.current)
      clearTimeout(pinchTimerRef.current)
      clearInterval(glitchIntervalRef.current)
    }
  }, [go, handlePinchZoom, registerInput])

  // Ultra's overdrive: a periodic double-flash (gold sheet → ink sheet) with
  // a small glitch shear on the wordmark, looping while Ultra stays selected.
  useEffect(() => {
    const on = act === N - 1 && LADDER[stop].lane === 'u'
    if (!on || prefersReducedMotion()) {
      setOd(0)
      return undefined
    }
    let t1: ReturnType<typeof setTimeout>
    let t2: ReturnType<typeof setTimeout>
    const interval = setInterval(() => {
      setOd(1)
      t1 = setTimeout(() => setOd(2), 58)
      t2 = setTimeout(() => setOd(0), 124)
    }, 1300)
    return () => {
      clearInterval(interval)
      clearTimeout(t1)
      clearTimeout(t2)
      setOd(0)
    }
  }, [act, stop])

  const v = computeVals({ act, flash, stop, glitch, od }, variant, mobile, viewport)

  const dots = Array.from({ length: N }, (_, i) => ({
    aria: 'Act ' + (i + 1),
    w: i === act ? 26 : 12,
    c: i === act ? v.fg : v.dim,
    // A dot click is a deliberate jump, not a scroll gesture — always run at
    // full pacing regardless of how fast the visitor was just scrolling.
    pick: () => {
      setScale(1)
      go(i)
    },
  }))

  const rungs = LADDER.map((r, i) => {
    const sel = i === stop
    // Diagonal line-art fill (not solid) + a solid single-colour border:
    // zero ink-grey · heaven white + prismatic border · hell black + inverted
    // border (no red) · ultra white + gold border.
    const RUNG_FILL = [HERO.grey, '#FFFFFF', '#FFFFFF', '#0A0A0A', '#0A0A0A', '#0A0A0A', '#FFFFFF']
    const RUNG_BORDER = [HERO.grey, HERO.cyan, HERO.violet, HERO.hellTeal, HERO.hellBlue, HERO.hellAmber, HERO.gold]
    const fill = RUNG_FILL[i]
    const border = RUNG_BORDER[i]
    return {
      label: r.label,
      h: sel ? 38 : 13,
      sel,
      bg: `repeating-linear-gradient(45deg, ${fill} 0 2px, transparent 2px 4px)`,
      line: border,
      op: sel ? 1 : 0.4,
      tone: sel ? border : v.dim,
      pick: () => pickStop(i),
    }
  })

  // Act navigation the surface can drive directly. `enterStory` opens the
  // deprecated-by-default five-act narrative; `enterLadder` returns to the one
  // line, which is where the hero lands (issue #47).
  const enterStory = useCallback(() => {
    resetZoom()
    setScale(1)
    go(0)
  }, [go, resetZoom, setScale])
  const enterLadder = useCallback(() => {
    setScale(1)
    go(N - 1)
  }, [go, setScale])

  return { v, act, actCount: N, dots, rungs, rootRef, enterStory, enterLadder, resetZoom }
}
