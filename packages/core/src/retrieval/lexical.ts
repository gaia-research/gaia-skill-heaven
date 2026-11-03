// Lexical primitives shared by the runtime ranker, the offline index builder
// and the benchmark harness.
//
// `normalize` and `scoreMatch` moved here from
// `packages/skill-summon/src/service.ts` so that exactly one implementation of
// the shipped baseline exists. The benchmark scores the SAME function the
// product runs; a re-implementation would drift and the baseline number would
// stop meaning anything. `skill-summon` re-exports both for back-compat.

/** Casefold, strip diacritics, and reduce everything non-alphanumeric to spaces. */
export function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalized, de-duplicated, order-preserving token list. */
export function tokenizeText(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter(Boolean))];
}

/**
 * The shipped baseline scorer: weighted substring counting over a handful of
 * fields. Kept verbatim as the thing Phase 1 is measured against.
 */
export function scoreMatch(
  query: string,
  weightedFields: ReadonlyArray<readonly [value: string, weight: number]>,
): number {
  const normalizedQuery = normalize(query);
  const tokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  let score = 0;

  for (const [rawValue, weight] of weightedFields) {
    const value = normalize(rawValue);
    if (!value) continue;
    if (value === normalizedQuery) score += weight * 10;
    else if (value.includes(normalizedQuery)) score += weight * 5;
    for (const token of tokens) {
      if (value.split(" ").includes(token)) score += weight;
      else if (value.includes(token)) score += weight / 2;
    }
  }

  return score;
}
