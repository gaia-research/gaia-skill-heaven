import { describe, expect, it } from "vitest";

import {
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";

const documents: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Runs test suites and explains failures.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "active",
      },
      {
        id: "web-search",
        name: "Web Search",
        type: "basic",
        description: "Finds information on the web.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "active",
      },
    ],
  },
  named: {
    generatedAt: "2026-07-16",
    buckets: {
      "automated-testing": [
        {
          id: "example/health",
          name: "Health",
          title: "Health — Automated Test Runner",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          level: "2★",
          description: "Executes automated tests and reports failures.",
          catalogRef: "example-health",
          tags: ["automated-testing", "quality"],
          links: {
            github: "https://github.com/example/health/blob/main/SKILL.md",
          },
          evidence: [],
          trustMagnitude: 36,
          overallTrustGrade: "C",
          type: "extra",
        },
      ],
    },
  },
};

describe("GaiaService search", () => {
  it("returns relevant generic and Named Skills with source metadata", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });

    const result = await service.search({ query: "automated testing" });

    expect(result.results.map((skill) => [skill.kind, skill.id])).toEqual([
      ["generic", "automated-testing"],
      ["named", "example/health"],
    ]);
    expect(result.results[1]).toMatchObject({
      genericSkillRef: "automated-testing",
      trustMagnitude: 36,
      overallTrustGrade: "C",
    });
    expect(result.meta).toMatchObject({
      contractVersion: "gaia-public-v1",
      freshness: "fresh",
      genericGeneratedAt: "2026-07-16T00:00:00Z",
      namedGeneratedAt: "2026-07-16",
    });
  });

  it("filters by level, Trust Magnitude, contributor, tier, and installability", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });

    const result = await service.search({
      query: "health testing",
      kinds: ["named"],
      tiers: ["extra"],
      minStars: 2,
      minTrustMagnitude: 30,
      contributors: ["example"],
      installable: true,
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        id: "example/health",
        contributor: "example",
        installable: true,
      }),
    ]);
  });
});
