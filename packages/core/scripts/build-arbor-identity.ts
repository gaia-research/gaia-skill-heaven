#!/usr/bin/env node
// Derive the canonical IDENTITY CONTEXT for the retrieval corpus, offline, from
// pinned upstream Git bytes.
//
// Why this exists
// ---------------
// Arbor binds every record to `{id, contentSha256}` of the canonical Tree file
// for a skill. The retrieval index carries the id but no content pin, so without
// this artifact the runtime can never prove a candidate IS the subject a
// published Arbor record describes — every join stays unknown, and A2 is only
// ever exercisable by fixtures.
//
// The pin is NOT borrowed by id from a newer revision. It is derived at the
// revision the retrieval corpus was actually built from (`sourceRevision` on the
// committed index), because a hash from another revision would describe other
// bytes. When those two revisions differ, the runtime declines to pin at all.
//
// Two sources, in order:
//
//   1. `docs/graph/installability/index.json` at that revision, when upstream
//      published it — `currentSkillContentSha256` plus `currentSourceRoute`.
//   2. Otherwise a deterministic derivation: `sha256` of the exact bytes of
//      `registry/named/<contributor>/<slug>.md`, the canonical path Arbor's own
//      README specifies, with the source route taken from the named projection
//      at the same revision.
//
// Where both exist they are cross-checked and a disagreement is fatal, so the
// derivation rule cannot silently drift from what upstream publishes.
//
// This reads a local checkout through `git show` only. It never fetches, never
// writes upstream, and never runs an upstream build.
//
// Usage:
//   npx tsx packages/core/scripts/build-arbor-identity.ts --tree <path> [--check]

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ARBOR_IDENTITY_SCHEMA, type ArborIdentityContext } from "../src/arbor/identity.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const indexPath = join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json");
// Deliberately BESIDE the publication cache, not inside it: that directory
// holds upstream bytes plus their receipt, and this is a consumer artifact.
const outputPath = join(repoRoot, "plugins", "skill-heaven", "data", "arbor-identity.json");

const args = process.argv.slice(2);
const check = args.includes("--check");
const treeIndex = args.indexOf("--tree");
const tree = treeIndex >= 0 ? args[treeIndex + 1] : join(repoRoot, "..", "tree-canonical");
if (!tree) throw new Error("--tree <path to a gaia-skill-tree checkout> is required.");

function show(commit: string, path: string): Buffer | undefined {
  try {
    return execFileSync("git", ["-C", tree!, "show", `${commit}:${path}`], {
      maxBuffer: 256 * 1024 * 1024,
      // A path that does not exist at this revision is an ordinary answer here
      // (the installability projection postdates older corpus revisions), not
      // something to print at the operator.
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

const committedIndex = JSON.parse(readFileSync(indexPath, "utf8")) as {
  source: string;
  sourceRevision?: string;
  docs: { id: string; links: { github?: string } }[];
};
const revision = committedIndex.sourceRevision;
if (!revision) {
  throw new Error(
    "The committed retrieval index publishes no sourceRevision, so no identity context can be pinned to it.",
  );
}

// The named projection at the SAME revision gives the canonical source route for
// each id. Using the index's own links instead would make the check circular.
const namedBytes = show(revision, "docs/graph/named/index.json");
if (!namedBytes) {
  throw new Error(`docs/graph/named/index.json does not exist at ${revision} in ${tree}.`);
}
const named = JSON.parse(namedBytes.toString("utf8")) as {
  buckets: Record<string, { id: string; links?: { github?: string } }[]>;
  awaitingClassification?: { id: string; links?: { github?: string } }[];
};
const routeById = new Map<string, string>();
for (const record of [...Object.values(named.buckets).flat(), ...(named.awaitingClassification ?? [])]) {
  const github = record.links?.github;
  if (typeof github === "string" && github.length > 0) routeById.set(record.id, github);
}

// Upstream's installability projection, when it exists at this revision.
const installabilityBytes = show(revision, "docs/graph/installability/index.json");
const installability = installabilityBytes
  ? (JSON.parse(installabilityBytes.toString("utf8")) as {
      skills?: Record<string, { currentSkillContentSha256?: string }>;
    })
  : undefined;

const skills: ArborIdentityContext["skills"] = {};
let derived = 0;
let published = 0;
let unresolved = 0;

for (const doc of committedIndex.docs) {
  const route = routeById.get(doc.id);
  const canonicalPath = `registry/named/${doc.id}.md`;
  const fileBytes = show(revision, canonicalPath);
  const derivedDigest = fileBytes ? createHash("sha256").update(fileBytes).digest("hex") : undefined;
  const publishedDigest = installability?.skills?.[doc.id]?.currentSkillContentSha256;

  if (publishedDigest && derivedDigest && publishedDigest !== derivedDigest) {
    throw new Error(
      `${doc.id}: upstream publishes ${publishedDigest} but sha256(${canonicalPath}) is ${derivedDigest}. ` +
        "The derivation rule no longer matches what upstream publishes; stop and re-read Arbor's README.",
    );
  }
  const contentSha256 = publishedDigest ?? derivedDigest;
  if (!contentSha256 || !route) {
    // No canonical record or no published route at this revision: this id has no
    // provable identity here, and the runtime leaves it unknown rather than
    // guessing one.
    unresolved += 1;
    continue;
  }
  if (publishedDigest) published += 1;
  else derived += 1;
  skills[doc.id] = { contentSha256, sourceUrl: route, canonicalPath };
}

const context: ArborIdentityContext = {
  schema: ARBOR_IDENTITY_SCHEMA,
  upstream: "https://github.com/gaia-research/gaia-skill-tree",
  commit: revision,
  corpusSource: committedIndex.source,
  derivation:
    installability !== undefined
      ? "docs/graph/installability/index.json currentSkillContentSha256, cross-checked against sha256(registry/named/<id>.md)"
      : "sha256(exact bytes of registry/named/<id>.md at this revision), the canonical path registry/arbor/README.md specifies",
  routeSource: "docs/graph/named/index.json links.github at this revision",
  capturedAt: new Date().toISOString().slice(0, 10),
  counts: { indexed: committedIndex.docs.length, resolved: Object.keys(skills).length, unresolved },
  skills,
};

const serialized = `${JSON.stringify(context, null, 2)}\n`;
if (check) {
  const existing = readFileSync(outputPath, "utf8");
  if (existing !== serialized) {
    process.stderr.write("arbor identity context is stale; rerun without --check.\n");
    process.exit(1);
  }
  process.stdout.write(
    `identity.json is up to date (${context.counts.resolved} of ${context.counts.indexed} ids pinned at ${revision}).\n`,
  );
} else {
  writeFileSync(outputPath, serialized);
  process.stdout.write(
    `wrote ${outputPath}: ${context.counts.resolved} pinned (${published} published, ${derived} derived), ` +
      `${unresolved} unresolved, at ${revision}.\n`,
  );
}
