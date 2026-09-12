// Finding the cached Arbor publication on disk, offline.
//
// The committed publication is the read path, exactly like the retrieval index:
// an ordinary summon — including a `preview` and a `noMatch` — never reaches the
// network for Arbor, and never edits global configuration. Refreshing the cache
// is a separate, explicit, reviewed step (`plugins/skill-heaven/data/arbor/
// provenance.json` records which upstream revision the bytes came from).
//
// Nothing in here throws at the caller. Arbor is OPTIONAL enrichment: a missing,
// truncated or malformed publication degrades to a disclosed unknown and leaves
// retrieval byte-for-byte unchanged (SPEC INV-8).

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertArborRuntimeIndex,
  readArborPublication,
  unavailableArborPublication,
  type ArborProblem,
  type ArborPublication,
  type ArborPublicationDocuments,
  type ArborPublicationProvenance,
} from "skill-zero";

/** Where the cached publication lives relative to the repository root. */
const ARBOR_RELATIVE_PATH = join("plugins", "skill-heaven", "data", "arbor");

let cached: Promise<ArborPublication> | undefined;

/**
 * Load the cached Arbor publication. Cached for the process — these are static
 * files and re-reading them per summon buys nothing.
 */
export function loadArborPublication(): Promise<ArborPublication> {
  cached ??= readArborPublicationFromDisk();
  return cached;
}

/** Test seam — drops the process-level cache. */
export function resetArborPublicationCache(): void {
  cached = undefined;
}

/** Exported for tests: read a publication from one explicit directory. */
export async function readArborPublicationDir(root: string): Promise<ArborPublication> {
  const problems: ArborProblem[] = [];

  const runtimeIndex = await readJson(join(root, "runtime", "index.json"));
  const edgeIndex = await readJson(join(root, "edges.json"));
  if (runtimeIndex === undefined || edgeIndex === undefined) {
    // A directory that carries neither of the two documents the publisher always
    // emits is not a publication at all; say "unavailable", not "broken".
    return unavailableArborPublication(
      runtimeIndex === undefined && edgeIndex === undefined
        ? []
        : [
            {
              where: root,
              detail:
                "an Arbor publication directory is present but is missing edges.json or runtime/index.json",
            },
          ],
    );
  }

  const provenance = await readProvenance(join(root, "provenance.json"), problems);

  // Enumerate subject documents from the listing. The listing is re-validated
  // by the pure reader; this pass only decides which files to open, and the
  // contract's own `skillId` pattern is what keeps the join path-safe (no
  // absolute paths, no `..` segment can satisfy it).
  const runtimes: { path: string; document: unknown }[] = [];
  try {
    assertArborRuntimeIndex(runtimeIndex);
    for (const subject of runtimeIndex.subjects) {
      const relative = join("runtime", ...subject.id.split("/"), `${subject.contentSha256}.json`);
      const document = await readJson(join(root, relative));
      if (document === undefined) {
        problems.push({
          where: relative,
          detail: "listed in runtime/index.json but the aggregate document is missing or unreadable",
        });
        continue;
      }
      runtimes.push({ path: relative, document });
    }
  } catch {
    // The listing does not conform. The pure reader reports that precisely; do
    // not guess at a subject set from a document we cannot read.
  }

  const publication = readArborPublication({
    provenance,
    runtimeIndex,
    edgeIndex,
    runtimes,
  } satisfies ArborPublicationDocuments);

  return problems.length === 0
    ? publication
    : { ...publication, problems: [...publication.problems, ...problems] };
}

async function readArborPublicationFromDisk(): Promise<ArborPublication> {
  for (const candidate of candidatePaths()) {
    const publication = await readArborPublicationDir(candidate);
    if (publication.state !== "unavailable" || publication.problems.length > 0) {
      return publication;
    }
  }
  return unavailableArborPublication();
}

function candidatePaths(): string[] {
  const configured = process.env.ARBOR_PUBLICATION_PATH?.trim();
  const here = dirname(fileURLToPath(import.meta.url));
  const paths = configured ? [configured] : [];

  // Bundled: plugins/skill-heaven/mcp/skill-summon.mjs -> ../data/arbor
  paths.push(join(here, "..", "data", "arbor"));

  // Source tree: walk up looking for the plugin directory, so the same code
  // works from packages/skill-summon/src, from a test, and from a worktree.
  let directory = here;
  for (let depth = 0; depth < 8; depth++) {
    paths.push(join(directory, ARBOR_RELATIVE_PATH));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return paths;
}

async function readJson(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Present but unparseable is a real defect; the caller turns it into
    // `unreadable` rather than treating it as absence.
    return null;
  }
}

/**
 * The consumer-side provenance record. It is OURS, not an Arbor contract, so it
 * is validated leniently: a cache with no readable provenance is still consumed,
 * and the surface says the upstream revision is unknown.
 */
async function readProvenance(
  path: string,
  problems: ArborProblem[],
): Promise<ArborPublicationProvenance | null> {
  const value = await readJson(path);
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    problems.push({
      where: "provenance.json",
      detail: "no readable provenance record; the cached publication cannot be audited to an upstream revision",
    });
    return null;
  }
  const record = value as Record<string, unknown>;
  const upstream = stringOr(record.upstream, "unknown");
  const commit = stringOr(record.commit, "unknown");
  const pathField = stringOr(record.path, "unknown");
  const capturedAt = stringOr(record.capturedAt, "unknown");
  const files: Record<string, string> = {};
  if (record.files && typeof record.files === "object" && !Array.isArray(record.files)) {
    for (const [key, digest] of Object.entries(record.files as Record<string, unknown>)) {
      if (typeof digest === "string") files[key] = digest;
    }
  }
  return { upstream, commit, path: pathField, capturedAt, files };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
