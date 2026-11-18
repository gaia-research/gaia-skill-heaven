// Decodes one sidecar's pixels off the main thread (see predecoded.ts).
//
// In:  { id, blob }  Out: { id, bitmap: ImageBitmap | null }  (bitmap transferred)
//
// Rive's WebGL2 renderer expects premultiplied-alpha textures. Per WebGL2 5.14,
// UNPACK_PREMULTIPLY_ALPHA_WEBGL is ignored when texImage2D receives an
// ImageBitmap, so the bitmap itself must carry premultiplied pixels.
// Decoding directly with `premultiplyAlpha: 'premultiply'` preserves
// premultiplied alpha across Chromium, Firefox, and Safari/WebKit (unlike
// OffscreenCanvas.transferToImageBitmap(), which in WebKit drops premultiplication
// and leaks unmasked RGB from transparent pixels into additive/screen shaders).
// Requests are handled one at a time to bound memory.

interface Req { id: number; blob: Blob }
interface Scope {
  onmessage: ((e: MessageEvent<Req>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
const scope = self as unknown as Scope

async function decode(blob: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  return createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'default' })
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
