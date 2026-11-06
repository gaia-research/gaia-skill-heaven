// Lists what the shipped Lucy .riv exposes to a host (#203): per artboard, the
// state-machine inputs, plus the view-model properties of the bound instance.
// Gaze work must start from this list, not from guesses. Read-only; no repo
// writes.
//
//   node scripts/inspect-rig.mjs          (Playwright resolved as in e2e-atmosphere.mjs)
//
// Observed on lucy-live/012bd2c6ea with @rive-app/webgl2 2.43.1 (2026-11-06):
// 5 artboards (Lucy, Lucy-zero, -heaven, -hell, -ultra), one state machine each,
// ZERO state-machine inputs, and one view model "Lucy" whose only property is the
// enum `state`. There is no gaze, eye or head input to drive.
import { createServer } from 'node:http'
import { createReadStream, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const riveDir = dirname(require.resolve('@rive-app/webgl2/package.json', { paths: [SITE] }))
const live = join(SITE, 'public/lucy-live')
const rivPath = join(live, readdirSync(live).find((d) => !d.startsWith('.')), 'lucy.riv')
const files = { '/rive.js': join(riveDir, 'rive.js'), '/rive.wasm': join(riveDir, 'rive.wasm'), '/lucy.riv': rivPath }

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core']
  try { tries.push(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')) } catch {}
  for (const t of tries.filter(Boolean)) { try { return require(t) } catch {} }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE.')
}

const type = (f) => (f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.riv') ? 'application/octet-stream' : 'text/html')
const srv = createServer((q, r) => {
  if (q.url === '/') { r.setHeader('content-type', 'text/html'); return r.end('<canvas id=c width=300 height=300></canvas>') }
  const f = files[q.url]
  if (!f) { r.statusCode = 404; return r.end() }
  r.setHeader('content-type', type(f))
  createReadStream(f).pipe(r)
})
await new Promise((res) => srv.listen(0, '127.0.0.1', res))
const origin = `http://127.0.0.1:${srv.address().port}`
const browser = await loadPlaywright().chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(origin + '/')
  await page.addScriptTag({ url: '/rive.js' })
  const out = await page.evaluate(async () => {
    rive.RuntimeLoader.setWasmUrl('/rive.wasm')
    const buf = await (await fetch('/lucy.riv')).arrayBuffer()
    return new Promise((res) => {
      const r = new rive.Rive({
        buffer: buf, canvas: document.getElementById('c'), artboard: 'Lucy', stateMachines: 'Lucy', autoplay: true, autoBind: true,
        assetLoader: (a, bytes) => a.isImage && bytes.length === 0,
        onLoad: () => res({
          artboards: r.contents.artboards.map((a) => ({ name: a.name, stateMachines: a.stateMachines.map((s) => ({ name: s.name, inputs: s.inputs })) })),
          stateMachineInputs: r.stateMachineInputs('Lucy').map((i) => ({ name: i.name, type: i.type })),
          viewModelProperties: (r.viewModelInstance?.properties ?? []).map((p) => ({ name: p.name, type: p.type })),
        }),
        onLoadError: (e) => res({ error: String(e) }),
      })
    })
  })
  console.log(JSON.stringify(out, null, 2))
  const names = [...out.stateMachineInputs, ...out.viewModelProperties].map((x) => x.name)
  const gaze = names.filter((n) => /gaze|look|eye|head|pupil|aim/i.test(n))
  console.log(gaze.length ? `gaze-like inputs: ${gaze.join(', ')}` : 'NO gaze/eye/head inputs: look() has nothing to drive')
} finally {
  await browser.close()
  srv.close()
}
