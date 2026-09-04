import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSkillIndex,
  deriveTerms,
  isInstallableLink,
  isReachable,
  sha256,
  type NamedProjection,
} from "../src/retrieval/build-index.js";
import { assertSkillIndex, indexAgeDays, isStale, SkillIndexError } from "../src/retrieval/schema.js";

const projection: NamedProjection = {
  buckets: {
    "automated-testing": [
      {
        id: "garrytan/health",
        name: "Health",
        title: "Gstack Health",
        contributor: "garrytan",
        genericSkillRef: "automated-testing",
        catalogRef: "garrytan-health",
        description: "Executes the full automated test suite.",
        tags: ["ci", "quality"],
        level: "2★",
        overallTrustGrade: "B",
        trustMagnitude: 70,
        links: { github: "https://github.com/garrytan/gstack/blob/main/health/SKILL.md" },
      },
      {
        id: "acme/no-source",
        name: "No Source",
        contributor: "acme",
        description: "A skill nobody can install.",
        links: { github: "https://github.com/acme/repo" },
      },
    ],
  },
  awaitingClassification: [
    { id: "someone/unclassified", name: "Unclassified", description: "Not bucketed." },
  ],
};

const options = {
  projection,
  source: "https://gaiaskilltree.com",
  sourceDigest: sha256("test"),
  builderVersion: "test/0.0.0",
  generatedAt: "2026-09-03T00:00:00.000Z",
};

describe("buildSkillIndex", () => {
  it("indexes unbucketed skills too, and flags them as unclassified", () => {
    const index = buildSkillIndex(options);
    // Reading `buckets` only made 52 real skills unsummonable for a reason
    // that has nothing to do with whether they are any good: the tree had not
    // filed them under a generic node yet. They are indexed, and the card
    // says the classification is missing.
    expect(index.docs.map((doc) => doc.id)).toEqual([
      "acme/no-source",
      "garrytan/health",
      "someone/unclassified",
    ]);
    expect(index.docs.find((doc) => doc.id === "someone/unclassified")?.classified).toBe(false);
    expect(index.docs.find((doc) => doc.id === "garrytan/health")?.classified).toBe(true);
    expect(index.stats.awaitingClassification).toBe(1);
  });

  it("marks a skill uninstallable when links.github is not a SKILL.md", () => {
    const index = buildSkillIndex(options);
    expect(index.docs.find((doc) => doc.id === "acme/no-source")?.installable).toBe(false);
    expect(index.docs.find((doc) => doc.id === "garrytan/health")?.installable).toBe(true);
    expect(index.stats.unreachable).toBe(2);
  });

  it("counts a linkless suite root as reachable — its components carry the payloads", () => {
    const withSuite = buildSkillIndex({
      ...options,
      projection: {
        buckets: {
          suites: [
            {
              id: "addy-osmani/agent-skills",
              name: "Agent Skills",
              contributor: "addy-osmani",
              description: "A suite.",
              links: { github: "https://github.com/addyosmani/agent-skills/blob/main/README.md" },
              suiteComponents: ["addy-osmani/code-review-and-quality"],
            },
          ],
        },
      },
    });
    const doc = withSuite.docs[0];
    expect(doc?.installable).toBe(false);
    expect(isReachable(doc as never)).toBe(true);
    expect(withSuite.stats.unreachable).toBe(0);
  });

  it("is deterministic — the same snapshot serializes identically", () => {
    expect(JSON.stringify(buildSkillIndex(options))).toBe(JSON.stringify(buildSkillIndex(options)));
  });

  it("never rewrites the contributor description", () => {
    const index = buildSkillIndex(options);
    expect(index.docs.find((doc) => doc.id === "garrytan/health")?.description).toBe(
      "Executes the full automated test suite.",
    );
  });

  it("reports expansion:none until a generation batch is supplied", () => {
    expect(buildSkillIndex(options).builder.expansion).toBe("none");
    const expanded = buildSkillIndex({
      ...options,
      expansions: {
        "garrytan/health": {
          expansions: ["did anything break after my last change"],
          expandedBy: "test/0.0.0",
        },
      },
    });
    expect(expanded.builder.expansion).toBe("generated");
    expect(
      expanded.docs.find((doc) => doc.id === "garrytan/health")?.retrieval.expandedBy,
    ).toBe("test/0.0.0");
  });

  it("counts how many documents carry expansions — partial coverage is not neutral", () => {
    expect(buildSkillIndex(options).stats.expandedDocs).toBe(0);
    const partial = buildSkillIndex({
      ...options,
      expansions: {
        "garrytan/health": { expansions: ["did anything break"], expandedBy: "test/0.0.0" },
      },
    });
    // An expanded document has a field to match in that an unexpanded one does
    // not, so a half-expanded index demotes the half without it. The count is
    // carried so that gap cannot hide.
    expect(partial.stats.expandedDocs).toBe(1);
    expect(partial.stats.docs).toBe(3);
  });

  it("leaves the floor uncalibrated rather than guessing one", () => {
    expect(buildSkillIndex(options).stats.floor).toBeNull();
  });
});

describe("deriveTerms", () => {
  it("stays empty without expansions — otherwise it silently doubles field weights", () => {
    const index = buildSkillIndex(options);
    expect(index.docs.every((doc) => doc.retrieval.terms.length === 0)).toBe(true);
  });

  it("collects content terms once expansions exist", () => {
    const index = buildSkillIndex({
      ...options,
      expansions: {
        "garrytan/health": { expansions: ["did anything break in it"], expandedBy: "test/0.0.0" },
      },
    });
    const doc = index.docs.find((entry) => entry.id === "garrytan/health");
    expect(doc?.retrieval.terms).toContain("break");
    expect(doc?.retrieval.terms).toContain("health");
    // Tokens of two characters or fewer carry no retrieval signal and are dropped.
    expect(doc?.retrieval.terms).not.toContain("in");
    expect(doc?.retrieval.terms).not.toContain("it");
  });

  it("returns nothing for a document with no expansions", () => {
    const index = buildSkillIndex(options);
    expect(deriveTerms(index.docs[0] as never)).toEqual([]);
  });
});

describe("isInstallableLink", () => {
  it("accepts SKILL.md blobs and raw hosts, refuses bare repos", () => {
    expect(isInstallableLink({ github: "https://github.com/a/b/blob/main/x/SKILL.md" })).toBe(true);
    expect(isInstallableLink({ github: "https://raw.githubusercontent.com/a/b/main/x" })).toBe(true);
    expect(isInstallableLink({ github: "https://github.com/a/b" })).toBe(false);
    expect(isInstallableLink({})).toBe(false);
    expect(
      isInstallableLink({ github: "https://github.com/a/b/blob/main/SKILL.md", installable: false }),
    ).toBe(false);
  });
});

describe("assertSkillIndex", () => {
  it("rejects an unknown schema rather than ranking on it", () => {
    expect(() => assertSkillIndex({ schema: "gaia.skill-index/v2", docs: [{ id: "a" }] })).toThrow(
      SkillIndexError,
    );
  });

  it("accepts the committed index", () => {
    const raw = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "..", "..", "plugins", "skill-heaven", "data", "skill-index.json"),
        "utf8",
      ),
    );
    expect(() => assertSkillIndex(raw)).not.toThrow();
  });
});

describe("staleness", () => {
  const index = buildSkillIndex(options);

  it("reports age in days and flags past the threshold", () => {
    expect(indexAgeDays(index, new Date("2026-09-13T00:00:00.000Z"))).toBeCloseTo(10, 6);
    expect(isStale(index, new Date("2026-09-13T00:00:00.000Z"))).toBe(false);
    expect(isStale(index, new Date("2026-11-13T00:00:00.000Z"))).toBe(true);
  });
});
