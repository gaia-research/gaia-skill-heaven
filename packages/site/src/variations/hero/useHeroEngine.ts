import { useCallback, useEffect, useRef, useState } from 'react'

// Shared state machine behind VariationHeroA / VariationHeroB. Both routes
// render the same 5-act, wheel/keyboard/touch-driven scrollytelling engine
// and the same 7-rung risk ladder (OFF..MAX, plus the sealed ULTRA overdrive
// lane past the firebreak) — they differ only in layout (Reredos vs
// Guillotine), so the machine lives here once.

const ACT_LABEL = ['CLEAN SLATE', 'SUMMON', 'SLASH', 'BREAK LOOSE', 'ENTER']
const ACT_SUB = ['nothing installed', '/skill-heaven', '—', '/skill-hell · gated', 'one axis']
const CAM = [0, 180, 340, 430, 120]
const P = 1200
const N = 5

// Real perspective parallax: one camera push, per-layer depth.
const mag = (d: number, camZ: number) => ((P - d) / (P - d - camZ)).toFixed(4)

export type Lane = 'h' | 'x' | 'u'

// The posture ladder. Off/Low/Med run the Heaven palette; High→Max are the
// Hell lane (gated, P2); Ultra is Hell in overdrive, past the token-ceiling
// firebreak — always shown sealed, never an activator.
export const LADDER: { label: string; lane: Lane; note: string }[] = [
  { label: 'OFF', lane: 'h', note: 'floor · no skills, no door' },
  { label: 'LOW', lane: 'h', note: 'curated · only what you summon' },
  { label: 'MED', lane: 'h', note: 'native · your harness as shipped' },
  { label: 'HIGH', lane: 'x', note: 'hell · more surface, priced honestly' },
  { label: 'XHIGH', lane: 'x', note: 'hell · fleets and long loops' },
  { label: 'MAX', lane: 'x', note: 'hell · every good skill in the tree' },
  { label: 'ULTRA', lane: 'u', note: 'overdrive · past the firebreak' },
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
  // Below act 5 the act owns the palette; at act 5 the ladder does.
  const hell = act >= 3 && !(act === N - 1 && lane === 'h')
  const camZ = CAM[act]

  const bg = hell ? '#FFFFFF' : '#000000'
  const fg = hell ? '#0A0A0A' : '#EDEDEA'
  const dim = hell ? 'rgba(10,10,10,.48)' : 'rgba(237,237,234,.46)'

  const pick = <T,>(arr: T[]) => arr[act]

  return {
    bg,
    fg,
    dim,
    hair: hell ? 'rgba(10,10,10,.10)' : 'rgba(237,237,234,.09)',
    hair2: hell ? 'rgba(10,10,10,.22)' : 'rgba(237,237,234,.22)',
    stripe: hell ? 'rgba(10,10,10,.09)' : 'rgba(237,237,234,.09)',
    chromeBg: hell ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.5)',

    mType: mag(0, camZ),
    mLucy: mag(-260, camZ),
    mWing: mag(-420, camZ),
    mGround: mag(-700, camZ),
    mBlade: mag(120, camZ),

    oHeaven: pick([1, 1, 1, 0, 0]),
    oHeavenSm: act === N - 1 && !hell ? 1 : 0,
    oHeavenB: act < 3 ? 1 : act === N - 1 && !hell ? 1 : 0,
    mHeavenB: act === N - 1 ? (Number(mag(0, camZ)) * 0.62).toFixed(4) : mag(0, camZ),
    heavenYB: act === N - 1 ? -11 : pick([0, -1, -2, 0, 0]),
    oUltra: act === N - 1 && lane === 'u' ? 1 : 0,
    glitchX: glitch === 1 ? -11 : glitch === 2 ? 8 : od === 1 ? -7 : od === 2 ? 5 : 0,
    glitchSkew: glitch === 1 ? -2.4 : glitch === 2 ? 1.6 : od === 1 ? -1.6 : od === 2 ? 1.1 : 0,
    oScan: glitch ? 0.5 : od ? 0.34 : 0,
    odSheet: od === 1 ? '#C81E1E' : od === 2 ? '#FFFFFF' : 'transparent',
    odWedge: od === 1 ? '#FFFFFF' : '#C81E1E',
    odOp: od ? (od === 1 ? 0.88 : 1) : 0,
    oSplit: pick([0, 0, 1, 0, 0]),
    splitX: pick([0, 0, 34, 90, 90]),
    oHell: act === 3 || (act === N - 1 && hell) ? 1 : 0,
    hellScale: pick([1.25, 1.25, 1.25, 1, 0.62]),
    hellY: 0,
    hellYB: pick([0, 0, 0, 0, -11]),
    typeUp: pick([0, 0, 0, 0, 28]),
    oWing: pick([0.5, 0.34, 0.14, 0, 0]),
    oGround: pick([0.55, 0.45, 0.3, 0.2, 0.14]),
    oHalo: pick([0.5, 0.34, 0.14, 0, 0]),
    haloRot: pick([0, -3, -7, -12, -12]),
    lucyY: pick([0, -1.5, -3, 0, 12]),
    lucyXB: pick([0, -1, -2, 1, 6]),
    lucyBlend: hell ? ('multiply' as const) : ('screen' as const),
    lucyFilter: hell ? 'invert(1) hue-rotate(180deg) saturate(1.3) contrast(1.06)' : 'contrast(1.04) saturate(1.05)',
    oTears: pick([0, 0, 0, 1, 0.22]),
    oLucy: pick([1, 1, 1, 1, 0.14]),

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

    stopNote: LADDER[stop].note + (LADDER[stop].lane === 'h' ? '' : ' · GATED'),
    noteTone: lane === 'u' ? '#C81E1E' : dim,
    ctaLabel:
      LADDER[stop].lane === 'h' ? 'ENTER SKILL HEAVEN' : LADDER[stop].lane === 'x' ? 'HELL · LOCKED DOOR' : 'OVERDRIVE · SEALED',
    ctaBg: lane === 'h' ? fg : 'transparent',
    ctaFg: lane === 'h' ? bg : lane === 'u' ? '#C81E1E' : fg,
    ctaLine: lane === 'u' ? '#C81E1E' : fg,
  }
}

export type HeroVals = ReturnType<typeof computeVals>

// `variant` is fixed per route (Hero A = 'a', Hero B = 'b') — each is its own
// switcher entry now, so unlike the source design tool there is no in-page
// A/B toggle to reproduce.
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
  const glitchIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const flashT1Ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flashT2Ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    document.body.classList.add('vh-hero-page')
    return () => document.body.classList.remove('vh-hero-page')
  }, [])

  const go = useCallback((n: number) => {
    const nextAct = Math.max(0, Math.min(N - 1, n))
    const from = actRef.current
    if (nextAct === from) return
    const crossing = (from < 3 && nextAct >= 3) || (from >= 3 && nextAct < 3)
    // Scrolling into ENTER arrives in Hell — the ladder's High rung, not Off.
    if (nextAct === N - 1 && from < N - 1 && LADDER[stopRef.current].lane === 'h') {
      setStop(3)
    }
    if (crossing && !prefersReducedMotion()) {
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
  // so it gets the same violence as the scroll-driven impact frame.
  const pickStop = useCallback((i: number) => {
    const wasHeaven = LADDER[stopRef.current].lane === 'h'
    const isHeaven = LADDER[i].lane === 'h'
    const crossing = actRef.current === N - 1 && wasHeaven !== isHeaven
    setStop(i)
    if (!crossing || prefersReducedMotion()) return
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
  }, [])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now < lockRef.current) return
      accRef.current += e.deltaY
      if (Math.abs(accRef.current) > 48) {
        const dir = accRef.current > 0 ? 1 : -1
        const steps = Math.min(N - 1, Math.max(1, Math.round(Math.abs(accRef.current) / 190)))
        go(actRef.current + dir * steps)
        accRef.current = 0
        lockRef.current = now + (steps > 1 ? 400 : 620)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        go(actRef.current + 1)
      }
      if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault()
        go(actRef.current - 1)
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      touchYRef.current = e.touches[0].clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchYRef.current == null) return
      const dy = touchYRef.current - e.changedTouches[0].clientY
      if (Math.abs(dy) > 40) {
        const steps = Math.min(N - 1, Math.max(1, Math.round(Math.abs(dy) / 260)))
        go(actRef.current + (dy > 0 ? steps : -steps))
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
  }, [go])

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
    pick: () => go(i),
  }))

  const rungs = LADDER.map((r, i) => {
    const sel = i === stop
    const ink = r.lane === 'u' ? '#C81E1E' : '#0A0A0A'
    return {
      label: r.label,
      h: sel ? 38 : 13,
      // Only the rung that is becoming selected eases its height; every other
      // rung snaps back to 13px in the same commit that moves the label and the
      // CTA note. See the note on `.vha-rung` in variation-hero.css.
      sel,
      bg: r.lane === 'h' ? '#0A0A0A' : sel ? 'repeating-linear-gradient(135deg,' + ink + ' 0 2px,#FFFFFF 2px 5px)' : '#FFFFFF',
      line: r.lane === 'h' ? '#FFFFFF' : ink,
      op: sel ? 1 : 0.42,
      tone: sel ? (r.lane === 'u' ? '#C81E1E' : v.fg) : v.dim,
      pick: () => pickStop(i),
    }
  })

  return { v, dots, rungs }
}
