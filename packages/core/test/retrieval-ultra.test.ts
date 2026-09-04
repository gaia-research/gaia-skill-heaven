import { describe, expect, it } from "vitest";

import {
  DEFAULT_ULTRA_PARAMS,
  initialUltraState,
  replayUltra,
  stepUltra,
  type UltraObservation,
} from "../src/retrieval/ultra.js";
import { mulberry32 } from "../src/retrieval/metrics.js";

const params = DEFAULT_ULTRA_PARAMS;

function trace(margins: readonly number[]): UltraObservation[] {
  return margins.map((margin) => ({ margin }));
}

describe("the Ultra controller", () => {
  it("holds through the dwell window however clear the signal is", () => {
    // Three confident gaps in a row must NOT move the rung: dwell is what
    // stops a run of easy queries from walking the ladder.
    const { changes, steps } = replayUltra(trace([0.9, 0.9, 0.9]));
    expect(changes).toBe(0);
    expect(steps.every((step) => step.decision === "hold")).toBe(true);
  });

  it("converges once the smoothed margin clears T_high", () => {
    const { steps, finalRung } = replayUltra(trace([0.9, 0.9, 0.9, 0.9]), params, "med");
    expect(steps[3]?.decision).toBe("converge");
    expect(finalRung).toBe("low");
  });

  it("explores once the smoothed margin falls below T_low", () => {
    const { steps, finalRung } = replayUltra(trace([0.05, 0.05, 0.05, 0.05]), params, "med");
    expect(steps[3]?.decision).toBe("explore");
    expect(finalRung).toBe("high");
  });

  it("holds inside the dead band — hysteresis, not a single threshold", () => {
    const between = (params.tLow + params.tHigh) / 2;
    const { changes } = replayUltra(trace(Array.from({ length: 40 }, () => between)));
    expect(changes).toBe(0);
  });

  it("moves one rung at a time, never low straight to max", () => {
    const { steps } = replayUltra(trace(Array.from({ length: 60 }, () => 0)), params, "low");
    const visited = steps.filter((step) => step.changed).map((step) => step.state.rung);
    expect(visited.slice(0, 4)).toEqual(["med", "high", "xhigh", "max"]);
  });

  it("never selects zero, and clamps at both ends", () => {
    const converged = replayUltra(trace(Array.from({ length: 60 }, () => 1)), params, "max");
    expect(converged.finalRung).toBe("low");
    const explored = replayUltra(trace(Array.from({ length: 60 }, () => 0)), params, "low");
    expect(explored.finalRung).toBe("max");
  });

  it("treats a noMatch as saying nothing about depth", () => {
    // Reaching wider cannot summon a skill that is not in the corpus. Reading
    // a `noMatch` as "explore" is how a controller walks itself to max on a
    // curation gap.
    const observations: UltraObservation[] = Array.from({ length: 40 }, () => ({
      margin: 0,
      noMatch: true,
    }));
    const { changes, steps } = replayUltra(observations, params, "med");
    expect(changes).toBe(0);
    expect(steps[10]?.decision).toBe("hold-no-match");
  });

  it("explains every rung change, naming the margin, the threshold and the new rung", () => {
    const { steps } = replayUltra(trace([0.9, 0.9, 0.9, 0.9]), params, "med");
    const change = steps.find((step) => step.changed);
    expect(change?.explanation).toMatch(/med -> low/);
    expect(change?.explanation).toMatch(/smoothed margin 0\.\d+/);
    expect(change?.explanation).toMatch(/T_high/);
  });

  it("is a pure function — the same trace gives the same steps", () => {
    const first = replayUltra(trace([0.9, 0.1, 0.5, 0.2, 0.8]));
    const second = replayUltra(trace([0.9, 0.1, 0.5, 0.2, 0.8]));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// PLAN 3.5 — "replay a recorded margin trace and assert the rung changes fewer
// than N times. Oscillation becomes a test failure, not a vibe."
describe("the stability gate", () => {
  it("does not chatter on an adversarial trace that alternates across both thresholds", () => {
    // The worst case for a naive controller: every other gap is maximally
    // certain, then maximally ambiguous. A threshold-only controller flips on
    // every gap — 60 changes. This one moves ONCE across 60 gaps and then
    // stays, because the EWMA of an alternating signal converges to its mean
    // (~0.5), which sits above T_high, and the rung then clamps. Reading that
    // signal as "converge" is correct: on average this index is decisive.
    const alternating = trace(Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.95 : 0.05)));
    const { changes, finalRung } = replayUltra(alternating);
    expect(changes).toBe(1);
    expect(finalRung).toBe("low");
  });

  it("does not chatter on noisy margins around a threshold", () => {
    const random = mulberry32(20260903);
    const noisy = trace(
      Array.from({ length: 200 }, () => params.tHigh + (random() - 0.5) * 0.1),
    );
    const { changes } = replayUltra(noisy);
    // 200 gaps, dwell 3: an unstable controller could change ~66 times.
    expect(changes).toBeLessThanOrEqual(200 / params.dwell / 4);
  });

  it("changes at most once per dwell window on any trace", () => {
    const random = mulberry32(7);
    const wild = trace(Array.from({ length: 300 }, () => random()));
    const { steps, changes } = replayUltra(wild);
    expect(changes).toBeLessThanOrEqual(Math.ceil(steps.length / (params.dwell + 1)));

    let sinceChange = Number.POSITIVE_INFINITY;
    for (const step of steps) {
      if (step.changed) {
        expect(sinceChange).toBeGreaterThanOrEqual(params.dwell);
        sinceChange = 0;
      } else sinceChange++;
    }
  });

  it("settles rather than drifting when the signal is stationary", () => {
    const random = mulberry32(99);
    // Inside the calibrated dead band [0.123, 0.274]. Anchored to the params
    // rather than a literal so a re-calibration moves the test with it.
    const middle = (params.tLow + params.tHigh) / 2;
    const stationary = trace(Array.from({ length: 150 }, () => middle + (random() - 0.5) * 0.05));
    const { changes, finalRung } = replayUltra(stationary, params, "med");
    expect(changes).toBe(0);
    expect(finalRung).toBe("med");
  });
});

describe("stepUltra", () => {
  it("clamps a non-finite or out-of-range margin instead of propagating it", () => {
    const state = initialUltraState("med");
    expect(stepUltra(state, { margin: Number.NaN }).state.smoothed).toBe(1);
    expect(stepUltra(state, { margin: -5 }).state.smoothed).toBe(0);
    expect(stepUltra(state, { margin: 12 }).state.smoothed).toBe(1);
  });
});
