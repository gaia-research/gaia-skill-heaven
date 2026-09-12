// The canonical identity context: what this runtime can PROVE about a candidate
// before it asks Arbor anything.
//
// Arbor binds every record to `{id, contentSha256}` of a skill's canonical Tree
// file. The retrieval index carries the id and nothing else, so a consumer with
// only the index can never prove a candidate is the subject a record describes.
// This artifact closes that gap with bytes, not assumptions.
//
// The two rules that make it honest, and that the loader enforces:
//
//   * The pin is bound to the CANDIDATE'S OWN registry revision. A hash derived
//     at a different Tree revision describes different bytes, so borrowing one
//     by id — including from a newer Arbor publication — would manufacture a
//     match. When the corpus revision and the identity revision disagree, the
//     runtime supplies no pin at all.
//   * The canonical source route must match too. An id is mutable upstream and
//     is not, on its own, a source.
//
// This is consumer cache metadata. It is NOT an Arbor ontology, it adds no field
// to any upstream contract, and it never becomes evidence of behavior — it only
// answers "which published subject, if any, is this candidate".

export const ARBOR_IDENTITY_SCHEMA = "skill-heaven.arbor-identity-context/v1" as const;

export type ArborIdentityEntry = {
  /** sha256 of the exact canonical Tree file bytes at `commit`. */
  contentSha256: string;
  /** The canonical source route published for this id at `commit`. */
  sourceUrl: string;
  /** The canonical path the digest was taken from, for audit. */
  canonicalPath: string;
};

export type ArborIdentityContext = {
  schema: typeof ARBOR_IDENTITY_SCHEMA;
  upstream: string;
  /** The Tree revision these pins were taken at. Must equal the corpus revision. */
  commit: string;
  /** The retrieval corpus source this context was built for. */
  corpusSource: string;
  /** How each `contentSha256` was obtained, in words, for audit. */
  derivation: string;
  /** Where each `sourceUrl` was read from, at the same revision. */
  routeSource: string;
  capturedAt: string;
  counts: { indexed: number; resolved: number; unresolved: number };
  skills: Record<string, ArborIdentityEntry>;
};

export class ArborIdentityError extends Error {
  override readonly name = "ArborIdentityError";
}

/**
 * Why a candidate carries no canonical pin. Every value is a form of unknown —
 * none of them denies anything about the skill.
 */
export type ArborIdentityMiss =
  /** No identity context is available to this runtime. */
  | "no-identity-context"
  /**
   * The context was pinned at a different Tree revision than the corpus the
   * candidate came from. Borrowing the hash across revisions would be a guess.
   */
  | "revision-mismatch"
  /** The context pins nothing for this id at that revision. */
  | "id-not-pinned"
  /** The candidate's source route is not the canonical one recorded for that id. */
  | "source-route-mismatch";

export type ArborIdentityResolution =
  | { pinned: true; contentSha256: string; entry: ArborIdentityEntry }
  | { pinned: false; miss: ArborIdentityMiss };

export type ArborIdentityQuery = {
  skillId: string;
  /** The candidate's own source link, as the retrieval corpus published it. */
  sourceUrl: string | undefined;
  /** The Tree revision the retrieval corpus was built from, when it publishes one. */
  corpusRevision: string | null;
};

/**
 * Resolve one candidate's canonical content pin.
 *
 * Deliberately strict and deliberately silent about everything else: it answers
 * only "which exact canonical bytes is this candidate", and a miss is always
 * unknown, never a judgement.
 */
export function resolveArborIdentity(
  context: ArborIdentityContext | null,
  query: ArborIdentityQuery,
): ArborIdentityResolution {
  if (context === null) return { pinned: false, miss: "no-identity-context" };
  // The central rule: the pin must come from the candidate's OWN revision.
  if (query.corpusRevision === null || query.corpusRevision !== context.commit) {
    return { pinned: false, miss: "revision-mismatch" };
  }
  const entry = context.skills[query.skillId];
  if (entry === undefined) return { pinned: false, miss: "id-not-pinned" };
  if (query.sourceUrl === undefined || query.sourceUrl !== entry.sourceUrl) {
    return { pinned: false, miss: "source-route-mismatch" };
  }
  return { pinned: true, contentSha256: entry.contentSha256, entry };
}

/** One sentence for a disclosure surface. */
export function describeArborIdentityMiss(miss: ArborIdentityMiss): string {
  switch (miss) {
    case "no-identity-context":
      return "this runtime holds no canonical identity context, so no content pin could be proven";
    case "revision-mismatch":
      return "the canonical identity context was pinned at a different Tree revision than this corpus; a hash from another revision describes other bytes, so none was used";
    case "id-not-pinned":
      return "the canonical identity context pins no content for this id at the corpus revision";
    case "source-route-mismatch":
      return "this candidate's source route is not the canonical route recorded for that id, so a matching id would not prove the same skill";
  }
}

/** Structural validation of a decoded identity context. */
export function assertArborIdentityContext(
  value: unknown,
  label = "Arbor identity context",
): asserts value is ArborIdentityContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArborIdentityError(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== ARBOR_IDENTITY_SCHEMA) {
    throw new ArborIdentityError(
      `${label} advertises unsupported schema ${String(record.schema)}; this build reads ${ARBOR_IDENTITY_SCHEMA}.`,
    );
  }
  for (const key of ["upstream", "corpusSource", "derivation", "routeSource", "capturedAt"]) {
    if (typeof record[key] !== "string" || (record[key] as string).length === 0) {
      throw new ArborIdentityError(`${label}.${key} must be a non-empty string.`);
    }
  }
  if (typeof record.commit !== "string" || !/^[a-f0-9]{40}$/u.test(record.commit)) {
    throw new ArborIdentityError(`${label}.commit must be a 40-character commit id.`);
  }
  if (!record.skills || typeof record.skills !== "object" || Array.isArray(record.skills)) {
    throw new ArborIdentityError(`${label}.skills must be an object.`);
  }
  for (const [id, entry] of Object.entries(record.skills as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ArborIdentityError(`${label}.skills['${id}'] must be an object.`);
    }
    const fields = entry as Record<string, unknown>;
    if (typeof fields.contentSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(fields.contentSha256)) {
      throw new ArborIdentityError(`${label}.skills['${id}'].contentSha256 must be a sha256 digest.`);
    }
    for (const key of ["sourceUrl", "canonicalPath"]) {
      if (typeof fields[key] !== "string" || (fields[key] as string).length === 0) {
        throw new ArborIdentityError(`${label}.skills['${id}'].${key} must be a non-empty string.`);
      }
    }
  }
}
