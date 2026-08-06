// One-off preview shots for the 3 NEW variations (manifesto / instrument / onebit).
import { pathToFileURL } from 'node:url';
const pwPath = process.env.PW_ENTRY;
const { chromium } = pwPath ? await import(pathToFileURL(pwPath).href) : await import('playwright');

const BASE = 'http://localhost:5178/#';
const OUT = process.env.OUT || 'C:/Users/C5396183/skill-heaven/packages/site/preview';

const shots = [
  { route: '/manifesto', name: 'manifesto-hero', scroll: 0 },
  { route: '/manifesto', name: 'manifesto-hell', scroll: 0.46 },
  { route: '/manifesto', name: 'manifesto-lower', scroll: 0.82 },
  { route: '/instrument', name: 'instrument-hero', scroll: 0 },
  { route: '/instrument', name: 'instrument-hell', scroll: 0.46 },
  { route: '/instrument', name: 'instrument-lower', scroll: 0.8 },
  { route: '/onebit', name: 'onebit-hero', scroll: 0 },
  { route: '/onebit', name: 'onebit-hell', scroll: 0.46 },
  { route: '/onebit', name: 'onebit-lower', scroll: 0.82 },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const s of shots) {
  await page.goto(BASE + s.route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (s.scroll > 0) {
    await page.evaluate((frac) => {
      const max = document.body.scrollHeight - window.innerHeight;
      window.scrollTo(0, max * frac);
    }, s.scroll);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('shot', s.name);
}

await browser.close();
console.log('done');
