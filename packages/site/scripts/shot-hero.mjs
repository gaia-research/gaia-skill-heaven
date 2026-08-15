// Fifth-scene band inspector. Drives Hero A to the ladder (act 5) and captures
// each band (Zero / Heaven / Hell / Ultra) so scale + face proportion can be
// judged from the built pixels, not guessed. Uses playwright-core + system
// Chrome (no bundled-browser download).
import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'http://127.0.0.1:5178/#/'
const OUT = process.env.OUT || 'C:/Users/C5396183/skill-heaven/preview'

// rung index → label, one representative per band
const BANDS = [
  { i: 0, name: 'zero' },
  { i: 1, name: 'heaven' },
  { i: 3, name: 'hell' },
  { i: 6, name: 'ultra' },
]

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

// jump to the fifth scene by clicking the last act dot
const dots = page.locator('.vha-dot-btn')
await dots.last().click()
await page.waitForTimeout(1200)

for (const b of BANDS) {
  const rungs = page.locator('.vha-rung-btn')
  await rungs.nth(b.i).click()
  await page.waitForTimeout(1100) // let the slice + palette settle
  await page.screenshot({ path: `${OUT}/act5-${b.name}.png` })
  console.log('shot', b.name)
}

console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none')
await browser.close()
