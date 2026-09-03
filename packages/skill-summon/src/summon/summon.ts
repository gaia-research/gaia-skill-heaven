import { stat } from "node:fs/promises";
import path from "node:path";

import {
  Bm25fRanker,
  decide,
  indexAgeDays,
  isStale,
  normalize,
  type Decision,
  type IndexedSkill,
  type SkillIndex,
} from "skill-zero";

import type { NamedSkill } from "../domain/types.js";
import type { ResolvedIndex } from "../data/skill-index-source.js";
import { starCount } from "../service.js";
import type { GaiaService } from "../service.js";
import { trustFields } from "../trust.js";
import { inspectUrl, renderSummonCard } from "./card.js";
import {
  discardCachedRepo,
  ensureCachedRepo,
  resolveRemoteCommit,
} from "./clone.js";
import { parseGithubUrl } from "./giturl.js";
import { materializeSkillDir } from "./materialize.js";
import { PayloadCache } from "./payload-cache.js";
import { type RankingSummary, type SummonSurface } from "./rank.js";
import { appendSummonLog } from "./log.js";
import { elapsedSeconds, startTiming } from "./timing.js";
import { reapSessions } from "./session.js";
import type { InstalledSkill, RetrievalDisclosure, SummonSession } from "./session.js";

const DEFAULT_LIMIT = 1;
// There is NO upper cap. How many skills a gap warrants is the agent's call —
// nobody assigned a ceiling, and inventing one would let the engine refuse a
// depth the product never ruled out. `limit` must still be a positive integer;
// that is a well-formedness check, not a policy.

export type SummonOptions = {
  query: string;
  limit?: number | undefined;
  surface?: SummonSurface | undefined;
  /** Override the configured Skill URL for this call. Unresolvable is an error, never a fallback. */
  source?: string | undefined;
  /** Rank and disclose without materialising anything to disk (SPEC §5.1). */
  preview?: boolean | undefined;
};

/** One ranked candidate, disclosed without being installed (SPEC §5.1 `preview`). */
export type PreviewedSkill = {
  id: string;
  name: string;
  title?: string | undefined;
  description: string;
  level?: string | undefined;
  sourceUrl?: string | undefined;
  source: string;
  retrieval: RetrievalDisclosure;
};

/** Retrieval disclosure attached to every result (SPEC §5.2 `ranking`). */
export type RankingDisclosure = RankingSummary & {
  indexGeneratedAt: string;
  indexAgeDays: number | null;
  stale: boolean;
  /** "committed" needed no network to rank; "fetched" reached the named source. */
  indexOrigin: "committed" | "fetched";
  source: string;
};

export type SkippedCandidate = {
  id: string;
  name: string;
  reason: string;
};

export type SuiteAttempt = {
  suiteId: string;
  totalComponents: number;
  succeededComponents: number;
  failedComponents: string[];
  rootHasOwnSource: boolean;
  rootInstalled: boolean;
  ok: boolean;
};

export type SummonOutcome = {
  query: string;
  surface: SummonSurface;
  source: string;
  summoned: InstalledSkill[];
  /** Populated only for `preview: true`. Nothing was written to disk. */
  previewed: PreviewedSkill[];
  /** Non-null when summon declined. It never returns the best of a bad set (#104). */
  noMatch: Decision["noMatch"];
  /** Every candidate withheld, with the reason. 80 of 274 skills are unreachable. */
  filtered: Decision["filtered"];
  /** `(top − next) / top` — the Ultra controller reads this (SPEC §6.2). */
  margin: number;
  skipped: SkippedCandidate[];
  suites: SuiteAttempt[];
  sessionRoot: string;
  ranking: RankingDisclosure;
  cards: string[];
  /** Wall-clock time for this whole invocation, seconds with ms precision. */
  totalSeconds: number;
};

type InstallContext = {
  session: SummonSession;
  registry: readonly NamedSkill[];
  payloadCache: PayloadCache;
  ranking: RankingDisclosure;
  disclosures: Map<string, RetrievalDisclosure>;
};

type InstallOutcome = {
  ok: boolean;
  installed: InstalledSkill[];
  suites: SuiteAttempt[];
  reason?: string;
};

/**
 * Rank candidates for `query`, then walk the ranking installing winners
 * (install-parity: clone, validate, materialize the whole skill directory,
 * recursing into suiteComponents) into `session` until `limit` successful
 * top-level installs is reached. A candidate that fails to install — in
 * whole or, for a suite, in part — is skipped (with a reason) in favor of
 * the next-best candidate, rather than failing the whole summon. Partial
 * suite materializations are not rolled back; they stay on disk and in
 * `summoned`, mirroring install.py's own manifest side effects on partial
 * suite failure.
 */
export async function summon(
  service: GaiaService,
  session: SummonSession,
  { query, limit = DEFAULT_LIMIT, surface = "hell", source, preview = false }: SummonOptions,
): Promise<SummonOutcome> {
  const runStartedAt = startTiming();
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    throw new Error("Summon query must not be empty.");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Summon count must be a positive integer, got: ${limit}`,
    );
  }

  // The session root exists before anything else so that a `noMatch` and a
  // `preview` are logged too — the Ultra controller needs the gaps that
  // returned nothing at least as much as the ones that returned a skill.
  await reapSessions({ excludeRoots: [session.root] });
  await session.ensureRoots();

  // Offline-first: the committed index is the read path (SPEC §2.2). Only an
  // explicit `source` we hold no index for reaches the network, and it fails
  // loudly rather than falling back to the configured source.
  const resolved = await service.skillIndex(source);
  const decision = decide({
    index: resolved.index,
    query: trimmedQuery,
    ranked: new Bm25fRanker(resolved.index).rank(trimmedQuery),
    surface,
    source: resolved.source,
  });
  const ranking = disclose(resolved, decision);
  const registry = resolved.index.docs.map(toNamedSkill);
  const disclosures = disclosureById(decision, trimmedQuery);

  if (decision.noMatch) {
    const outcome: SummonOutcome = {
      query: trimmedQuery,
      surface,
      source: resolved.source,
      summoned: [],
      previewed: [],
      noMatch: decision.noMatch,
      filtered: decision.filtered,
      margin: 0,
      skipped: [],
      suites: [],
      sessionRoot: session.root,
      ranking,
      cards: [],
      totalSeconds: elapsedSeconds(runStartedAt),
    };
    await appendSummonLog(session, outcome);
    return outcome;
  }

  if (preview) {
    // Rank and disclose, no disk write. A flag rather than a second tool,
    // because agent tool-selection accuracy degrades as the surface grows
    // (SPEC §5.1).
    const outcome: SummonOutcome = {
      query: trimmedQuery,
      surface,
      source: resolved.source,
      summoned: [],
      previewed: decision.admitted.slice(0, limit).map((hit) => ({
        id: hit.doc.id,
        name: hit.doc.name,
        ...(hit.doc.title ? { title: hit.doc.title } : {}),
        description: hit.doc.description,
        ...(hit.doc.level ? { level: hit.doc.level } : {}),
        ...(hit.doc.links.github ? { sourceUrl: hit.doc.links.github } : {}),
        source: resolved.source,
        retrieval: disclosures.get(hit.doc.id) as RetrievalDisclosure,
      })),
      noMatch: null,
      filtered: decision.filtered,
      margin: decision.margin,
      skipped: [],
      suites: [],
      sessionRoot: session.root,
      ranking,
      cards: [],
      totalSeconds: elapsedSeconds(runStartedAt),
    };
    await appendSummonLog(session, outcome);
    return outcome;
  }

  const candidates = decision.admitted.map((hit) => hit.doc);

  const ctx: InstallContext = {
    session,
    registry,
    payloadCache: new PayloadCache(),
    ranking,
    disclosures,
  };
  const summoned: InstalledSkill[] = [];
  const skipped: SkippedCandidate[] = [];
  const suites: SuiteAttempt[] = [];
  let successCount = 0;

  for (const candidate of candidates) {
    if (successCount >= limit) break;

    const outcome = await installSkill(candidate.id, ctx, new Set());
    summoned.push(...outcome.installed);
    suites.push(...outcome.suites);

    if (outcome.ok) {
      successCount++;
    } else {
      skipped.push({
        id: candidate.id,
        name: candidate.name,
        reason: outcome.reason ?? "install failed",
      });
    }
  }

  const outcome: SummonOutcome = {
    query: trimmedQuery,
    surface,
    source: resolved.source,
    summoned,
    previewed: [],
    noMatch: null,
    filtered: decision.filtered,
    margin: decision.margin,
    skipped,
    suites,
    sessionRoot: session.root,
    ranking,
    cards: summoned.map((skill) => skill.card),
    totalSeconds: elapsedSeconds(runStartedAt),
  };
  await appendSummonLog(session, outcome);
  return outcome;
}

function disclose(resolved: ResolvedIndex, decision: Decision): RankingDisclosure {
  const { index } = resolved;
  const floorNote =
    decision.floor === null
      ? "no calibrated relevance floor in this index — summon cannot yet decline on relevance"
      : `candidates below the calibrated floor (${decision.floor.toFixed(2)}) are refused, not returned`;
  return {
    // Heaven/Hell stamps are not built. Routing is relevance only, and this
    // string is the surface that has to keep saying so.
    mode: "relevance-only",
    trustFields: [],
    disclosure:
      `Ranked by BM25F over the committed skill index; ${floorNote}. ` +
      "The tree publishes no behavioural stamps, so no trust ordering is applied.",
    indexGeneratedAt: index.generatedAt,
    indexAgeDays: indexAgeDays(index),
    stale: isStale(index),
    indexOrigin: resolved.origin,
    source: resolved.source,
  };
}

/**
 * `nameMatchesQuery` is false when the summoned skill is not the one the query
 * named. #104 is exactly this case going unremarked, so it is computed once
 * here and printed on the card.
 */
function disclosureById(decision: Decision, query: string): Map<string, RetrievalDisclosure> {
  const normalizedQuery = normalize(query);
  return new Map(
    decision.admitted.map((hit) => [
      hit.doc.id,
      {
        score: Math.round(hit.score * 10_000) / 10_000,
        margin: decision.margin,
        matchKind: hit.matchKind,
        nameMatchesQuery:
          normalize(hit.doc.name) === normalizedQuery ||
          normalize(hit.doc.id) === normalizedQuery ||
          normalize(hit.doc.catalogRef ?? "") === normalizedQuery ||
          normalizedQuery.includes(normalize(hit.doc.name)),
      },
    ]),
  );
}

/** The index carries everything install needs; nothing else has to be fetched. */
function toNamedSkill(doc: IndexedSkill): NamedSkill {
  return {
    id: doc.id,
    name: doc.name,
    ...(doc.title ? { title: doc.title } : {}),
    contributor: doc.contributor,
    ...(doc.genericSkillRef ? { genericSkillRef: doc.genericSkillRef } : {}),
    ...(doc.catalogRef ? { catalogRef: doc.catalogRef } : {}),
    ...(doc.invocation === "any" ? {} : { invocation: doc.invocation }),
    origin: "tree",
    status: "named",
    ...(doc.level ? { level: doc.level } : {}),
    description: doc.description,
    tags: doc.tags,
    links: { ...doc.links },
    ...(doc.suiteComponents.length > 0 ? { suiteComponents: doc.suiteComponents } : {}),
    evidence: [],
    ...(doc.trust.trustNumber === undefined ? {} : { trustMagnitude: doc.trust.trustNumber }),
    ...(doc.trust.grade ? { overallTrustGrade: doc.trust.grade } : {}),
    ...(doc.registryOnly ? { installable: false } : {}),
  };
}

/**
 * Install one named skill by reference, expanding suiteComponents
 * recursively. Mirrors install.py's `install_skill`: `visited` is keyed on
 * the raw reference string exactly as passed in (not the canonical id), so
 * a component listed twice under different aliases is not deduplicated —
 * this matches the ported behavior exactly rather than "improving" on it.
 */
async function installSkill(
  ref: string,
  ctx: InstallContext,
  visited: Set<string>,
  viaSuite?: string,
): Promise<InstallOutcome> {
  if (visited.has(ref)) return { ok: true, installed: [], suites: [] };
  visited.add(ref);

  let resolved: NamedSkill | undefined;
  try {
    resolved = resolveNamedSkillReference(ref, ctx.registry);
  } catch (error) {
    return {
      ok: false,
      installed: [],
      suites: [],
      reason: errorMessage(error),
    };
  }
  if (!resolved) {
    return {
      ok: false,
      installed: [],
      suites: [],
      reason: `Skill '${ref}' not found in registry.`,
    };
  }

  const suiteComponents = resolved.suiteComponents ?? [];
  if (suiteComponents.length > 0) {
    return installSuite(resolved, suiteComponents, ctx, visited, viaSuite);
  }

  return installSingle(resolved, ctx, viaSuite);
}

/**
 * Resolve a skill reference the way install.py's
 * `resolve_named_skill_reference` does: exact id, then unambiguous
 * catalogRef, then unambiguous bare name (id with the contributor prefix
 * stripped). Ambiguous matches throw, matching Python's ValueError.
 */
function resolveNamedSkillReference(
  ref: string,
  registry: readonly NamedSkill[],
): NamedSkill | undefined {
  const cleaned = ref.replace(/^\/+/, "");

  const exact = registry.find((skill) => skill.id === cleaned);
  if (exact) return exact;

  const catalogMatches = registry.filter(
    (skill) => skill.catalogRef === cleaned,
  );
  if (catalogMatches.length === 1) return catalogMatches[0];
  if (catalogMatches.length > 1) {
    throw new Error(`Ambiguous slug '${cleaned}' matches multiple skills.`);
  }

  const bareMatches = registry.filter((skill) => {
    const slash = skill.id.indexOf("/");
    return slash !== -1 && skill.id.slice(slash + 1) === cleaned;
  });
  if (bareMatches.length === 1) return bareMatches[0];
  if (bareMatches.length > 1) {
    throw new Error(
      `Ambiguous bare name '${cleaned}' matches multiple skills.`,
    );
  }

  return undefined;
}

/**
 * Recursive suite install, mirroring install.py's `install_suite`: install
 * every component (via installSkill, so nested suites recurse correctly),
 * then — if the suite root itself carries its own links.github — install
 * the root too via installSingle directly (bypassing installSkill/visited,
 * exactly as `_install_single` is called directly in the Python to avoid
 * infinite recursion). Success requires every attempted component AND the
 * root (if attempted) to succeed.
 *
 * Each materialized skill is recorded into the session manifest exactly
 * once, at its point of creation in installSingle — `viaSuite` is threaded
 * down as a parameter (this suite's id for components, the caller's
 * viaSuite for this suite's own root) rather than re-recorded here, so a
 * nested suite's leaves are never double-recorded.
 */
async function installSuite(
  suiteSkill: NamedSkill,
  components: readonly string[],
  ctx: InstallContext,
  visited: Set<string>,
  viaSuite: string | undefined,
): Promise<InstallOutcome> {
  const installed: InstalledSkill[] = [];
  const nestedSuites: SuiteAttempt[] = [];
  const failed: string[] = [];
  let succeededComponents = 0;

  for (const componentRef of components) {
    const result = await installSkill(
      componentRef,
      ctx,
      visited,
      suiteSkill.id,
    );
    installed.push(...result.installed);
    nestedSuites.push(...result.suites);
    if (result.ok) {
      succeededComponents++;
    } else {
      const componentMeta = resolveSafely(componentRef, ctx.registry);
      const isNestedSuite = (componentMeta?.suiteComponents?.length ?? 0) > 0;
      failed.push(
        isNestedSuite
          ? `${componentRef} (nested suite — see above)`
          : componentRef,
      );
    }
  }

  const rootHasOwnSource = Boolean(suiteSkill.links.github);
  let rootInstalled = false;
  if (rootHasOwnSource) {
    const rootResult = await installSingle(suiteSkill, ctx, viaSuite);
    if (rootResult.ok) {
      rootInstalled = true;
      installed.push(...rootResult.installed);
    } else {
      failed.push(suiteSkill.id);
    }
  }

  const ok = failed.length === 0;
  const totalAttempted = components.length + (rootHasOwnSource ? 1 : 0);
  const succeededAttempted = succeededComponents + (rootInstalled ? 1 : 0);
  const suite: SuiteAttempt = {
    suiteId: suiteSkill.id,
    totalComponents: components.length,
    succeededComponents,
    failedComponents: failed,
    rootHasOwnSource,
    rootInstalled,
    ok,
  };

  return {
    ok,
    installed,
    suites: [...nestedSuites, suite],
    ...(ok
      ? {}
      : {
          reason: `Suite ${suiteSkill.id}: ${succeededAttempted}/${totalAttempted} installed. Failed: ${failed.join(", ")}`,
        }),
  };
}

function resolveSafely(
  ref: string,
  registry: readonly NamedSkill[],
): NamedSkill | undefined {
  try {
    return resolveNamedSkillReference(ref, registry);
  } catch {
    return undefined;
  }
}

/**
 * Install one payload. A commit-addressed retention hit is copied directly;
 * a miss uses a transient full shallow clone which is discarded in `finally`.
 * The source subpath is always validated before the session records success.
 */
async function installSingle(
  skill: NamedSkill,
  ctx: InstallContext,
  viaSuite?: string,
): Promise<InstallOutcome> {
  const skillStartedAt = startTiming();
  if (skill.installable === false) {
    return {
      ok: false,
      installed: [],
      suites: [],
      reason: `Skill '${skill.id}' is marked registry-only (installable: false).`,
    };
  }

  const githubUrl =
    typeof skill.links.github === "string" ? skill.links.github : undefined;
  if (!githubUrl) {
    return {
      ok: false,
      installed: [],
      suites: [],
      reason: `Skill '${skill.id}' has no source repository link.`,
    };
  }

  const { repoUrl, branch, subpath } = parseGithubUrl(githubUrl);
  const resident = [...ctx.session.skills]
    .reverse()
    .find((record) => record.id === skill.id && record.sourceUrl === githubUrl);
  if (resident && (await isResidentPayload(ctx.session, resident.path))) {
    const base: Omit<InstalledSkill, "card"> = {
      ...installedTrust(skill),
      id: skill.id,
      name: skill.name,
      contributor: skill.contributor,
      ...(skill.invocation ? { invocation: skill.invocation } : {}),
      ...(skill.origin ? { origin: skill.origin } : {}),
      sourceUrl: githubUrl,
      repoUrl,
      branch,
      subpath,
      path: resident.path,
      fileCount: resident.fileCount,
      sha256: resident.sha256,
      cacheState: "warm",
      cache: "warm",
      cacheSource: "session",
      inspectUrl: inspectUrl(githubUrl, repoUrl),
      source: ctx.ranking.source,
      ...(ctx.disclosures.get(skill.id) ? { retrieval: ctx.disclosures.get(skill.id) } : {}),
      cloneSeconds: 0,
      materializeSeconds: 0,
      totalSeconds: elapsedSeconds(skillStartedAt),
    };
    const installedSkill: InstalledSkill = {
      ...base,
      card: renderSummonCard(base, ctx.ranking),
    };
    return { ok: true, installed: [installedSkill], suites: [] };
  }

  const sourceStartedAt = startTiming();
  let resolvedCommit: string;
  try {
    resolvedCommit = await resolveRemoteCommit(repoUrl, branch);
  } catch (error) {
    return {
      ok: false,
      installed: [],
      suites: [],
      reason: `Could not resolve ${repoUrl}: ${errorMessage(error)}`,
    };
  }

  const requestedIdentity = { repoUrl, commit: resolvedCommit, subpath };
  let sourceSkillPath = await ctx.payloadCache.lookup(requestedIdentity);
  let retainedIdentity = requestedIdentity;
  let cacheState: "cold" | "warm" = "warm";
  let cacheSource: "remote" | "payload" = "payload";
  let transientClone: string | undefined;

  try {
    if (!sourceSkillPath) {
      cacheState = "cold";
      cacheSource = "remote";
      const cacheOwner = skill.id.split("/", 1)[0] ?? skill.contributor;
      const repoName = (repoUrl.split("/").pop() ?? repoUrl).replace(
        /\.git$/,
        "",
      );
      const cacheDir = path.join(ctx.session.cacheRoot, cacheOwner, repoName);
      transientClone = cacheDir;
      let cloneOutcome;
      try {
        cloneOutcome = await ensureCachedRepo(cacheDir, repoUrl, branch);
      } catch (error) {
        return {
          ok: false,
          installed: [],
          suites: [],
          reason: `Could not clone ${repoUrl}: ${errorMessage(error)}`,
        };
      }
      sourceSkillPath = path.join(cloneOutcome.path, subpath);
      retainedIdentity = { repoUrl, commit: cloneOutcome.commit, subpath };
    }

    let sourceStat;
    try {
      sourceStat = await stat(sourceSkillPath);
    } catch {
      return {
        ok: false,
        installed: [],
        suites: [],
        reason: `subpath '${subpath}' not found in ${repoUrl}; the link may be stale.`,
      };
    }
    if (!sourceStat.isDirectory()) {
      return {
        ok: false,
        installed: [],
        suites: [],
        reason: `links.github for '${skill.id}' points at a file, not a skill directory (${sourceSkillPath}).`,
      };
    }
    if (!(await pathExists(path.join(sourceSkillPath, "SKILL.md")))) {
      return {
        ok: false,
        installed: [],
        suites: [],
        reason: `no SKILL.md at ${sourceSkillPath}.`,
      };
    }

    const cloneSeconds = elapsedSeconds(sourceStartedAt);
    const safeId = skill.id.replaceAll("/", "__");
    const destDir = path.join(ctx.session.skillsRoot, safeId);
    let materializeOutcome;
    try {
      materializeOutcome = await materializeSkillDir(sourceSkillPath, destDir);
    } catch (error) {
      return {
        ok: false,
        installed: [],
        suites: [],
        reason: `Could not materialize ${sourceSkillPath}: ${errorMessage(error)}`,
      };
    }

    if (cacheState === "cold") {
      await ctx.payloadCache
        .store(retainedIdentity, materializeOutcome.path)
        .catch(() => false);
    }

    const base: Omit<InstalledSkill, "card"> = {
      ...installedTrust(skill),
      id: skill.id,
      name: skill.name,
      contributor: skill.contributor,
      ...(skill.invocation ? { invocation: skill.invocation } : {}),
      ...(skill.origin ? { origin: skill.origin } : {}),
      sourceUrl: githubUrl,
      repoUrl,
      branch,
      subpath,
      path: materializeOutcome.path,
      fileCount: materializeOutcome.fileCount,
      sha256: materializeOutcome.sha256,
      cacheState,
      cache: cacheState,
      cacheSource,
      inspectUrl: inspectUrl(githubUrl, repoUrl),
      source: ctx.ranking.source,
      ...(ctx.disclosures.get(skill.id) ? { retrieval: ctx.disclosures.get(skill.id) } : {}),
      cloneSeconds,
      materializeSeconds: materializeOutcome.materializeSeconds,
      totalSeconds: elapsedSeconds(skillStartedAt),
    };
    const installedSkill: InstalledSkill = {
      ...base,
      card: renderSummonCard(base, ctx.ranking),
    };

    await ctx.session.recordSkill(installedSkill, { viaSuite });
    return { ok: true, installed: [installedSkill], suites: [] };
  } finally {
    if (transientClone) await discardCachedRepo(transientClone);
  }
}

function installedTrust(
  skill: NamedSkill,
): Pick<InstalledSkill, "level" | "trustMagnitude" | "stars" | "trust"> {
  const publishedTrust = trustFields(skill);
  const stars = starCount(skill.level);
  return {
    ...(skill.level === undefined ? {} : { level: skill.level }),
    ...(skill.trustMagnitude === undefined
      ? {}
      : { trustMagnitude: skill.trustMagnitude }),
    ...(stars < 0 ? {} : { stars }),
    ...(Object.keys(publishedTrust).length === 0
      ? {}
      : { trust: publishedTrust }),
  };
}

async function isResidentPayload(
  session: SummonSession,
  payloadPath: string,
): Promise<boolean> {
  const relative = path.relative(
    path.resolve(session.skillsRoot),
    path.resolve(payloadPath),
  );
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  return pathExists(path.join(payloadPath, "SKILL.md"));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
