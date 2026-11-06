// Browser checks for the Lucy atmosphere (#203, #204) against the BUILT site.
//
//   npm -w @gaia-skill-heaven/site run build
//   npm -w @gaia-skill-heaven/site run e2e
//
// Serves dist/ with `vite preview`, drives headless Chromium through Playwright
// and asserts: a state switch moves the room (data attributes + transforms, with
// layers at different rates); reduced motion is a still room (no Motion chunk,
// no running animations, no drift over time); a hidden document leaves no
// animation or rAF work and resumes without a jump; pointer movement causes no
// React commits and stays inside the pointer budget; touch is handled by a tap
// response, not a following cursor.
//
// Playwright is NOT a dependency of this repo (no download on install). It is
// resolved from the environment: PLAYWRIGHT_MODULE, a normal install, or the
// global npm root. WebKit is attempted only if its browser is installed.
//
// Env: PORT (default 4179), CHANNEL_JSON=path to also write the observations.
import { spawn, execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 4179)
const BASE = `http://127.0.0.1:${PORT}/`
// Mirrors src/lucy-scene/atmosphere/pointer.ts (a unit test pins the numbers).
const ATMOSPHERE_MAX_VMIN = 1.2

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core']
  try {
    tries.push(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'))
  } catch {}
  for (const t of tries.filter(Boolean)) {
    try {
      return require(t)
    } catch {}
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE or install it outside the repo.')
}

const results = []
let failed = 0
const ok = (name, cond, detail = {}) => {
  results.push({ name, pass: !!cond, ...detail })
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${Object.keys(detail).length ? '  ' + JSON.stringify(detail) : ''}`)
}
const note = (name, detail) => {
  results.push({ name, note: true, ...detail })
  console.log(`NOTE  ${name}  ${JSON.stringify(detail)}`)
}

async function serve() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: SITE,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return child
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  child.kill()
  throw new Error('vite preview did not start; run the site build first')
}

// Counts rAF calls and React commits from the first script. The DevTools hook
// stub is the supported way to observe React 18 commits without changing code.
const INSTRUMENT = () => {
  const w = window
  w.__raf = 0
  const raf = w.requestAnimationFrame.bind(w)
  w.requestAnimationFrame = (cb) => {
    w.__raf++
    return raf(cb)
  }
  w.__commits = 0
  w.__long = 0
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject() {
      return 1
    },
    onCommitFiberRoot() {
      w.__commits++
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
  try {
    new PerformanceObserver((l) => (w.__long += l.getEntries().length)).observe({ entryTypes: ['longtask'] })
  } catch {}
}

const URL_Q = '?entrance=off&lucy=static'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const snapshot = (page) =>
  page.evaluate(() => {
    const out = {}
    document.querySelectorAll('.la .la-l, .la .la-shard').forEach((el, i) => {
      const cs = getComputedStyle(el)
      out[(el.dataset.world ? el.dataset.world + '/' + el.dataset.layer : 'shard/' + el.dataset.shard + (el.hasAttribute('data-ghost') ? 'g' : '')) + '#' + i] = {
        t: cs.transform,
        o: Number(cs.opacity),
        tr: cs.translate,
      }
    })
    return out
  })

const running = (page) => page.evaluate(() => document.querySelector('[data-scene-state]').getAttribute('data-scene-running'))
const runningAnims = (page) =>
  page.evaluate(() => document.querySelector('.la').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)
const setHidden = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
const rafOver = async (page, ms) => {
  const a = await page.evaluate(() => window.__raf)
  await wait(ms)
  return (await page.evaluate(() => window.__raf)) - a
}
const matrixXY = (m) => {
  const n = m.match(/matrix\(([^)]+)\)/)
  if (!n) return [0, 0]
  const p = n[1].split(',').map(Number)
  return [p[4], p[5]]
}
const maxDelta = (a, b) =>
  Math.max(
    0,
    ...Object.keys(a).map((k) => {
      const [x1, y1] = matrixXY(a[k].t)
      const [x2, y2] = matrixXY(b[k]?.t ?? 'none')
      return Math.hypot(x2 - x1, y2 - y1)
    }),
  )
const clickRung = (page, label) => page.getByRole('button', { name: label, exact: true }).first().click()

async function openHero(browser, ctxOpts, query = URL_Q) {
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript(INSTRUMENT)
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(BASE + query, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-scene-state]')
  return { ctx, page, requests }
}

async function desktopChecks(browser) {
  const { ctx, page, requests } = await openHero(browser, { viewport: { width: 1280, height: 800 } })
  await page.waitForSelector('.la[data-conducted]', { timeout: 5000 })
  ok('conductor takes over the room on a normal-motion session', true, { conductorChunk: requests.some((u) => /conductor/.test(u)) })

  // ── state switch ──────────────────────────────────────────────────────
  const before = await snapshot(page)
  const s0 = await page.evaluate(() => [document.querySelector('[data-scene-state]').dataset.sceneState, document.querySelector('.la').dataset.state])
  await clickRung(page, 'ULTRA')
  await wait(380)
  const mid = await snapshot(page)
  await wait(2200)
  const after = await snapshot(page)
  const s1 = await page.evaluate(() => [
    document.querySelector('[data-scene-state]').dataset.sceneState,
    document.querySelector('.la').dataset.state,
    [...document.querySelectorAll('.la-l[data-on]')].map((e) => e.dataset.world),
  ])
  ok('a state switch changes the scene root and atmosphere data attributes', s0[0] !== s1[0] && s1[0] === 'ultra' && s1[1] === 'ultra', { from: s0, to: s1.slice(0, 2) })
  ok('only the arriving world keeps its layers on', s1[2].length > 0 && s1[2].every((w) => w === 'ultra'), { on: s1[2] })
  const moved = Object.keys(before).filter((k) => before[k].t !== after[k].t || before[k].o !== after[k].o)
  ok('the switch changes transforms/opacity across the room', moved.length >= 10, { changed: moved.length, of: Object.keys(before).length })
  // Different rates: at ~380ms the layers must not all be at the same fraction.
  const fractions = Object.keys(mid)
    .filter((k) => k.startsWith('ultra/'))
    .map((k) => +(mid[k].o / Math.max(after[k].o, 0.001)).toFixed(2))
  const midShard = Object.keys(mid).filter((k) => k.startsWith('shard/')).map((k) => matrixXY(mid[k].t)[1] - matrixXY(before[k].t)[1])
  ok('arriving layers progress at different rates (opacity fractions differ mid-flight)', new Set(fractions).size >= 2, { fractions })
  ok('shards are mid-flight, not snapped, at 380ms', midShard.some((d) => Math.abs(d) > 1) && maxDelta(mid, after) > 1, { maxToGo: +maxDelta(mid, after).toFixed(1) })

  // ── drift continues in a running scene ───────────────────────────────
  await clickRung(page, 'HIGH')
  await wait(2600)
  const d1 = await snapshot(page)
  await wait(1500)
  const d2 = await snapshot(page)
  const runDrift = maxDelta(d1, d2)
  ok('a running scene drifts (control for the pause checks)', runDrift > 1, { px: +runDrift.toFixed(2) })

  // ── hidden document ───────────────────────────────────────────────────
  const rafRunning = await rafOver(page, 1000)
  await setHidden(page, true)
  await wait(300)
  const flag = await running(page)
  const h1 = await snapshot(page)
  const rafHidden = await rafOver(page, 1500)
  const h2 = await snapshot(page)
  ok('hiding the document sets data-scene-running=false', flag === 'false', { flag })
  ok('no animation is running in the room while hidden', (await runningAnims(page)) === 0)
  ok('the room is frozen while hidden (no drift)', maxDelta(h1, h2) < 0.05, { px: +maxDelta(h1, h2).toFixed(3) })
  ok('no rAF loop runs while hidden', rafHidden <= 2, { rafHidden, rafRunningBaseline: rafRunning })
  await page.mouse.move(100, 100)
  await page.mouse.move(1100, 700, { steps: 20 })
  await wait(400)
  const hp = await snapshot(page)
  ok('pointer input does not move the room while hidden', maxDelta(h2, hp) < 0.05, { px: +maxDelta(h2, hp).toFixed(3) })
  await setHidden(page, false)
  await wait(120)
  const r1 = await snapshot(page)
  ok('resume does not jump (first frames stay within 12px of the frozen pose, despite a pointer move while hidden)', maxDelta(hp, r1) < 12, { px: +maxDelta(hp, r1).toFixed(2) })
  await wait(600)
  ok('resume restarts the room', (await running(page)) === 'true' && (await runningAnims(page)) > 0)

  // ── pointer: no React storm, inside the budget ────────────────────────
  await page.mouse.move(640, 400)
  await wait(300)
  const c0 = await page.evaluate(() => [window.__commits, window.__long, window.__raf])
  const t0 = Date.now()
  for (let i = 0; i < 240; i++) {
    await page.mouse.move(640 + Math.cos(i / 8) * 600, 400 + Math.sin(i / 6) * 380)
    if (i % 4 === 0) await wait(8)
  }
  const ms = Date.now() - t0
  const c1 = await page.evaluate(() => [window.__commits, window.__long, window.__raf])
  ok('240 pointer moves cause no React commits', c1[0] - c0[0] === 0, { commits: c1[0] - c0[0], ms, longTasks: c1[1] - c0[1] })
  const offs = await page.evaluate(() => {
    const vmin = Math.min(innerWidth, innerHeight) / 100
    return [...document.querySelectorAll('.la .la-l[data-on], .la .la-shard')].map((e) => {
      const [x, y] = (e.style.translate || '0 0').split(/\s+/).map((v) => parseFloat(v) || 0)
      return { x, y, vmin }
    })
  })
  const maxOff = Math.max(...offs.map((o) => Math.max(Math.abs(o.x), Math.abs(o.y))))
  ok('pointer depth stays at or below the atmosphere budget', maxOff <= ATMOSPHERE_MAX_VMIN + 1e-6 && maxOff > 0.2, { maxVmin: +maxOff.toFixed(3), budget: ATMOSPHERE_MAX_VMIN })
  note('long tasks during pointer sweep', { count: c1[1] - c0[1] })
  await ctx.close()
}

async function reducedChecks(browser) {
  const { ctx, page, requests } = await openHero(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await wait(1200)
  ok('reduced motion never loads the conductor or its Motion chunk', !requests.some((u) => /conductor/.test(u)) && !(await page.$('.la[data-conducted]')), {
    conductorRequests: requests.filter((u) => /conductor/.test(u)).length,
  })
  const a = await snapshot(page)
  await wait(2000)
  const b = await snapshot(page)
  ok('no transform drift over time under reduced motion', maxDelta(a, b) === 0 && JSON.stringify(a) === JSON.stringify(b))
  ok('no running animation in the room under reduced motion', (await runningAnims(page)) === 0)
  await page.mouse.move(100, 100)
  await page.mouse.move(1100, 700, { steps: 15 })
  await wait(400)
  const p = await snapshot(page)
  ok('no pointer parallax under reduced motion', Object.values(p).every((v) => v.tr === 'none' || /^0(px)?( 0(px)?)?$/.test(v.tr)))
  await clickRung(page, 'ULTRA')
  await wait(1200)
  const st = await page.evaluate(() => ({
    scene: document.querySelector('[data-scene-state]').dataset.sceneState,
    la: document.querySelector('.la').dataset.state,
    shards: document.querySelector('.la').dataset.shards,
    onOpacity: [...document.querySelectorAll('.la-l[data-world="ultra"]')].map((e) => Number(getComputedStyle(e).opacity)),
    offOpacity: [...document.querySelectorAll('.la-l[data-world="heaven"]')].map((e) => Number(getComputedStyle(e).opacity)),
    running: document.querySelector('.la').getAnimations({ subtree: true }).filter((x) => x.playState === 'running').length,
  }))
  ok('the state still changes under reduced motion: palette kept, world swapped, no animation', st.scene === 'ultra' && st.la === 'ultra' && st.shards === 'ultra' && st.onOpacity.some((o) => o > 0.9) && st.offOpacity.every((o) => o < 0.05) && st.running === 0, st)
  await ctx.close()
}

async function mobileChecks(browser, devices) {
  const { ctx, page } = await openHero(browser, { ...devices['iPhone 13'], hasTouch: true })
  await page.waitForSelector('.la[data-conducted]', { timeout: 5000 })
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  const base = await snapshot(page)
  await page.touchscreen.tap(60, 200)
  await wait(150)
  const leaned = await snapshot(page)
  const moved = Object.keys(base).filter((k) => base[k].tr !== leaned[k].tr).length
  await wait(3000)
  const rested = await snapshot(page)
  const mag = (tr) => Math.max(0, ...(tr.match(/-?[\d.]+/g) ?? []).map((n) => Math.abs(Number(n))))
  const peak = Math.max(...Object.values(leaned).map((v) => mag(v.tr)))
  const left = Object.values(rested).filter((v) => mag(v.tr) > 0.005).length
  ok('mobile viewport, coarse pointer: a tap leans the room', coarse && moved > 0, { coarse, planesMoved: moved, peakVmin: +peak.toFixed(3) })
  ok('the lean settles back after the tap', left === 0, { notAtRest: left })
  // Synthetic touch pointerdowns isolate the scene's own handler from the hero's click targets.
  const c0 = await page.evaluate(() => window.__commits)
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 30 + i * 8, clientY: 300 }))
  })
  await wait(300)
  const c1 = await page.evaluate(() => window.__commits)
  ok('repeated touch pointerdowns cause no React commits', c1 - c0 === 0, { commits: c1 - c0 })
  await wait(3000)
  const trs = async () => Object.values(await snapshot(page)).map((v) => v.tr).join('|')
  const drag0 = await trs()
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 30 + i * 8, clientY: 300 }))
  })
  await wait(300)
  const drag1 = await trs()
  const nums = (t) => (t.match(/-?[\d.]+/g) ?? []).map(Number)
  const near = (a, b) => nums(a).every((n, i) => Math.abs(n - nums(b)[i]) < 0.05)
  ok('touch pointermove (a scroll or drag) does not follow the finger', near(drag0, drag1), near(drag0, drag1) ? {} : { drag0, drag1 })
  const w = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
  ok('no horizontal overflow at mobile width', w)
  await ctx.close()
}

async function liveLucyChecks(browser) {
  // Rive on (default). Headless WebGL may be unavailable; then the figure
  // falls back to the masters by design and this check reports that instead.
  const { ctx, page } = await openHero(browser, { viewport: { width: 1280, height: 800 } }, '?entrance=off')
  await wait(6000)
  const live = await page.evaluate(() => !!document.querySelector('.lucy-rive canvas'))
  const raf = await rafOver(page, 1000)
  await setHidden(page, true)
  await wait(400)
  const hidden = await rafOver(page, 1500)
  note('Lucy (Rive) live canvas present', { live })
  ok('hidden document: Lucy and the room together leave no rAF loop', hidden <= 2, { live, rafRunning: raf, rafHidden: hidden })
  await ctx.close()
}

const pw = loadPlaywright()
const server = await serve()
try {
  const browser = await pw.chromium.launch()
  const version = browser.version()
  note('browser', { name: 'chromium', version })
  await desktopChecks(browser)
  await reducedChecks(browser)
  await mobileChecks(browser, pw.devices)
  await liveLucyChecks(browser)
  await browser.close()
  let webkit = 'pending: browser not installed'
  try {
    const wk = await pw.webkit.launch()
    webkit = `available ${wk.version()} (not exercised by this script)`
    await wk.close()
  } catch {}
  note('webkit', { status: webkit })
} finally {
  server.kill()
}
if (process.env.CHANNEL_JSON) writeFileSync(process.env.CHANNEL_JSON, JSON.stringify(results, null, 2))
console.log(`\n${results.filter((r) => r.pass).length} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
