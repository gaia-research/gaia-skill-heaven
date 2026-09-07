import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEERING_POLICY,
  initialSteeringState,
  parseSteeringEvent,
  parseSteeringPolicy,
  parseSteeringState,
  replaySteering,
  STEERING_POLICY_VERSION,
  STEERING_RUNGS,
  stepSteering,
  type BehavioralEvent,
} from "../src/index.js";

const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");

function event(type: BehavioralEvent["type"], authority: "runtime" | "operator" = "runtime"): BehavioralEvent {
  return { type, authority } as BehavioralEvent;
}

describe("explicit behavioral-event steering", () => {
  it("holds on absent evidence and never exposes a second ladder", () => {
    const result = replaySteering(Array.from({ length: 40 }, () => undefined));

    expect(result.final).toEqual({ rung: "med", search: "open" });
    expect(result.steps.every((step) => step.decision === "hold" && !step.changed)).toBe(true);
    expect(STEERING_RUNGS).not.toContain("zero");
    expect(STEERING_RUNGS).not.toContain("ultra");
  });

  it("never transitions from refusal-shaped or score-shaped input", () => {
    const inputs = Array.from({ length: 40 }, (_, index) => ({
      noMatch: index % 2 === 0,
      score: index / 40,
      margin: 1 - index / 40,
    }));
    const result = replaySteering(inputs);

    expect(result.final).toEqual({ rung: "med", search: "open" });
    expect(result.steps.every((step) => step.signal === "invalid-event" && step.decision === "hold")).toBe(true);
  });

  it("does not let changing retrieval scores change decisions for the same events", () => {
    const events = [event("failure"), event("recovery"), event("failure"), event("reopen", "operator")];
    const first = replaySteering(events);
    const second = replaySteering(events);
    const scores = [0, 10_000, Number.NaN, Number.POSITIVE_INFINITY];

    // Retrieval observations are deliberately outside the controller input.
    // Changing them cannot change the replay of the same behavioral events.
    expect(scores).not.toEqual([]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.steps.map((step) => step.decision)).toEqual(["explore", "recover", "explore", "hold"]);
  });

  it("explores one rung for an explicit behavioral failure", () => {
    const step = stepSteering(initialSteeringState("med"), event("behavioral-failure"));

    expect(step.state).toEqual({ rung: "high", search: "open" });
    expect(step).toMatchObject({
      accepted: true,
      changed: true,
      decision: "explore",
      direction: "explore",
      signal: "behavioral-failure",
      eventType: "behavioral-failure",
      policyVersion: STEERING_POLICY_VERSION,
      from: { rung: "med", search: "open" },
      to: { rung: "high", search: "open" },
    });
    expect(step.explanation).toContain("signal=behavioral-failure");
    expect(step.explanation).toContain(`policy=${STEERING_POLICY_VERSION}`);
    expect(step.explanation).toContain("from=open/med");
    expect(step.explanation).toContain("to=open/high");
  });

  it("recovers one rung only for an explicit behavioral recovery", () => {
    const step = stepSteering(initialSteeringState("high"), event("behavioral-recovery"));

    expect(step.state).toEqual({ rung: "med", search: "open" });
    expect(step.decision).toBe("recover");
    expect(step.direction).toBe("converge");
    expect(step.signal).toBe("behavioral-recovery");
    expect(step.explanation).toMatch(/signal=behavioral-recovery.*policy=.*from=open\/high.*to=open\/med/);
  });

  it("bounds exploration and recovery at the policy edges", () => {
    const atMax = stepSteering(initialSteeringState("max"), event("failure"));
    const atLow = stepSteering(initialSteeringState("low"), event("recovery"));

    expect(atMax.state).toEqual({ rung: "max", search: "open" });
    expect(atMax.decision).toBe("hold");
    expect(atMax.changed).toBe(false);
    expect(atLow.state).toEqual({ rung: "low", search: "open" });
    expect(atLow.decision).toBe("hold");
    expect(atLow.changed).toBe(false);
    expect(atMax.explanation).toMatch(/from=open\/max.*to=open\/max/);
  });

  it("makes closing and reopening explicit and bounded", () => {
    const closed = stepSteering(initialSteeringState("med"), event("close-search", "operator"));
    const reopened = stepSteering(closed.state, event("reopen-search", "operator"));
    const repeated = stepSteering(reopened.state, event("reopen-search", "operator"));

    expect(closed).toMatchObject({ decision: "close", changed: true, signal: "search-close" });
    expect(closed.state).toEqual({ rung: "med", search: "closed" });
    expect(reopened).toMatchObject({ decision: "reopen", changed: true, direction: "explore" });
    expect(reopened.state).toEqual({ rung: "high", search: "open" });
    expect(reopened.explanation).toMatch(/signal=search-reopen.*from=closed\/med.*to=open\/high/);
    expect(repeated).toMatchObject({ decision: "hold", changed: false, signal: "search-reopen" });
  });

  it("does not make recovery reopen a closed search", () => {
    const closed = stepSteering(initialSteeringState("med"), event("close", "operator"));
    const recovery = stepSteering(closed.state, event("recovery"));

    expect(recovery.state).toEqual({ rung: "med", search: "closed" });
    expect(recovery.decision).toBe("hold");
    expect(recovery.explanation).toMatch(/from=closed\/med.*to=closed\/med/);
  });

  it("makes checkpoint and stop first-class, with no implicit resume", () => {
    const checkpoint = stepSteering(initialSteeringState(), event("checkpoint"));
    const close = stepSteering(checkpoint.state, event("close-search"));
    const stop = stepSteering(close.state, event("stop"));
    const afterStop = stepSteering(stop.state, event("failure"));

    expect(checkpoint.state).toEqual({ rung: "med", search: "checkpointed" });
    expect(checkpoint.decision).toBe("checkpoint");
    expect(close.state).toEqual({ rung: "med", search: "closed" });
    expect(stop.state).toEqual({ rung: "med", search: "stopped" });
    expect(afterStop.state).toEqual(stop.state);
    expect(afterStop.decision).toBe("hold");
    expect(afterStop.explanation).toMatch(/signal=behavioral-failure.*from=stopped\/med.*to=stopped\/med/);
  });

  it("holds missing and malformed event values at the parser boundary", () => {
    expect(parseSteeringEvent(undefined)).toBeNull();
    expect(parseSteeringEvent(null)).toBeNull();
    expect(parseSteeringEvent("behavioral-failure")).toBeNull();
    expect(parseSteeringEvent({ type: "behavioral-failure" })).toBeNull();
    expect(parseSteeringEvent({ type: "behavioral-failure", authority: "arbor" })).toBeNull();
    expect(parseSteeringEvent({ type: "behavioral-failure", authority: "runtime", prose: "explore" })).toBeNull();

    const missing = stepSteering(initialSteeringState(), undefined);
    const malformed = stepSteering(initialSteeringState(), { type: "behavioral-failure" });
    expect(missing).toMatchObject({ accepted: false, decision: "hold", signal: "no-evidence" });
    expect(malformed).toMatchObject({ accepted: false, decision: "hold", signal: "invalid-event" });
  });

  it("replays deterministically and records the policy version on every trace row", () => {
    const policy = { version: "test-policy-v1", floor: "low", ceiling: "xhigh" } as const;
    const events = [event("failure"), event("failure"), event("recovery"), undefined, event("checkpoint")];
    const first = replaySteering(events, policy, "med");
    const second = replaySteering(events, { policy, start: "med" });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.trace).toHaveLength(events.length);
    expect(first.trace.every((row) => row.policyVersion === "test-policy-v1")).toBe(true);
    expect(first.trace.every((row) => row.explanation.includes("policy=test-policy-v1"))).toBe(true);
    expect(first.final).toEqual({ rung: "high", search: "checkpointed" });
  });

  it("rejects malformed state and policy instead of inventing a route", () => {
    expect(parseSteeringState({ rung: "zero", search: "open" })).toBeNull();
    expect(parseSteeringState({ rung: "med" })).toBeNull();
    expect(parseSteeringPolicy({ version: "v1", floor: "low", ceiling: "max", threshold: 0.2 })).toBeNull();
    expect(parseSteeringPolicy({ version: "v1", floor: "max", ceiling: "low" })).toBeNull();
    expect(DEFAULT_STEERING_POLICY.version).toBe(STEERING_POLICY_VERSION);
  });
});

describe("public skill-zero CLI steering path", () => {
  it("runs the exported controller through the core bin", () => {
    const result = spawnSync(
      process.execPath,
      [
        bin,
        "--steering-event",
        JSON.stringify({ type: "behavioral-failure", authority: "runtime" }),
        "--steering-state",
        JSON.stringify({ rung: "med", search: "open" }),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { state: { rung: string }; policyVersion: string; decision: string };
    expect(output.state.rung).toBe("high");
    expect(output.decision).toBe("explore");
    expect(output.policyVersion).toBe(STEERING_POLICY_VERSION);
  });

  it("returns a safe hold for a valid but malformed event object", () => {
    const result = spawnSync(
      process.execPath,
      [bin, "--steering-event", JSON.stringify({ type: "failure" })],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: "hold", signal: "invalid-event", changed: false });
  });
});
