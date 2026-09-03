import { normalize, scoreMatch } from "skill-zero";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

import type { GaiaRegistrySource } from "./data/source.js";
import {
  TREE_CONTRACT_VERSION,
  type GaiaRegistrySnapshot,
  type InspectResult,
  type NamedSkill,
  type NamedSkillSummary,
  type ResultMetadata,
  type SearchInput,
  type SearchResult,
  type SearchResultItem,
  type StatusResult,
} from "./domain/types.js";
import { VERSION } from "./version.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEFAULT_MAX_DATA_AGE_MS = 72 * 60 * 60 * 1_000;

export type GaiaServiceOptions = {
  now?: () => Date;
  maxDataAgeMs?: number;
  serverVersion?: string;
};

type ScoredResult = SearchResultItem & { score: number };

export class GaiaService {
  readonly #source: GaiaRegistrySource;
  readonly #now: () => Date;
  readonly #maxDataAgeMs: number;
  readonly #serverVersion: string;

  constructor(source: GaiaRegistrySource, options: GaiaServiceOptions = {}) {
    this.#source = source;
    this.#now = options.now ?? (() => new Date());
    this.#maxDataAgeMs = options.maxDataAgeMs ?? DEFAULT_MAX_DATA_AGE_MS;
    this.#serverVersion = options.serverVersion ?? VERSION;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const query = input.query.trim();
    if (query.length === 0) {
      throw new Error("Search query must not be empty.");
    }

    const snapshot = await this.#source.load();
    const kinds = new Set(input.kinds ?? ["generic", "named"]);
    const requestedTypes = [...(input.types ?? []), ...(input.tiers ?? [])];
    const allowedTypes =
      requestedTypes.length > 0
        ? new Set(requestedTypes.map((value) => normalize(value)))
        : undefined;
    const allowedContributors = input.contributors
      ? new Set(input.contributors.map((value) => normalize(value)))
      : undefined;
    const namedSkills = flattenNamed(snapshot);
    const genericTypes = new Map(
      snapshot.generic.skills.map((skill) => [skill.id, skill.type]),
    );
    const scored: ScoredResult[] = [];

    if (kinds.has("generic")) {
      for (const skill of snapshot.generic.skills) {
        if (allowedTypes && !allowedTypes.has(normalize(skill.type))) continue;
        const implementations = namedSkills.filter(
          (named) => named.genericSkillRef === skill.id,
        );
        const installable = implementations.some(isInstallable);
        const maxTrustMagnitude = Math.max(
          ...implementations.map((named) => named.trustMagnitude ?? -1),
        );
        const maxStars = Math.max(
          starCount(skill.namedMaxLevel),
          ...implementations.map((named) => starCount(named.level)),
        );
        if (input.minStars !== undefined && maxStars < input.minStars) continue;
        if (
          input.minTrustMagnitude !== undefined &&
          maxTrustMagnitude < input.minTrustMagnitude
        ) {
          continue;
        }
        if (
          allowedContributors &&
          !implementations.some((named) =>
            allowedContributors.has(normalize(named.contributor)),
          )
        ) {
          continue;
        }
        if (
          input.installable !== undefined &&
          installable !== input.installable
        ) {
          continue;
        }
        const score = scoreMatch(query, [
          [skill.name, 12],
          [skill.id, 10],
          [skill.title ?? "", 8],
          [skill.summary ?? "", 4],
          [skill.description, 3],
        ]);
        if (score === 0) continue;
        scored.push({
          score: score + 1,
          kind: "generic",
          id: skill.id,
          name: skill.name,
          ...(skill.title ? { title: skill.title } : {}),
          description: skill.description,
          type: skill.type,
          status: skill.status,
          ...(skill.namedMaxLevel ? { level: skill.namedMaxLevel } : {}),
          ...(skill.overallTrustGrade
            ? { overallTrustGrade: skill.overallTrustGrade }
            : {}),
          evidenceCount: skill.evidence.length,
          installable,
        });
      }
    }

    if (kinds.has("named")) {
      for (const skill of namedSkills) {
        const resolvedType =
          skill.type ??
          (skill.genericSkillRef
            ? genericTypes.get(skill.genericSkillRef)
            : undefined);
        if (
          allowedTypes &&
          (!resolvedType || !allowedTypes.has(normalize(resolvedType)))
        ) {
          continue;
        }
        if (
          allowedContributors &&
          !allowedContributors.has(normalize(skill.contributor))
        ) {
          continue;
        }
        if (
          input.minStars !== undefined &&
          starCount(skill.level) < input.minStars
        ) {
          continue;
        }
        if (
          input.minTrustMagnitude !== undefined &&
          (skill.trustMagnitude ?? -1) < input.minTrustMagnitude
        ) {
          continue;
        }
        const installable = isInstallable(skill);
        if (
          input.installable !== undefined &&
          installable !== input.installable
        ) {
          continue;
        }
        const score = scoreMatch(query, [
          [skill.name, 12],
          [skill.id, 10],
          [skill.title ?? "", 10],
          [skill.catalogRef ?? "", 8],
          [skill.genericSkillRef ?? "", 8],
          [skill.tags.join(" "), 6],
          [skill.description, 3],
        ]);
        if (score === 0) continue;
        scored.push({
          score,
          kind: "named",
          id: skill.id,
          name: skill.name,
          ...(skill.title ? { title: skill.title } : {}),
          description: skill.description,
          ...(resolvedType ? { type: resolvedType } : {}),
          status: skill.status,
          ...(skill.genericSkillRef
            ? { genericSkillRef: skill.genericSkillRef }
            : {}),
          ...(skill.invocation ? { invocation: skill.invocation } : {}),
          contributor: skill.contributor,
          ...(skill.level === undefined ? {} : { level: skill.level }),
          ...(skill.trustMagnitude === undefined
            ? {}
            : { trustMagnitude: skill.trustMagnitude }),
          ...(skill.overallTrustGrade
            ? { overallTrustGrade: skill.overallTrustGrade }
            : {}),
          ...(skill.trust === undefined ? {} : { trust: skill.trust }),
          evidenceCount: skill.evidence.length,
          installable,
          ...(typeof skill.links.github === "string"
            ? { sourceUrl: skill.links.github }
            : {}),
        });
      }
    }

    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const results = scored
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.kind.localeCompare(right.kind) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, limit)
      .map(({ score: _score, ...result }) => result);

    return { query, results, meta: this.#metadata(snapshot) };
  }

  async inspect(identifier: string): Promise<InspectResult> {
    const normalizedIdentifier = identifier.trim();
    const snapshot = await this.#source.load();
    const generic = snapshot.generic.skills.find(
      (skill) => skill.id === normalizedIdentifier,
    );

    if (generic) {
      const namedImplementations = flattenNamed(snapshot)
        .filter((skill) => skill.genericSkillRef === generic.id)
        .map(toNamedSummary)
        .sort(
          (left, right) =>
            (right.trustMagnitude ?? -1) - (left.trustMagnitude ?? -1) ||
            left.name.localeCompare(right.name),
        );
      return {
        skill: {
          kind: "generic",
          ...generic,
          namedImplementations,
        },
        meta: this.#metadata(snapshot),
      };
    }

    const named = flattenNamed(snapshot).find(
      (skill) =>
        skill.id === normalizedIdentifier ||
        skill.catalogRef === normalizedIdentifier,
    );
    if (named) {
      const genericSkill = snapshot.generic.skills.find(
        (skill) => skill.id === named.genericSkillRef,
      );
      return {
        skill: {
          kind: "named",
          ...named,
          ...(genericSkill
            ? {
                genericSkill: {
                  id: genericSkill.id,
                  name: genericSkill.name,
                  type: genericSkill.type,
                  status: genericSkill.status,
                },
              }
            : {}),
        },
        meta: this.#metadata(snapshot),
      };
    }

    throw new Error(`Gaia skill not found: ${normalizedIdentifier}`);
  }

  async status(): Promise<StatusResult> {
    const snapshot = await this.#source.load();
    return {
      counts: {
        genericSkills: snapshot.generic.skills.length,
        namedSkills: flattenNamed(snapshot).length,
      },
      tools: ["summon"],
      bondedCapabilities: false,
      missingCapabilities: [
        "bonded-local-context",
        "workspace-analysis",
        "progression-paths",
      ],
      ...this.#metadata(snapshot),
    };
  }

  /** Full pool of Named Skills, for callers (summon) that rank on raw fields. */
  async namedSkills(): Promise<NamedSkill[]> {
    const snapshot = await this.#source.load();
    return flattenNamed(snapshot);
  }

  #metadata(snapshot: GaiaRegistrySnapshot): ResultMetadata {
    const sourceKind = snapshot.source.kind ?? "tree";
    const generatedTimes = [
      Date.parse(snapshot.generic.generatedAt),
      Date.parse(snapshot.named.generatedAt),
    ].filter(Number.isFinite);
    const oldestGeneratedAt =
      generatedTimes.length > 0 ? Math.min(...generatedTimes) : undefined;
    const now = this.#now().getTime();
    const stale =
      generatedTimes.length !== 2 ||
      oldestGeneratedAt === undefined ||
      now - oldestGeneratedAt > this.#maxDataAgeMs;
    const dataAgeSeconds =
      oldestGeneratedAt === undefined
        ? null
        : Math.max(0, Math.floor((now - oldestGeneratedAt) / 1_000));
    const upstreamDeclaresContractVersion =
      sourceKind === "fleet" ||
      [
        snapshot.generic.contractVersion ?? snapshot.generic.schemaVersion,
        snapshot.named.contractVersion ?? snapshot.named.schemaVersion,
      ].every((version) => version === TREE_CONTRACT_VERSION);
    const warnings: string[] = [];
    if (sourceKind === "fleet") {
      warnings.push(
        "Collection-only GitHub fleet: the agent query routes flat SKILL.md entries by relevance; no generic map or tree trust ordering is active.",
      );
    } else if (!upstreamDeclaresContractVersion) {
      warnings.push(
        `Gaia's public projections do not both advertise a contract version. Compatibility is being enforced by the ${TREE_CONTRACT_VERSION} shape adapter; verify the source URLs before stateful follow-up work.`,
      );
    }
    if (snapshot.source.legacy) {
      warnings.push(
        "TREE_URL + TREE_NAMED_URL compatibility is deprecated; configure one SKILL_SOURCE root URL.",
      );
    }
    if (stale) {
      warnings.push(
        dataAgeSeconds === null
          ? "One or more Gaia projection timestamps are invalid. Regenerate the public projections or restore a valid generatedAt value."
          : `Gaia projection data is ${dataAgeSeconds} seconds old, beyond the ${Math.floor(this.#maxDataAgeMs / 1_000)}-second freshness window. Check the Gaia build pipeline or retry after regeneration.`,
      );
    }

    return {
      serverVersion: this.#serverVersion,
      mode: "registry",
      sourceKind,
      routingMode:
        sourceKind === "fleet"
          ? "collection-only"
          : "generic-map+collection",
      contractVersion: TREE_CONTRACT_VERSION,
      supportedContractVersions: [TREE_CONTRACT_VERSION],
      upstreamDeclaresContractVersion,
      freshness: stale ? "stale" : "fresh",
      dataAgeSeconds,
      genericGeneratedAt: snapshot.generic.generatedAt,
      namedGeneratedAt: snapshot.named.generatedAt,
      fetchedAt: snapshot.source.fetchedAt,
      sources: {
        generic: snapshot.source.genericUrl,
        named: snapshot.source.namedUrl,
      },
      compatibility: {
        mcpSdk: "@modelcontextprotocol/sdk@1.29.0",
        mcpProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        gaiaPublicData: [TREE_CONTRACT_VERSION],
        gaiaCli: "none",
        node: ">=22.14.0",
        transports: ["stdio"],
      },
      warnings,
    };
  }
}

function flattenNamed(snapshot: GaiaRegistrySnapshot): NamedSkill[] {
  return Object.values(snapshot.named.buckets).flat();
}

function toNamedSummary(skill: NamedSkill): NamedSkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    ...(skill.title ? { title: skill.title } : {}),
    contributor: skill.contributor,
    ...(skill.level === undefined ? {} : { level: skill.level }),
    description: skill.description,
    ...(skill.catalogRef ? { catalogRef: skill.catalogRef } : {}),
    ...(skill.invocation ? { invocation: skill.invocation } : {}),
    ...(skill.trustMagnitude === undefined
      ? {}
      : { trustMagnitude: skill.trustMagnitude }),
    ...(skill.overallTrustGrade
      ? { overallTrustGrade: skill.overallTrustGrade }
      : {}),
    ...(skill.trust === undefined ? {} : { trust: skill.trust }),
    ...(typeof skill.links.github === "string"
      ? { sourceUrl: skill.links.github }
      : {}),
  };
}

export function starCount(level: string | undefined): number {
  if (!level) return -1;
  const match = /^(\d)★/.exec(level);
  return match?.[1] === undefined ? -1 : Number(match[1]);
}

/**
 * Whether summon can deliver this skill at all. A suite root carries no
 * `links.github` of its own — its components do (gaia-skill-tree CONTRIBUTING
 * §12) — so gating candidates on `isInstallable` alone dropped all 20 suites
 * in the corpus from every result, silently. Payload-level installability is
 * still `isInstallable`; this is the ranking gate.
 */
export function isSummonable(skill: NamedSkill): boolean {
  return isInstallable(skill) || (skill.suiteComponents?.length ?? 0) > 0;
}

export function isInstallable(skill: NamedSkill): boolean {
  if (skill.links.installable === false) return false;
  return (
    typeof skill.links.github === "string" &&
    /(?:\/SKILL\.md(?:$|[?#])|raw\.githubusercontent\.com)/i.test(
      skill.links.github,
    )
  );
}

// `normalize` and `scoreMatch` live in `skill-zero` so the benchmark scores the
// SAME function the product runs (packages/core/src/retrieval/lexical.ts). A
// second copy here would drift, and the baseline number would stop meaning
// anything. Re-exported because callers across this package import them here.
export { normalize, scoreMatch };
