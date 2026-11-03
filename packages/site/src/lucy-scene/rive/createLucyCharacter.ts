// The Rive adapter behind LucyLive (#153): implements the semantic
// LucyCharacter contract over Lucy's combined .riv. The site never touches
// bones, meshes or animation names; it requests a state and the rig owns the
// transition. Loaded lazily (this module is dynamically imported), WASM
// self-hosted.
//
// Load order (owner, 2026-11-03): Heaven is the out-of-the-box state, so
// Heaven's images are embedded in the file. Every other state's images are
// referenced sidecars, fetched once the first frame is up. A switch to a state
// that is still loading waits for its images (`ready(state)`).
import { Alignment, Fit, Layout, Rive, RuntimeLoader, decodeImage, type ImageAsset } from '@rive-app/webgl2'
import riveWasmUrl from '@rive-app/webgl2/rive.wasm?url'
import type { LucyCharacter } from '../LucyLive'
import type { SceneState } from '../scene'
import { LUCY_LIVE } from './lucyLiveManifest'

RuntimeLoader.setWasmUrl(riveWasmUrl)

export interface LucyRiveCharacter extends LucyCharacter {
  /** Resolves once this state's images are in the file (immediately for Heaven). */
  ready(state: SceneState): Promise<void>
  isReady(state: SceneState): boolean
}

export interface LucyRiveOptions {
  /** URL prefix for files under public/ (import.meta.env.BASE_URL). */
  base: string
  onFirstFrame(): void
  onError(error: unknown): void
}

const MAX_DPR = 2

export function createLucyCharacter(
  canvas: HTMLCanvasElement,
  initial: SceneState,
  opts: LucyRiveOptions,
): LucyRiveCharacter {
  const lazy: Partial<Record<SceneState, ImageAsset[]>> = {}
  const loading: Partial<Record<SceneState, Promise<void>>> = {}
  const done = new Set<SceneState>()
  for (const [s, meta] of Object.entries(LUCY_LIVE.states)) if (meta.eager) done.add(s as SceneState)
  let destroyed = false
  let loaded = false
  let wanted: SceneState = initial

  const fetchState = (s: SceneState): Promise<void> => {
    if (done.has(s)) return Promise.resolve()
    if (!loading[s]) {
      loading[s] = (async () => {
        for (const asset of lazy[s] ?? []) {
          const file = (LUCY_LIVE.sidecars as Record<string, string>)[asset.name]
          if (!file) continue
          const res = await fetch(opts.base + LUCY_LIVE.assets + file)
          if (!res.ok) throw new Error(`Lucy sidecar ${file}: ${res.status}`)
          const image = await decodeImage(new Uint8Array(await res.arrayBuffer()))
          if (destroyed) return
          asset.setRenderImage(image)
          image.unref()
        }
        done.add(s)
      })()
    }
    return loading[s]!
  }

  const applyState = () => {
    const prop = r.viewModelInstance?.enum('state')
    if (prop && prop.value !== wanted) prop.value = wanted
  }

  const r = new Rive({
    src: opts.base + LUCY_LIVE.riv,
    canvas,
    artboard: 'Lucy',
    stateMachines: 'Lucy',
    autoplay: true,
    autoBind: true,
    layout: new Layout({ fit: Fit.Fill, alignment: Alignment.TopLeft }),
    // referenced (lazy) images arrive with no bytes: keep them for later,
    // grouped by the state prefix the combiner puts on every asset name
    assetLoader: (asset, bytes) => {
      if (!asset.isImage || bytes.length > 0) return false
      const s = asset.name.split('-')[0] as SceneState
      ;(lazy[s] = lazy[s] ?? []).push(asset as ImageAsset)
      return true
    },
    onLoad: () => {
      if (destroyed) return
      loaded = true
      r.resizeDrawingSurfaceToCanvas(Math.min(MAX_DPR, window.devicePixelRatio || 1))
      applyState()
      // two frames so the first real draw has landed before the poster lets go
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (destroyed) return
          opts.onFirstFrame()
          const later = () => {
            for (const s of Object.keys(lazy) as SceneState[]) fetchState(s).catch(opts.onError)
          }
          if ('requestIdleCallback' in window) window.requestIdleCallback(later, { timeout: 1200 })
          else setTimeout(later, 300)
        }),
      )
    },
    onLoadError: (e) => opts.onError(e),
  })

  return {
    state(next) {
      wanted = next
      if (loaded && done.has(next)) applyState()
    },
    ready(s) {
      return loaded ? fetchState(s) : new Promise((res, rej) => {
        const wait = () => (destroyed ? rej(new Error('destroyed')) : loaded ? fetchState(s).then(res, rej) : setTimeout(wait, 50))
        wait()
      })
    },
    isReady(s) {
      return loaded && done.has(s)
    },
    look() {
      // No gaze rig yet; the contract keeps the call so the hero can wire it now.
    },
    setRunning(running) {
      if (!loaded) return
      if (running) r.play()
      else r.pause()
    },
    resize() {
      if (loaded) r.resizeDrawingSurfaceToCanvas(Math.min(MAX_DPR, window.devicePixelRatio || 1))
    },
    destroy() {
      destroyed = true
      r.cleanup()
    },
  }
}
