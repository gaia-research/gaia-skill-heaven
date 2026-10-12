import type { SceneState } from '../scene'

// ─────────────────────────────────────────────────────────────────────────
// The four worlds, as data. LucyAtmosphere renders the DOM from this once;
// the conductor (Motion) and the static/reduced-motion path both read it, so a
// formation is defined in exactly one place.
//
// Two kinds of actor:
//
//  · LIGHT LAYERS belong to one world. They enter and leave along that world's
//    gravity: Heaven's light falls while its glass rises, Hell's light comes up
//    from the floor, Ultra's flares out of Lucy, Zero's settles.
//
//  · SHARDS are shared. Nine distant glass planes persist across every state
//    and each world re-organises them: an ordered parallel field (Heaven), two
//    groups torn along opposing vectors with a late red ghost (Hell), a sparse
//    crown fanned behind her head (Ultra), and sunk flat into the horizon,
//    invisible, for Zero — which carries no shards (canon).
//
// Positions are offsets from the field origin (50vw, 42vh): x in vw, y in vh,
// except Ultra's crown, which is laid out in vh on both axes so it stays a
// circle on any aspect ratio.
// ─────────────────────────────────────────────────────────────────────────

export interface ShardPose {
  x: string
  y: string
  rot: number
  scale: number
  opacity: number
}

export interface ShardDrift {
  /** Drift vector added at rest, alternating, in the world's own direction. */
  dx: string
  dy: string
  rot: number
  /** Seconds for one leg of the drift. */
  period: number
}

export interface ShardDef {
  id: number
  /** Parallax depth: how far this plane answers the pointer. */
  depth: number
  /** Hell draws a late, spectral-red echo behind a few shards. */
  ghost: boolean
  /** Dropped from the simplified phone composition. */
  desktopOnly: boolean
  poses: Record<SceneState, ShardPose>
}

const crown = (deg: number, r: number, scale: number, opacity: number): ShardPose => {
  const a = (deg * Math.PI) / 180
  return {
    x: `${(Math.sin(a) * r).toFixed(2)}vh`,
    // Crown centre sits 18vh above the field origin: behind her head.
    y: `${(-18 - Math.cos(a) * r).toFixed(2)}vh`,
    rot: deg,
    scale,
    opacity,
  }
}

// Heaven: one shared angle — parallel planes read as order, not symmetry.
const HEAVEN_ROT = 18
// Zero: every plane lies flat on the horizon, below the floor line.
const sunk = (x: number): ShardPose => ({ x: `${x}vw`, y: '52vh', rot: 90, scale: 0.3, opacity: 0 })

export const SHARDS: ShardDef[] = [
  {
    id: 1, depth: 0.55, ghost: true, desktopOnly: true,
    poses: {
      zero: sunk(-30),
      heaven: { x: '-38vw', y: '-24vh', rot: HEAVEN_ROT, scale: 0.62, opacity: 0.7 },
      hell: { x: '-44vw', y: '20vh', rot: 34, scale: 0.66, opacity: 0.85 },
      ultra: crown(-52, 24, 0.9, 0.8),
    },
  },
  {
    id: 2, depth: 0.9, ghost: true, desktopOnly: false,
    poses: {
      zero: sunk(-22),
      heaven: { x: '-30vw', y: '6vh', rot: HEAVEN_ROT, scale: 0.92, opacity: 0.85 },
      hell: { x: '-35vw', y: '-12vh', rot: -26, scale: 0.88, opacity: 0.9 },
      ultra: crown(-34, 23, 1.05, 0.88),
    },
  },
  {
    id: 3, depth: 0.4, ghost: false, desktopOnly: true,
    poses: {
      zero: sunk(-36),
      heaven: { x: '-43vw', y: '25vh', rot: HEAVEN_ROT, scale: 0.48, opacity: 0.55 },
      hell: { x: '-47vw', y: '-30vh', rot: -40, scale: 0.5, opacity: 0.7 },
      ultra: crown(-72, 26, 0.72, 0.62),
    },
  },
  {
    id: 4, depth: 0.35, ghost: false, desktopOnly: true,
    poses: {
      zero: sunk(-12),
      heaven: { x: '-22vw', y: '-35vh', rot: HEAVEN_ROT, scale: 0.42, opacity: 0.5 },
      hell: { x: '-25vw', y: '34vh', rot: 52, scale: 0.46, opacity: 0.65 },
      ultra: crown(-17, 22, 1.0, 0.82),
    },
  },
  {
    id: 5, depth: 0.55, ghost: true, desktopOnly: true,
    poses: {
      zero: sunk(28),
      heaven: { x: '37vw', y: '-22vh', rot: HEAVEN_ROT, scale: 0.6, opacity: 0.7 },
      hell: { x: '43vw', y: '14vh', rot: -32, scale: 0.7, opacity: 0.85 },
      ultra: crown(52, 24, 0.9, 0.8),
    },
  },
  {
    id: 6, depth: 0.9, ghost: true, desktopOnly: false,
    poses: {
      zero: sunk(20),
      heaven: { x: '30vw', y: '9vh', rot: HEAVEN_ROT, scale: 0.94, opacity: 0.85 },
      hell: { x: '36vw', y: '-17vh', rot: 24, scale: 0.9, opacity: 0.9 },
      ultra: crown(34, 23, 1.05, 0.88),
    },
  },
  {
    id: 7, depth: 0.4, ghost: false, desktopOnly: true,
    poses: {
      zero: sunk(36),
      heaven: { x: '43vw', y: '23vh', rot: HEAVEN_ROT, scale: 0.5, opacity: 0.55 },
      hell: { x: '46vw', y: '-33vh', rot: 44, scale: 0.48, opacity: 0.7 },
      ultra: crown(72, 26, 0.72, 0.62),
    },
  },
  {
    id: 8, depth: 0.35, ghost: false, desktopOnly: true,
    poses: {
      zero: sunk(12),
      heaven: { x: '22vw', y: '-37vh', rot: HEAVEN_ROT, scale: 0.44, opacity: 0.5 },
      hell: { x: '24vw', y: '33vh', rot: -50, scale: 0.44, opacity: 0.65 },
      ultra: crown(17, 22, 1.0, 0.82),
    },
  },
  {
    id: 9, depth: 0.25, ghost: false, desktopOnly: false,
    poses: {
      zero: sunk(0),
      heaven: { x: '-2vw', y: '-42vh', rot: HEAVEN_ROT, scale: 0.34, opacity: 0.45 },
      // Inverted: what hung above her head now lies under her feet, mostly lost.
      hell: { x: '3vw', y: '50vh', rot: 180 + HEAVEN_ROT, scale: 0.4, opacity: 0.5 },
      ultra: crown(0, 21, 1.12, 0.95),
    },
  },
]

/** How each world keeps its shards moving once they arrive. */
export const SHARD_DRIFT: Record<SceneState, (s: ShardDef) => ShardDrift | null> = {
  zero: () => null,
  // Coherent: the whole field rises together, one tempo, ordered phase.
  heaven: () => ({ dx: '0vw', dy: '-2.4vh', rot: 0, period: 11 }),
  // Two groups on opposing vectors at mismatched tempos — they never resync.
  hell: (s) =>
    s.id <= 4 || s.id === 9
      ? { dx: '-1.1vw', dy: '1.6vh', rot: -2.5, period: 8.5 }
      : { dx: '1.1vw', dy: '-1.6vh', rot: 2.5, period: 9.7 },
  // The crown breathes outward from its centre.
  ultra: () => ({ dx: '0vh', dy: '-1.1vh', rot: 0, period: 6.5 }),
}

export function poseTransform(p: ShardPose, extra?: { dx: string; dy: string; rot: number }): string {
  const x = extra ? `calc(${p.x} + ${extra.dx})` : p.x
  const y = extra ? `calc(${p.y} + ${extra.dy})` : p.y
  return `translate(${x}, ${y}) rotate(${(p.rot + (extra?.rot ?? 0)).toFixed(2)}deg) scale(${p.scale})`
}

// ─────────────────────────────────────────────────────────────────────────
// Light layers. `from` is where a layer enters from, `to` where it leaves to;
// both are transforms relative to its resting place. Exits are always faster
// than entrances.
// ─────────────────────────────────────────────────────────────────────────

export type Ease = [number, number, number, number]
export const EASE_ARRIVE: Ease = [0.16, 1, 0.3, 1]
export const EASE_LEAVE: Ease = [0.5, 0, 0.75, 0]
export const EASE_SETTLE: Ease = [0.33, 0, 0.15, 1]
export const EASE_FALL: Ease = [0.55, 0, 0.85, 0.35]

export interface LightLayer {
  name: string
  /** Parallax depth; negative answers the pointer backwards (Hell). */
  depth: number
  /** 'lag' layers follow a slower spring — the world disagreeing with itself. */
  lag?: boolean
  desktopOnly?: boolean
  from: string
  to: string
  enterMs: number
  delayMs: number
  ease: Ease
  exitMs: number
  /** Optional keyframed entrance (e.g. Ultra's bloom flare), replaces from→rest. */
  flare?: string[]
}

export const LIGHT: Record<SceneState, LightLayer[]> = {
  zero: [
    { name: 'vignette', depth: 0, from: 'none', to: 'none', enterMs: 1400, delayMs: 0, ease: EASE_SETTLE, exitMs: 500 },
    { name: 'bloom', depth: 0.3, from: 'scale(0.94)', to: 'scale(1.03)', enterMs: 1700, delayMs: 220, ease: EASE_SETTLE, exitMs: 450 },
    { name: 'column', depth: 0.5, from: 'translateY(-3vh)', to: 'translateY(2vh)', enterMs: 1600, delayMs: 380, ease: EASE_SETTLE, exitMs: 420 },
    { name: 'horizon', depth: 0.9, from: 'translateY(4vh)', to: 'translateY(3vh)', enterMs: 1500, delayMs: 120, ease: EASE_SETTLE, exitMs: 420 },
  ],
  heaven: [
    { name: 'bloom', depth: 0.3, from: 'scale(0.82)', to: 'scale(1.12)', enterMs: 1300, delayMs: 60, ease: EASE_ARRIVE, exitMs: 420 },
    { name: 'corona', depth: 0.4, from: 'scale(0.9) rotate(-24deg)', to: 'scale(1.08) rotate(10deg)', enterMs: 1600, delayMs: 140, ease: EASE_ARRIVE, exitMs: 460 },
    // Light falls in from above and keeps falling on its way out.
    { name: 'shafts', depth: 0.7, desktopOnly: false, from: 'translateY(-14vh)', to: 'translateY(12vh)', enterMs: 1150, delayMs: 220, ease: EASE_ARRIVE, exitMs: 380 },
  ],
  hell: [
    // Light rises from the floor: gravity inverted.
    { name: 'underlight', depth: -0.4, from: 'translateY(12vh) scaleY(0.7)', to: 'translateY(9vh)', enterMs: 950, delayMs: 60, ease: EASE_ARRIVE, exitMs: 360 },
    // Two rings that refuse to agree: opposite spins, mismatched arrival.
    { name: 'ring-a', depth: -0.5, from: 'rotate(34deg) scale(1.06)', to: 'rotate(-30deg) scale(1.1)', enterMs: 700, delayMs: 40, ease: EASE_ARRIVE, exitMs: 340 },
    { name: 'ring-b', depth: 0.6, lag: true, from: 'rotate(-48deg) scale(0.94)', to: 'rotate(40deg) scale(0.9)', enterMs: 1250, delayMs: 260, ease: EASE_ARRIVE, exitMs: 340 },
    { name: 'slips', depth: -0.9, from: 'scaleX(0.35)', to: 'scaleX(1.4)', enterMs: 620, delayMs: 160, ease: EASE_ARRIVE, exitMs: 300 },
  ],
  ultra: [
    // Lucy lights the room: the bloom flares out of her, overshoots, settles.
    {
      name: 'bloom', depth: 0.3, from: 'scale(0.6)', to: 'scale(0.72)', enterMs: 1500, delayMs: 120, ease: EASE_ARRIVE, exitMs: 480,
      flare: ['scale(0.55)', 'scale(1.09)', 'scale(1)'],
    },
    { name: 'interference', depth: 0.45, desktopOnly: true, from: 'scale(0.86) rotate(-8deg)', to: 'scale(0.8)', enterMs: 1700, delayMs: 320, ease: EASE_ARRIVE, exitMs: 400 },
    { name: 'sweep', depth: 1.4, from: 'none', to: 'none', enterMs: 400, delayMs: 0, ease: EASE_ARRIVE, exitMs: 300 },
  ],
}

/** Shard choreography when arriving in a world. */
export const SHARD_MOVE: Record<SceneState, { ms: number; ease: Ease; stagger: number; order: 'up' | 'out' | 'scatter' }> = {
  // Gravity returns: the planes accelerate down into the horizon.
  zero: { ms: 1050, ease: EASE_FALL, stagger: 28, order: 'scatter' },
  // Rise into the lattice, lowest first.
  heaven: { ms: 1350, ease: EASE_ARRIVE, stagger: 45, order: 'up' },
  // Torn apart from the centre outwards; each half keeps its own clock.
  hell: { ms: 900, ease: [0.7, 0, 0.18, 1], stagger: 34, order: 'out' },
  // The crown assembles from its centre spire outwards.
  ultra: { ms: 1250, ease: EASE_ARRIVE, stagger: 50, order: 'out' },
}
