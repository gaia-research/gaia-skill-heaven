/**
 * Everything /console shows beyond the renderer's own segments is DERIVED here
 * from model fields — the stage of a card, the receipt rows, the Scope rows,
 * the Lens actions. Nothing here reads a fixture: callers pass model values in,
 * so this module is also usable (and testable) with any status or event.
 *
 * Copy follows docs/CONTROL-PLANE.md §2.3 (stages), §2.5 (evidence classes),
 * §5.2 (Lens actions) and §5.3 (receipt, Scope, Flow). Untrusted display text
 * (skill names, queries, reasons, sources) goes through sanitizeDisplay.
 */
import {
  type Direction,
  type EvidenceClass,
  type Rung,
  type SkillHeavenStatus,
  type SkillReceipt,
  type SummonEvent,
  CLOSE_CALL_MARGIN,
  formatMs,
  formatScore,
  readingToken,
  sanitizeDisplay,
} from '@gaia-skill-heaven/status'

/** The four classes a runtime row can carry. `fixture` is a banner, never a row class. */
export type RowEvidence = Exclude<EvidenceClass, 'fixture'>

/* ------------------------------------------------------------------ stage (§2.3) */

export interface Stage {
  /** Short key for styling and tests. */
  id: 'previewed' | 'materialized' | 'in-context' | 'read-unobserved' | 'none'
  /** `null` when the event carries no skill and therefore no stage. */
  text: string | null
  evidence: RowEvidence | null
}

export function stageOf(event: SummonEvent): Stage {
  if (event.kind === 'previewed') return { id: 'previewed', text: 'nothing materialized', evidence: 'reported' }
  if (event.kind !== 'summoned') return { id: 'none', text: null, evidence: null }
  const first = event.skills[0]
  if (!first) return { id: 'none', text: null, evidence: null }
  switch (first.stage) {
    case 'in-context':
      return { id: 'in-context', text: 'in context · body read', evidence: 'observed' }
    case 'read-unobserved':
      return { id: 'read-unobserved', text: 'materialized · read not observed', evidence: 'unknown' }
    case 'previewed':
      return { id: 'previewed', text: 'nothing materialized', evidence: 'reported' }
    case 'materialized':
      // "body not read" is inferred: no read of SKILL.md was seen (§2.5).
      return { id: 'materialized', text: 'card returned · body not read', evidence: 'inferred' }
  }
}

/* ------------------------------------------------------------------ Lens actions (§5.2) */

export type LensAction = 'summon' | 'inspect' | 'dismiss'

/**
 * Summon appears only for a single strong preview candidate. Every other state
 * offers Inspect and Dismiss. (The model does not say whether a no-match came
 * from /lens or from /summon, so a no-match offers Inspect too.)
 */
export function lensActions(event: SummonEvent): LensAction[] {
  if (event.kind === 'previewed' && event.skills.length === 1) return ['summon', 'inspect', 'dismiss']
  return ['inspect', 'dismiss']
}

/** What Summon would pre-fill. A human submits it; the UI never does. */
export function summonPrefill(event: SummonEvent): string | null {
  if (event.kind !== 'previewed' || event.skills.length !== 1) return null
  const name = sanitizeDisplay(event.skills[0]!.name, 40)
  return name ? `/summon ${name}` : null
}

/* ------------------------------------------------------------------ receipt (§5.3 Session) */

export interface ReceiptRow {
  label: string
  /** `null` renders as an em dash with the word "unknown" — never blank. */
  value: string | null
  evidence: RowEvidence
}

const SURFACE_OF: Readonly<Record<Direction, string>> = {
  manual: 'any',
  converge: 'heaven',
  explore: 'hell',
  unspecified: 'unspecified',
}

function host(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return sanitizeDisplay(url, 40)
  }
}

function repoPath(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return sanitizeDisplay(url, 60)
  }
}

function commitOf(skill: SkillReceipt): string | null {
  const m = skill.sourceUrl ? /\/tree\/([0-9a-f]{7,40})\//.exec(skill.sourceUrl) : null
  if (m) return m[1]!.slice(0, 7)
  return skill.ref ? sanitizeDisplay(skill.ref, 24) : null
}

function fromText(skill: SkillReceipt): string | null {
  const parts: string[] = []
  const src = host(skill.source)
  if (src) parts.push(src)
  const repo = repoPath(skill.repoUrl)
  if (repo) {
    const commit = commitOf(skill)
    const where = commit ? `${repo}@${commit}` : repo
    parts.push(skill.subpath ? `${where} ${sanitizeDisplay(skill.subpath, 60)}` : where)
  }
  if (skill.sha256) parts.push(`sha256 ${skill.sha256.slice(0, 4)}…`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function laneText(lane: SkillReceipt['lane']): string | null {
  if (lane === 'human-led') return 'human-led (Skill Heaven)'
  if (lane === 'model-led') return 'model-led (Skill Hell)'
  if (lane === 'unspecified') return 'unspecified by the source'
  return null
}

function arborText(arbor: Extract<SummonEvent, { kind: 'summoned' }>['arbor']): string {
  switch (arbor) {
    case 'governed-record':
      return 'governed record'
    case 'no-record':
      return 'no governed record'
    case 'unavailable':
      return 'unavailable'
    case 'unknown':
      return 'unknown'
  }
}

function whyText(skill: SkillReceipt, event: SummonEvent): string | null {
  const query = sanitizeDisplay(event.query, 80)
  const parts: string[] = []
  if (query) parts.push(`query "${query}"`)
  parts.push(`surface ${SURFACE_OF[event.direction]}`)
  const detail: string[] = []
  if (skill.matchKind !== 'unknown') detail.push(skill.matchKind)
  const score = formatScore(skill.score)
  if (score) detail.push(score)
  const margin = formatScore(skill.margin)
  if (margin) detail.push(`Δ ${margin}`)
  if (detail.length > 0) parts.push(`${detail.join(' · ')} (margin is a retrieval diagnostic)`)
  return parts.join(' · ')
}

function indexRow(event: Exclude<SummonEvent, { kind: 'unavailable' | 'error' }>): ReceiptRow {
  const health = event.sourceHealth
  if (health.kind === 'unknown') return { label: 'index', value: null, evidence: 'reported' }
  const age = health.indexAgeDays === null ? '' : ` · ${health.indexAgeDays} days old`
  return {
    label: 'index',
    value: health.kind === 'stale' ? `stale${age} — ranking still ran` : `fresh${age}`,
    evidence: 'reported',
  }
}

/** `HH:MM:SS UTC` from an ISO time; `null` when absent. Never locale-dependent. */
export function clockOf(at: string | null): string | null {
  const m = at ? /T(\d{2}:\d{2}:\d{2})/.exec(at) : null
  return m ? `${m[1]} UTC` : null
}

export interface ReceiptHeader {
  clock: string | null
  /** "main agent" is inferred when the host named none (§5.3 Flow). */
  agent: { text: string; evidence: RowEvidence }
}

export function receiptHeader(event: SummonEvent): ReceiptHeader {
  const named = event.kind === 'summoned' || event.kind === 'previewed' ? event.skills[0]?.agent ?? null : null
  return {
    clock: clockOf(event.at),
    agent: named
      ? { text: sanitizeDisplay(named, 32), evidence: 'observed' }
      : { text: 'main agent', evidence: 'inferred' },
  }
}

export function receiptRows(event: SummonEvent): ReceiptRow[] {
  switch (event.kind) {
    case 'summoned': {
      const s = event.skills[0]
      if (!s) return [{ label: 'what entered', value: null, evidence: 'unknown' }]
      const stage = stageOf(event)
      const cache = s.cache === 'unknown' ? null : `${s.cache}${formatMs(s.ms) ? ` · ${formatMs(s.ms)}` : ''}`
      return [
        {
          label: 'what entered',
          value: stage.id === 'in-context' ? 'card returned · body read (in context)' : stage.text,
          evidence: stage.evidence ?? 'unknown',
        },
        { label: 'why', value: whyText(s, event), evidence: 'reported' },
        { label: 'from', value: fromText(s), evidence: 'reported' },
        { label: 'lane', value: laneText(s.lane), evidence: 'reported' },
        {
          label: 'installability',
          value: s.installability === 'unknown' ? 'unknown (tree published no determination)' : sanitizeDisplay(s.installability, 40),
          evidence: 'reported',
        },
        {
          label: 'composition',
          value: event.composition === 'relevance-only' ? `relevance-only · Arbor: ${arborText(event.arbor)}` : null,
          evidence: 'reported',
        },
        { label: 'cache', value: cache, evidence: 'reported' },
        { label: 'on disk', value: s.path ? sanitizeDisplay(s.path, 90) : null, evidence: 'reported' },
        indexRow(event),
        ...(event.skills.length > 1
          ? [{ label: 'also', value: `+${event.skills.length - 1} more in this call`, evidence: 'reported' as const }]
          : []),
      ]
    }
    case 'previewed':
      return [
        { label: 'what entered', value: 'nothing — preview only', evidence: 'reported' },
        {
          label: 'candidates',
          value:
            event.skills
              .map((s) => `${sanitizeDisplay(s.name, 40)}${formatScore(s.score) ? ` ${formatScore(s.score)}` : ''}`)
              .join(' · ') || null,
          evidence: 'reported',
        },
        {
          label: 'why',
          value: `query "${sanitizeDisplay(event.query, 80)}"${
            event.skills[0]?.margin !== null && event.skills[0]?.margin !== undefined && event.skills[0].margin < CLOSE_CALL_MARGIN && event.skills.length > 1
              ? ` · Δ ${formatScore(event.skills[0].margin)} close call (a retrieval diagnostic)`
              : ''
          }`,
          evidence: 'reported',
        },
        indexRow(event),
      ]
    case 'no-match':
      return [
        { label: 'what entered', value: 'nothing — no match', evidence: 'reported' },
        { label: 'why', value: `query "${sanitizeDisplay(event.query, 80)}"${event.reason ? ` · ${sanitizeDisplay(event.reason, 60)}` : ''}`, evidence: 'reported' },
        { label: 'considered', value: event.considered === null ? null : String(event.considered), evidence: 'reported' },
        indexRow(event),
      ]
    case 'unavailable':
    case 'error':
      return [
        { label: 'what entered', value: 'nothing — the call did not complete', evidence: 'observed' },
        { label: event.kind === 'error' ? 'error' : 'reason', value: sanitizeDisplay(event.reason, 90), evidence: 'observed' },
      ]
  }
}

/* ------------------------------------------------------------------ Scope (§5.3) */

export interface ScopeRow {
  label: string
  value: string | null
  evidence: RowEvidence
}

const RUNG_COMMAND: Readonly<Record<Rung, string>> = {
  zero: '/skill-zero',
  low: '/skill-heaven low',
  med: '/skill-heaven med',
  high: '/skill-hell high',
  xhigh: '/skill-hell xhigh',
  max: '/skill-hell max',
  ultra: '/skill-ultra',
}

export function commandForRung(rung: Rung): string {
  return RUNG_COMMAND[rung]
}

function scopeSource(event: SummonEvent | null): { see: string | null; reach: 'ok' | 'unreachable' | 'unknown' } {
  if (!event) return { see: null, reach: 'unknown' }
  if (event.kind === 'unavailable' || event.kind === 'error') {
    return event.kind === 'unavailable'
      ? { see: `unreachable — ${sanitizeDisplay(event.reason, 60)}`, reach: 'unreachable' }
      : { see: null, reach: 'unknown' }
  }
  if (!('sourceHealth' in event)) return { see: null, reach: 'unknown' }
  const skill = event.kind === 'summoned' || event.kind === 'previewed' ? event.skills[0] : undefined
  const src = skill ? host(skill.source) : null
  const health = event.sourceHealth
  const age = health.kind === 'unknown' || health.indexAgeDays === null ? '' : ` · index ${health.indexAgeDays} days old`
  const state = health.kind === 'unknown' ? '' : ` · ${health.kind}`
  if (!src && health.kind === 'unknown') return { see: null, reach: 'unknown' }
  return { see: `${src ?? 'source not named'}${age}${state}`, reach: 'ok' }
}

export function scopeRows(status: SkillHeavenStatus, event: SummonEvent | null): ScopeRow[] {
  const { see } = scopeSource(event)
  const r = status.reading
  const inherited =
    r.kind === 'boot' && r.posture === 'product-floor'
      ? 'boot reading ZERO (claude-zero product floor)'
      : r.kind === 'boot' && r.posture === 'curated'
        ? 'boot reading CURATED (named skills readmitted at launch)'
        : r.kind === 'boot' || r.kind === 'native'
          ? "boot reading NATIVE (your harness's own skills)"
          : null
  let selected: string | null
  if (r.kind === 'selected') {
    selected =
      r.rung === 'ultra'
        ? status.controller.kind === 'unavailable'
          ? 'rung ULTRA — controller unavailable · observed from /skill-ultra · not enforced'
          : `rung ULTRA — observed from /skill-ultra · not enforced`
        : `rung ${readingToken(r)} — observed from ${commandForRung(r.rung)} · not enforced`
  } else {
    selected = 'no rung selected'
  }
  const tool = status.summonTool === 'not-connected' ? 'not connected' : status.summonTool
  return [
    { label: 'can see', value: see, evidence: 'reported' },
    {
      label: 'active',
      value:
        status.skills === null
          ? null
          : `${status.skills} ${status.skills === 1 ? 'skill' : 'skills'} materialized this session (temporary — gone when the session ends)`,
      evidence: 'reported',
    },
    { label: 'inherited', value: inherited, evidence: 'reported' },
    { label: 'selected', value: selected, evidence: r.kind === 'selected' ? 'observed' : 'unknown' },
    { label: 'summon tool', value: tool, evidence: 'reported' },
    { label: 'allowed', value: '/summon by hand: yes · zero cut: temporary (default)', evidence: 'reported' },
    { label: 'keep small', value: '/skill-zero cuts temporary skills · claude-zero --level zero starts clean', evidence: 'reported' },
  ]
}

/* ------------------------------------------------------------------ Flow (§5.3) */

/** Structurally the fixtures' FlowAgentFixture; defined here so this module never imports a fixture. */
export interface FlowAgent {
  id: string
  label: string
  parent: string | null
  state: 'running' | 'returned' | 'unknown'
  summons: number
}

export interface FlowNode extends FlowAgent {
  children: FlowNode[]
}

export function buildFlowTree(agents: readonly FlowAgent[]): FlowNode[] {
  const nodes = new Map<string, FlowNode>(agents.map((a) => [a.id, { ...a, children: [] }]))
  const roots: FlowNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Host reported no agent ids: every summon is attributed to main (§5.3). */
export function degradeFlow(agents: readonly FlowAgent[]): FlowAgent[] {
  const main = agents.find((a) => a.parent === null)
  return [{ id: 'main', label: main?.label ?? 'main', parent: null, state: 'running', summons: agents.reduce((n, a) => n + a.summons, 0) }]
}

/** A fresh session: main alone, nothing summoned. */
export function freshFlow(agents: readonly FlowAgent[]): FlowAgent[] {
  const main = agents.find((a) => a.parent === null)
  return [{ id: 'main', label: main?.label ?? 'main', parent: null, state: 'running', summons: 0 }]
}

/** Synthetic stress data for the fan-out collapse — not a fixture of any real session. */
export function syntheticFanOut(count: number): FlowAgent[] {
  const states: FlowAgent['state'][] = ['returned', 'running', 'returned', 'unknown']
  const out: FlowAgent[] = [{ id: 'main', label: 'main', parent: null, state: 'running', summons: 5 }]
  for (let i = 1; i <= count; i++) {
    out.push({
      id: `agent-${i}`,
      label: `general-purpose · task ${String(i).padStart(2, '0')}`,
      parent: 'main',
      state: states[i % states.length]!,
      summons: i % 3 === 0 ? 1 : 0,
    })
  }
  return out
}

/** Fan-out beyond this many agents collapses to "+N more" (§5.3). */
export const FLOW_VISIBLE_LIMIT = 12
