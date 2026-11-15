import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN_PATH = join(__dirname, 'campaign.json');
const OUTPUT_PATH = join(__dirname, 'DECISION-LOG.html');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function shortPrLabel(url) {
  const match = String(url).match(/\/pull\/(\d+)(?:\/|$)/);
  return match ? `#${match[1]}` : url;
}

function renderLink(value, labelOverride) {
  if (value === null || value === undefined || value === '') {
    return '<span class="muted">—</span>';
  }
  if (typeof value === 'object' && value !== null) {
    const url = value.url ?? value.href;
    const label = labelOverride ?? (value.number !== undefined ? `#${value.number}` : url);
    if (isHttpUrl(url)) {
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label ?? url)}</a>`;
    }
    return `<code>${esc(JSON.stringify(value))}</code>`;
  }
  if (isHttpUrl(value)) {
    const label = labelOverride ?? shortPrLabel(value);
    return `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  }
  return `<span>${esc(value)}</span>`;
}

function statusTone(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['done', 'complete', 'completed', 'merged', 'passed', 'pass', 'approved', 'ok', 'green'].includes(s)) {
    return 'success';
  }
  if (['executing', 'in_progress', 'in-progress', 'running', 'active', 'ready', 'open'].includes(s)) {
    return 'active';
  }
  if (['waiting', 'pending', 'not started', 'not_started', 'queued', 'draft'].includes(s)) {
    return 'neutral';
  }
  if (['blocked', 'failed', 'fail', 'rejected', 'changes_requested', 'error', 'red'].includes(s)) {
    return 'danger';
  }
  if (['warning', 'warn', 'stale', 'paused', 'yellow'].includes(s)) {
    return 'warn';
  }
  return 'neutral';
}

function renderPill(value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="muted">—</span>';
  }
  const tone = statusTone(value);
  return `<span class="pill pill-${tone}">${esc(value)}</span>`;
}

function renderShortSha(sha) {
  if (!sha) return '<span class="muted">—</span>';
  const str = String(sha);
  return `<code class="sha" title="${esc(str)}">${esc(str.slice(0, 7))}</code>`;
}

function renderValue(value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="muted">—</span>';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return `<span>${esc(value)}</span>`;
  }
  if (typeof value === 'string') {
    if (isHttpUrl(value)) {
      return `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`;
    }
    return `<span>${esc(value)}</span>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="muted">[]</span>';
    const items = value.map((item) => `<li>${renderValue(item)}</li>`).join('');
    return `<ul class="compact-list">${items}</ul>`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '<span class="muted">{}</span>';
    const rows = entries
      .map(([k, v]) => `<div class="kv-row"><dt>${esc(k)}</dt><dd>${renderValue(v)}</dd></div>`)
      .join('');
    return `<dl class="nested-dl">${rows}</dl>`;
  }
  return `<span>${esc(value)}</span>`;
}

function renderHeader(campaign) {
  const metaItems = [
    { label: 'Status', html: renderPill(campaign.status ?? 'UNKNOWN') },
    { label: 'Integration branch', html: campaign.integrationBranch ? `<code>${esc(campaign.integrationBranch)}</code>` : '<span class="muted">—</span>' },
    { label: 'Integration PR', html: renderLink(campaign.integrationPr) },
    { label: 'Base main', html: campaign.baseMain ? `<code class="sha" title="${esc(campaign.baseMain)}">${esc(String(campaign.baseMain).slice(0, 7))}</code> <span class="muted full-sha">(${esc(campaign.baseMain)})</span>` : '<span class="muted">—</span>' },
  ];
  if (campaign.planPr) {
    metaItems.push({ label: 'Plan PR', html: renderLink(campaign.planPr) });
  }
  if (campaign.issue) {
    metaItems.push({ label: 'Issue', html: renderLink(campaign.issue, `#${String(campaign.issue).split('/').pop()}`) });
  }
  if (campaign.updatedAt) {
    metaItems.push({ label: 'Updated at', html: `<code>${esc(campaign.updatedAt)}</code>` });
  }

  return `
  <header class="page-header">
    <div class="header-top">
      <div>
        <p class="eyebrow">${esc(campaign.schema ?? 'campaign-ledger')}</p>
        <h1>Skill Ultra #126 — Campaign Dashboard &amp; Decision Log</h1>
      </div>
      <div class="header-status">${renderPill(campaign.status ?? 'UNKNOWN')}</div>
    </div>
    ${campaign.note ? `<p class="lead">${esc(campaign.note)}</p>` : ''}
    <dl class="meta-grid">
      ${metaItems.map((item) => `<div class="meta-card"><dt>${esc(item.label)}</dt><dd>${item.html}</dd></div>`).join('')}
    </dl>
  </header>`;
}

function renderUnitsTable(units = []) {
  const rows = units.map((u) => {
    const afterText = Array.isArray(u.after) && u.after.length > 0 ? u.after.join(', ') : '—';
    return `
      <tr>
        <td class="mono nowrap"><strong>${esc(u.id)}</strong></td>
        <td class="col-scope">${esc(u.scope ?? '—')}</td>
        <td class="mono nowrap">${esc(afterText)}</td>
        <td class="nowrap">${esc(u.tier ?? '—')}</td>
        <td class="nowrap">${u.team ? esc(u.team) : '<span class="muted">—</span>'}</td>
        <td class="nowrap">${u.worker ? esc(u.worker) : '<span class="muted">—</span>'}</td>
        <td class="mono nowrap">${u.branch ? `<code>${esc(u.branch)}</code>` : '<span class="muted">—</span>'}</td>
        <td class="nowrap">${renderLink(u.pr)}</td>
        <td class="nowrap">${renderShortSha(u.head)}</td>
        <td class="nowrap">${renderPill(u.terra)}</td>
        <td class="nowrap">${renderPill(u.status)}</td>
      </tr>`;
  }).join('');

  return `
  <section class="panel" id="dashboard">
    <h2>Dashboard — Work Units (U0a–U9)</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Scope</th>
            <th>After</th>
            <th>Tier</th>
            <th>Team</th>
            <th>Worker</th>
            <th>Branch</th>
            <th>PR</th>
            <th>Head</th>
            <th>Terra</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="11" class="muted">No units recorded.</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderProbesTable(probes = []) {
  const rows = probes.map((p) => {
    const evidence = p.evidence ?? p.evidencePath ?? null;
    return `
      <tr>
        <td class="mono nowrap"><strong>${esc(p.id)}</strong></td>
        <td class="mono nowrap">${esc(p.unit ?? '—')}</td>
        <td>${esc(p.question ?? '—')}</td>
        <td class="nowrap">${renderPill(p.status)}</td>
        <td class="mono">${evidence ? `<code>${esc(evidence)}</code>` : '<span class="muted">—</span>'}</td>
      </tr>`;
  }).join('');

  return `
  <section class="panel" id="probes">
    <h2>Probes (P1–P6)</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Unit</th>
            <th>Question</th>
            <th>Status</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" class="muted">No probes recorded.</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderPreflight(preflight = {}) {
  const harnesses = preflight.harnesses ?? {};
  const harnessRows = Object.entries(harnesses)
    .map(([name, ver]) => `<li><code>${esc(name)}</code>: <span>${esc(ver)}</span></li>`)
    .join('');

  const hydrogen = preflight.hydrogen;
  const hydrogenHtml = hydrogen && typeof hydrogen === 'object'
    ? `<ul class="compact-list">${Object.entries(hydrogen).map(([k, v]) => `<li><code>${esc(k)}</code>: ${esc(v)}</li>`).join('')}</ul>`
    : renderValue(hydrogen);

  const items = [
    ['At', preflight.at],
    ['Environment', preflight.env],
    ['Harnesses', harnessRows ? `<ul class="compact-list">${harnessRows}</ul>` : '<span class="muted">—</span>', true],
    ['Node', preflight.node ? `${preflight.node}${preflight.npm ? ` (npm ${preflight.npm})` : ''}` : null],
    ['Baseline', preflight.baseline],
    ['Reviewer', preflight.reviewer],
    ['Hydrogen', hydrogenHtml, true],
    ['Quota', preflight.quota],
    ['GitHub', preflight.github],
  ];

  const knownKeys = new Set(['at', 'env', 'harnesses', 'node', 'npm', 'baseline', 'reviewer', 'hydrogen', 'quota', 'github']);
  for (const [k, v] of Object.entries(preflight)) {
    if (!knownKeys.has(k)) {
      items.push([k, v]);
    }
  }

  return `
  <section class="panel" id="preflight">
    <h2>Preflight</h2>
    <dl class="preflight-grid">
      ${items.map(([label, val, isRaw]) => `
        <div class="preflight-item">
          <dt>${esc(label)}</dt>
          <dd>${isRaw ? val : renderValue(val)}</dd>
        </div>`).join('')}
    </dl>
  </section>`;
}

function renderStatusLists(campaign) {
  const renderList = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="empty-state">None</p>';
    }
    return `<ul class="status-list">${items.map((item) => `<li>${renderValue(item)}</li>`).join('')}</ul>`;
  };

  return `
  <div class="two-col">
    <section class="panel" id="blockers">
      <h2>Blockers</h2>
      ${renderList(campaign.blockers)}
    </section>
    <section class="panel" id="awaiting-founder">
      <h2>Awaiting founder</h2>
      ${renderList(campaign.awaitingFounder)}
    </section>
  </div>`;
}

function orderedKeys(obj, preferredOrder, excludeKeys = ['kind']) {
  const excluded = new Set(excludeKeys);
  const seen = new Set();
  const keys = [];
  for (const k of preferredOrder) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && !excluded.has(k)) {
      keys.push(k);
      seen.add(k);
    }
  }
  for (const k of Object.keys(obj)) {
    if (!seen.has(k) && !excluded.has(k)) {
      keys.push(k);
    }
  }
  return keys;
}

function renderFounderDecisions(decisions) {
  const preferred = ['id', 'date', 'summary', 'source'];
  const cards = decisions.map((d) => {
    const keys = orderedKeys(d, preferred, ['kind']);
    const extraKeys = keys.filter((k) => !['id', 'date', 'summary', 'source'].includes(k));
    return `
      <article class="decision-card founder-card">
        <div class="card-head">
          <span class="pill pill-founder">${esc(d.id ?? 'FOUNDER')}</span>
          ${d.date ? `<span class="muted mono">${esc(d.date)}</span>` : ''}
        </div>
        ${d.summary !== undefined ? `<p class="card-summary">${esc(d.summary)}</p>` : ''}
        ${d.source !== undefined ? `<p class="card-source"><span class="field-label">Source:</span> <code>${esc(d.source)}</code></p>` : ''}
        ${extraKeys.length > 0 ? `
          <dl class="card-fields">
            ${extraKeys.map((k) => `<div class="field-row"><dt>${esc(k)}</dt><dd>${renderValue(d[k])}</dd></div>`).join('')}
          </dl>` : ''}
      </article>`;
  }).join('');

  return `
  <div class="decision-group">
    <h3>Founder decisions (binding)</h3>
    <div class="card-stack">
      ${cards || '<p class="empty-state">None</p>'}
    </div>
  </div>`;
}

function renderDelegatedDecisions(decisions) {
  const preferred = [
    'id',
    'date',
    'team',
    'unit',
    'problem',
    'options',
    'selected',
    'reason',
    'authority',
    'reversible',
    'terra',
    'outcome',
    'risk',
  ];

  const cards = decisions.map((d) => {
    const keys = orderedKeys(d, preferred, ['kind']);
    const bodyKeys = keys.filter((k) => !['id', 'date', 'team', 'unit'].includes(k));
    return `
      <article class="decision-card delegated-card">
        <div class="card-head">
          <div class="card-head-left">
            <span class="pill pill-active">${esc(d.id ?? 'DELEGATED')}</span>
            ${d.unit !== undefined ? `<span class="tag">unit: ${esc(d.unit)}</span>` : ''}
            ${d.team !== undefined ? `<span class="tag">${esc(d.team)}</span>` : ''}
          </div>
          ${d.date ? `<span class="muted mono">${esc(d.date)}</span>` : ''}
        </div>
        <dl class="card-fields">
          ${bodyKeys.map((k) => `
            <div class="field-row">
              <dt>${esc(k)}</dt>
              <dd>${renderValue(d[k])}</dd>
            </div>`).join('')}
        </dl>
      </article>`;
  }).join('');

  return `
  <div class="decision-group">
    <h3>Delegated implementation decisions</h3>
    <div class="card-stack">
      ${cards || '<p class="empty-state">None</p>'}
    </div>
  </div>`;
}

function renderDecisionLog(decisions = []) {
  const founder = decisions.filter((d) => d.kind === 'founder');
  const delegated = decisions.filter((d) => d.kind === 'delegated');
  const other = decisions.filter((d) => d.kind !== 'founder' && d.kind !== 'delegated');

  return `
  <section class="panel" id="decision-log">
    <h2>Decision Log</h2>
    ${renderFounderDecisions(founder)}
    ${renderDelegatedDecisions(delegated)}
    ${other.length > 0 ? `
      <div class="decision-group">
        <h3>Other decisions</h3>
        <div class="card-stack">
          ${other.map((d) => `
            <article class="decision-card">
              <dl class="card-fields">
                ${Object.keys(d).map((k) => `<div class="field-row"><dt>${esc(k)}</dt><dd>${renderValue(d[k])}</dd></div>`).join('')}
              </dl>
            </article>`).join('')}
        </div>
      </div>` : ''}
  </section>`;
}

const CSS = `
:root {
  --bg: #f6f8fa;
  --surface: #ffffff;
  --surface-alt: #f0f3f6;
  --border: #d0d7de;
  --text: #1f2328;
  --muted: #59636e;
  --accent: #0969da;
  --pill-success-bg: #dafbe1;
  --pill-success-fg: #116329;
  --pill-success-bd: #82e596;
  --pill-active-bg: #ddf4ff;
  --pill-active-fg: #0550ae;
  --pill-active-bd: #80ccff;
  --pill-neutral-bg: #eaeef2;
  --pill-neutral-fg: #424a53;
  --pill-neutral-bd: #c8d1da;
  --pill-warn-bg: #fff8c5;
  --pill-warn-fg: #7d4e00;
  --pill-warn-bd: #eed26b;
  --pill-danger-bg: #ffebe9;
  --pill-danger-fg: #a40e26;
  --pill-danger-bd: #ff9c94;
  --pill-founder-bg: #fbefff;
  --pill-founder-fg: #6639ba;
  --pill-founder-bd: #d2a8ff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-alt: #1c2128;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --pill-success-bg: #12261e;
    --pill-success-fg: #56d364;
    --pill-success-bd: #238636;
    --pill-active-bg: #122136;
    --pill-active-fg: #79c0ff;
    --pill-active-bd: #1f6feb;
    --pill-neutral-bg: #21262d;
    --pill-neutral-fg: #b1bac4;
    --pill-neutral-bd: #3d444d;
    --pill-warn-bg: #27200c;
    --pill-warn-fg: #e3b341;
    --pill-warn-bd: #9e6a03;
    --pill-danger-bg: #2c1416;
    --pill-danger-fg: #ff7b72;
    --pill-danger-bd: #da3633;
    --pill-founder-bg: #241736;
    --pill-founder-fg: #d2a8ff;
    --pill-founder-bd: #8957e5;
  }
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

a {
  color: var(--accent);
  text-decoration: none;
  overflow-wrap: anywhere;
}

a:hover {
  text-decoration: underline;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: var(--surface-alt);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  overflow-wrap: anywhere;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.muted {
  color: var(--muted);
}

.nowrap {
  white-space: nowrap;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header, .panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  min-width: 0;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--muted);
  word-break: break-word;
}

h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
  line-height: 1.3;
}

h3 {
  margin: 0 0 10px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.lead {
  margin: 10px 0 0;
  color: var(--muted);
}

.meta-grid {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.meta-card {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 0;
}

.meta-card dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin-bottom: 4px;
}

.meta-card dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.full-sha {
  font-size: 11px;
  display: none;
}

@media (min-width: 720px) {
  .full-sha {
    display: inline;
  }
}

.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--border);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th, td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

thead th {
  background: var(--surface-alt);
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: none;
}

.col-scope {
  min-width: 220px;
}

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

.pill-success {
  background: var(--pill-success-bg);
  color: var(--pill-success-fg);
  border-color: var(--pill-success-bd);
}

.pill-active {
  background: var(--pill-active-bg);
  color: var(--pill-active-fg);
  border-color: var(--pill-active-bd);
}

.pill-neutral {
  background: var(--pill-neutral-bg);
  color: var(--pill-neutral-fg);
  border-color: var(--pill-neutral-bd);
}

.pill-warn {
  background: var(--pill-warn-bg);
  color: var(--pill-warn-fg);
  border-color: var(--pill-warn-bd);
}

.pill-danger {
  background: var(--pill-danger-bg);
  color: var(--pill-danger-fg);
  border-color: var(--pill-danger-bd);
}

.pill-founder {
  background: var(--pill-founder-bg);
  color: var(--pill-founder-fg);
  border-color: var(--pill-founder-bd);
}

.preflight-grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 720px) {
  .preflight-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.preflight-item {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 0;
}

.preflight-item dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin-bottom: 4px;
}

.preflight-item dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.compact-list {
  margin: 0;
  padding-left: 18px;
}

.compact-list li {
  margin: 2px 0;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 720px) {
  .two-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.empty-state {
  margin: 0;
  color: var(--muted);
  font-style: italic;
}

.status-list {
  margin: 0;
  padding-left: 18px;
}

.decision-group + .decision-group {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.decision-card {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  min-width: 0;
}

.founder-card {
  border-left: 4px solid var(--pill-founder-bd);
}

.delegated-card {
  border-left: 4px solid var(--pill-active-bd);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.card-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
}

.card-summary {
  margin: 0 0 6px;
}

.card-source {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.card-fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.field-row:first-child {
  padding-top: 0;
  border-top: none;
}

@media (min-width: 640px) {
  .field-row {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
  }
}

.field-row dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: lowercase;
}

.field-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.nested-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kv-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.kv-row dt {
  font-weight: 600;
  color: var(--muted);
}

.kv-row dd {
  margin: 0;
}
`;

export function renderHtml(campaign) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skill Ultra #126 — Campaign Dashboard &amp; Decision Log</title>
  <style>${CSS}</style>
</head>
<body>
  <main class="container">
    ${renderHeader(campaign)}
    ${renderUnitsTable(campaign.units)}
    ${renderProbesTable(campaign.probes)}
    ${renderPreflight(campaign.preflight)}
    ${renderStatusLists(campaign)}
    ${renderDecisionLog(campaign.decisions)}
  </main>
</body>
</html>
`;
}

function main() {
  const raw = readFileSync(CAMPAIGN_PATH, 'utf8');
  const campaign = JSON.parse(raw);
  const html = renderHtml(campaign);
  writeFileSync(OUTPUT_PATH, html, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
