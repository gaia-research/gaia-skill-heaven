// Refresh the committed corpus snapshot the index builder and the benchmark
// read (PLAN 0.5, 1.2).
//
//   npx tsx packages/core/scripts/snapshot-corpus.ts
//
// Network is used HERE and only here for the moving-source path. A controlled
// refresh may instead pass --source-file from an immutable upstream checkout;
// that path is required for pinned release data and never contacts the network.
// Everything downstream — the index build, the benchmark, the runtime — reads
// the committed snapshot, which is what makes offline-first structural rather
// than best-effort (INTENT §3).
//
// The snapshot is trimmed to the fields retrieval actually reads. Timelines and
// evidence bodies are ~4x the bytes and change on every curation pass; carrying
// them would make every refresh an unreviewable diff.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, type NamedProjection, type ProjectionSkill } from "../src/retrieval/build-index.js";

const NAMED_URL =
  process.env.GAIA_NAMED_PROJECTION_URL ?? "https://gaiaskilltree.com/graph/named/index.json";
const SOURCE_ROOT = new URL(NAMED_URL).origin;
const sourceFile = argValue("--source-file");
const sourceRevision = argValue("--source-revision");
const sourceVersion = argValue("--source-version");
const sourceWorkflow = argValue("--source-workflow");

if (sourceFile && !sourceRevision) {
  throw new Error("--source-file requires --source-revision so the refresh is auditable.");
}
if (!sourceFile && (sourceRevision || sourceVersion || sourceWorkflow)) {
  throw new Error("--source-revision/--source-version/--source-workflow require --source-file.");
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "bench", "corpus");
const bytes = sourceFile
  ? readFileSync(sourceFile, "utf8")
  : await fetchProjection(NAMED_URL);
const digest = sha256(bytes);
const upstream = JSON.parse(bytes) as {
  generatedAt?: string;
  buckets: Record<string, ProjectionSkill[]>;
  awaitingClassification?: ProjectionSkill[];
};

const snapshot: NamedProjection & {
  snapshot: {
    url: string;
    source: string;
    digest: string;
    capturedAt: string;
    sourceRevision?: string;
    sourceVersion?: string;
    sourceWorkflow?: string;
  };
} = {
  snapshot: {
    url: NAMED_URL,
    source: SOURCE_ROOT,
    digest,
    capturedAt: new Date().toISOString(),
    ...(sourceRevision ? { sourceRevision } : {}),
    ...(sourceVersion ? { sourceVersion } : {}),
    ...(sourceWorkflow ? { sourceWorkflow } : {}),
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
    ...(sourceRevision ? [`revision          ${sourceRevision}`] : []),
    ...(sourceVersion ? [`version           ${sourceVersion}`] : []),
    ...(sourceWorkflow ? [`workflow          ${sourceWorkflow}`] : []),
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
    // A suite root carries no link of its own; its components do. Dropping
    // this field made every suite look uninstallable.
    ...(skill.suiteComponents?.length ? { suiteComponents: [...skill.suiteComponents] } : {}),
    ...(skill.installable === false ? { installable: false } : {}),
    links: {
      ...(typeof links.github === "string" ? { github: links.github } : {}),
      ...(links.installable === false ? { installable: false } : {}),
    },
  };
}

function byId(left: ProjectionSkill, right: ProjectionSkill): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function fetchProjection(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}
