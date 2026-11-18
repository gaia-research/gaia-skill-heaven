import { STEERING_RUNGS, SEARCH_STATES } from "../steering.js";
import {
  CampaignStates as S,
  AgentOps as A,
  OperatorVerbs as O,
  EngineOps as E,
  DecisionActions as D,
  CAMPAIGN_SCHEMA_IDS,
  CAMPAIGN_STATES,
  CAMPAIGN_DECISIONS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_PHASES,
  CAMPAIGN_SIGNALS,
  AGENT_OPS,
  OPERATOR_VERBS,
  ENGINE_OPS,
  OPERATOR_ATTRIBUTION,
  OPERATOR_CHANNEL_MCP_ELICITATION,
} from "./vocabulary.js";
import type { CampaignCharter, CampaignRecon, CampaignTraceEntry, CampaignTraceRecord, CampaignState, CampaignEventDescriptor, ConvergenceIncident, ControllerStatus } from "./types.js";
export { CAMPAIGN_SCHEMA_IDS };
export { parseCampaignManifest, isValidManifestForRecon } from "./manifest.js";
type Rec = Record<string, unknown>;
type Check = (v: unknown) => boolean;
const str: Check = v => typeof v === "string";
const text: Check = v => typeof v === "string" && v.trim().length > 0;
const bool: Check = v => typeof v === "boolean";
const nat: Check = v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sha256: Check = v => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const member = (values: readonly string[]): Check => v => typeof v === "string" && values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
/** Reject accessors, inherited records, symbol/non-enumerable extras and sparse/extended arrays. */
function object(v: unknown, fields: Record<string, Check>, optional: readonly string[] = []): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(v).some(k => typeof k !== "string" || !Object.hasOwn(fields, k))) return false;
  return Object.entries(fields).every(([k, check]) => {
    const d = descriptors[k];
    return d ? Object.hasOwn(d, "value") && d.enumerable === true && check(d.value) : optional.includes(k);
  });
}
const array = (check: Check): Check => v => {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) return false;
  if (Reflect.ownKeys(v).length !== v.length + 1) return false;
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable || !check(d.value)) return false;
  }
  return true;
};
const strings = array(text);
const queueItem: Check = v => object(v, { id: text, skill: text, reconCitation: text });
const queue = array(queueItem);
const schema = (id: string): Check => v => v === id;
const charter: Check = v => object(v, {
  schema: schema(CAMPAIGN_SCHEMA_IDS.charter), revision: nat, goal: text,
  allowedSkills: strings, queue, recoverLimit: nat, reopenLimit: nat,
  sessionRetention: nat, clauses: strings,
});
const recon: Check = v => object(v, {
  schema: schema(CAMPAIGN_SCHEMA_IDS.recon), findings: strings, citations: strings,
});
const incident: Check = v => object(v, {
  schema: schema(CAMPAIGN_SCHEMA_IDS.incident), id: text, description: text,
  skills: strings, requiresPerson: bool,
});
const stateName = member(CAMPAIGN_STATES);
const steering: Check = v => object(v, { rung: member(STEERING_RUNGS), search: member(SEARCH_STATES) });
export function isValidCharterForRecon(recon: CampaignRecon | null, value: CampaignCharter, revision: number): boolean {
  if (!recon || !Number.isSafeInteger(revision) || revision < 1) return false;
  if (value.revision !== revision || value.clauses.length === 0 || value.queue.length === 0) return false;
  const ids = new Set(value.queue.map(q => q.id));
  return (
    ids.size === value.queue.length &&
    new Set(value.allowedSkills).size === value.allowedSkills.length &&
    value.queue.every(q => value.allowedSkills.includes(q.skill) && recon.citations.includes(q.reconCitation))
  );
}
const state: Check = v => {
  if (!object(v, {
    state: stateName, charter: nullable(charter), recon: nullable(recon), queue,
    charterRevision: nat, approved: bool, incident: nullable(incident), steering,
    completed: nat, total: nat,
  })) return false;
  const s = v as CampaignState;
  if (s.completed > s.total || s.total !== s.queue.length) return false;
  if (!s.charter) {
    if (s.charterRevision !== 0 || s.approved || s.queue.length !== 0) return false;
  } else {
    if (!isValidCharterForRecon(s.recon, s.charter, s.charterRevision)) return false;
    if (s.charter.queue.length !== s.queue.length || !s.queue.every((q, i) => q.id === s.charter!.queue[i]!.id && q.skill === s.charter!.queue[i]!.skill && q.reconCitation === s.charter!.queue[i]!.reconCitation)) return false;
  }
  if (s.state === S.unarmed && (s.charter || s.recon || s.incident || s.completed !== 0)) return false;
  if (s.state === S.recon && (s.charter || s.incident)) return false;
  if (s.state === S.decisions && (!s.charter || s.approved || s.incident)) return false;
  if ((s.state === S.executing || s.state === S.convergence || s.state === S.completed) && !s.approved) return false;
  if (s.state === S.executing && s.incident) return false;
  if (s.state === S.convergence && !s.incident) return false;
  return !s.incident || s.incident.skills.every(skill => s.charter?.allowedSkills.includes(skill));
};
const allOps = [...AGENT_OPS, ...OPERATOR_VERBS, ...ENGINE_OPS];
const event: Check = v => {
  // Read only data descriptors before selecting the per-operation schema.
  if (!v || typeof v !== "object") return false;
  const c = Object.getOwnPropertyDescriptor(v, "channel");
  const o = Object.getOwnPropertyDescriptor(v, "op");
  if (!c || !o || !Object.hasOwn(c, "value") || !Object.hasOwn(o, "value")) return false;
  const base = { channel: schema(c.value), op: schema(o.value) };
  if (c.value === "agent") {
    switch (o.value) {
      case A.open: return object(v, { ...base, goalSha256: sha256 }, ["goalSha256"]);
      case A.next: case A.report: case A.status: return object(v, base);
      case A.recon: return object(v, { ...base, recon });
      case A.propose: return object(v, { ...base, charter });
      case A.incident: return object(v, { ...base, incident });
    }
  }
  if (c.value === "operator") {
    const provenanceFields = {
      attribution: schema(OPERATOR_ATTRIBUTION),
      operatorChannel: schema(OPERATOR_CHANNEL_MCP_ELICITATION),
      multiplexed: bool,
      optIn: bool,
    };
    const provenanceOptional = ["attribution", "operatorChannel", "multiplexed", "optIn"] as const;
    switch (o.value) {
      case O.decide: return object(v, { ...base, ...provenanceFields, action: member(Object.values(D)), charterRevision: nat }, provenanceOptional);
      case O.amend: return object(v, { ...base, ...provenanceFields, charter }, provenanceOptional);
      case O.answer: return object(v, { ...base, ...provenanceFields, incidentId: text, answer: text }, provenanceOptional);
      case O.checkpoint: case O.stop: return object(v, { ...base, ...provenanceFields }, provenanceOptional);
    }
  }
  if (c.value === "engine" && ENGINE_OPS.includes(o.value)) return object(v, o.value === E.verify ? { ...base, passed: bool, clause: text } : { ...base, clause: text });
  return false;
};
const trace: Check = v => {
  if (!object(v, {
    seq: nat, from: stateName, to: stateName, trigger: member([...allOps, "none"]),
    decision: member(CAMPAIGN_DECISIONS), signal: member(CAMPAIGN_SIGNALS),
    charterRevision: nat, charterClause: nullable(text), skills: strings,
    phase: member(CAMPAIGN_PHASES), workUnit: nullable(text), personRequired: bool,
    channel: member(CAMPAIGN_CHANNELS), accepted: bool,
    attribution: schema(OPERATOR_ATTRIBUTION),
    operatorChannel: schema(OPERATOR_CHANNEL_MCP_ELICITATION),
    multiplexed: bool,
    optIn: bool,
  }, ["attribution", "operatorChannel", "multiplexed", "optIn"])) return false;
  const entry = v as CampaignTraceEntry;
  if (
    entry.channel !== "operator" &&
    (entry.attribution !== undefined ||
      entry.operatorChannel !== undefined ||
      entry.multiplexed !== undefined ||
      entry.optIn !== undefined)
  ) {
    return false;
  }
  return true;
};
const record: Check = v => object(v, {
  schema: schema(CAMPAIGN_SCHEMA_IDS.trace), initial: state, final: state,
  events: array(nullable(event)), trace: array(trace),
});
const progress: Check = v => {
  if (!object(v, { completed: nat, total: nat })) return false;
  const p = v as { completed: number; total: number };
  return p.total > 0 && p.completed <= p.total;
};
const status: Check = v => object(v, {
  schema: schema(CAMPAIGN_SCHEMA_IDS.status), state: stateName,
  effective: member(STEERING_RUNGS), progress,
  transition: t => object(t, { from: stateName, to: stateName, reason: str }),
}, ["effective", "progress", "transition"]);
/** Clone then recursively freeze validated data. No authority survives this operation. */
export function immutableSnapshot<T>(v: T): T {
  if (Array.isArray(v)) return Object.freeze(v.map(x => immutableSnapshot(x))) as T;
  if (v !== null && typeof v === "object") return Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, immutableSnapshot(x)]))) as T;
  return v;
}
function parse<T>(v: unknown, check: Check): T | null {
  try { return check(v) ? immutableSnapshot(v) as T : null; } catch { return null; }
}
export const parseCampaignCharter = (v: unknown) => parse<CampaignCharter>(v, charter);
export const parseCampaignRecon = (v: unknown) => parse<CampaignRecon>(v, recon);
export const parseConvergenceIncident = (v: unknown) => parse<ConvergenceIncident>(v, incident);
export const parseCampaignState = (v: unknown) => parse<CampaignState>(v, state);
export const parseCampaignEvent = (v: unknown) => parse<CampaignEventDescriptor>(v, event);
export const parseCampaignTraceEntry = (v: unknown) => parse<CampaignTraceEntry>(v, trace);
export const parseCampaignRecord = (v: unknown) => parse<CampaignTraceRecord>(v, record);
export const parseControllerStatus = (v: unknown) => parse<ControllerStatus>(v, status);
export const isCampaignDecision = member(CAMPAIGN_DECISIONS);
export const isCampaignOp = member(allOps);
export const isCampaignSignal = member(CAMPAIGN_SIGNALS);
