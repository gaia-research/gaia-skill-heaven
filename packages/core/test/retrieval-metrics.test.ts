import { describe, expect, it } from "vitest";

import {
  mean,
  mulberry32,
  pairedBootstrap,
  recallAt,
  reciprocalRank,
} from "../src/retrieval/metrics.js";

describe("reciprocalRank", () => {
  it("is 1/rank, and 0 when the answer is absent", () => {
    expect(reciprocalRank(["a", "b", "c"], "a")).toBe(1);
    expect(reciprocalRank(["a", "b", "c"], "c")).toBeCloseTo(1 / 3, 10);
    expect(reciprocalRank(["a", "b"], "z")).toBe(0);
    expect(reciprocalRank([], "a")).toBe(0);
  });
});

describe("recallAt", () => {
  it("counts a hit only inside the cutoff", () => {
    const rankings = [
      { ranked: ["a", "b", "c"], correctId: "c" },
      { ranked: ["x", "y", "z", "w", "v", "q"], correctId: "q" },
    ];
    expect(recallAt(rankings, 5)).toBe(0.5);
    expect(recallAt(rankings, 6)).toBe(1);
    expect(recallAt([], 5)).toBe(0);
  });
});

describe("mulberry32", () => {
  it("is reproducible from its seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("pairedBootstrap", () => {
  it("reports a positive delta whose CI excludes zero for a clear improvement", () => {
    const baseline = Array.from({ length: 100 }, (_, i) => (i % 10) / 100);
    const candidate = baseline.map((value) => value + 0.5);
    const result = pairedBootstrap(baseline, candidate);
    expect(result.delta).toBeCloseTo(0.5, 10);
    expect(result.excludesZero).toBe(true);
    expect(result.ciLow).toBeGreaterThan(0);
  });

  it("does not claim a difference when there is none", () => {
    const scores = Array.from({ length: 100 }, (_, i) => (i % 7) / 7);
    const result = pairedBootstrap(scores, scores);
    expect(result.delta).toBe(0);
    expect(result.excludesZero).toBe(false);
  });

  it("is reproducible run to run", () => {
    const baseline = Array.from({ length: 50 }, (_, i) => (i % 5) / 5);
    const candidate = Array.from({ length: 50 }, (_, i) => (i % 3) / 3);
    expect(pairedBootstrap(baseline, candidate)).toEqual(pairedBootstrap(baseline, candidate));
  });

  it("refuses mismatched vectors rather than truncating silently", () => {
    expect(() => pairedBootstrap([1, 2], [1])).toThrow(/equal-length/);
  });
});

describe("mean", () => {
  it("is 0 for an empty sample", () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3])).toBe(2);
  });
});
