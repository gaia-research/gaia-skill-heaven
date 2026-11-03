// Decodes one sidecar's pixels off the main thread (see predecoded.ts).
//
// In:  { id, blob }  Out: { id, bitmap: ImageBitmap | null }  (bitmap transferred)
//
// The bitmap holds exactly the bytes the WebGL2 runtime would upload from an
// <img> with UNPACK_PREMULTIPLY_ALPHA_WEBGL: unpremultiplied decode, then a
// rounded premultiply. createImageBitmap(premultiplyAlpha 'premultiply') would
// truncate instead (1 LSB off on ~15% of channels, measured), so the
// premultiply is done by a 1:1 `copy` draw into a canvas with smoothing off,
// which rounds and copies texels verbatim on both the CPU and GPU raster paths.
// Requests are handled one at a time to bound memory.

interface Req { id: number; blob: Blob }
interface Scope {
  onmessage: ((e: MessageEvent<Req>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
const scope = self as unknown as Scope

async function decode(blob: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null
  const raw = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'default' })
  try {
    const canvas = new OffscreenCanvas(raw.width, raw.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.globalCompositeOperation = 'copy'
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(raw, 0, 0)
    return canvas.transferToImageBitmap()
  } finally {
    raw.close()
  }
}

let chain: Promise<void> = Promise.resolve()
scope.onmessage = (e) => {
  const { id, blob } = e.data
  chain = chain.then(async () => {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await decode(blob)
    } catch {
      bitmap = null
    }
    scope.postMessage({ id, bitmap }, bitmap ? [bitmap] : [])
  })
}
