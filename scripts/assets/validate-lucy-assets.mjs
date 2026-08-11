#!/usr/bin/env node
/**
 * Lucy production release gate.
 *
 * This is metadata-only: it never edits an image. It reopens every WebP through
 * the Gaia production Sharp runtime, inventories production assets, and writes
 * the current manifest and report under docs/lucy/production/.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const assetsRoot = path.join(root, 'packages/site/src/assets/lucy');
const productionRoot = path.join(root, 'docs/lucy/production');
const runsRoot = path.join(productionRoot, 'runs');
const manifestPath = path.join(productionRoot, 'FINAL_ASSET_MANIFEST.json');
const reportPath = path.join(productionRoot, 'VALIDATION_REPORT.md');
const requiredReceipts = ['DERIVATIVES.md', ...Array.from({ length: 8 }, (_, i) => `GEN-${String(i + 1).padStart(2, '0')}.md`)];
const permittedPng = 'authority/lucy-character-sheet-master.png';
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
  throw new Error('Sharp is required to reopen WebPs. Set SHARP_NODE_MODULES or install Sharp for this run.');
}
const sharp = loadSharp();

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await walk(target));
    else if (entry.isFile()) results.push(target);
  }
  return results;
}
function rel(file) { return path.relative(assetsRoot, file).replaceAll(path.sep, '/'); }
function receiptRel(file) { return path.relative(root, file).replaceAll(path.sep, '/'); }
function expectedPaths() {
  const p = [];
  const add = (target, dimensions = null, note = null) => p.push({ path: target, dimensions, note });
  add('authority/lucy-character-sheet-master.png');
  add('authority/lucy-original-reference.jpg');
  add('hero/lucy-ultra-primary.webp');
  add('hero/lucy-ultra-desktop-wide.webp', { width: 2560, height: 1080 });
  add('hero/lucy-heaven-alternate.webp');
  add('hero/lucy-heaven-desktop-wide.webp', { width: 2560, height: 1080 });
  for (const state of ['zero', 'heaven', 'hell', 'ultra']) add(`states/lucy-${state}.webp`);
  add('states/lucy-hell-white.webp');
  for (const state of ['zero', 'heaven', 'hell', 'ultra']) add(`states/panels/lucy-${state}-panel.webp`, { ratio: [4, 5] }, 'production plan specifies 4:5');
  add('models/lucy-neutral.webp');
  for (const state of ['neutral', 'zero', 'heaven', 'hell', 'ultra']) add(`portraits/lucy-${state}.webp`);
  for (let i = 1; i <= 9; i++) add(`components/expressions/lucy-expression-${String(i).padStart(2, '0')}.webp`);
  for (const state of ['zero-closed', 'zero-blank', 'heaven', 'hell', 'ultra']) add(`components/eyes/lucy-eyes-${state}.webp`);
  for (const state of ['neutral', 'upward', 'inverted', 'ultra']) add(`components/hair/lucy-hair-${state}.webp`);
  for (const state of ['zero', 'heaven', 'hell', 'ultra', 'airflow-01', 'airflow-02', 'airflow-03', 'airflow-04']) add(`components/ribbons/lucy-ribbon-${state}.webp`);
  for (const state of ['heaven', 'hell', 'ultra']) for (const side of ['left', 'right']) add(`components/wings/lucy-wing-${state}-${side}.webp`);
  for (let i = 1; i <= 20; i++) add(`components/shards/lucy-shard-${String(i).padStart(2, '0')}.webp`);
  for (const name of ['neutral-steel', 'sheathed', 'saya', 'handle', 'left', 'right', 'dual']) add(`components/katana/lucy-katana-${name}.webp`);
  for (let i = 1; i <= 3; i++) add(`components/katana/lucy-katana-slash-${String(i).padStart(2, '0')}.webp`);
  for (const state of ['zero', 'heaven', 'hell', 'ultra']) add(`backgrounds/lucy-bg-${state}-desktop.webp`, { width: 2560, height: 1440 });
  for (const kind of ['particles', 'caustics', 'aura', 'glass-dust', 'shard-trail']) for (const state of ['cyan', 'inverted', 'gold']) add(`fx/lucy-${kind}-${state}.webp`);
  for (const state of ['zero', 'heaven', 'hell', 'ultra']) {
    add(`identity/lucy-divider-${state}.webp`, { width: 1920, height: 240 }, 'dimension recorded in GEN-08 receipt');
    add(`identity/lucy-state-icon-${state}.svg`);
    add(`identity/lucy-state-icon-${state}.webp`);
  }
  for (const motif of ['diamond-eye', 'red-tear', 'wing-heaven', 'wing-hell', 'wing-ultra']) {
    add(`identity/lucy-${motif}.svg`);
    add(`identity/lucy-${motif}.webp`);
  }
  for (const state of ['zero', 'heaven']) add(`identity/lucy-avatar-${state}.webp`);
  add('identity/lucy-horizontal-header.webp');
  add('social/lucy-og-1200x630.webp', { width: 1200, height: 630 });
  add('social/lucy-square-1080.webp', { width: 1080, height: 1080 });
  add('social/lucy-portrait-1080x1350.webp', { width: 1080, height: 1350 });
  add('social/lucy-story-1080x1920.webp', { width: 1080, height: 1920 });
  add('mobile/lucy-ultra-hero-1440x2560.webp', { width: 1440, height: 2560 });
  add('mobile/lucy-heaven-hero-1440x2560.webp', { width: 1440, height: 2560 });
  for (const state of ['zero', 'heaven', 'hell', 'ultra']) add(`assemblies/lucy-${state}-assembly.json`, null, 'completion-rule assembly manifest');
  return p;
}
function dimensionsPass(actual, expected) {
  if (!expected) return true;
  if (expected.width) return actual.width === expected.width && actual.height === expected.height;
  const [x, y] = expected.ratio;
  return actual.width * y === actual.height * x;
}
function blocksFromReceipt(name, contents) {
  const lines = contents.split(/\r?\n/);
  const blocks = [];
  let active = false;
  for (const line of lines) {
    if (/^#{1,3}\s+.*(?:blocked|limitations|not claimed|deliberately not invented)/i.test(line)) { active = true; continue; }
    if (/^#{1,3}\s/.test(line)) { active = false; continue; }
    const cleaned = line.replace(/^\s*[-*]\s+/, '').trim();
    if (active && cleaned && !cleaned.startsWith('```') && !cleaned.startsWith('|')) blocks.push({ receipt: name, text: cleaned });
    else if (/^\[!\]\s*Blocked:|^Blocked\s*\/\s*not claimed:/i.test(cleaned)) blocks.push({ receipt: name, text: cleaned });
  }
  return blocks.filter((item, index, array) => item.text.length > 4 && array.findIndex((other) => other.receipt === item.receipt && other.text === item.text) === index);
}

const assetFiles = (await walk(assetsRoot)).sort();
const files = [];
for (const file of assetFiles) {
  const relative = rel(file);
  const extension = path.extname(file).slice(1).toLowerCase();
  const stats = await stat(file);
  const entry = { path: relative, bytes: stats.size, type: extension || 'none', width: null, height: null, alpha: null, reopened: false };
  if (['webp', 'png', 'jpg', 'jpeg'].includes(extension)) {
    try {
      const metadata = await sharp(file).metadata();
      entry.width = metadata.width ?? null;
      entry.height = metadata.height ?? null;
      entry.alpha = metadata.hasAlpha ?? false;
      entry.reopened = extension === 'webp';
    } catch (error) { entry.error = String(error); }
  }
  files.push(entry);
}
const byPath = new Map(files.map((file) => [file.path, file]));
const requirements = expectedPaths().map((requirement) => {
  const actual = byPath.get(requirement.path);
  return { ...requirement, present: Boolean(actual), dimensionsPass: actual ? dimensionsPass(actual, requirement.dimensions) : false, actual: actual ? { width: actual.width, height: actual.height, alpha: actual.alpha } : null };
});
const missing = requirements.filter((requirement) => !requirement.present);
const dimensionFailures = requirements.filter((requirement) => requirement.present && !requirement.dimensionsPass);
const pngViolations = files.filter((file) => file.type === 'png' && file.path !== permittedPng).map((file) => file.path);
const missingReceipts = requiredReceipts.filter((name) => !existsSync(path.join(runsRoot, name)));
const blocked = [];
for (const receipt of requiredReceipts) {
  const receiptPath = path.join(runsRoot, receipt);
  if (existsSync(receiptPath)) blocked.push(...blocksFromReceipt(receipt, await readFile(receiptPath, 'utf8')));
}
const counts = Object.fromEntries([...new Set(files.map((file) => file.type))].sort().map((type) => [type, files.filter((file) => file.type === type).length]));
const manifest = {
  schema: 'lucy-production-final-manifest/v1',
  generatedAt: new Date().toISOString(),
  validator: 'scripts/assets/validate-lucy-assets.mjs',
  productionRoot: 'packages/site/src/assets/lucy',
  files,
  countsByType: counts,
  requiredReceipts,
  missingReceipts,
  requiredPaths: requirements,
  missingRequiredPaths: missing.map((item) => item.path),
  dimensionFailures: dimensionFailures.map((item) => ({ path: item.path, expected: item.dimensions, actual: item.actual })),
  pngPolicy: { permitted: permittedPng, violations: pngViolations },
  blockedFromReceipts: blocked,
  releaseGatePass: missing.length === 0 && dimensionFailures.length === 0 && pngViolations.length === 0 && missingReceipts.length === 0,
};
await mkdir(productionRoot, { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const list = (items, render) => items.length ? items.map(render).join('\n') : '- None';
const report = `# Lucy Production Validation Report\n\nGenerated by \`scripts/assets/validate-lucy-assets.mjs\` at ${manifest.generatedAt}. This was a metadata-only pass: every WebP was reopened through Sharp; no image bytes were changed.\n\n## Gate result\n\n- **${manifest.releaseGatePass ? 'PASS' : 'FAIL'}** — missing required paths: ${missing.length}; dimension failures: ${dimensionFailures.length}; PNG policy violations: ${pngViolations.length}; missing receipts: ${missingReceipts.length}.\n- Inventory: ${files.length} production files (${Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ')}).\n- WebPs reopened: ${files.filter((file) => file.type === 'webp' && file.reopened).length}.\n\n## Missing required production paths\n\n${list(missing, (item) => `- \`${item.path}\`${item.note ? ` — ${item.note}` : ''}`)}\n\n## Dimension failures\n\n${list(dimensionFailures, (item) => `- \`${item.path}\` expected ${JSON.stringify(item.dimensions)}, got ${item.actual.width}×${item.actual.height}`)}\n\n## PNG policy\n\nAllowed PNG authority master: \`${permittedPng}\`.\n\n${list(pngViolations, (item) => `- Unexpected production PNG: \`${item}\``)}\n\n## Required receipts\n\n${list(missingReceipts, (item) => `- Missing: \`${item}\``)}\n\n## Honest blocks quoted from receipts\n\n${list(blocked, (item) => `- **${item.receipt.replace('.md', '')}:** ${item.text}`)}\n\n## Artifact\n\nFull per-file inventory (path, bytes, dimensions, alpha, and reopen status): [FINAL_ASSET_MANIFEST.json](FINAL_ASSET_MANIFEST.json).\n`;
await writeFile(reportPath, report);
console.log(JSON.stringify({ report: receiptRel(reportPath), manifest: receiptRel(manifestPath), releaseGatePass: manifest.releaseGatePass, files: files.length, webpsReopened: files.filter((file) => file.type === 'webp' && file.reopened).length, missing: missing.map((item) => item.path), dimensionFailures: manifest.dimensionFailures, pngViolations, missingReceipts }, null, 2));
process.exitCode = manifest.releaseGatePass ? 0 : 1;
