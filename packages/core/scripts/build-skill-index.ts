// Build `plugins/skill-heaven/data/skill-index.json` from the committed corpus
// snapshot (PLAN 1.1, SPEC §2).
//
//   npx tsx packages/core/scripts/build-skill-index.ts        # write
//   npx tsx packages/core/scripts/build-skill-index.ts --check # CI drift gate
//
// Deterministic and offline by construction: the only input is the committed
// snapshot, so a rebuild in CI must reproduce the committed index byte for
// byte. Refreshing the corpus is a separate, reviewable step
// (`snapshot-corpus.ts`).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSkillIndex, type NamedProjection } from "../src/retrieval/build-index.js";
import { INDEX_BUILDER_VERSION } from "../src/retrieval/version.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const snapshotPath = join(here, "..", "bench", "corpus", "named-projection.json");
const expansionsPath = join(here, "..", "bench", "corpus", "expansions.json");
const floorPath = join(here, "..", "bench", "corpus", "floor.json");
const outPath = join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json");

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as NamedProjection & {
  snapshot: { source: string; digest: string; capturedAt: string };
};

const expansions = readOptional(expansionsPath) as
  | Record<string, { expansions: string[]; expandedBy: string }>
  | undefined;

// The floor is calibrated by `calibrate-floor.ts` against the benchmark's
// unanswerable set and committed as data. The builder folds it in; it never
// invents one.
const floor = readOptional(floorPath) as
  | { floor: number; answerableAdmitted: number; unanswerableRejected: number; goldSetRevision: string; calibratedAt: string; note?: string }
  | undefined;

const index = buildSkillIndex({
  projection: snapshot,
  source: snapshot.snapshot.source,
  sourceDigest: snapshot.snapshot.digest,
  builderVersion: INDEX_BUILDER_VERSION,
  // The index is a deterministic function of the snapshot, so its stamp is the
  // snapshot's capture time. Using "now" would make every CI rebuild a diff.
  generatedAt: snapshot.snapshot.capturedAt,
  ...(expansions ? { expansions } : {}),
});

if (floor) {
  index.stats.floor = floor.floor;
  index.stats.floorCalibration = {
    answerableAdmitted: floor.answerableAdmitted,
    unanswerableRejected: floor.unanswerableRejected,
    goldSetRevision: floor.goldSetRevision,
    calibratedAt: floor.calibratedAt,
    ...(floor.note ? { note: floor.note } : {}),
  };
}

const serialized = `${JSON.stringify(index, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const committed = readOptionalText(outPath);
  if (committed !== serialized) {
    console.error(
      "plugins/skill-heaven/data/skill-index.json is out of date.\n" +
        "Rebuild with: npx tsx packages/core/scripts/build-skill-index.ts",
    );
    process.exit(1);
  }
  console.log(`skill-index.json is up to date (${index.stats.docs} docs).`);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialized);
  console.log(
    [
      `wrote             ${outPath}`,
      `docs              ${index.stats.docs}`,
      `expansion         ${index.builder.expansion}`,
      `unreachable       ${index.stats.unreachable}`,
      `missing tags      ${index.stats.missingTags}`,
      `awaiting class.   ${index.stats.awaitingClassification} (not indexed — invisible to summon)`,
      `floor             ${index.stats.floor ?? "uncalibrated"}`,
    ].join("\n"),
  );
}

function readOptional(path: string): unknown {
  const text = readOptionalText(path);
  return text === undefined ? undefined : JSON.parse(text);
}

function readOptionalText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
