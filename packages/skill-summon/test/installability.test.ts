import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FileInstallabilitySource,
  GaiaInstallabilityAdapter,
  HttpInstallabilitySource,
  InMemoryGaiaRegistrySource,
  StaticInstallabilitySource,
  parseInstallabilityProjection,
  sourceRouteFromUrl,
} from "../src/index.js";
import { GaiaService } from "../src/service.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import type {
  GaiaRegistryDocuments,
  NamedSkill,
} from "../src/domain/types.js";
import {
  assessInstallability,
  type InstallabilityProjection,
  type InstallabilityProjectionSkill,
  type InstallabilitySourceRoute,
} from "skill-zero";
import { summon } from "../src/summon/summon.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const REVISION_A = "1".repeat(40);
const REVISION_B = "2".repeat(40);
const OBSERVATION = "c".repeat(64);
const CHECKED_AT = "2026-09-12T00:00:00Z";
const SOURCE_URL = "https://github.com/example/tools/blob/main/skill/SKILL.md";
const SOURCE_ROUTE = sourceRouteFromUrl(SOURCE_URL) as InstallabilitySourceRoute;

const roots: SummonSession[] = [];

afterEach(async () => {
  for (const session of roots.splice(0)) await session.close();
});

function skill(
  id: string,
  name: string,
  extra: Partial<NamedSkill> = {},
): NamedSkill {
  return {
    id,
    name,
    contributor: id.split("/")[0] ?? "example",
    status: "named",
    description: `${name} capability for testing installability evidence.`,
    tags: ["installability", "testing"],
    links: { github: SOURCE_URL },
    evidence: [],
    ...extra,
  };
}

function documents(skills: NamedSkill[]): GaiaRegistryDocuments {
  return {
    generic: {
      generatedAt: CHECKED_AT,
      skills: [],
    },
    named: {
      generatedAt: CHECKED_AT,
      buckets: { test: skills },
    },
  };
}

function record(
  overrides: Partial<InstallabilityProjectionSkill> = {},
): InstallabilityProjectionSkill {
  return {
    state: "materializable",
    reason: "gaia-materialized",
    observationDigest: OBSERVATION,
    observedAt: CHECKED_AT,
    currentSourceRoute: SOURCE_ROUTE,
    currentSkillContentSha256: HASH_A,
    observedSourceRoute: SOURCE_ROUTE,
    observedSkillContentSha256: HASH_A,
    resolvedRevision: REVISION_A,
    deliveredContentSha256: HASH_B,
    ...overrides,
  };
}

function projection(
  skills: Record<string, InstallabilityProjectionSkill>,
): InstallabilityProjection {
  return {
    schema: "gaia.installability/v1",
    indexPath: "docs/graph/installability/index.json",
    observations: [
      { digest: OBSERVATION, checkedAt: CHECKED_AT, runId: "synthetic-r1" },
    ],
    skills,
  };
}

function adapter(
  document: InstallabilityProjection,
  contexts: Record<string, {
    sourceRoute: InstallabilitySourceRoute | null;
    skillContentSha256?: string | null;
    resolvedRevision?: string | null;
  }>,
): GaiaInstallabilityAdapter {
  return new GaiaInstallabilityAdapter({
    source: new StaticInstallabilitySource(document),
    contextFor: (candidate) => {
      const context = contexts[candidate.id];
      return context === undefined
        ? undefined
        : { id: candidate.id, ...context };
    },
  });
}

async function open(): Promise<SummonSession> {
  const session = await openSession();
  roots.push(session);
  return session;
}

describe("Tree installability projection adapter", () => {
  it("accepts the immutable upstream publication shape as a read-only fixture", async () => {
    const fixturePath = fileURLToPath(
      new URL("./fixtures/upstream-installability-v1.json", import.meta.url),
    );
    const parsed = parseInstallabilityProjection(
      JSON.parse(await readFile(fixturePath, "utf8")),
    );
    expect(parsed.schema).toBe("gaia.installability/v1");
    expect(parsed.skills["garrytan/health"]?.reason).toBe("not-observed");
    expect(parsed.skills["garrytan/health"]?.state).toBe("unknown");
  });

  it("keeps a materializable result when delivered content differs from the canonical comparator content", async () => {
    const candidate = skill("example/materialized", "Materialized");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(
          projection({ [candidate.id]: record() }),
          {
            [candidate.id]: {
              sourceRoute: SOURCE_ROUTE,
              skillContentSha256: HASH_A,
              resolvedRevision: REVISION_A,
            },
          },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "materialized capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "materializable",
      reason: "gaia-materialized",
      applicability: "verified",
      upstream: { deliveredContentSha256: HASH_B },
    });
    expect(outcome.ranking.installability?.status).toBe("applied");
  });

  it("also fails closed at the exported core assessment boundary", () => {
    const id = "example/raw-cast";
    const malformed = projection({ [id]: record({
      observationDigest: null,
      observedAt: null,
      observedSourceRoute: null,
      observedSkillContentSha256: null,
      resolvedRevision: null,
      deliveredContentSha256: null,
    }) });
    const assessment = assessInstallability(
      malformed,
      id,
      { id, sourceRoute: SOURCE_ROUTE, skillContentSha256: HASH_A },
      "tree",
    );
    expect(assessment).toMatchObject({
      state: "unknown",
      reason: "unverified-applicability",
      applicability: "unknown",
      applicabilityReason: "invalid-evidence",
    });
  });

  it("downgrades semantically malformed positive and negative records to unknown", async () => {
    const positive = skill("example/malformed-positive", "Malformed Positive");
    const negative = skill("example/malformed-negative", "Malformed Negative");
    const malformedPositive = record({
      observationDigest: null,
      observedAt: null,
      observedSourceRoute: null,
      observedSkillContentSha256: null,
      resolvedRevision: null,
      deliveredContentSha256: null,
    });
    const malformedNegative = record({
      state: "not-materializable",
      reason: "intrinsic-content-failure",
      observationDigest: HASH_B,
    });
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([positive, negative])),
      {
        installabilityAdapter: adapter(
          projection({
            [positive.id]: malformedPositive,
            [negative.id]: malformedNegative,
          }),
          {
            [positive.id]: {
              sourceRoute: SOURCE_ROUTE,
              skillContentSha256: HASH_A,
            },
            [negative.id]: {
              sourceRoute: SOURCE_ROUTE,
              skillContentSha256: HASH_A,
            },
          },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "malformed",
      preview: true,
      limit: 2,
      surface: "any",
    });

    expect(outcome.filtered).toEqual([]);
    expect(outcome.previewed).toHaveLength(2);
    expect(outcome.previewed.map((item) => item.installability)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: "unknown",
          reason: "unverified-applicability",
          applicabilityReason: "invalid-evidence",
        }),
      ]),
    );
    expect(
      outcome.previewed.find((item) => item.id === negative.id)?.installability,
    ).toMatchObject({
      state: "unknown",
      reason: "unverified-applicability",
      upstream: { observationDigest: HASH_B },
    });
  });

  it("requires an upstream resolved revision for materializable evidence", async () => {
    const candidate = skill("example/missing-revision", "Missing Revision");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(
          projection({ [candidate.id]: record({ resolvedRevision: null }) }),
          {
            [candidate.id]: {
              sourceRoute: SOURCE_ROUTE,
              skillContentSha256: HASH_A,
            },
          },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "missing revision",
      preview: true,
      surface: "any",
    });

    expect(outcome.filtered).toEqual([]);
    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "unknown",
      applicability: "unknown",
      applicabilityReason: "invalid-evidence",
      upstream: { resolvedRevision: null },
    });
  });

  it.each([
    ["source", { sourceRoute: sourceRouteFromUrl("https://github.com/example/other/blob/main/skill/SKILL.md") }],
    ["content", { sourceRoute: SOURCE_ROUTE, skillContentSha256: HASH_B, resolvedRevision: REVISION_A }],
    ["revision", { sourceRoute: SOURCE_ROUTE, skillContentSha256: HASH_A, resolvedRevision: REVISION_B }],
    ["missing version context", { sourceRoute: SOURCE_ROUTE, skillContentSha256: HASH_A }],
  ])("keeps %s mismatch unknown rather than filtering", async (_label, context) => {
    const candidate = skill("example/mismatch", "Mismatch");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(
          projection({ [candidate.id]: record() }),
          { [candidate.id]: context },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "mismatch capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.noMatch).toBeNull();
    expect(outcome.filtered).toEqual([]);
    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "unknown",
      reason: "unverified-applicability",
      applicability: "unknown",
      upstream: { reason: "gaia-materialized" },
    });
  });

  it("keeps an out-of-scope or absent id unknown", async () => {
    const candidate = skill("example/absent", "Absent");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(projection({}), {
          [candidate.id]: {
            sourceRoute: SOURCE_ROUTE,
            skillContentSha256: HASH_A,
            resolvedRevision: REVISION_A,
          },
        }),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "absent capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "unknown",
      reason: "unverified-applicability",
      applicabilityReason: "not-observed",
      upstream: null,
    });
  });

  it("preserves unknown operational evidence without treating it as unreachability", async () => {
    const candidate = skill("example/timeout", "Timeout");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(
          projection({
            [candidate.id]: record({
              state: "unknown",
              reason: "timeout",
            }),
          }),
          {
            [candidate.id]: {
              sourceRoute: SOURCE_ROUTE,
              skillContentSha256: HASH_A,
              resolvedRevision: REVISION_A,
            },
          },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "timeout capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed).toHaveLength(1);
    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "unknown",
      reason: "timeout",
      applicability: "verified",
    });
  });

  it.each([
    ["no-source", "no-source", null, HASH_A],
    ["intrinsic content failure", "intrinsic-content-failure", SOURCE_ROUTE, HASH_A],
  ] as const)("withholds the scoped negative %s with its upstream reason", async (_label, reason, sourceRoute, hash) => {
    const candidate = skill("example/negative", "Negative", {
      links: sourceRoute === null ? {} : { github: SOURCE_URL },
    });
    const negative = record({
      state: "not-materializable",
      reason,
      currentSourceRoute: sourceRoute,
      currentSkillContentSha256: hash,
      observedSourceRoute: sourceRoute,
      observedSkillContentSha256: sourceRoute === null ? null : hash,
      resolvedRevision: null,
      deliveredContentSha256: null,
    });
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      {
        installabilityAdapter: adapter(
          projection({ [candidate.id]: negative }),
          {
            [candidate.id]: {
              sourceRoute,
              skillContentSha256: hash,
            },
          },
        ),
      },
    );

    const outcome = await summon(service, await open(), {
      query: "negative capability",
      surface: "any",
    });

    expect(outcome.summoned).toEqual([]);
    expect(outcome.noMatch?.reason).toBe("all_filtered");
    expect(outcome.filtered[0]?.why).toContain(reason);
    expect(outcome.filtered[0]?.why).toContain(OBSERVATION);
  });

  it.each([
    [
      "operational failure",
      {
        async load(): Promise<unknown> {
          throw new Error("fixture source unavailable");
        },
      },
      "fixture source unavailable",
    ],
    ["malformed artifact", new StaticInstallabilitySource({}), "missing schema"],
    [
      "absent artifact",
      new FileInstallabilitySource("/tmp/skill-heaven-r1-installability-missing.json"),
      "ENOENT",
    ],
  ] as const)("does not let an %s break offline preview", async (_label, source, warning) => {
    const candidate = skill("example/degraded", "Degraded");
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
      { installabilityAdapter: new GaiaInstallabilityAdapter({ source }) },
    );

    const outcome = await summon(service, await open(), {
      query: "degraded capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed).toHaveLength(1);
    expect(outcome.filtered).toEqual([]);
    expect(outcome.ranking.installability).toMatchObject({
      status: "unavailable",
      warning: expect.stringContaining(warning),
    });
  });

  it("keeps a no-match result intact when the optional source fails", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents([
      skill("example/no-match", "No Match"),
    ])), {
      installabilityAdapter: {
        async apply(): Promise<never> {
          throw new Error("optional timeout");
        },
      },
    });

    const outcome = await summon(service, await open(), {
      query: "qwertyuiop asdfghjkl",
      surface: "any",
    });

    expect(outcome.noMatch?.reason).toBe("no_candidates");
    expect(outcome.ranking.installability?.status).toBe("unavailable");
  });

  it("does not apply Tree evidence to an explicit GitHub fleet", async () => {
    const candidate = skill("example/fleet", "Fleet Skill");
    const fleetSource = {
      async load() {
        return {
          ...documents([candidate]),
          source: {
            kind: "fleet" as const,
            rootUrl: "https://github.com/example/fleet",
            genericUrl: "https://github.com/example/fleet",
            namedUrl: "https://github.com/example/fleet",
            fetchedAt: CHECKED_AT,
          },
        };
      },
    };
    const service = new GaiaService(fleetSource, {
      installabilityAdapter: adapter(
        projection({ [candidate.id]: record() }),
        { [candidate.id]: { sourceRoute: SOURCE_ROUTE, skillContentSha256: HASH_A, resolvedRevision: REVISION_A } },
      ),
    });

    const outcome = await summon(service, await open(), {
      query: "fleet skill",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed).toHaveLength(1);
    expect(outcome.previewed[0]?.installability?.applicabilityReason).toBe("fleet-source");
    expect(outcome.ranking.installability?.status).toBe("not-applicable");
  });

  it("does not apply Tree evidence to a source whose kind is unknown", async () => {
    const candidate = skill("example/private", "Private Source");
    const privateSource = {
      async load() {
        return {
          ...documents([candidate]),
          source: {
            genericUrl: "file:///private/generic.json",
            namedUrl: "file:///private/named.json",
            fetchedAt: CHECKED_AT,
          },
        };
      },
    };
    const service = new GaiaService(privateSource, {
      installabilityAdapter: adapter(
        projection({ [candidate.id]: record() }),
        {
          [candidate.id]: {
            sourceRoute: SOURCE_ROUTE,
            skillContentSha256: HASH_A,
            resolvedRevision: REVISION_A,
          },
        },
      ),
    });

    const outcome = await summon(service, await open(), {
      query: "private source",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed[0]?.installability).toMatchObject({
      state: "unknown",
      applicability: "unknown",
      applicabilityReason: "invalid-context",
    });
    expect(outcome.ranking.installability?.status).toBe("not-applicable");
  });

  it("recomputes runtime unreachable stats from assessed eligibility", async () => {
    const candidate = skill("example/no-source", "No Source", { links: {} });
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([candidate])),
    );
    const resolved = await service.skillIndex();
    const outcome = await summon(service, await open(), {
      query: "no source",
      preview: true,
      surface: "any",
    });

    expect(resolved.index.docs[0]?.installability?.state).toBe("unknown");
    expect(resolved.index.stats.unreachable).toBe(0);
    expect(outcome.previewed).toHaveLength(1);
  });

  it("rejects symlinked physical parents for file projections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-heaven-r1-file-"));
    const outside = await mkdtemp(path.join(tmpdir(), "skill-heaven-r1-outside-"));
    const outsideFile = path.join(outside, "projection.json");
    const linkedParent = path.join(root, "linked");
    try {
      await writeFile(outsideFile, "{}", "utf8");
      await expect(
        new FileInstallabilitySource(outsideFile).load(),
      ).resolves.toEqual({});
      await symlink(outside, linkedParent);

      await expect(
        new FileInstallabilitySource(path.join(linkedParent, "projection.json")).load(),
      ).rejects.toThrow(/symlink/iu);
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true }),
      ]);
    }
  });

  it("rejects redirected HTTP projections and accepts an exact final URL", async () => {
    const requested = "https://trusted.example/installability.json";
    const projectionDocument = projection({ "example/http": record() });
    const redirected = new HttpInstallabilitySource({
      url: requested,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        redirected: true,
        url: "https://untrusted.example/installability.json",
        json: async () => projectionDocument,
      } as unknown as Response),
    });
    await expect(redirected.load()).rejects.toThrow(/redirected/iu);

    const exact = new HttpInstallabilitySource({
      url: requested,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        redirected: false,
        url: requested,
        json: async () => projectionDocument,
      } as unknown as Response),
    });
    await expect(exact.load()).resolves.toEqual(projectionDocument);
    expect(exact.sourceUrl).toBe(requested);
  });

  it("keeps suites summonable when Tree evidence is absent", async () => {
    const suite = skill("example/suite", "Suite", {
      links: {},
      suiteComponents: ["example/component"],
    });
    const service = new GaiaService(
      new InMemoryGaiaRegistrySource(documents([suite])),
    );

    const outcome = await summon(service, await open(), {
      query: "suite capability",
      preview: true,
      surface: "any",
    });

    expect(outcome.previewed).toHaveLength(1);
    expect(outcome.previewed[0]?.installability?.state).toBe("unknown");
  });
});
