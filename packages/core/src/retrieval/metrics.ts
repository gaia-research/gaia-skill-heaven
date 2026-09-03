// Benchmark metrics (SPEC §7.1). Deterministic and dependency-free: a run is
// not a result until it is reproducible from a committed seed (SPEC §7.5).

/** Reciprocal rank of `correctId`, or 0 when it is absent from `ranked`. */
export function reciprocalRank(ranked: readonly string[], correctId: string): number {
  const position = ranked.indexOf(correctId);
  return position === -1 ? 0 : 1 / (position + 1);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Fraction of queries whose correct answer appears in the top `k`. */
export function recallAt(
  rankings: ReadonlyArray<{ ranked: readonly string[]; correctId: string }>,
  k: number,
): number {
  if (rankings.length === 0) return 0;
  const hits = rankings.filter(({ ranked, correctId }) =>
    ranked.slice(0, k).includes(correctId),
  ).length;
  return hits / rankings.length;
}

/** Deterministic 32-bit PRNG — mulberry32. A benchmark with an unseeded resample is a claim, not a measurement. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BootstrapResult = {
  delta: number;
  ciLow: number;
  ciHigh: number;
  resamples: number;
  seed: number;
  /** The G1 gate: the 95% CI on the delta excludes zero. */
  excludesZero: boolean;
};

/**
 * Paired bootstrap over per-query scores (SPEC §7.1). Paired because both
 * systems answer the same queries — the variance that matters is between
 * systems on a query, not between queries.
 */
export function pairedBootstrap(
  baseline: readonly number[],
  candidate: readonly number[],
  { resamples = 10_000, seed = 20260903 }: { resamples?: number; seed?: number } = {},
): BootstrapResult {
  if (baseline.length !== candidate.length) {
    throw new Error(
      `Paired bootstrap needs equal-length score vectors, got ${baseline.length} and ${candidate.length}.`,
    );
  }
  const n = baseline.length;
  const observed = mean(candidate) - mean(baseline);
  if (n === 0) {
    return { delta: 0, ciLow: 0, ciHigh: 0, resamples, seed, excludesZero: false };
  }

  const random = mulberry32(seed);
  const deltas = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const pick = Math.floor(random() * n);
      total += (candidate[pick] as number) - (baseline[pick] as number);
    }
    deltas[r] = total / n;
  }
  deltas.sort();

  const ciLow = percentile(deltas, 0.025);
  const ciHigh = percentile(deltas, 0.975);
  return {
    delta: observed,
    ciLow,
    ciHigh,
    resamples,
    seed,
    excludesZero: (ciLow > 0 && ciHigh > 0) || (ciLow < 0 && ciHigh < 0),
  };
}

function percentile(sorted: Float64Array, fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}
