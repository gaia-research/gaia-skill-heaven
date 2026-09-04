// PLAN 2.1 — the failure analysis that decides whether Phase 2 ships.
//
//   npx tsx packages/core/bench/analyze-misses.ts
//
// "Take Phase 1's misses and classify them. If they are mostly vocabulary
// mismatch, vectors help. If they are mostly missing skills, vectors change
// nothing and the answer is curation, not retrieval."
//
// This script exists so that decision is made against a classification rather
// than an impression. It is offline, like the rest of the harness.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import { isReachable } from "../src/retrieval/build-index.js";
import { decide } from "../src/retrieval/decide.js";
import { tokenizeText } from "../src/retrieval/lexical.js";
import { assertSkillIndex, type IndexedSkill, type SkillIndex } from "../src/retrieval/schema.js";

globalThis.fetch = (() => {
  throw new Error("The benchmark is offline by contract (G3).");
}) as typeof fetch;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

/**
 * Why a query did not put its correct answer first. Ordered from "no ranker
 * can fix this" to "a better ranker fixes this", because that ordering is the
 * whole point: only the last two classes are retrieval problems at all.
 */
type MissClass =
  /** The correct skill cannot be summoned at all — no installable link, no components. */
  | "unreachable"
  /** The correct skill was withheld by the surface or registry-only filter. */
  | "filtered"
  /** The floor refused the query, and the correct skill was under it. */
  | "refused"
  /** Query and document share no lexical term at all — the vocabulary gap in its pure form. */
  | "zero-term-overlap"
  /** Terms overlap, but a sibling skill outranked the right one. */
  | "outranked-by-sibling"
  /** Terms overlap and the right skill is in the list, just not first. */
  | "ranked-low"
  | "correct";

const index = loadIndex();
const ranker = new Bm25fRanker(index);
const gold = readJsonl<{ query: string; skillId: string; level?: string; ambiguous?: boolean }>(
  join(here, "gold.jsonl"),
);
const byId = new Map(index.docs.map((doc) => [doc.id, doc]));

const rows = gold.map((entry) => {
  const target = byId.get(entry.skillId);
  const ranked = ranker.rank(entry.query);
  const decision = decide({ index, query: entry.query, ranked, source: index.source });
  const admitted = decision.admitted.map((hit) => hit.doc.id);
  const position = admitted.indexOf(entry.skillId);

  return {
    query: entry.query,
    correctId: entry.skillId,
    ...(entry.level ? { level: entry.level } : {}),
    ...(entry.ambiguous ? { ambiguous: true } : {}),
    rank: position === -1 ? null : position + 1,
    topId: admitted[0] ?? null,
    class: classify(entry, target, ranked, decision, position),
    sharedTerms: target ? sharedTerms(entry.query, target) : [],
  };
});

const counts = new Map<MissClass, number>();
for (const row of rows) counts.set(row.class, (counts.get(row.class) ?? 0) + 1);

const misses = rows.filter((row) => row.class !== "correct");
const retrievalFixable = misses.filter(
  (row) => row.class === "zero-term-overlap" || row.class === "outranked-by-sibling" || row.class === "ranked-low",
).length;
const curationBound = misses.filter(
  (row) => row.class === "unreachable" || row.class === "filtered",
).length;

const report = {
  schema: "gaia.miss-analysis/v1",
  ranAt: new Date().toISOString(),
  index: { generatedAt: index.generatedAt, docs: index.stats.docs, expandedDocs: index.stats.expandedDocs },
  totals: {
    queries: rows.length,
    correct: counts.get("correct") ?? 0,
    misses: misses.length,
    retrievalFixable,
    curationBound,
    refused: counts.get("refused") ?? 0,
  },
  byClass: Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1])),
  verdict: verdict(),
  rows,
};

writeFileSync(join(here, "results", "miss-analysis.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n${rows.length} gold queries against the committed index\n`);
for (const [name, count] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
  console.log(`  ${name.padEnd(22)} ${String(count).padStart(3)}`);
}
console.log(
  `\n  of ${misses.length} misses: ${curationBound} are curation-bound (no ranker can fix them), ` +
    `${retrievalFixable} are retrieval problems\n`,
);
console.log(report.verdict);

function classify(
  entry: { skillId: string },
  target: IndexedSkill | undefined,
  ranked: ReturnType<Bm25fRanker["rank"]>,
  decision: ReturnType<typeof decide>,
  position: number,
): MissClass {
  if (position === 0) return "correct";
  if (!target || !isReachable(target)) return "unreachable";
  if (decision.filtered.some((row) => row.id === entry.skillId)) return "filtered";
  if (decision.noMatch) return "refused";
  if (!ranked.some((hit) => hit.doc.id === entry.skillId)) return "zero-term-overlap";
  if (position === -1) return "outranked-by-sibling";
  return "ranked-low";
}

/** Terms the query and the target document actually share, expansions included. */
function sharedTerms(query: string, target: IndexedSkill): string[] {
  const documentTerms = new Set(
    tokenizeText(
      [
        target.name,
        target.title ?? "",
        target.tags.join(" "),
        target.description,
        target.retrieval.expansions.join(" "),
      ].join(" "),
    ),
  );
  return tokenizeText(query).filter((term) => documentTerms.has(term));
}

function verdict(): string {
  const vocabulary = counts.get("zero-term-overlap") ?? 0;
  if (misses.length === 0) return "No misses. Nothing for Phase 2 to fix.";
  const share = vocabulary / misses.length;
  if (vocabulary === 0) {
    return (
      `VERDICT: ZERO of ${misses.length} misses share no lexical term with the correct skill. ` +
      "The vocabulary gap dense retrieval exists to close does not occur in this corpus at this scale — " +
      "index-time expansion already closed it. PLAN 2.1's kill criterion is met: drop dense retrieval and " +
      `record it as a negative result (D8). The misses that remain are ${curationBound} curation-bound ` +
      `(no ranker reaches them) and ${retrievalFixable} ordering, and ordering is a ranking-signal problem, ` +
      "not a representation one."
    );
  }
  if (curationBound / misses.length >= 0.5) {
    return (
      `VERDICT: ${curationBound}/${misses.length} misses are curation-bound — the correct skill cannot be ` +
      "summoned or is withheld. Dense retrieval changes none of them. PLAN 2.1's kill criterion is met: " +
      "drop dense retrieval and record it as a negative result (D8). The remaining lever is curation."
    );
  }
  if (share >= 0.5) {
    return (
      `VERDICT: ${vocabulary}/${misses.length} misses share no lexical term with the correct skill. ` +
      "That is the vocabulary gap in its pure form and it is what dense retrieval is for. Phase 2.2 is warranted."
    );
  }
  return (
    `VERDICT: misses are mixed — ${vocabulary}/${misses.length} pure vocabulary, ${curationBound} curation-bound, ` +
    `${retrievalFixable - vocabulary} ordering. Vectors address only the first group; weigh 2.2 against that share.`
  );
}

function loadIndex(): SkillIndex {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
  );
  assertSkillIndex(raw);
  return raw;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
