// The round-trip filter for generated expansions (SPEC §2.3 guardrail 1,
// PLAN 1.7).
//
//   npx tsx packages/core/scripts/filter-expansions.ts --in <raw.jsonl>
//   npx tsx packages/core/scripts/filter-expansions.ts --in <raw.jsonl> --rank-cutoff 5
//
// Unfiltered expansion injects noise and measurably underperforms filtered
// expansion, so every generated phrasing has to earn its place: retrieve WITH
// THE EXPANSION AS THE QUERY against the pre-expansion index, and keep it only
// if the skill it was written for comes back at or above `--rank-cutoff`.
//
// Cutoff 1 is what SPEC §2.3 specifies. It is also brutal against an index
// whose MRR is 0.28 — an expansion that surfaces a skill the current index
// cannot surface at all is exactly the expansion worth having, and top-1
// rejects it. The script therefore REPORTS the survival curve at 1, 3, 5 and
// 10 so the choice is made against data rather than by default, and records
// the cutoff actually used in the output.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import {
  buildSkillIndex,
  expansionFingerprint,
  type NamedProjection,
  type ProjectionSkill,
} from "../src/retrieval/build-index.js";
import { INDEX_BUILDER_VERSION } from "../src/retrieval/version.js";

type RawExpansion = { id: string; expansions: string[]; fromMetadataOnly?: boolean };

const here = dirname(fileURLToPath(import.meta.url));
const benchCorpus = join(here, "..", "bench", "corpus");
const inputPath = argValue("--in") ?? join(benchCorpus, "expansions.raw.jsonl");
// `--rank-cutoff none` keeps every generated expansion. It is a real option,
// not an escape hatch: measured on this corpus the round-trip filter REMOVES
// the expansions worth having (see docs/PHASES-0-4-STATUS.md), so the shipped
// index is currently built unfiltered and this flag is what makes that
// reproducible from one documented command.
const cutoffArg = argValue("--rank-cutoff") ?? "1";
const cutoff = cutoffArg === "none" ? Number.POSITIVE_INFINITY : Number(cutoffArg);
if (!Number.isFinite(cutoff) && cutoffArg !== "none") {
  throw new Error(`--rank-cutoff must be a positive integer or "none", got: ${cutoffArg}`);
}
const outputPath = join(benchCorpus, "expansions.json");

const snapshot = JSON.parse(
  readFileSync(join(benchCorpus, "named-projection.json"), "utf8"),
) as NamedProjection & { snapshot: { source: string; digest: string; capturedAt: string } };

// The filter runs against the index WITHOUT expansions — that is what "the
// current index" means, and scoring an expansion against an index that already
// contains it would be circular.
const preExpansion = buildSkillIndex({
  projection: snapshot,
  source: snapshot.snapshot.source,
  sourceDigest: snapshot.snapshot.digest,
  builderVersion: INDEX_BUILDER_VERSION,
  generatedAt: snapshot.snapshot.capturedAt,
});
const ranker = new Bm25fRanker(preExpansion);
const known = new Set(preExpansion.docs.map((doc) => doc.id));

const raw = readFileSync(inputPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as RawExpansion);

const curve = new Map<number, number>([
  [1, 0],
  [3, 0],
  [5, 0],
  [10, 0],
]);
let considered = 0;
let unknownIds = 0;

const kept: Record<
  string,
  { expansions: string[]; expandedBy: string; expandedFrom: string }
> = {};
const projectionById = new Map<string, ProjectionSkill>(
  Object.values(snapshot.buckets ?? {})
    .flat()
    .map((skill) => [skill.id, skill]),
);
const rejected: Array<{ id: string; expansion: string; rank: number | null; top: string | null }> = [];

for (const entry of raw) {
  if (!known.has(entry.id)) {
    unknownIds++;
    continue;
  }
  const survivors: string[] = [];
  for (const expansion of entry.expansions) {
    considered++;
    const ranked = ranker.rank(expansion);
    const position = ranked.findIndex((hit) => hit.doc.id === entry.id);
    const rank = position === -1 ? null : position + 1;
    for (const threshold of curve.keys()) {
      if (rank !== null && rank <= threshold) curve.set(threshold, (curve.get(threshold) ?? 0) + 1);
    }
    if (cutoffArg === "none" || (rank !== null && rank <= cutoff)) survivors.push(expansion);
    else rejected.push({ id: entry.id, expansion, rank, top: ranked[0]?.doc.id ?? null });
  }
  if (survivors.length > 0) {
    const skill = projectionById.get(entry.id);
    kept[entry.id] = {
      expansions: survivors,
      expandedBy: INDEX_BUILDER_VERSION,
      // Stamped so `expansion-plan.ts` can tell a refresh which skills actually
      // moved, instead of regenerating the whole corpus every time the tree does.
      expandedFrom: skill ? expansionFingerprint(skill) : "",
    };
  }
}

writeFileSync(outputPath, `${JSON.stringify(sortKeys(kept), null, 2)}\n`);
writeFileSync(
  join(benchCorpus, "expansions.rejected.json"),
  `${JSON.stringify({ cutoff: cutoffArg, rejected }, null, 2)}\n`,
);

console.log(
  [
    `input             ${inputPath}`,
    `skills            ${raw.length} (${unknownIds} unknown ids skipped)`,
    `expansions        ${considered}`,
    "",
    "round-trip survival curve — the expansion as the query, against the pre-expansion index:",
    ...[...curve.entries()].map(
      ([threshold, count]) =>
        `  source in top ${String(threshold).padStart(2)}   ${count}/${considered} (${((count / (considered || 1)) * 100).toFixed(1)}%)`,
    ),
    "",
    `cutoff used       ${cutoffArg}`,
    `kept              ${Object.values(kept).reduce((total, entry) => total + entry.expansions.length, 0)} across ${Object.keys(kept).length} skills`,
    `wrote             ${outputPath}`,
  ].join("\n"),
);

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (left < right ? -1 : 1)));
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}
