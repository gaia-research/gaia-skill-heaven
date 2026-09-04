// What a refresh actually has to regenerate (the incremental path).
//
//   npx tsx packages/core/scripts/expansion-plan.ts
//   npx tsx packages/core/scripts/expansion-plan.ts --emit-batches 6
//
// The tree moves constantly — skills are added, descriptions rewritten, links
// fixed, tiers re-graded. Expansion is the one expensive step in a refresh, so
// the question that matters after every `snapshot-corpus.ts` is not "what does
// the corpus contain" but "what changed since the expansions were written".
//
// This answers it: skills with no expansions at all, and skills whose text has
// moved out from under the expansions they have. A re-graded trust level or a
// repaired link does not appear here — the fingerprint covers only the fields
// the generation brief reads.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  expansionFingerprint,
  type NamedProjection,
  type ProjectionSkill,
} from "../src/retrieval/build-index.js";

const here = dirname(fileURLToPath(import.meta.url));
const benchCorpus = join(here, "..", "bench", "corpus");
const batchDir = join(benchCorpus, "batches");

const snapshot = JSON.parse(
  readFileSync(join(benchCorpus, "named-projection.json"), "utf8"),
) as NamedProjection;

const existing = new Map<string, { expandedFrom?: string; expansions: string[] }>(
  Object.entries(
    JSON.parse(readFileSync(join(benchCorpus, "expansions.json"), "utf8")) as Record<
      string,
      { expandedFrom?: string; expansions: string[] }
    >,
  ),
);

const skills = Object.values(snapshot.buckets ?? {}).flat();
const missing: ProjectionSkill[] = [];
const stale: ProjectionSkill[] = [];
const current: ProjectionSkill[] = [];

for (const skill of skills) {
  const held = existing.get(skill.id);
  if (!held || held.expansions.length === 0) {
    missing.push(skill);
    continue;
  }
  // An expansion written before fingerprints existed is grandfathered rather
  // than force-regenerated: it was written from text we can no longer prove,
  // but it is not evidence of a change.
  if (held.expandedFrom !== undefined && held.expandedFrom !== expansionFingerprint(skill)) {
    stale.push(skill);
    continue;
  }
  current.push(skill);
}

const orphaned = [...existing.keys()].filter(
  (id) => !skills.some((skill) => skill.id === id),
);

const work = [...missing, ...stale].sort((left, right) => (left.id < right.id ? -1 : 1));

console.log(
  [
    `corpus            ${skills.length} bucketed skills`,
    `current           ${current.length}`,
    `missing           ${missing.length}   (never expanded — these are DEMOTED until they are)`,
    `stale             ${stale.length}   (text changed since their expansions were written)`,
    `orphaned          ${orphaned.length}   (expansions for skills no longer in the corpus)`,
    "",
    work.length === 0
      ? "Nothing to regenerate. The expansion surface matches the corpus."
      : `Regenerate ${work.length} skill(s).`,
  ].join("\n"),
);

const batchCount = Number(argValue("--emit-batches") ?? "0");
if (batchCount > 0 && work.length > 0) {
  mkdirSync(batchDir, { recursive: true });
  for (let batch = 0; batch < batchCount; batch++) {
    const slice = work.filter((_skill, position) => position % batchCount === batch);
    if (slice.length === 0) continue;
    writeFileSync(join(batchDir, `expand-${batch}.txt`), slice.map(describe).join("\n"));
  }
  console.log(`\nwrote ${batchDir}/expand-*.txt — hand each to one generation worker.`);
}

if (orphaned.length > 0) {
  console.log(
    `\nOrphaned ids (safe to drop from expansions.json):\n  ${orphaned.join("\n  ")}`,
  );
}

/** The generation worker's input format — see `packages/core/bench/GOLD-BRIEF.md`'s sibling, EXPAND-BRIEF.md. */
function describe(skill: ProjectionSkill): string {
  const github = (skill.links ?? {}).github;
  const body =
    typeof github === "string"
      ? github.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/")
      : "(no fetchable SKILL.md)";
  return [
    `- id: ${skill.id}`,
    `  level: ${skill.level ?? "—"}`,
    `  name: ${skill.name}`,
    `  title: ${skill.title ?? "(none)"}`,
    `  tags: ${(skill.tags ?? []).join(", ") || "(none)"}`,
    `  description: ${(skill.description ?? "").replace(/\s+/gu, " ")}`,
    `  body: ${body}`,
  ].join("\n");
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}
