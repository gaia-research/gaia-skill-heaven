import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { SCENE_STATES, type SceneState } from '../scene'
import { LIGHT, SHARDS, poseTransform, type ShardDef, type ShardPose } from './worlds'
import type { Conductor } from './conductor'
import './atmosphere.css'

// ─────────────────────────────────────────────────────────────────────────
// LucyAtmosphere (#200–#205) — the room around Lucy.
//
// React renders this DOM once. After that the atmosphere is driven
// imperatively, so a state change or a pointer move never re-renders the hero:
//
//  · Static path (always available; the only path under reduced motion):
//    CSS keyed on `data-state` / `data-shards` paints each world at rest, and
//    a state change is a short opacity exchange. Motion is never loaded.
//  · Conductor path: `conductor.ts` is imported after first paint and takes
//    over — authored per-layer transitions, the shared shard field
//    re-organising itself, rest drift, and pointer depth (all via Motion,
//    WAAPI-accelerated transform/opacity).
//
// Knows nothing about Lucy. Lucy knows nothing about it.
// ─────────────────────────────────────────────────────────────────────────

const ghostPose = (p: ShardPose, on: boolean): ShardPose => ({
  ...p,
  x: `calc(${p.x} + 0.5vw)`,
  y: `calc(${p.y} + 0.4vh)`,
  rot: p.rot + 1.4,
  opacity: on ? 0.6 : 0,
})

function shardVars(s: ShardDef, ghost: boolean): CSSProperties {
  const vars: Record<string, string | number> = { '--d': s.depth }
  for (const st of SCENE_STATES) {
    const pose = ghost ? ghostPose(s.poses[st], st === 'hell') : s.poses[st]
    vars[`--t-${st}`] = poseTransform(pose)
    vars[`--o-${st}`] = pose.opacity
  }
  return vars as CSSProperties
}

// One crystalline plane, drawn once per skin. preserveAspectRatio="none" lets
// CSS size it; strokes stay hairline at any scale.
const SHARD_POINTS = '50,0 96,72 66,420 30,334 4,112'
function ShardSvg({ skin }: { skin: 'heaven' | 'hell' | 'ghost' | 'ultra' }) {
  return (
    <svg className={`la-skin la-skin--${skin}`} viewBox="0 0 100 420" preserveAspectRatio="none">
      <polygon points={SHARD_POINTS} fill={skin === 'ghost' ? 'none' : `url(#la-fill-${skin})`} />
      <polygon className="la-skin__edge" points={SHARD_POINTS} fill="none" vectorEffect="non-scaling-stroke" />
      {skin !== 'ghost' && <polyline className="la-skin__facet" points="50,0 54,250 66,420" fill="none" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function layerChildren(world: SceneState, name: string) {
  if (world === 'heaven' && name === 'shafts') {
    return [0, 1, 2, 3, 4].map((i) => (
      <span key={i} className={`la-shaft la-shaft--${i}`}>
        <i />
      </span>
    ))
  }
  if (world === 'hell' && name === 'slips') {
    return [0, 1, 2].map((i) => (
      <span key={i} className={`la-slip la-slip--${i}`}>
        <i className="la-slip__ink" />
        <i className="la-slip__red" />
      </span>
    ))
  }
  if (world === 'ultra' && name === 'interference') {
    return (
      <>
        <i className="la-rings la-rings--a" />
        <i className="la-rings la-rings--b" />
      </>
    )
  }
  if (world === 'zero' && name === 'horizon') {
    return (
      <>
        <i />
        <b className="la-horizon-line" />
      </>
    )
  }
  return <i />
}

export interface LucyAtmosphereProps {
  state: SceneState
}

export const LucyAtmosphere = memo(function LucyAtmosphere({ state }: LucyAtmosphereProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const conductorRef = useRef<Conductor | null>(null)
  const stateRef = useRef(state)
  const firstRef = useRef(true)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Static path: mark which world's rest loops run. Under reduced motion the
  // CSS removes the loops anyway; the attribute only says which world is home.
  const applyStatic = (root: HTMLElement, next: SceneState) => {
    root.querySelectorAll<HTMLElement>('[data-world]').forEach((el) => {
      el.toggleAttribute('data-on', el.dataset.world === next)
    })
    // The shard field cannot crossfade with itself, so it dips, re-forms
    // while invisible, and comes back — a bounded exchange, never a slide.
    const field = root.querySelector<HTMLElement>('.la-field')
    if (!field || root.dataset.shards === next) return
    if (firstRef.current) {
      root.dataset.shards = next
      return
    }
    field.style.opacity = '0'
    clearTimeout(swapTimerRef.current)
    swapTimerRef.current = setTimeout(() => {
      root.dataset.shards = next
      field.style.opacity = ''
    }, 220)
  }

  useLayoutEffect(() => {
    if (rootRef.current) applyStatic(rootRef.current, state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the conductor after first paint, never under reduced motion.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === 'undefined' || !window.matchMedia) return undefined
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    let cancelled = false

    const boot = () => {
      if (rm.matches || conductorRef.current) return
      void import('./conductor').then(({ createConductor }) => {
        if (cancelled || rm.matches || conductorRef.current) return
        clearTimeout(swapTimerRef.current)
        const field = root.querySelector<HTMLElement>('.la-field')
        if (field) field.style.opacity = ''
        root.dataset.shards = stateRef.current
        conductorRef.current = createConductor(root, stateRef.current)
      }).catch(() => {
        // A failed chunk leaves the static rooms in charge; nothing to undo.
      })
    }
    const onRm = () => {
      if (rm.matches) {
        conductorRef.current?.destroy()
        conductorRef.current = null
        root.dataset.shards = stateRef.current
        applyStatic(root, stateRef.current)
      } else {
        boot()
      }
    }

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    const handle = idle ? idle(boot, { timeout: 600 }) : window.setTimeout(boot, 120)
    rm.addEventListener?.('change', onRm)
    return () => {
      cancelled = true
      if (!idle) clearTimeout(handle)
      rm.removeEventListener?.('change', onRm)
      clearTimeout(swapTimerRef.current)
      conductorRef.current?.destroy()
      conductorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    stateRef.current = state
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    const root = rootRef.current
    if (!root) return
    if (conductorRef.current) conductorRef.current.go(state)
    else applyStatic(root, state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div ref={rootRef} className="la" data-state={state} aria-hidden="true">
      <svg className="la-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="la-fill-heaven" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#eaf7ff" stopOpacity="0.62" />
            <stop offset="0.38" stopColor="#7cc4ff" stopOpacity="0.26" />
            <stop offset="0.75" stopColor="#a58ae0" stopOpacity="0.1" />
            <stop offset="1" stopColor="#a58ae0" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="la-fill-hell" x1="0" y1="1" x2="0.3" y2="0">
            <stop offset="0" stopColor="#a03d29" stopOpacity="0.28" />
            <stop offset="0.5" stopColor="#833b00" stopOpacity="0.1" />
            <stop offset="1" stopColor="#0a0a0a" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="la-fill-ultra" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="#fff6d6" stopOpacity="0.8" />
            <stop offset="0.35" stopColor="#ffd24a" stopOpacity="0.38" />
            <stop offset="0.8" stopColor="#c8801c" stopOpacity="0.08" />
            <stop offset="1" stopColor="#b8741c" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {SCENE_STATES.flatMap((world) =>
        LIGHT[world].map((l) => (
          <div
            key={`${world}-${l.name}`}
            className={`la-l la-l--${world} la-l--${world}-${l.name}`}
            data-world={world}
            data-layer={l.name}
            data-lag={l.lag ? '' : undefined}
            data-desktop-only={l.desktopOnly ? '' : undefined}
            style={{ '--d': l.depth } as CSSProperties}
          >
            {layerChildren(world, l.name)}
          </div>
        )),
      )}

      <div className="la-field">
        {SHARDS.filter((s) => s.ghost).map((s) => (
          <div
            key={`g${s.id}`}
            className="la-shard la-shard--ghost"
            data-shard={s.id}
            data-ghost=""
            data-lag=""
            data-desktop-only={s.desktopOnly ? '' : undefined}
            style={shardVars(s, true)}
          >
            <ShardSvg skin="ghost" />
          </div>
        ))}
        {SHARDS.map((s) => (
          <div
            key={s.id}
            className="la-shard"
            data-shard={s.id}
            data-desktop-only={s.desktopOnly ? '' : undefined}
            style={shardVars(s, false)}
          >
            <ShardSvg skin="heaven" />
            <ShardSvg skin="hell" />
            <ShardSvg skin="ultra" />
          </div>
        ))}
      </div>
    </div>
  )
})
