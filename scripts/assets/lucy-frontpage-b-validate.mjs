/** Mechanical-only validator for Variation B. Intentionally no image previews. */
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadSharp() {
  try { return require('sharp'); } catch {}
  const injected = process.env.SHARP_NODE_MODULES;
  if (injected) return createRequire(path.join(injected, 'sharp/package.json'))('sharp');
  const npxCache = path.join(os.homedir(), '.npm/_npx');
  if (existsSync(npxCache)) {
    for (const entry of readdirSync(npxCache)) {
      const packageJson = path.join(npxCache, entry, 'node_modules/sharp/package.json');
      if (existsSync(packageJson)) return createRequire(packageJson)('sharp');
    }
  }
  throw new Error('Sharp is required. Install it for this run or set SHARP_NODE_MODULES.');
}
const sharp = loadSharp();

const root = process.cwd();
const base = path.join(root, 'packages/site/src/assets/lucy/frontpage/variation-b');
const required = [
  ['hero/lucy-primary-desktop-2560x1080.webp', 2560, 1080], ['hero/lucy-alternate-desktop-2560x1080.webp', 2560, 1080],
  ['hero/lucy-primary-mobile-1440x2560.webp', 1440, 2560], ['hero/lucy-alternate-mobile-1440x2560.webp', 1440, 2560],
  ['backgrounds/lucy-bg-zero-desktop.webp', 2560, 1440], ['backgrounds/lucy-bg-heaven-desktop.webp', 2560, 1440],
  ['backgrounds/lucy-bg-hell-desktop.webp', 2560, 1440], ['backgrounds/lucy-bg-ultra-desktop.webp', 2560, 1440],
  ['social/lucy-og-1200x630.webp', 1200, 630], ['social/lucy-square-1080.webp', 1080, 1080],
  ['social/lucy-portrait-1080x1350.webp', 1080, 1350], ['social/lucy-story-1080x1920.webp', 1080, 1920],
  ['ASSET_MANIFEST.json'],
];
const transparent = ['hero/lucy-primary.webp', 'hero/lucy-alternate.webp', 'identity/lucy-horizontal-header.webp'];
const failures = [];
const checks = [];
for (const [rel, width, height] of required) {
  const target = path.join(base, rel);
  try {
    await fs.access(target);
    if (width) {
      const meta = await sharp(target).metadata();
      if (meta.width !== width || meta.height !== height || meta.format !== 'webp') throw new Error(`expected ${width}x${height} WebP; got ${meta.width}x${meta.height} ${meta.format}`);
    }
    checks.push(`PASS ${rel}`);
  } catch (error) { failures.push(`FAIL ${rel}: ${error.message}`); }
}
for (const rel of transparent) {
  try {
    const meta = await sharp(path.join(base, rel)).metadata();
    if (!meta.hasAlpha) throw new Error('alpha absent');
    checks.push(`PASS alpha ${rel}`);
  } catch (error) { failures.push(`FAIL alpha ${rel}: ${error.message}`); }
}
try {
  const heaven = await sharp(path.join(base, 'backgrounds/lucy-bg-heaven-desktop.webp')).ensureAlpha().raw().toBuffer();
  const hell = await sharp(path.join(base, 'backgrounds/lucy-bg-hell-desktop.webp')).ensureAlpha().raw().toBuffer();
  if (heaven.length !== hell.length) throw new Error('different raw buffer sizes');
  for (let index = 0; index < heaven.length; index += 4) {
    if (hell[index] !== 255 - heaven[index] || hell[index + 1] !== 255 - heaven[index + 1] || hell[index + 2] !== 255 - heaven[index + 2] || hell[index + 3] !== heaven[index + 3]) {
      throw new Error(`first non-inverted pixel at RGBA byte ${index}`);
    }
  }
  checks.push('PASS Hell background is exact RGB inversion of Heaven background');
} catch (error) { failures.push(`FAIL Hell inversion: ${error.message}`); }
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const item of entries) result.push(...(item.isDirectory() ? await walk(path.join(dir, item.name)) : [path.join(dir, item.name)]));
  return result;
}
const files = await walk(base);
const pngs = files.filter((file) => file.toLowerCase().endsWith('.png'));
if (pngs.length) failures.push(`FAIL tracked frontpage PNGs: ${pngs.map((p) => path.relative(root, p)).join(', ')}`);
const allWebps = files.filter((file) => file.endsWith('.webp'));
for (const file of allWebps) {
  try { await sharp(file).metadata(); } catch (error) { failures.push(`FAIL unreadable ${path.relative(root, file)}: ${error.message}`); }
}
const report = [
  '# Front Page Variation B — Mechanical Validation', '',
  `Status: ${failures.length ? 'FAIL' : 'PASS'}`, '',
  'Scope: file presence, WebP reopen, exact required dimensions, alpha for declared transparent references, and no tracked frontpage PNG. No visual review was performed by owner instruction.', '',
  `WebP files reopened: ${allWebps.length}`, `Tracked frontpage PNGs: ${pngs.length}`, '', '## Checks', ...checks.map((c) => `- ${c}`), '', '## Failures', ...(failures.length ? failures.map((f) => `- ${f}`) : ['- None']), ''
].join('\n');
const reportPath = path.join(root, 'docs/lucy/production/frontpage/VARIATION_B_VALIDATION.md');
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, report);
console.log(report);
process.exitCode = failures.length ? 1 : 0;
