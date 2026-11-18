// ─────────────────────────────────────────────────────────────────────────
// One download per page load (owner, 2026-11-18: "Nothing should be loaded
// twice"). The hero and /landing each build their own figure; the bytes
// behind it are fetched once and shared. A later figure reads the finished
// buffer, or joins a download still in flight and catches up on its
// progress. One figure leaving never aborts a shared download (the next page
// may want it); a Skip does (abortSharedFetches), since the visit is then
// static. A failed or aborted download is evicted, so a retry refetches.
// Kept apart from createLucyCharacter so the session can abort without
// pulling the Rive runtime into the main bundle.
// ─────────────────────────────────────────────────────────────────────────

interface SharedFetch {
  bytes: number
  listeners: Set<(n: number) => void>
  controller: AbortController
  promise: Promise<Uint8Array>
}

const SHARED = new Map<string, SharedFetch>()

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

/**
 * The shared download for `url`. `signal` releases only this caller (it
 * rejects with AbortError); the download itself continues for others.
 */
export function fetchShared(url: string, signal: AbortSignal, priority: 'high' | 'low', onBytes: (n: number) => void): Promise<Uint8Array> {
  let entry = SHARED.get(url)
  if (!entry) {
    const controller = new AbortController()
    const e: SharedFetch = { bytes: 0, listeners: new Set(), controller, promise: Promise.resolve(new Uint8Array()) }
    e.promise = fetchWithProgress(url, controller.signal, priority, (n) => {
      e.bytes += n
      for (const l of e.listeners) l(n)
    })
    e.promise.catch(() => { if (SHARED.get(url) === e) SHARED.delete(url) })
    SHARED.set(url, e)
    entry = e
  }
  const e = entry
  if (e.bytes) onBytes(e.bytes)
  e.listeners.add(onBytes)
  return new Promise<Uint8Array>((res, rej) => {
    const leave = () => { e.listeners.delete(onBytes); signal.removeEventListener('abort', onAbort) }
    function onAbort() { leave(); rej(new DOMException('aborted', 'AbortError')) }
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener('abort', onAbort, { once: true })
    e.promise.then((b) => { leave(); res(b) }, (err) => { leave(); rej(err) })
  })
}

/** The visit went static: stop every download still in flight. Finished buffers are dropped too. */
export function abortSharedFetches(): void {
  for (const e of SHARED.values()) e.controller.abort()
  SHARED.clear()
}

/** Test seam. */
export function resetSharedFetches(): void {
  SHARED.clear()
}
