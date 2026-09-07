// Deterministic Ultra steering over explicit behavioral events (SPEC §7, PLAN Lane S-now).
//
// This is intentionally not a retrieval controller. A ranking, refusal, or
// score is not an event here. The only inputs that can change the rung are
// validated events emitted by a trusted runtime adapter or an explicit
// operator control. Summoned skill content is data and is never parsed by this
// module.
//
// The event vocabulary is local to this consumer until an upstream behavioral
// event contract exists. It must not be mistaken for an Arbor schema. The
// implementation shape is selectively informed by the deterministic controller
// in gaia-skill-heaven #114, commit 4d0e2f9; its retrieval-score inputs,
// thresholds, and calibration were deliberately not carried forward.

/** The operational portion of the one ladder. `zero` is the floor and `ultra`
 * is the crown/controller, not a second position to hold concurrently. */
export const STEERING_RUNGS = ["low", "med", "high", "xhigh", "max"] as const;
export type SteeringRung = (typeof STEERING_RUNGS)[number];

export const STEERING_POLICY_VERSION = "gaia-steering-policy/v1" as const;

/** Search lifecycle is separate from the single rung, so reopen/close are
 * visible decisions rather than implicit side effects of a posture change. */
export const SEARCH_STATES = ["open", "checkpointed", "closed", "stopped"] as const;
export type SearchState = (typeof SEARCH_STATES)[number];

export const EVENT_TYPES = [
  "behavioral-failure",
  "behavioral-recovery",
  "reopen-search",
  "checkpoint",
  "close-search",
  "stop",
  // Short spellings are accepted as wire aliases for callers. They normalize
  // to the explicit signals above and have identical semantics.
  "failure",
  "recovery",
  "reopen",
  "close",
] as const;
export type SteeringEventType = (typeof EVENT_TYPES)[number];
export type EventAuthority = "runtime" | "operator";

/**
 * Events are deliberately small and closed. `authority` is caller metadata,
 * not prose supplied by a skill. Runtime adapters own behavioral events;
 * operators may request lifecycle controls. A caller must validate and create
 * this object itself — this module never turns a skill body, card, or model
 * output into an event.
 */
export type BehavioralEvent =
  | { type: "behavioral-failure"; authority: "runtime"; eventId?: string }
  | { type: "behavioral-recovery"; authority: "runtime"; eventId?: string }
  | { type: "reopen-search"; authority: EventAuthority; eventId?: string }
  | { type: "checkpoint"; authority: EventAuthority; eventId?: string }
  | { type: "close-search"; authority: EventAuthority; eventId?: string }
  | { type: "stop"; authority: EventAuthority; eventId?: string }
  | { type: "failure"; authority: "runtime"; eventId?: string }
  | { type: "recovery"; authority: "runtime"; eventId?: string }
  | { type: "reopen"; authority: EventAuthority; eventId?: string }
  | { type: "close"; authority: EventAuthority; eventId?: string };

/** Alias that makes the public controller vocabulary discoverable. */
export type SteeringEvent = BehavioralEvent;

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
  | "invalid-policy"
  | "behavioral-failure"
  | "behavioral-recovery"
  | "search-reopen"
  | "checkpoint-request"
  | "search-close"
  | "stop-request";

export type SteeringStep = Readonly<{
  state: SteeringState;
  accepted: boolean;
  changed: boolean;
  decision: SteeringDecision;
  direction: SteeringDirection;
  /** Canonical signal used by the policy, never caller prose. */
  signal: SteeringSignal;
  /** The wire event type, when a valid event was received. */
  eventType: SteeringEventType | null;
  policyVersion: string;
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
  policyVersion: string;
  from: SteeringPosition;
  to: SteeringPosition;
  explanation: string;
}>;

export type SteeringReplay = Readonly<{
  initial: SteeringState;
  final: SteeringState;
  steps: readonly SteeringStep[];
  trace: readonly SteeringTraceEntry[];
}>;

export type SteeringReplayOptions = Readonly<{
  policy?: SteeringPolicy;
  start?: SteeringRung;
  search?: SearchState;
}>;

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);
const RUNG_SET = new Set<string>(STEERING_RUNGS);
const SEARCH_STATE_SET = new Set<string>(SEARCH_STATES);
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Build the initial state without I/O, clocks, randomness, or shared state. */
export function initialSteeringState(
  start: SteeringRung = "med",
  search: SearchState = "open",
): SteeringState {
  return {
    rung: isRung(start) ? start : "med",
    search: isSearchState(search) ? search : "open",
  };
}

/** Parse the closed event contract at an untrusted JSON boundary. */
export function parseSteeringEvent(value: unknown): SteeringEvent | null {
  if (!isPlainRecord(value)) return null;

  const keys = Object.keys(value);
  if (keys.some((key) => key !== "type" && key !== "authority" && key !== "eventId")) return null;

  const type = value.type;
  const authority = value.authority;
  if (typeof type !== "string" || !EVENT_TYPE_SET.has(type)) return null;
  if (authority !== "runtime" && authority !== "operator") return null;
  if (value.eventId !== undefined && (typeof value.eventId !== "string" || !EVENT_ID_PATTERN.test(value.eventId))) {
    return null;
  }

  const runtimeOnly = type === "behavioral-failure" || type === "behavioral-recovery" || type === "failure" || type === "recovery";
  if (runtimeOnly && authority !== "runtime") return null;

  return {
    type: type as SteeringEventType,
    authority: authority as EventAuthority,
    ...(value.eventId === undefined ? {} : { eventId: value.eventId }),
  } as SteeringEvent;
}

/** Parse a state supplied by a CLI or another process. Invalid state is not
 * silently repaired: callers must choose an explicit starting state. */
export function parseSteeringState(value: unknown): SteeringState | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "rung" && key !== "search")) return null;
  return isRung(value.rung) && isSearchState(value.search)
    ? { rung: value.rung, search: value.search }
    : null;
}

/** Parse the policy at a process boundary and reject unknown policy knobs. */
export function parseSteeringPolicy(value: unknown): SteeringPolicy | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "version" && key !== "floor" && key !== "ceiling")) return null;
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
 * Apply exactly one explicit event. Absent or malformed events hold. No
 * retrieval field is accepted, and no event is synthesized from one.
 */
export function stepSteering(
  state: SteeringState,
  input: unknown,
  policy: SteeringPolicy = DEFAULT_STEERING_POLICY,
): SteeringStep {
  const parsedPolicy = parseSteeringPolicy(policy);
  if (!parsedPolicy) {
    return makeStep(state, {
      accepted: false,
      changed: false,
      decision: "hold",
      direction: "hold",
      signal: "invalid-policy",
      eventType: null,
      policy: DEFAULT_STEERING_POLICY,
      from: positionOf(state),
      to: positionOf(state),
    });
  }

  const event = parseSteeringEvent(input);
  if (!event) {
    const signal: SteeringSignal = input === undefined || input === null ? "no-evidence" : "invalid-event";
    return makeStep(state, {
      accepted: false,
      changed: false,
      decision: "hold",
      direction: "hold",
      signal,
      eventType: null,
      policy: parsedPolicy,
      from: positionOf(state),
      to: positionOf(state),
    });
  }

  const from = positionOf(state);
  const signal = signalFor(event.type);
  let to = from;
  let decision: SteeringDecision = "hold";
  let direction: SteeringDirection = "hold";

  if (state.search !== "stopped") {
    switch (event.type) {
      case "behavioral-failure":
      case "failure": {
        const rung = shiftRung(state.rung, 1, parsedPolicy);
        to = { rung, search: state.search };
        if (rung !== state.rung) {
          decision = "explore";
          direction = "explore";
        }
        break;
      }
      case "behavioral-recovery":
      case "recovery": {
        // A closed search stays closed. Reopening is an explicit separate
        // event, so recovery cannot create background work.
        if (state.search === "open") {
          const rung = shiftRung(state.rung, -1, parsedPolicy);
          to = { rung, search: state.search };
          if (rung !== state.rung) {
            decision = "recover";
            direction = "converge";
          }
        }
        break;
      }
      case "reopen-search":
      case "reopen": {
        if (state.search === "closed" || state.search === "checkpointed") {
          to = { rung: shiftRung(state.rung, 1, parsedPolicy), search: "open" };
          decision = "reopen";
          direction = "explore";
        }
        break;
      }
      case "checkpoint":
        if (state.search === "open") {
          to = { rung: state.rung, search: "checkpointed" };
          decision = "checkpoint";
        }
        break;
      case "close-search":
      case "close":
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
  }

  const changed = !samePosition(from, to);
  return makeStep(state, {
    accepted: true,
    changed,
    decision,
    direction,
    signal,
    eventType: event.type,
    policy: parsedPolicy,
    from,
    to,
  });
}

/** Replay a recorded event trace with no clock, I/O, or hidden state. */
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
  const policy = options.policy ?? DEFAULT_STEERING_POLICY;
  let state = initialSteeringState(options.start ?? "med", options.search ?? "open");
  const initial = state;
  const steps: SteeringStep[] = [];
  const trace: SteeringTraceEntry[] = [];

  events.forEach((event, index) => {
    const step = stepSteering(state, event, policy);
    steps.push(step);
    trace.push({
      index,
      accepted: step.accepted,
      changed: step.changed,
      decision: step.decision,
      direction: step.direction,
      signal: step.signal,
      eventType: step.eventType,
      policyVersion: step.policyVersion,
      from: step.from,
      to: step.to,
      explanation: step.explanation,
    });
    state = step.state;
  });

  return { initial, final: state, steps, trace };
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
    policy: SteeringPolicy;
    from: SteeringPosition;
    to: SteeringPosition;
  },
): SteeringStep {
  const explanation = [
    `ultra: ${details.decision}`,
    `signal=${details.signal}`,
    `policy=${details.policy.version}`,
    `from=${formatPosition(details.from)}`,
    `to=${formatPosition(details.to)}`,
  ].join(" — ");
  return {
    state: details.changed ? { rung: details.to.rung, search: details.to.search } : state,
    accepted: details.accepted,
    changed: details.changed,
    decision: details.decision,
    direction: details.direction,
    signal: details.signal,
    eventType: details.eventType,
    policyVersion: details.policy.version,
    policy: details.policy,
    from: details.from,
    to: details.to,
    explanation,
  };
}

function signalFor(type: SteeringEventType): SteeringSignal {
  switch (type) {
    case "behavioral-failure":
    case "failure":
      return "behavioral-failure";
    case "behavioral-recovery":
    case "recovery":
      return "behavioral-recovery";
    case "reopen-search":
    case "reopen":
      return "search-reopen";
    case "checkpoint":
      return "checkpoint-request";
    case "close-search":
    case "close":
      return "search-close";
    case "stop":
      return "stop-request";
  }
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

function rungIndex(rung: SteeringRung): number {
  return STEERING_RUNGS.indexOf(rung);
}

function isRung(value: unknown): value is SteeringRung {
  return typeof value === "string" && RUNG_SET.has(value);
}

function isSearchState(value: unknown): value is SearchState {
  return typeof value === "string" && SEARCH_STATE_SET.has(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPolicyLike(value: SteeringPolicy | SteeringReplayOptions): value is SteeringPolicy {
  return "version" in value && "floor" in value && "ceiling" in value;
}
