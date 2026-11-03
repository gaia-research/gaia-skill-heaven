import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { SCENE_RUNNING_ATTR, type SceneState } from '../scene'
import type { LucyRiveCharacter } from './createLucyCharacter'
import { LUCY_LIVE } from './lucyLiveManifest'
import './lucyRive.css'

// ─────────────────────────────────────────────────────────────────────────
// LucyRiveFigure — the live Rive character, laid over the static master the
// hero already frames (#153).
//
//  · It sits inside the hero's figure container, in a box the exact size of
//    the current master <img>, and takes the same transform, origin, blend,
//    filter and opacity. The site's per-state framing (zoom, offsets, face
//    anchor) therefore applies unchanged. The canvas is registered onto that
//    box from the manifest: each state's master rectangle inside the combined
//    root artboard.
//  · The master stays the poster: no-JS, reduced motion, WebGL failure, and
//    while a lazy state's images are still arriving. `onShowing` tells the
//    hero which state the canvas is showing, so it can let that poster go.
//  · While the file loads, a quiet loading veil sits over the poster.
//  · Pauses through `data-scene-running` on the scene root (useSceneLifecycle);
//    it runs no observers of its own for visibility.
// ─────────────────────────────────────────────────────────────────────────

export interface LucyRiveFigureProps {
  state: SceneState
  /** The same style the hero puts on the current master <img>. */
  figureStyle: CSSProperties
  /** Which state the canvas is showing (null: show the poster). */
  onShowing(state: SceneState | null): void
}

type Phase = 'loading' | 'live' | 'poster'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function LucyRiveFigure({ state, figureStyle, onShowing }: LucyRiveFigureProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const charRef = useRef<LucyRiveCharacter | null>(null)
  const stateRef = useRef(state)
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? 'poster' : 'loading'))
  const [showing, setShowing] = useState<SceneState | null>(null)
  stateRef.current = state

  // mount the character once (lazy import keeps the runtime out of first paint)
  useEffect(() => {
    if (phase === 'poster') return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let cancelled = false
    import('./createLucyCharacter')
      .then(({ createLucyCharacter }) => {
        if (cancelled) return
        charRef.current = createLucyCharacter(canvas, stateRef.current, {
          base: import.meta.env.BASE_URL,
          onFirstFrame: () => {
            if (cancelled) return
            setPhase('live')
            setShowing(stateRef.current)
          },
          onError: (e) => {
            console.warn('[LucyLive] staying on the static master:', e)
            if (!cancelled) setPhase('poster')
          },
        })
      })
      .catch((e) => {
        console.warn('[LucyLive] runtime failed to load:', e)
        if (!cancelled) setPhase('poster')
      })
    return () => {
      cancelled = true
      charRef.current?.destroy()
      charRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // a product state change: switch now if that state is in the file, else
  // show its poster until its images arrive, then switch
  useEffect(() => {
    const ch = charRef.current
    if (phase !== 'live' || !ch) return undefined
    if (ch.isReady(state)) {
      ch.state(state)
      setShowing(state)
      return undefined
    }
    setShowing(null)
    let stale = false
    ch.ready(state)
      .then(() => {
        if (stale || stateRef.current !== state) return
        ch.state(state)
        setShowing(state)
      })
      .catch(() => setPhase('poster'))
    return () => {
      stale = true
    }
  }, [state, phase])

  useEffect(() => {
    onShowing(phase === 'live' ? showing : null)
  }, [phase, showing, onShowing])

  // pause offscreen / hidden tab: read the scene root's lifecycle attribute
  useEffect(() => {
    const root = boxRef.current?.closest(`[${SCENE_RUNNING_ATTR}]`)
    if (!root || phase !== 'live') return undefined
    const sync = () => charRef.current?.setRunning(root.getAttribute(SCENE_RUNNING_ATTR) !== 'false')
    const mo = new MutationObserver(sync)
    mo.observe(root, { attributes: true, attributeFilter: [SCENE_RUNNING_ATTR] })
    sync()
    return () => mo.disconnect()
  }, [phase])

  // keep the drawing surface matched to the rendered size
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => charRef.current?.resize())
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  if (phase === 'poster') return null

  // register the combined root artboard onto the current master's box
  const rect = LUCY_LIVE.states[state]
  const { w: RW, h: RH } = LUCY_LIVE.root
  const canvasStyle: CSSProperties = {
    position: 'absolute',
    left: `${(-rect.x / rect.w) * 100}%`,
    top: `${(-rect.y / rect.h) * 100}%`,
    width: `${(RW / rect.w) * 100}%`,
    height: `${(RH / rect.h) * 100}%`,
    opacity: phase === 'live' && showing === state ? 1 : 0,
    transition: 'opacity 320ms linear',
  }

  return (
    <div
      ref={boxRef}
      className="lucy-rive"
      style={{ ...figureStyle, position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <canvas ref={canvasRef} style={canvasStyle} aria-hidden="true" />
      {phase === 'loading' && (
        <div className="lucy-rive__loading" role="status" aria-live="polite">
          <span className="lucy-rive__bar" />
          <span className="lucy-rive__label">Summoning Lucy</span>
        </div>
      )}
    </div>
  )
}
