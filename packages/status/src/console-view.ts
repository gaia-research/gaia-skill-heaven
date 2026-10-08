// State → the six console surfaces. The pure half of every projection.
//
// `buildConsoleView(state, harness)` is the ONE place that decides what the
// Status, Lens, Session, Scope, Flow and Trust surfaces say. A host adapter
// only decides how to paint a `ConsoleView`: Claude Code draws Ink elements, the
// site draws React, a command-backed host prints `renderConsoleText`. No
// adapter re-derives a row, a stage or a piece of copy, so the same status
// yields the same facts on every host (the conformance suite holds this).
//
// Copy follows docs/CONTROL-PLANE.md §2.3 (stages), §2.5 (evidence classes),
// §5.2 (Lens), §5.3 (Session · Scope · Flow · Trust). Everything that came from
// the network or a model goes through `sanitizeDisplay` before it is stored in
// a view, so a painter cannot forget to.

import type {
  Direction,
  EvidenceClass,
  Rung,
  SkillReceipt,
  SummonEvent,
} from "./model.js";
import { readingRung } from "./model.js";
import { sanitizeDisplay } from "./sanitize.js";
import {
  eventLines,
  formatMs,
  formatScore,
  noticeLines,
  paintAnsi,
  readingToken,
  renderStatusSegments,
  toPlain,
  type ColorDepth,
  type Segment,
} from "./render.js";
import {
  CONSOLE_SURFACES,
  SURFACE_LABEL,
  type ConsoleProjection,
  type ConsoleSurface,
  type SurfaceSupport,
} from "./console-host.js";
import { CHIP_LABEL, type HarnessPath } from "./compat.js";
import {
  agentLabelFor,
  entryById,
  qualifyCommand,
  summonableName,
  type ConsoleAgent,
  type ConsoleCoreState,
  type ConsoleEntry,
} from "./console-state.js";

/** The four classes a runtime row can carry. `fixture` is a banner, never a row class. */
export type RowEvidence = Exclude<EvidenceClass, "fixture">;

export interface Row {
  label: string;
  /** `null` renders as an em dash with the word "unknown" — never blank. */
  value: string | null;
  evidence: RowEvidence;
}

/** The label a painter prints beside a row's value. */
export function evidenceWord(row: Row): string {
  const known = row.value !== null && row.value !== "" && row.evidence !== "unknown";
  if (row.evidence === "inferred") return "inferred";
  if (row.evidence === "unknown" || !known) return "unknown";
  return row.evidence;
}

/* ------------------------------------------------------------------------- *
 * Stage — card versus context (§2.3)
 * ------------------------------------------------------------------------- */

export interface StageText {
  text: string;
  /** True when the claim is derived (no read seen), not observed. */
  inferred: boolean;
}

export function stageText(entry: ConsoleEntry): StageText {
  const event = entry.event;
  if (event.kind !== "summoned") return { text: "nothing materialized", inferred: false };
  const skills = event.skills;
  const inContext = skills.filter((s) => s.stage === "in-context");
  if (skills.length > 0 && inContext.length === skills.length) {
    const readers = Array.from(new Set(skills.map((_, i) => entry.readBy[i] ?? "an agent")));
    return { text: `in context · body read by ${readers.join(", ")}`, inferred: false };
  }
  if (inContext.length > 0) {
    return { text: `${inContext.length} of ${skills.length} in context · the rest: card returned · body not read`, inferred: false };
  }
  if (skills.length > 0 && skills.every((s) => s.stage === "read-unobserved")) {
    return { text: "materialized · read not observed on this host", inferred: false };
  }
  return { text: "card returned · body not read", inferred: true };
}

/* ------------------------------------------------------------------------- *
 * Lens (§5.2) — empty by default, never submits
 * ------------------------------------------------------------------------- */

export type LensAction = "summon" | "inspect" | "dismiss";

export interface LensView {
  /** The band's lines (an event's two lines, or a notice). */
  lines: Segment[][];
  /** Under the lines; null for a preview, whose second line already says "nothing materialized". */
  stage: StageText | null;
  actions: LensAction[];
  /** What the Summon action would put in the prompt. A human submits it; no painter submits it. */
  prefill: string | null;
  /** The Session entry Inspect opens; null for a notice. */
  entryId: number | null;
}

/** §5.2: Summon is offered for a /lens preview with exactly one candidate. */
export function summonSuggestion(entry: ConsoleEntry): string | null {
  const event = entry.event;
  if (event.kind !== "previewed" || event.skills.length !== 1) return null;
  return summonableName(event.skills[0]);
}

export function lensView(state: ConsoleCoreState, projection: ConsoleProjection): LensView | null {
  const band = state.band;
  if (band === null) return null;
  if (band.kind === "draft") {
    const args = JSON.stringify({ query: sanitizeDisplay(band.query, 4096), surface: "any", preview: true });
    return {
      lines: [[{ text: "Preview handoff ready · no result observed", role: "dim" }]],
      stage: { text: "Submit the handoff yourself through the normal host tool/approval path. Nothing materialized.", inferred: false },
      actions: ["dismiss"],
      prefill: `Call the existing Skill Heaven summon tool with these JSON arguments: ${args}. Preview only; do not summon or read a skill body.`,
      entryId: null,
    };
  }
  if (band.kind === "looking" || band.kind === "not-connected") {
    return {
      lines: noticeLines(band.kind === "looking" ? { kind: "looking", query: band.query } : { kind: "not-connected" }),
      stage: null,
      actions: ["dismiss"],
      prefill: null,
      entryId: null,
    };
  }
  const entry = entryById(state, band.id);
  if (!entry) return null;
  const event = entry.event;
  const preview = event.kind === "previewed" || (event.kind === "no-match" && event.preview);
  const name = summonSuggestion(entry);
  return {
    lines: eventLines(event),
    stage: preview ? null : stageText(entry),
    actions: name !== null ? ["summon", "inspect", "dismiss"] : ["inspect", "dismiss"],
    prefill: name !== null ? qualifyCommand(`/summon ${name}`, projection.commandPrefix) : null,
    entryId: entry.id,
  };
}

/* ------------------------------------------------------------------------- *
 * Session (§5.3 receipt)
 * ------------------------------------------------------------------------- */

const DIRECTION_WORD: Readonly<Record<Direction, string>> = {
  manual: "any (explicit /summon)",
  converge: "heaven (converge)",
  explore: "hell (explore)",
  unspecified: "unspecified",
};

const LANE_WORD: Readonly<Record<string, string>> = {
  "human-led": "human-led (Skill Heaven lane)",
  "model-led": "model-led (Skill Hell lane)",
  unspecified: "unspecified (the source did not classify it)",
};

function healthText(event: SummonEvent): string | null {
  if (!("sourceHealth" in event)) return null;
  const h = event.sourceHealth;
  if (h.kind === "unknown") return null;
  const age = h.indexAgeDays === null ? "" : ` · index ${h.indexAgeDays} days old`;
  return h.kind === "stale" ? `? stale${age} · ranking still ran` : `fresh${age}`;
}

function skillRows(skill: SkillReceipt, index: number, entry: ConsoleEntry): Row[] {
  const stage: Row =
    skill.stage === "in-context"
      ? { label: "what entered", value: `body read (in context) by ${entry.readBy[index] ?? "an agent"}`, evidence: "observed" }
      : skill.stage === "materialized"
        ? { label: "what entered", value: "card returned · body not read", evidence: "inferred" }
        : skill.stage === "previewed"
          ? { label: "what entered", value: "previewed · nothing materialized", evidence: "reported" }
          : { label: "what entered", value: "materialized · read not observed", evidence: "unknown" };
  const rank: string[] = [];
  if (skill.matchKind !== "unknown") rank.push(skill.matchKind);
  const score = formatScore(skill.score);
  if (score) rank.push(score);
  const margin = formatScore(skill.margin);
  if (margin) rank.push(`Δ ${margin} (margin is a retrieval diagnostic)`);
  const from: string[] = [];
  if (skill.source) from.push(sanitizeDisplay(skill.source, 48));
  if (skill.repoUrl) from.push(sanitizeDisplay(skill.repoUrl, 64) + (skill.ref ? `@${sanitizeDisplay(skill.ref, 24)}` : ""));
  if (skill.subpath) from.push(sanitizeDisplay(skill.subpath, 48));
  if (skill.sha256) from.push(`sha256 ${sanitizeDisplay(skill.sha256, 12)}…`);
  const cache: string[] = [];
  if (skill.cache !== "unknown") cache.push(skill.cache);
  const ms = formatMs(skill.ms);
  if (ms) cache.push(ms);
  const installability = skill.installability === "unknown" ? null : sanitizeDisplay(skill.installability, 40);
  const lane = LANE_WORD[skill.lane] ?? null;
  return [
    stage,
    { label: "ranking", value: rank.length ? rank.join(" · ") : null, evidence: rank.length ? "reported" : "unknown" },
    { label: "from", value: from.length ? from.join(" · ") : null, evidence: from.length ? "reported" : "unknown" },
    { label: "lane", value: lane, evidence: lane ? "reported" : "unknown" },
    { label: "installability", value: installability, evidence: installability ? "reported" : "unknown" },
    { label: "cache", value: cache.length ? cache.join(" · ") : null, evidence: cache.length ? "reported" : "unknown" },
    { label: "on disk", value: skill.path ? sanitizeDisplay(skill.path, 96) : null, evidence: skill.path ? "reported" : "unknown" },
  ];
}

/** The agent row's evidence follows the host: an id the host reported is observed; "main" with no ids is inferred. */
function agentRow(state: ConsoleCoreState, entry: ConsoleEntry): Row {
  return {
    label: "agent",
    value: agentLabelFor(state, entry.agent),
    evidence: entry.agent !== null ? "observed" : state.agentIdsSeen ? "observed" : "inferred",
  };
}

/** Groups of rows for one receipt: the call, then up to three skills. */
export function receiptGroups(entry: ConsoleEntry, state: ConsoleCoreState): Row[][] {
  const event = entry.event;
  const query =
    "query" in event && event.query
      ? `query "${sanitizeDisplay(event.query, 80)}" · surface ${DIRECTION_WORD[event.direction] ?? "unspecified"}`
      : null;
  const health = healthText(event);
  const agent = agentRow(state, entry);
  if (event.kind === "summoned" || event.kind === "previewed") {
    const common: Row[] = [{ label: "why", value: query, evidence: query ? "reported" : "unknown" }];
    if (event.kind === "summoned") {
      const comp =
        event.composition === "relevance-only"
          ? `relevance-only · Arbor: ${event.arbor === "governed-record" ? "governed record" : event.arbor === "no-record" ? "no governed record" : event.arbor}`
          : null;
      common.push({ label: "composition", value: comp, evidence: comp ? "reported" : "unknown" });
    }
    common.push({ label: "source health", value: health, evidence: health ? "reported" : "unknown" }, agent);
    const groups: Row[][] = [common];
    event.skills.slice(0, 3).forEach((skill, i) =>
      groups.push([{ label: "skill", value: sanitizeDisplay(skill.name, 48), evidence: "reported" }, ...skillRows(skill, i, entry)]),
    );
    const unshown = event.skills.length - 3 + entry.omitted;
    if (unshown > 0) groups.push([{ label: "more", value: `+${unshown} more not shown here`, evidence: "observed" }]);
    return groups;
  }
  if (event.kind === "no-match") {
    return [
      [
        { label: "what entered", value: "nothing materialized", evidence: "reported" },
        { label: "why", value: query, evidence: query ? "reported" : "unknown" },
        {
          label: "refusal",
          value:
            (event.considered === null ? "0 admitted" : `${event.considered} considered · 0 admitted`) +
            (event.reason ? ` · ${sanitizeDisplay(event.reason, 60)}` : ""),
          evidence: "reported",
        },
        { label: "source health", value: health, evidence: health ? "reported" : "unknown" },
        agent,
      ],
    ];
  }
  return [
    [
      { label: "what entered", value: "nothing materialized", evidence: "reported" },
      { label: "reason", value: sanitizeDisplay(event.reason, 120), evidence: "observed" },
      agent,
    ],
  ];
}

/** `HH:MM:SS` from an ISO time; `""` when absent or unparsable. */
export function timeLabel(at: string | null): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export interface SessionEntryView {
  id: number;
  lines: Segment[][];
  /** time · agent · /lens — dim. */
  meta: string;
  groups: Row[][];
  stage: StageText;
}

export interface SessionView {
  /** True when the summon tool is known to be absent. */
  notConnected: boolean;
  /** Shown when there are no entries. */
  empty: string | null;
  /** Newest first. */
  entries: SessionEntryView[];
  legend: string;
}

export const EVIDENCE_LEGEND =
  "Evidence: observed = this console saw it · reported = the summon engine said so · inferred = derived here · unknown = no source.";

export function sessionView(state: ConsoleCoreState, projection: ConsoleProjection): SessionView {
  const entries = [...state.entries].reverse().map((entry): SessionEntryView => {
    const meta = [
      timeLabel(entry.event.at),
      agentLabelFor(state, entry.agent),
      entry.via === "lens" ? "/lens" : entry.via === "ledger" ? "engine ledger" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { id: entry.id, lines: eventLines(entry.event), meta, groups: receiptGroups(entry, state), stage: stageText(entry) };
  });
  return {
    notConnected: state.status.summonTool === "not-connected",
    empty:
      entries.length === 0
        ? `Nothing summoned yet. Try ${qualifyCommand("/summon", projection.commandPrefix)} <need>${
            projection.surfaces.lens.level === "unsupported" ? "" : ` or ${lensCommand(projection)} <need>`
          }.`
        : null,
    entries,
    legend: EVIDENCE_LEGEND,
  };
}

/** The Lens entry point as this host spells it. */
export function lensCommand(projection: ConsoleProjection): string {
  return projection.kind === "command-backed" ? `${projection.command ?? "/heaven"} lens` : "/lens";
}

/* ------------------------------------------------------------------------- *
 * Scope (§5.3) — what can be seen, what is active, which rung, how to keep it small
 * ------------------------------------------------------------------------- */

export const ULTRA_COPY =
  "Skill Ultra · provisioned. Controller unavailable — no controller is choosing direction or depth yet. Ultra is the rung you selected; each summon is still judged per use. The long-horizon controller is tracked in #126 and is not yet empirically validated.";

export interface Control {
  label: string;
  /** `prefill`: a command a person submits; `copy`: a shell command they run before a session. Neither runs anything. */
  kind: "prefill" | "copy";
  text: string;
}

export interface ScopeView {
  rows: Row[];
  /** Under the rows, when a rung was selected: it is a preference, not enforcement. */
  note: string | null;
  /** The Ultra provisioning copy, when Ultra is the selected rung. */
  ultra: string | null;
  rungControls: Control[];
  otherRungs: string;
  keepSmall: Control[];
  keepSmallNote: string | null;
}

function latestSource(state: ConsoleCoreState): { source: string | null; health: string | null; unavailable: boolean } {
  const last = state.entries[state.entries.length - 1];
  const unavailable = last?.event.kind === "unavailable";
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const e = state.entries[i]!;
    const event = e.event;
    if ("skills" in event) {
      const withSource = event.skills.find((s) => s.source);
      if (withSource?.source) return { source: sanitizeDisplay(withSource.source, 56), health: healthText(event), unavailable };
    }
  }
  return { source: null, health: last ? healthText(last.event) : null, unavailable };
}

export function scopeView(state: ConsoleCoreState, harness: HarnessPath): ScopeView {
  const projection = harness.console;
  const sp = (c: string) => qualifyCommand(c, projection.commandPrefix);
  const { source, health, unavailable } = latestSource(state);
  const reading = state.status.reading;
  const boot = state.status.boot ?? (reading.kind === "selected" ? ({ kind: "native", source: "no-launcher" } as const) : reading);
  const rung = reading.kind === "selected" ? reading.rung : null;
  const ultra = readingRung(reading) === "ultra";
  const skills = state.status.skills;
  const rungObservable = projection.observes.rung !== "unavailable";
  const rows: Row[] = [
    {
      label: "can see",
      value: unavailable
        ? `skill source ${source ?? ""} · unreachable`.replace("  ", " ")
        : source
          ? `skill source ${source}${health ? ` · ${health}` : ""}`
          : null,
      evidence: source || unavailable ? "reported" : "unknown",
    },
    {
      label: "active",
      value:
        skills === null
          ? null
          : `${skills} ${skills === 1 ? "skill" : "skills"} materialized this session (temporary — gone when the session ends)`,
      evidence: skills === null ? "unknown" : projection.observes.summon === "observed" ? "observed" : "reported",
    },
    {
      label: "inherited",
      value:
        boot.kind === "native" || boot.kind === "unknown"
          ? `boot reading ${readingToken(boot)} — no launcher observed; this console cannot see how the session was started`
          : `boot reading ${readingToken(boot)} — set at launch`,
      evidence: boot.kind === "native" || boot.kind === "unknown" ? "inferred" : "reported",
    },
    {
      label: "selected",
      value:
        rung === null
          ? rungObservable
            ? "none — no rung selected in this session"
            : "unknown — this host does not let the console see which rung command you typed"
          : ultra
            ? "rung ULTRA · controller unavailable"
            : `rung ${rung.toUpperCase()} — observed from ${state.selectedFrom ?? "a rung command"} · not enforced`,
      evidence: rung === null ? "unknown" : "observed",
    },
    { label: "allowed", value: "/summon by hand: yes · zero cut: temporary (default)", evidence: "reported" },
    {
      label: "keep small",
      value: `${sp("/skill-zero")} cuts temporary skills${harness.launcher ? ` · ${harness.launcher} --level zero starts clean` : ""}`,
      evidence: "reported",
    },
  ];
  return {
    rows,
    note:
      rung !== null && !ultra
        ? `You selected ${rung.toUpperCase()}. Skill Heaven does not enforce a rung; each summon is still judged per use.`
        : null,
    ultra: ultra ? ULTRA_COPY : null,
    rungControls: [
      { label: sp("/skill-heaven low"), kind: "prefill", text: "/skill-heaven low" },
      { label: sp("/skill-hell high"), kind: "prefill", text: "/skill-hell high" },
      { label: sp("/skill-ultra"), kind: "prefill", text: "/skill-ultra" },
    ],
    otherRungs: `Other rungs: ${sp("/skill-heaven med")} · ${sp("/skill-hell xhigh")} · ${sp("/skill-hell max")}`,
    keepSmall: [
      { label: sp("/skill-zero"), kind: "prefill", text: "/skill-zero" },
      { label: sp("/skill-zero all"), kind: "prefill", text: "/skill-zero all" },
      ...(harness.launcher
        ? [{ label: `Copy: ${harness.launcher} --level zero`, kind: "copy" as const, text: `${harness.launcher} --level zero` }]
        : []),
    ],
    keepSmallNote: harness.launcher ? "Start clean is run in a terminal before a session: it is copied, not run." : null,
  };
}

/** The command a rung selector fills for `text`, spelled for the host. */
export function commandForRung(rung: Rung, projection: Pick<ConsoleProjection, "commandPrefix">): string {
  const base: Readonly<Record<Rung, string>> = {
    zero: "/skill-zero",
    low: "/skill-heaven low",
    med: "/skill-heaven med",
    high: "/skill-hell high",
    xhigh: "/skill-hell xhigh",
    max: "/skill-hell max",
    ultra: "/skill-ultra",
  };
  return qualifyCommand(base[rung], projection.commandPrefix);
}

/* ------------------------------------------------------------------------- *
 * Flow (§5.3) — read-only; only agents the host reported appear
 * ------------------------------------------------------------------------- */

export const FLOW_VISIBLE_LIMIT = 12;

export interface FlowAgentView {
  label: string;
  line: string;
  last: boolean;
}

export interface FlowView {
  main: { summons: number; inContext: number; line: string };
  agents: FlowAgentView[];
  more: number;
  /** Said whenever the host reported no agent ids — never silent. */
  telemetryNote: string | null;
  windowNote: string | null;
  footer: string;
}

function agentLine(state: ConsoleCoreState, agent: ConsoleAgent): string {
  const mine = state.entries.filter((e) => e.agent !== null && e.agent === agent.id && e.event.kind === "summoned");
  const skills = mine.reduce((n, e) => n + (e.event.kind === "summoned" ? e.event.delta : 0), 0);
  const word = agent.state === "started" ? "started in background" : agent.state;
  return `${word} · ${mine.length === 0 ? "no skills" : `${mine.length} ${mine.length === 1 ? "summon" : "summons"}`}${skills > 0 && skills !== mine.length ? ` (${skills} skills)` : ""}`;
}

export function flowView(state: ConsoleCoreState, projection: ConsoleProjection): FlowView {
  const mainSummons = state.entries.filter((e) => e.agent === null && e.event.kind === "summoned");
  const mainInContext = mainSummons.reduce(
    (n, e) => n + (e.event.kind === "summoned" ? e.event.skills.filter((s) => s.stage === "in-context").length : 0),
    0,
  );
  const shown = state.agents.slice(0, FLOW_VISIBLE_LIMIT);
  const more = Math.max(0, state.agents.length - shown.length);
  const readsKnown = projection.observes.read !== "unavailable";
  const mainLine = `${mainSummons.length} ${mainSummons.length === 1 ? "summon" : "summons"} · ${readsKnown ? `${mainInContext} in context` : "reads not observed"}`;
  const noAgents = projection.observes.agents === "unavailable";
  return {
    main: { summons: mainSummons.length, inContext: mainInContext, line: mainLine },
    agents: shown.map((agent, i) => ({
      label: sanitizeDisplay(agent.label, 64),
      line: agentLine(state, agent),
      last: i === shown.length - 1 && more <= 0,
    })),
    more,
    telemetryNote: noAgents
      ? "This host does not report agent ids to the console. Summons are attributed to main."
      : !state.agentIdsSeen
        ? "This host did not report agent ids. Summons are attributed to main."
        : null,
    windowNote: state.entries.length >= 50 ? "Counts cover the last 50 events." : null,
    footer: "Read-only. Only agents the host reported appear.",
  };
}

/* ------------------------------------------------------------------------- *
 * Trust (§5.3) — what is installed and what it can do. It lists; it does not rate.
 * ------------------------------------------------------------------------- */

export interface TrustView {
  components: Array<{ id: string; profile: "core" | "full"; kind: string; version: string; summary: string; rows: Row[]; notes: readonly string[] }>;
  rows: Row[];
  /** Every surface this host carries below native, with its note. */
  hostLimits: Array<{ surface: ConsoleSurface; level: SurfaceSupport["level"]; via: string; note: string }>;
  footer: string;
}

export function trustView(state: ConsoleCoreState, harness: HarnessPath): TrustView {
  const projection = harness.console;
  const mcp = state.status.summonTool;
  const mcpText =
    mcp === "connected" ? "connected (a summon result was seen)" : mcp === "not-connected" ? "not connected" : "unknown until the first summon or /lens";
  return {
    components: projection.trust.map((c) => ({
      id: c.id,
      profile: c.profile,
      kind: c.kind,
      version: c.version,
      summary: c.summary,
      notes: c.notes ?? [],
      rows: [
        { label: "reads", value: c.reads.join(" · "), evidence: "reported" as const },
        { label: "writes", value: c.writes.length ? c.writes.join(" · ") : "nothing", evidence: "reported" as const },
        { label: "network", value: c.network, evidence: "reported" as const },
        { label: "disable", value: c.disable, evidence: "reported" as const },
      ],
    })),
    rows: [
      { label: "summon tool", value: `MCP: ${mcpText}`, evidence: "reported" },
      {
        label: "harness",
        value: `${harness.name} ${state.hostVersion ? sanitizeDisplay(state.hostVersion, 24) : "(version not reported)"} · ${CHIP_LABEL[harness.chip]} for the plugin at ${harness.probedVersion ?? "unknown"}`,
        evidence: state.hostVersion ? "observed" : "unknown",
      },
      { label: "evidence", value: harness.evidence, evidence: "reported" },
      { label: "console probe", value: projection.probe.summary, evidence: "reported" },
    ],
    hostLimits: CONSOLE_SURFACES.filter((s) => projection.surfaces[s].level !== "native").map((surface) => ({
      surface,
      level: projection.surfaces[surface].level,
      via: projection.surfaces[surface].via,
      note: projection.surfaces[surface].note,
    })),
    footer: "This lists what the code can do. It does not rate it.",
  };
}

/* ------------------------------------------------------------------------- *
 * The whole console
 * ------------------------------------------------------------------------- */

export interface ConsoleView {
  harness: Pick<HarnessPath, "id" | "name" | "chip" | "probedVersion">;
  projection: ConsoleProjection;
  /** Status surface: the segments and their plain spelling (full mode). */
  status: { segments: Segment[]; plain: string; compact: string };
  lens: LensView | null;
  session: SessionView;
  scope: ScopeView;
  flow: FlowView;
  trust: TrustView;
}

export function buildConsoleView(state: ConsoleCoreState, harness: HarnessPath): ConsoleView {
  const projection = harness.console;
  const segments = renderStatusSegments(state.status, "full");
  return {
    harness: { id: harness.id, name: harness.name, chip: harness.chip, probedVersion: harness.probedVersion },
    projection,
    status: { segments, plain: toPlain(segments), compact: toPlain(renderStatusSegments(state.status, "compact")) },
    lens: lensView(state, projection),
    session: sessionView(state, projection),
    scope: scopeView(state, harness),
    flow: flowView(state, projection),
    trust: trustView(state, harness),
  };
}

/* ------------------------------------------------------------------------- *
 * Plain-text projection — the command-backed host's whole console
 * ------------------------------------------------------------------------- */

export interface TextOptions {
  /** One surface, or all of them. */
  surface?: ConsoleSurface | "all";
  color?: ColorDepth;
  /** Verbose receipts, capability notes and raw handoffs require explicit inspection. */
  details?: boolean;
  /** Wrap width for long values; 0 = no wrapping. */
  width?: number;
}

const SUPPORT_WORD: Readonly<Record<SurfaceSupport["level"], string>> = {
  native: "native",
  degraded: "degraded (native fallback)",
  unsupported: "unsupported on this host",
};

function paint(segments: readonly Segment[], color: ColorDepth): string {
  return color === "none" ? toPlain(segments) : paintAnsi(segments, color);
}

function rowLine(row: Row, labelWidth = 16): string {
  const known = row.value !== null && row.value !== "" && row.evidence !== "unknown";
  return `${row.label.padEnd(labelWidth)}${known ? row.value : "—"}  ${evidenceWord(row)}`;
}

function wrap(text: string, width: number, indent: string): string {
  if (width <= 0 || text.length <= width) return `${indent}${text}`;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (indent + line + " " + w).length > width) {
      lines.push(indent + line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}

function header(view: ConsoleView, surface: ConsoleSurface): string[] {
  const support = view.projection.surfaces[surface];
  return [`── ${SURFACE_LABEL[surface]} · ${SUPPORT_WORD[support.level]} ──`, ...(support.level === "native" ? [] : [`   via ${support.via}. ${support.note}`])];
}

/** Default is at most eight brief lines. Detail inspection is a separate, intentional action. */
function briefConsole(view: ConsoleView, which: ConsoleSurface | "all"): string {
  const firstLens = view.lens?.lines[0] ? sanitizeDisplay(toPlain(view.lens.lines[0]), 64) : "No preview yet";
  const draft = view.lens?.entryId === null && view.lens.prefill !== null;
  const selected = view.scope.rows.find(row => row.label === "selected");
  const rung = selected?.evidence === "observed" && selected.value ? sanitizeDisplay(selected.value.split(/ · | — /)[0]!, 40) : "rung not observed";
  const summaries: Record<ConsoleSurface, string> = {
    status: view.status.compact,
    lens: `Lens · ${draft ? "Preview handoff ready · no result observed" : firstLens}`,
    session: `Session · ${view.session.entries.length ? `${view.session.entries.length} recent receipts` : "no receipts available"}`,
    scope: `Scope · ${rung} · Ultra unavailable`,
    flow: `Flow · ${view.flow.telemetryNote ? "agent ids not observed" : `${view.flow.agents.length + view.flow.more} reported agents`}`,
    trust: "Trust · read-only projection",
  };
  const surfaces = which === "all" ? CONSOLE_SURFACES : [which];
  return [`Skill Heaven · ${view.harness.name}`, ...surfaces.map(surface => summaries[surface]), `Inspect: ${view.projection.command} inspect <section>`].join("\n");
}

/** The console as plain text — sanitized upstream, so safe to print. */
export function renderConsoleText(view: ConsoleView, opts: TextOptions = {}): string {
  const color = opts.color ?? "none";
  const width = opts.width ?? 0;
  const which = opts.surface ?? "all";
  if (!opts.details) return briefConsole(view, which);
  const want = (s: ConsoleSurface) => which === "all" || which === s;
  const out: string[] = [];
  out.push(`Skill Heaven console · ${view.harness.name} · ${view.projection.kind === "command-backed" ? "command-backed" : view.projection.kind === "pane" ? "pane" : "extension UI"} · observes, never changes`);
  out.push(paint(view.status.segments, color));
  if (want("status")) {
    out.push("", ...header(view, "status"), `   ${view.status.compact}`);
  }
  if (want("lens")) {
    out.push("", ...header(view, "lens"));
    if (view.lens === null) {
      out.push("   (empty — Lens shows a result only after a summon or a preview)");
    } else {
      for (const l of view.lens.lines) out.push(`   ${paint(l, color)}`);
      if (view.lens.stage) out.push(`   ${view.lens.stage.text}${view.lens.stage.inferred ? " (inferred)" : ""}`);
      if (view.lens.prefill) out.push(`   ${view.lens.actions.includes("summon") ? "To summon, type" : "Preview handoff, type"}: ${view.lens.prefill}   (nothing is submitted for you)`);
    }
  }
  if (want("session")) {
    out.push("", ...header(view, "session"));
    if (view.session.notConnected) out.push("   ? summon tool: not connected");
    if (view.session.empty) out.push(`   ${view.session.empty}`);
    for (const e of view.session.entries) {
      const [l1, l2] = e.lines;
      if (l1) out.push(`   ${paint(l1, color)}${e.meta ? `   ${e.meta}` : ""}`);
      if (l2) out.push(`   ${paint(l2, color)}`);
      for (const g of e.groups) {
        for (const r of g) out.push(wrap(rowLine(r), width, "      "));
        out.push("");
      }
    }
    out.push(`   ${view.session.legend}`);
  }
  if (want("scope")) {
    out.push("", ...header(view, "scope"));
    for (const r of view.scope.rows) out.push(wrap(rowLine(r), width, "   "));
    if (view.scope.note) out.push(`   ${view.scope.note}`);
    if (view.scope.ultra) out.push(wrap(view.scope.ultra, width, "   "));
    out.push("   Choose a rung — type one; nothing runs until you submit it:");
    for (const c of view.scope.rungControls) out.push(`     ${c.label}`);
    out.push(`   ${view.scope.otherRungs}`);
    out.push("   Keep context small:");
    for (const c of view.scope.keepSmall) out.push(`     ${c.label}`);
    if (view.scope.keepSmallNote) out.push(`   ${view.scope.keepSmallNote}`);
  }
  if (want("flow")) {
    out.push("", ...header(view, "flow"));
    out.push(`   main   ${view.flow.main.line}`);
    for (const a of view.flow.agents) out.push(`   ${a.last ? "└─" : "├─"} ${a.label}   ${a.line}`);
    if (view.flow.more > 0) out.push(`   └─ +${view.flow.more} more`);
    if (view.flow.telemetryNote) out.push(`   ${view.flow.telemetryNote}`);
    if (view.flow.windowNote) out.push(`   ${view.flow.windowNote}`);
    out.push(`   ${view.flow.footer}`);
  }
  if (want("trust")) {
    out.push("", ...header(view, "trust"));
    for (const c of view.trust.components) {
      out.push(`   ${c.id} ${c.version} (${c.profile}) · ${c.kind} · ${c.summary}`);
      for (const r of c.rows) out.push(wrap(rowLine(r), width, "     "));
      for (const n of c.notes) out.push(wrap(n, width, "     "));
    }
    for (const r of view.trust.rows) out.push(wrap(rowLine(r), width, "   "));
    if (view.trust.hostLimits.length > 0) {
      out.push("   On this host:");
      for (const l of view.trust.hostLimits) out.push(wrap(`${SURFACE_LABEL[l.surface]} — ${SUPPORT_WORD[l.level]}: ${l.note}`, width, "     "));
    }
    out.push(`   ${view.trust.footer}`);
  }
  return out.join("\n");
}
