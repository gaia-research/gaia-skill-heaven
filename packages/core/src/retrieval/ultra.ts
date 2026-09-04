// LC — the Ultra controller (SPEC §6, PLAN Phase 3).
//
// `ultra` is the crown rung: it picks direction and depth per gap. The founder
// requirement is STABILITY, so this is deliberately, explicitly deterministic —
// no learning, no bandit, no model.
//
// Why: Ultra makes on the order of tens of decisions in a session. Every
// learned approach is sample-hungry relative to that, and a learned controller
// with n < 50 observations does not converge — it oscillates, and it
// oscillates unexplainably. The stable pattern for a one-dimensional adaptive
// signal is the one every autoscaler uses: smooth the signal, add a dead band,
// enforce a dwell time. That is what this is.
//
// It is a pure function of (state, margin). No I/O, no clock, no randomness —
// which is what lets §6.4's explainability requirement and the oscillation
// test both be real rather than aspirational.

/** The ladder, in order. Ultra moves along this line; it never leaves it. */
export const RUNGS = ["zero", "low", "med", "high", "xhigh", "max"] as const;

export type Rung = (typeof RUNGS)[number];

/**
 * Ultra never selects `zero`: zero skills is a product floor a user chooses,
 * not an answer to a capability gap. It clamps to [low, max].
 */
export const ULTRA_FLOOR: Rung = "low";
export const ULTRA_CEILING: Rung = "max";

export type UltraParams = {
  /** EWMA smoothing. One noisy gap must not move the rung. PROVISIONAL: 0.3 */
  alpha: number;
  /** Minimum gaps at a rung before it may change again. PROVISIONAL: 3 */
  dwell: number;
  /** Above this smoothed margin the index is sure — converge. */
  tHigh: number;
  /** Below this smoothed margin several skills are plausible — explore. */
  tLow: number;
};

/**
 * `alpha` and `dwell` remain PROVISIONAL — they are shape parameters, not
 * readings, and nothing has yet argued against the standard choices.
 *
 * `tLow` and `tHigh` are MEASURED (2026-09-03, `scripts/calibrate-ultra.ts`),
 * replacing SPEC §6.3's 0.20 / 0.45. Those were set before anyone looked at
 * what `margin` actually does on this index, and the distribution is far more
 * ambiguous than they assumed: p50 is 0.214, so at 0.20/0.45 the controller
 * would have read 46% of gaps as "explore" against 19% "converge" and walked
 * itself toward `max` on an ordinary session.
 *
 * At 0.123 / 0.274 the three decisions split 33/34/34, and the controller is
 * also *more* stable on the same trace — 5 rung changes over 80 gaps against
 * 9 — because a threshold pair straddling the bulk of the distribution stops
 * treating a typical margin as a signal.
 *
 * The provenance is a PROXY and is labelled as one: these margins come from
 * the gold set, whose queries are answerable by construction and therefore
 * skew more decisive than a real session's. Re-run the calibration against a
 * real `summon-log.jsonl` (`--log`) when one exists; that is what SPEC §6.3
 * asks for and this is the closest honest thing available before it.
 */
export const DEFAULT_ULTRA_PARAMS: UltraParams = {
  alpha: 0.3,
  dwell: 3,
  tHigh: 0.274,
  tLow: 0.123,
};

export type UltraState = {
  rung: Rung;
  /** Smoothed margin. `null` until the first gap. */
  smoothed: number | null;
  /** Gaps observed at the current rung. */
  gapsAtRung: number;
  /** Gaps observed in total. */
  gaps: number;
};

export type UltraDecision =
  | "hold"
  | "converge"
  | "explore"
  /** Below the floor: the corpus does not cover this gap. Widening would not help. */
  | "hold-no-match";

export type UltraObservation = {
  /** `(score_top1 − score_top2) / score_top1` from a preview summon. */
  margin: number;
  /** True when the summon returned `noMatch` — no candidate cleared the floor. */
  noMatch?: boolean | undefined;
};

export type UltraStep = {
  state: UltraState;
  decision: UltraDecision;
  changed: boolean;
  /** SPEC §6.4 — one line naming the smoothed margin, the threshold crossed, and the new rung. */
  explanation: string;
};

export function initialUltraState(rung: Rung = "med"): UltraState {
  return { rung: clamp(rung), smoothed: null, gapsAtRung: 0, gaps: 0 };
}

/**
 * One capability gap. Returns the next state and the line that explains it.
 *
 * Four stability properties, each load-bearing and each separately testable:
 *  - EWMA      — one noisy gap cannot move the rung
 *  - hysteresis— tLow and tHigh are separate, so the band between is a dead
 *                zone and the controller cannot chatter across one threshold
 *  - dwell     — a minimum number of gaps at a rung before it may change again
 *  - single step — one rung at a time. Never `low` straight to `max`.
 */
export function stepUltra(
  state: UltraState,
  observation: UltraObservation,
  params: UltraParams = DEFAULT_ULTRA_PARAMS,
): UltraStep {
  const { alpha, dwell, tHigh, tLow } = params;
  const margin = clampMargin(observation.margin);
  const smoothed = state.smoothed === null ? margin : alpha * margin + (1 - alpha) * state.smoothed;
  const gaps = state.gaps + 1;

  // A gap the corpus does not cover is not evidence about depth. Reaching
  // wider cannot summon a skill that is not there, and treating a `noMatch`
  // as "explore" is how a controller walks itself to `max` on a corpus gap.
  if (observation.noMatch) {
    return {
      state: { ...state, smoothed, gaps, gapsAtRung: state.gapsAtRung + 1 },
      decision: "hold-no-match",
      changed: false,
      explanation: `ultra: hold at ${state.rung} — no candidate cleared the floor, so this gap says nothing about depth (smoothed margin ${smoothed.toFixed(3)})`,
    };
  }

  if (state.gapsAtRung < dwell) {
    return {
      state: { ...state, smoothed, gaps, gapsAtRung: state.gapsAtRung + 1 },
      decision: "hold",
      changed: false,
      explanation: `ultra: hold at ${state.rung} — dwell ${state.gapsAtRung + 1}/${dwell} (smoothed margin ${smoothed.toFixed(3)})`,
    };
  }

  if (smoothed > tHigh) {
    const rung = shift(state.rung, -1);
    return move(state, rung, smoothed, gaps, "converge", `smoothed margin ${smoothed.toFixed(3)} > T_high ${tHigh}`);
  }
  if (smoothed < tLow) {
    const rung = shift(state.rung, +1);
    return move(state, rung, smoothed, gaps, "explore", `smoothed margin ${smoothed.toFixed(3)} < T_low ${tLow}`);
  }

  return {
    state: { ...state, smoothed, gaps, gapsAtRung: state.gapsAtRung + 1 },
    decision: "hold",
    changed: false,
    explanation: `ultra: hold at ${state.rung} — smoothed margin ${smoothed.toFixed(3)} inside the dead band [${tLow}, ${tHigh}]`,
  };
}

function move(
  state: UltraState,
  rung: Rung,
  smoothed: number,
  gaps: number,
  decision: UltraDecision,
  because: string,
): UltraStep {
  const changed = rung !== state.rung;
  return {
    state: {
      rung,
      smoothed,
      // A rung that did not actually move (already at the clamp) keeps
      // accumulating dwell rather than resetting it forever.
      gapsAtRung: changed ? 0 : state.gapsAtRung + 1,
      gaps,
    },
    decision,
    changed,
    explanation: changed
      ? `ultra: ${decision} ${state.rung} -> ${rung} — ${because}`
      : `ultra: hold at ${state.rung} — ${because}, but already at the ${rung === ULTRA_FLOOR ? "converge" : "explore"} limit`,
  };
}

/** One rung at a time, clamped to [low, max]. */
function shift(rung: Rung, direction: -1 | 1): Rung {
  const at = RUNGS.indexOf(rung);
  return clamp(RUNGS[Math.min(Math.max(at + direction, 0), RUNGS.length - 1)] as Rung);
}

function clamp(rung: Rung): Rung {
  const at = RUNGS.indexOf(rung);
  const low = RUNGS.indexOf(ULTRA_FLOOR);
  const high = RUNGS.indexOf(ULTRA_CEILING);
  return RUNGS[Math.min(Math.max(at, low), high)] as Rung;
}

function clampMargin(margin: number): number {
  if (!Number.isFinite(margin)) return 1;
  return Math.min(Math.max(margin, 0), 1);
}

/** Replay a margin trace. The stability gate (PLAN 3.5) runs against this. */
export function replayUltra(
  observations: readonly UltraObservation[],
  params: UltraParams = DEFAULT_ULTRA_PARAMS,
  start: Rung = "med",
): { steps: UltraStep[]; changes: number; finalRung: Rung } {
  let state = initialUltraState(start);
  const steps: UltraStep[] = [];
  let changes = 0;
  for (const observation of observations) {
    const step = stepUltra(state, observation, params);
    if (step.changed) changes++;
    steps.push(step);
    state = step.state;
  }
  return { steps, changes, finalRung: state.rung };
}
