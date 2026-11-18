import { createHash } from "node:crypto";
import { replayCampaign, verifyCampaignRecord } from "./engine.js";
import { parseCampaignEvent, parseCampaignRecord, parseCampaignTraceEntry } from "./schema.js";
import type {
  CampaignEventDescriptor,
  CampaignTraceEntry,
  CampaignTraceRecord,
  CampaignVerification,
  CampaignVerificationOptions,
} from "./types.js";
import { CAMPAIGN_SCHEMA_IDS } from "./vocabulary.js";

export type PersistedCampaignTraceLine = Readonly<{
  seq: number;
  event: CampaignEventDescriptor | null;
  entry: CampaignTraceEntry;
}>;

export type ParsedCampaignTraceLines =
  | Readonly<{ ok: true; lines: readonly PersistedCampaignTraceLine[] }>
  | Readonly<{ ok: false; error: string }>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Deterministic key-sorted JSON serialization for canonical event/record digests. */
export function canonicalCampaignJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : isObject(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}

export function formatCampaignTraceLine(line: PersistedCampaignTraceLine): string {
  return JSON.stringify({ seq: line.seq, event: line.event, entry: line.entry });
}

function parsePlainTraceLineObject(rawObj: unknown, expectedSeq: number): PersistedCampaignTraceLine | null {
  if (!isObject(rawObj)) return null;
  const proto = Object.getPrototypeOf(rawObj);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(rawObj);
  if (keys.length !== 3) return null;
  for (const required of ["seq", "event", "entry"] as const) {
    const desc = Object.getOwnPropertyDescriptor(rawObj, required);
    if (!desc || !Object.hasOwn(desc, "value") || !desc.enumerable) return null;
  }
  if (rawObj.seq !== expectedSeq) return null;
  const entry = parseCampaignTraceEntry(rawObj.entry);
  if (!entry || entry.seq !== expectedSeq) return null;
  const event = rawObj.event === null ? null : parseCampaignEvent(rawObj.event);
  if (rawObj.event !== null && !event) return null;
  return Object.freeze({ seq: expectedSeq, event, entry });
}

/** Strictly parse persisted JSONL trace lines without repairing or skipping holes. */
export function parseCampaignTraceLines(raw: string): ParsedCampaignTraceLines {
  if (raw === "") return { ok: true, lines: [] };
  const normalized = raw.endsWith("\r\n")
    ? raw.slice(0, -2)
    : raw.endsWith("\n")
      ? raw.slice(0, -1)
      : raw;
  const rawLines = normalized.split("\n");
  const lines: PersistedCampaignTraceLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineText = rawLines[i]!;
    if (lineText.length === 0) {
      return { ok: false, error: `Empty trace line at ${i}` };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(lineText) as unknown;
    } catch {
      return { ok: false, error: `Malformed JSON at trace line ${i}` };
    }
    const line = parsePlainTraceLineObject(parsedJson, i);
    if (!line) {
      return { ok: false, error: `Invalid trace line shape or sequence at ${i}` };
    }
    lines.push(line);
  }
  return { ok: true, lines };
}

/** Recompute and verify persisted trace lines using the pure campaign engine. */
export function verifyCampaignTraceLines(
  lines: readonly PersistedCampaignTraceLine[],
  options: CampaignVerificationOptions = {},
): CampaignVerification {
  const events = lines.map((line) => line.event);
  let replayed;
  try {
    replayed = replayCampaign(events, { authorize: options.authorize });
  } catch {
    return { valid: false, error: "Authority evidence failed during replay" };
  }
  const candidate: CampaignTraceRecord = {
    schema: CAMPAIGN_SCHEMA_IDS.trace,
    initial: replayed.initial,
    final: replayed.final,
    events: replayed.record.events,
    trace: lines.map((line) => line.entry),
  };
  return verifyCampaignRecord(candidate, options);
}

export type PersistedCampaignEvidenceLine = Readonly<{
  seq: number;
  authorizedPrivileged: boolean;
  eventSha256: string;
  recordSha256: string;
  artifactSha256?: string;
}>;

export type ParsedCampaignEvidenceLines =
  | Readonly<{ ok: true; lines: readonly PersistedCampaignEvidenceLine[] }>
  | Readonly<{ ok: false; error: string }>;

export function campaignSha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function formatCampaignEvidenceLine(line: PersistedCampaignEvidenceLine): string {
  return JSON.stringify({
    seq: line.seq,
    authorizedPrivileged: line.authorizedPrivileged,
    eventSha256: line.eventSha256,
    recordSha256: line.recordSha256,
    ...(line.artifactSha256 !== undefined ? { artifactSha256: line.artifactSha256 } : {}),
  });
}

function isSha256Hex(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

function parsePlainEvidenceLineObject(rawObj: unknown, expectedSeq: number): PersistedCampaignEvidenceLine | null {
  if (!isObject(rawObj)) return null;
  const proto = Object.getPrototypeOf(rawObj);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(rawObj);
  if (keys.length !== 4 && keys.length !== 5) return null;
  for (const required of ["seq", "authorizedPrivileged", "eventSha256", "recordSha256"] as const) {
    const desc = Object.getOwnPropertyDescriptor(rawObj, required);
    if (!desc || !Object.hasOwn(desc, "value") || !desc.enumerable) return null;
  }
  if (keys.length === 5) {
    const desc = Object.getOwnPropertyDescriptor(rawObj, "artifactSha256");
    if (
      !desc ||
      !Object.hasOwn(desc, "value") ||
      !desc.enumerable ||
      !isSha256Hex(rawObj.artifactSha256)
    ) {
      return null;
    }
  }
  if (
    rawObj.seq !== expectedSeq ||
    typeof rawObj.authorizedPrivileged !== "boolean" ||
    !isSha256Hex(rawObj.eventSha256) ||
    !isSha256Hex(rawObj.recordSha256)
  ) {
    return null;
  }
  return Object.freeze({
    seq: expectedSeq,
    authorizedPrivileged: rawObj.authorizedPrivileged,
    eventSha256: rawObj.eventSha256,
    recordSha256: rawObj.recordSha256,
    ...(keys.length === 5 ? { artifactSha256: rawObj.artifactSha256 as string } : {}),
  });
}

/** Strictly parse separately bound persistence evidence lines. */
export function parseCampaignEvidenceLines(raw: string): ParsedCampaignEvidenceLines {
  if (raw === "") return { ok: true, lines: [] };
  const normalized = raw.endsWith("\r\n")
    ? raw.slice(0, -2)
    : raw.endsWith("\n")
      ? raw.slice(0, -1)
      : raw;
  const rawLines = normalized.split("\n");
  const lines: PersistedCampaignEvidenceLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineText = rawLines[i]!;
    if (lineText.length === 0) {
      return { ok: false, error: `Empty evidence line at ${i}` };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(lineText) as unknown;
    } catch {
      return { ok: false, error: `Malformed JSON at evidence line ${i}` };
    }
    const line = parsePlainEvidenceLineObject(parsedJson, i);
    if (!line) {
      return { ok: false, error: `Invalid evidence line shape or sequence at ${i}` };
    }
    lines.push(line);
  }
  return { ok: true, lines };
}

/** Parse either a persisted trace.jsonl string or a serialized CampaignTraceRecord JSON. */
export function parseCampaignTraceInput(
  raw: string,
):
  | Readonly<{ ok: true; kind: "record"; record: CampaignTraceRecord }>
  | Readonly<{ ok: true; kind: "jsonl"; lines: readonly PersistedCampaignTraceLine[] }>
  | Readonly<{ ok: false; error: string }> {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const record = parseCampaignRecord(parsed);
      if (record) return { ok: true, kind: "record", record };
    } catch {
      // Fall through to JSONL parsing, which reports line-level errors.
    }
  }
  const jsonl = parseCampaignTraceLines(raw);
  if (!jsonl.ok) return jsonl;
  return { ok: true, kind: "jsonl", lines: jsonl.lines };
}
