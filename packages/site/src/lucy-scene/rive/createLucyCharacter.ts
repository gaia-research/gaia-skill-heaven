// The Rive adapter behind LucyLive (#153): implements the semantic
// LucyCharacter contract over Lucy's combined .riv. The site never touches
// bones, meshes or animation names; it requests a state and the rig owns the
// transition. Loaded lazily (this module is dynamically imported), WASM
// self-hosted.
//
// Load order (owner, 2026-11-03 / 2026-11-04):
//   · Heaven is the out-of-the-box state, so Heaven's images are embedded in
//     the file. Every other state's images are referenced sidecars.
//   · Going to Ultra is an instinct, so Ultra must be switchable about one
//     second after Heaven appears. Its sidecars are fetched in parallel from
//     the moment the figure file is requested (not after the first frame), in
//     two tiers: the CORE tier (body, aura, hair, eyes, tear: she is on screen)
//     makes the state switchable; the EFFECTS tier (haze, arcs, glints, energy)
//     binds as it lands and simply appears. Hell and Zero follow.
//   · The figure file is fetched here with byte progress and handed to the
//     runtime as a buffer, so the entrance can show honest progress.
//   · Decodes are spread across frames so the first frames never stall.
//
// Rive supports all of this natively: every referenced image is its own
// ImageAsset, setRenderImage may be called at any time, and a layer without an
// image draws nothing until it arrives. If a future export changes the layer
// names so the tiers cannot be classified, the whole state loads as one tier
// (the owner's stated fallback); nothing guesses.
import { Alignment, Fit, Layout, Rive, RuntimeLoader, decodeImage, type ImageAsset } from '@rive-app/webgl2'
import riveWasmUrl from '@rive-app/webgl2/rive.wasm?url'
import type { LucyCharacter } from '../LucyLive'
import type { SceneState } from '../scene'
import { LUCY_LIVE } from './lucyLiveManifest'
import { createPredecoded, createPredecoder, type Predecoded } from './predecoded'

RuntimeLoader.setWasmUrl(riveWasmUrl)

export type LucyLoadStage = 'figure' | 'first-frame' | 'ultra' | 'hell' | 'zero' | 'done'

export interface LucyLoadProgress {
  /** Bytes received over bytes expected: the figure file plus every sidecar. */
  received: number
  total: number
  stage: LucyLoadStage
  /** The figure file is parsed and Heaven has drawn its first frame. */
  firstFrame: boolean
  /** A switch to this state shows the figure (its core tier is bound). */
  ready: Record<SceneState, boolean>
  /** Every layer of this state is bound (effects included). */
  full: Record<SceneState, boolean>
}

export interface LucyRiveCharacter extends LucyCharacter {
  /** Resolves once this state is switchable (immediately for Heaven). */
  ready(state: SceneState): Promise<void>
  isReady(state: SceneState): boolean
}

export interface LucyRiveOptions {
  /** URL prefix for files under public/ (import.meta.env.BASE_URL). */
  base: string
  onFirstFrame(): void
  onError(error: unknown): void
  onProgress?(p: LucyLoadProgress): void
}

const MAX_DPR = 2
/** Sidecar fetches in flight at once (HTTP/2 multiplexes; this bounds memory). */
const IN_FLIGHT = 8
/** Decode budget per frame before yielding, ms. */
const DECODE_BUDGET = 8

/** The tiers. A state with no entry loads as one tier. */
const CORE: Partial<Record<SceneState, RegExp>> = {
  ultra: /^ultra-(body|aura|hair|eye|tear)/,
}
/** Fetch order after the figure file: the owner's instinct first. */
const SIDECAR_ORDER = ['ultra', 'hell', 'zero'] as const satisfies readonly SceneState[]

type Tier = 'core' | 'effects'
interface Sidecar { name: string; state: SceneState; tier: Tier; bytes: number; url: string }

/** Classify every sidecar in the manifest into (state, tier), biggest first inside a tier. */
export function planSidecars(base: string): Sidecar[] {
  const out: Sidecar[] = []
  for (const [name, file] of Object.entries(LUCY_LIVE.sidecars)) {
    const state = name.split('-')[0] as SceneState
    const core = CORE[state]
    const tier: Tier = core ? (core.test(name) ? 'core' : 'effects') : 'core'
    out.push({ name, state, tier, bytes: (LUCY_LIVE.sidecarBytes as Record<string, number>)[name] ?? 0, url: base + LUCY_LIVE.assets + file })
  }
  const rank = (s: Sidecar) => (SIDECAR_ORDER as readonly SceneState[]).indexOf(s.state) * 2 + (s.tier === 'core' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || b.bytes - a.bytes)
}

/** Fetch a URL with byte progress. */
async function fetchWithProgress(url: string, signal: AbortSignal, priority: 'high' | 'low', onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url, { signal, priority } as RequestInit)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    onBytes(buf.byteLength)
    return buf
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    onBytes(value.byteLength)
  }
  const buf = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { buf.set(c, o); o += c.byteLength }
  return buf
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function createLucyCharacter(
  canvas: HTMLCanvasElement,
  initial: SceneState,
  opts: LucyRiveOptions,
): LucyRiveCharacter {
  const abort = new AbortController()
  const plan = planSidecars(opts.base)
  const total = LUCY_LIVE.bytes + plan.reduce((a, s) => a + s.bytes, 0)
  const counted = new Map<string, number>()  // bytes received per file (idempotent on retry)
  let received = 0
  const addBytes = (key: string, n: number) => {
    counted.set(key, (counted.get(key) ?? 0) + n)
    received = Math.min(total, received + n)
  }

  const assets = new Map<string, ImageAsset>()      // referenced images, by name, once the file has loaded
  const buffers = new Map<string, Uint8Array>()     // sidecar bytes that arrived before the file loaded
  const bound = new Set<string>()                   // sidecars decoded and handed to the rig
  const bitmaps = new Map<string, Promise<ImageBitmap | null>>() // off-thread decodes, started as bytes land
  const predecoder = createPredecoder()
  const need = { core: new Map<SceneState, Set<string>>(), all: new Map<SceneState, Set<string>>() }
  for (const s of plan) {
    if (!need.all.has(s.state)) { need.all.set(s.state, new Set()); need.core.set(s.state, new Set()) }
    need.all.get(s.state)!.add(s.name)
    if (s.tier === 'core') need.core.get(s.state)!.add(s.name)
  }
  const isBound = (set: Set<string> | undefined) => !set || [...set].every((n) => bound.has(n))
  const stateReady = (s: SceneState) => (LUCY_LIVE.states[s].eager ? true : isBound(need.core.get(s)))
  const stateFull = (s: SceneState) => (LUCY_LIVE.states[s].eager ? true : isBound(need.all.get(s)))

  let destroyed = false
  let loaded = false
  let firstFrame = false
  let wanted: SceneState = initial

  const stage = (): LucyLoadStage => {
    if (!loaded) return 'figure'
    if (!firstFrame) return 'first-frame'
    for (const s of SIDECAR_ORDER) if (!stateFull(s)) return s
    return 'done'
  }
  const report = () => {
    if (destroyed || !opts.onProgress) return
    const ready = {} as Record<SceneState, boolean>, full = {} as Record<SceneState, boolean>
    for (const s of ['zero', 'heaven', 'hell', 'ultra'] as SceneState[]) { ready[s] = stateReady(s); full[s] = stateFull(s) }
    opts.onProgress({ received, total, stage: stage(), firstFrame, ready, full })
  }

  // ── decode queue: one image at a time, yielding to the frame when over budget
  const decodeQueue: Sidecar[] = []
  let predecoded: Predecoded | null = null
  let draining = false
  const drain = async () => {
    if (draining) return
    draining = true
    let t0 = performance.now()
    while (decodeQueue.length && !destroyed) {
      const s = decodeQueue.shift()!
      const asset = assets.get(s.name), buf = buffers.get(s.name)
      if (!asset || !buf) continue
      try {
        const before = predecoded?.mark()
        const image = await decodeImage(buf)
        if (destroyed) { image.unref(); break }
        // The runtime would decode these pixels synchronously on the first
        // frame that draws this state; hand it the worker's copy instead when
        // it lands (predecoded.ts). Binding never waits for it.
        const key = predecoded && before ? predecoded.track(before) : null
        const pixels = bitmaps.get(s.name)
        bitmaps.delete(s.name)
        void pixels?.then((b) => {
          if (!b) return
          if (!destroyed && predecoded && key !== null) predecoded.supply(key, b)
          else b.close()
        })
        asset.setRenderImage(image)
        image.unref()
        buffers.delete(s.name)
        bound.add(s.name)
        report()
      } catch (e) {
        opts.onError(e)
      }
      if (performance.now() - t0 > DECODE_BUDGET) { await nextFrame(); t0 = performance.now() }
    }
    draining = false
  }
  const tryBind = (s: Sidecar) => {
    if (loaded && assets.has(s.name) && buffers.has(s.name) && !bound.has(s.name)) { decodeQueue.push(s); void drain() }
  }

  // ── sidecar fetch scheduler: bounded parallelism, in plan order, from t0.
  // Low priority while the figure file is in flight (Heaven first), high after.
  let cursor = 0
  let active = 0
  const pump = () => {
    while (active < IN_FLIGHT && cursor < plan.length && !destroyed) {
      const s = plan[cursor++]
      active++
      const key = `sidecar:${s.name}`
      const already = counted.get(key) ?? 0
      fetchWithProgress(s.url, abort.signal, loaded ? 'high' : 'low', (n) => { if (already === 0) addBytes(key, n); report() })
        .then((buf) => {
          if (destroyed) return
          buffers.set(s.name, buf)
          if (!bitmaps.has(s.name)) bitmaps.set(s.name, predecoder.decode(buf))
          tryBind(s)
        })
        .catch((e) => { if (!destroyed && !abort.signal.aborted) opts.onError(e) })
        .finally(() => { active--; pump() })
    }
  }

  // ── the figure file, with byte progress, then the runtime
  let r: Rive | null = null
  const start = async () => {
    pump()
    let buf: Uint8Array
    try {
      buf = await fetchWithProgress(opts.base + LUCY_LIVE.riv, abort.signal, 'high', (n) => { addBytes('riv', n); report() })
    } catch (e) {
      if (!destroyed && !abort.signal.aborted) opts.onError(e)
      return
    }
    if (destroyed) return
    r = new Rive({
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      canvas,
      artboard: 'Lucy',
      stateMachines: 'Lucy',
      autoplay: true,
      autoBind: true,
      layout: new Layout({ fit: Fit.Fill, alignment: Alignment.TopLeft }),
      // referenced (lazy) images arrive with no bytes: keep the asset handle so
      // its sidecar can be bound whenever it lands
      assetLoader: (asset, bytes) => {
        if (!asset.isImage || bytes.length > 0) return false
        assets.set(asset.name, asset as ImageAsset)
        return true
      },
      onLoad: () => {
        if (destroyed || !r) return
        loaded = true
        r.resizeDrawingSurfaceToCanvas(Math.min(MAX_DPR, window.devicePixelRatio || 1))
        applyState()
        RuntimeLoader.getInstance((rt) => {
          if (!destroyed && !predecoded) predecoded = createPredecoded(rt, canvas)
        })
        // this runtime build keeps its images elsewhere: stop decoding for nothing
        if (!predecoded) predecoder.destroy()
        // anything that landed before the file parsed binds now
        for (const s of plan) tryBind(s)
        // two frames so the first real draw has landed before the poster lets go
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (destroyed) return
            firstFrame = true
            report()
            opts.onFirstFrame()
          }),
        )
      },
      onLoadError: (e) => opts.onError(e),
    })
  }

  const applyState = () => {
    const prop = r?.viewModelInstance?.enum('state')
    if (prop && prop.value !== wanted) prop.value = wanted
  }

  void start()

  return {
    state(next) {
      wanted = next
      if (loaded && stateReady(next)) applyState()
    },
    ready(s) {
      return new Promise((res, rej) => {
        const tick = () => (destroyed ? rej(new Error('destroyed')) : loaded && stateReady(s) ? res() : setTimeout(tick, 50))
        tick()
      })
    },
    isReady(s) {
      return loaded && stateReady(s)
    },
    look() {
      // Deliberately a no-op: the shipped rig has no gaze to drive. Probed with
      // scripts/inspect-rig.mjs (lucy-live/012bd2c6ea, @rive-app/webgl2 2.43.1):
      // five artboards, ZERO state-machine inputs, one view model ("Lucy") whose
      // only property is the enum `state`. A scene-level transform on the canvas
      // would shift the whole body, which is a second parallax and not a gaze (and
      // #203 forbids a cursor-following character), so nothing stands in for it.
      // The rig change that unblocks this is in gaia-research/lucy: view-model
      // number properties `gazeX` and `gazeY` (-1..1) blended into the eye/pupil
      // and a small head turn, with a hold at 0. Then: map target to those two
      // properties here, skip it under reduced motion and while
      // data-scene-running is false, and cap the resulting travel at
      // GAZE_BUDGET_VMIN (pointer.ts).
    },
    setRunning(running) {
      if (!loaded || !r) return
      if (running) r.play()
      else r.pause()
    },
    resize() {
      if (loaded) r?.resizeDrawingSurfaceToCanvas(Math.min(MAX_DPR, window.devicePixelRatio || 1))
    },
    destroy() {
      destroyed = true
      abort.abort()
      predecoder.destroy()
      for (const p of bitmaps.values()) void p.then((b) => b?.close())
      bitmaps.clear()
      predecoded?.destroy()
      predecoded = null
      r?.cleanup()
      r = null
    },
  }
}
