import { animate, frame, motionValue, springValue, type AnimationPlaybackControls } from 'motion'
import { SCENE_RUNNING_ATTR, type SceneState } from '../scene'
import { LIGHT, SHARDS, SHARD_DRIFT, SHARD_MOVE, poseTransform, type ShardDef, type ShardPose } from './worlds'

// ─────────────────────────────────────────────────────────────────────────
// The atmosphere conductor. Loaded lazily by LucyAtmosphere, never under
// reduced motion. Owns, for the room only:
//
//   · how each world leaves and arrives (per-layer vector, delay, easing)
//   · the shard field re-organising itself from one world's order to the next
//   · rest drift for the shards, in each world's own direction
//   · pointer depth, as two springs written to CSS custom properties
//   · pausing all of it when the scene says it is not running
//
// Every transition is transform/opacity with a cubic-bezier, so Motion hands
// it to WAAPI and it runs on the compositor — the hero can re-render on its
// glitch clock mid-transition without the room stuttering.
// ─────────────────────────────────────────────────────────────────────────

export interface Conductor {
  go(next: SceneState): void
  destroy(): void
}

const skinFor = (s: SceneState) => (s === 'zero' ? null : s)

const ghostPose = (p: ShardPose): ShardPose => ({
  ...p,
  x: `calc(${p.x} + 0.5vw)`,
  y: `calc(${p.y} + 0.4vh)`,
  rot: p.rot + 1.4,
})

// Motion reads a bare 'none' keyframe as zeros (scale(0)), so a layer's rest
// pose is written as the identity of its own transform list:
// 'scale(0.9) rotate(-24deg)' rests at 'scale(1) rotate(0deg)'.
function identityOf(t: string): string {
  if (t === 'none') return 'none'
  return t.replace(/(\w+)\(([^)]*)\)/g, (_, fn: string) => {
    if (fn.startsWith('scale')) return `${fn}(1)`
    if (fn.startsWith('rotate')) return `${fn}(0deg)`
    if (fn === 'translate') return 'translate(0px, 0px)'
    return `${fn}(0px)`
  })
}

export function createConductor(root: HTMLElement, initial: SceneState): Conductor {
  let state = initial
  let generation = 0
  const scene = root.closest<HTMLElement>(`[${SCENE_RUNNING_ATTR}]`) ?? root
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const layers = Array.from(root.querySelectorAll<HTMLElement>('.la-l'))
  const shardEls = new Map<number, HTMLElement>()
  const ghostEls = new Map<number, HTMLElement>()
  root.querySelectorAll<HTMLElement>('.la-shard').forEach((el) => {
    const id = Number(el.dataset.shard)
    if (el.hasAttribute('data-ghost')) ghostEls.set(id, el)
    else shardEls.set(id, el)
  })
  const drifts = new Map<HTMLElement, AnimationPlaybackControls>()

  // ── Take over from the static CSS: pin every value inline once. ─────────
  const pinRest = (s: SceneState) => {
    for (const el of layers) {
      const on = el.dataset.world === s
      el.style.opacity = on ? '1' : '0'
      el.style.transform = 'none'
      el.toggleAttribute('data-on', on)
    }
    for (const def of SHARDS) {
      const el = shardEls.get(def.id)!
      const pose = def.poses[s]
      el.style.transform = poseTransform(pose)
      el.style.opacity = String(pose.opacity)
      el.querySelectorAll<SVGElement>('.la-skin').forEach((sk) => {
        sk.style.opacity = sk.classList.contains(`la-skin--${skinFor(s)}`) ? '1' : '0'
      })
      const g = ghostEls.get(def.id)
      if (g) {
        g.style.transform = poseTransform(ghostPose(pose))
        g.style.opacity = s === 'hell' ? '0.6' : '0'
      }
    }
  }
  pinRest(state)
  root.dataset.conducted = ''

  // ── Rest drift: each shard alternates between its pose and pose+vector. ─
  const startDrift = (el: HTMLElement, def: ShardDef, pose: ShardPose, s: SceneState, lagS = 0) => {
    drifts.get(el)?.stop()
    drifts.delete(el)
    const d = SHARD_DRIFT[s](def)
    if (!d || reduced()) return
    // Ordered phase: neighbours lead each other slightly, so the field reads
    // as one body moving rather than nine independent wobbles.
    const phase = (def.id * 0.37 + lagS) % 1
    const controls = animate(
      el,
      { transform: [poseTransform(pose), poseTransform(pose, d)] },
      {
        duration: d.period,
        ease: [0.45, 0, 0.55, 1],
        repeat: Infinity,
        repeatType: 'reverse',
        delay: -phase * d.period,
      },
    )
    drifts.set(el, controls)
  }
  const driftAll = (s: SceneState) => {
    for (const def of SHARDS) {
      startDrift(shardEls.get(def.id)!, def, def.poses[s], s)
      const g = ghostEls.get(def.id)
      // The ghost runs the same drift a beat late: temporal disagreement.
      if (g && s === 'hell') startDrift(g, def, ghostPose(def.poses[s]), s, 0.09)
    }
  }
  driftAll(state)

  // ── One state change: the world leaves, the room re-forms, a world arrives.
  const go = (next: SceneState) => {
    if (next === state) return
    const from = state
    state = next
    const gen = ++generation

    // Light: outgoing layers leave along their own world's vector...
    for (const el of layers) {
      const world = el.dataset.world as SceneState
      const spec = LIGHT[world].find((l) => l.name === el.dataset.layer)!
      if (world === from) {
        const leave = spec.to === 'none' ? {} : { transform: [identityOf(spec.to), spec.to] }
        animate(el, { opacity: 0, ...leave }, { duration: spec.exitMs / 1000, ease: [0.5, 0, 0.75, 0] }).then(() => {
          if (state !== world) el.toggleAttribute('data-on', false)
        })
      } else if (world === next) {
        el.toggleAttribute('data-on', true)
        const rest = identityOf(spec.flare?.[0] ?? spec.from)
        const arrive =
          spec.from === 'none' && !spec.flare
            ? {}
            : { transform: spec.flare ? [...spec.flare.slice(0, -1), rest] : [spec.from, rest] }
        animate(
          el,
          { opacity: spec.flare ? [0, 1, 1] : [0, 1], ...arrive },
          { duration: spec.enterMs / 1000, delay: spec.delayMs / 1000, ease: spec.ease },
        )
      }
    }

    // ...while the shared shard field re-organises into the next world's order.
    const move = SHARD_MOVE[next]
    const order = [...SHARDS].sort((a, b) => {
      if (move.order === 'up') return parseFloat(b.poses[next].y) - parseFloat(a.poses[next].y)
      if (move.order === 'out') return Math.abs(parseFloat(a.poses[next].x)) - Math.abs(parseFloat(b.poses[next].x))
      return ((a.id * 7) % 9) - ((b.id * 7) % 9)
    })
    order.forEach((def, rank) => {
      const el = shardEls.get(def.id)!
      drifts.get(el)?.stop()
      drifts.delete(el)
      const pose = def.poses[next]
      // Hell's two halves keep separate clocks, so the split never lands as one.
      const ms = next === 'hell' && def.id > 4 && def.id !== 9 ? move.ms * 1.2 : move.ms
      const delay = (rank * move.stagger) / 1000
      animate(
        el,
        { transform: poseTransform(pose), opacity: pose.opacity },
        { duration: ms / 1000, delay, ease: move.ease },
      ).then(() => {
        if (gen === generation) startDrift(el, def, pose, next)
      })
      // The material changes mid-flight: skin swap lands after the move has begun.
      el.querySelectorAll<SVGElement>('.la-skin').forEach((sk) => {
        const on = sk.classList.contains(`la-skin--${skinFor(next)}`)
        animate(sk, { opacity: on ? 1 : 0 }, { duration: on ? 0.55 : 0.35, delay: on ? delay + (ms / 1000) * 0.25 : delay })
      })
      const g = ghostEls.get(def.id)
      if (g) {
        drifts.get(g)?.stop()
        drifts.delete(g)
        const gp = ghostPose(pose)
        animate(
          g,
          { transform: poseTransform(gp), opacity: next === 'hell' ? 0.6 : 0 },
          // Late by design: the red echo arrives after the plane it belongs to.
          { duration: (ms * 1.15) / 1000, delay: delay + (next === 'hell' ? 0.16 : 0), ease: move.ease },
        ).then(() => {
          if (gen === generation && next === 'hell') startDrift(g, def, gp, next, 0.09)
        })
      }
    })
    // Arriving layers pick up the room's current depth immediately.
    schedule()
  }

  // ── Pointer depth. Normalised, clamped, sprung; never React state. ───────
  // Written straight onto the ~30 planes that carry depth, once per frame in
  // Motion's render step. (Inherited custom properties on the root were the
  // first version: every write restyled all ~100 nodes under it.)
  const tx = motionValue(0)
  const ty = motionValue(0)
  const SPRING = { stiffness: 38, damping: 16, mass: 1, restDelta: 0.002, restSpeed: 0.01 }
  const px = springValue(tx, SPRING)
  const py = springValue(ty, SPRING)
  // The lagging pair: Hell's dissenting layers answer later and softer.
  const LAG = { stiffness: 16, damping: 11, mass: 1.3, restDelta: 0.002, restSpeed: 0.01 }
  const qx = springValue(tx, LAG)
  const qy = springValue(ty, LAG)
  const depthEls = Array.from(root.querySelectorAll<HTMLElement>('.la-l, .la-shard')).map((el) => ({
    el,
    depth: Number(getComputedStyle(el).getPropertyValue('--d')) || 0,
    lag: el.hasAttribute('data-lag'),
    layer: el.classList.contains('la-l'),
  }))
  const flush = () => {
    const [ax, ay, bx, by] = [px.get(), py.get(), qx.get(), qy.get()]
    for (const d of depthEls) {
      if (!d.depth || (d.layer && !d.el.hasAttribute('data-on'))) continue
      const x = (d.lag ? bx : ax) * d.depth * -1.6
      const y = (d.lag ? by : ay) * d.depth * -1.1
      d.el.style.translate = `${x.toFixed(3)}vmin ${y.toFixed(3)}vmin`
    }
  }
  const schedule = () => frame.render(flush)
  const unsubs = [px, py, qx, qy].map((v) => v.on('change', schedule))

  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined
  const fine = window.matchMedia('(pointer: fine)')
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    if (!fine.matches) return
    tx.set(clamp((e.clientX / window.innerWidth - 0.5) * 2))
    ty.set(clamp((e.clientY / window.innerHeight - 0.5) * 2))
  }
  // Touch has no hover: a tap leans the room toward the finger and lets it
  // settle back — a response to a deliberate act, not a following cursor.
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    tx.set(clamp((e.clientX / window.innerWidth - 0.5) * 1.2))
    ty.set(clamp((e.clientY / window.innerHeight - 0.5) * 1.2))
    clearTimeout(nudgeTimer)
    nudgeTimer = setTimeout(() => {
      tx.set(0)
      ty.set(0)
    }, 650)
  }
  const onLeave = () => {
    tx.set(0)
    ty.set(0)
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)

  // ── Lifecycle: freeze in place when the scene is not running. ────────────
  let paused: Animation[] = []
  const syncRunning = () => {
    const running = scene.getAttribute(SCENE_RUNNING_ATTR) !== 'false'
    if (!running && paused.length === 0) {
      paused = root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running')
      paused.forEach((a) => a.pause())
    } else if (running && paused.length) {
      paused.forEach((a) => a.playState === 'paused' && a.play())
      paused = []
    }
  }
  const mo = new MutationObserver(syncRunning)
  mo.observe(scene, { attributes: true, attributeFilter: [SCENE_RUNNING_ATTR] })
  syncRunning()

  return {
    go,
    destroy() {
      generation++
      mo.disconnect()
      clearTimeout(nudgeTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      unsubs.forEach((u) => u())
      ;[px, py, qx, qy, tx, ty].forEach((v) => v.destroy())
      // Cancel what Motion started; the CSS rest loops belong to the static path.
      root.getAnimations({ subtree: true }).forEach((a) => {
        if (!(typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation)) a.cancel()
      })
      drifts.clear()
      // Hand the room back to the static CSS.
      root.querySelectorAll<HTMLElement | SVGElement>('.la-l, .la-shard, .la-skin').forEach((el) => {
        el.style.removeProperty('opacity')
        el.style.removeProperty('transform')
        el.style.removeProperty('translate')
      })
      delete root.dataset.conducted
    },
  }
}
