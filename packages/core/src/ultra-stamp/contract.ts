// skill-ultra-stamp/v1 — contract types and the normative validator.
//
// A stamp is an OFFLINE, LOCAL observation of what a harness transcript shows
// about one skill. It is an input to downstream interpretation, never a claim
// and never a rank or trust mutation (docs/ULTRA-STAMP.md). Every level is an
// independent tri-state; "unknown" is a first-class value and is never coerced
// to "false". The shape admits only enums, regex-bounded identifiers, hex
// digests and integers, so no prompt/response/path/person text can ride along.

import { containsAbsolutePath } from "../telemetry.js";

export const ULTRA_STAMP_SCHEMA = "skill-ultra-stamp/v1" as const;
export const ULTRA_STAMP_OBSERVER = { name: "skill-ultra-stamper", version: "1.0.0", parser: "claude-code-jsonl/1" } as const;

export const LEVELS = ["installed", "loaded", "invoked", "active", "materially_used", "verified_outcome"] as const;
export type Level = (typeof LEVELS)[number];
/** Strings, not booleans: "unknown" is truthy-safe and cannot be coerced by `if (x)`. */
export const TRI_STATES = ["true", "false", "unknown"] as const;
export type TriState = (typeof TRI_STATES)[number];
export const CONFIDENCES = ["high", "medium", "low", "none"] as const;
export type Confidence = (typeof CONFIDENCES)[number];
export const EVENT_KINDS = [
  "skill-listing", "manifest", "skill-tool-use", "summon-tool-use", "slash-command", "tool-result",
  "tool-result-error", "body-injection", "resource-reference", "later-tool-use", "compaction",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const ACTIVATION_MODES = ["skill-tool", "summon", "user-slash", "listing-only", "none", "unknown"] as const;
export type ActivationMode = (typeof ACTIVATION_MODES)[number];

/** Pointer into the local JSONL: 1-based line number and (optionally) the event uuid. No content. */
export interface EventRef { line: number; uuid?: string; kind: EventKind }
export interface LevelStamp { state: TriState; confidence: Confidence; evidence: EventRef[] }

export interface SkillStamp {
  skillId: string;
  /** sha256(SKILL.md) from the vendored contentSha256 helper; null when the user supplied no source. */
  sourceDigest: string | null;
  activationMode: ActivationMode;
  levels: Record<Level, LevelStamp>;
}

export interface UltraStampDocument {
  schema: typeof ULTRA_STAMP_SCHEMA;
  observer: { name: string; version: string; parser: string };
  /** usp_ + HMAC-SHA256(user-supplied salt, session id). The salt is never stored or emitted. */
  sessionPseudonym: string;
  harness: { name: string; version?: string };
  models: string[];
  source: { events: number; malformedLines: number; skillListingSeen: boolean };
  stamps: SkillStamp[];
  /** Calls observed that could not be attributed to a skill id; they keep affected levels "unknown". */
  unattributed: Array<{ kind: EventKind; evidence: EventRef[] }>;
}

export const SKILL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
export const EVENT_UUID = /^[A-Za-z0-9-]{8,64}$/;
const PSEUDONYM = /^usp_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function obj(v: unknown, at: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${at} must be an object`);
  return v as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[], required: string[], at: string): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`${at} has unexpected key ${k}`);
  for (const k of required) if (!(k in o)) throw new Error(`${at} is missing ${k}`);
}
function oneOf<T extends string>(v: unknown, set: readonly T[], at: string): T {
  if (typeof v !== "string" || !(set as readonly string[]).includes(v)) throw new Error(`${at} must be one of ${set.join("|")}`);
  return v as T;
}
function matching(v: unknown, re: RegExp, at: string): string {
  if (typeof v !== "string" || !re.test(v)) throw new Error(`${at} is malformed`);
  if (containsAbsolutePath(v)) throw new Error(`${at} must not contain an absolute local path`);
  return v;
}

function validateRef(v: unknown, at: string): void {
  const r = obj(v, at);
  keys(r, ["line", "uuid", "kind"], ["line", "kind"], at);
  if (!Number.isSafeInteger(r.line) || (r.line as number) < 1) throw new Error(`${at}.line must be a positive integer`);
  if ("uuid" in r) matching(r.uuid, EVENT_UUID, `${at}.uuid`);
  oneOf(r.kind, EVENT_KINDS, `${at}.kind`);
}

function validateLevel(v: unknown, at: string): void {
  const l = obj(v, at);
  keys(l, ["state", "confidence", "evidence"], ["state", "confidence", "evidence"], at);
  const state = oneOf(l.state, TRI_STATES, `${at}.state`);
  const conf = oneOf(l.confidence, CONFIDENCES, `${at}.confidence`);
  if (!Array.isArray(l.evidence) || l.evidence.length > 64) throw new Error(`${at}.evidence must be an array of at most 64 refs`);
  l.evidence.forEach((e, i) => validateRef(e, `${at}.evidence[${i}]`));
  if (state === "true" && l.evidence.length === 0) throw new Error(`${at}: a "true" level must cite evidence`);
  if (state !== "unknown" && conf === "none") throw new Error(`${at}: a decided level cannot have confidence "none"`);
}

export function validateUltraStamp(value: unknown): asserts value is UltraStampDocument {
  const d = obj(value, "stamp");
  const top = ["schema", "observer", "sessionPseudonym", "harness", "models", "source", "stamps", "unattributed"];
  keys(d, top, top, "stamp");
  if (d.schema !== ULTRA_STAMP_SCHEMA) throw new Error(`stamp.schema must be ${ULTRA_STAMP_SCHEMA}`);
  const ob = obj(d.observer, "stamp.observer");
  keys(ob, ["name", "version", "parser"], ["name", "version", "parser"], "stamp.observer");
  for (const k of ["name", "version", "parser"]) matching(ob[k], /^[A-Za-z0-9._-]{1,64}(\/[A-Za-z0-9._-]{1,16})?$/, `stamp.observer.${k}`);
  matching(d.sessionPseudonym, PSEUDONYM, "stamp.sessionPseudonym");
  const h = obj(d.harness, "stamp.harness");
  keys(h, ["name", "version"], ["name"], "stamp.harness");
  matching(h.name, /^[A-Za-z0-9._-]{1,40}$/, "stamp.harness.name");
  if ("version" in h) matching(h.version, /^[A-Za-z0-9._+-]{1,40}$/, "stamp.harness.version");
  if (!Array.isArray(d.models)) throw new Error("stamp.models must be an array");
  d.models.forEach((m, i) => matching(m, MODEL_ID, `stamp.models[${i}]`));
  const s = obj(d.source, "stamp.source");
  keys(s, ["events", "malformedLines", "skillListingSeen"], ["events", "malformedLines", "skillListingSeen"], "stamp.source");
  for (const k of ["events", "malformedLines"]) {
    if (!Number.isSafeInteger(s[k]) || (s[k] as number) < 0) throw new Error(`stamp.source.${k} must be a non-negative integer`);
  }
  if (typeof s.skillListingSeen !== "boolean") throw new Error("stamp.source.skillListingSeen must be boolean");
  if (!Array.isArray(d.stamps)) throw new Error("stamp.stamps must be an array");
  const seen = new Set<string>();
  d.stamps.forEach((raw, i) => {
    const at = `stamp.stamps[${i}]`;
    const st = obj(raw, at);
    const sk = ["skillId", "sourceDigest", "activationMode", "levels"];
    keys(st, sk, sk, at);
    const id = matching(st.skillId, SKILL_ID, `${at}.skillId`);
    if (seen.has(id)) throw new Error(`${at}.skillId duplicates ${id}`);
    seen.add(id);
    if (st.sourceDigest !== null) matching(st.sourceDigest, SHA256, `${at}.sourceDigest`);
    oneOf(st.activationMode, ACTIVATION_MODES, `${at}.activationMode`);
    const lv = obj(st.levels, `${at}.levels`);
    keys(lv, [...LEVELS], [...LEVELS], `${at}.levels`);
    for (const l of LEVELS) validateLevel(lv[l], `${at}.levels.${l}`);
  });
  if (!Array.isArray(d.unattributed)) throw new Error("stamp.unattributed must be an array");
  d.unattributed.forEach((raw, i) => {
    const at = `stamp.unattributed[${i}]`;
    const u = obj(raw, at);
    keys(u, ["kind", "evidence"], ["kind", "evidence"], at);
    oneOf(u.kind, EVENT_KINDS, `${at}.kind`);
    if (!Array.isArray(u.evidence)) throw new Error(`${at}.evidence must be an array`);
    u.evidence.forEach((e, j) => validateRef(e, `${at}.evidence[${j}]`));
  });
}
