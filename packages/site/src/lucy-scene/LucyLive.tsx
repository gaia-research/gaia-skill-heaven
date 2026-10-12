import type { ReactNode } from 'react'
import type { SceneState } from './scene'

// ─────────────────────────────────────────────────────────────────────────
// LucyLive — the character seam (#153).
//
// Lucy's Rive rig does not exist yet. Today this slot holds the approved
// static v5 figure, unchanged. When the rig lands it mounts here, following
// the Milim precedent (gaia-research components/MilimLive.tsx):
//
//   · the static figure stays as the poster: no-JS, reduced-motion and
//     load-failure surface; the Rive canvas fades in over it after first frame
//   · `@rive-app/webgl2` pinned, imported lazily, self-hosted WASM
//   · driven only through the semantic contract below — the site never
//     touches bones, meshes or animation names
//   · reads `data-scene-running` from the scene root for offscreen/hidden
//     pause instead of running its own observers (useSceneLifecycle)
//
// It never reads or calls LucyAtmosphere. Both answer the same product state.
// ─────────────────────────────────────────────────────────────────────────

/** The semantic contract the future Rive adapter implements. Add nothing until the hero needs it. */
export interface LucyCharacter {
  /** Request a state; the rig owns the transition (hair gravity, ribbons, eyes, tear, wings, weapons, near aura). */
  state(next: SceneState): void
  /** Restrained gaze/head response, normalised -1..1. Atmosphere parallax stays smaller than this. */
  look(target: { x: number; y: number }): void
  setRunning(running: boolean): void
  resize(): void
  destroy(): void
}

export interface LucyLiveProps {
  state: SceneState
  /** Review switch: render the scene without the character. */
  hidden?: boolean
  /** Today's implementation: the static figure the hero already composes. */
  children: ReactNode
}

export function LucyLive({ state, hidden, children }: LucyLiveProps) {
  if (hidden) return null
  return (
    <div className="lucy-live" data-lucy-state={state} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
