// L1 — BM25F over the committed index (SPEC §3.1), plus the exact-name fast
// path (SPEC §3.4). Zero dependencies, ~200 lines, deterministic.
//
// Why this over `scoreMatch`: IDF means a match on `refactor` counts for less
// than a match on `bisect`; length normalisation means a long description does
// not outrank a precise name; and the whole thing is defined rather than
// emergent.

import { fieldText } from "./build-index.js";
import { normalize, tokenizeText } from "./lexical.js";
import { INDEX_FIELDS, type IndexField, type IndexedSkill, type SkillIndex } from "./schema.js";

/** PROVISIONAL — SPEC §3.1. The benchmark replaces the field weights. */
export const DEFAULT_BM25F_PARAMS = {
  k1: 1.2,
  b: 0.75,
  fieldPresenceNormalization: false,
  weights: {
    name: 10,
    id: 8,
    title: 6,
    tags: 5,
    genericSkillRef: 4,
    expansions: 4,
    terms: 2,
    description: 3,
  } as Record<IndexField, number>,
} as const;

export type Bm25fParams = {
  k1: number;
  b: number;
  weights: Record<IndexField, number>;
  /**
   * Scale each document's weighted frequency by the share of field weight it
   * actually has fields for.
   *
   * Without this, field ABSENCE is a penalty rather than a neutral: a document
   * with no `tags` (99 of 274) and no generated `expansions` has strictly
   * fewer places to match than one with both, so it loses on every query where
   * both are relevant. That is how a half-expanded index demoted the half it
   * had not reached yet — measured at 0.263 -> 0.045 MRR for unexpanded gold
   * targets — and it is why an expansion pass could not safely lag the tree.
   *
   * MEASURED 2026-09-03, and it does NOT fix that. At 37% coverage it moved
   * unexpanded-target MRR from 0.046 to 0.047; at full coverage it costs 0.006
   * overall (0.657 -> 0.651). Mirroring a document's authored text into the
   * generated fields was tried too and reached only 0.059 against a 0.290
   * no-expansion baseline.
   *
   * The reason both fail is that the demotion is not an artefact to normalise
   * away: expansion gives a document vocabulary an unexpanded document simply
   * does not have, and that vocabulary is what the query matches. There is no
   * ranking-side fix. **Coverage is the fix**, which is why it is enforced by
   * a test and made cheap by `scripts/expansion-plan.ts` rather than wished
   * for.
   *
   * Kept, and defaulted OFF, because it is a legitimate BM25F variant and the
   * measurement is worth being able to re-run.
   */
  fieldPresenceNormalization: boolean;
};

export type MatchKind = "exact" | "ranked";

/**
 * Sentinel score for an exact name/id/catalogRef hit. A finite constant rather
 * than Infinity so it survives JSON (a ledger row that serialises to `null` is
 * not a measurement) and so two exact matches still produce a margin of 0 —
 * which is the correct reading: the query names two things.
 */
export const EXACT_MATCH_SCORE = 1_000_000;

/** A bare single-token skill name must appear in at most this many documents to resolve by name inside a longer query (#240). */
export const NAMED_MAX_DF = 3;

export type ScoredSkill = {
  doc: IndexedSkill;
  score: number;
  matchKind: MatchKind;
  /**
   * Set only on `exact` hits: which key the query named, and whether it named
   * it as the whole query or inside a longer one (#240). The reason a skill was
   * resolved without a score, so a card can say so.
   */
  matchedBy?: { key: "id" | "catalogRef" | "name"; scope: "whole-query" | "within-query" };
  /** Query terms that hit at least one field of this document. */
  matchedTerms: string[];
};

type FieldPosting = { field: IndexField; frequency: number };

type DocumentPostings = {
  doc: IndexedSkill;
  /** term -> per-field raw frequencies */
  terms: Map<string, FieldPosting[]>;
  fieldLength: Record<IndexField, number>;
  exactKeys: Set<string>;
  /** Normalized key text by kind, for the named-in-query path (#240). */
  keys: { id: string; catalogRef: string; name: string };
  /** Share of total field weight this document actually has content for. */
  presentWeightShare: number;
};

export class Bm25fRanker {
  readonly #params: Bm25fParams;
  readonly #documents: DocumentPostings[];
  readonly #documentFrequency = new Map<string, number>();
  readonly #averageFieldLength: Record<IndexField, number>;
  readonly #exact = new Map<string, IndexedSkill[]>();

  constructor(index: SkillIndex, params: Bm25fParams = { ...DEFAULT_BM25F_PARAMS }) {
    this.#params = params;
    const totalWeight = INDEX_FIELDS.reduce((total, field) => total + params.weights[field], 0);
    this.#documents = index.docs.map((doc) => indexDocument(doc, params.weights, totalWeight));

    for (const document of this.#documents) {
      for (const term of document.terms.keys()) {
        this.#documentFrequency.set(term, (this.#documentFrequency.get(term) ?? 0) + 1);
      }
      for (const key of document.exactKeys) {
        const bucket = this.#exact.get(key);
        if (bucket) bucket.push(document.doc);
        else this.#exact.set(key, [document.doc]);
      }
    }

    this.#averageFieldLength = Object.fromEntries(
      INDEX_FIELDS.map((field) => [
        field,
        this.#documents.length === 0
          ? 0
          : this.#documents.reduce((total, document) => total + document.fieldLength[field], 0) /
            this.#documents.length,
      ]),
    ) as Record<IndexField, number>;
  }

  get size(): number {
    return this.#documents.length;
  }

  /**
   * Rank every document against `query`, best first. Zero-scoring documents are
   * dropped; the floor decision (SPEC §4) belongs to the caller, not here.
   */
  rank(query: string): ScoredSkill[] {
    const exact = this.#exactMatches(query);
    if (exact.length > 0) return exact;
    const named = this.#namedWithinQuery(query);
    if (named.length > 0) return named;

    return this.#rankFuzzy(query);
  }

  #rankFuzzy(query: string): ScoredSkill[] {
    const terms = tokenizeText(query);
    if (terms.length === 0) return [];

    const scored: ScoredSkill[] = [];
    for (const document of this.#documents) {
      const { score, matchedTerms } = this.#score(document, terms);
      if (score > 0) {
        scored.push({ doc: document.doc, score, matchKind: "ranked", matchedTerms });
      }
    }
    scored.sort((left, right) => right.score - left.score || compareIds(left.doc, right.doc));
    return scored;
  }

  /**
   * SPEC §3.4 — "summon scout-fleet" is the most common invocation there is and
   * must not go through a relevance band at all.
   */
  #exactMatches(query: string): ScoredSkill[] {
    const key = normalize(query);
    if (key.length === 0) return [];
    const docs = this.#exact.get(key);
    if (!docs || docs.length === 0) return [];
    return docs.map((doc) => ({
      doc,
      score: EXACT_MATCH_SCORE,
      matchKind: "exact" as const,
      matchedBy: { key: this.#keyKind(doc, key), scope: "whole-query" as const },
      matchedTerms: tokenizeText(query),
    }));
  }

  #keyKind(doc: IndexedSkill, key: string): "id" | "catalogRef" | "name" {
    if (normalize(doc.id) === key) return "id";
    if (normalize(doc.catalogRef ?? "") === key) return "catalogRef";
    return "name";
  }

  /**
   * #240 — a query that NAMES a skill and adds descriptive words
   * ("impeccable frontend design skill") scores far below the floor on BM25F
   * because the extra words dilute the name hit, even though the name is
   * unambiguous. Resolve it by name without a score, conservatively:
   *
   *  - an `owner/name` id or catalogRef contained in the query (contiguous
   *    tokens) always counts and outranks a bare name;
   *  - a multi-token name contained contiguously counts when it leads the
   *    query or its doc is BM25F rank 1 for the full query;
   *  - a single-token name counts only when it LEADS the query, is
   *    distinctive (appears in at most NAMED_MAX_DF documents), AND the same
   *    doc is BM25F rank 1 for the full query, so "review my diff" or
   *    "teach me X" cannot be hijacked by a skill that merely shares a word.
   *
   * Typos and partial names do not qualify: they stay fuzzy.
   */
  #namedWithinQuery(query: string): ScoredSkill[] {
    const tokens = normalize(query).split(" ").filter(Boolean);
    if (tokens.length < 2) return [];
    const padded = ` ${tokens.join(" ")} `;
    let top: string | undefined;
    const idHits: ScoredSkill[] = [];
    const nameHits: ScoredSkill[] = [];
    for (const document of this.#documents) {
      const { id, catalogRef, name } = document.keys;
      const hit = (key: "id" | "catalogRef" | "name"): ScoredSkill => ({
        doc: document.doc,
        score: EXACT_MATCH_SCORE,
        matchKind: "exact",
        matchedBy: { key, scope: "within-query" },
        matchedTerms: tokenizeText(query),
      });
      if (id.includes(" ") && padded.includes(` ${id} `)) idHits.push(hit("id"));
      else if (catalogRef.includes(" ") && padded.includes(` ${catalogRef} `)) idHits.push(hit("catalogRef"));
      else if (name.length > 0) {
        if (name.includes(" ")) {
          // A multi-token name can also be an ordinary phrase ("code review"):
          // it resolves by name only when it leads the query or the same doc is
          // already BM25F rank 1, so a fuzzy request is not hijacked mid-sentence.
          if (padded.includes(` ${name} `)) {
            const leads = padded.startsWith(` ${name} `);
            if (!leads) top ??= normalize(this.#rankFuzzy(query)[0]?.doc.name ?? "");
            if (leads || top === name) nameHits.push(hit("name"));
          }
        } else if (
          tokens[0] === name &&
          (this.#documentFrequency.get(name) ?? 0) <= NAMED_MAX_DF
        ) {
          // Leading + rare is still not enough on its own ("teach me X"):
          // the same doc must also be BM25F rank 1 for the full query.
          // Skills sharing that exact name qualify together, so the ambiguity
          // is reported rather than one sharer being chosen by rank.
          top ??= normalize(this.#rankFuzzy(query)[0]?.doc.name ?? "");
          if (top === name) nameHits.push(hit("name"));
        }
      }
    }
    return idHits.length > 0 ? idHits : nameHits;
  }

  #score(
    document: DocumentPostings,
    terms: readonly string[],
  ): { score: number; matchedTerms: string[] } {
    const { k1, b, weights } = this.#params;
    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of terms) {
      const postings = document.terms.get(term);
      if (!postings) continue;
      matchedTerms.push(term);

      let weightedFrequency = 0;
      for (const { field, frequency } of postings) {
        const averageLength = this.#averageFieldLength[field];
        const normalizer =
          averageLength === 0
            ? 1
            : 1 - b + (b * document.fieldLength[field]) / averageLength;
        weightedFrequency += (weights[field] * frequency) / normalizer;
      }
      if (this.#params.fieldPresenceNormalization && document.presentWeightShare > 0) {
        weightedFrequency /= document.presentWeightShare;
      }

      score += this.#idf(term) * ((weightedFrequency * (k1 + 1)) / (weightedFrequency + k1));
    }

    return { score, matchedTerms };
  }

  #idf(term: string): number {
    const n = this.#documents.length;
    const df = this.#documentFrequency.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }
}

/**
 * `margin = (score_top1 − score_top2) / score_top1` — the one number the Ultra
 * controller consumes (SPEC §6.2). A single candidate is maximally separated;
 * an exact match is too.
 */
export function marginOf(ranked: readonly ScoredSkill[]): number {
  const top = ranked[0];
  if (!top) return 0;
  const next = ranked[1];
  if (!next || top.score <= 0) return 1;
  return (top.score - next.score) / top.score;
}

function indexDocument(
  doc: IndexedSkill,
  weights: Record<IndexField, number>,
  totalWeight: number,
): DocumentPostings {
  const terms = new Map<string, FieldPosting[]>();
  const fieldLength = {} as Record<IndexField, number>;

  for (const field of INDEX_FIELDS) {
    const tokens = normalize(fieldText(doc, field)).split(" ").filter(Boolean);
    fieldLength[field] = tokens.length;
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [token, frequency] of counts) {
      const postings = terms.get(token);
      if (postings) postings.push({ field, frequency });
      else terms.set(token, [{ field, frequency }]);
    }
  }

  const exactKeys = new Set(
    [doc.name, doc.id, doc.catalogRef ?? ""]
      .map((value) => normalize(value))
      .filter((value) => value.length > 0),
  );

  const presentWeight = INDEX_FIELDS.reduce(
    (total, field) => total + (fieldLength[field] > 0 ? weights[field] : 0),
    0,
  );

  return {
    doc,
    terms,
    fieldLength,
    exactKeys,
    keys: {
      id: normalize(doc.id),
      catalogRef: normalize(doc.catalogRef ?? ""),
      name: normalize(doc.name),
    },
    presentWeightShare: totalWeight === 0 ? 1 : presentWeight / totalWeight,
  };
}

function compareIds(left: IndexedSkill, right: IndexedSkill): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
