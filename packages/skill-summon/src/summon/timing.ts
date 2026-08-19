import { performance } from "node:perf_hooks";

/** Return a monotonic timestamp suitable for measuring one summon step. */
export function startTiming(): number {
  return performance.now();
}

/**
 * Return elapsed seconds rounded to millisecond precision. The value is still
 * measured even when a very fast operation rounds to 0.000 seconds.
 */
export function elapsedSeconds(startedAt: number): number {
  return Number(((performance.now() - startedAt) / 1_000).toFixed(3));
}
