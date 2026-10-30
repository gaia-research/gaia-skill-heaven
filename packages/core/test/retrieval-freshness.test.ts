import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSkillIndex,
  expansionFingerprint,
  sha256,
  type NamedProjection,
} from "../src/retrieval/build-index.js";
import { assertSkillIndex, type SkillIndex } from "../src/retrieval/schema.js";
import {
  FRESHNESS_ISSUE_MARKER,
  evaluateIndexFreshness,
  extractFreshnessFingerprint,
  planFreshnessIssueAction,
  renderFreshnessIssue,
} from "../scripts/lib/index-freshness.js";

const baseProjection: NamedProjection = {
  generatedAt: "2026-10-30",
  buckets: {
    "automated-testing": [
      {
        id: "acme/alpha",
        name: "Alpha",
        title: "Alpha Tester",
        contributor: "acme",
        genericSkillRef: "automated-testing",
        description: "Runs deterministic alpha checks.",
        tags: ["testing"],
        level: "3★",
        overallTrustGrade: "A",
        trustMagnitude: 80,
        links: { github: "https://github.com/acme/alpha/blob/main/SKILL.md" },
      },
      {
        id: "acme/beta",
        name: "Beta",
        title: "Beta Runner",
        contributor: "acme",
        genericSkillRef: "automated-testing",
        description: "Runs beta integration suites.",
        tags: ["ci"],
        level: "2★",
        links: { github: "https://github.com/acme/beta/blob/main/SKILL.md" },
      },
    ],
  },
  awaitingClassification: [
    {
      id: "acme/unclassified",
      name: "Unclassified",
      contributor: "acme",
      description: "Awaiting bucket assignment.",
      links: { github: "https://github.com/acme/unclassified/blob/main/SKILL.md" },
    },
  ],
};

function makeIndex(projection: NamedProjection = baseProjection): SkillIndex {
  const skills = [
    ...Object.values(projection.buckets).flat(),
    ...(projection.awaitingClassification ?? []),
  ];
  const expansions = Object.fromEntries(
    skills.map((skill) => [
      skill.id,
      {
        expansions: [`need help with ${skill.name.toLowerCase()} workflow`],
        expandedBy: "test/0.1.0",
        expandedFrom: expansionFingerprint(skill),
      },
    ]),
  );
  return buildSkillIndex({
    projection,
    source: "https://gaiaskilltree.com",
    sourceDigest: sha256(JSON.stringify(projection)),
    sourceRevision: "dc07528884a759dbd3668d4a0007469265ab396f",
    sourceVersion: "v8.29.1",
    sourceWorkflow: "gaia-skill-tree/scripts/generateNamedIndex.py -> docs/graph/named/index.json",
    builderVersion: "test/0.1.0",
    generatedAt: "2026-10-30T00:00:00.000Z",
    expansions,
  });
}

describe("evaluateIndexFreshness", () => {
  it("reports fresh when age is within threshold and upstream skills match", () => {
    const index = makeIndex();
    const report = evaluateIndexFreshness({
      index,
      upstream: {
        projection: baseProjection,
        digest: index.sourceDigest,
        version: "v8.29.1",
        revision: "dc07528884a759dbd3668d4a0007469265ab396f",
      },
      now: new Date("2026-11-10T00:00:00.000Z"),
    });

    expect(report.status).toBe("fresh");
    expect(report.reasons).toEqual([]);
    expect(report.committed.staleByAge).toBe(false);
    expect(report.committed.ageDays).toBe(11);
    expect(report.comparison).toMatchObject({
      sameDigest: true,
      sameVersion: true,
      sameRevision: true,
      skillDriftCount: 0,
      driftedBySkills: false,
      missingIds: [],
      removedIds: [],
      staleFingerprintIds: [],
    });
    expect(report.comparison.currentIds).toEqual([
      "acme/alpha",
      "acme/beta",
      "acme/unclassified",
    ]);
  });

  it("flags stale_age when the committed index exceeds STALE_AFTER_DAYS even with zero skill drift", () => {
    const index = makeIndex();
    const report = evaluateIndexFreshness({
      index,
      upstream: {
        projection: baseProjection,
        digest: index.sourceDigest,
        version: "v8.29.1",
        revision: "dc07528884a759dbd3668d4a0007469265ab396f",
      },
      now: new Date("2026-12-05T00:00:00.000Z"),
    });

    expect(report.status).toBe("action_needed");
    expect(report.reasons).toEqual(["stale_age"]);
    expect(report.committed.staleByAge).toBe(true);
    expect(report.committed.ageDays).toBe(36);
    expect(report.comparison.skillDriftCount).toBe(0);
  });

  it("detects missing upstream skills across both buckets and awaitingClassification", () => {
    const index = makeIndex();
    const movedUpstream: NamedProjection = {
      ...baseProjection,
      buckets: {
        ...baseProjection.buckets,
        "automated-testing": [
          ...(baseProjection.buckets["automated-testing"] ?? []),
          {
            id: "acme/new-bucketed",
            name: "New Bucketed",
            contributor: "acme",
            description: "Newly added bucketed skill.",
          },
        ],
      },
      awaitingClassification: [
        ...(baseProjection.awaitingClassification ?? []),
        {
          id: "acme/new-awaiting",
          name: "New Awaiting",
          contributor: "acme",
          description: "Newly added awaiting skill.",
        },
      ],
    };

    const report = evaluateIndexFreshness({
      index,
      upstream: {
        projection: movedUpstream,
        version: "v8.30.0",
        revision: "1".repeat(40),
      },
      now: new Date("2026-11-02T00:00:00.000Z"),
    });

    expect(report.status).toBe("action_needed");
    expect(report.reasons).toEqual(["missing_skills"]);
    expect(report.comparison.missingIds).toEqual(["acme/new-awaiting", "acme/new-bucketed"]);
    expect(report.comparison.removedIds).toEqual([]);
    expect(report.comparison.skillDriftCount).toBe(2);
  });

  it("detects removed upstream skills that remain orphaned in the committed index", () => {
    const index = makeIndex();
    const trimmedUpstream: NamedProjection = {
      ...baseProjection,
      buckets: {
        "automated-testing": [baseProjection.buckets["automated-testing"]![0]!],
      },
      awaitingClassification: [],
    };

    const report = evaluateIndexFreshness({
      index,
      upstream: {
        projection: trimmedUpstream,
        version: "v8.30.0",
        revision: "2".repeat(40),
      },
      now: new Date("2026-11-02T00:00:00.000Z"),
    });

    expect(report.status).toBe("action_needed");
    expect(report.reasons).toEqual(["removed_skills"]);
    expect(report.comparison.removedIds).toEqual(["acme/beta", "acme/unclassified"]);
    expect(report.comparison.missingIds).toEqual([]);
  });

  it("distinguishes capability-text fingerprint drift from prestige-only updates", () => {
    const index = makeIndex();
    const prestigeAndTextUpdated: NamedProjection = {
      ...baseProjection,
      buckets: {
        "automated-testing": [
          {
            // Only prestige fields changed on acme/alpha -> fingerprint must NOT change
            ...baseProjection.buckets["automated-testing"]![0]!,
            level: "5★",
            overallTrustGrade: "S",
            trustMagnitude: 99,
          },
          {
            // Description changed on acme/beta -> fingerprint MUST be reported stale
            ...baseProjection.buckets["automated-testing"]![1]!,
            description: "Rewritten beta integration description.",
          },
        ],
      },
    };

    const report = evaluateIndexFreshness({
      index,
      upstream: {
        projection: prestigeAndTextUpdated,
        version: "v8.29.2",
        revision: "3".repeat(40),
      },
      now: new Date("2026-11-02T00:00:00.000Z"),
    });

    expect(report.comparison.staleFingerprintIds).toEqual(["acme/beta"]);
    expect(report.comparison.currentIds).toContain("acme/alpha");
  });

  it("honors maxSkillDrift when a higher drift threshold is configured", () => {
    const index = makeIndex();
    const oneAdded: NamedProjection = {
      ...baseProjection,
      awaitingClassification: [
        ...(baseProjection.awaitingClassification ?? []),
        { id: "acme/extra", name: "Extra", contributor: "acme", description: "One new skill." },
      ],
    };

    const belowThreshold = evaluateIndexFreshness({
      index,
      upstream: { projection: oneAdded },
      now: new Date("2026-11-02T00:00:00.000Z"),
      maxSkillDrift: 5,
    });
    expect(belowThreshold.status).toBe("fresh");
    expect(belowThreshold.comparison.driftedBySkills).toBe(false);
    expect(belowThreshold.comparison.missingIds).toEqual(["acme/extra"]);
  });

  it("confirms the real committed index is fresh against the committed corpus snapshot", () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    const committedIndex = JSON.parse(
      readFileSync(join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
    );
    assertSkillIndex(committedIndex);
    const snapshot = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "bench", "corpus", "named-projection.json"), "utf8"),
    ) as NamedProjection & {
      snapshot: { digest: string; sourceVersion?: string; sourceRevision?: string };
    };

    const report = evaluateIndexFreshness({
      index: committedIndex,
      upstream: {
        projection: snapshot,
        digest: snapshot.snapshot.digest,
        version: snapshot.snapshot.sourceVersion,
        revision: snapshot.snapshot.sourceRevision,
      },
      now: new Date(committedIndex.generatedAt),
    });

    expect(report.status).toBe("fresh");
    expect(report.committed.docs).toBe(400);
    expect(report.upstream.docs).toBe(400);
    expect(report.comparison.missingIds).toEqual([]);
    expect(report.comparison.removedIds).toEqual([]);
    expect(report.comparison.staleFingerprintIds).toEqual([]);
  });
});

describe("planFreshnessIssueAction (idempotency and duplicate prevention)", () => {
  const index = makeIndex();
  const driftedUpstream: NamedProjection = {
    ...baseProjection,
    buckets: {
      "automated-testing": [
        baseProjection.buckets["automated-testing"]![0]!,
        { id: "acme/gamma", name: "Gamma", contributor: "acme", description: "Added skill." },
      ],
    },
  };

  it("never opens or updates an issue when the index is fresh", () => {
    const freshReport = evaluateIndexFreshness({
      index,
      upstream: { projection: baseProjection, digest: index.sourceDigest, version: "v8.29.1" },
      now: new Date("2026-11-05T00:00:00.000Z"),
    });
    expect(planFreshnessIssueAction(freshReport, [])).toEqual({
      kind: "noop",
      reason: "index_is_fresh",
      existingIssueNumber: null,
      duplicateIssueNumbers: [],
    });
  });

  it("creates one tracking issue when drift is detected and no open monitor issue exists", () => {
    const report = evaluateIndexFreshness({
      index,
      upstream: { projection: driftedUpstream, version: "v8.30.0", revision: "a".repeat(40) },
      now: new Date("2026-11-05T00:00:00.000Z"),
    });

    const action = planFreshnessIssueAction(report, [
      { number: 42, title: "Unrelated open issue", body: "Nothing about freshness here", state: "open" },
      { number: 12, title: "[retrieval-freshness] Old closed issue", body: FRESHNESS_ISSUE_MARKER, state: "closed" },
    ]);

    expect(action.kind).toBe("create");
    if (action.kind === "create") {
      expect(action.body).toContain(FRESHNESS_ISSUE_MARKER);
      expect(action.body).toContain("`acme/gamma`");
      expect(action.body).toContain("`acme/beta`");
      expect(extractFreshnessFingerprint(action.body)).toBe(report.stateFingerprint);
    }
  });

  it("returns noop when the open tracking issue already has the same drift fingerprint across weekly runs", () => {
    const week1 = evaluateIndexFreshness({
      index,
      upstream: { projection: driftedUpstream, version: "v8.30.0", revision: "a".repeat(40) },
      now: new Date("2026-11-05T00:00:00.000Z"),
    });
    const created = renderFreshnessIssue(week1);

    // A week later, wall-clock age moved from 6d to 13d, but neither the
    // staleness threshold nor the upstream drift set changed.
    const week2 = evaluateIndexFreshness({
      index,
      upstream: { projection: driftedUpstream, version: "v8.30.0", revision: "a".repeat(40) },
      now: new Date("2026-11-12T00:00:00.000Z"),
    });

    const action = planFreshnessIssueAction(week2, [
      { number: 220, title: created.title, body: created.body, state: "open" },
    ]);

    expect(action).toEqual({
      kind: "noop",
      reason: "issue_already_up_to_date",
      existingIssueNumber: 220,
      duplicateIssueNumbers: [],
    });
  });

  it("updates the existing canonical issue instead of creating a duplicate when drift changes", () => {
    const initial = evaluateIndexFreshness({
      index,
      upstream: { projection: driftedUpstream, version: "v8.30.0", revision: "a".repeat(40) },
      now: new Date("2026-11-05T00:00:00.000Z"),
    });
    const initialRendered = renderFreshnessIssue(initial);

    // Later run crosses the 30-day staleness boundary AND sees a new release v8.31.0
    const later = evaluateIndexFreshness({
      index,
      upstream: { projection: driftedUpstream, version: "v8.31.0", revision: "b".repeat(40) },
      now: new Date("2026-12-10T00:00:00.000Z"),
    });

    const action = planFreshnessIssueAction(later, [
      { number: 250, title: "Duplicate monitor issue", body: FRESHNESS_ISSUE_MARKER, state: "open" },
      { number: 220, title: initialRendered.title, body: initialRendered.body, state: "open" },
    ]);

    expect(action.kind).toBe("update");
    if (action.kind === "update") {
      expect(action.issueNumber).toBe(220);
      expect(action.duplicateIssueNumbers).toEqual([250]);
      expect(action.title).toContain("v8.31.0");
      expect(action.body).toContain("`stale_age`");
    }
  });
});

describe("retrieval-freshness workflow contract", () => {
  it("runs weekly, stays read-only on repository contents, and asserts a clean worktree", () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    const workflow = readFileSync(
      join(repoRoot, ".github", "workflows", "retrieval-freshness.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/schedule:\s*\n\s*#[^\n]*\n\s*-\s*cron:/);
    expect(workflow).toMatch(/contents:\s*read/);
    expect(workflow).toMatch(/issues:\s*write/);
    expect(workflow).not.toMatch(/contents:\s*write/);
    expect(workflow).not.toMatch(/git\s+(commit|push)/);
    expect(workflow).toMatch(/git diff --exit-code/);
  });
});
