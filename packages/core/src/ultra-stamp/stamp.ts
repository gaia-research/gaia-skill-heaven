// Pure, read-only, zero-dependency stamper: Claude Code transcript JSONL text in,
// skill-ultra-stamp/v1 document out. No fs, no network, no model, no hooks.
// (File reading lives in the CLI wrapper; this module only sees a string.)
//
// Redaction is by construction: the output is assembled only from enums,
// integers, regex-bounded ids, hex digests, and line numbers. Transcript text
// is read to make decisions and is never copied. Plain-text mentions of a skill
// name are deliberately NOT evidence of anything.
//
// The cheap-model advisory classifier is a documented, UNIMPLEMENTED seam
// (docs/ULTRA-STAMP.md): it would run only on this already-redacted output and
// could only annotate, never raise a level to "true".

import { createHmac } from "node:crypto";
import {
  EVENT_UUID, LEVELS, MODEL_ID, SKILL_ID, ULTRA_STAMP_OBSERVER, ULTRA_STAMP_SCHEMA,
  type ActivationMode, type Confidence, type EventKind, type EventRef, type Level, type LevelStamp,
  type SkillStamp, type TriState, type UltraStampDocument, validateUltraStamp,
} from "./contract.js";

export interface StampOptions {
  /** User-supplied salt. Used only as the HMAC key; never stored, never emitted. */
  salt: string;
  /** Optional user-pinned skills: id plus sha256(SKILL.md) computed by the caller (contentSha256). */
  skills?: Array<{ id: string; sha256: string }>;
}

interface Ev {
  line: number;
  uuid?: string;
  type: string;
  subtype?: string;
  isMeta: boolean;
  content: unknown;
  attachment?: Record<string, unknown>;
}
interface Call { skill: string | null; mode: "skill-tool" | "summon"; ref: EventRef; toolUseId?: string; idx: number }

const ref = (e: Ev, kind: EventKind): EventRef =>
  ({ line: e.line, ...(e.uuid !== undefined ? { uuid: e.uuid } : {}), kind });

function blocks(content: unknown): Array<Record<string, unknown>> {
  return Array.isArray(content) ? content.filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null) : [];
}
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return blocks(content).map((b) => {
    if (typeof b.text === "string") return b.text;
    if (b.type === "tool_result") return textOf(b.content);
    return "";
  }).join("\n");
}
function isSummonTool(name: unknown): boolean {
  return typeof name === "string" && /^mcp__.*summon$/.test(name);
}
function level(state: TriState, confidence: Confidence, evidence: EventRef[] = []): LevelStamp {
  return { state, confidence, evidence: evidence.slice(0, 64) };
}

export function stampTranscript(jsonl: string, opts: StampOptions): UltraStampDocument {
  if (typeof opts.salt !== "string" || opts.salt.length < 8) throw new Error("a salt of at least 8 characters is required");

  // ---- parse -------------------------------------------------------------
  const events: Ev[] = [];
  let malformed = 0;
  let sessionId = "";
  let harnessVersion: string | undefined;
  const models: string[] = [];
  jsonl.split("\n").forEach((raw, i) => {
    if (raw.trim() === "") return;
    let o: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      o = parsed as Record<string, unknown>;
    } catch {
      malformed++;
      return;
    }
    const msg = (typeof o.message === "object" && o.message !== null ? o.message : {}) as Record<string, unknown>;
    const uuid = typeof o.uuid === "string" && EVENT_UUID.test(o.uuid) ? o.uuid : undefined;
    if (!sessionId && typeof o.sessionId === "string") sessionId = o.sessionId;
    if (!harnessVersion && typeof o.version === "string" && /^[A-Za-z0-9._+-]{1,40}$/.test(o.version)) harnessVersion = o.version;
    if (typeof msg.model === "string" && MODEL_ID.test(msg.model) && !models.includes(msg.model)) models.push(msg.model);
    events.push({
      line: i + 1, uuid, type: String(o.type ?? ""), subtype: typeof o.subtype === "string" ? o.subtype : undefined,
      isMeta: o.isMeta === true, content: msg.content,
      attachment: typeof o.attachment === "object" && o.attachment !== null ? (o.attachment as Record<string, unknown>) : undefined,
    });
  });

  // ---- facts -------------------------------------------------------------
  let listing: Map<string, EventRef> | null = null;
  const manifest = new Map<string, string>((opts.skills ?? []).filter((s) => SKILL_ID.test(s.id)).map((s) => [s.id, s.sha256]));
  const calls: Call[] = [];
  const unattributed: Array<{ kind: EventKind; evidence: EventRef[] }> = [];
  const results = new Map<string, { ref: EventRef; error: boolean; text: string; idx: number }>();
  const compactions: EventRef[] = [];
  let sawAssistant = false;

  events.forEach((e, idx) => {
    if (e.type === "attachment" && e.attachment?.type === "skill_listing") {
      listing ??= new Map();
      // Claude Code 2.1.318 ships a structured `names: string[]` beside the rendered `content`;
      // prefer it. Rendered lines may carry a parenthetical source: `- id (plugin): desc`.
      const names = Array.isArray(e.attachment.names)
        ? e.attachment.names.filter((n: unknown): n is string => typeof n === "string" && SKILL_ID.test(n))
        : [];
      const ids = names.length > 0
        ? names
        : [...textOf(e.attachment.content).matchAll(/^- ([A-Za-z0-9][A-Za-z0-9._:/-]{0,127})(?:\s+\([^)\n]*\))?\s*(?::|$)/gm)].map((m) => m[1]);
      for (const id of ids) {
        if (!listing.has(id)) listing.set(id, ref(e, "skill-listing"));
      }
    }
    if (e.type === "summary" || (e.type === "system" && e.subtype === "compact_boundary")) compactions.push(ref(e, "compaction"));
    if (e.type === "assistant") {
      sawAssistant = true;
      for (const b of blocks(e.content)) {
        if (b.type !== "tool_use") continue;
        const isSkill = b.name === "Skill";
        const isSummon = isSummonTool(b.name);
        if (!isSkill && !isSummon) continue;
        const input = (typeof b.input === "object" && b.input !== null ? b.input : {}) as Record<string, unknown>;
        const cand = isSkill ? input.skill : (input.skill ?? input.skill_id ?? input.id);
        const id = typeof cand === "string" && SKILL_ID.test(cand.trim()) ? cand.trim() : null;
        const kind: EventKind = isSkill ? "skill-tool-use" : "summon-tool-use";
        const toolUseId = typeof b.id === "string" ? b.id : undefined;
        calls.push({ skill: id, mode: isSkill ? "skill-tool" : "summon", ref: ref(e, kind), toolUseId, idx });
        if (id === null) unattributed.push({ kind, evidence: [ref(e, kind)] });
      }
    }
    if (e.type === "user") {
      for (const b of blocks(e.content)) {
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          const error = b.is_error === true;
          results.set(b.tool_use_id, { ref: ref(e, error ? "tool-result-error" : "tool-result"), error, text: textOf(b.content), idx });
        }
      }
    }
  });

  // slash invocations: user-typed `<command-name>/x</command-name>`, only for skills we otherwise know of
  const known = new Set<string>([...(listing ?? new Map<string, EventRef>()).keys(), ...manifest.keys(), ...calls.flatMap((c) => (c.skill ? [c.skill] : []))]);
  const slashes: Array<{ skill: string; ref: EventRef; idx: number }> = [];
  events.forEach((e, idx) => {
    if (e.type !== "user" || e.isMeta) return;
    const m = /<command-name>\/?([A-Za-z0-9][A-Za-z0-9._:/-]{0,127})<\/command-name>/.exec(textOf(e.content));
    if (m && known.has(m[1])) slashes.push({ skill: m[1], ref: ref(e, "slash-command"), idx });
  });

  // body injection: isMeta user events between a load and the next assistant event
  const bodyAfter = (idx: number): { ref: EventRef; baseDir?: string } | undefined => {
    for (let j = idx + 1; j < events.length && events[j].type !== "assistant"; j++) {
      if (events[j].type === "user" && events[j].isMeta) {
        const dir = /Base directory for this skill:\s*(\S+)/.exec(textOf(events[j].content));
        return { ref: ref(events[j], "body-injection"), baseDir: dir?.[1] };
      }
    }
    return undefined;
  };

  // ---- per-skill stamps --------------------------------------------------
  const ids = [...known].sort();
  const stamps: SkillStamp[] = ids.map((id) => {
    const mine = calls.filter((c) => c.skill === id);
    const mySlashes = slashes.filter((s) => s.skill === id);
    const listed = listing?.get(id);
    const pinned = manifest.has(id);
    const ambiguous = unattributed.length > 0;

    // installed
    const installed: LevelStamp = listed ? level("true", "high", [listed])
      : pinned ? level("true", "medium", [{ line: 1, kind: "manifest" }])
      : listing ? level("false", "medium")
      : level("unknown", "low");

    // invoked
    let invoked: LevelStamp;
    if (mine.length > 0) invoked = level("true", "high", mine.map((c) => c.ref));
    else if (mySlashes.length > 0) invoked = level("true", "medium", mySlashes.map((s) => s.ref));
    else if (ambiguous) invoked = level("unknown", "low", unattributed.flatMap((u) => u.evidence));
    else if (sawAssistant) invoked = level("false", listing ? "medium" : "low");
    else invoked = level("unknown", "none");

    // loaded: the body entered context (not merely the listing line)
    let loaded: LevelStamp;
    let loadIdx = -1;
    let baseDir: string | undefined;
    const okCalls = mine.filter((c) => c.toolUseId && results.get(c.toolUseId) && !results.get(c.toolUseId)!.error);
    if (okCalls.length > 0) {
      const c = okCalls[0];
      const r = results.get(c.toolUseId!)!;
      loadIdx = r.idx;
      const body = bodyAfter(r.idx);
      baseDir = body?.baseDir ?? /Base directory for this skill:\s*(\S+)/.exec(r.text)?.[1];
      loaded = level("true", body ? "high" : "medium", [c.ref, r.ref, ...(body ? [body.ref] : [])]);
    } else if (mySlashes.length > 0) {
      const body = bodyAfter(mySlashes[0].idx);
      if (body) { loaded = level("true", "medium", [mySlashes[0].ref, body.ref]); loadIdx = mySlashes[0].idx; baseDir = body.baseDir; }
      else loaded = level("unknown", "low", [mySlashes[0].ref]);
    } else if (mine.length > 0) {
      const errs = mine.filter((c) => c.toolUseId && results.get(c.toolUseId)?.error);
      loaded = errs.length === mine.length
        ? level("false", "high", errs.map((c) => results.get(c.toolUseId!)!.ref))
        : level("unknown", "low", mine.map((c) => c.ref));
    } else if (invoked.state === "false") loaded = level("false", invoked.confidence);
    else loaded = level("unknown", "low", invoked.evidence);

    // active: body still in context at the end of the observed window
    let active: LevelStamp;
    if (loaded.state === "false") active = level("false", loaded.confidence);
    else if (loaded.state === "unknown") active = level("unknown", "low");
    else {
      const after = compactions.filter((c) => c.line > loaded.evidence[0].line);
      active = after.length > 0 ? level("unknown", "low", after) : level("true", "medium", loaded.evidence.slice(0, 1));
    }

    // materially_used: only a deterministic signal counts — a later tool call that
    // references the skill's own bundled directory. Anything softer stays unknown.
    let material: LevelStamp;
    if (loaded.state === "false") material = level("false", loaded.confidence);
    else if (loaded.state === "unknown") material = level("unknown", "none");
    else {
      const hits: EventRef[] = [];
      const later: EventRef[] = [];
      events.forEach((e, idx) => {
        if (idx <= loadIdx || e.type !== "assistant") return;
        for (const b of blocks(e.content)) {
          if (b.type !== "tool_use" || b.name === "Skill" || isSummonTool(b.name)) continue;
          later.push(ref(e, "later-tool-use"));
          if (baseDir && baseDir.length >= 8 && JSON.stringify(b.input ?? {}).includes(baseDir)) hits.push(ref(e, "resource-reference"));
        }
      });
      material = hits.length > 0 ? level("true", "medium", [...loaded.evidence.slice(0, 1), ...hits])
        : level("unknown", later.length > 0 ? "low" : "none", later);
    }

    // verified_outcome: needs an outcome check this reader does not perform
    const verified = loaded.state === "false" ? level("false", loaded.confidence) : level("unknown", "none");

    const mode: ActivationMode = mine.length > 0 ? mine[0].mode
      : mySlashes.length > 0 ? "user-slash"
      : ambiguous ? "unknown"
      : listed ? "listing-only" : "none";
    const levels = { installed, loaded, invoked, active, materially_used: material, verified_outcome: verified } as Record<Level, LevelStamp>;
    for (const l of LEVELS) levels[l].evidence = levels[l].evidence.slice(0, 64);
    return { skillId: id, sourceDigest: manifest.get(id) ?? null, activationMode: mode, levels };
  });

  const pseudonym = "usp_" + createHmac("sha256", opts.salt).update(sessionId || "no-session-id").digest("hex");
  const doc: UltraStampDocument = {
    schema: ULTRA_STAMP_SCHEMA,
    observer: { ...ULTRA_STAMP_OBSERVER },
    sessionPseudonym: pseudonym,
    harness: { name: "claude-code", ...(harnessVersion ? { version: harnessVersion } : {}) },
    models,
    source: { events: events.length, malformedLines: malformed, skillListingSeen: listing !== null },
    stamps,
    unattributed,
  };
  validateUltraStamp(doc);
  return doc;
}
