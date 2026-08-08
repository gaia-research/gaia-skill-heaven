// Prototype preview shots — captures each landing variation for review.
// PW_ENTRY lets us import the npx-cached playwright by absolute file URL
// (ESM ignores NODE_PATH, so we resolve the entry explicitly).
import { pathToFileURL } from 'node:url';
const pwPath = process.env.PW_ENTRY;
const { chromium } = pwPath ? await import(pathToFileURL(pwPath).href) : await import('playwright');

const BASE = 'http://localhost:5178/#';
const OUT = process.env.OUT || 'C:/Users/C5396183/skill-heaven/packages/site/preview';

const shots = [
  { route: '/overdrive', name: 'overdrive-hero', scroll: 0 },
  { route: '/overdrive', name: 'overdrive-hell', scroll: 0.5 },   // the hell-slice inversion
  { route: '/overdrive', name: 'overdrive-lower', scroll: 0.85 },
  { route: '/prism', name: 'prism-hero', scroll: 0 },
  { route: '/prism', name: 'prism-lower', scroll: 0.75 },
  { route: '/default', name: 'default-hero', scroll: 0 },
  { route: '/default', name: 'default-lower', scroll: 0.7 },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const s of shots) {
  await page.goto(BASE + s.route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900); // let load animations settle
  if (s.scroll > 0) {
    await page.evaluate((frac) => {
      const max = document.body.scrollHeight - window.innerHeight;
      window.scrollTo(0, max * frac);
    }, s.scroll);
    await page.waitForTimeout(700);
  }
  const path = `${OUT}/${s.name}.png`;
  await page.screenshot({ path });
  console.log('shot', s.name);
}

await browser.close();
console.log('done');
