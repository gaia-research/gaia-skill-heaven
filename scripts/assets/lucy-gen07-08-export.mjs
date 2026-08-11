#!/usr/bin/env node
/**
 * Deterministic one-shot export for Lucy GEN-07 / GEN-08 atlases.
 *
 * Run with:
 * npx -y --package=sharp node scripts/assets/lucy-gen07-08-export.mjs
 *
 * The generated source atlases are deliberately retained under the ignored
 * workbench. This script only removes the requested chroma field, crops the
 * documented non-overlapping atlas regions, and creates simple identity SVGs.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
  throw new Error('Sharp is required. Install it for this run or set SHARP_NODE_MODULES to its node_modules directory.');
}
const sharp = loadSharp();

const root = process.cwd();
const workbench = path.join(root, 'packages/site/assets/workbench/lucy');
const output = path.join(root, 'packages/site/src/assets/lucy');
const chromaTool = '/Users/marcotiongson/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py';
const jobs = {
  'GEN-07': {
    raw: path.join(workbench, 'GEN-07/raw/GEN-07-atlas-raw.png'),
    alpha: path.join(workbench, 'GEN-07/intermediate/GEN-07-atlas-alpha.png'),
  },
  'GEN-08': {
    raw: path.join(workbench, 'GEN-08/raw/GEN-08-atlas-raw.png'),
    alpha: path.join(workbench, 'GEN-08/intermediate/GEN-08-atlas-alpha.png'),
  },
};

const made = [];
async function ensure(file) { await mkdir(path.dirname(file), { recursive: true }); }
async function cut(source, left, top, width, height, destination) {
  await ensure(destination);
  await sharp(source).extract({ left, top, width, height }).webp({ lossless: true }).toFile(destination);
  made.push(destination);
}
async function cropPair(source, leftFile, rightFile, destination) {
  const [left, right] = await Promise.all([sharp(leftFile).metadata(), sharp(rightFile).metadata()]);
  const width = (left.width ?? 1) + (right.width ?? 1) + 48;
  const height = Math.max(left.height ?? 1, right.height ?? 1);
  await ensure(destination);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: leftFile, left: 0, top: 0 }, { input: rightFile, left: (left.width ?? 1) + 48, top: 0 }])
    .webp({ lossless: true }).toFile(destination);
  made.push(destination);
}
async function writeSvg(relative, svg) {
  const svgPath = path.join(output, relative);
  const webpPath = svgPath.replace(/\.svg$/, '.webp');
  await ensure(svgPath);
  await writeFile(svgPath, svg);
  await sharp(Buffer.from(svg)).webp({ lossless: true }).toFile(webpPath);
  made.push(svgPath, webpPath);
}
async function divider(name, ribbon, particles, caustics) {
  const destination = path.join(output, 'identity', `lucy-divider-${name}.webp`);
  const [ribbonLayer, particleLayer, causticLayer] = await Promise.all([
    sharp(ribbon).resize({ width: 1540, height: 214, fit: 'contain' }).toBuffer(),
    sharp(particles).resize({ width: 1420, height: 180, fit: 'contain' }).toBuffer(),
    sharp(caustics).resize({ width: 1720, height: 130, fit: 'contain' }).toBuffer(),
  ]);
  await ensure(destination);
  await sharp({ create: { width: 1920, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: particleLayer, left: 250, top: 31 },
      { input: causticLayer, left: 100, top: 55 },
      { input: ribbonLayer, left: 190, top: 13 },
    ])
    .webp({ lossless: true }).toFile(destination);
  made.push(destination);
}
async function effectCopy(name, source) {
  const destination = path.join(output, 'fx', `${name}.webp`);
  await ensure(destination);
  await sharp(source).webp({ lossless: true }).toFile(destination);
  made.push(destination);
  return destination;
}
async function effectComposite(name, first, second) {
  const firstMeta = await sharp(first).metadata();
  const destination = path.join(output, 'fx', `${name}.webp`);
  const secondLayer = await sharp(second).resize({ width: firstMeta.width, height: firstMeta.height, fit: 'contain' }).toBuffer();
  await ensure(destination);
  await sharp(first).composite([{ input: secondLayer }]).webp({ lossless: true }).toFile(destination);
  made.push(destination);
  return destination;
}
async function semanticReviewSheet(files) {
  const tileW = 300, tileH = 150, columns = 4, padding = 18;
  const rows = Math.ceil(files.length / columns);
  const checker = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}"><defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#17202b"/><path d="M0 0h12v12H0zm12 12h12v12H12z" fill="#eef1f4"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
  const layers = [];
  for (let index = 0; index < files.length; index++) {
    const preview = await sharp(files[index]).resize({ width: tileW, height: tileH, fit: 'contain' }).toBuffer();
    const left = padding + (index % columns) * (tileW + padding);
    const top = padding + Math.floor(index / columns) * (tileH + padding);
    layers.push({ input: Buffer.from(checker), left, top }, { input: preview, left, top });
  }
  const destination = path.join(workbench, 'GEN-08/intermediate/GEN-08-semantic-fx-review.png');
  await sharp({ create: { width: padding + columns * (tileW + padding), height: padding + rows * (tileH + padding), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite(layers).png().toFile(destination);
  return destination;
}
function iconSvg(kind) {
  const common = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"';
  const defs = '<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="#37d6e0"/><stop offset="1" stop-color="#265bff"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4ae"/><stop offset=".45" stop-color="#ffd24a"/><stop offset="1" stop-color="#bd7a00"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb1df"/><stop offset=".5" stop-color="#e72062"/><stop offset="1" stop-color="#170a28"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="9"/></filter></defs>';
  const diamond = '<path d="M256 77 394 256 256 435 118 256 256 77Z" fill="url(#c)" stroke="#fff" stroke-width="14"/><path d="m256 77 0 358M118 256h276M256 77l138 179-138 179-138-179L256 77Z" stroke="#fff" stroke-opacity=".65" stroke-width="7"/>';
  if (kind === 'zero') return `<svg ${common}>${defs}<circle cx="256" cy="256" r="147" stroke="#37d6e0" stroke-opacity=".5" stroke-width="11"/><path d="M132 256c54-69 194-69 248 0-54 69-194 69-248 0Z" stroke="url(#c)" stroke-width="18"/><path d="M187 256h138" stroke="#fff" stroke-width="12" stroke-linecap="round"/></svg>`;
  if (kind === 'heaven') return `<svg ${common}>${defs}<path d="M64 256 188 126l58 89 55-89 147 130-147 130-55-89-58 89L64 256Z" fill="url(#c)" opacity=".45" filter="url(#b)"/>${diamond}</svg>`;
  if (kind === 'hell') return `<svg ${common}>${defs}<path d="M256 77 394 256 256 435 118 256 256 77Z" fill="url(#h)" stroke="#170a28" stroke-width="14"/><path d="m256 77 0 358M118 256h276" stroke="#ffb1df" stroke-width="7"/><path d="M256 326c-47 55-38 105 0 137 38-32 47-82 0-137Z" fill="#ff263b" stroke="#fff0f5" stroke-width="6"/></svg>`;
  if (kind === 'ultra') return `<svg ${common}>${defs}<path d="M256 54 420 256 256 458 92 256 256 54Z" fill="url(#g)" opacity=".48" filter="url(#b)"/>${diamond.replaceAll('url(#c)', 'url(#g)')}</svg>`;
  if (kind === 'diamond-eye') return `<svg ${common}>${defs}<path d="M57 256c91-128 307-128 398 0-91 128-307 128-398 0Z" fill="#071426" stroke="url(#c)" stroke-width="18"/>${diamond}</svg>`;
  if (kind === 'red-tear') return `<svg ${common}>${defs}<path d="M256 57C183 165 146 230 146 307c0 65 49 126 110 126s110-61 110-126c0-77-37-142-110-250Z" fill="#ff263b" stroke="#fff2f7" stroke-width="12"/><path d="M211 296c0-36 16-77 45-126" stroke="#ffb1ce" stroke-width="16" stroke-linecap="round"/></svg>`;
  const wing = kind.replace('wing-', '');
  const fill = wing === 'heaven' ? 'url(#c)' : wing === 'hell' ? 'url(#h)' : 'url(#g)';
  const shards = wing === 'hell'
    ? '<path d="M77 283 186 75l42 142 55-91 44 158 96-40-83 131-75-61-76 97-17-137-95 89Z"/>'
    : '<path d="M65 288 174 74l55 136 58-99 44 142 106-60-85 148-89-59-83 112-22-146-93 94Z"/>';
  return `<svg ${common}>${defs}<g fill="${fill}" stroke="#fff" stroke-opacity=".8" stroke-width="7">${shards}</g><path d="M108 305 187 221l46 90 54-74 42 80 76-65" stroke="#fff" stroke-width="11"/></svg>`;
}

for (const job of Object.values(jobs)) {
  await mkdir(path.dirname(job.alpha), { recursive: true });
  execFileSync('python3', [chromaTool, '--input', job.raw, '--out', job.alpha, '--key-color', '#00ff00', '--soft-matte', '--transparent-threshold', '12', '--opaque-threshold', '220', '--despill', '--force'], { stdio: 'inherit' });
  const { width, height } = await sharp(job.alpha).metadata();
  for (const [name, a, b] of [['normal', '#16202b', '#e8edf3'], ['inverted', '#f4f1e9', '#131019']]) {
    const checker = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="${a}"/><path d="M0 0h24v24H0zm24 24h24v24H24z" fill="${b}"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
    await sharp(Buffer.from(checker)).composite([{ input: job.alpha }]).png().toFile(path.join(path.dirname(job.alpha), `${path.basename(job.alpha, '.png')}-checker-${name}.png`));
  }
}

const a7 = jobs['GEN-07'].alpha;
const wingDir = path.join(output, 'components/wings');
const wings = {
  'heaven-left': [8, 10, 286, 416], 'heaven-right': [288, 10, 270, 416],
  'hell-left': [555, 10, 240, 430], 'hell-right': [790, 10, 235, 430],
  'ultra-left': [1012, 8, 252, 430], 'ultra-right': [1252, 8, 276, 430],
};
for (const [name, box] of Object.entries(wings)) await cut(a7, ...box, path.join(wingDir, `lucy-wing-${name}.webp`));
for (const state of ['heaven', 'hell', 'ultra']) await cropPair(a7, path.join(wingDir, `lucy-wing-${state}-left.webp`), path.join(wingDir, `lucy-wing-${state}-right.webp`), path.join(wingDir, `lucy-wing-${state}-pair.webp`));

const shardBoxes = [
  [45,440,65,240],[112,440,70,240],[190,440,73,240],[274,440,55,240],[337,440,55,240],
  [398,440,55,240],[452,440,40,240],[500,440,40,240],[40,652,38,165],[88,650,38,165],
  [135,650,38,165],[185,650,38,165],[239,650,34,165],[287,650,34,165],[332,650,34,165],
  [400,650,34,165],[440,650,34,165],[480,650,34,165],[520,650,34,165],[560,650,34,165],
];
for (let i = 0; i < shardBoxes.length; i++) await cut(a7, ...shardBoxes[i], path.join(output, 'components/shards', `lucy-shard-${String(i + 1).padStart(2, '0')}.webp`));
await cut(a7, 20, 430, 520, 570, path.join(output, 'components/shards/lucy-shard-cluster-heaven.webp'));
await cut(a7, 540, 430, 500, 570, path.join(output, 'components/shards/lucy-shard-cluster-hell.webp'));
await cut(a7, 1030, 430, 500, 570, path.join(output, 'components/shards/lucy-shard-cluster-ultra.webp'));

const a8 = jobs['GEN-08'].alpha;
const ribbons = [[20,20,360,220],[390,20,380,220],[780,20,390,220],[1140,20,370,220],[40,260,370,230],[430,260,250,230],[680,260,360,230],[1060,260,430,230]];
const ribbonNames = ['zero','heaven','hell','ultra','airflow-01','airflow-02','airflow-03','airflow-04'];
for (let i = 0; i < ribbons.length; i++) await cut(a8, ...ribbons[i], path.join(output, 'components/ribbons', `lucy-ribbon-${ribbonNames[i]}.webp`));
const fxRows = { particles: [20,490,500,120], caustics: [20,610,500,90], 'slash': [20,690,500,85], aura: [20,765,500,90], 'glass-dust': [20,845,500,75], 'shard-trail': [20,915,500,100] };
const states = ['cyan','inverted','gold'];
for (const [kind, [left, top, width, height]] of Object.entries(fxRows)) {
  for (let i = 0; i < states.length; i++) {
    const name = kind === 'slash' ? `lucy-katana-slash-${String(i + 1).padStart(2, '0')}.webp` : `lucy-${kind}-${states[i]}.webp`;
    await cut(a8, left + i * 505, top, width, height, path.join(output, kind === 'slash' ? 'components/katana' : 'fx', name));
  }
}
await divider('zero', path.join(output, 'components/ribbons/lucy-ribbon-zero.webp'), path.join(output, 'fx/lucy-particles-cyan.webp'), path.join(output, 'fx/lucy-caustics-cyan.webp'));
await divider('heaven', path.join(output, 'components/ribbons/lucy-ribbon-heaven.webp'), path.join(output, 'fx/lucy-particles-cyan.webp'), path.join(output, 'fx/lucy-caustics-cyan.webp'));
await divider('hell', path.join(output, 'components/ribbons/lucy-ribbon-hell.webp'), path.join(output, 'fx/lucy-particles-inverted.webp'), path.join(output, 'fx/lucy-caustics-inverted.webp'));
await divider('ultra', path.join(output, 'components/ribbons/lucy-ribbon-ultra.webp'), path.join(output, 'fx/lucy-particles-gold.webp'), path.join(output, 'fx/lucy-caustics-gold.webp'));

// Semantic aliases keep the expanded commission vocabulary useful without
// pretending the one-shot atlas supplied separate source paintings.
const semanticFx = [
  ['lucy-glass-flecks', 'lucy-particles-cyan'],
  ['lucy-spectral-specks', 'lucy-particles-cyan'],
  ['lucy-light-streaks', 'lucy-caustics-cyan'],
  ['lucy-micro-shards', 'lucy-particles-cyan'],
  ['lucy-optical-filaments', 'lucy-caustics-cyan'],
  ['lucy-hell-red-fragments', 'lucy-particles-inverted'],
  ['lucy-ultra-gold-sparks', 'lucy-particles-gold'],
  ['lucy-cyan-white-bloom', 'lucy-aura-cyan'],
  ['lucy-chromatic-aberration-streak', 'lucy-caustics-inverted'],
  ['lucy-glass-reflection', 'lucy-caustics-cyan'],
  ['lucy-spectral-band', 'lucy-caustics-gold'],
  ['lucy-refraction-arc', '../components/ribbons/lucy-ribbon-airflow-03'],
  ['lucy-aura-zero', 'lucy-aura-cyan'],
  ['lucy-aura-heaven', 'lucy-aura-cyan'],
  ['lucy-aura-hell', 'lucy-aura-inverted'],
  ['lucy-aura-ultra', 'lucy-aura-gold'],
];
const semanticOutputs = [];
for (const [name, source] of semanticFx) {
  const input = source.startsWith('..') ? path.join(output, 'fx', source) : path.join(output, 'fx', `${source}.webp`);
  semanticOutputs.push(await effectCopy(name, input.endsWith('.webp') ? input : `${input}.webp`));
}
semanticOutputs.push(await effectComposite('lucy-rainbow-edge-flare', path.join(output, 'fx/lucy-caustics-cyan.webp'), path.join(output, 'fx/lucy-caustics-gold.webp')));
await semanticReviewSheet(semanticOutputs);

for (const name of ['zero','heaven','hell','ultra','diamond-eye','red-tear','wing-heaven','wing-hell','wing-ultra']) await writeSvg(`identity/lucy-${name.startsWith('wing-') ? name : name === 'diamond-eye' || name === 'red-tear' ? name : `state-icon-${name}`}.svg`, iconSvg(name));

const manifest = {
  source: 'GEN-07 / GEN-08 frozen one-shot atlases',
  extraction: 'chroma removal then fixed atlas bounding boxes; see scripts/assets/lucy-gen07-08-export.mjs',
  wings: Object.fromEntries(['heaven','hell','ultra'].map((state) => [state, { left: `lucy-wing-${state}-left.webp`, right: `lucy-wing-${state}-right.webp`, pair: `lucy-wing-${state}-pair.webp` }])),
  ribbons: ribbonNames,
};
await writeFile(path.join(wingDir, 'lucy-gen07-08-assembly-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Exported ${made.length} production files.`);
