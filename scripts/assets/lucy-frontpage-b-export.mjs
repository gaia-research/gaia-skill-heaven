/**
 * Deterministic materialization for Front Page Variation B — Ultra Judgment.
 *
 * This script does not generate or alter Lucy artwork. Every character pixel is
 * sourced from the accepted v2 masters (or the explicitly retained v1 Zero /
 * neutral exports). The one paid atlas is used only for opaque atmospheric
 * plates and abstract optical crops.
 */
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
const src = (...parts) => path.join(root, ...parts);
const out = (...parts) => src('packages/site/src/assets/lucy/frontpage/variation-b', ...parts);
const atlas = src('packages/site/assets/workbench/lucy/FRONTPAGE-B/raw/ultra-judgment-atlas-raw.png');

const copied = [];
const generated = [];

async function mkdir(file) { await fs.mkdir(path.dirname(file), { recursive: true }); }
async function copy(input, output) {
  await mkdir(output);
  await fs.copyFile(input, output);
  copied.push({ path: path.relative(root, output), source: path.relative(root, input) });
}
async function writeSvg(file, markup) {
  await mkdir(file);
  await fs.writeFile(file, markup);
  generated.push({ path: path.relative(root, file), source: 'deterministic SVG geometry' });
}
async function cover(input, output, width, height, position = 'centre') {
  await mkdir(output);
  await sharp(input).resize(width, height, { fit: 'cover', position }).webp({ quality: 92 }).toFile(output);
  generated.push({ path: path.relative(root, output), source: path.relative(root, input), width, height });
}
async function cropAtlas(output, width, height, region) {
  const meta = await sharp(atlas).metadata();
  const x = Math.floor(meta.width * region.x);
  const y = Math.floor(meta.height * region.y);
  const w = Math.floor(meta.width * region.w);
  const h = Math.floor(meta.height * region.h);
  await mkdir(output);
  await sharp(atlas).extract({ left: x, top: y, width: w, height: h })
    .resize(width, height, { fit: 'cover', position: region.position || 'centre' })
    .webp({ lossless: true }).toFile(output);
  generated.push({ path: path.relative(root, output), source: `${path.relative(root, atlas)} crop ${JSON.stringify(region)}`, width, height });
}
async function inverseAtlas(output, width, height, region) {
  const meta = await sharp(atlas).metadata();
  const x = Math.floor(meta.width * region.x);
  const y = Math.floor(meta.height * region.y);
  const w = Math.floor(meta.width * region.w);
  const h = Math.floor(meta.height * region.h);
  await mkdir(output);
  await sharp(atlas).extract({ left: x, top: y, width: w, height: h }).negate({ alpha: false })
    .resize(width, height, { fit: 'cover', position: region.position || 'centre' })
    .webp({ lossless: true }).toFile(output);
  generated.push({ path: path.relative(root, output), source: `exact RGB inversion of ${path.relative(root, atlas)} crop ${JSON.stringify(region)}`, width, height });
}
async function composite(background, character, output, width, height, config = {}) {
  const inset = config.inset ?? 0.075;
  const charWidth = Math.round(width * (config.charWidth ?? 0.48));
  const charHeight = Math.round(height * (config.charHeight ?? 0.92));
  const characterBuffer = await sharp(character).resize(charWidth, charHeight, { fit: 'contain' }).webp({ lossless: true }).toBuffer();
  await mkdir(output);
  await sharp(background).resize(width, height, { fit: 'cover', position: config.backgroundPosition || 'centre' })
    .composite([{ input: characterBuffer, left: Math.round(width * (config.left ?? (1 - inset - config.charWidth))), top: Math.round(height * (config.top ?? inset)) }])
    .webp({ quality: 92 }).toFile(output);
  generated.push({ path: path.relative(root, output), source: `accepted character ${path.relative(root, character)} composited over ${path.relative(root, background)}`, width, height });
}
async function header(output) {
  const width = 2560, height = 720;
  const ultra = await sharp(src('packages/site/src/assets/lucy/v2/masters/lucy-ultra.webp')).resize(760, 650, { fit: 'contain' }).toBuffer();
  const heaven = await sharp(src('packages/site/src/assets/lucy/v2/masters/lucy-heaven.webp')).resize(690, 620, { fit: 'contain' }).toBuffer();
  await mkdir(output);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: ultra, left: 240, top: 35 }, { input: heaven, left: 1540, top: 55 }])
    .webp({ lossless: true }).toFile(output);
  generated.push({ path: path.relative(root, output), source: 'accepted v2 Ultra + Heaven masters, no recolour or paint edits', width, height });
}

const v2 = (...parts) => src('packages/site/src/assets/lucy/v2', ...parts);
const v1 = (...parts) => src('packages/site/src/assets/lucy', ...parts);
const primary = v2('masters/lucy-ultra.webp');
const alternate = v2('masters/lucy-heaven.webp');
const heavenRegion = { x: 0.505, y: 0.045, w: 0.455, h: 0.435, position: 'centre' };
const ultraRegion = { x: 0.04, y: 0.045, w: 0.455, h: 0.435, position: 'centre' };
const zeroRegion = { x: 0.04, y: 0.515, w: 0.455, h: 0.42, position: 'centre' };
const outerTop = { x: 0.02, y: 0.0, w: 0.96, h: 0.085, position: 'centre' };
const outerBottom = { x: 0.02, y: 0.93, w: 0.96, h: 0.07, position: 'centre' };
const outerLeft = { x: 0.0, y: 0.05, w: 0.055, h: 0.88, position: 'centre' };
const outerRight = { x: 0.945, y: 0.05, w: 0.055, h: 0.88, position: 'centre' };

// P0: isolated master references and state reuses.
await copy(primary, out('hero/lucy-primary.webp'));
await copy(alternate, out('hero/lucy-alternate.webp'));
for (const [state, file] of Object.entries({
  zero: v1('states/lucy-zero.webp'), heaven: v2('states/lucy-heaven.webp'),
  hell: v2('states/lucy-hell.webp'), ultra: v2('states/lucy-ultra.webp'),
})) await copy(file, out(`states/lucy-${state}.webp`));
for (const [state, file] of Object.entries({
  zero: v1('states/panels/lucy-zero-panel.webp'), heaven: v2('states/panels/lucy-heaven-panel.webp'),
  hell: v2('states/panels/lucy-hell-panel.webp'), ultra: v2('states/panels/lucy-ultra-panel.webp'),
})) await copy(file, out(`states/panels/lucy-${state}-panel.webp`));

// P1 portraits, expressions, eyes, and modular production reuse.
for (const [state, file] of Object.entries({
  neutral: v1('portraits/lucy-neutral.webp'), zero: v1('portraits/lucy-zero.webp'),
  heaven: v2('portraits/lucy-heaven.webp'), hell: v2('portraits/lucy-hell.webp'), ultra: v2('portraits/lucy-ultra.webp'),
})) await copy(file, out(`portraits/lucy-${state}.webp`));
for (let index = 1; index <= 9; index++) await copy(v1(`components/expressions/lucy-expression-${String(index).padStart(2, '0')}.webp`), out(`components/expressions/lucy-expression-${String(index).padStart(2, '0')}.webp`));
for (const name of ['lucy-eyes-zero-closed.webp', 'lucy-eyes-zero-blank.webp', 'lucy-eyes-heaven.webp', 'lucy-eyes-hell.webp', 'lucy-eyes-ultra.webp']) await copy(v1(`components/eyes/${name}`), out(`components/eyes/${name}`));
await copy(v2('identity/lucy-heaven-diamond-eye.webp'), out('components/eyes/lucy-heaven-diamond-eye.webp'));
await copy(v2('identity/lucy-hell-red-tear.webp'), out('components/eyes/lucy-hell-red-tear.webp'));
for (const name of ['lucy-ribbon-zero.webp', 'lucy-ribbon-heaven.webp', 'lucy-ribbon-hell.webp', 'lucy-ribbon-ultra.webp', 'lucy-ribbon-airflow-01.webp', 'lucy-ribbon-airflow-02.webp', 'lucy-ribbon-airflow-03.webp', 'lucy-ribbon-airflow-04.webp']) {
  const input = name === 'lucy-ribbon-heaven.webp' ? v2(`components/ribbons/${name}`) : name === 'lucy-ribbon-hell.webp' ? v2(`components/ribbons/${name}`) : v1(`components/ribbons/${name}`);
  await copy(input, out(`components/ribbons/${name}`));
}
for (const state of ['heaven', 'hell']) for (const side of ['left', 'right', 'pair']) await copy(v2(`components/wings/lucy-wing-${state}-${side}.webp`), out(`components/wings/lucy-wing-${state}-${side}.webp`));
for (const side of ['left', 'right', 'pair']) await copy(v1(`components/wings/lucy-wing-ultra-${side}.webp`), out(`components/wings/lucy-wing-ultra-${side}.webp`));
for (let index = 1; index <= 20; index++) await copy(v1(`components/shards/lucy-shard-${String(index).padStart(2, '0')}.webp`), out(`components/shards/lucy-shard-${String(index).padStart(2, '0')}.webp`));
for (const state of ['heaven', 'hell', 'ultra']) await copy(v1(`components/shards/lucy-shard-cluster-${state}.webp`), out(`components/shards/lucy-shard-cluster-${state}.webp`));
// Use the one-shot authority atlas for every weapon component.  This keeps
// Variation B byte-identical to Variation A and prevents a rerun from
// restoring the retired generic kit.
for (const name of ['lucy-katana-neutral-steel.webp', 'lucy-katana-unsheathed.webp', 'lucy-katana-left.webp', 'lucy-katana-right.webp', 'lucy-katana-sheathed.webp', 'lucy-katana-saya.webp', 'lucy-katana-handle.webp', 'lucy-katana-dual.webp', 'lucy-katana-zero.webp', 'lucy-katana-heaven.webp', 'lucy-katana-hell.webp', 'lucy-katana-ultra.webp', 'lucy-katana-slash-01.webp', 'lucy-katana-slash-02.webp', 'lucy-katana-slash-03.webp']) await copy(src(`packages/site/src/assets/lucy/frontpage/katana-authority-v2/${name}`), out(`components/katana/${name}`));

// Atlas crops become opaque optical plates only. Hell is the deterministic full inversion of Heaven.
await cropAtlas(out('backgrounds/lucy-bg-ultra-desktop.webp'), 2560, 1440, ultraRegion);
await cropAtlas(out('backgrounds/lucy-bg-heaven-desktop.webp'), 2560, 1440, heavenRegion);
await inverseAtlas(out('backgrounds/lucy-bg-hell-desktop.webp'), 2560, 1440, heavenRegion);
await cropAtlas(out('backgrounds/lucy-bg-zero-desktop.webp'), 2560, 1440, zeroRegion);

// P0 compositions; character sources remain unmodified inputs at each composite stage.
await composite(out('backgrounds/lucy-bg-ultra-desktop.webp'), primary, out('hero/lucy-primary-desktop-2560x1080.webp'), 2560, 1080, { charWidth: 0.44, charHeight: 0.92, left: 0.54, top: 0.04 });
await composite(out('backgrounds/lucy-bg-heaven-desktop.webp'), alternate, out('hero/lucy-alternate-desktop-2560x1080.webp'), 2560, 1080, { charWidth: 0.44, charHeight: 0.92, left: 0.04, top: 0.04 });
await composite(out('backgrounds/lucy-bg-ultra-desktop.webp'), primary, out('hero/lucy-primary-mobile-1440x2560.webp'), 1440, 2560, { charWidth: 0.90, charHeight: 0.72, left: 0.05, top: 0.19 });
await composite(out('backgrounds/lucy-bg-heaven-desktop.webp'), alternate, out('hero/lucy-alternate-mobile-1440x2560.webp'), 1440, 2560, { charWidth: 0.90, charHeight: 0.72, left: 0.05, top: 0.19 });

// P2 optical exports: crop only abstract outer atlas bands; no alpha is claimed for opaque optical plates.
for (const [name, region] of Object.entries({
  'lucy-particles-ultra.webp': outerTop, 'lucy-particles-heaven.webp': outerRight,
  'lucy-filament-ultra.webp': outerLeft, 'lucy-filament-heaven.webp': outerRight,
  'lucy-caustics-ultra.webp': outerTop, 'lucy-caustics-heaven.webp': outerRight,
  'lucy-flare-ultra.webp': outerLeft, 'lucy-flare-heaven.webp': outerRight,
  'lucy-reflection-prismatic.webp': outerBottom, 'lucy-aura-ultra.webp': ultraRegion,
  'lucy-aura-heaven.webp': heavenRegion, 'lucy-dust-zero.webp': zeroRegion,
  'lucy-trail-ultra.webp': outerBottom, 'lucy-trail-heaven.webp': outerRight,
  'lucy-shard-band-ultra.webp': outerLeft, 'lucy-shard-band-heaven.webp': outerRight,
})) await cropAtlas(out(`fx/${name}`), 1280, 360, region);
await inverseAtlas(out('fx/lucy-fragment-hell.webp'), 1280, 360, outerRight);
await inverseAtlas(out('fx/lucy-aura-hell.webp'), 1280, 360, heavenRegion);
await inverseAtlas(out('fx/lucy-caustics-hell.webp'), 1280, 360, outerRight);
for (const [state, region] of Object.entries({ ultra: ultraRegion, heaven: heavenRegion, zero: zeroRegion })) await cropAtlas(out(`identity/lucy-divider-${state}.webp`), 1920, 240, region);
await inverseAtlas(out('identity/lucy-divider-hell.webp'), 1920, 240, heavenRegion);

const svgShell = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">${body}</svg>`;
await writeSvg(out('identity/lucy-state-icon-zero.svg'), svgShell('<circle cx="64" cy="64" r="30" stroke="#37D6E0" stroke-width="8"/><path d="M38 64h52" stroke="#37D6E0" stroke-width="8"/>'));
await writeSvg(out('identity/lucy-state-icon-heaven.svg'), svgShell('<path d="m64 15 34 49-34 49-34-49z" stroke="#7CC4FF" stroke-width="8"/><path d="m64 31 18 33-18 33-18-33z" fill="#7CC4FF"/>'));
await writeSvg(out('identity/lucy-state-icon-hell.svg'), svgShell('<path d="m64 15 34 49-34 49-34-49z" stroke="#FF183B" stroke-width="8"/><path d="m64 31 18 33-18 33-18-33z" fill="#0A0A0A"/>'));
await writeSvg(out('identity/lucy-state-icon-ultra.svg'), svgShell('<path d="m64 12 38 52-38 52-38-52z" stroke="#FFD24A" stroke-width="8"/><path d="m64 28 21 36-21 36-21-36z" fill="#FFD24A"/>'));
await writeSvg(out('identity/lucy-diamond-eye.svg'), svgShell('<path d="m64 12 40 52-40 52-40-52z" fill="#7CC4FF"/><path d="m64 33 19 31-19 31-19-31z" fill="#FFFFFF"/>'));
await writeSvg(out('identity/lucy-red-tear.svg'), svgShell('<path d="M64 18c-17 24-24 38-24 54a24 24 0 0 0 48 0c0-16-7-30-24-54Z" fill="#FF183B"/>'));
for (const [state, color] of Object.entries({ heaven: '#7CC4FF', hell: '#FF183B', ultra: '#FFD24A' })) await writeSvg(out(`identity/lucy-wing-emblem-${state}.svg`), svgShell(`<path d="M18 91 64 19l46 72-46-22z" fill="${color}"/><path d="m18 91 46-22 46 22-46 18z" fill="${color}" opacity=".55"/>`));
await copy(v1('identity/lucy-avatar-zero.webp'), out('identity/lucy-avatar-zero.webp'));
await copy(v2('identity/lucy-avatar-heaven.webp'), out('identity/lucy-avatar-heaven.webp'));
await header(out('identity/lucy-horizontal-header.webp'));

// P3 follows Variation B campaign hierarchy: Ultra primary, Heaven alternate.
await composite(out('backgrounds/lucy-bg-ultra-desktop.webp'), primary, out('social/lucy-og-1200x630.webp'), 1200, 630, { charWidth: 0.45, charHeight: 0.92, left: 0.52, top: 0.04 });
await composite(out('backgrounds/lucy-bg-ultra-desktop.webp'), primary, out('social/lucy-square-1080.webp'), 1080, 1080, { charWidth: 0.82, charHeight: 0.82, left: 0.09, top: 0.10 });
await composite(out('backgrounds/lucy-bg-heaven-desktop.webp'), alternate, out('social/lucy-portrait-1080x1350.webp'), 1080, 1350, { charWidth: 0.86, charHeight: 0.84, left: 0.07, top: 0.10 });
await composite(out('backgrounds/lucy-bg-ultra-desktop.webp'), primary, out('social/lucy-story-1080x1920.webp'), 1080, 1920, { charWidth: 0.90, charHeight: 0.76, left: 0.05, top: 0.16 });

const all = [...copied, ...generated];
const manifest = {
  variation: 'B — Ultra Judgment',
  contract: 'One gpt-image-2 atmospheric atlas; accepted character masters are reused without character-pixel edits. Hell background is exact RGB inversion of the Heaven plate.',
  paidGeneration: { model: 'gpt-image-2', calls: 1, raw: path.relative(root, atlas) },
  sourceGaps: {
    isolatedHair: 'Unavailable: no accepted separate hair layers exist; not fabricated.'
  },
  assets: all,
};
await fs.writeFile(out('ASSET_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Variation B exports: ${all.length} assets plus manifest.`);
