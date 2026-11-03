#!/usr/bin/env node
// Read-only retrieval index freshness monitor (#216).
//
//   npx tsx packages/core/scripts/check-index-freshness.ts
//   npx tsx packages/core/scripts/check-index-freshness.ts --upstream-file /path/to/index.json --upstream-version v8.29.1 --upstream-revision dc075288...
//   npx tsx packages/core/scripts/check-index-freshness.ts --reconcile-issue --apply-issue --repo gaia-research/gaia-skill-heaven
//
// Compares the committed retrieval index (`plugins/skill-heaven/data/skill-index.json`)
// with the latest released `gaia-skill-tree` named projection. Never modifies
// or commits repository files.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, type NamedProjection } from "../src/retrieval/build-index.js";
import { STALE_AFTER_DAYS, assertSkillIndex } from "../src/retrieval/schema.js";
import {
  evaluateIndexFreshness,
  planFreshnessIssueAction,
  type ExistingIssueSummary,
  type FreshnessIssueAction,
  type IndexFreshnessReport,
} from "./lib/index-freshness.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const defaultIndexPath = join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json");

const indexPath = argValue("--index-file") ?? defaultIndexPath;
const upstreamFile = argValue("--upstream-file");
const upstreamUrl = argValue("--upstream-url");
const upstreamRepo = argValue("--upstream-repo") ?? "gaia-research/gaia-skill-tree";
const upstreamVersionArg = argValue("--upstream-version");
const upstreamRevisionArg = argValue("--upstream-revision");
const maxAgeDays = Number(argValue("--max-age-days") ?? String(STALE_AFTER_DAYS));
const maxSkillDrift = Number(argValue("--max-skill-drift") ?? "1");
const nowArg = argValue("--now");
const issuesFile = argValue("--issues-file");
const reconcileIssue = argFlag("--reconcile-issue");
const applyIssue = argFlag("--apply-issue");
const targetRepo =
  argValue("--repo") ?? process.env.GITHUB_REPOSITORY ?? "gaia-research/gaia-skill-heaven";
const jsonOutput = argFlag("--json");
const failOnStale = argFlag("--fail-on-stale");

const rawIndex = JSON.parse(readFileSync(indexPath, "utf8"));
assertSkillIndex(rawIndex);

const resolvedUpstream = await resolveUpstream();
const report = evaluateIndexFreshness({
  index: rawIndex,
  upstream: resolvedUpstream,
  now: nowArg ? new Date(nowArg) : new Date(),
  maxAgeDays,
  maxSkillDrift,
});

let issueAction: FreshnessIssueAction | undefined;
let appliedIssueUrl: string | undefined;

if (issuesFile || reconcileIssue) {
  const openIssues = issuesFile
    ? (JSON.parse(readFileSync(issuesFile, "utf8")) as ExistingIssueSummary[])
    : await fetchOpenIssues(targetRepo);
  issueAction = planFreshnessIssueAction(report, openIssues);
  if (applyIssue && (issueAction.kind === "create" || issueAction.kind === "update")) {
    appliedIssueUrl = await applyGitHubIssueAction(targetRepo, issueAction);
  }
}

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        report,
        ...(issueAction ? { issueAction } : {}),
        ...(appliedIssueUrl ? { appliedIssueUrl } : {}),
      },
      null,
      2,
    ),
  );
} else {
  printHumanReport(report, issueAction, appliedIssueUrl);
}

if (failOnStale && report.status !== "fresh") {
  process.exit(1);
}

async function resolveUpstream(): Promise<{
  projection: NamedProjection;
  rawBytes: string;
  digest: string;
  version?: string | undefined;
  revision?: string | undefined;
}> {
  if (upstreamFile) {
    const rawBytes = readFileSync(upstreamFile, "utf8");
    return {
      projection: JSON.parse(rawBytes) as NamedProjection,
      rawBytes,
      digest: sha256(rawBytes),
      version: upstreamVersionArg,
      revision: upstreamRevisionArg,
    };
  }

  if (upstreamUrl) {
    const rawBytes = await fetchText(upstreamUrl);
    return {
      projection: JSON.parse(rawBytes) as NamedProjection,
      rawBytes,
      digest: sha256(rawBytes),
      version: upstreamVersionArg,
      revision: upstreamRevisionArg,
    };
  }

  // Default: resolve the latest non-draft release from gaia-skill-tree,
  // dereference its commit SHA, and fetch docs/graph/named/index.json at that
  // immutable commit.
  const releases = await fetchGitHubJson<
    Array<{ tag_name: string; draft: boolean; prerelease: boolean }>
  >(`https://api.github.com/repos/${upstreamRepo}/releases?per_page=10`);
  const latestRelease = releases.find((rel) => !rel.draft && rel.tag_name);
  if (!latestRelease) {
    throw new Error(`No non-draft release found in ${upstreamRepo}`);
  }
  const version = upstreamVersionArg ?? latestRelease.tag_name;
  const commitInfo = await fetchGitHubJson<{ sha: string }>(
    `https://api.github.com/repos/${upstreamRepo}/commits/${encodeURIComponent(version)}`,
  );
  const revision = upstreamRevisionArg ?? commitInfo.sha;
  const rawUrl = `https://raw.githubusercontent.com/${upstreamRepo}/${revision}/docs/graph/named/index.json`;
  const rawBytes = await fetchText(rawUrl);

  return {
    projection: JSON.parse(rawBytes) as NamedProjection,
    rawBytes,
    digest: sha256(rawBytes),
    version,
    revision,
  };
}

async function fetchOpenIssues(repo: string): Promise<ExistingIssueSummary[]> {
  const issues: ExistingIssueSummary[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await fetchGitHubJson<
      Array<{
        number: number;
        title: string;
        body?: string | null;
        state?: string;
        pull_request?: unknown;
      }>
    >(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    for (const item of batch) {
      if (item.pull_request !== undefined) continue;
      issues.push({
        number: item.number,
        title: item.title,
        body: item.body ?? "",
        state: item.state ?? "open",
      });
    }
    if (batch.length < 100) break;
  }
  return issues;
}

async function applyGitHubIssueAction(
  repo: string,
  action: Extract<FreshnessIssueAction, { kind: "create" | "update" }>,
): Promise<string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error("--apply-issue requires GITHUB_TOKEN or GH_TOKEN in the environment.");
  }
  const url =
    action.kind === "create"
      ? `https://api.github.com/repos/${repo}/issues`
      : `https://api.github.com/repos/${repo}/issues/${action.issueNumber}`;
  const method = action.kind === "create" ? "POST" : "PATCH";
  const response = await fetch(url, {
    method,
    headers: {
      ...githubHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: action.title,
      body: action.body,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${url} failed (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { html_url: string };
  return payload.html_url;
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "user-agent": "gaia-skill-heaven-freshness-monitor/1.0",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "gaia-skill-heaven-freshness-monitor/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function printHumanReport(
  r: IndexFreshnessReport,
  action?: FreshnessIssueAction,
  issueUrl?: string,
): void {
  const lines = [
    `status            ${r.status}${r.reasons.length > 0 ? ` (${r.reasons.join(", ")})` : ""}`,
    `committed         ${r.committed.sourceVersion ?? "unpinned"} @ ${(r.committed.sourceRevision ?? "unpinned").slice(0, 12)} (${r.committed.docs} docs, generated ${r.committed.generatedAt}, age ${r.committed.ageDays ?? "invalid"}d)`,
    `upstream          ${r.upstream.version ?? "unpinned"} @ ${(r.upstream.revision ?? "unpinned").slice(0, 12)} (${r.upstream.docs} docs: ${r.upstream.bucketed} bucketed + ${r.upstream.awaitingClassification} awaiting)`,
    `digest match      ${r.comparison.sameDigest}`,
    `current           ${r.comparison.currentIds.length}`,
    `missing           ${r.comparison.missingIds.length}`,
    `removed           ${r.comparison.removedIds.length}`,
    `stale fp          ${r.comparison.staleFingerprintIds.length}`,
    `state fp          ${r.stateFingerprint}`,
  ];
  if (action) {
    if (action.kind === "noop") {
      lines.push(
        `issue action      noop (${action.reason}${action.existingIssueNumber ? `, #${action.existingIssueNumber}` : ""})`,
      );
    } else if (action.kind === "create") {
      lines.push(`issue action      create (${action.title})`);
    } else {
      lines.push(`issue action      update #${action.issueNumber} (${action.title})`);
    }
  }
  if (issueUrl) {
    lines.push(`issue url         ${issueUrl}`);
  }
  console.log(lines.join("\n"));
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

function argFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
