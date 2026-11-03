// Read-only retrieval index freshness and upstream drift evaluation (#216).
//
// Compares the committed retrieval index (`plugins/skill-heaven/data/skill-index.json`)
// against a canonical upstream Tree named projection (`docs/graph/named/index.json`).
// Never mutates the index, snapshot, expansions, or floor: expansion generation
// and floor calibration stay explicitly reviewed steps (SPEC §2.2, §3.3).

import { createHash } from "node:crypto";

import {
  allProjectionSkills,
  expansionFingerprint,
  sha256,
  type NamedProjection,
} from "../../src/retrieval/build-index.js";
import {
  STALE_AFTER_DAYS,
  assertSkillIndex,
  indexAgeDays,
  isStale,
  type SkillIndex,
} from "../../src/retrieval/schema.js";

export const FRESHNESS_ISSUE_MARKER =
  "<!-- skill-heaven:retrieval-freshness-monitor:v1 -->" as const;
export const FRESHNESS_FINGERPRINT_PREFIX =
  "<!-- skill-heaven:retrieval-freshness-fingerprint:" as const;
export const FRESHNESS_ISSUE_TITLE_PREFIX = "[retrieval-freshness]" as const;

export type FreshnessReason = "stale_age" | "missing_skills" | "removed_skills";

export type UpstreamProjectionInput = {
  projection: NamedProjection;
  /** Raw bytes or precomputed `sha256:...` digest of the upstream projection. */
  digest?: string | undefined;
  rawBytes?: string | Uint8Array | undefined;
  version?: string | undefined;
  revision?: string | undefined;
};

export type EvaluateFreshnessOptions = {
  index: SkillIndex;
  upstream: UpstreamProjectionInput;
  now?: Date | undefined;
  /** Defaults to `STALE_AFTER_DAYS` (30). */
  maxAgeDays?: number | undefined;
  /** Minimum `missing + removed` skill count that triggers drift. Defaults to 1. */
  maxSkillDrift?: number | undefined;
};

export type IndexFreshnessReport = {
  status: "fresh" | "action_needed";
  reasons: FreshnessReason[];
  checkedAt: string;
  thresholds: {
    maxAgeDays: number;
    maxSkillDrift: number;
  };
  committed: {
    generatedAt: string;
    ageDays: number | null;
    staleByAge: boolean;
    sourceVersion: string | null;
    sourceRevision: string | null;
    sourceDigest: string;
    docs: number;
  };
  upstream: {
    generatedAt: string | null;
    version: string | null;
    revision: string | null;
    digest: string;
    docs: number;
    bucketed: number;
    awaitingClassification: number;
  };
  comparison: {
    sameDigest: boolean;
    sameVersion: boolean | null;
    sameRevision: boolean | null;
    skillDriftCount: number;
    driftedBySkills: boolean;
    currentIds: string[];
    missingIds: string[];
    removedIds: string[];
    staleFingerprintIds: string[];
  };
  /**
   * Deterministic digest of the actionable drift state (excluding `checkedAt`
   * and fractional `ageDays` wall-clock movement) so weekly runs with unchanged
   * drift state do not churn the tracking issue.
   */
  stateFingerprint: string;
};

export type ExistingIssueSummary = {
  number: number;
  title: string;
  body?: string | null | undefined;
  state?: string | undefined;
};

export type FreshnessIssueAction =
  | {
      kind: "noop";
      reason: "index_is_fresh" | "issue_already_up_to_date";
      existingIssueNumber: number | null;
      duplicateIssueNumbers: number[];
    }
  | {
      kind: "create";
      title: string;
      body: string;
      fingerprint: string;
    }
  | {
      kind: "update";
      issueNumber: number;
      title: string;
      body: string;
      fingerprint: string;
      duplicateIssueNumbers: number[];
    };

export function evaluateIndexFreshness({
  index,
  upstream,
  now = new Date(),
  maxAgeDays = STALE_AFTER_DAYS,
  maxSkillDrift = 1,
}: EvaluateFreshnessOptions): IndexFreshnessReport {
  assertSkillIndex(index);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new Error(`maxAgeDays must be a positive number, got: ${maxAgeDays}`);
  }
  if (!Number.isInteger(maxSkillDrift) || maxSkillDrift < 1) {
    throw new Error(`maxSkillDrift must be a positive integer, got: ${maxSkillDrift}`);
  }

  const upstreamDigest =
    upstream.digest ??
    (upstream.rawBytes !== undefined
      ? sha256(upstream.rawBytes)
      : sha256(JSON.stringify(upstream.projection)));

  const upstreamSkills = allProjectionSkills(upstream.projection);
  const upstreamById = new Map(upstreamSkills.map((skill) => [skill.id, skill]));
  const committedById = new Map(index.docs.map((doc) => [doc.id, doc]));

  const missingIds: string[] = [];
  const staleFingerprintIds: string[] = [];
  const currentIds: string[] = [];

  for (const [id, skill] of upstreamById) {
    const doc = committedById.get(id);
    if (!doc) {
      missingIds.push(id);
      continue;
    }
    const recordedFp = doc.retrieval.expandedFrom;
    if (recordedFp !== undefined && recordedFp !== expansionFingerprint(skill)) {
      staleFingerprintIds.push(id);
    } else {
      currentIds.push(id);
    }
  }

  const removedIds: string[] = [];
  for (const id of committedById.keys()) {
    if (!upstreamById.has(id)) {
      removedIds.push(id);
    }
  }

  missingIds.sort();
  removedIds.sort();
  staleFingerprintIds.sort();
  currentIds.sort();

  const rawAge = indexAgeDays(index, now);
  const ageDays = rawAge !== null && Number.isFinite(rawAge) ? Math.round(rawAge * 100) / 100 : null;
  const staleByAge =
    maxAgeDays === STALE_AFTER_DAYS
      ? isStale(index, now)
      : rawAge === null || rawAge > maxAgeDays;
  const skillDriftCount = missingIds.length + removedIds.length;
  const driftedBySkills = skillDriftCount >= maxSkillDrift;

  const reasons: FreshnessReason[] = [];
  if (staleByAge) reasons.push("stale_age");
  if (missingIds.length > 0 && driftedBySkills) reasons.push("missing_skills");
  if (removedIds.length > 0 && driftedBySkills) reasons.push("removed_skills");

  const status = reasons.length > 0 ? "action_needed" : "fresh";

  const committedVersion = index.sourceVersion ?? null;
  const committedRevision = index.sourceRevision ?? null;
  const upstreamVersion = upstream.version ?? null;
  const upstreamRevision = upstream.revision ?? null;

  const sameDigest = index.sourceDigest === upstreamDigest;
  const sameVersion =
    committedVersion !== null && upstreamVersion !== null
      ? committedVersion === upstreamVersion
      : null;
  const sameRevision =
    committedRevision !== null && upstreamRevision !== null
      ? committedRevision === upstreamRevision
      : null;

  const stateFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        status,
        reasons,
        committedVersion,
        committedRevision,
        committedDigest: index.sourceDigest,
        upstreamVersion,
        upstreamRevision,
        upstreamDigest,
        missingIds,
        removedIds,
        staleFingerprintIds,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  const bucketedCount = Object.values(upstream.projection.buckets ?? {}).flat().length;
  const awaitingCount = (upstream.projection.awaitingClassification ?? []).length;

  return {
    status,
    reasons,
    checkedAt: now.toISOString(),
    thresholds: {
      maxAgeDays,
      maxSkillDrift,
    },
    committed: {
      generatedAt: index.generatedAt,
      ageDays,
      staleByAge,
      sourceVersion: committedVersion,
      sourceRevision: committedRevision,
      sourceDigest: index.sourceDigest,
      docs: index.stats.docs,
    },
    upstream: {
      generatedAt: upstream.projection.generatedAt ?? null,
      version: upstreamVersion,
      revision: upstreamRevision,
      digest: upstreamDigest,
      docs: upstreamSkills.length,
      bucketed: bucketedCount,
      awaitingClassification: awaitingCount,
    },
    comparison: {
      sameDigest,
      sameVersion,
      sameRevision,
      skillDriftCount,
      driftedBySkills,
      currentIds,
      missingIds,
      removedIds,
      staleFingerprintIds,
    },
    stateFingerprint,
  };
}

export function extractFreshnessFingerprint(body: string | null | undefined): string | null {
  if (!body) return null;
  const start = body.indexOf(FRESHNESS_FINGERPRINT_PREFIX);
  if (start === -1) return null;
  const valueStart = start + FRESHNESS_FINGERPRINT_PREFIX.length;
  const end = body.indexOf("-->", valueStart);
  if (end === -1) return null;
  const value = body.slice(valueStart, end).trim();
  return value.length > 0 ? value : null;
}

export function isFreshnessMonitorIssue(issue: ExistingIssueSummary): boolean {
  if (issue.state && issue.state.toLowerCase() !== "open") return false;
  const body = issue.body ?? "";
  if (body.includes(FRESHNESS_ISSUE_MARKER)) return true;
  return issue.title.startsWith(FRESHNESS_ISSUE_TITLE_PREFIX);
}

export function renderFreshnessIssue(report: IndexFreshnessReport): {
  title: string;
  body: string;
  fingerprint: string;
} {
  const cVer = report.committed.sourceVersion ?? "unpinned";
  const uVer = report.upstream.version ?? "latest";
  const summaryParts: string[] = [];
  if (report.comparison.missingIds.length > 0) {
    summaryParts.push(`${report.comparison.missingIds.length} missing`);
  }
  if (report.comparison.removedIds.length > 0) {
    summaryParts.push(`${report.comparison.removedIds.length} removed`);
  }
  if (report.committed.staleByAge) {
    const ageLabel =
      report.committed.ageDays === null
        ? "invalid timestamp"
        : `${Math.floor(report.committed.ageDays)}d old`;
    summaryParts.push(ageLabel);
  }
  const detail = summaryParts.length > 0 ? summaryParts.join(", ") : "drift detected";
  const title = `${FRESHNESS_ISSUE_TITLE_PREFIX} Committed retrieval index drift (${cVer} vs ${uVer}: ${detail})`;

  const formatList = (ids: readonly string[]): string => {
    if (ids.length === 0) return "_None._";
    return ids.map((id) => `- \`${id}\``).join("\n");
  };

  const revHint = report.upstream.revision ?? "<upstream-commit-sha>";
  const verHint = report.upstream.version ?? "<upstream-release-tag>";

  const body = [
    FRESHNESS_ISSUE_MARKER,
    `${FRESHNESS_FINGERPRINT_PREFIX}${report.stateFingerprint} -->`,
    "## Summary",
    "",
    "Read-only weekly retrieval freshness monitor detected that `plugins/skill-heaven/data/skill-index.json` requires a controlled refresh.",
    "No files were modified or published automatically: expansion generation and floor calibration must stay reviewed (`docs/SPEC.md` §3.3, `docs/EVIDENCE.md`).",
    "",
    "## Measured state",
    "",
    "| Surface | Version | Revision | Digest | Docs | Generated |",
    "|---|---|---|---|---:|---|",
    `| Committed index | \`${report.committed.sourceVersion ?? "—"}\` | \`${report.committed.sourceRevision ?? "—"}\` | \`${report.committed.sourceDigest.slice(0, 19)}\` | ${report.committed.docs} | \`${report.committed.generatedAt}\` |`,
    `| Upstream Tree | \`${report.upstream.version ?? "—"}\` | \`${report.upstream.revision ?? "—"}\` | \`${report.upstream.digest.slice(0, 19)}\` | ${report.upstream.docs} (${report.upstream.bucketed} bucketed + ${report.upstream.awaitingClassification} awaiting) | \`${report.upstream.generatedAt ?? "—"}\` |`,
    "",
    `- **Index age:** ${report.committed.ageDays === null ? "invalid" : `${report.committed.ageDays} days`} (threshold: ${report.thresholds.maxAgeDays} days, \`staleByAge: ${report.committed.staleByAge}\`)`,
    `- **Missing upstream skills (unsummonable):** ${report.comparison.missingIds.length}`,
    `- **Removed upstream skills (still ranked):** ${report.comparison.removedIds.length}`,
    `- **Stale expansion fingerprints:** ${report.comparison.staleFingerprintIds.length}`,
    `- **Trigger reasons:** ${report.reasons.map((r) => `\`${r}\``).join(", ") || "none"}`,
    "",
    "### Missing upstream skills",
    "",
    formatList(report.comparison.missingIds),
    "",
    "### Removed upstream skills (orphaned in index)",
    "",
    formatList(report.comparison.removedIds),
    "",
    "### Stale expansion fingerprints (text changed upstream)",
    "",
    formatList(report.comparison.staleFingerprintIds),
    "",
    "## Controlled refresh procedure",
    "",
    "```bash",
    "npx tsx packages/core/scripts/snapshot-corpus.ts \\",
    "  --source-file /path/to/named-generated.json \\",
    `  --source-revision ${revHint} \\`,
    `  --source-version ${verHint} \\`,
    "  --source-workflow 'gaia-skill-tree/scripts/generateNamedIndex.py -> docs/graph/named/index.json'",
    "npx tsx packages/core/scripts/expansion-plan.ts --emit-batches 6",
    "# Generate missing/stale expansions into packages/core/bench/corpus/expansions.raw.jsonl",
    "npx tsx packages/core/scripts/filter-expansions.ts --in packages/core/bench/corpus/expansions.raw.jsonl --rank-cutoff none",
    "npx tsx packages/core/scripts/build-skill-index.ts",
    "npx tsx packages/core/scripts/calibrate-floor.ts && npx tsx packages/core/scripts/build-skill-index.ts",
    "npx tsx packages/core/scripts/build-arbor-identity.ts --tree /path/to/gaia-skill-tree",
    "npm run build:mcp",
    "npx tsx packages/core/bench/run.ts --calibrate",
    "```",
  ].join("\n");

  return { title, body, fingerprint: report.stateFingerprint };
}

/**
 * Decide the single idempotent GitHub issue action for a freshness report.
 *
 * - Never opens or updates an issue when `report.status === "fresh"`.
 * - Matches existing open monitor issues by `FRESHNESS_ISSUE_MARKER` (or title
 *   prefix), picking the lowest-numbered open issue as canonical and reporting
 *   any extra open monitor issues in `duplicateIssueNumbers` instead of opening
 *   more.
 * - Returns `noop` with `issue_already_up_to_date` when the canonical open issue
 *   already carries the exact `stateFingerprint` and `title`.
 */
export function planFreshnessIssueAction(
  report: IndexFreshnessReport,
  openIssues: readonly ExistingIssueSummary[],
): FreshnessIssueAction {
  const matching = openIssues
    .filter(isFreshnessMonitorIssue)
    .sort((left, right) => left.number - right.number);

  const canonical = matching[0] ?? null;
  const duplicateIssueNumbers = matching.slice(1).map((issue) => issue.number);

  if (report.status === "fresh") {
    return {
      kind: "noop",
      reason: "index_is_fresh",
      existingIssueNumber: canonical?.number ?? null,
      duplicateIssueNumbers,
    };
  }

  const rendered = renderFreshnessIssue(report);
  if (!canonical) {
    return {
      kind: "create",
      title: rendered.title,
      body: rendered.body,
      fingerprint: rendered.fingerprint,
    };
  }

  const existingFp = extractFreshnessFingerprint(canonical.body);
  if (existingFp === rendered.fingerprint && canonical.title === rendered.title) {
    return {
      kind: "noop",
      reason: "issue_already_up_to_date",
      existingIssueNumber: canonical.number,
      duplicateIssueNumbers,
    };
  }

  return {
    kind: "update",
    issueNumber: canonical.number,
    title: rendered.title,
    body: rendered.body,
    fingerprint: rendered.fingerprint,
    duplicateIssueNumbers,
  };
}
