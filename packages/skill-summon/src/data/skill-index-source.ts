// Offline-first index resolution (PLAN 1.2, SPEC §2.2).
//
// The committed index is the read path. A network fetch is a REFRESH, never a
// precondition — which is what turns #103 from a bug that needs a retry into a
// shape that cannot happen. The only call that must reach the network is one
// that names a `source` we have no committed index for; that is explicit, and
// it fails loudly rather than falling back.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSkillIndex,
  buildSkillIndex,
  sha256,
  type ProjectionSkill,
  type SkillIndex,
} from "skill-zero";

import type { GaiaRegistrySnapshot, NamedSkill } from "../domain/types.js";
import { resolveSkillSource } from "./configured-source.js";
import { GaiaDataError } from "./source.js";

/** Where the committed index lives relative to the plugin root. */
const INDEX_RELATIVE_PATH = join("plugins", "skill-heaven", "data", "skill-index.json");

let committed: Promise<SkillIndex> | undefined;

/**
 * Load the index committed into the plugin. Cached for the process: it is a
 * static file, and re-reading it per summon buys nothing.
 */
export function loadCommittedIndex(): Promise<SkillIndex> {
  committed ??= readCommittedIndex();
  return committed;
}

/** Test seam — drops the process-level cache. */
export function resetCommittedIndexCache(): void {
  committed = undefined;
}

async function readCommittedIndex(): Promise<SkillIndex> {
  const attempted: string[] = [];
  for (const candidate of candidatePaths()) {
    attempted.push(candidate);
    let raw: string;
    try {
      raw = await readFile(candidate, "utf8");
    } catch {
      continue;
    }
    const parsed: unknown = JSON.parse(raw);
    assertSkillIndex(parsed);
    return parsed;
  }
  throw new GaiaDataError(
    `Could not find the committed skill index. Looked in:\n  ${attempted.join("\n  ")}\n` +
      "Set SKILL_INDEX_PATH to point at skill-index.json, or rebuild it with " +
      "`npx tsx packages/core/scripts/build-skill-index.ts`.",
  );
}

function candidatePaths(): string[] {
  const configured = process.env.SKILL_INDEX_PATH?.trim();
  const here = dirname(fileURLToPath(import.meta.url));
  const paths = configured ? [configured] : [];

  // Bundled: plugins/skill-heaven/mcp/skill-summon.mjs -> ../data/…
  paths.push(join(here, "..", "data", "skill-index.json"));

  // Source tree: walk up looking for the plugin directory, so the same code
  // works from packages/skill-summon/src, from a test, and from a worktree.
  let directory = here;
  for (let depth = 0; depth < 8; depth++) {
    paths.push(join(directory, INDEX_RELATIVE_PATH));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return paths;
}

export type ResolvedIndex = {
  index: SkillIndex;
  /** Where these candidates came from, echoed on every card (SPEC §5.4). */
  source: string;
  /** "committed" needed no network; "fetched" reached the named source. */
  origin: "committed" | "fetched";
};

export type ResolveIndexOptions = {
  /** Per-call override of the configured Skill URL (SPEC §5.1). */
  source?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchFn?: typeof fetch | undefined;
};

/**
 * Resolve the index to rank against.
 *
 * - No `source`, and the configured source is the one the committed index was
 *   built from: read the committed index. No network.
 * - Otherwise: fetch that source and build an index from it in memory, so both
 *   paths rank through exactly the same code. An unresolvable source is an
 *   error, never a silent fallback to the configured one (SPEC §5.1).
 */
export async function resolveIndex({
  source,
  env,
  fetchFn,
}: ResolveIndexOptions = {}): Promise<ResolvedIndex> {
  const committedIndex = await loadCommittedIndex();
  const environment = env ?? process.env;

  if (source === undefined) {
    const configured = resolveSkillSource({
      env: environment,
      ...(fetchFn ? { fetchFn } : {}),
    });
    if (sameSource(configured.sourceUrl, committedIndex.source)) {
      return { index: committedIndex, source: committedIndex.source, origin: "committed" };
    }
    return fetchIndex(configured.sourceUrl, environment, fetchFn);
  }

  const requested = source.trim();
  if (requested.length === 0) {
    throw new GaiaDataError("summon(source) must not be empty.");
  }
  if (sameSource(requested, committedIndex.source)) {
    return { index: committedIndex, source: committedIndex.source, origin: "committed" };
  }
  return fetchIndex(expandSource(requested), environment, fetchFn);
}

/** Build an in-memory index from an already-loaded snapshot, so a fetched source ranks through exactly the same code as the committed one. */
export function indexFromSnapshot(snapshot: GaiaRegistrySnapshot, sourceUrl: string): SkillIndex {
  const named = Object.values(snapshot.named.buckets).flat();
  return buildSkillIndex({
    projection: { buckets: { fetched: named.map(toProjectionSkill) } },
    source: sourceUrl,
    sourceDigest: sha256(JSON.stringify(named)),
    builderVersion: "runtime-fetch",
    generatedAt: snapshot.named.generatedAt ?? snapshot.source.fetchedAt,
  });
}

export { sameSource };

async function fetchIndex(
  sourceUrl: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch | undefined,
): Promise<ResolvedIndex> {
  const resolution = resolveSkillSource({
    env: { ...env, SKILL_SOURCE: sourceUrl },
    ...(fetchFn ? { fetchFn } : {}),
  });

  let snapshot: GaiaRegistrySnapshot;
  try {
    snapshot = await resolution.source.load();
  } catch (error) {
    // Never fall back to the configured source: a caller who named a repo and
    // silently got results from somewhere else has been misled (SPEC §5.1).
    throw new GaiaDataError(
      `Could not resolve source '${sourceUrl}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    index: indexFromSnapshot(snapshot, resolution.sourceUrl),
    source: resolution.sourceUrl,
    origin: "fetched",
  };
}

function toProjectionSkill(skill: NamedSkill): ProjectionSkill {
  return {
    id: skill.id,
    name: skill.name,
    ...(skill.title ? { title: skill.title } : {}),
    contributor: skill.contributor,
    ...(skill.genericSkillRef ? { genericSkillRef: skill.genericSkillRef } : {}),
    ...(skill.catalogRef ? { catalogRef: skill.catalogRef } : {}),
    description: skill.description,
    tags: skill.tags,
    ...(skill.level ? { level: skill.level } : {}),
    ...(skill.status ? { status: skill.status } : {}),
    ...(skill.invocation ? { invocation: skill.invocation } : {}),
    ...(skill.overallTrustGrade ? { overallTrustGrade: skill.overallTrustGrade } : {}),
    ...(skill.trustMagnitude === undefined ? {} : { trustMagnitude: skill.trustMagnitude }),
    ...(skill.suiteComponents?.length ? { suiteComponents: skill.suiteComponents } : {}),
    ...(skill.installable === false ? { installable: false } : {}),
    links: skill.links,
  };
}

/** `owner/repo` is accepted as shorthand for a flat GitHub fleet (SPEC §5.1). */
export function expandSource(value: string): string {
  if (/^[\w.-]+\/[\w.-]+$/u.test(value)) return `https://github.com/${value}`;
  return value;
}

function sameSource(left: string, right: string): boolean {
  return canonical(left) === canonical(right);
}

function canonical(value: string): string {
  return expandSource(value)
    .trim()
    .replace(/\/+$/u, "")
    .toLocaleLowerCase("en-US");
}
