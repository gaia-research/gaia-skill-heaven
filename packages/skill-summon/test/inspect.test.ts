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
        prerequisites: ["test-design"],
        derivatives: ["ci-automation"],
        evidence: [
          {
            class: "B",
            source: "https://github.com/example/testing",
            trustNumber: 70,
          },
        ],
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
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          level: "2★",
          description: "Executes automated tests.",
          catalogRef: "example-health",
          tags: ["quality"],
          links: { github: "https://github.com/example/health" },
          evidence: [],
          trustMagnitude: 36,
          overallTrustGrade: "C",
        },
      ],
    },
  },
};

describe("GaiaService inspect", () => {
  it("returns a generic skill dossier and its Named implementations", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });

    const result = await service.inspect("automated-testing");

    expect(result.skill).toMatchObject({
      kind: "generic",
      id: "automated-testing",
      prerequisites: ["test-design"],
      derivatives: ["ci-automation"],
      evidence: [
        {
          class: "B",
          source: "https://github.com/example/testing",
          trustNumber: 70,
        },
      ],
      namedImplementations: [
        {
          id: "example/health",
          trustMagnitude: 36,
          overallTrustGrade: "C",
        },
      ],
    });
    expect(result.meta.contractVersion).toBe("gaia-public-v1");
  });

  it("resolves a Named Skill by id and links it to its generic skill", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });

    const result = await service.inspect("example/health");

    expect(result.skill).toMatchObject({
      kind: "named",
      id: "example/health",
      genericSkillRef: "automated-testing",
      genericSkill: {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        status: "active",
      },
    });
  });
});
