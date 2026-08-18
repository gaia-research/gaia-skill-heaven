import { describe, expect, it, vi } from "vitest";

import { HttpGaiaRegistrySource } from "../src/index.js";

describe("HttpGaiaRegistrySource", () => {
  it("loads and caches the two public Gaia projections", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("named.json")
        ? {
            generatedAt: "2026-07-16",
            buckets: {
              testing: [
                {
                  id: "example/health",
                  name: "Health",
                  contributor: "example",
                  genericSkillRef: "testing",
                  status: "named",
                  level: "2★",
                  description: "Runs tests.",
                  catalogRef: "example-health",
                  tags: [],
                  links: {},
                  evidence: [],
                },
              ],
            },
          }
        : {
            generatedAt: "2026-07-16T00:00:00Z",
            skills: [
              {
                id: "testing",
                name: "Testing",
                type: "basic",
                description: "Runs tests.",
                prerequisites: [],
                derivatives: [],
                evidence: [],
                status: "active",
              },
            ],
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const source = new HttpGaiaRegistrySource({
      genericUrl: "https://example.test/generic.json",
      namedUrl: "https://example.test/named.json",
      fetchFn,
      now: () => new Date("2026-07-16T12:00:00Z"),
    });

    const first = await source.load();
    const second = await source.load();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(first.generic.skills[0]?.id).toBe("testing");
    expect(first.named.buckets.testing?.[0]?.id).toBe("example/health");
    expect(first.source).toEqual({
      genericUrl: "https://example.test/generic.json",
      namedUrl: "https://example.test/named.json",
      fetchedAt: "2026-07-16T12:00:00.000Z",
    });
    expect(second).toEqual(first);
  });

  it("rejects an explicitly unsupported contract with remediation", async () => {
    const source = new HttpGaiaRegistrySource({
      fetchFn: async () =>
        new Response(JSON.stringify({ contractVersion: "gaia-public-v2" }), {
          status: 200,
        }),
    });

    await expect(source.load()).rejects.toThrow(
      /supports gaia-public-v1; install a compatible skill-summon version/i,
    );
  });

  it("rejects an incomplete generic projection with recovery guidance", async () => {
    const source = new HttpGaiaRegistrySource({
      genericUrl: "https://example.test/generic.json",
      namedUrl: "https://example.test/named.json",
      fetchFn: async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith("named.json")
              ? { generatedAt: "2026-07-16", buckets: {} }
              : { generatedAt: "2026-07-16T00:00:00Z", skills: [] },
          ),
          { status: 200 },
        ),
    });

    await expect(source.load()).rejects.toThrow(
      /contains no skills.*restore\/regenerate/i,
    );
  });

  it("rejects cross-projection references from different builds", async () => {
    const source = new HttpGaiaRegistrySource({
      genericUrl: "https://example.test/generic.json",
      namedUrl: "https://example.test/named.json",
      fetchFn: async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith("named.json")
              ? {
                  generatedAt: "2026-07-16",
                  buckets: {
                    missing: [
                      {
                        id: "example/orphan",
                        name: "Orphan",
                        contributor: "example",
                        genericSkillRef: "missing",
                        status: "named",
                        level: "2★",
                        description: "References a missing generic skill.",
                        tags: [],
                        links: {},
                        evidence: [],
                      },
                    ],
                  },
                }
              : {
                  generatedAt: "2026-07-16T00:00:00Z",
                  skills: [
                    {
                      id: "testing",
                      name: "Testing",
                      type: "basic",
                      description: "Runs tests.",
                      prerequisites: [],
                      derivatives: [],
                      evidence: [],
                      status: "active",
                    },
                  ],
                },
          ),
          { status: 200 },
        ),
    });

    await expect(source.load()).rejects.toThrow(
      /references a missing generic skill.*same Gaia build/i,
    );
  });
});
