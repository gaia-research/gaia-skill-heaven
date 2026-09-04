// The `gaia.skill-index/v1` contract — SPEC.md §2.1.
//
// One committed artifact is the only thing the runtime reads to rank. Network
// fetches refresh it into the session root; they are never on the critical
// path of a summon (SPEC §2.2, INTENT §3).

export const SKILL_INDEX_SCHEMA = "gaia.skill-index/v1" as const;

/** `generatedAt` older than this adds one card line. It never blocks a summon. */
export const STALE_AFTER_DAYS = 30;

/** Fields the BM25F ranker scores over. Order is the wire order of `stats.avgFieldLen`. */
export const INDEX_FIELDS = [
  "name",
  "id",
  "title",
  "tags",
  "genericSkillRef",
  "expansions",
  "terms",
  "description",
] as const;

export type IndexField = (typeof INDEX_FIELDS)[number];

/** SPEC §8.1 — one derived field, not thirteen. */
export type ArborStamp = {
  polarity: "heaven-native" | "hell-native" | "dual-safe" | "unknown";
  derivedFrom: string[];
  confidence: "low" | "medium" | "high";
  asOf: string;
};

export type IndexedTrust = {
  level?: string | undefined;
  grade?: string | undefined;
  trustNumber?: number | undefined;
};

export type RetrievalSurface = {
  /** GENERATED capability-gap phrasings. Ranked on, never displayed (SPEC §2.2). */
  expansions: string[];
  /** GENERATED deduplicated content terms. */
  terms: string[];
  /** Phase 2. `null` until a static token-vector table earns its place. */
  vector: number[] | null;
  /** Builder version that produced the expansions, so a bad run is revertible. */
  expandedBy?: string | undefined;
  /**
   * Fingerprint of the skill text the expansions were written from. When it no
   * longer matches the corpus, the expansions are stale and the skill needs a
   * regeneration pass — this is what makes a refresh incremental.
   */
  expandedFrom?: string | undefined;
  /** True when the expansions no longer match the skill's current text. */
  stale?: boolean | undefined;
};

export type IndexedSkill = {
  id: string;
  name: string;
  title?: string | undefined;
  contributor: string;
  genericSkillRef?: string | undefined;
  catalogRef?: string | undefined;
  /** VERBATIM contributor text. Displayed. Never rewritten. */
  description: string;
  tags: string[];
  links: { github?: string | undefined };
  invocation: "any" | "model" | "human";
  /**
   * `links.github` resolves to a SKILL.md, so a payload can be materialized.
   * NOT the same question as "can summon deliver this" — see `suiteComponents`.
   */
  installable: boolean;
  /**
   * Skill ids installed recursively as a suite. A suite root needs no
   * `links.github` of its own (gaia-skill-tree CONTRIBUTING §12), so a skill
   * with components is summonable even when `installable` is false.
   */
  suiteComponents: string[];
  /** Registry-only guard: `false` means this skill must refuse to install. */
  registryOnly: boolean;
  /**
   * False when the tree has not bucketed this skill under a generic node yet.
   * Such skills were invisible to summon entirely — the runtime read `buckets`
   * only — and 37 of the 52 are 3-star or above. They are indexed, and the
   * card discloses that the tree has not classified them.
   */
  classified: boolean;
  level?: string | undefined;
  trust: IndexedTrust;
  retrieval: RetrievalSurface;
  /**
   * Phase 4 — Arbor's first fill (SPEC §8.1). `null` until behavioural
   * receipts exist, which is the state today: deriving polarity needs a TASK
   * benchmark (does this skill help an agent converging, exploring, or both),
   * and the Phase 0/1 instrument is a RETRIEVAL benchmark. It cannot answer
   * that question, and inferring polarity from retrieval margins would be a
   * measurement of the index dressed up as a measurement of the skill.
   *
   * Derived, never authored: no contributor frontmatter field sets this.
   */
  arbor: ArborStamp | null;
};

export type IndexStats = {
  docs: number;
  /** Indexed skills the upstream projection has not bucketed under a generic node. */
  awaitingClassification: number;
  /** Documents summon cannot deliver: no installable link AND no suite components. */
  unreachable: number;
  missingTags: number;
  /**
   * Documents carrying generated expansions. PARTIAL COVERAGE IS NOT NEUTRAL:
   * an expanded document has a field to match in that an unexpanded one does
   * not, so a half-expanded index demotes the half without. Measured at 65
   * expanded vs 35 unexpanded gold targets: +0.40 MRR for the expanded,
   * -0.22 for the rest. Coverage is therefore a number the index has to carry.
   */
  expandedDocs: number;
  /** Documents whose expansions were written against text that has since changed. */
  staleExpansions: number;
  avgFieldLen: Record<IndexField, number>;
  /**
   * The absolute relevance floor (SPEC §4.4). `null` until calibrated against
   * the benchmark's unanswerable set — a guessed floor is worse than none.
   */
  floor: number | null;
  /** What separation the calibrated floor achieved, or why it could not be set. */
  floorCalibration: FloorCalibration | null;
};

export type FloorCalibration = {
  /** Fraction of gold queries admitted at this floor. */
  answerableAdmitted: number;
  /** Fraction of unanswerable queries rejected at this floor. G2 needs >= 0.9. */
  unanswerableRejected: number;
  goldSetRevision: string;
  calibratedAt: string;
  note?: string | undefined;
};

export type SkillIndex = {
  schema: typeof SKILL_INDEX_SCHEMA;
  generatedAt: string;
  source: string;
  /** sha256 of the upstream projection bytes this index was built from. */
  sourceDigest: string;
  builder: { version: string; expansion: "none" | "generated" };
  stats: IndexStats;
  docs: IndexedSkill[];
};

export class SkillIndexError extends Error {
  override readonly name = "SkillIndexError";
}

/**
 * Structural validation of a decoded index. Deliberately hand-rolled: this
 * package carries zero runtime dependencies and the shape is small.
 */
export function assertSkillIndex(value: unknown): asserts value is SkillIndex {
  const index = value as Partial<SkillIndex> | null;
  if (typeof index !== "object" || index === null) {
    throw new SkillIndexError("Skill index is not an object.");
  }
  if (index.schema !== SKILL_INDEX_SCHEMA) {
    throw new SkillIndexError(
      `Skill index advertises unsupported schema ${String(index.schema)}; this build reads ${SKILL_INDEX_SCHEMA}.`,
    );
  }
  if (!Array.isArray(index.docs) || index.docs.length === 0) {
    throw new SkillIndexError("Skill index contains no documents.");
  }
  if (typeof index.generatedAt !== "string" || Number.isNaN(Date.parse(index.generatedAt))) {
    throw new SkillIndexError("Skill index has no valid generatedAt timestamp.");
  }
  for (const doc of index.docs) {
    if (typeof doc?.id !== "string" || doc.id.length === 0) {
      throw new SkillIndexError("Skill index contains a document with no id.");
    }
    if (typeof doc.retrieval !== "object" || doc.retrieval === null) {
      throw new SkillIndexError(`Indexed skill ${doc.id} has no retrieval surface.`);
    }
  }
}

/** Days since the index was generated, or `null` when the stamp is unreadable. */
export function indexAgeDays(index: SkillIndex, now: Date = new Date()): number | null {
  const generated = Date.parse(index.generatedAt);
  if (Number.isNaN(generated)) return null;
  return (now.getTime() - generated) / 86_400_000;
}

export function isStale(index: SkillIndex, now: Date = new Date()): boolean {
  const age = indexAgeDays(index, now);
  return age !== null && age > STALE_AFTER_DAYS;
}
