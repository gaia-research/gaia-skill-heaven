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
// Matrix: every check runs per (browser, deviceScaleFactor). BROWSERS=chromium,webkit
// (default: both; a browser that is not installed is reported, not failed) and
// DSF=1,2 (default: 1,2 = standard and high-DPI). All of it is headless EMULATION:
// it is not real-device acceptance.
//
// Env: PORT (default 4179), CHANNEL_JSON=path to also write the observations,
// BROWSERS, DSF.
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
let TAG = ''
let ctxExtra = {}
const ok = (name, cond, detail = {}) => {
  name = TAG + name
  results.push({ name, pass: !!cond, ...detail })
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${Object.keys(detail).length ? '  ' + JSON.stringify(detail) : ''}`)
}
const note = (name, detail) => {
  name = TAG + name
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
  // live-listener ledger (window/document/documentElement) for the unmount/remount leak check
  w.__listeners = new Map()
  const track = (target, label) => {
    const add = target.addEventListener.bind(target)
    const rem = target.removeEventListener.bind(target)
    const key = (t, fn, cap) => label + ':' + t + ':' + (typeof cap === 'object' ? !!cap?.capture : !!cap)
    const fns = new Map()
    target.addEventListener = (t, fn, o) => {
      const k = key(t, fn, o)
      const set = fns.get(k) ?? new Set()
      set.add(fn)
      fns.set(k, set)
      w.__listeners.set(k, set.size)
      return add(t, fn, o)
    }
    target.removeEventListener = (t, fn, o) => {
      const k = key(t, fn, o)
      const set = fns.get(k)
      if (set) {
        set.delete(fn)
        w.__listeners.set(k, set.size)
      }
      return rem(t, fn, o)
    }
  }
  track(window, 'window')
  track(document, 'document')
  if (document.documentElement) track(document.documentElement, 'html')
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

// Poll until pred() is true (a settle latency is measured, not guessed), up to maxMs.
const until = async (pred, maxMs = 2500, step = 100) => {
  const t0 = Date.now()
  for (;;) {
    const v = await pred()
    if (v || Date.now() - t0 > maxMs) return { v, ms: Date.now() - t0 }
    await wait(step)
  }
}
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
  const ctx = await browser.newContext({ ...ctxExtra, ...ctxOpts })
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
  // sample the flight repeatedly: a single fixed-time sample is flaky on a loaded machine
  const flight = []
  // (a slow engine can still be before its first delayed layer at 550ms, so sample up to ~2s)
  for (let i = 0; i < 20; i++) {
    await wait(i === 0 ? 100 : 90)
    flight.push(await snapshot(page))
    const o = Object.keys(flight[i]).filter((k) => k.startsWith('ultra/')).map((k) => flight[i][k].o)
    if (i >= 5 && new Set(o.map((v) => v.toFixed(2))).size >= 2 && o.some((v) => v > 0.05 && v < 0.98)) break
  }
  const mid = flight[Math.min(3, flight.length - 1)]
  await wait(2000)
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
  const fractionsAt = (m) =>
    Object.keys(m)
      .filter((k) => k.startsWith('ultra/'))
      .map((k) => +(m[k].o / Math.max(after[k].o, 0.001)).toFixed(2))
  const fractions = flight.map(fractionsAt).find((f) => new Set(f).size >= 2) ?? fractionsAt(mid)
  const midShard = Object.keys(mid).filter((k) => k.startsWith('shard/')).map((k) => Math.max(...flight.map((f) => Math.abs(matrixXY(f[k].t)[1] - matrixXY(before[k].t)[1]))))
  ok('arriving layers progress at different rates (opacity fractions differ at some point in the flight)', new Set(fractions).size >= 2, { fractions })
  ok('shards move through intermediate positions (not snapped) after a switch', midShard.some((d) => Math.abs(d) > 1) && Math.max(...flight.map((f) => maxDelta(f, after))) > 1, { maxToGo: +Math.max(...flight.map((f) => maxDelta(f, after))).toFixed(1) })

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
  const offs = await planeOffsets(page)
  const maxOff = Math.max(...offs.map((o) => Math.max(Math.abs(o.ix), Math.abs(o.iy))))
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
  // first sample where the room has leaned (the tap lands later on a slow engine)
  let leaned = base
  await until(async () => {
    leaned = await snapshot(page)
    return Object.keys(base).some((k) => base[k].tr !== leaned[k].tr)
  }, 1200, 60)
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
  await wait(1200) // Rive finishes its in-flight frame; the guard is judged after it settles
  const hidden = await rafOver(page, 1500)
  note('Lucy (Rive) live canvas present', { live })
  ok('hidden document: Lucy and the room together leave no rAF loop', hidden <= 2, { live, rafRunning: raf, rafHidden: hidden })
  await ctx.close()
}

// Gaze budget (#203): mirrors pointer.ts. The rig has no gaze input (see
// scripts/inspect-rig.mjs), so Lucy's own displacement is 0 and the room's cap is
// the whole constraint: every plane <= 0.6 x GAZE_BUDGET_VMIN.
const GAZE_BUDGET_VMIN = 2
const toVmin = (px, vmin) => px / vmin
const planeOffsets = (page) =>
  page.evaluate(() => {
    const vmin = Math.min(innerWidth, innerHeight) / 100
    const num = (v) => parseFloat(v) || 0
    return [...document.querySelectorAll('.la .la-l[data-on], .la .la-shard')].map((e) => {
      // Motion writes inline `translate` in vmin; the computed value is in px.
      const [ix, iy = 0] = (e.style.translate || '0 0').split(/\s+/).map(num)
      const [cx, cy = 0] = (getComputedStyle(e).translate || '0 0').replace(/none/, '0 0').split(/\s+/).map(num)
      return { ix, iy, cx: cx / vmin, cy: cy / vmin }
    })
  })

async function budgetChecks(browser) {
  const { ctx, page } = await openHero(browser, { viewport: { width: 1280, height: 800 } })
  await page.waitForSelector('.la[data-conducted]', { timeout: 5000 })
  const limit = GAZE_BUDGET_VMIN * 0.6
  const perState = {}
  let worst = 0
  let worstRendered = 0
  let nonzero = 0
  for (const rung of ['LOW', 'HIGH', 'ULTRA']) {
    await clickRung(page, rung)
    await wait(2600)
    let stateMax = 0
    // corners, edges and centre, then a dense diagonal and circular sweep; sample while moving and after settling
    const stops = [[0, 0], [1279, 0], [1279, 799], [0, 799], [640, 0], [1279, 400], [640, 799], [0, 400], [640, 400]]
    for (const [x, y] of stops) {
      await page.mouse.move(x, y, { steps: 6 })
      for (const dt of [60, 300, 1100]) {
        await wait(dt)
        for (const o of await planeOffsets(page)) {
          const m = Math.max(Math.abs(o.ix), Math.abs(o.iy))
          const r = Math.max(Math.abs(o.cx), Math.abs(o.cy))
          stateMax = Math.max(stateMax, m)
          worstRendered = Math.max(worstRendered, r)
          if (m > 0.01) nonzero++
        }
      }
    }
    for (let i = 0; i < 90; i++) {
      await page.mouse.move(640 + Math.cos(i / 5) * 640, 400 + Math.sin(i / 4) * 400)
      if (i % 3 === 0) for (const o of await planeOffsets(page)) { stateMax = Math.max(stateMax, Math.abs(o.ix), Math.abs(o.iy)); worstRendered = Math.max(worstRendered, Math.abs(o.cx), Math.abs(o.cy)) }
    }
    perState[rung] = +stateMax.toFixed(3)
    worst = Math.max(worst, stateMax)
  }
  ok('pointer sweeps (corners, edges, dense circle; LOW/HIGH/ULTRA) never exceed 0.6 x gaze budget on any plane', worst <= limit + 1e-6 && worst > 0.2, { perStateMaxVmin: perState, worstVmin: +worst.toFixed(3), limitVmin: limit })
  ok('the rendered (computed) translate agrees with the budget too', worstRendered <= limit + 0.02 && nonzero > 0, { worstRenderedVmin: +worstRendered.toFixed(3), samplesMoving: nonzero })
  ok('the room is always strictly smaller than the gaze budget', worst < GAZE_BUDGET_VMIN, { worst: +worst.toFixed(3), gazeBudget: GAZE_BUDGET_VMIN })
  await ctx.close()
}

const listenerSnapshot = (page) => page.evaluate(() => Object.fromEntries([...window.__listeners].filter(([k]) => /pointer|visibility/.test(k))))

async function lifecycleChecks(browser) {
  const { ctx, page } = await openHero(browser, { viewport: { width: 1280, height: 800 } })
  await page.waitForSelector('.la[data-conducted]', { timeout: 5000 })

  // hidden -> visible, three cycles: running flag and animations follow, no accumulation
  const flags = []
  for (let i = 0; i < 3; i++) {
    await setHidden(page, true)
    const settle = await until(async () => (await runningAnims(page)) === 0)
    const h = [await running(page), await runningAnims(page), settle.ms]
    await setHidden(page, false)
    await wait(500)
    flags.push([...h, await running(page), (await runningAnims(page)) > 0])
  }
  ok('three hidden/visible cycles each stop then restart the room', flags.every((f) => f[0] === 'false' && f[1] === 0 && f[3] === 'true' && f[4]), { flags })

  // offscreen IntersectionObserver. The hero root is position:fixed (always in view),
  // so the guard is exercised by moving the scene root out of the viewport.
  await page.evaluate(() => (document.querySelector('[data-scene-state]').style.transform = 'translateY(-250vh)'))
  await wait(500)
  const off = [await running(page), await runningAnims(page)]
  await page.evaluate(() => (document.querySelector('[data-scene-state]').style.transform = ''))
  await wait(500)
  const on = [await running(page), (await runningAnims(page)) > 0]
  ok('moving the scene offscreen pauses it (IntersectionObserver) and bringing it back resumes it', off[0] === 'false' && off[1] === 0 && on[0] === 'true' && on[1], { off, on })

  // unmount / remount: client-side route away and back, listeners must not accumulate
  const base = await listenerSnapshot(page)
  const cycles = []
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      location.hash = '#/console'
    })
    await page.waitForFunction(() => !document.querySelector('[data-scene-state]'), null, { timeout: 5000 }).catch(() => {})
    await until(async () => !Object.entries(await listenerSnapshot(page)).some(([k, v]) => /pointermove|pointerleave|pointerdown:false/.test(k) && v > 0), 2500)
    const away = await listenerSnapshot(page)
    const mounted = await page.evaluate(() => !!document.querySelector('[data-scene-state]'))
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('.la[data-conducted]', { timeout: 5000 })
    cycles.push({ away, sceneMountedAway: mounted, back: await listenerSnapshot(page) })
  }
  const last = cycles[cycles.length - 1].back
  const keys = new Set([...Object.keys(base), ...Object.keys(last)])
  const grew = [...keys].filter((k) => (last[k] ?? 0) > (base[k] ?? 0))
  const awayLeft = Object.entries(cycles[0].away).filter(([k, v]) => /pointermove|pointerleave|pointerdown:false/.test(k) && v > 0)
  ok('unmount/remount x3 leaves no extra pointer/visibility listeners', cycles.every((c) => !c.sceneMountedAway) && grew.length === 0, { base, last, grew, sceneStillMountedAway: cycles.map((c) => c.sceneMountedAway) })
  ok('away from the hero the conductor holds no pointer listeners', awayLeft.length === 0, { awayLeft })
  // remounted scene works: pointer moves the room, hidden still freezes it
  await page.mouse.move(100, 100)
  await page.mouse.move(1100, 700, { steps: 15 })
  await wait(900)
  const moved = (await planeOffsets(page)).some((o) => Math.abs(o.ix) > 0.05 || Math.abs(o.iy) > 0.05)
  await setHidden(page, true)
  await wait(300)
  const frozen = (await runningAnims(page)) === 0 && (await running(page)) === 'false'
  ok('a remounted scene still responds to the pointer and still pauses when hidden', moved && frozen, { moved, frozen })
  await ctx.close()
}

async function matrix() {
  const pw = loadPlaywright()
  const want = (process.env.BROWSERS || 'chromium,webkit').split(',')
  const dsfs = (process.env.DSF || '1,2').split(',').map(Number)
  const server = await serve()
  try {
    for (const name of want) {
      let browser
      try {
        browser = await pw[name].launch()
      } catch (e) {
        note(`${name} unavailable`, { reason: String(e.message).split('\n')[0] })
        continue
      }
      for (const dsf of dsfs) {
        TAG = `[${name} dsf${dsf}] `
        ctxExtra = { deviceScaleFactor: dsf }
        note('browser', { name, version: browser.version(), deviceScaleFactor: dsf, emulation: 'headless; not real-device acceptance' })
        await desktopChecks(browser)
        await budgetChecks(browser)
        await reducedChecks(browser)
        await lifecycleChecks(browser)
        await mobileChecks(browser, pw.devices)
        await liveLucyChecks(browser)
        const cell = results.filter((r) => r.name.startsWith(TAG) && r.pass !== undefined && !r.note)
        console.log(`== ${TAG.trim()} ${cell.filter((r) => r.pass).length}/${cell.length} passed`)
      }
      await browser.close()
    }
  } finally {
    server.kill()
  }
}
await matrix()
if (process.env.CHANNEL_JSON) writeFileSync(process.env.CHANNEL_JSON, JSON.stringify(results, null, 2))
console.log(`\n${results.filter((r) => r.pass).length} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
