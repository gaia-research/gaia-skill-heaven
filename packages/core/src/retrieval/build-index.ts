// L0 — the index builder (SPEC §2, PLAN 1.1).
//
// Pure: projection in, index out. The fetching, hashing and writing live in
// `packages/core/scripts/build-skill-index.mjs` so this stays testable and
// offline.

import { createHash } from "node:crypto";

import { normalize, tokenizeText } from "./lexical.js";
import {
  INDEX_FIELDS,
  SKILL_INDEX_SCHEMA,
  type IndexField,
  type IndexedSkill,
  type SkillIndex,
} from "./schema.js";

/** The subset of the upstream named projection the index is built from. */
export type ProjectionSkill = {
  id: string;
  name: string;
  title?: string | undefined;
  contributor?: string | undefined;
  genericSkillRef?: string | undefined;
  catalogRef?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  level?: string | undefined;
  status?: string | undefined;
  invocation?: string | undefined;
  overallTrustGrade?: string | undefined;
  trustMagnitude?: number | undefined;
  links?: Record<string, unknown> | undefined;
  suiteComponents?: string[] | undefined;
};

export type NamedProjection = {
  generatedAt?: string | undefined;
  buckets: Record<string, ProjectionSkill[]>;
  awaitingClassification?: ProjectionSkill[] | undefined;
};

export type BuildIndexOptions = {
  projection: NamedProjection;
  /** Root the projection was served from, echoed on every card. */
  source: string;
  /** sha256 of the upstream bytes. `sha256(...)` computes it for you. */
  sourceDigest: string;
  builderVersion: string;
  generatedAt?: string | undefined;
  /** Expansions keyed by skill id, when a generation batch has been run. */
  expansions?: Record<string, { expansions: string[]; expandedBy: string }> | undefined;
};

export function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * `links.github` must point at a SKILL.md (or a raw host) for the materializer
 * to have anything to fetch. Mirrors `skill-summon`'s `isInstallable`; the two
 * are pinned together by `packages/skill-summon/test/index-parity.test.ts`.
 */
export function isInstallableLink(links: Record<string, unknown> | undefined): boolean {
  if (!links) return false;
  if (links.installable === false) return false;
  return (
    typeof links.github === "string" &&
    /(?:\/SKILL\.md(?:$|[?#])|raw\.githubusercontent\.com)/i.test(links.github)
  );
}

/** Ranked text of one field of one document. */
/**
 * Whether summon can deliver this document at all: either its own link
 * resolves to a SKILL.md, or it is a suite whose components carry the
 * payloads. 20 skills in the corpus are suites with no link of their own;
 * treating them as uninstallable drops them from every result silently.
 */
export function isReachable(doc: IndexedSkill): boolean {
  return doc.installable || doc.suiteComponents.length > 0;
}

export function fieldText(doc: IndexedSkill, field: IndexField): string {
  switch (field) {
    case "name":
      return doc.name;
    case "id":
      return doc.id;
    case "title":
      return doc.title ?? "";
    case "tags":
      return doc.tags.join(" ");
    case "genericSkillRef":
      return doc.genericSkillRef ?? "";
    case "expansions":
      return doc.retrieval.expansions.join(" ");
    case "terms":
      return doc.retrieval.terms.join(" ");
    case "description":
      return doc.description;
  }
}

/**
 * Content terms for a document: every distinct token across the lexical fields
 * and its expansions. Only meaningful once expansions exist — without them it
 * is a copy of the other fields and would silently double their weight, so it
 * stays empty (SPEC §2.3).
 */
export function deriveTerms(doc: IndexedSkill): string[] {
  if (doc.retrieval.expansions.length === 0) return [];
  const source = [
    doc.name,
    doc.title ?? "",
    doc.tags.join(" "),
    doc.genericSkillRef ?? "",
    doc.description,
    doc.retrieval.expansions.join(" "),
  ].join(" ");
  return tokenizeText(source).filter((token) => token.length > 2);
}

export function buildSkillIndex({
  projection,
  source,
  sourceDigest,
  builderVersion,
  generatedAt = new Date().toISOString(),
  expansions,
}: BuildIndexOptions): SkillIndex {
  const bucketed = Object.values(projection.buckets ?? {}).flat();
  const docs = bucketed
    .map((skill) => toIndexedSkill(skill, expansions?.[skill.id]))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const avgFieldLen = Object.fromEntries(
    INDEX_FIELDS.map((field) => [
      field,
      docs.length === 0
        ? 0
        : round4(
            docs.reduce((total, doc) => total + tokenCount(fieldText(doc, field)), 0) /
              docs.length,
          ),
    ]),
  ) as Record<IndexField, number>;

  return {
    schema: SKILL_INDEX_SCHEMA,
    generatedAt,
    source,
    sourceDigest,
    builder: {
      version: builderVersion,
      expansion: docs.some((doc) => doc.retrieval.expansions.length > 0)
        ? "generated"
        : "none",
    },
    stats: {
      docs: docs.length,
      // Recorded, not indexed: these 52 skills are invisible to summon today
      // because the runtime reads `buckets` only. Stating the number keeps the
      // gap visible instead of silently shrinking the corpus.
      awaitingClassification: (projection.awaitingClassification ?? []).length,
      unreachable: docs.filter((doc) => !isReachable(doc)).length,
      missingTags: docs.filter((doc) => doc.tags.length === 0).length,
      avgFieldLen,
      floor: null,
      floorCalibration: null,
    },
    docs,
  };
}

function toIndexedSkill(
  skill: ProjectionSkill,
  expansion: { expansions: string[]; expandedBy: string } | undefined,
): IndexedSkill {
  const links = skill.links ?? {};
  const doc: IndexedSkill = {
    id: skill.id,
    name: skill.name,
    ...(skill.title ? { title: skill.title } : {}),
    contributor: skill.contributor ?? skill.id.split("/")[0] ?? "",
    ...(skill.genericSkillRef ? { genericSkillRef: skill.genericSkillRef } : {}),
    ...(skill.catalogRef ? { catalogRef: skill.catalogRef } : {}),
    description: skill.description ?? "",
    tags: [...(skill.tags ?? [])],
    links: typeof links.github === "string" ? { github: links.github } : {},
    invocation: readInvocation(skill.invocation),
    installable: isInstallableLink(links),
    suiteComponents: [...(skill.suiteComponents ?? [])],
    ...(skill.level ? { level: skill.level } : {}),
    trust: {
      ...(skill.level ? { level: skill.level } : {}),
      ...(skill.overallTrustGrade ? { grade: skill.overallTrustGrade } : {}),
      ...(skill.trustMagnitude === undefined
        ? {}
        : { trustNumber: skill.trustMagnitude }),
    },
    retrieval: {
      expansions: expansion?.expansions ?? [],
      terms: [],
      vector: null,
      ...(expansion ? { expandedBy: expansion.expandedBy } : {}),
    },
    arbor: null,
  };
  doc.retrieval.terms = deriveTerms(doc);
  return doc;
}

function readInvocation(value: string | undefined): "any" | "model" | "human" {
  return value === "model" || value === "human" ? value : "any";
}

function tokenCount(text: string): number {
  const normalized = normalize(text);
  return normalized.length === 0 ? 0 : normalized.split(" ").length;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
