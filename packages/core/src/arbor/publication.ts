// Reading a published Arbor projection, offline and fail-soft.
//
// The upstream site publisher emits exactly three kinds of file under
// `docs/graph/arbor/`:
//
//   edges.json              gaia.arbor-edge-index/v1
//   runtime/index.json      gaia.arbor-runtime-index/v1 (subject listing)
//   runtime/<id…>/<sha>.json  gaia.arbor-runtime/v1 (one aggregate per subject)
//
// This module turns already-read bytes into validated runtime state. It does no
// I/O and no network: the loader that finds the files lives in the consuming
// package, and a summon must never block on a fetch (SPEC §3.3).
//
// Nothing here is fatal to the caller. A malformed or absent publication is
// OPTIONAL enrichment: it degrades to a disclosed unknown, and retrieval
// succeeds exactly as it did before (SPEC INV-8).

import {
  ARBOR_EDGE_INDEX_SCHEMA,
  ARBOR_PROFILE_SCHEMA,
  ARBOR_RUNTIME_INDEX_SCHEMA,
  ARBOR_RUNTIME_SCHEMA,
  type ArborEdgeIndex,
  type ArborRuntime,
  type ArborSubjectRef,
} from "./contract.js";
import {
  ArborContractError,
  assertArborEdgeIndex,
  assertArborProfile,
  assertArborRuntime,
  assertArborRuntimeIndex,
} from "./validate.js";

/**
 * Where the committed copy of the publication came from. This is CONSUMER
 * provenance — our own record of which upstream bytes we cached — not an Arbor
 * contract field, and it is never mistaken for one.
 */
export type ArborPublicationProvenance = {
  /** Upstream repository the publication was read from. */
  upstream: string;
  /** Immutable upstream revision. Absent means we cannot prove which revision. */
  commit: string;
  /** Path within that repository. */
  path: string;
  /** When the copy was taken, as an ISO 8601 date. */
  capturedAt: string;
  /** sha256 of each cached file's exact bytes, keyed by relative path. */
  files: Record<string, string>;
};

/** One disclosed defect. Never thrown at the caller; always surfaced. */
export type ArborProblem = {
  where: string;
  detail: string;
};

export type ArborPublicationDocuments = {
  provenance: ArborPublicationProvenance | null;
  /** Parsed `runtime/index.json`. */
  runtimeIndex: unknown;
  /** Parsed `edges.json`. */
  edgeIndex: unknown;
  /** Parsed per-subject runtime aggregates, with the path they were read from. */
  runtimes: readonly { path: string; document: unknown }[];
};

export type ArborPublicationState =
  /** Files were found and the contract documents validated. */
  | "loaded"
  /** No publication is configured or present. Nothing to consume. */
  | "unavailable"
  /** A publication was found but its top-level documents do not conform. */
  | "unreadable";

export type ArborPublication = {
  state: ArborPublicationState;
  provenance: ArborPublicationProvenance | null;
  /** The subjects the publication lists. Empty is a real, honest answer. */
  subjects: readonly ArborSubjectRef[];
  /** Validated per-subject aggregates, keyed by `id@contentSha256`. */
  runtimes: ReadonlyMap<string, ArborRuntime>;
  edgeIndex: ArborEdgeIndex | null;
  /** Subjects listed in the index whose aggregate document is missing or invalid. */
  problems: readonly ArborProblem[];
  /** The contract ids this build reads. Printed so a surface can be audited. */
  contracts: {
    runtimeIndex: typeof ARBOR_RUNTIME_INDEX_SCHEMA;
    runtime: typeof ARBOR_RUNTIME_SCHEMA;
    profile: typeof ARBOR_PROFILE_SCHEMA;
    edgeIndex: typeof ARBOR_EDGE_INDEX_SCHEMA;
  };
};

const CONTRACTS = {
  runtimeIndex: ARBOR_RUNTIME_INDEX_SCHEMA,
  runtime: ARBOR_RUNTIME_SCHEMA,
  profile: ARBOR_PROFILE_SCHEMA,
  edgeIndex: ARBOR_EDGE_INDEX_SCHEMA,
} as const;

/** The key a subject pin is stored under. Identity is `id` AND exact bytes. */
export function subjectKey(subject: ArborSubjectRef): string {
  return `${subject.id}@${subject.contentSha256}`;
}

/** An empty, honest publication — the state when nothing is configured. */
export function unavailableArborPublication(
  problems: readonly ArborProblem[] = [],
): ArborPublication {
  return {
    state: "unavailable",
    provenance: null,
    subjects: [],
    runtimes: new Map(),
    edgeIndex: null,
    problems,
    contracts: CONTRACTS,
  };
}

/**
 * Validate a set of already-read publication documents.
 *
 * The two top-level documents fail closed together: if the subject listing or
 * the edge index does not conform, this build cannot say what the publication
 * contains, so it reports `unreadable` rather than consuming half of it. A
 * single BAD SUBJECT, by contrast, degrades only that subject — the rest of the
 * publication is still readable and is still consumed.
 */
export function readArborPublication(
  documents: ArborPublicationDocuments | null,
): ArborPublication {
  if (documents === null) return unavailableArborPublication();

  const problems: ArborProblem[] = [];

  let runtimeIndex;
  try {
    assertArborRuntimeIndex(documents.runtimeIndex, "runtime/index.json");
    runtimeIndex = documents.runtimeIndex;
  } catch (error) {
    return {
      ...unavailableArborPublication([
        { where: "runtime/index.json", detail: describe(error) },
      ]),
      state: "unreadable",
      provenance: documents.provenance,
    };
  }

  let edgeIndex: ArborEdgeIndex;
  try {
    assertArborEdgeIndex(documents.edgeIndex, "edges.json");
    edgeIndex = documents.edgeIndex;
  } catch (error) {
    return {
      ...unavailableArborPublication([{ where: "edges.json", detail: describe(error) }]),
      state: "unreadable",
      provenance: documents.provenance,
    };
  }

  const runtimes = new Map<string, ArborRuntime>();
  for (const { path, document } of documents.runtimes) {
    try {
      assertArborRuntime(document, path);
    } catch (error) {
      problems.push({ where: path, detail: describe(error) });
      continue;
    }
    // The embedded profile is typed `object|null` by the runtime contract, so
    // it is checked against the PROFILE contract here. A profile that does not
    // conform degrades its own lens (the reader marks it) without discarding
    // the subject's other two lenses.
    const claimsLens = document.lenses.claims;
    if (claimsLens.profile !== null) {
      try {
        assertArborProfile(claimsLens.profile, `${path} lenses.claims.profile`);
      } catch (error) {
        problems.push({ where: `${path} lenses.claims.profile`, detail: describe(error) });
        // Mark it unreadable for this consumer WITHOUT rewriting the upstream
        // status: `profile: null` with a preserved status is how the join layer
        // learns the payload could not be read.
        runtimes.set(subjectKey(document.subject), {
          ...document,
          lenses: {
            ...document.lenses,
            claims: { ...claimsLens, profile: null },
          },
        });
        continue;
      }
    }
    // Upstream's own interpretation rule (registry/arbor/README.md): a claim
    // stays `expert-declared` unless an explicit governed interpretation source
    // set it. A document that contradicts that is disclosed — the claims are
    // still passed through verbatim, because rewriting them would be worse.
    for (const claim of claimsLens.profile?.claims ?? []) {
      const governed = claim.interpretationSource !== null;
      if (governed === (claim.support === "expert-declared")) {
        problems.push({
          where: `${path} lenses.claims.profile claim '${claim.id}'`,
          detail: governed
            ? "support is 'expert-declared' but a governed interpretationSource is present"
            : `support is '${claim.support}' with no interpretationSource; only a governed interpretation may set it`,
        });
      }
    }
    runtimes.set(subjectKey(document.subject), document);
  }

  for (const subject of runtimeIndex.subjects) {
    if (!runtimes.has(subjectKey(subject))) {
      problems.push({
        where: subjectKey(subject),
        detail: "listed in runtime/index.json but no readable aggregate document was found",
      });
    }
  }

  return {
    state: "loaded",
    provenance: documents.provenance,
    subjects: runtimeIndex.subjects,
    runtimes,
    edgeIndex,
    problems,
    contracts: CONTRACTS,
  };
}

function describe(error: unknown): string {
  if (error instanceof ArborContractError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
