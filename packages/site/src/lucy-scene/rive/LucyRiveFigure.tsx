import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { SCENE_RUNNING_ATTR, type SceneState } from '../scene'
import type { LucyLoadProgress, LucyRiveCharacter } from './createLucyCharacter'
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
//  · Owner: one Lucy per session, never both. The hero shows the static
//    masters only under reduced motion, after Skip on the entrance, or for the
//    rest of the session once this reports `onFailed` (no WebGL2, download or
//    runtime failure). It then unmounts this component. While Lucy is live no
//    master shows: not under the canvas, not during transitions, not while a
//    state loads. A switch to a state whose images are still arriving keeps
//    the current state on screen until they land.
//  · Progress (bytes, stage, per-state readiness) is reported upward so the
//    entrance can show it; the small veil here only serves `?entrance=off`.
//  · Pauses through `data-scene-running` on the scene root (useSceneLifecycle);
//    it runs no observers of its own for visibility.
// ─────────────────────────────────────────────────────────────────────────

export interface LucyRiveFigureProps {
  state: SceneState
  /** The same style the hero puts on the current master <img>. */
  figureStyle: CSSProperties
  /** Rive cannot run in this session: the hero switches to the static masters for good. */
  onFailed(): void
  /** Byte and readiness progress, for the entrance. */
  onProgress?(p: LucyLoadProgress): void
  /** Show the small in-figure veil while loading (only when no entrance covers the page). */
  veil?: boolean
}

/** WebGL2 preflight: without it the session goes straight to the masters. */
export function canRenderRive(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

type Phase = 'loading' | 'live' | 'failed'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function LucyRiveFigure({ state, figureStyle, onFailed, onProgress, veil }: LucyRiveFigureProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const charRef = useRef<LucyRiveCharacter | null>(null)
  const stateRef = useRef(state)
  const progressRef = useRef(onProgress)
  const [phase, setPhase] = useState<Phase>(() => (canRenderRive() ? 'loading' : 'failed'))
  const [showing, setShowing] = useState<SceneState | null>(null)
  stateRef.current = state
  progressRef.current = onProgress

  // mount the character once (lazy import keeps the runtime out of first paint)
  useEffect(() => {
    if (phase === 'failed') return undefined
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
            console.warn('[LucyLive] Rive failed; static masters for this session:', e)
            if (!cancelled) setPhase('failed')
          },
          onProgress: (p) => {
            if (!cancelled) progressRef.current?.(p)
          },
        })
      })
      .catch((e) => {
        console.warn('[LucyLive] runtime failed to load; static masters for this session:', e)
        if (!cancelled) setPhase('failed')
      })
    return () => {
      cancelled = true
      charRef.current?.destroy()
      charRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // a product state change: switch now if that state is switchable, else
  // keep the current state on screen until its core images arrive, then switch
  useEffect(() => {
    const ch = charRef.current
    if (phase !== 'live' || !ch) return undefined
    if (ch.isReady(state)) {
      ch.state(state)
      setShowing(state)
      return undefined
    }
    let stale = false
    ch.ready(state)
      .then(() => {
        if (stale || stateRef.current !== state) return
        ch.state(state)
        setShowing(state)
      })
      .catch(() => setPhase('failed'))
    return () => {
      stale = true
    }
  }, [state, phase])

  useEffect(() => {
    if (phase === 'failed') onFailed()
  }, [phase, onFailed])

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

  if (phase === 'failed') return null

  // register the combined root artboard onto the box of the state on screen
  const rect = LUCY_LIVE.states[showing ?? state]
  const { w: RW, h: RH } = LUCY_LIVE.root
  const canvasStyle: CSSProperties = {
    position: 'absolute',
    left: `${(-rect.x / rect.w) * 100}%`,
    top: `${(-rect.y / rect.h) * 100}%`,
    width: `${(RW / rect.w) * 100}%`,
    height: `${(RH / rect.h) * 100}%`,
    opacity: phase === 'live' ? 1 : 0,
    transition: 'opacity 320ms linear',
  }

  return (
    <div
      ref={boxRef}
      className="lucy-rive"
      style={{ ...figureStyle, position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <canvas ref={canvasRef} style={canvasStyle} aria-hidden="true" />
      {phase === 'loading' && veil && (
        <div className="lucy-rive__loading" role="status" aria-live="polite">
          <span className="lucy-rive__bar" />
          <span className="lucy-rive__label">Preparing the figure</span>
        </div>
      )}
    </div>
  )
}
