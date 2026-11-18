import { createRuntimeAdapter, createRuntimeEvent, initialSteeringState, stepSteering } from "../steering.js";
import { CampaignStates as S, CampaignDecisions as D, CampaignPhases as P, CampaignSignals, AgentOps as A, OperatorVerbs as O, EngineOps as E, DecisionActions, TERMINAL_STATES, CAMPAIGN_SCHEMA_IDS } from "./vocabulary.js";
import { immutableSnapshot, isValidCharterForRecon, parseCampaignEvent, parseCampaignState, parseCampaignRecord } from "./schema.js";
import type { CampaignState, CampaignEventDescriptor, CampaignStep, CampaignReplay, CampaignTraceEntry, CampaignTraceRecord, CampaignVerification, CampaignVerificationOptions, CampaignOperatorCommand, EngineCommand, OperatorEventCapability, EngineEventCapability, OperatorCampaignEvent, EngineCampaignEvent, CampaignCharter } from "./types.js";

const operatorCapabilities = new WeakSet<object>();
const engineCapabilities = new WeakSet<object>();
const operatorEvents = new WeakSet<object>();
const engineEvents = new WeakSet<object>();
const steeringAdapter = createRuntimeAdapter();
const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

/** I/O-shell integration seam ONLY. This is not authentication against arbitrary
 * host code: anyone able to execute imports can call this exported mint path.
 * The shell must establish human origin separately. No symbol/property can be
 * reflected or copied to forge membership, and JSON never gains live authority. */
export function createCampaignOperatorAdapter(): OperatorEventCapability {
  const token = Object.freeze({});
  operatorCapabilities.add(token);
  return token as OperatorEventCapability;
}
/** Trusted runtime shell seam, separate from operator authority. */
export function createCampaignEngineAdapter(): EngineEventCapability {
  const token = Object.freeze({});
  engineCapabilities.add(token);
  return token as EngineEventCapability;
}
export function createCampaignOperatorEvent(capability: OperatorEventCapability, command: CampaignOperatorCommand): OperatorCampaignEvent {
  if (!isObject(capability) || !operatorCapabilities.has(capability)) throw new Error("A live operator adapter is required");
  const parsed = parseCampaignEvent(command);
  if (!parsed || parsed.channel !== "operator") throw new Error("Invalid operator command");
  operatorEvents.add(parsed);
  return parsed as OperatorCampaignEvent;
}
export function createCampaignEngineEvent(capability: EngineEventCapability, command: EngineCommand): EngineCampaignEvent {
  if (!isObject(capability) || !engineCapabilities.has(capability)) throw new Error("A live engine adapter is required");
  const parsed = parseCampaignEvent(command);
  if (!parsed || parsed.channel !== "engine") throw new Error("Invalid engine command");
  engineEvents.add(parsed);
  return parsed as EngineCampaignEvent;
}
export function initialCampaignState(): CampaignState {
  return immutableSnapshot({ state: S.unarmed, charter: null, recon: null, queue: [], charterRevision: 0, approved: false, incident: null, steering: initialSteeringState(), completed: 0, total: 0 });
}
function terminal(state: CampaignState): boolean { return (TERMINAL_STATES as readonly string[]).includes(state.state); }
function pendingPerson(state: CampaignState): boolean {
  return state.state === S.decisions || (state.state === S.convergence && state.incident?.requiresPerson === true);
}
function phase(state: CampaignState): CampaignTraceEntry["phase"] {
  if (terminal(state)) return P.terminal;
  if (state.state === S.decisions) return P.decisions;
  if (state.state === S.executing) return P.execution;
  if (state.state === S.convergence) return P.convergence;
  return P.recon;
}
function validCharter(state: CampaignState, charter: CampaignCharter, revision: number): boolean {
  return isValidCharterForRecon(state.recon, charter, revision);
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
/** Single mechanical transition evaluator. Its authority boolean is private;
 * public callers can only supply identity-backed events or trusted audit evidence. */
function evaluate(state: CampaignState, event: CampaignEventDescriptor | null, authorized: boolean, seq: number): CampaignStep {
  let next = state;
  let decision: CampaignTraceEntry["decision"] = D.hold;
  let signal: CampaignTraceEntry["signal"] = event ? "none" : "invalid-input";
  let accepted = false;
  let clause: string | null = null;
  const change = (patch: Partial<CampaignState>, d: CampaignTraceEntry["decision"], s: CampaignTraceEntry["signal"]) => {
    next = immutableSnapshot({ ...state, ...patch }); decision = d; signal = s; accepted = true;
  };
  if (event && !terminal(state)) {
    if (event.channel === "agent") {
      switch (event.op) {
        case A.open:
          if (state.state === S.unarmed) change({ state: S.recon }, D.recon, "open-request");
          break;
        case A.recon:
          if (state.state === S.recon && event.recon.citations.length > 0) change({ recon: event.recon }, D.recon, "recon-complete");
          break;
        case A.propose:
          if (state.state === S.recon && validCharter(state, event.charter, 1)) change({ state: S.decisions, charter: event.charter, charterRevision: 1, queue: event.charter.queue, total: event.charter.queue.length }, D.decisions, "proposal");
          break;
        case A.incident:
          if (state.state === S.executing && state.approved && event.incident.skills.every(s => state.charter!.allowedSkills.includes(s))) change({ state: S.convergence, incident: event.incident }, D.convergence, "incident-reported");
          break;
        case A.next:
          if (state.state === S.convergence && state.incident && state.approved) {
            if (state.incident.requiresPerson) signal = CampaignSignals.personRequired;
            else change({ state: S.executing, incident: null }, D.explore, "work-ready");
          }
          break;
        // Work-unit scheduling and receipts belong to U4. These observations
        // deliberately do not advance progress or infer campaign completion.
        case A.report: case A.status: break;
      }
    } else if (authorized && event.channel === "operator") {
      if (event.multiplexed === true && event.optIn !== true) {
        // Fail closed (FD-11 / D-010): multiplexed operator channel without opt-in stays HOLD, accepted = false.
      } else {
        switch (event.op) {
          case O.decide:
            if (state.state === S.decisions && state.charter && event.charterRevision === state.charterRevision) {
              if (event.action === DecisionActions.approve) change({ state: S.executing, approved: true }, D.explore, "decision");
              else change({ state: S.stoppedByUser }, D.stop, "decision");
            }
            break;
          case O.amend:
            if (state.charter && (state.state === S.decisions || state.state === S.executing || state.state === S.convergence) && validCharter(state, event.charter, state.charterRevision + 1) && equal(event.charter.queue, state.queue)) change({ state: S.decisions, charter: event.charter, charterRevision: event.charter.revision, approved: false, incident: null }, D.decisions, "amendment");
            break;
          case O.answer:
            if (state.state === S.convergence && state.incident?.id === event.incidentId && state.approved) change({ state: S.executing, incident: null }, D.explore, CampaignSignals.answer);
            break;
          case O.checkpoint:
            if (state.approved && (state.state === S.executing || state.state === S.convergence)) change({}, D.checkpoint, "checkpoint-request");
            break;
          case O.stop:
            if (state.state !== S.unarmed) change({ state: S.stoppedByUser }, D.stop, "stop-request");
            break;
        }
      }
    } else if (authorized && event.channel === "engine" && state.state !== S.unarmed) {
      const mechanicalTerminal = event.op === E.sessionEnd || event.op === E.fail || event.op === E.block || event.op === E.policyStop;
      const charterAuthorized = state.charter?.clauses.includes(event.clause) === true;
      if (mechanicalTerminal || charterAuthorized) {
        // A runtime terminal is independently authoritative. Only claim a charter
        // clause when that exact clause actually authorized the event.
        if (!mechanicalTerminal && charterAuthorized) clause = event.clause;
        switch (event.op) {
          case E.verify:
            if (state.approved && (state.state === S.executing || state.state === S.convergence)) {
              const type = event.passed ? "behavioral-recovery" : "behavioral-failure";
              const result = stepSteering(state.steering, createRuntimeEvent(steeringAdapter, type));
              if (result.decision === "hold") { accepted = true; signal = type; }
              else change({ steering: result.state }, event.passed ? D.recover : D.explore, type);
            }
            break;
          case E.complete:
            if (state.approved && state.state === S.executing) change({ state: S.completed }, D.close, "completed");
            break;
          case E.policyStop: change({ state: S.stoppedByPolicy }, D.stop, "policy-refusal"); break;
          case E.block: change({ state: S.blocked }, D.stop, "blocked"); break;
          case E.fail: change({ state: S.failedSafe }, D.stop, "failed-safe"); break;
          case E.sessionEnd: change({ state: S.endedWithSession }, D.stop, "session-ended"); break;
        }
      }
    }
  }
  if (accepted && event?.channel === "operator") clause = "operator-control-plane";
  if (accepted && event?.channel === "agent" && event.op === A.propose) clause = "recon.citations";
  if (accepted && event?.channel === "agent" && (event.op === A.incident || event.op === A.next)) clause = "allowedSkills";
  // Include the incident's skills when attempting to continue or answer it,
  // even if the attempt is refused. Attempted skills are not permissions.
  const incidentAction = event?.channel === "agent" && event.op === A.next
    || event?.channel === "operator" && event.op === O.answer;
  const skills = event?.channel === "agent" && event.op === A.incident ? event.incident.skills
    : event && "charter" in event ? event.charter.queue.map(q => q.skill)
    : state.state === S.convergence && incidentAction ? state.incident?.skills ?? [] : [];
  const personRequired = event?.channel === "operator" || pendingPerson(state) || pendingPerson(next);
  const provenance =
    event?.channel === "operator"
      ? {
          ...(event.attribution !== undefined ? { attribution: event.attribution } : {}),
          ...(event.operatorChannel !== undefined ? { operatorChannel: event.operatorChannel } : {}),
          ...(event.multiplexed !== undefined ? { multiplexed: event.multiplexed } : {}),
          ...(event.optIn !== undefined ? { optIn: event.optIn } : {}),
        }
      : {};
  const entry: CampaignTraceEntry = immutableSnapshot({
    seq, from: state.state, to: next.state, trigger: event?.op ?? "none", decision, signal,
    charterRevision: next.charterRevision, charterClause: accepted ? clause : null, skills,
    phase: phase(next), workUnit: null, personRequired, channel: event?.channel ?? "none", accepted,
    ...provenance,
  });
  return Object.freeze({ state: next, entry });
}
/** Invalid/absent input is an identity-preserving no-op. seq is audit position,
 * not hidden state; replay records every input, including rejected/no-op ones. */
export function stepCampaign(state: CampaignState, input?: unknown, seq = 0): CampaignStep {
  if (!parseCampaignState(state)) throw new Error("Invalid campaign state");
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("Invalid audit position");
  const event = parseCampaignEvent(input);
  const authorized = isObject(input) && (event?.channel === "operator" ? operatorEvents.has(input) : event?.channel === "engine" ? engineEvents.has(input) : false);
  return evaluate(state, event, authorized, seq);
}
/** Live events retain in-process authority. For serialized replay only, the
 * optional trusted evidence seam authorizes exact descriptors by position;
 * it never creates a live event/capability and must not trust channel claims.
 * Visit every position in the initial array length: a missing own index is an
 * absent input (HOLD), never a skipped audit position or inherited event.
 * Serialized record arrays remain strict/dense; normalized holes become null. */
export function replayCampaign(events: readonly unknown[], options: Pick<CampaignVerificationOptions, "authorize"> = {}): CampaignReplay {
  const initial = initialCampaignState();
  let state = initial;
  const trace: CampaignTraceEntry[] = [];
  const descriptors: (CampaignEventDescriptor | null)[] = [];
  const length = events.length;
  for (let i = 0; i < length; i++) {
    const event = Object.hasOwn(events, i) ? events[i] : undefined;
    const descriptor = parseCampaignEvent(event);
    const liveStep = stepCampaign(state, event, i);
    const step = descriptor && descriptor.channel !== "agent" && options.authorize?.(descriptor, i) === true
      ? evaluate(state, descriptor, true, i) : liveStep;
    state = step.state; trace.push(step.entry); descriptors.push(descriptor);
  }
  const record = immutableSnapshot({ schema: CAMPAIGN_SCHEMA_IDS.trace, initial, final: state, events: descriptors, trace });
  return Object.freeze({ initial, final: state, trace: record.trace, record });
}
/** Stable key-sorted representation suitable for an independently retained
 * commitment. It is NOT a signature/hash or authentication mechanism. */
export function serializeCampaignRecord(record: CampaignTraceRecord): string {
  const parsed = parseCampaignRecord(record);
  if (!parsed) throw new Error("Invalid campaign record");
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(parsed));
}
/** Recompute all transitions. By default serialized operator/runtime claims
 * have NO authority. authorize must consult independent trusted evidence, not
 * the record's channel/accepted fields. Hostile host callbacks are out of scope.
 * A record alone cannot detect deletion of BOTH a no-op event and its entry (or
 * replacement by another self-consistent history). expectedRecord binds the
 * entire log to an independently retained commitment, including trailing HOLDs. */
export function verifyCampaignRecord(input: unknown, options: CampaignVerificationOptions = {}): CampaignVerification {
  const record = parseCampaignRecord(input);
  if (!record) return { valid: false, error: "Invalid record shape" };
  if (options.expectedRecord !== undefined && serializeCampaignRecord(record) !== options.expectedRecord) return { valid: false, error: "Record commitment mismatch" };
  if (!equal(record.initial, initialCampaignState()) || record.events.length !== record.trace.length) return { valid: false, error: "Invalid initial state or event count" };
  let state = initialCampaignState();
  for (let i = 0; i < record.events.length; i++) {
    const event = record.events[i];
    let authorized = false;
    if (event && event.channel !== "agent" && options.authorize) {
      try { authorized = options.authorize(event, i) === true; } catch { return { valid: false, error: `Authority evidence failed at ${i}` }; }
    }
    const result = evaluate(state, event, authorized, i);
    if (!equal(result.entry, record.trace[i])) return { valid: false, error: `Trace mismatch at ${i}` };
    state = result.state;
  }
  return equal(state, record.final) ? { valid: true, record } : { valid: false, error: "Final state mismatch" };
}
