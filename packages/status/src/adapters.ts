// Runtime facts → the model. Pure parsers over already-read JSON/text: the
// door that owns the I/O (claude-zero's statusline command, the console mod's
// hooks) reads the file or observes the tool result and hands the value here.
//
// Every parser fails closed to `unknown`, never to an invented value. No
// parser here can produce a fixture controller.

import type {
  Controller,
  ControllerState,
  Direction,
  EntropyReading,
  Lane,
  Rung,
  SkillHeavenStatus,
  SkillReceipt,
  SourceHealth,
  SummonEvent,
} from "./model.js";
import { isRung } from "./model.js";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/* ------------------------------------------------------------------------- *
 * The reading
 * ------------------------------------------------------------------------- */

/** claude-zero's `claude-zero/profile@1` manifest (packages/claude-zero). */
export function readingFromProfileManifest(manifest: unknown): EntropyReading {
  if (!isRec(manifest) || manifest.schema !== "claude-zero/profile@1") return { kind: "unknown" };
  const posture = manifest.posture;
  if (posture === "product-floor" || posture === "curated" || posture === "native") {
    return { kind: "boot", posture, source: "launcher-manifest" };
  }
  return { kind: "unknown" };
}

const BAND_COMMANDS: ReadonlyArray<{ command: string; rungs: readonly Rung[]; fallback: Rung }> = [
  { command: "skill-zero", rungs: ["zero"], fallback: "zero" },
  { command: "skill-heaven", rungs: ["low", "med"], fallback: "low" },
  { command: "skill-hell", rungs: ["high", "xhigh", "max"], fallback: "high" },
  { command: "skill-ultra", rungs: ["ultra"], fallback: "ultra" },
];

/**
 * A rung the user selected, from the text of a submitted prompt. Accepts the
 * plain and plugin-qualified forms (`/skill-hell high`,
 * `/skill-heaven:skill-hell high`). An argument the band does not hold returns
 * `null` — the renderer refuses it too, so nothing was selected.
 * `/skill-zero all` is still the `zero` rung (it changes what is cut, not where
 * the session sits).
 */
export function selectionFromCommand(text: string): EntropyReading | null {
  const match = /^\s*\/(?:[a-z0-9-]+:)?(skill-zero|skill-heaven|skill-hell|skill-ultra)(?:\s+(\S+))?\s*$/i.exec(text);
  if (!match) return null;
  const entry = BAND_COMMANDS.find((b) => b.command === match[1]!.toLowerCase())!;
  const arg = match[2]?.toLowerCase();
  if (!arg) return { kind: "selected", rung: entry.fallback, source: "observed-command" };
  if (entry.command === "skill-zero") return arg === "all" ? { kind: "selected", rung: "zero", source: "observed-command" } : null;
  if (isRung(arg) && entry.rungs.includes(arg)) return { kind: "selected", rung: arg, source: "observed-command" };
  return null;
}

/** Apply a reading. Selecting `ultra` provisions the controller slot as
 * unavailable — no runtime reports controller state today. */
export function withReading(status: SkillHeavenStatus, reading: EntropyReading): SkillHeavenStatus {
  const ultra = reading.kind === "selected" && reading.rung === "ultra";
  const boot = status.boot ?? (status.reading.kind === "selected" || status.reading.kind === "unknown" ? undefined : status.reading);
  const controller: Controller = ultra
    ? status.controller.kind === "reported"
      ? status.controller
      : { kind: "unavailable" }
    : { kind: "not-selected" };
  return { ...status, reading, controller, ...(boot ? { boot } : {}) };
}

/* ------------------------------------------------------------------------- *
 * Session manifest (`session.json` in SKILL_SUMMON_SESSION)
 * ------------------------------------------------------------------------- */

export function skillsFromSessionManifest(manifest: unknown): { skills: number | null; last: string | null } {
  if (!isRec(manifest) || !Array.isArray(manifest.skills)) return { skills: null, last: null };
  const entries = manifest.skills.filter((s): s is Rec => isRec(s) && typeof s.id === "string");
  if (entries.length !== manifest.skills.length) return { skills: null, last: null };
  const last = entries.length > 0 ? entries[entries.length - 1]! : null;
  return { skills: entries.length, last: last ? str(last.name) ?? str(last.id) : null };
}

/* ------------------------------------------------------------------------- *
 * Summon tool result (`structuredContent`, packages/skill-summon/src/mcp/server.ts)
 * ------------------------------------------------------------------------- */

export function directionFromSurface(surface: unknown): Direction {
  if (surface === "any") return "manual";
  if (surface === "heaven") return "converge";
  if (surface === "hell") return "explore";
  return "unspecified";
}

function laneOf(skill: Rec): Lane {
  // skill-summon's SkillInvocation: "human" = human-led (Skill Heaven lane),
  // "model" = model-led (Skill Hell lane), "any" = the source did not classify it.
  if (skill.invocation === "human") return "human-led";
  if (skill.invocation === "model") return "model-led";
  if (skill.invocation === "any") return "unspecified";
  return "unknown";
}

function receiptFrom(skill: Rec, stage: SkillReceipt["stage"], agent: string | null): SkillReceipt {
  const retrieval = isRec(skill.retrieval) ? skill.retrieval : {};
  const matchKind = retrieval.matchKind === "exact" || retrieval.matchKind === "ranked" ? retrieval.matchKind : "unknown";
  const cacheRaw = skill.cacheState ?? skill.cache;
  const totalSeconds = num(skill.totalSeconds);
  const installability = isRec(skill.installability) ? str(skill.installability.state) ?? "unknown" : "unknown";
  return {
    id: str(skill.id) ?? "unknown",
    name: str(skill.name) ?? str(skill.id) ?? "unknown",
    stage,
    matchKind,
    score: num(retrieval.score) ?? num(skill.score),
    margin: num(retrieval.margin) ?? num(skill.margin),
    cache: cacheRaw === "cold" || cacheRaw === "warm" ? cacheRaw : "unknown",
    ms: totalSeconds === null ? null : Math.round(totalSeconds * 1000),
    lane: laneOf(skill),
    source: str(skill.source),
    repoUrl: str(skill.repoUrl),
    ref: str(skill.branch),
    sourceUrl: str(skill.sourceUrl),
    subpath: str(skill.subpath),
    sha256: str(skill.sha256),
    path: str(skill.path),
    installability,
    agent,
  };
}

function sourceHealthOf(result: Rec): SourceHealth {
  const ranking = isRec(result.ranking) ? result.ranking : null;
  if (!ranking || typeof ranking.stale !== "boolean") return { kind: "unknown" };
  const indexAgeDays = num(ranking.indexAgeDays);
  return ranking.stale ? { kind: "stale", indexAgeDays } : { kind: "fresh", indexAgeDays };
}

function arborOf(result: Rec, summoned: Rec[]): "governed-record" | "no-record" | "unavailable" | "unknown" {
  const arbor = isRec(result.arbor) ? result.arbor : null;
  if (!arbor) return "unknown";
  if (arbor.publicationState === "unavailable" || arbor.publicationState === "unreadable") return "unavailable";
  if (arbor.publicationState !== "loaded") return "unknown";
  return summoned.some((s) => isRec(s.arbor) && s.arbor.join === "content-pinned") ? "governed-record" : "no-record";
}

const NO_MATCH_REASON: Readonly<Record<string, string>> = {
  no_candidates: "no candidates in the source",
  below_floor: "nothing cleared the relevance floor",
  all_filtered: "every candidate was outside this lane",
};

export interface ObservedCall {
  /** ISO time the host observed the call, when known. */
  at?: string | null;
  /** Agent id the host reported for the call, when known. */
  agent?: string | null;
  /** The call's own `preview` argument, when known. */
  preview?: boolean;
  /** The call's `query` argument, as a fallback when the result omits it. */
  query?: string;
}

/**
 * One summon call → one event. `structured` is the tool result's
 * `structuredContent`; `isError`/`errorText` come from the host when the tool
 * reported an error.
 */
export function eventFromSummonResult(
  structured: unknown,
  call: ObservedCall = {},
  failure?: { isError: true; text?: string | null },
): SummonEvent {
  const at = call.at ?? null;
  const agent = call.agent ?? null;
  if (failure?.isError) {
    const text = failure.text ?? "the summon tool reported an error";
    const unavailable = /unresolvable|unreachable|ENOTFOUND|EAI_AGAIN|fetch failed|network|offline/i.test(text);
    return {
      kind: unavailable ? "unavailable" : "error",
      direction: "unspecified",
      query: call.query ?? "",
      reason: text,
      at,
      evidence: "observed",
    };
  }
  if (!isRec(structured)) {
    return { kind: "error", direction: "unspecified", query: call.query ?? "", reason: "the summon result had no structured content", at, evidence: "observed" };
  }
  const direction = directionFromSurface(structured.surface);
  const query = str(structured.query) ?? call.query ?? "";
  const sourceHealth = sourceHealthOf(structured);
  if (structured.noMatch !== null && structured.noMatch !== undefined) {
    const noMatch = isRec(structured.noMatch) ? structured.noMatch : {};
    const reason = typeof noMatch.reason === "string" ? NO_MATCH_REASON[noMatch.reason] ?? null : null;
    return { kind: "no-match", direction, query, preview: call.preview === true, considered: null, reason, at, evidence: "reported", sourceHealth };
  }
  const summoned = Array.isArray(structured.summoned) ? structured.summoned.filter(isRec) : [];
  const previewed = Array.isArray(structured.previewed) ? structured.previewed.filter(isRec) : [];
  if (summoned.length === 0 && (previewed.length > 0 || call.preview === true)) {
    return {
      kind: "previewed",
      direction,
      query,
      skills: previewed.map((s) => receiptFrom(s, "previewed", agent)),
      delta: 0,
      preview: true,
      at,
      evidence: "reported",
      sourceHealth,
    };
  }
  const composition = isRec(structured.composition) && structured.composition.mode === "relevance-only" ? "relevance-only" : "unknown";
  return {
    kind: "summoned",
    direction,
    query,
    skills: summoned.map((s) => receiptFrom(s, "materialized", agent)),
    delta: summoned.length,
    preview: false,
    at,
    evidence: "reported",
    composition,
    arbor: arborOf(structured, summoned),
    sourceHealth,
  };
}

/** Fold an event into state. A no-match, preview or error never changes the
 * reading or `skills N`; only materialized skills do. */
export function reduceStatus(status: SkillHeavenStatus, event: SummonEvent): SkillHeavenStatus {
  if (event.kind === "previewed") return status;
  const summons = status.summons === null ? null : status.summons + 1;
  if (event.kind !== "summoned") return { ...status, summons };
  const skills = status.skills === null ? null : status.skills + event.delta;
  const last = event.skills[event.skills.length - 1];
  return { ...status, skills, summons, lastArrival: last ? last.name : status.lastArrival };
}

/** Mark the skill whose materialized `SKILL.md` was read as in context. */
export function markRead(event: SummonEvent, readPath: string): SummonEvent {
  if (event.kind !== "summoned") return event;
  const norm = readPath.replace(/\\/g, "/");
  let changed = false;
  const skills = event.skills.map((s) => {
    if (!s.path || s.stage === "in-context") return s;
    const root = s.path.replace(/\\/g, "/").replace(/\/+$/, "");
    if (norm === `${root}/SKILL.md`) {
      changed = true;
      return { ...s, stage: "in-context" as const };
    }
    return s;
  });
  return changed ? { ...event, skills } : event;
}

/* ------------------------------------------------------------------------- *
 * Controller seams — where #126 binds. Nothing calls these from a runtime
 * session yet; they exist so real state replaces fixtures without a redesign.
 * ------------------------------------------------------------------------- */

const STEERING_DECISIONS: Readonly<Record<string, ControllerState>> = {
  hold: "HOLD",
  explore: "EXPLORE",
  recover: "RECOVER",
  reopen: "REOPEN",
  checkpoint: "CHECKPOINT",
  close: "CLOSE",
  stop: "STOP",
};

/** A `gaia-steering-trace/v1` entry (packages/core/src/steering.ts) → the
 * controller slot. Retrieval scores are not accepted here by construction. */
export function controllerFromSteeringEntry(entry: unknown): Controller | null {
  if (!isRec(entry) || typeof entry.decision !== "string") return null;
  const state = STEERING_DECISIONS[entry.decision];
  if (!state) return null;
  const to = isRec(entry.to) ? entry.to : null;
  const rung = to && isRung(to.rung) && to.rung !== "zero" && to.rung !== "ultra" ? to.rung : undefined;
  const from = isRec(entry.from) && typeof entry.from.rung === "string" ? entry.from.rung : null;
  const explanation = str(entry.explanation);
  return {
    kind: "reported",
    source: "steering-trace",
    state,
    ...(rung ? { effective: rung } : {}),
    ...(from && explanation && entry.changed === true
      ? { transition: { from: from.toUpperCase(), to: state, reason: explanation } }
      : {}),
  };
}

/**
 * PROPOSED consumer contract for #126 campaign state:
 * `{ schema: "skill-heaven/controller-status@0", state, effective?, progress?, transition? }`.
 * It is a proposal recorded in docs/CONTROL-PLANE.md, not a ratified schema;
 * the owner of #126 decides the real one and this parser follows it. Strict:
 * unknown keys or malformed fields → `null`.
 */
export const PROPOSED_CONTROLLER_SCHEMA = "skill-heaven/controller-status@0" as const;

export function controllerFromCampaignStatus(value: unknown): Controller | null {
  if (!isRec(value) || value.schema !== PROPOSED_CONTROLLER_SCHEMA) return null;
  const allowed = new Set(["schema", "state", "effective", "progress", "transition"]);
  if (Object.keys(value).some((k) => !allowed.has(k))) return null;
  if (typeof value.state !== "string" || !/^[A-Z][A-Z0-9 ·_-]{0,31}$/.test(value.state)) return null;
  const out: Extract<Controller, { kind: "reported" }> = { kind: "reported", source: "campaign", state: value.state };
  if (value.effective !== undefined) {
    if (!isRung(value.effective) || value.effective === "zero" || value.effective === "ultra") return null;
    out.effective = value.effective;
  }
  if (value.progress !== undefined) {
    const p = value.progress;
    if (!isRec(p) || !Number.isInteger(p.completed) || !Number.isInteger(p.total)) return null;
    const completed = p.completed as number;
    const total = p.total as number;
    if (completed < 0 || total < 1 || completed > total) return null;
    out.progress = { completed, total };
  }
  if (value.transition !== undefined) {
    const t = value.transition;
    if (!isRec(t) || typeof t.from !== "string" || typeof t.to !== "string" || typeof t.reason !== "string") return null;
    out.transition = { from: t.from, to: t.to, reason: t.reason };
  }
  return out;
}
