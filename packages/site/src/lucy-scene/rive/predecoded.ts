// Off-main-thread pixels for the referenced (sidecar) images.
//
// Measured (Hero A, first switch to Ultra after a reload): the WebGL2 runtime
// hands each referenced image to the GPU lazily, on the first frame that draws
// it, with texImage2D(HTMLImageElement). An <img> that has only fired `load`
// holds encoded bytes (img.decode() does not change that for WebGL), so that
// call decodes the pixels synchronously on the main thread. Ultra carries 62
// images (~40 Mpx), so the first Ultra frame stalled for about a second on a
// desktop CPU and far longer on a phone; Hell and Zero paid the same on their
// first switch, at a smaller size.
//
// The fix keeps the runtime's own path and only changes what it uploads from:
//   · each sidecar is decoded in a worker (predecode.worker.ts) as its bytes
//     land, seconds before any click; binding never waits for it;
//   · when the bitmap arrives and the runtime has not uploaded that image yet,
//     the runtime's image-table entry is pointed at the bitmap, so the later
//     texImage2D is a plain upload with no decode (a GPU copy where the
//     browser rasterises canvases on the GPU);
//   · once that upload has happened the entry goes back to the runtime's <img>
//     and the bitmap is closed, so the decoded copy does not stay resident and
//     a later re-upload (for example after a lost context) still works.
//
// The uploaded texels are byte-identical to the runtime's own path (verified
// against texImage2D(<img>) with UNPACK_PREMULTIPLY_ALPHA_WEBGL in Chromium on
// both raster paths). Everything here is a progressive enhancement over a pinned
// runtime (@rive-app/webgl2 2.43.1): if the image table is not where this
// version keeps it, or workers / OffscreenCanvas are missing, nothing is
// swapped and the runtime's own path runs unchanged.

type ImageTable = Map<unknown, unknown>

export interface Predecoder {
  /** Decode bytes off the main thread. Null when unsupported or the decode fails. */
  decode(bytes: Uint8Array): Promise<ImageBitmap | null>
  destroy(): void
}

export function createPredecoder(): Predecoder {
  let worker: Worker | null = null
  let broken = typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
  let seq = 0
  const waiting = new Map<number, (b: ImageBitmap | null) => void>()
  const fail = () => {
    broken = true
    for (const done of waiting.values()) done(null)
    waiting.clear()
    worker?.terminate()
    worker = null
  }
  const start = (): Worker | null => {
    if (worker || broken) return worker
    try {
      worker = new Worker(new URL('./predecode.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      fail()
      return null
    }
    worker.onmessage = (e: MessageEvent<{ id: number; bitmap: ImageBitmap | null }>) => {
      const done = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (done) done(e.data.bitmap)
      else e.data.bitmap?.close()
    }
    worker.onerror = fail
    return worker
  }
  return {
    decode(bytes) {
      const w = start()
      if (!w) return Promise.resolve(null)
      const id = ++seq
      return new Promise((resolve) => {
        waiting.set(id, resolve)
        w.postMessage({ id, blob: new Blob([bytes as BlobPart]) })
      })
    },
    destroy() {
      broken = true
      for (const done of waiting.values()) done(null)
      waiting.clear()
      worker?.terminate()
      worker = null
    },
  }
}

export interface Predecoded {
  /** Snapshot of the runtime's image table, taken right before decodeImage(). */
  mark(): Set<unknown>
  /** The table key decodeImage() just added (null when it cannot be told apart). */
  track(before: Set<unknown>): unknown
  /** Hand the runtime `bitmap` for `key`, unless that image is already on the GPU. */
  supply(key: unknown, bitmap: ImageBitmap): void
  destroy(): void
}

export function createPredecoded(runtime: unknown, canvas: HTMLCanvasElement): Predecoded | null {
  const host = runtime as { images?: ImageTable } | null
  // The table is created by the runtime on its first image decode (the file's
  // embedded Heaven images have run it by the time onLoad fires).
  const table = (): ImageTable | null => (host?.images instanceof Map ? host.images : null)
  if (!table()) return null
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext('webgl2')
  } catch {
    gl = null
  }
  if (!gl) return null

  const imgs = new Map<unknown, HTMLImageElement>()     // tracked key -> the runtime's own <img>
  const uploaded = new Set<HTMLImageElement>()           // tracked <img>s already uploaded the slow way
  const pending = new Map<ImageBitmap, unknown>()        // bitmap in the table -> its key

  // Learn when the runtime uploads, so a bitmap can be handed back and closed.
  // Instance-level only (this canvas's context), never the prototype.
  const ctx = gl
  const original = ctx.texImage2D
  const wrapped = function (this: WebGL2RenderingContext, ...args: unknown[]) {
    ;(original as (...a: unknown[]) => void).apply(this, args)
    const src = args[args.length - 1]
    if (src instanceof ImageBitmap) {
      const key = pending.get(src)
      if (key === undefined) return
      pending.delete(src)
      const t = table(), img = imgs.get(key)
      if (t && img && t.get(key) === src) t.set(key, img)
      if (img) uploaded.add(img)
      src.close()
    } else if (src instanceof HTMLImageElement) {
      uploaded.add(src)
    }
  }
  ctx.texImage2D = wrapped as WebGL2RenderingContext['texImage2D']

  return {
    mark() {
      return new Set(table()?.keys() ?? [])
    },
    track(before) {
      const t = table()
      const added = t ? [...t.keys()].filter((k) => !before.has(k)) : []
      if (!t || added.length !== 1) return null
      const img = t.get(added[0])
      if (!(img instanceof HTMLImageElement)) return null
      imgs.set(added[0], img)
      return added[0]
    },
    supply(key, bitmap) {
      const t = table(), img = imgs.get(key)
      if (!t || !img || uploaded.has(img) || t.get(key) !== img) {
        bitmap.close()
        return
      }
      t.set(key, bitmap)
      pending.set(bitmap, key)
    },
    destroy() {
      if (ctx.texImage2D === wrapped) ctx.texImage2D = original
      const t = table()
      for (const [bitmap, key] of pending) {
        const img = imgs.get(key)
        if (t && img && t.get(key) === bitmap) t.set(key, img)
        bitmap.close()
      }
      pending.clear()
      imgs.clear()
      uploaded.clear()
    },
  }
}
