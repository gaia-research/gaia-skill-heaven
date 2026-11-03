import type { ReactNode } from 'react'
import type { SceneState } from './scene'

// ─────────────────────────────────────────────────────────────────────────
// LucyLive — the character seam (#153).
//
// Lucy's Rive rig lives in gaia-research/lucy; its combined four-state file is
// imported by scripts/import-lucy-live.mjs into public/lucy-live/ and mounted
// by rive/LucyRiveFigure inside the hero's figure frame, following the Milim
// precedent (gaia-research components/MilimLive.tsx):
//
//   · the static v5 master stays as the poster: no-JS, reduced-motion,
//     load-failure, and lazy-loading surface; the Rive canvas fades in over it
//     after its first frame, and a loading veil sits over it until then
//   · `@rive-app/webgl2` pinned, imported lazily, self-hosted WASM
//   · driven only through the semantic contract below — the site never
//     touches bones, meshes or animation names
//   · reads `data-scene-running` from the scene root for offscreen/hidden
//     pause instead of running its own observers (useSceneLifecycle)
//   · wings are a hero effect layer, not rig-owned (gaia-research/lucy
//     docs/DECISIONS.md); the hero's katana overlay is likewise the hero's
//
// It never reads or calls LucyAtmosphere. Both answer the same product state.
// ─────────────────────────────────────────────────────────────────────────

/** The semantic contract the future Rive adapter implements. Add nothing until the hero needs it. */
export interface LucyCharacter {
  /** Request a state; the rig owns the transition (hair, ribbons, eyes, tear, shards, weapons, near aura). */
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
