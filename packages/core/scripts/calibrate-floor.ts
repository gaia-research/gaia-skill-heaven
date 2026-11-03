// Calibrate the absolute relevance floor against the unanswerable set
// (SPEC §4.4, PLAN 1.6).
//
//   npx tsx packages/core/scripts/calibrate-floor.ts
//
// Writes `bench/corpus/floor.json`, which the index builder folds into
// `stats.floor` / `stats.floorCalibration`. Calibration is a committed,
// reviewable artifact rather than a constant somebody typed.
//
// THE POLICY, stated before the number so it cannot be reverse-engineered from
// one: the floor is the HIGHEST threshold that still admits at least
// `MIN_ANSWERABLE_ADMITTED` of the gold set. Rejection rate is reported, never
// targeted. Choosing the floor by "what makes G2 pass" is the exact failure the
// risk register names — it would trade away half the answerable queries to win
// a gate, and the product would get worse while the scoreboard improved.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import { assertSkillIndex } from "../src/retrieval/schema.js";

/** A floor that refuses answerable queries is worse than no floor at all. */
const MIN_ANSWERABLE_ADMITTED = 0.9;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const benchDir = join(here, "..", "bench");

const index = JSON.parse(
  readFileSync(join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
);
assertSkillIndex(index);
const ranker = new Bm25fRanker(index);

const gold = readJsonl<{ query: string }>(join(benchDir, "gold.jsonl"));
const unanswerable = readJsonl<{ query: string }>(join(benchDir, "unanswerable.jsonl"));

// Exact name/id hits skip ranking entirely and never meet a floor (SPEC §3.4),
// so they are excluded from the distributions rather than stretching them.
const topScores = (entries: ReadonlyArray<{ query: string }>) =>
  entries
    .map((entry) => ranker.rank(entry.query)[0])
    .filter((hit) => hit !== undefined && hit.matchKind !== "exact")
    .map((hit) => hit?.score ?? 0);

const answerable = topScores(gold);
const rejectable = topScores(unanswerable);
const ceiling = Math.max(0, ...answerable, ...rejectable);

let chosen = { floor: 0, answerableAdmitted: 1, unanswerableRejected: 0 };
for (let step = 0; step <= 1000; step++) {
  const floor = (ceiling * step) / 1000;
  const admitted = answerable.filter((score) => score >= floor).length / (answerable.length || 1);
  if (admitted < MIN_ANSWERABLE_ADMITTED) break;
  chosen = {
    floor: round4(floor),
    answerableAdmitted: round4(admitted),
    unanswerableRejected: round4(
      rejectable.filter((score) => score < floor).length / (rejectable.length || 1),
    ),
  };
}

// How well the score separates the two populations at all, independent of any
// threshold: the fraction of (answerable, unanswerable) pairs it orders
// correctly. Reported because a floor is only as good as the signal under it.
let correctlyOrdered = 0;
for (const good of answerable) for (const bad of rejectable) if (good > bad) correctlyOrdered++;
const separation = round4(correctlyOrdered / (answerable.length * rejectable.length || 1));

const meetsG2 = chosen.unanswerableRejected >= 0.9;
const calibration = {
  floor: chosen.floor,
  policy: `highest threshold admitting >= ${MIN_ANSWERABLE_ADMITTED} of the gold set`,
  answerableAdmitted: chosen.answerableAdmitted,
  unanswerableRejected: chosen.unanswerableRejected,
  separation,
  goldSetRevision: sha1Short(readFileSync(join(benchDir, "gold.jsonl"))),
  unanswerableSetRevision: sha1Short(readFileSync(join(benchDir, "unanswerable.jsonl"))),
  calibratedAt: new Date().toISOString(),
  meetsG2,
  note: meetsG2
    ? undefined
    : `G2 (>=90% of the unanswerable set refused) is NOT met at a floor that keeps the product usable. ` +
      `The two score distributions overlap: raw BM25F separates them on ${(separation * 100).toFixed(0)}% of pairs, ` +
      `and reaching 90% rejection would cost more than ${((1 - MIN_ANSWERABLE_ADMITTED) * 100).toFixed(0)}% of answerable queries. ` +
      `Recorded as a finding (D8) rather than resolved by moving the threshold. n=${rejectable.length} negatives is also small; ` +
      `expansion (PLAN 1.7) should lift answerable scores without lifting unanswerable ones, and this is re-run after it.`,
};

writeFileSync(join(benchDir, "corpus", "floor.json"), `${JSON.stringify(calibration, null, 2)}\n`);
console.log(JSON.stringify(calibration, null, 2));
console.log(
  "\nRebuild the index to pick this up: npx tsx packages/core/scripts/build-skill-index.ts",
);

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/** Identifies which revision of the set produced this calibration (SPEC §7.5). */
function sha1Short(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("hex").slice(0, 12);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
