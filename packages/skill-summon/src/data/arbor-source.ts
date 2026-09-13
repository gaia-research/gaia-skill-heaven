// Finding, confining and verifying the cached Arbor publication, offline.
//
// The committed publication is the read path, exactly like the retrieval index:
// an ordinary summon — including a `preview` and a `noMatch` — never reaches the
// network for Arbor, and never edits global configuration. Refreshing the cache
// is a separate, explicit, reviewed step.
//
// Two things this loader must do that a naive reader does not:
//
//   * PHYSICAL confinement. The contract's `skillId` pattern rules out a literal
//     `..` segment, but it says nothing about symlinks. A listed subject
//     directory that is a link to somewhere else would turn bytes outside the
//     declared publication into Arbor evidence, rendered to a caller as though
//     upstream had published it. A shared kernel-enforced no-symlink reader
//     closes the gap between path checks and opening the file.
//   * Digest VERIFICATION. A provenance record naming an upstream commit is only
//     a receipt for the bytes beside it. Unless those bytes are hashed, a cache
//     whose content does not match its own manifest still presents the claimed
//     Tree commit on a public surface.
//
// Nothing in here throws at the caller. Arbor is OPTIONAL enrichment: a missing,
// truncated, unconfined or unverifiable publication degrades to a disclosed
// unknown and leaves retrieval byte-for-byte unchanged (SPEC INV-8).

import { createHash } from "node:crypto";
import { dirname, join, isAbsolute, relative, sep } from "node:path";
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

import { readConfinedArborFile } from "./arbor-file.js";

/** Where the cached publication lives relative to the repository root. */
const ARBOR_RELATIVE_PATH = join("plugins", "skill-heaven", "data", "arbor");

/** The two documents the upstream publisher always emits. */
const EDGE_INDEX_FILE = "edges.json";
const RUNTIME_INDEX_FILE = join("runtime", "index.json");
const PROVENANCE_FILE = "provenance.json";

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

/** One file read out of a publication directory, with its exact bytes' digest. */
type ReadFile = {
  /** Parsed JSON, `null` when the bytes are present but unparseable. */
  value: unknown;
  sha256: string;
};

/** Exported for tests: read and verify a publication from one explicit directory. */
export async function readArborPublicationDir(root: string): Promise<ArborPublication> {
  const problems: ArborProblem[] = [];
  const digests = new Map<string, string>();

  const edgeIndex = await readConfinedJson(root, EDGE_INDEX_FILE, problems);
  const runtimeIndexFile = await readConfinedJson(root, RUNTIME_INDEX_FILE, problems);
  if (edgeIndex === undefined || runtimeIndexFile === undefined) {
    // A directory carrying neither document is not a publication at all; say
    // "unavailable", not "broken". One of the two is a real defect.
    return unavailableArborPublication(
      edgeIndex === undefined && runtimeIndexFile === undefined && problems.length === 0
        ? []
        : [
            ...problems,
            ...(edgeIndex === undefined) !== (runtimeIndexFile === undefined)
              ? [
                  {
                    where: root,
                    detail:
                      "an Arbor publication directory is present but is missing edges.json or runtime/index.json",
                  },
                ]
              : [],
          ],
    );
  }
  digests.set(EDGE_INDEX_FILE, edgeIndex.sha256);
  digests.set(RUNTIME_INDEX_FILE, runtimeIndexFile.sha256);

  // Enumerate subject documents from the listing. The listing is re-validated by
  // the pure reader; this pass only decides which files to open.
  const runtimes: { path: string; document: unknown }[] = [];
  const expected = new Set<string>([EDGE_INDEX_FILE, RUNTIME_INDEX_FILE]);
  try {
    assertArborRuntimeIndex(runtimeIndexFile.value);
    for (const subject of runtimeIndexFile.value.subjects) {
      const relativePath = join("runtime", ...subject.id.split("/"), `${subject.contentSha256}.json`);
      expected.add(relativePath);
      const document = await readConfinedJson(root, relativePath, problems);
      if (document === undefined) {
        problems.push({
          where: relativePath,
          detail: "listed in runtime/index.json but the aggregate document is missing or unreadable",
        });
        continue;
      }
      digests.set(relativePath, document.sha256);
      runtimes.push({ path: relativePath, document: document.value });
    }
  } catch {
    // The listing does not conform. The pure reader reports that precisely; do
    // not guess at a subject set from a document we cannot read.
  }

  const receipt = await verifyProvenance(root, expected, digests, problems);
  if (receipt.rejected) {
    // An unverifiable cache must not keep presenting the upstream commit it
    // claims. Fail the whole publication closed rather than disclose a pin the
    // bytes beside it do not support.
    return {
      ...unavailableArborPublication(problems),
      state: "unreadable",
    };
  }

  const publication = readArborPublication({
    provenance: receipt.provenance,
    runtimeIndex: runtimeIndexFile.value,
    edgeIndex: edgeIndex.value,
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

/**
 * Read one file from inside the publication root.
 *
 * `undefined` means absent (or refused): the caller treats that as "no such
 * file". A `value` of `null` means the bytes were there and did not parse — a
 * real defect, distinct from absence.
 *
 * Confinement is checked against the ROOT's own real path. Ancestors above the
 * root are deliberately not policed: on macOS the system temp directory is
 * itself reached through a symlink, and the question here is whether a listed
 * path escapes the publication, not where the publication was put.
 */
async function readConfinedJson(
  root: string,
  relativePath: string,
  problems: ArborProblem[],
): Promise<ReadFile | undefined> {
  const target = join(root, relativePath);
  try {
    const bytes = await readConfinedArborFile(root, target);
    const digest = createHash("sha256").update(bytes).digest("hex");
    try {
      return { value: JSON.parse(bytes.toString("utf8")) as unknown, sha256: digest };
    } catch {
      return { value: null, sha256: digest };
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      problems.push({ where: relativePath, detail: describe(error) });
    }
    return undefined;
  }
}

type ProvenanceReceipt = {
  provenance: ArborPublicationProvenance | null;
  rejected: boolean;
};

/**
 * Verify the consumer-side provenance record against the bytes beside it.
 *
 * What this proves and what it does not, stated plainly: hashing the cached
 * files against a manifest that ships in the same directory proves the cache is
 * INTERNALLY CONSISTENT. It is a self-supplied receipt. It is not a signature,
 * it is not upstream admission, and it does not establish that the named commit
 * ever published these bytes. It is still worth doing, because without it a
 * cache whose content was swapped keeps presenting a trusted-looking Tree
 * commit on a public surface.
 *
 * A cache with NO provenance is explicitly unauditable and is still consumed;
 * a cache with a provenance record that does not match is refused outright.
 */
async function verifyProvenance(
  root: string,
  expected: ReadonlySet<string>,
  digests: ReadonlyMap<string, string>,
  problems: ArborProblem[],
): Promise<ProvenanceReceipt> {
  const file = await readConfinedJson(root, PROVENANCE_FILE, problems);
  if (file === undefined) {
    problems.push({
      where: PROVENANCE_FILE,
      detail:
        "no provenance record; this cache is UNAUDITABLE — it names no upstream revision and its bytes were not checked against any manifest",
    });
    return { provenance: null, rejected: false };
  }
  const reject = (detail: string): ProvenanceReceipt => {
    problems.push({ where: PROVENANCE_FILE, detail });
    return { provenance: null, rejected: true };
  };
  if (file.value === null || typeof file.value !== "object" || Array.isArray(file.value)) {
    return reject("provenance record is not a JSON object");
  }

  const record = file.value as Record<string, unknown>;
  const upstream = record.upstream;
  const commit = record.commit;
  const path = record.path;
  const capturedAt = record.capturedAt;
  if (typeof upstream !== "string" || upstream.length === 0) {
    return reject("provenance.upstream must be a non-empty string");
  }
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/u.test(commit)) {
    return reject("provenance.commit must be a 40-character commit id");
  }
  if (typeof path !== "string" || path.length === 0) {
    return reject("provenance.path must be a non-empty string");
  }
  if (typeof capturedAt !== "string" || capturedAt.length === 0) {
    return reject("provenance.capturedAt must be a non-empty string");
  }
  if (!record.files || typeof record.files !== "object" || Array.isArray(record.files)) {
    return reject("provenance.files must be an object of path -> sha256");
  }

  const declared = new Map<string, string>();
  for (const [rawPath, digest] of Object.entries(record.files as Record<string, unknown>)) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) {
      return reject(`provenance.files['${rawPath}'] must be a sha256 digest`);
    }
    const normalized = normalizeRelative(rawPath);
    if (normalized === null) {
      return reject(`provenance.files['${rawPath}'] escapes the publication directory`);
    }
    const existing = declared.get(normalized);
    if (existing !== undefined) {
      // Two spellings of one path are conflicting receipts for the same bytes.
      return reject(
        existing === digest
          ? `provenance.files lists '${normalized}' more than once`
          : `provenance.files gives conflicting digests for '${normalized}'`,
      );
    }
    declared.set(normalized, digest);
  }

  for (const [relativePath, digest] of declared) {
    if (!expected.has(relativePath)) {
      return reject(
        `provenance.files declares '${relativePath}', which is not part of this publication`,
      );
    }
    const actual = digests.get(relativePath);
    if (actual === undefined) {
      return reject(`provenance.files declares '${relativePath}', which could not be read`);
    }
    if (actual !== digest) {
      return reject(
        `'${relativePath}' hashes to ${actual}, but the provenance record claims ${digest}`,
      );
    }
  }
  for (const relativePath of expected) {
    if (!declared.has(relativePath)) {
      return reject(`provenance.files does not cover '${relativePath}'`);
    }
  }

  return {
    provenance: { upstream, commit, path, capturedAt, files: Object.fromEntries(declared) },
    rejected: false,
  };
}

/** Normalize a manifest path, or `null` when it escapes or is absolute. */
function normalizeRelative(value: string): string | null {
  if (value.length === 0 || isAbsolute(value)) return null;
  const normalized = relative(".", join(".", value));
  if (normalized.length === 0) return null;
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return null;
  return normalized;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
