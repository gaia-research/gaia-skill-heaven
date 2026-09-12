// The `gaia.skill-index/v2` contract — Reach's retrieval artifact. v2 removes
// the deferred Arbor field; Arbor is an upstream-owned contract consumed only
// by Lane A, not an invented field in this index.
//
// One committed artifact is the only thing the runtime reads to rank. Network
// fetches refresh it into the session root; they are never on the critical
// path of a summon (SPEC §2.2, INTENT §3).

export const SKILL_INDEX_SCHEMA = "gaia.skill-index/v2" as const;

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
  /** Immutable upstream revision used for this committed retrieval index. */
  sourceRevision?: string | undefined;
  /** Upstream release/version label, when the source publishes one. */
  sourceVersion?: string | undefined;
  /** The upstream generator and path that produced the source projection. */
  sourceWorkflow?: string | undefined;
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
  const index = asRecord(value, "Skill index");
  if (index.schema !== SKILL_INDEX_SCHEMA) {
    throw new SkillIndexError(
      `Skill index advertises unsupported schema ${String(index.schema)}; this build reads ${SKILL_INDEX_SCHEMA}.`,
    );
  }
  const generatedAt = requiredString(index, "generatedAt", "Skill index");
  if (!isTimestamp(generatedAt)) {
    throw new SkillIndexError("Skill index has no valid generatedAt timestamp.");
  }
  requiredString(index, "source", "Skill index");
  requiredString(index, "sourceDigest", "Skill index");
  optionalString(index, "sourceRevision", "Skill index");
  optionalString(index, "sourceVersion", "Skill index");
  optionalString(index, "sourceWorkflow", "Skill index");

  const builder = asRecord(index.builder, "Skill index builder");
  requiredString(builder, "version", "Skill index builder");
  if (builder.expansion !== "none" && builder.expansion !== "generated") {
    throw new SkillIndexError("Skill index builder.expansion must be 'none' or 'generated'.");
  }

  const stats = asRecord(index.stats, "Skill index stats");
  for (const field of [
    "docs",
    "awaitingClassification",
    "unreachable",
    "missingTags",
    "expandedDocs",
    "staleExpansions",
  ]) {
    nonNegativeInteger(stats[field], `Skill index stats.${field}`);
  }
  const docs = asArray(index.docs, "Skill index docs");
  if (docs.length === 0) throw new SkillIndexError("Skill index contains no documents.");
  if (stats.docs !== docs.length) {
    throw new SkillIndexError(
      `Skill index stats.docs is ${String(stats.docs)}, but the artifact contains ${docs.length} documents.`,
    );
  }
  const avgFieldLen = asRecord(stats.avgFieldLen, "Skill index stats.avgFieldLen");
  for (const field of INDEX_FIELDS) finiteNonNegative(avgFieldLen[field], `Skill index stats.avgFieldLen.${field}`);
  if (stats.floor !== null) finiteNonNegative(stats.floor, "Skill index stats.floor");
  if (stats.floorCalibration !== null) validateFloorCalibration(stats.floorCalibration);

  const ids = new Set<string>();
  let awaitingClassification = 0;
  for (const [position, rawDoc] of docs.entries()) {
    const doc = asRecord(rawDoc, `Skill index document ${position}`);
    const id = requiredString(doc, "id", `Skill index document ${position}`);
    if (!id.includes("/") || /\s/u.test(id)) {
      throw new SkillIndexError(`Indexed skill ${id} has an invalid id.`);
    }
    if (ids.has(id)) throw new SkillIndexError(`Skill index contains duplicate id ${id}.`);
    ids.add(id);
    requiredString(doc, "name", `Indexed skill ${id}`);
    requiredString(doc, "contributor", `Indexed skill ${id}`);
    requiredString(doc, "description", `Indexed skill ${id}`);
    optionalString(doc, "title", `Indexed skill ${id}`);
    optionalString(doc, "genericSkillRef", `Indexed skill ${id}`);
    optionalString(doc, "catalogRef", `Indexed skill ${id}`);
    stringArray(doc.tags, `Indexed skill ${id}.tags`);
    const links = asRecord(doc.links, `Indexed skill ${id}.links`);
    optionalString(links, "github", `Indexed skill ${id}.links`);
    if (!isInvocation(doc.invocation)) {
      throw new SkillIndexError(`Indexed skill ${id} has an invalid invocation.`);
    }
    requiredBoolean(doc, "installable", `Indexed skill ${id}`);
    stringArray(doc.suiteComponents, `Indexed skill ${id}.suiteComponents`);
    requiredBoolean(doc, "registryOnly", `Indexed skill ${id}`);
    const classified = requiredBoolean(doc, "classified", `Indexed skill ${id}`);
    if (!classified) awaitingClassification++;
    optionalString(doc, "level", `Indexed skill ${id}`);

    const trust = asRecord(doc.trust, `Indexed skill ${id}.trust`);
    optionalString(trust, "level", `Indexed skill ${id}.trust`);
    optionalString(trust, "grade", `Indexed skill ${id}.trust`);
    if (trust.trustNumber !== undefined) finiteNumber(trust.trustNumber, `Indexed skill ${id}.trust.trustNumber`);

    const retrieval = asRecord(doc.retrieval, `Indexed skill ${id}.retrieval`);
    stringArray(retrieval.expansions, `Indexed skill ${id}.retrieval.expansions`);
    stringArray(retrieval.terms, `Indexed skill ${id}.retrieval.terms`);
    if (retrieval.vector !== null) finiteNumberArray(retrieval.vector, `Indexed skill ${id}.retrieval.vector`);
    optionalString(retrieval, "expandedBy", `Indexed skill ${id}.retrieval`);
    optionalString(retrieval, "expandedFrom", `Indexed skill ${id}.retrieval`);
    if (retrieval.stale !== undefined && typeof retrieval.stale !== "boolean") {
      throw new SkillIndexError(`Indexed skill ${id}.retrieval.stale must be a boolean.`);
    }
  }
  if (stats.awaitingClassification !== awaitingClassification) {
    throw new SkillIndexError(
      `Skill index stats.awaitingClassification is ${String(stats.awaitingClassification)}, but ${awaitingClassification} documents are unclassified.`,
    );
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SkillIndexError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SkillIndexError(`${label} must be an array.`);
  return value;
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new SkillIndexError(`${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, label: string): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    throw new SkillIndexError(`${label}.${key} must be a string when present.`);
  }
}

function requiredBoolean(record: Record<string, unknown>, key: string, label: string): boolean {
  if (typeof record[key] !== "boolean") throw new SkillIndexError(`${label}.${key} must be a boolean.`);
  return record[key] as boolean;
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SkillIndexError(`${label} must be an array of strings.`);
  }
}

function finiteNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SkillIndexError(`${label} must be a finite number.`);
  }
}

function finiteNonNegative(value: unknown, label: string): void {
  finiteNumber(value, label);
  if ((value as number) < 0) throw new SkillIndexError(`${label} must be non-negative.`);
}

function nonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SkillIndexError(`${label} must be a non-negative integer.`);
  }
}

function finiteNumberArray(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new SkillIndexError(`${label} must be an array.`);
  for (const [position, item] of value.entries()) finiteNumber(item, `${label}[${position}]`);
}

function isInvocation(value: unknown): value is "any" | "model" | "human" {
  return value === "any" || value === "model" || value === "human";
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validateFloorCalibration(value: unknown): void {
  const calibration = asRecord(value, "Skill index stats.floorCalibration");
  finiteNonNegative(calibration.answerableAdmitted, "Skill index stats.floorCalibration.answerableAdmitted");
  finiteNonNegative(calibration.unanswerableRejected, "Skill index stats.floorCalibration.unanswerableRejected");
  if ((calibration.answerableAdmitted as number) > 1 || (calibration.unanswerableRejected as number) > 1) {
    throw new SkillIndexError("Skill index floor calibration fractions must be at most 1.");
  }
  requiredString(calibration, "goldSetRevision", "Skill index stats.floorCalibration");
  const calibratedAt = requiredString(calibration, "calibratedAt", "Skill index stats.floorCalibration");
  if (!isTimestamp(calibratedAt)) throw new SkillIndexError("Skill index floor calibration has an invalid calibratedAt timestamp.");
  optionalString(calibration, "note", "Skill index stats.floorCalibration");
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
