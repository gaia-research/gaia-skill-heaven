// Pointer-depth budget for the room (#203). Pure, so it is unit-testable
// without a browser and importable without pulling Motion into the main chunk.
//
// Lucy's own gaze (`LucyCharacter.look`, normalised -1..1) is the loudest
// thing the pointer is allowed to move. The room must never look more alive
// than she does, so its travel is capped below the gaze budget and every
// plane's offset is clamped to that cap, whatever depth a layer declares.
//
// PROVISIONAL: `look()` has no gaze rig yet (createLucyCharacter.ts), so
// GAZE_BUDGET_VMIN is a design budget, not a measured Rive displacement.
// Re-derive it from the rig when the gaze lands; the tests pin the ratio.

/** Travel the character's gaze is budgeted to use at full deflection, in vmin. */
export const GAZE_BUDGET_VMIN = 2
/** The room's hard ceiling per plane: a fixed share of the gaze budget. */
export const ATMOSPHERE_MAX_VMIN = GAZE_BUDGET_VMIN * 0.6
/** Horizontal and vertical travel per unit depth at full pointer deflection. */
export const POINTER_X_VMIN = 1.6
export const POINTER_Y_VMIN = 1.1

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))

/** Normalise a client coordinate to -1..1 across the viewport, clamped. */
export const normalise = (client: number, extent: number, gain = 2) =>
  clamp(extent > 0 ? (client / extent - 0.5) * gain : 0, 1)

/** One plane's offset on one axis, in vmin, never beyond the room's ceiling. */
export function depthOffset(norm: number, depth: number, axis: 'x' | 'y'): number {
  const k = axis === 'x' ? POINTER_X_VMIN : POINTER_Y_VMIN
  return clamp(norm * depth * -k, ATMOSPHERE_MAX_VMIN)
}
