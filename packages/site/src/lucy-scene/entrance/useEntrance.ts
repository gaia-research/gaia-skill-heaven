import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucyLoadProgress } from '../rive/createLucyCharacter'

// ─────────────────────────────────────────────────────────────────────────
// useEntrance — the readiness contract behind the entrance (the loading
// screen in front of Hero A while the live figure arrives).
//
// READY ⇔ fonts loaded ∧ the figure file parsed and Heaven's first frame drawn
//         ∧ Ultra's core tier bound (going to Ultra is an instinct; the
//           effects may follow) ∧ the Heaven master decoded (Skip must be
//           instant) ∧ two consecutive frames under budget.
//
// Rules (owner, design campaign 2026-11-04):
//   · warm cache: READY within 300 ms of mount → the entrance never paints
//   · otherwise it holds one beat (420 ms) after READY so the cut is a cut
//   · ceiling: after 20 s the status says Skip opens the still figure
//   · nothing auto-skips; the visitor chose to wait
//   · Skip and a failure both hand the session to the static masters
// ─────────────────────────────────────────────────────────────────────────

export type EntrancePhase = 'pending' | 'loading' | 'ready' | 'failed' | 'done'

export const ENTRANCE_TIMING = {
  /** READY before this and the entrance never paints. */
  warm: 300,
  /** The beat between READY and the cut. */
  hold: 420,
  /** Once painted, the entrance stays at least this long, so a warm visit reads as a title card, not a flicker. */
  minVisible: 700,
  /** The house impact frame. */
  impact: 46,
  /** After this the status line points at Skip. */
  ceiling: 20_000,
  /** A frame longer than this is not "settled". */
  frameBudget: 25,
  /** Give up waiting for settled frames after this (slow devices still enter). */
  settleTimeout: 1500,
} as const

export interface EntranceOptions {
  /** The live path is on; otherwise the entrance never shows. */
  enabled: boolean
  progress: LucyLoadProgress | null
  /** The figure cannot run here (reported by LucyRiveFigure). */
  failed: boolean
  /** The Heaven master has decoded (Skip is instant). */
  posterReady: boolean
  /** The entrance is leaving (after the impact frame): mount/let the hero run. */
  onCut(kind: 'live' | 'static'): void
}

export interface EntranceState {
  phase: EntrancePhase
  /** The entrance is on screen (loading, ready, failed, or mid-cut). */
  visible: boolean
  /** The impact frame is playing. */
  impact: boolean
  /** Past the ceiling. */
  late: boolean
  skip(): void
}

function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  return document.fonts.ready.then(() => undefined)
}

/** Resolves after two consecutive frames under budget, or after the timeout. */
function settled(): Promise<void> {
  return new Promise((res) => {
    let last = performance.now()
    let good = 0
    const t0 = last
    const tick = (now: number) => {
      good = now - last < ENTRANCE_TIMING.frameBudget ? good + 1 : 0
      last = now
      if (good >= 2 || now - t0 > ENTRANCE_TIMING.settleTimeout) res()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export function useEntrance({ enabled, progress, failed, posterReady, onCut }: EntranceOptions): EntranceState {
  const [phase, setPhase] = useState<EntrancePhase>(enabled ? 'pending' : 'done')
  const [impact, setImpact] = useState(false)
  const [late, setLate] = useState(false)
  const [fonts, setFonts] = useState(false)
  const mountedAt = useRef(performance.now())
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const onCutRef = useRef(onCut)
  onCutRef.current = onCut

  useEffect(() => {
    let on = true
    void fontsReady().then(() => on && setFonts(true))
    return () => {
      on = false
    }
  }, [])

  // pending → loading after the warm window, unless READY came first
  const paintedAt = useRef(0)
  useEffect(() => {
    if (phase !== 'pending') return undefined
    const t = window.setTimeout(() => {
      paintedAt.current = performance.now()
      setPhase((p) => (p === 'pending' ? 'loading' : p))
    }, ENTRANCE_TIMING.warm)
    return () => window.clearTimeout(t)
  }, [phase])

  // the ceiling
  useEffect(() => {
    if (phase !== 'loading') return undefined
    const t = window.setTimeout(() => setLate(true), ENTRANCE_TIMING.ceiling - (performance.now() - mountedAt.current))
    return () => window.clearTimeout(t)
  }, [phase])

  const cut = useCallback((kind: 'live' | 'static') => {
    if (phaseRef.current === 'done') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const finish = () => {
      setImpact(false)
      setPhase('done')
      onCutRef.current(kind)
    }
    if (reduced || phaseRef.current === 'pending') {
      finish()
      return
    }
    setImpact(true)
    window.setTimeout(finish, ENTRANCE_TIMING.impact)
  }, [])

  // failure, and back to loading on a retry (the hero remounts the figure)
  useEffect(() => {
    if (failed) setPhase((p) => (p === 'done' ? p : 'failed'))
    else setPhase((p) => (p === 'failed' ? 'loading' : p))
  }, [failed])

  // READY → hold → cut
  const ready = !!progress && progress.firstFrame && progress.ready.ultra && posterReady && fonts
  useEffect(() => {
    if (!ready) return undefined
    if (phaseRef.current !== 'pending' && phaseRef.current !== 'loading') return undefined
    let on = true
    void settled().then(() => {
      if (!on) return
      if (phaseRef.current === 'pending') {
        // warm cache: never painted
        cut('live')
        return
      }
      setPhase('ready')
      const shown = performance.now() - paintedAt.current
      const hold = Math.max(ENTRANCE_TIMING.hold, ENTRANCE_TIMING.minVisible - shown)
      window.setTimeout(() => on && cut('live'), hold)
    })
    return () => {
      on = false
    }
  }, [ready, cut])

  const skip = useCallback(() => cut('static'), [cut])

  return {
    phase,
    visible: phase === 'loading' || phase === 'ready' || phase === 'failed',
    impact,
    late,
    skip,
  }
}
