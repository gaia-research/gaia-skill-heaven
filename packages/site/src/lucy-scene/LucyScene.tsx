import { useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import type { SceneState } from './scene'
import { useSceneLifecycle } from './useSceneLifecycle'

// ─────────────────────────────────────────────────────────────────────────
// LucyScene (#201) — the root both engines hang from.
//
//   <LucyScene state={surface}>
//     <LucyAtmosphere state={surface} />      the room  (Motion / DOM, #201)
//     <LucyLive state={surface}>…</LucyLive>  Lucy      (Rive, #153)
//   </LucyScene>
//
// The scene owns exactly two things and nothing about either engine:
//
//   · the product state, mirrored as `data-scene-state` — read-only, for CSS
//     and tests, never a second source of truth (the hero's product state is
//     still the only one);
//   · the lifecycle signal, `data-scene-running` — one IntersectionObserver
//     plus `visibilitychange` (useSceneLifecycle), no React state. Both engines
//     read that attribute; neither runs its own observers.
//
// Children are siblings, not parent and child: LucyAtmosphere and LucyLive can
// each be omitted, and neither imports or calls the other. Because the signal
// is a DOM attribute, nothing here re-renders at animation-frame frequency.
//
// It renders a plain `div` and forwards every other prop, so the hero's own
// root (positioning, band colours, handlers) is the scene root rather than a
// new wrapper that would change layout.
// ─────────────────────────────────────────────────────────────────────────

export interface LucySceneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  state: SceneState
  /** Hold the scene paused (e.g. while an entrance covers it). */
  held?: boolean
  /** Use a ref the caller already owns as the scene root. */
  rootRef?: RefObject<HTMLDivElement>
  children?: ReactNode
}

export function LucyScene({ state, held = false, rootRef, children, ...rest }: LucySceneProps) {
  const own = useRef<HTMLDivElement>(null)
  const ref = rootRef ?? own
  useSceneLifecycle(ref, held)
  return (
    <div {...rest} ref={ref} data-scene-state={state}>
      {children}
    </div>
  )
}
