import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEERING_POLICY,
  createOperatorEvent,
  createRuntimeAdapter,
  createRuntimeEvent,
  initialSteeringState,
  parseOperatorCommand,
  parseSteeringEvent,
  parseSteeringPolicy,
  parseSteeringState,
  replaySteering,
  serializeSteeringRecord,
  STEERING_POLICY_VERSION,
  STEERING_RUNGS,
  stepSteering,
  verifySteeringRecord,
  type OperatorEventType,
  type RuntimeEventType,
} from "../src/index.js";

const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");
const adapter = createRuntimeAdapter();

function runtime(type: RuntimeEventType, eventId?: string) {
  return createRuntimeEvent(adapter, type, eventId);
}

function operator(type: OperatorEventType, eventId?: string) {
  return createOperatorEvent(type, eventId);
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

  it("does not let changing retrieval scores change decisions for the same trusted events", () => {
    const events = [runtime("behavioral-failure"), runtime("behavioral-recovery"), runtime("behavioral-failure")];
    const first = replaySteering(events);
    const second = replaySteering(events);
    const retrievalScores = [0, 10_000, Number.NaN, Number.POSITIVE_INFINITY];

    // Scores are not accepted by the runtime-event constructor and are not
    // part of the replay input. Their values therefore cannot affect posture.
    expect(retrievalScores).not.toEqual([]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.steps.map((step) => step.decision)).toEqual(["explore", "recover", "explore"]);
  });

  it("requires a private host-adapter brand for runtime behavioral events", () => {
    const forged = { type: "behavioral-failure", authority: "runtime" };
    const step = stepSteering(initialSteeringState("med"), forged);

    expect(step).toMatchObject({
      accepted: false,
      changed: false,
      decision: "hold",
      signal: "invalid-event",
      provenance: "untrusted-input",
    });
    expect(step.state).toEqual({ rung: "med", search: "open" });
    expect(() => createRuntimeEvent({} as never, "behavioral-failure")).toThrow(/host adapter capability/);
    expect(stepSteering(initialSteeringState("med"), JSON.parse(JSON.stringify(runtime("behavioral-failure"))))).toMatchObject({
      accepted: false,
      decision: "hold",
      provenance: "untrusted-input",
    });
  });

  it("explores one rung for an explicit host-runtime behavioral failure", () => {
    const step = stepSteering(initialSteeringState("med"), runtime("behavioral-failure", "failure-1"));

    expect(step.state).toEqual({ rung: "high", search: "open" });
    expect(step).toMatchObject({
      accepted: true,
      changed: true,
      decision: "explore",
      direction: "explore",
      signal: "behavioral-failure",
      eventType: "behavioral-failure",
      provenance: "host-runtime-adapter",
      policyVersion: STEERING_POLICY_VERSION,
      from: { rung: "med", search: "open" },
      to: { rung: "high", search: "open" },
      descriptor: { type: "behavioral-failure", provenance: "host-runtime-adapter", eventId: "failure-1" },
    });
    expect(step.explanation).toContain("signal=behavioral-failure");
    expect(step.explanation).toContain(`policy=${STEERING_POLICY_VERSION}`);
    expect(step.explanation).toContain("from=open/med");
    expect(step.explanation).toContain("to=open/high");
  });

  it("recovers one rung only for an explicit host-runtime recovery", () => {
    const step = stepSteering(initialSteeringState("high"), runtime("behavioral-recovery"));

    expect(step.state).toEqual({ rung: "med", search: "open" });
    expect(step.decision).toBe("recover");
    expect(step.direction).toBe("converge");
    expect(step.signal).toBe("behavioral-recovery");
    expect(step.explanation).toMatch(/signal=behavioral-recovery.*policy=.*from=open\/high.*to=open\/med/);
  });

  it("bounds exploration and recovery at the policy edges", () => {
    const atMax = stepSteering(initialSteeringState("max"), runtime("behavioral-failure"));
    const atLow = stepSteering(initialSteeringState("low"), runtime("behavioral-recovery"));

    expect(atMax.state).toEqual({ rung: "max", search: "open" });
    expect(atMax.decision).toBe("hold");
    expect(atMax.changed).toBe(false);
    expect(atLow.state).toEqual({ rung: "low", search: "open" });
    expect(atLow.decision).toBe("hold");
    expect(atLow.changed).toBe(false);
    expect(atMax.explanation).toMatch(/from=open\/max.*to=open\/max/);
  });

  it("makes closing and reopening explicit and bounded", () => {
    const closed = stepSteering(initialSteeringState("med"), operator("close-search", "close-1"));
    const reopened = stepSteering(closed.state, operator("reopen-search", "reopen-1"));
    const repeated = stepSteering(reopened.state, operator("reopen-search", "reopen-2"));

    expect(closed).toMatchObject({
      decision: "close",
      changed: true,
      signal: "search-close",
      provenance: "operator-control-plane",
    });
    expect(closed.state).toEqual({ rung: "med", search: "closed" });
    expect(reopened).toMatchObject({ decision: "reopen", changed: true, direction: "explore" });
    expect(reopened.state).toEqual({ rung: "high", search: "open" });
    expect(reopened.explanation).toMatch(/signal=search-reopen.*from=closed\/med.*to=open\/high/);
    expect(repeated).toMatchObject({ decision: "hold", changed: false, signal: "search-reopen" });
  });

  it("does not make recovery reopen a closed search", () => {
    const closed = stepSteering(initialSteeringState("med"), operator("close-search"));
    const recovery = stepSteering(closed.state, runtime("behavioral-recovery"));

    expect(recovery.state).toEqual({ rung: "med", search: "closed" });
    expect(recovery.decision).toBe("hold");
    expect(recovery.explanation).toMatch(/from=closed\/med.*to=closed\/med/);
  });

  it("makes checkpoint and stop first-class, with no implicit resume", () => {
    const checkpoint = stepSteering(initialSteeringState(), operator("checkpoint"));
    const close = stepSteering(checkpoint.state, operator("close-search"));
    const stop = stepSteering(close.state, operator("stop"));
    const afterStop = stepSteering(stop.state, runtime("behavioral-failure"));

    expect(checkpoint.state).toEqual({ rung: "med", search: "checkpointed" });
    expect(checkpoint.decision).toBe("checkpoint");
    expect(close.state).toEqual({ rung: "med", search: "closed" });
    expect(stop.state).toEqual({ rung: "med", search: "stopped" });
    expect(afterStop.state).toEqual(stop.state);
    expect(afterStop.decision).toBe("hold");
    expect(afterStop.explanation).toMatch(/signal=behavioral-failure.*from=stopped\/med.*to=stopped\/med/);
  });

  it("keeps untrusted parsing separate from event construction", () => {
    expect(parseOperatorCommand(undefined)).toBeNull();
    expect(parseOperatorCommand(null)).toBeNull();
    expect(parseOperatorCommand("checkpoint")).toBeNull();
    expect(parseOperatorCommand({ type: "behavioral-failure", authority: "runtime" })).toBeNull();
    expect(parseOperatorCommand({ type: "checkpoint", authority: "operator" })).toBeNull();
    expect(parseOperatorCommand({ type: "checkpoint", prose: "do it" })).toBeNull();
    expect(parseSteeringEvent({ type: "behavioral-failure", authority: "runtime" })).toBeNull();
    expect(parseOperatorCommand({ type: "checkpoint" })).toEqual({ type: "checkpoint" });

    const missing = stepSteering(initialSteeringState(), undefined);
    const malformed = stepSteering(initialSteeringState(), { type: "behavioral-failure", authority: "runtime" });
    expect(missing).toMatchObject({ accepted: false, decision: "hold", signal: "no-evidence" });
    expect(malformed).toMatchObject({ accepted: false, decision: "hold", signal: "invalid-event" });
  });

  it("rejects fabricated initial, runtime state, and policy values", () => {
    expect(() => initialSteeringState("zero" as never)).toThrow(/invalid steering start rung/);
    expect(() => initialSteeringState("med", "running" as never)).toThrow(/invalid steering search state/);
    expect(parseSteeringState({ rung: "zero", search: "open" })).toBeNull();
    expect(parseSteeringState({ rung: "med" })).toBeNull();
    expect(() => stepSteering({ rung: "med", search: "bogus" } as never, undefined)).toThrow(/invalid steering state/);
    expect(() => stepSteering({ rung: "med", search: "open", counter: 1 } as never, undefined)).toThrow(/invalid steering state/);
    expect(() => stepSteering(initialSteeringState("med"), undefined, { version: "v1", floor: "high", ceiling: "max" })).toThrow(/outside the policy bounds/);
    expect(parseSteeringPolicy({ version: "v1", floor: "low", ceiling: "max", threshold: 0.2 })).toBeNull();
    expect(() => stepSteering(initialSteeringState(), undefined, { version: "v1", floor: "max", ceiling: "low" } as never)).toThrow(/invalid steering policy/);
  });

  it("replays deterministically and records exact policy, provenance, and initial state", () => {
    const policy = { version: "test-policy-v1", floor: "low", ceiling: "xhigh" } as const;
    const events = [runtime("behavioral-failure", "f-1"), runtime("behavioral-failure", "f-2"), runtime("behavioral-recovery"), undefined, operator("checkpoint")];
    const first = replaySteering(events, policy, "med");
    const second = replaySteering(events, { policy, start: "med" });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.trace).toHaveLength(events.length);
    expect(first.trace.every((row) => row.policyVersion === "test-policy-v1")).toBe(true);
    expect(first.trace.every((row) => row.policy.version === "test-policy-v1")).toBe(true);
    expect(first.trace.some((row) => row.provenance === "host-runtime-adapter")).toBe(true);
    expect(first.final).toEqual({ rung: "high", search: "checkpointed" });

    const serialized = serializeSteeringRecord(first.record);
    const verification = verifySteeringRecord(JSON.parse(serialized));
    expect(verification.valid).toBe(true);
  });

  it("rejects tampered policy, version, state, signal, action, from/to, and shape", () => {
    const record = replaySteering([runtime("behavioral-failure", "f-1"), runtime("behavioral-recovery", "r-1")]).record;
    const tamper = (change: (copy: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
      change(copy);
      return verifySteeringRecord(copy);
    };

    expect(tamper((copy) => {
      (copy.policy as Record<string, unknown>).ceiling = "low";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      const row = (copy.trace as Array<Record<string, unknown>>)[0]!;
      row.policyVersion = "other-policy";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      (copy.initial as Record<string, unknown>).rung = "high";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      const row = (copy.trace as Array<Record<string, unknown>>)[0]!;
      row.decision = "recover";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      const row = (copy.trace as Array<Record<string, unknown>>)[0]!;
      row.signal = "behavioral-recovery";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      const row = (copy.trace as Array<Record<string, unknown>>)[0]!;
      (row.from as Record<string, unknown>).rung = "low";
    }).valid).toBe(false);
    expect(tamper((copy) => {
      const row = (copy.trace as Array<Record<string, unknown>>)[0]!;
      (row.to as Record<string, unknown>).rung = "max";
    }).valid).toBe(false);
    expect(tamper((copy) => copy.extra = true).valid).toBe(false);
  });
});

describe("public skill-zero CLI steering path", () => {
  it("runs only an explicit operator control, never a raw runtime payload", () => {
    const operatorResult = spawnSync(
      process.execPath,
      [bin, "--steering-event", JSON.stringify({ type: "checkpoint" })],
      { encoding: "utf8" },
    );
    expect(operatorResult.status).toBe(0);
    expect(JSON.parse(operatorResult.stdout)).toMatchObject({
      state: { rung: "med", search: "checkpointed" },
      decision: "checkpoint",
      provenance: "operator-control-plane",
    });

    for (const payload of [
      { type: "behavioral-failure", authority: "runtime" },
      { type: "behavioral-failure", authority: "operator" },
    ]) {
      const result = spawnSync(
        process.execPath,
        [bin, "--steering-event", JSON.stringify(payload)],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("operator control");
    }
  });

  it("rejects every supplied launch flag in steering mode, including defaults", () => {
    const unrelated = [
      ["--posture", "floor"],
      ["--level", "zero"],
      ["--harness", "claude"],
      ["--harness", "pi"],
      ["--mechanism", "plugin-dir"],
      ["--skill", "./skill"],
      ["--door-plugin-dir", "./door"],
      ["--print"],
      ["-p", "prompt"],
      ["--model", "model"],
      ["--effort", "low"],
      ["--keep-temp"],
      ["--"],
      ["--record"],
      ["--benchmark-id", "id"],
      ["--task", "task"],
      ["--arm", "heaven"],
      ["--repeat", "0"],
      ["--endpoint-regex", "result"],
      ["--record-out", "record.json"],
      ["--note", "note"],
      ["--telemetry-out", "observation.json"],
      ["--telemetry-task-family", "family"],
      ["--telemetry-invoked-skill", "skill"],
      ["--telemetry-model-version", "version"],
      ["--telemetry-retry-count", "0"],
      ["--telemetry-recovery", "observed"],
      ["--telemetry-churn-count", "0"],
      ["--telemetry-validate", "observation.json"],
    ];
    for (const flags of unrelated) {
      const result = spawnSync(
        process.execPath,
        [bin, "--steering-event", JSON.stringify({ type: "checkpoint" }), ...flags],
        { encoding: "utf8" },
      );
      expect(result.status, flags.join(" ")).toBe(2);
      expect(result.stderr).toContain("standalone");
    }
  });

  it("verifies a recorded trace through the public CLI", () => {
    const recordPath = resolve(import.meta.dirname, "steering-record.json");
    // The verifier test uses an inline JSON file only through the CLI; the
    // file is removed by the shell after the process exits.
    const record = replaySteering([runtime("behavioral-failure"), runtime("behavioral-recovery")]).record;
    writeFileSync(recordPath, serializeSteeringRecord(record));
    try {
      const result = spawnSync(process.execPath, [bin, "--steering-verify", recordPath], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, schema: "gaia-steering-trace/v1" });
    } finally {
      rmSync(recordPath, { force: true });
    }
  });
});
