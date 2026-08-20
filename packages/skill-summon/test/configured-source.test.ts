import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SKILL_SOURCE,
  resolveSkillSource,
  treeProjectionUrls,
} from "../src/data/configured-source.js";
import type { GaiaRegistrySource } from "../src/data/source.js";

const generic = {
  generatedAt: "2026-08-20T00:00:00.000Z",
  skills: [
    {
      id: "fixture",
      name: "Fixture",
      type: "basic",
      description: "Fixture skill.",
      prerequisites: [],
      derivatives: [],
      status: "active",
      evidence: [],
    },
  ],
};
const named = {
  generatedAt: "2026-08-20T00:00:00.000Z",
  buckets: {
    fixture: [
      {
        id: "fixture/named",
        name: "Named Fixture",
        contributor: "fixture",
        genericSkillRef: "fixture",
        status: "named",
        description: "Named fixture skill.",
        tags: ["fixture"],
        links: { github: "https://github.com/example/fixture/blob/main/SKILL.md" },
        evidence: [],
      },
    ],
  },
};

describe("one Skill URL", () => {
  it("derives both tree projections from the default website root", () => {
    expect(treeProjectionUrls(DEFAULT_SKILL_SOURCE)).toEqual({
      genericUrl: "https://gaiaskilltree.com/graph/gaia.json",
      namedUrl: "https://gaiaskilltree.com/graph/named/index.json",
    });
  });

  it("derives custom website projections and records the root", async () => {
    const requested: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      return new Response(JSON.stringify(url.endsWith("gaia.json") ? generic : named));
    }) as typeof fetch;
    const resolution = resolveSkillSource({
      env: { SKILL_SOURCE: "https://skills.example/team/" },
      fetchFn,
    });
    const snapshot = await resolution.source.load();
    expect(requested).toEqual([
      "https://skills.example/team/graph/gaia.json",
      "https://skills.example/team/graph/named/index.json",
    ]);
    expect(snapshot.source).toMatchObject({
      kind: "tree",
      rootUrl: "https://skills.example/team",
    });
  });

  it("falls back safely when a client passes an untranslated setting placeholder", () => {
    const resolution = resolveSkillSource({
      env: { SKILL_SOURCE: "${user_config.skill_url}" },
    });
    expect(resolution).toMatchObject({
      kind: "tree",
      sourceUrl: DEFAULT_SKILL_SOURCE,
      legacy: false,
    });
  });

  it("routes GitHub repositories to the flat fleet adapter", () => {
    const marker: GaiaRegistrySource = { load: vi.fn() };
    const fleetFactory = vi.fn(() => marker);
    const resolution = resolveSkillSource({
      env: { SKILL_SOURCE: "https://github.com/mattpocock/skills" },
      fleetFactory,
    });
    expect(resolution).toMatchObject({
      kind: "fleet",
      sourceUrl: "https://github.com/mattpocock/skills",
      source: marker,
      legacy: false,
    });
    expect(fleetFactory).toHaveBeenCalledWith("https://github.com/mattpocock/skills");
  });

  it("keeps the paired variables as deprecated migration compatibility", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) =>
      new Response(JSON.stringify(String(input).includes("generic") ? generic : named)),
    ) as typeof fetch;
    const resolution = resolveSkillSource({
      env: {
        TREE_URL: "https://legacy.example/generic.json",
        TREE_NAMED_URL: "https://legacy.example/named.json",
      },
      fetchFn,
    });
    const snapshot = await resolution.source.load();
    expect(resolution.legacy).toBe(true);
    expect(snapshot.source.legacy).toBe(true);
  });
});
