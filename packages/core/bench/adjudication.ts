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
  pins: { goldBlob: string; unanswerableBlob: string; heavenRev: string };
  historicalLabelsModified: false;
  sourceSnapshot: { schema: string; lockedAt: string; sha256: string; origin: string; note: string };
  verdictMeaning: Record<string, Record<string, string>>;
  stateMapping: Record<AdjudicationState, string>;
  counts: {
    gold: Record<AdjudicationState, number> & { total: number };
    unanswerable: Record<AdjudicationState, number> & { total: number };
  };
  claimLimits: string[];
};

export class AdjudicationError extends Error {}

/**
 * The on-disk shape before validation. The overlay is committed data, but it is
 * still a file someone can edit, so `state` arrives as a plain string and is
 * checked rather than trusted.
 */
type UnvalidatedRow = Omit<AdjudicationRow, "state"> & { state: string };

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as T);
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

  const rows = readJsonl<UnvalidatedRow>(join(adjudicationDir, provenance.overlay));
  const byCase = new Map<string, AdjudicationRow | null>();
  for (const unvalidated of rows) {
    const row = unvalidated as AdjudicationRow;
    const kind = unvalidated.kind;
    const index = Number(unvalidated.index);
    const pool: readonly { query: string; skillId?: string }[] =
      kind === "gold" ? gold : unanswerable;
    const entry = pool[index - 1];
    if (!entry) {
      throw new AdjudicationError(
        `${unvalidated.caseId}: index ${index} is outside the committed ${kind} set of ${pool.length}`,
      );
    }
    if (sha256(entry.query) !== unvalidated.querySha256) {
      throw new AdjudicationError(
        `${unvalidated.caseId}: query text no longer hashes to ${unvalidated.querySha256}; the historical set moved`,
      );
    }
    if (kind === "gold" && entry.skillId !== unvalidated.labeledSkillId) {
      throw new AdjudicationError(
        `${unvalidated.caseId}: committed label ${entry.skillId} != adjudicated label ${unvalidated.labeledSkillId}`,
      );
    }
    if (!WRITABLE_STATES.includes(unvalidated.state as AdjudicationRow["state"])) {
      throw new AdjudicationError(
        `${unvalidated.caseId}: ${JSON.stringify(unvalidated.state)} cannot be written into the overlay`,
      );
    }
    // A human may reject a label without naming a replacement. Such a row is
    // still an adjudication: it counts in `corrected` and scores nothing.
    byCase.set(unvalidated.caseId, row);
  }

  for (const pool of [
    { kind: "gold" as const, rows: gold },
    { kind: "unanswerable" as const, rows: unanswerable },
  ]) {
    for (let position = 0; position < pool.rows.length; position += 1) {
      const caseId = `${pool.kind}-${String(position + 1).padStart(3, "0")}`;
      if (!byCase.has(caseId)) byCase.set(caseId, null);
    }
  }

  return { rows: rows as AdjudicationRow[], provenance, byCase };
}

export type AdjudicatedScores = {
  /**
   * Human-confirmed labels only. This is the ONE subset over which an absolute
   * label-derived claim may be stated. n is small and disclosed.
   */
  reviewed: { n: number; mrr: number; recallAt5: number };
  /**
   * Human-confirmed labels plus the replacements a human actually named for
   * rejected ones. A `corrected` row with no `betterSkillId` contributes to
   * the count and to no score — the overlay never invents a replacement.
   */
  resolved: { n: number; mrr: number; recallAt5: number };
  /** Counted, never scored. */
  uncertain: number;
  /** No human judgment exists. Never scored. */
  unreviewed: number;
  corrected: number;
};

const EMPTY: AdjudicatedScores = {
  reviewed: { n: 0, mrr: 0, recallAt5: 0 },
  resolved: { n: 0, mrr: 0, recallAt5: 0 },
  uncertain: 0,
  unreviewed: 0,
  corrected: 0,
};

/**
 * Score one system against the overlay.
 *
 * `rankedByCase` maps `caseId` to that system's top-10 ids for that query, so
 * this stays a pure measurement of rankings already produced — it never ranks,
 * filters, or re-orders anything.
 */
export function scoreAdjudicated(
  overlay: AdjudicationOverlay,
  gold: readonly { query: string; skillId: string }[],
  rankedByCase: ReadonlyMap<string, string[]>,
): AdjudicatedScores {
  const result: AdjudicatedScores = { ...EMPTY };
  const reviewedRR: number[] = [];
  const reviewedHits: { ranked: string[]; correctId: string }[] = [];
  const resolvedRR: number[] = [];
  const resolvedHits: { ranked: string[]; correctId: string }[] = [];

  for (let position = 0; position < gold.length; position += 1) {
    const caseId = `gold-${String(position + 1).padStart(3, "0")}`;
    const row = overlay.byCase.get(caseId) ?? null;
    const ranked = rankedByCase.get(caseId) ?? [];
    if (row === null) {
      result.unreviewed += 1;
      continue;
    }
    if (row.state === "uncertain") {
      result.uncertain += 1;
      continue;
    }
    if (row.state === "corrected") {
      result.corrected += 1;
      if (row.kind !== "gold" || !row.betterSkillId) continue;
      const rank = ranked.indexOf(row.betterSkillId) + 1;
      const rr = rank === 0 ? 0 : 1 / rank;
      resolvedRR.push(rr);
      resolvedHits.push({ ranked, correctId: row.betterSkillId });
      continue;
    }
    const rank = ranked.indexOf(gold[position].skillId) + 1;
    const rr = rank === 0 ? 0 : 1 / rank;
    reviewedRR.push(rr);
    reviewedHits.push({ ranked, correctId: gold[position].skillId });
    // `resolved` is `reviewed` PLUS the replacements a human actually named, so
    // the confirmed label still scores here. A human who confirmed a label and
    // also named an alternative did not retract the confirmation.
    resolvedRR.push(rr);
    resolvedHits.push({ ranked, correctId: gold[position].skillId });
    if (row.betterSkillId) {
      const r2 = ranked.indexOf(row.betterSkillId) + 1;
      resolvedRR.push(r2 === 0 ? 0 : 1 / r2);
      resolvedHits.push({ ranked, correctId: row.betterSkillId });
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
