// The R3 human-adjudication overlay (PLAN Lane R, 2026-09-29).
//
// The 100-label gold set was written by LLM subagents, not by a human, and that
// provenance is not going to change. What changes here is that the *human*
// part is now a first-class, separately versioned, machine-checkable artifact
// instead of a requirement that could only be satisfied by pretending 100
// labels were adjudicated when 55 were.
//
// Three rules this file exists to enforce:
//
//   1. `gold.jsonl` and `unanswerable.jsonl` are never rewritten. The
//      historical set is evidence; a correction is a new versioned record, not
//      an edit of the old one.
//   2. `uncertain` is a first-class outcome. A human who said "unsure" is not
//      a human who said "wrong", and is emphatically not a human who said
//      "right". Uncertain rows are counted, never scored.
//   3. Nothing here reads a threshold, a floor, or an admission policy. This
//      overlay is measurement only; retrieval does not load it.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mean, recallAt } from "../src/retrieval/metrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const adjudicationDir = join(here, "adjudication");

/**
 * `reviewed` — a human confirmed the machine label.
 * `corrected` — a human rejected it; `betterSkillId` may name a replacement.
 * `uncertain` — a human was unsure. Never coerced either way.
 * `unreviewed` — derived as the absence of a row. Never written.
 */
export type AdjudicationState = "reviewed" | "corrected" | "uncertain" | "unreviewed";

export type AdjudicationRow = {
  caseId: string;
  kind: "gold" | "unanswerable";
  index: number;
  querySha256: string;
  labeledSkillId: string | null;
  state: Exclude<AdjudicationState, "unreviewed">;
  verdict: "suitable" | "unsuitable" | "ambiguous";
  betterSkillId: string | null;
  adjudicatedBy: string;
  adjudicatedAt: string;
  note: string | null;
};

export type AdjudicationProvenance = {
  schema: string;
  overlay: string;
  createdAt: string;
  pins: { goldBlob: string; unanswerableBlob: string; overlaySha256: string; heavenRev: string };
  historicalLabelsModified: false;
  sourceSnapshot: { schema: string; lockedAt: string; sha256: string; path: string; origin: string; note: string };
  verdictMeaning: Record<string, Record<string, string>>;
  stateMapping: Record<AdjudicationState, string>;
  counts: {
    gold: Record<AdjudicationState, number> & { total: number };
    unanswerable: Record<AdjudicationState, number> & { total: number };
  };
  claimLimits: string[];
};

export class AdjudicationError extends Error {}

export function assertUtcTimestamp(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    throw new AdjudicationError(`${label} must be an ISO-8601 UTC timestamp`);
  }
  const date = new Date(value);
  const fraction = value.match(/\.(\d{1,3})Z$/)?.[1] ?? "";
  const normalized = value.replace(/(\.\d{1,3})?Z$/, `.${fraction.padEnd(3, "0")}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized) {
    throw new AdjudicationError(`${label} is not a valid UTC timestamp`);
  }
}

/**
 * The on-disk shape before validation. The overlay is committed data, but it is
 * still a file someone can edit, so `state` arrives as a plain string and is
 * checked rather than trusted.
 */
type UnvalidatedRow = Omit<AdjudicationRow, "state" | "kind" | "index"> & {
  state: string;
  kind: unknown;
  index: unknown;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha1(bytes: Uint8Array): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, Buffer.from(bytes)])).digest("hex");
}

function readJsonl<T>(bytes: Uint8Array): T[] {
  return Buffer.from(bytes)
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as T);
}

export type AdjudicationArtifactBytes = {
  goldBytes: Uint8Array;
  unanswerableBytes: Uint8Array;
  overlayBytes: Uint8Array;
  snapshotBytes: Uint8Array;
};

export function assertAdjudicationArtifacts(
  provenance: AdjudicationProvenance,
  bytes: AdjudicationArtifactBytes,
): void {
  if (gitBlobSha1(bytes.goldBytes) !== provenance.pins.goldBlob) {
    throw new AdjudicationError("gold.jsonl bytes do not match the pinned git blob");
  }
  if (gitBlobSha1(bytes.unanswerableBytes) !== provenance.pins.unanswerableBlob) {
    throw new AdjudicationError("unanswerable.jsonl bytes do not match the pinned git blob");
  }
  if (sha256(bytes.overlayBytes) !== provenance.pins.overlaySha256) {
    throw new AdjudicationError("adjudication overlay bytes do not match the pinned SHA-256");
  }
  if (sha256(bytes.snapshotBytes) !== provenance.sourceSnapshot.sha256) {
    throw new AdjudicationError("review snapshot bytes do not match the pinned SHA-256");
  }
}

const WRITABLE_STATES: readonly AdjudicationRow["state"][] = [
  "reviewed",
  "corrected",
  "uncertain",
];

export type AdjudicationOverlay = {
  rows: AdjudicationRow[];
  provenance: AdjudicationProvenance;
  /** state by `kind-index`, with `unreviewed` filled in for every absent case. */
  byCase: Map<string, AdjudicationRow | null>;
  /** Size of the unanswerable set this overlay was bound to. */
  unanswerableCount: number;
};

/**
 * Load the overlay and bind every row to the committed historical set.
 *
 * Binding is by case id (kind + 1-based position) and is verified two ways:
 * the query text must hash to the recorded digest, and a gold row's
 * `labeledSkillId` must equal the committed label. A mismatch means the
 * historical set moved under the overlay, which invalidates the adjudication
 * — so it throws rather than quietly scoring against a shifted baseline.
 */
export function loadAdjudication(
  gold: readonly { query: string; skillId: string }[],
  unanswerable: readonly { query: string }[],
  historicalBytes: Pick<AdjudicationArtifactBytes, "goldBytes" | "unanswerableBytes">,
): AdjudicationOverlay {
  const provenance = JSON.parse(
    readFileSync(join(adjudicationDir, "provenance.json"), "utf8"),
  ) as AdjudicationProvenance;
  if (provenance.schema !== "gaia.skill-heaven-bench-adjudication-provenance/v1") {
    throw new AdjudicationError(`unknown adjudication provenance schema ${provenance.schema}`);
  }
  if (provenance.historicalLabelsModified !== false) {
    throw new AdjudicationError("overlay claims the historical labels were modified; they never are");
  }
  assertUtcTimestamp("provenance.createdAt", provenance.createdAt);
  assertUtcTimestamp("sourceSnapshot.lockedAt", provenance.sourceSnapshot.lockedAt);

  const overlayBytes = readFileSync(join(adjudicationDir, provenance.overlay));
  const snapshotBytes = readFileSync(join(adjudicationDir, provenance.sourceSnapshot.path));
  assertAdjudicationArtifacts(provenance, { ...historicalBytes, overlayBytes, snapshotBytes });
  const rows = readJsonl<UnvalidatedRow>(overlayBytes);
  const byCase = validateAdjudicationRows(rows, gold, unanswerable);

  for (const pool of [
    { kind: "gold" as const, rows: gold },
    { kind: "unanswerable" as const, rows: unanswerable },
  ]) {
    for (let position = 0; position < pool.rows.length; position += 1) {
      const caseId = `${pool.kind}-${String(position + 1).padStart(3, "0")}`;
      if (!byCase.has(caseId)) byCase.set(caseId, null);
    }
  }

  return { rows: rows as AdjudicationRow[], provenance, byCase, unanswerableCount: unanswerable.length };
}

export type AdjudicatedScores = {
  /**
   * Human-confirmed labels only. This is the ONE subset over which an absolute
   * label-derived claim may be stated. n is small and disclosed.
   */
  reviewed: { n: number; mrr: number; recallAt5: number };
  /**
   * Every human-confirmed label, plus every replacement a human actually named
   * that resolves to a real skill id in the committed corpus. A named
   * alternative that is free prose ("pbakaus/impeccable or taste-skill") can
   * never match a ranked id, so it is counted in
   * `namedAlternativeUnresolvable` and kept out of the denominator rather than
   * added as a guaranteed zero.
   */
  resolved: { n: number; mrr: number; recallAt5: number };
  /** Counted, never scored. */
  uncertain: number;
  /** No human judgment exists. Never scored. */
  unreviewed: number;
  corrected: number;
  /** A human named an alternative that is not a resolvable skill id. Never scored. */
  namedAlternativeUnresolvable: number;
  /**
   * The same four-state partition over the unanswerable set, so both halves of
   * the review are machine-checked rather than asserted in a JSON file. The
   * refusal rate itself is unchanged: adjudication annotates the set, it does
   * not re-label it.
   */
  unanswerable: { reviewed: number; corrected: number; uncertain: number; unreviewed: number };
};

/** A fresh object every call. A module-level constant here would alias. */
function emptyScores(): AdjudicatedScores {
  return {
    reviewed: { n: 0, mrr: 0, recallAt5: 0 },
    resolved: { n: 0, mrr: 0, recallAt5: 0 },
    uncertain: 0,
    unreviewed: 0,
    corrected: 0,
    namedAlternativeUnresolvable: 0,
    unanswerable: { reviewed: 0, corrected: 0, uncertain: 0, unreviewed: 0 },
  };
}

/**
 * Score one system against the overlay.
 *
 * `rankedByCase` maps `caseId` to that system's top-10 ids for that query, so
 * this stays a pure measurement of rankings already produced — it never ranks,
 * filters, or re-orders anything.
 *
 * `corpusIds` is the committed corpus's id set. A `betterSkillId` outside it is
 * prose, not an alternative, and is refused a denominator slot.
 *
 * **The state dispatch default-rejects.** Only an explicit `reviewed` row scores
 * as human-confirmed. Any other value — including one this build does not
 * recognise, or a row forged into the map by a caller that skipped the loader —
 * is counted in its own bucket and never scores. The property this lane was
 * pivoted to protect cannot depend on a fall-through.
 */
export function scoreAdjudicated(
  overlay: AdjudicationOverlay,
  gold: readonly { query: string; skillId: string }[],
  rankedByCase: ReadonlyMap<string, string[]>,
  corpusIds: ReadonlySet<string> = new Set(),
): AdjudicatedScores {
  const result = emptyScores();
  const reviewedRR: number[] = [];
  const reviewedHits: { ranked: string[]; correctId: string }[] = [];
  const resolvedRR: number[] = [];
  const resolvedHits: { ranked: string[]; correctId: string }[] = [];

  const score = (ranked: readonly string[], correctId: string): number => {
    const rank = ranked.indexOf(correctId) + 1;
    return rank === 0 ? 0 : 1 / rank;
  };

  for (let position = 0; position < gold.length; position += 1) {
    const caseId = `gold-${String(position + 1).padStart(3, "0")}`;
    const row = overlay.byCase.get(caseId) ?? null;
    const ranked = rankedByCase.get(caseId) ?? [];

    if (row === null) {
      result.unreviewed += 1;
      continue;
    }
    // An alternative only earns a denominator slot if it is a real skill id.
    // Naming one is a note; it is not a relabelling.
    const resolvable = row.betterSkillId !== null && corpusIds.has(row.betterSkillId);
    if (row.betterSkillId !== null && !resolvable) {
      result.namedAlternativeUnresolvable += 1;
    }

    if (row.state === "uncertain") {
      result.uncertain += 1;
      continue;
    }
    if (row.state === "corrected") {
      result.corrected += 1;
      // The rejected label is never a correct answer. Only the replacement the
      // human named, and only if it resolves, scores here.
      if (resolvable) {
        const rr = score(ranked, row.betterSkillId as string);
        resolvedRR.push(rr);
        resolvedHits.push({ ranked: [...ranked], correctId: row.betterSkillId as string });
      }
      continue;
    }
    if (row.state !== "reviewed") {
      // Unreachable through loadAdjudication. Reachable if a caller forges a row
      // past the loader, which is exactly why it is handled rather than assumed.
      continue;
    }
    const rr = score(ranked, gold[position].skillId);
    reviewedRR.push(rr);
    reviewedHits.push({ ranked: [...ranked], correctId: gold[position].skillId });
    // `resolved` is `reviewed` PLUS the named replacements, so a confirmed label
    // still scores here. A human who confirmed a label and also named an
    // alternative did not retract the confirmation.
    resolvedRR.push(rr);
    resolvedHits.push({ ranked: [...ranked], correctId: gold[position].skillId });
    if (resolvable) {
      const rr2 = score(ranked, row.betterSkillId as string);
      resolvedRR.push(rr2);
      resolvedHits.push({ ranked: [...ranked], correctId: row.betterSkillId as string });
    }
  }

  for (let position = 0; position < overlay.unanswerableCount; position += 1) {
    const caseId = `unanswerable-${String(position + 1).padStart(3, "0")}`;
    const row = overlay.byCase.get(caseId) ?? null;
    if (row === null) {
      result.unanswerable.unreviewed += 1;
    } else if (row.state === "uncertain") {
      result.unanswerable.uncertain += 1;
    } else if (row.state === "corrected") {
      result.unanswerable.corrected += 1;
    } else if (row.state === "reviewed") {
      result.unanswerable.reviewed += 1;
    } else {
      result.unanswerable.unreviewed += 1;
    }
  }

  result.reviewed = {
    n: reviewedRR.length,
    mrr: round4(mean(reviewedRR)),
    recallAt5: round4(recallAt(reviewedHits, 5)),
  };
  result.resolved = {
    n: resolvedRR.length,
    mrr: round4(mean(resolvedRR)),
    recallAt5: round4(recallAt(resolvedHits, 5)),
  };
  return result;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Validate overlay rows against the committed historical sets and return the
 * case map.
 *
 * Exported so the rules are testable without writing to the repository: a test
 * can hand it a forged row and see it refused, with no scratch copy on disk.
 */
export function validateAdjudicationRows(
  rows: readonly UnvalidatedRow[],
  gold: readonly { query: string; skillId: string }[],
  unanswerable: readonly { query: string }[],
): Map<string, AdjudicationRow | null> {
  const byCase = new Map<string, AdjudicationRow | null>();
  for (const unvalidated of rows) {
    if (unvalidated.kind !== "gold" && unvalidated.kind !== "unanswerable") {
      throw new AdjudicationError(`kind must be exactly gold or unanswerable`);
    }
    if (typeof unvalidated.index !== "number" || !Number.isSafeInteger(unvalidated.index) || unvalidated.index <= 0) {
      throw new AdjudicationError(`index must be a positive safe integer JSON number`);
    }
    const row = unvalidated as AdjudicationRow;
    const kind = unvalidated.kind;
    const index = unvalidated.index;
    // The case id is DERIVED, never trusted. A row that says "gold-046" while
    // carrying `kind: "unanswerable"` would otherwise be validated against the
    // unanswerable pool (skipping the committed-label check) and then scored
    // against a gold case no human ever reviewed.
    const caseId = `${kind}-${String(index).padStart(3, "0")}`;
    if (unvalidated.caseId !== caseId) {
      throw new AdjudicationError(
        `${unvalidated.caseId}: case id disagrees with its own kind+index (${caseId}); a row cannot be filed under an id it does not describe`,
      );
    }
    if (byCase.has(caseId)) {
      throw new AdjudicationError(`${caseId}: duplicate adjudication row; supersede explicitly`);
    }
    const pool: readonly { query: string; skillId?: string }[] =
      kind === "gold" ? gold : unanswerable;
    const entry = pool[index - 1];
    if (!entry) {
      throw new AdjudicationError(
        `${caseId}: index ${index} is outside the committed ${kind} set of ${pool.length}`,
      );
    }
    if (sha256(Buffer.from(entry.query, "utf8")) !== unvalidated.querySha256) {
      throw new AdjudicationError(
        `${caseId}: query text no longer hashes to ${unvalidated.querySha256}; the historical set moved`,
      );
    }
    if (kind === "gold" && entry.skillId !== unvalidated.labeledSkillId) {
      throw new AdjudicationError(
        `${caseId}: committed label ${entry.skillId} != adjudicated label ${unvalidated.labeledSkillId}`,
      );
    }
    if (kind === "unanswerable" && unvalidated.labeledSkillId !== null) {
      throw new AdjudicationError(`${caseId}: unanswerable rows must have labeledSkillId null`);
    }
    assertUtcTimestamp(`${caseId}.adjudicatedAt`, unvalidated.adjudicatedAt);
    if (!WRITABLE_STATES.includes(unvalidated.state as AdjudicationRow["state"])) {
      throw new AdjudicationError(
        `${caseId}: ${JSON.stringify(unvalidated.state)} cannot be written into the overlay`,
      );
    }
    const verdictState: Record<string, AdjudicationRow["state"]> = {
      suitable: "reviewed",
      unsuitable: "corrected",
      ambiguous: "uncertain",
    };
    if (!Object.hasOwn(verdictState, unvalidated.verdict)) {
      throw new AdjudicationError(`${caseId}: verdict must be suitable, unsuitable, or ambiguous`);
    }
    if (verdictState[unvalidated.verdict] !== unvalidated.state) {
      throw new AdjudicationError(`${caseId}: verdict does not agree with state`);
    }
    if (typeof unvalidated.adjudicatedBy !== "string" || unvalidated.adjudicatedBy.length === 0) {
      throw new AdjudicationError(`${caseId}: adjudicatedBy must be a non-empty string`);
    }
    // A human may reject a label without naming a replacement. Such a row is
    // still an adjudication: it counts in `corrected` and scores nothing.
    byCase.set(caseId, row);
  }
  return byCase;
}
