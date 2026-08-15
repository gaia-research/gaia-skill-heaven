import { useCallback, useEffect, useRef, useState } from 'react'

// Shared state machine behind VariationHeroA / VariationHeroB. Both routes
// render the same 5-act, wheel/keyboard/touch-driven scrollytelling engine
// and the same 7-rung risk ladder (OFF..MAX, plus the sealed ULTRA overdrive
// lane past the firebreak) — they differ only in layout (Reredos vs
// Guillotine), so the machine lives here once.

const ACT_LABEL = ['CLEAN SLATE', 'SUMMON', 'SLASH', 'BREAK LOOSE', 'ENTER']
const ACT_SUB = ['nothing installed', '/skill-heaven', '—', '/skill-hell', 'one line']
const CAM = [0, 180, 340, 430, 120]
const P = 1200
const N = 5

// Real perspective parallax: one camera push, per-layer depth.
const mag = (d: number, camZ: number) => ((P - d) / (P - d - camZ)).toFixed(4)

export type Lane = 'z' | 'h' | 'x' | 'u'

// The one line (N13). A single ladder — off·low·med·high·xhigh·max·ultra —
// whose four surfaces are contiguous BANDS read from the current rung:
//   ZERO (off)            → lane 'z'  the floor, ships /summon, none automated
//   LOW·MED              → lane 'h'  Skill Heaven · converge
//   HIGH·XHIGH·MAX       → lane 'x'  Skill Hell · explore
//   ULTRA                → lane 'u'  Skill Ultra · the crown rung / controller
// Nothing here refuses: every rung is reachable, none gated or sealed (N13).
export const LADDER: { label: string; lane: Lane; note: string }[] = [
  { label: 'ZERO', lane: 'z', note: 'zero · the floor — ships /summon, none of it automated' },
  { label: 'LOW', lane: 'h', note: 'heaven · converge — the tightest useful reach' },
  { label: 'MED', lane: 'h', note: 'heaven · converge — a second opinion in context' },
  { label: 'HIGH', lane: 'x', note: 'hell · explore — the working default' },
  { label: 'XHIGH', lane: 'x', note: 'hell · explore — a wider net' },
  { label: 'MAX', lane: 'x', note: 'hell · explore — the widest reach' },
  { label: 'ULTRA', lane: 'u', note: 'ultra · the controller picks direction + depth for you' },
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

type EngineState = {
  act: number
  flash: 0 | 1 | 2
  stop: number
  glitch: 0 | 1 | 2
  od: 0 | 1 | 2
}

// Pure translation of state -> every derived style value. Nothing here
// mutates state; `variant` only steers the two style knobs (cut angle, CTA
// alignment) that differ between the Reredos and Guillotine layouts.
function computeVals(state: EngineState, variant: 'a' | 'b') {
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
    scene === 'ultra' ? ('ultra' as const) : scene === 'hell' ? ('hell' as const) : ('heaven' as const)
  const camZ = CAM[act]

  // Four bands, four palettes (N13 motif):
  //   zero   — zen washed monochrome; ink grey is the darkest tone, never black
  //   heaven — the full PRISMATIC spectrum on deep ground
  //   hell   — the INVERTED spectrum on paper; it reads red because that is what
  //            the prism becomes when inverted
  //   ultra  — heaven with a GOLD highlight laid over it and a red edge: the
  //            final form, not flat gold
  const PAL = {
    zero: { bg: '#E7E5E0', fg: '#3A383C', dim: 'rgba(58,56,60,.5)', hair: 'rgba(58,56,60,.08)', hair2: 'rgba(58,56,60,.2)' },
    heaven: { bg: '#000000', fg: '#EDEDEA', dim: 'rgba(237,237,234,.46)', hair: 'rgba(237,237,234,.09)', hair2: 'rgba(237,237,234,.22)' },
    hell: { bg: '#F4F2EE', fg: '#0A0A0A', dim: 'rgba(10,10,10,.48)', hair: 'rgba(10,10,10,.10)', hair2: 'rgba(10,10,10,.22)' },
    ultra: { bg: '#080604', fg: '#F2E4C0', dim: 'rgba(242,228,192,.5)', hair: 'rgba(242,228,192,.08)', hair2: 'rgba(217,178,92,.32)' },
  } as const
  const P0 = PAL[scene]
  const bg = P0.bg
  const fg = P0.fg
  const dim = P0.dim

  // Wordmark fill per band. Heaven = prismatic; Hell = inverted-spectrum red;
  // Ultra = gold-lit prism with a red edge; Zero = flat ink, so it stays zen.
  const PRISM = 'linear-gradient(92deg,#ff4d7d,#ff9d3b,#ffe14d,#5fe08a,#4db8ff,#9b6bff,#ff5bd0)'
  const PRISM_HELL = 'linear-gradient(92deg,#00b49a,#d94a2a,#e0662a,#c43020,#b2231f,#c40030,#a3104a)'
  const GOLD = 'linear-gradient(92deg,#ffe6a3,#e0b25c,#fff0c4,#d9b25c,#c8102e,#f0d089)'
  const wordGrad = scene === 'heaven' ? PRISM : scene === 'hell' ? PRISM_HELL : scene === 'ultra' ? GOLD : 'none'

  const pick = <T,>(arr: T[]) => arr[act]

  return {
    bg,
    fg,
    dim,
    lucyState,
    scene,
    wordGrad,
    hair: P0.hair,
    hair2: P0.hair2,
    stripe: P0.hair,
    chromeBg: scene === 'hell' || scene === 'zero' ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.5)',

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
    odSheet: od === 1 ? '#C81E1E' : od === 2 ? '#D9B25C' : 'transparent',
    odWedge: od === 1 ? '#D9B25C' : '#C81E1E',
    odOp: od ? (od === 1 ? 0.88 : 1) : 0,
    oSplit: pick([0, 0, 1, 0, 0]),
    splitX: pick([0, 0, 34, 90, 90]),
    oHell: act === 3 || (act === N - 1 && hell) ? 1 : 0,
    hellScale: pick([1.25, 1.25, 1.25, 1, 0.62]),
    hellY: 0,
    hellYB: pick([0, 0, 0, 0, -11]),
    typeUp: pick([0, 0, 0, 0, 28]),
    oGround: pick([0.55, 0.45, 0.3, 0.2, 0.14]),
    oHalo: pick([0.5, 0.34, 0.14, 0, 0]),
    haloRot: pick([0, -3, -7, -12, -12]),
    lucyY: pick([0, -1.5, -3, 0, 12]),
    lucyXB: pick([0, -1, -2, 1, 6]),
    lucyBlend: 'normal' as const,
    lucyFilter:
      scene === 'zero'
        ? 'grayscale(1) contrast(0.94) brightness(1.05)'
        : scene === 'ultra'
          ? 'saturate(1.06) brightness(1.03) drop-shadow(0 0 26px rgba(217,178,92,0.42))'
          : 'none',
    oLucy: pick([1, 1, 1, 1, 0.88]),

    oBlade: pick([0, 1, 0.9, 0, 0]),
    bladeX: pick([-58, -14, 46, 120, 120]),
    bladeXB: pick([-62, -18, 40, 110, 110]),

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
    noteTone: lane === 'u' ? '#D9B25C' : dim,
    ctaLabel:
      lane === 'z'
        ? 'START CLEAN · SKILL ZERO'
        : lane === 'h'
          ? 'ENTER SKILL HEAVEN'
          : lane === 'x'
            ? 'ENTER SKILL HELL'
            : 'LET ULTRA DECIDE',
    ctaBg: lane === 'u' ? '#0A0A0A' : lane === 'z' ? 'transparent' : fg,
    ctaFg: lane === 'u' ? '#D9B25C' : lane === 'z' ? fg : bg,
    ctaLine: lane === 'u' ? '#C81E1E' : fg,
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
  const [act, setAct] = useState(0)
  const [flash, setFlash] = useState<0 | 1 | 2>(0)
  const [stop, setStop] = useState(3)
  const [glitch, setGlitch] = useState<0 | 1 | 2>(0)
  const [od, setOd] = useState<0 | 1 | 2>(0)

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
    const nextAct = Math.max(0, Math.min(N - 1, n))
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
      const changed = i !== stopRef.current
      setStop(i)
      // Frontload the impact: EVERY step along the one line fires the same slice
      // the heaven→hell crossing used to own, so the CTA and the palette glitch
      // into existence on each switch off→ultra (owner, N13 hero).
      if (!changed || actRef.current !== N - 1 || prefersReducedMotion()) return
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

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      clearTimeout(flashT1Ref.current)
      clearTimeout(flashT2Ref.current)
      clearInterval(glitchIntervalRef.current)
    }
  }, [go, registerInput])

  // Ultra's overdrive: a periodic double-flash (red sheet → white sheet) with
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

  const v = computeVals({ act, flash, stop, glitch, od }, variant)

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
    // Bar fill carries the band identity, readable on either a dark or a paper
    // page since the ladder shows at every scene: zero grey, heaven prismatic,
    // hell inverted-red, ultra gold (hatched red when live).
    const PRISM_BAR = 'linear-gradient(180deg,#ff4d7d,#ffe14d,#5fe08a,#4db8ff,#9b6bff)'
    const bg =
      r.lane === 'z'
        ? '#9a98a0'
        : r.lane === 'h'
          ? PRISM_BAR
          : r.lane === 'x'
            ? sel
              ? 'repeating-linear-gradient(135deg,#c43020 0 2px,#f4f2ee 2px 5px)'
              : '#c43020'
            : sel
              ? 'repeating-linear-gradient(135deg,#d9b25c 0 2px,#c81e1e 2px 5px)'
              : '#d9b25c'
    const accent =
      r.lane === 'z' ? '#57555b' : r.lane === 'x' ? '#c43020' : r.lane === 'u' ? '#d9b25c' : '#8ea6ff'
    return {
      label: r.label,
      h: sel ? 38 : 13,
      // Only the rung that is becoming selected eases its height; every other
      // rung snaps back to 13px in the same commit that moves the label and the
      // CTA note. See the note on `.vha-rung` in variation-hero.css.
      sel,
      bg,
      line: accent,
      op: sel ? 1 : 0.42,
      tone: sel ? accent : v.dim,
      pick: () => pickStop(i),
    }
  })

  return { v, dots, rungs, rootRef }
}
