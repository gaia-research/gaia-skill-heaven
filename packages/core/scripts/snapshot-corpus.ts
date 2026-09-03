// Refresh the committed corpus snapshot the index builder and the benchmark
// read (PLAN 0.5, 1.2).
//
//   npx tsx packages/core/scripts/snapshot-corpus.ts
//
// Network is used HERE and only here. Everything downstream — the index build,
// the benchmark, the runtime — reads the committed snapshot, which is what
// makes offline-first structural rather than best-effort (INTENT §3).
//
// The snapshot is trimmed to the fields retrieval actually reads. Timelines and
// evidence bodies are ~4x the bytes and change on every curation pass; carrying
// them would make every refresh an unreviewable diff.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, type NamedProjection, type ProjectionSkill } from "../src/retrieval/build-index.js";

const NAMED_URL =
  process.env.GAIA_NAMED_PROJECTION_URL ?? "https://gaiaskilltree.com/graph/named/index.json";
const SOURCE_ROOT = new URL(NAMED_URL).origin;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "bench", "corpus");

const response = await fetch(NAMED_URL, { headers: { accept: "application/json" } });
if (!response.ok) {
  throw new Error(`Could not fetch ${NAMED_URL}: HTTP ${response.status}`);
}
const bytes = await response.text();
const digest = sha256(bytes);
const upstream = JSON.parse(bytes) as {
  generatedAt?: string;
  buckets: Record<string, ProjectionSkill[]>;
  awaitingClassification?: ProjectionSkill[];
};

const snapshot: NamedProjection & {
  snapshot: { url: string; source: string; digest: string; capturedAt: string };
} = {
  snapshot: {
    url: NAMED_URL,
    source: SOURCE_ROOT,
    digest,
    capturedAt: new Date().toISOString(),
  },
  ...(upstream.generatedAt ? { generatedAt: upstream.generatedAt } : {}),
  buckets: Object.fromEntries(
    Object.entries(upstream.buckets ?? {})
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([bucket, skills]) => [bucket, skills.map(trim).sort(byId)]),
  ),
  awaitingClassification: (upstream.awaitingClassification ?? []).map(trim).sort(byId),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "named-projection.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

const bucketed = Object.values(snapshot.buckets).flat();
console.log(
  [
    `source            ${NAMED_URL}`,
    `digest            ${digest}`,
    `buckets           ${Object.keys(snapshot.buckets).length}`,
    `bucketed skills   ${bucketed.length}`,
    `awaiting class.   ${snapshot.awaitingClassification?.length ?? 0}`,
    `missing tags      ${bucketed.filter((skill) => (skill.tags ?? []).length === 0).length}`,
  ].join("\n"),
);

function trim(skill: ProjectionSkill): ProjectionSkill {
  const links = skill.links ?? {};
  return {
    id: skill.id,
    name: skill.name,
    ...(skill.title ? { title: skill.title } : {}),
    ...(skill.contributor ? { contributor: skill.contributor } : {}),
    ...(skill.genericSkillRef ? { genericSkillRef: skill.genericSkillRef } : {}),
    ...(skill.catalogRef ? { catalogRef: skill.catalogRef } : {}),
    description: skill.description ?? "",
    tags: [...(skill.tags ?? [])],
    ...(skill.level ? { level: skill.level } : {}),
    ...(skill.status ? { status: skill.status } : {}),
    ...(skill.invocation ? { invocation: skill.invocation } : {}),
    ...(skill.overallTrustGrade ? { overallTrustGrade: skill.overallTrustGrade } : {}),
    ...(skill.trustMagnitude === undefined ? {} : { trustMagnitude: skill.trustMagnitude }),
    links: {
      ...(typeof links.github === "string" ? { github: links.github } : {}),
      ...(links.installable === false ? { installable: false } : {}),
    },
  };
}

function byId(left: ProjectionSkill, right: ProjectionSkill): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
