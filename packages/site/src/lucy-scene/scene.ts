// The Lucy Scene contract (#200). One product state drives two independent
// motion systems:
//
//   LucyLive        (Rive, #153)        — Lucy and everything attached to her
//   LucyAtmosphere  (Motion/DOM, #201)  — the room around her
//
// Neither imports or calls the other. Both read the same product state and the
// same scene-level lifecycle signal from the scene root, and nothing else.
//
// Boundary: if an effect moves because Lucy moved, it belongs in Rive; if it
// moves because the world moved, it belongs in the atmosphere.

export type SceneState = 'zero' | 'heaven' | 'hell' | 'ultra'

export const SCENE_STATES: readonly SceneState[] = ['zero', 'heaven', 'hell', 'ultra']

/**
 * Shared timing, so the two engines can be designed together without either
 * one knowing the other exists. Every value is measured from the moment the
 * product state changes. The hero's impact frame (flash + glitch) covers the
 * first ~150ms; the character settles by ~900ms; the room keeps moving for a
 * beat after her, because the room is heavier than she is.
 */
export const SCENE_TIMING = {
  /** The impact frame owned by the hero (flash + glitch shear). */
  impact: 150,
  /** Target length of Lucy's own state transition (today: the figure's CSS transform). */
  character: 900,
  /** The atmosphere's longest choreographed layer, start to rest. */
  world: 1700,
} as const

/** Attribute the scene root carries; `"false"` means offscreen or tab hidden. */
export const SCENE_RUNNING_ATTR = 'data-scene-running'
