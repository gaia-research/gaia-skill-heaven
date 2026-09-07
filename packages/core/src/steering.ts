// Deterministic Ultra steering over explicit behavioral events (SPEC §7, PLAN Lane S-now).
//
// This module has two deliberately separate boundaries:
//   1. untrusted JSON is parsed as an operator command, never as a runtime event;
//   2. a trusted host adapter constructs branded runtime events in-process.
//
// A ranking, refusal, score, or skill body is not an event here. The controller
// has no I/O, clock, randomness, hidden state, or background activity. The
// event vocabulary is local to this consumer until an upstream contract exists;
// it is not an Arbor schema.
//
// The deterministic shape is selectively informed by the earlier controller in
// gaia-skill-heaven #114, commit 4d0e2f9. Its retrieval-driven inputs,
// thresholds, and calibration were deliberately not carried forward.

/** The operational portion of the one ladder. `zero` is the floor and `ultra`
 * is the crown/controller, not a second position to hold concurrently. */
export const STEERING_RUNGS = ["low", "med", "high", "xhigh", "max"] as const;
export type SteeringRung = (typeof STEERING_RUNGS)[number];

export const STEERING_POLICY_VERSION = "gaia-steering-policy/v1" as const;
export const STEERING_TRACE_SCHEMA = "gaia-steering-trace/v1" as const;

/** Search lifecycle is separate from the single rung, so reopen/close are
 * visible decisions rather than implicit side effects of a posture change. */
export const SEARCH_STATES = ["open", "checkpointed", "closed", "stopped"] as const;
export type SearchState = (typeof SEARCH_STATES)[number];

export const RUNTIME_EVENT_TYPES = ["behavioral-failure", "behavioral-recovery"] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export const OPERATOR_EVENT_TYPES = ["reopen-search", "checkpoint", "close-search", "stop"] as const;
export type OperatorEventType = (typeof OPERATOR_EVENT_TYPES)[number];

export const EVENT_TYPES = [...RUNTIME_EVENT_TYPES, ...OPERATOR_EVENT_TYPES] as const;
export type SteeringEventType = (typeof EVENT_TYPES)[number];

export type SteeringProvenance =
  | "host-runtime-adapter"
  | "operator-control-plane"
  | "untrusted-input"
  | "none";

/** An untrusted CLI/file value. It is a command description, not an event and
 * cannot be passed to `stepSteering()` to authorize a transition. */
export type OperatorCommand = Readonly<{
  type: OperatorEventType;
  eventId?: string;
}>;

// These symbols are intentionally module-private. JSON cannot carry them, and
// an object with the same enumerable fields is not a SteeringEvent.
const runtimeCapabilityBrand = Symbol("runtime-adapter-capability");
const runtimeEventBrand = Symbol("runtime-behavioral-event");
const operatorEventBrand = Symbol("operator-control-event");

export type RuntimeAdapterCapability = Readonly<{
  readonly [runtimeCapabilityBrand]: true;
}>;
export type RuntimeBehavioralEvent = Readonly<{
  readonly type: RuntimeEventType;
  readonly eventId?: string;
  readonly [runtimeEventBrand]: true;
}>;
export type OperatorEvent = Readonly<{
  readonly type: OperatorEventType;
  readonly eventId?: string;
  readonly [operatorEventBrand]: true;
}>;

/** The only values accepted by `stepSteering()` as transition authority. */
export type SteeringEvent = RuntimeBehavioralEvent | OperatorEvent;
/** Compatibility name for callers referring to the event controller directly. */
export type BehavioralEvent = SteeringEvent;

export type SteeringPolicy = Readonly<{
  /** Version is recorded on every result and replay trace. */
  version: string;
  /** Lower bound for an explicit convergence step. */
  floor: SteeringRung;
  /** Upper bound for an explicit exploration step. */
  ceiling: SteeringRung;
}>;

export const DEFAULT_STEERING_POLICY: SteeringPolicy = Object.freeze({
  version: STEERING_POLICY_VERSION,
  floor: "low",
  ceiling: "max",
});

export type SteeringState = Readonly<{
  /** Exactly one operational rung; no parallel Heaven/Hell positions. */
  rung: SteeringRung;
  search: SearchState;
}>;

export type SteeringPosition = Readonly<{
  rung: SteeringRung;
  search: SearchState;
}>;

export type SteeringDecision =
  | "hold"
  | "explore"
  | "recover"
  | "reopen"
  | "checkpoint"
  | "close"
  | "stop";

export type SteeringDirection = "hold" | "explore" | "converge";

export type SteeringSignal =
  | "no-evidence"
  | "invalid-event"
  | "behavioral-failure"
  | "behavioral-recovery"
  | "search-reopen"
  | "checkpoint-request"
  | "search-close"
  | "stop-request";

/** A serializable description of a signal. It is an audit fact, not a live
 * event and cannot grant authority when read back from a record. */
export type SteeringSignalDescriptor = Readonly<{
  type: SteeringEventType;
  provenance: "host-runtime-adapter" | "operator-control-plane";
  eventId?: string;
}>;

export type SteeringStep = Readonly<{
  state: SteeringState;
  accepted: boolean;
  changed: boolean;
  decision: SteeringDecision;
  direction: SteeringDirection;
  /** Canonical signal used by the policy, never caller prose. */
  signal: SteeringSignal;
  eventType: SteeringEventType | null;
  provenance: SteeringProvenance;
  descriptor: SteeringSignalDescriptor | null;
  policyVersion: string;
  /** The complete normalized policy, not only its version. */
  policy: SteeringPolicy;
  from: SteeringPosition;
  to: SteeringPosition;
  /** Stable, structured-for-humans explanation of every step. */
  explanation: string;
}>;

export type SteeringTraceEntry = Readonly<{
  index: number;
  accepted: boolean;
  changed: boolean;
  decision: SteeringDecision;
  direction: SteeringDirection;
  signal: SteeringSignal;
  eventType: SteeringEventType | null;
  provenance: SteeringProvenance;
  descriptor: SteeringSignalDescriptor | null;
  policyVersion: string;
  policy: SteeringPolicy;
  from: SteeringPosition;
  to: SteeringPosition;
  explanation: string;
}>;

export type SteeringReplayRecord = Readonly<{
  schema: typeof STEERING_TRACE_SCHEMA;
  policy: SteeringPolicy;
  initial: SteeringState;
  final: SteeringState;
  trace: readonly SteeringTraceEntry[];
}>;

export type SteeringReplay = Readonly<{
  initial: SteeringState;
  final: SteeringState;
  steps: readonly SteeringStep[];
  trace: readonly SteeringTraceEntry[];
  /** Self-contained audit record with policy and initial state included. */
  record: SteeringReplayRecord;
}>;

export type SteeringReplayOptions = Readonly<{
  policy?: SteeringPolicy;
  start?: SteeringRung;
  search?: SearchState;
}>;

export type SteeringVerification =
  | Readonly<{ valid: true; record: SteeringReplayRecord }>
  | Readonly<{ valid: false; error: string }>;

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);
const RUNTIME_EVENT_TYPE_SET = new Set<string>(RUNTIME_EVENT_TYPES);
const OPERATOR_EVENT_TYPE_SET = new Set<string>(OPERATOR_EVENT_TYPES);
const RUNG_SET = new Set<string>(STEERING_RUNGS);
const SEARCH_STATE_SET = new Set<string>(SEARCH_STATES);
const DECISION_SET = new Set<string>(["hold", "explore", "recover", "reopen", "checkpoint", "close", "stop"]);
const DIRECTION_SET = new Set<string>(["hold", "explore", "converge"]);
const SIGNAL_SET = new Set<string>([
  "no-evidence",
  "invalid-event",
  "behavioral-failure",
  "behavioral-recovery",
  "search-reopen",
  "checkpoint-request",
  "search-close",
  "stop-request",
]);
const PROVENANCE_SET = new Set<string>([
  "host-runtime-adapter",
  "operator-control-plane",
  "untrusted-input",
  "none",
]);
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Construct the opaque capability held by a trusted host adapter. This is an
 * in-process boundary, not authentication or proof that a shell caller is a
 * human. Code with arbitrary access to this host can call exported functions;
 * untrusted skill/output JSON cannot manufacture the private brand. */
export function createRuntimeAdapter(): RuntimeAdapterCapability {
  return Object.freeze({ [runtimeCapabilityBrand]: true });
}

/** Construct a runtime behavioral event. Only this host-side path can create
 * a branded runtime event; it accepts no retrieval or skill-content data. */
export function createRuntimeEvent(
  adapter: RuntimeAdapterCapability,
  type: RuntimeEventType,
  eventId?: string,
): RuntimeBehavioralEvent {
  if (!isRuntimeCapability(adapter)) throw new Error("runtime event requires a host adapter capability");
  assertEventType(type, RUNTIME_EVENT_TYPE_SET, "runtime event");
  assertEventId(eventId);
  return Object.freeze({
    type,
    ...(eventId === undefined ? {} : { eventId }),
    [runtimeEventBrand]: true as const,
  });
}

/** Construct an explicit operator control. This does not assert that a human
 * typed it; it records only that the caller selected the operator control
 * plane. */
export function createOperatorEvent(type: OperatorEventType, eventId?: string): OperatorEvent {
  assertEventType(type, OPERATOR_EVENT_TYPE_SET, "operator event");
  assertEventId(eventId);
  return Object.freeze({
    type,
    ...(eventId === undefined ? {} : { eventId }),
    [operatorEventBrand]: true as const,
  });
}

/** Parse untrusted JSON as a narrow operator command. Runtime behavioral kinds,
 * `authority` claims, and unknown fields are rejected. Construction remains a
 * separate explicit step (`createOperatorEvent`). */
export function parseOperatorCommand(value: unknown): OperatorCommand | null {
  if (!isPlainRecord(value) || !hasAllowedKeys(value, ["type", "eventId"]) || !("type" in value)) return null;
  if (typeof value.type !== "string" || !OPERATOR_EVENT_TYPE_SET.has(value.type)) return null;
  if (value.eventId !== undefined && (typeof value.eventId !== "string" || !EVENT_ID_PATTERN.test(value.eventId))) {
    return null;
  }
  return {
    type: value.type as OperatorEventType,
    ...(value.eventId === undefined ? {} : { eventId: value.eventId }),
  };
}

/** @deprecated Use `parseOperatorCommand`. This legacy name parses data only;
 * it never returns a value accepted by `stepSteering()`. */
export function parseSteeringEvent(value: unknown): OperatorCommand | null {
  return parseOperatorCommand(value);
}

/** Parse a state supplied by a CLI or another process. Invalid state is not
 * silently repaired: callers must choose an explicit starting state. */
export function parseSteeringState(value: unknown): SteeringState | null {
  if (!isPlainRecord(value) || !hasExactlyKeys(value, ["rung", "search"])) return null;
  return isRung(value.rung) && isSearchState(value.search)
    ? { rung: value.rung, search: value.search }
    : null;
}

/** Build the initial state. Explicit fabricated values throw rather than being
 * clamped or repaired. */
export function initialSteeringState(
  start: SteeringRung = "med",
  search: SearchState = "open",
): SteeringState {
  if (!isRung(start)) throw new Error(`invalid steering start rung: ${String(start)}`);
  if (!isSearchState(search)) throw new Error(`invalid steering search state: ${String(search)}`);
  return { rung: start, search };
}

/** Parse the complete policy at an untrusted JSON boundary. */
export function parseSteeringPolicy(value: unknown): SteeringPolicy | null {
  if (!isPlainRecord(value) || !hasExactlyKeys(value, ["version", "floor", "ceiling"])) return null;
  if (
    typeof value.version !== "string" ||
    !VERSION_PATTERN.test(value.version) ||
    !isRung(value.floor) ||
    !isRung(value.ceiling) ||
    rungIndex(value.floor) > rungIndex(value.ceiling)
  ) {
    return null;
  }
  return { version: value.version, floor: value.floor, ceiling: value.ceiling };
}

/**
 * Apply exactly one branded event. Absent or malformed data holds. Raw JSON,
 * including an object claiming runtime authority, is not a branded event.
 * Invalid state and policy are rejected rather than repaired.
 */
export function stepSteering(
  state: SteeringState,
  input: unknown,
  policy: SteeringPolicy = DEFAULT_STEERING_POLICY,
): SteeringStep {
  const parsedPolicy = requirePolicy(policy);
  assertState(state, parsedPolicy);

  const event = identifyEvent(input);
  if (event === null) {
    const signal: SteeringSignal = input === undefined || input === null ? "no-evidence" : "invalid-event";
    return makeStep(state, {
      accepted: false,
      changed: false,
      decision: "hold",
      direction: "hold",
      signal,
      eventType: null,
      provenance: input === undefined || input === null ? "none" : "untrusted-input",
      descriptor: null,
      policy: parsedPolicy,
      from: positionOf(state),
      to: positionOf(state),
    });
  }

  const descriptor = descriptorFor(event);
  const from = positionOf(state);
  const applied = applyDescriptor(state, descriptor, parsedPolicy);
  return makeStep(state, {
    accepted: true,
    ...applied,
    signal: signalFor(descriptor.type),
    eventType: descriptor.type,
    provenance: descriptor.provenance,
    descriptor,
    policy: parsedPolicy,
    from,
    to: applied.to,
  });
}

/** Replay a trusted event trace with no clock, I/O, or hidden state. Invalid
 * entries are recorded as holds so the trace remains an honest description. */
export function replaySteering(
  events: readonly unknown[],
  policy?: SteeringPolicy,
  start?: SteeringRung,
): SteeringReplay;
export function replaySteering(
  events: readonly unknown[],
  options?: SteeringReplayOptions,
): SteeringReplay;
export function replaySteering(
  events: readonly unknown[],
  policyOrOptions: SteeringPolicy | SteeringReplayOptions = DEFAULT_STEERING_POLICY,
  start: SteeringRung = "med",
): SteeringReplay {
  const options = isPolicyLike(policyOrOptions)
    ? { policy: policyOrOptions, start }
    : policyOrOptions;
  const policy = requirePolicy(options.policy ?? DEFAULT_STEERING_POLICY);
  let state = initialSteeringState(options.start ?? "med", options.search ?? "open");
  assertState(state, policy);
  const initial = state;
  const steps: SteeringStep[] = [];
  const trace: SteeringTraceEntry[] = [];

  events.forEach((event, index) => {
    const step = stepSteering(state, event, policy);
    steps.push(step);
    const entry = traceEntry(index, step);
    trace.push(entry);
    state = step.state;
  });

  const record: SteeringReplayRecord = {
    schema: STEERING_TRACE_SCHEMA,
    policy,
    initial,
    final: state,
    trace,
  };
  return { initial, final: state, steps, trace, record };
}

/** Return the self-contained record from a replay. The record contains the
 * exact normalized policy and initial state; it is not a source of authority. */
export function toSteeringRecord(replay: SteeringReplay): SteeringReplayRecord {
  return replay.record;
}

/** Serialize only a record that passes the independent verifier. */
export function serializeSteeringRecord(record: SteeringReplayRecord): string {
  const verification = verifySteeringRecord(record);
  if (!verification.valid) throw new Error(`cannot serialize invalid steering record: ${verification.error}`);
  return JSON.stringify(record);
}

/**
 * Independently verify a recorded trace. This validates the complete policy,
 * initial/final state, provenance descriptor, chain, action, signal, from/to,
 * and explanation. It recomputes transitions from the descriptor; it does not
 * trust the recorded action and never turns the record back into a live event.
 */
export function verifySteeringRecord(value: unknown): SteeringVerification {
  const parsed = parseRecord(value);
  if (parsed === null) return { valid: false, error: "record has an invalid shape" };

  let state = parsed.initial;
  for (let i = 0; i < parsed.trace.length; i++) {
    const row = parsed.trace[i];
    if (row === undefined) return { valid: false, error: `trace[${i}] is missing` };
    const verified = verifyTraceEntry(row, i, state, parsed.policy);
    if (verified === null) return { valid: false, error: `trace[${i}] does not match its policy transition` };
    state = verified;
  }

  if (!samePosition(state, parsed.final)) return { valid: false, error: "record.final does not match the verified trace" };
  return { valid: true, record: parsed };
}

function makeStep(
  state: SteeringState,
  details: {
    accepted: boolean;
    changed: boolean;
    decision: SteeringDecision;
    direction: SteeringDirection;
    signal: SteeringSignal;
    eventType: SteeringEventType | null;
    provenance: SteeringProvenance;
    descriptor: SteeringSignalDescriptor | null;
    policy: SteeringPolicy;
    from: SteeringPosition;
    to: SteeringPosition;
  },
): SteeringStep {
  const explanation = explain(details.decision, details.signal, details.provenance, details.policy, details.from, details.to);
  return {
    state: details.changed ? { rung: details.to.rung, search: details.to.search } : state,
    accepted: details.accepted,
    changed: details.changed,
    decision: details.decision,
    direction: details.direction,
    signal: details.signal,
    eventType: details.eventType,
    provenance: details.provenance,
    descriptor: details.descriptor,
    policyVersion: details.policy.version,
    policy: details.policy,
    from: details.from,
    to: details.to,
    explanation,
  };
}

function identifyEvent(value: unknown): SteeringEvent | null {
  if (!isPlainRecord(value)) return null;
  if (value[runtimeEventBrand] === true && isRuntimeEventType(value.type)) {
    return value as unknown as RuntimeBehavioralEvent;
  }
  if (value[operatorEventBrand] === true && isOperatorEventType(value.type)) {
    return value as unknown as OperatorEvent;
  }
  return null;
}

function descriptorFor(event: SteeringEvent): SteeringSignalDescriptor {
  const provenance = isRuntimeEvent(event) ? "host-runtime-adapter" : "operator-control-plane";
  return {
    type: event.type,
    provenance,
    ...(event.eventId === undefined ? {} : { eventId: event.eventId }),
  };
}

function applyDescriptor(
  state: SteeringState,
  descriptor: SteeringSignalDescriptor,
  policy: SteeringPolicy,
): { changed: boolean; decision: SteeringDecision; direction: SteeringDirection; to: SteeringPosition } {
  let to = positionOf(state);
  let decision: SteeringDecision = "hold";
  let direction: SteeringDirection = "hold";

  // Stopping is terminal for this controller. A later behavioral event is
  // still recorded as a hold; resumption requires a new starting state rather
  // than hidden background activity.
  if (state.search === "stopped") {
    return { changed: false, decision, direction, to };
  }

  switch (descriptor.type) {
    case "behavioral-failure": {
      const rung = shiftRung(state.rung, 1, policy);
      to = { rung, search: state.search };
      if (rung !== state.rung) {
        decision = "explore";
        direction = "explore";
      }
      break;
    }
    case "behavioral-recovery": {
      if (state.search === "open") {
        const rung = shiftRung(state.rung, -1, policy);
        to = { rung, search: state.search };
        if (rung !== state.rung) {
          decision = "recover";
          direction = "converge";
        }
      }
      break;
    }
    case "reopen-search":
      if (state.search === "closed" || state.search === "checkpointed") {
        to = { rung: shiftRung(state.rung, 1, policy), search: "open" };
        decision = "reopen";
        direction = "explore";
      }
      break;
    case "checkpoint":
      if (state.search === "open") {
        to = { rung: state.rung, search: "checkpointed" };
        decision = "checkpoint";
      }
      break;
    case "close-search":
      if (state.search === "open" || state.search === "checkpointed") {
        to = { rung: state.rung, search: "closed" };
        decision = "close";
      }
      break;
    case "stop":
      to = { rung: state.rung, search: "stopped" };
      decision = "stop";
      break;
  }

  return { changed: !samePosition(positionOf(state), to), decision, direction, to };
}

function verifyTraceEntry(
  row: SteeringTraceEntry,
  index: number,
  state: SteeringState,
  policy: SteeringPolicy,
): SteeringPosition | null {
  if (row.index !== index || !samePolicy(row.policy, policy) || row.policyVersion !== policy.version) return null;
  if (!samePosition(row.from, positionOf(state))) return null;

  if (row.descriptor === null) {
    const invalid = row.signal === "no-evidence" || row.signal === "invalid-event";
    const expectedProvenance = row.signal === "no-evidence" ? "none" : "untrusted-input";
    if (!invalid || row.accepted || row.changed || row.decision !== "hold" || row.direction !== "hold" || row.eventType !== null) return null;
    if (row.provenance !== expectedProvenance || !samePosition(row.to, row.from)) return null;
    const explanation = explain("hold", row.signal, expectedProvenance, policy, row.from, row.to);
    return row.explanation === explanation ? state : null;
  }

  if (!descriptorMatchesEventRules(row.descriptor)) return null;
  const applied = applyDescriptor(state, row.descriptor, policy);
  const expectedSignal = signalFor(row.descriptor.type);
  const expectedExplanation = explain(applied.decision, expectedSignal, row.descriptor.provenance, policy, row.from, applied.to);
  if (
    !row.accepted ||
    row.signal !== expectedSignal ||
    row.eventType !== row.descriptor.type ||
    row.provenance !== row.descriptor.provenance ||
    !samePosition(row.to, applied.to) ||
    row.changed !== applied.changed ||
    row.decision !== applied.decision ||
    row.direction !== applied.direction ||
    row.explanation !== expectedExplanation
  ) return null;
  return applied.to;
}

function parseRecord(value: unknown): SteeringReplayRecord | null {
  if (!isPlainRecord(value) || !hasExactlyKeys(value, ["schema", "policy", "initial", "final", "trace"])) return null;
  if (value.schema !== STEERING_TRACE_SCHEMA || !Array.isArray(value.trace)) return null;
  const policy = parseSteeringPolicy(value.policy);
  const initial = parseSteeringState(value.initial);
  const final = parseSteeringState(value.final);
  if (policy === null || initial === null || final === null || !isStateWithinPolicy(initial, policy) || !isStateWithinPolicy(final, policy)) return null;

  const trace: SteeringTraceEntry[] = [];
  for (const row of value.trace) {
    const parsed = parseTraceEntry(row);
    if (parsed === null) return null;
    trace.push(parsed);
  }
  return { schema: STEERING_TRACE_SCHEMA, policy, initial, final, trace };
}

function parseTraceEntry(value: unknown): SteeringTraceEntry | null {
  const keys = [
    "index",
    "accepted",
    "changed",
    "decision",
    "direction",
    "signal",
    "eventType",
    "provenance",
    "descriptor",
    "policyVersion",
    "policy",
    "from",
    "to",
    "explanation",
  ];
  if (!isPlainRecord(value) || !hasExactlyKeys(value, keys)) return null;
  if (
    !Number.isSafeInteger(value.index) ||
    typeof value.accepted !== "boolean" ||
    typeof value.changed !== "boolean" ||
    typeof value.decision !== "string" ||
    !DECISION_SET.has(value.decision) ||
    typeof value.direction !== "string" ||
    !DIRECTION_SET.has(value.direction) ||
    typeof value.signal !== "string" ||
    !SIGNAL_SET.has(value.signal) ||
    (value.eventType !== null && (typeof value.eventType !== "string" || !EVENT_TYPE_SET.has(value.eventType))) ||
    typeof value.provenance !== "string" ||
    !PROVENANCE_SET.has(value.provenance) ||
    typeof value.policyVersion !== "string" ||
    typeof value.explanation !== "string"
  ) return null;
  const policy = parseSteeringPolicy(value.policy);
  const from = parsePosition(value.from);
  const to = parsePosition(value.to);
  const descriptor = value.descriptor === null ? null : parseDescriptor(value.descriptor);
  if (policy === null || from === null || to === null || value.descriptor !== null && descriptor === null) return null;
  return {
    index: value.index as number,
    accepted: value.accepted as boolean,
    changed: value.changed as boolean,
    decision: value.decision as SteeringDecision,
    direction: value.direction as SteeringDirection,
    signal: value.signal as SteeringSignal,
    eventType: value.eventType as SteeringEventType | null,
    provenance: value.provenance as SteeringProvenance,
    descriptor,
    policyVersion: value.policyVersion as string,
    policy,
    from,
    to,
    explanation: value.explanation,
  };
}

function parseDescriptor(value: unknown): SteeringSignalDescriptor | null {
  if (!isPlainRecord(value) || !hasAllowedKeys(value, ["type", "provenance", "eventId"]) || !("type" in value) || !("provenance" in value)) return null;
  if (
    typeof value.type !== "string" ||
    !EVENT_TYPE_SET.has(value.type) ||
    value.provenance !== "host-runtime-adapter" && value.provenance !== "operator-control-plane" ||
    value.eventId !== undefined && (typeof value.eventId !== "string" || !EVENT_ID_PATTERN.test(value.eventId))
  ) return null;
  const descriptor = {
    type: value.type as SteeringEventType,
    provenance: value.provenance as "host-runtime-adapter" | "operator-control-plane",
    ...(value.eventId === undefined ? {} : { eventId: value.eventId }),
  };
  return descriptorMatchesEventRules(descriptor) ? descriptor : null;
}

function descriptorMatchesEventRules(descriptor: SteeringSignalDescriptor): boolean {
  return descriptor.provenance === "host-runtime-adapter"
    ? RUNTIME_EVENT_TYPE_SET.has(descriptor.type)
    : OPERATOR_EVENT_TYPE_SET.has(descriptor.type);
}

function traceEntry(index: number, step: SteeringStep): SteeringTraceEntry {
  return {
    index,
    accepted: step.accepted,
    changed: step.changed,
    decision: step.decision,
    direction: step.direction,
    signal: step.signal,
    eventType: step.eventType,
    provenance: step.provenance,
    descriptor: step.descriptor,
    policyVersion: step.policyVersion,
    policy: step.policy,
    from: step.from,
    to: step.to,
    explanation: step.explanation,
  };
}

function signalFor(type: SteeringEventType): SteeringSignal {
  switch (type) {
    case "behavioral-failure":
      return "behavioral-failure";
    case "behavioral-recovery":
      return "behavioral-recovery";
    case "reopen-search":
      return "search-reopen";
    case "checkpoint":
      return "checkpoint-request";
    case "close-search":
      return "search-close";
    case "stop":
      return "stop-request";
  }
}

function explain(
  decision: SteeringDecision,
  signal: SteeringSignal,
  provenance: SteeringProvenance,
  policy: SteeringPolicy,
  from: SteeringPosition,
  to: SteeringPosition,
): string {
  return [
    `ultra: ${decision}`,
    `signal=${signal}`,
    `provenance=${provenance}`,
    `policy=${policy.version}`,
    `from=${formatPosition(from)}`,
    `to=${formatPosition(to)}`,
  ].join(" — ");
}

function shiftRung(rung: SteeringRung, direction: -1 | 1, policy: SteeringPolicy): SteeringRung {
  const next = Math.min(
    Math.max(rungIndex(rung) + direction, rungIndex(policy.floor)),
    rungIndex(policy.ceiling),
  );
  return STEERING_RUNGS[next] as SteeringRung;
}

function formatPosition(position: SteeringPosition): string {
  return `${position.search}/${position.rung}`;
}

function positionOf(state: SteeringState): SteeringPosition {
  return { rung: state.rung, search: state.search };
}

function samePosition(left: SteeringPosition, right: SteeringPosition): boolean {
  return left.rung === right.rung && left.search === right.search;
}

function parsePosition(value: unknown): SteeringPosition | null {
  if (!isPlainRecord(value) || !hasExactlyKeys(value, ["rung", "search"])) return null;
  return isRung(value.rung) && isSearchState(value.search)
    ? { rung: value.rung, search: value.search }
    : null;
}

function samePolicy(left: SteeringPolicy, right: SteeringPolicy): boolean {
  return left.version === right.version && left.floor === right.floor && left.ceiling === right.ceiling;
}

function requirePolicy(value: unknown): SteeringPolicy {
  const policy = parseSteeringPolicy(value);
  if (policy === null) throw new Error("invalid steering policy: expected version, floor, and ceiling");
  return policy;
}

function assertState(state: unknown, policy: SteeringPolicy): asserts state is SteeringState {
  if (parseSteeringState(state) === null) throw new Error("invalid steering state: expected only rung and search");
  if (!isStateWithinPolicy(state as SteeringState, policy)) {
    throw new Error("invalid steering state: rung is outside the policy bounds");
  }
}

function isStateWithinPolicy(state: SteeringState, policy: SteeringPolicy): boolean {
  return rungIndex(state.rung) >= rungIndex(policy.floor) && rungIndex(state.rung) <= rungIndex(policy.ceiling);
}

function rungIndex(rung: SteeringRung): number {
  return STEERING_RUNGS.indexOf(rung);
}

function assertEventType(value: unknown, allowed: Set<string>, label: string): asserts value is SteeringEventType {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`invalid ${label} type: ${String(value)}`);
}

function assertEventId(value: unknown): asserts value is string | undefined {
  if (value !== undefined && (typeof value !== "string" || !EVENT_ID_PATTERN.test(value))) {
    throw new Error("invalid steering event id");
  }
}

function isRuntimeCapability(value: unknown): value is RuntimeAdapterCapability {
  return isPlainRecord(value) && value[runtimeCapabilityBrand] === true;
}

function isRuntimeEvent(value: SteeringEvent): value is RuntimeBehavioralEvent {
  return (value as Record<string | symbol, unknown>)[runtimeEventBrand] === true;
}

function isRung(value: unknown): value is SteeringRung {
  return typeof value === "string" && RUNG_SET.has(value);
}

function isSearchState(value: unknown): value is SearchState {
  return typeof value === "string" && SEARCH_STATE_SET.has(value);
}

function isRuntimeEventType(value: unknown): value is RuntimeEventType {
  return typeof value === "string" && RUNTIME_EVENT_TYPE_SET.has(value);
}

function isOperatorEventType(value: unknown): value is OperatorEventType {
  return typeof value === "string" && OPERATOR_EVENT_TYPE_SET.has(value);
}

function isPlainRecord(value: unknown): value is Record<string | symbol, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownKeys(value: Record<string | symbol, unknown>): PropertyKey[] {
  return Reflect.ownKeys(value);
}

function hasExactlyKeys(value: Record<string | symbol, unknown>, required: readonly string[]): boolean {
  const keys = ownKeys(value);
  return keys.length === required.length && keys.every((key) => typeof key === "string" && required.includes(key));
}

function hasAllowedKeys(value: Record<string | symbol, unknown>, allowed: readonly string[]): boolean {
  return ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key));
}

function isPolicyLike(value: SteeringPolicy | SteeringReplayOptions): value is SteeringPolicy {
  return isPlainRecord(value) && "version" in value && "floor" in value && "ceiling" in value;
}
