// The PRODUCTION Arbor consumption path (issue #118, A3/A4).
//
// An exported-but-uncalled validator would satisfy nothing: the lane's exit is a
// real consumption path with real disclosure on the surfaces a caller actually
// reads. So these tests drive `summon()` itself and the MCP tool wire, against
// the committed publication cache — which at the pinned upstream revision is
// genuinely empty. Where a positive path needs records to exist, the test says
// SYNTHETIC in its name and writes its own publication directory.

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { arborPublicationLines, arborSubjectLines } from "skill-zero";

import { createSkillSummonMcpServer, type GaiaService as GaiaServiceType } from "../src/index.js";
import { indexFromSnapshot, loadCommittedIndex } from "../src/data/skill-index-source.js";
import {
  loadArborPublication,
  readArborPublicationDir,
  resetArborPublicationCache,
} from "../src/data/arbor-source.js";
import { InMemoryGaiaRegistrySource } from "../src/data/source.js";
import { GaiaService } from "../src/service.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import { summon } from "../src/summon/summon.js";
import type { GaiaRegistryDocuments } from "../src/domain/types.js";

const roots: string[] = [];
const sessions: SummonSession[] = [];

afterEach(async () => {
  resetArborPublicationCache();
  delete process.env.ARBOR_PUBLICATION_PATH;
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function session(): Promise<SummonSession> {
  const active = await openSession();
  sessions.push(active);
  return active;
}

/** A service backed by the real committed index — the ordinary offline path. */
function committedService(): GaiaService {
  return new GaiaService(new InMemoryGaiaRegistrySource(memoryDocuments), {
    sourceUrl: "https://gaiaskilltree.com",
  });
}

const memoryDocuments: GaiaRegistryDocuments = {
  generic: { generatedAt: "2026-09-08T00:00:00Z", skills: [] },
  named: {
    generatedAt: "2026-09-08T00:00:00Z",
    buckets: {
      fixture: [
        {
          id: "example/health",
          name: "Health",
          contributor: "example",
          status: "named",
          description: "Runs the automated test suite and reports failures.",
          tags: ["testing"],
          links: { github: "https://github.com/example/health/blob/main/SKILL.md" },
          evidence: [],
        },
      ],
    },
  },
};

/** Write a synthetic publication directory and point the loader at it. */
async function useSyntheticPublication(subjects: { id: string; contentSha256: string }[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arbor-publication-"));
  roots.push(root);
  await mkdir(join(root, "runtime"), { recursive: true });
  await writeFile(
    join(root, "provenance.json"),
    JSON.stringify({
      upstream: "synthetic",
      commit: "0".repeat(40),
      path: "docs/graph/arbor",
      capturedAt: "2026-09-13",
      files: {},
    }),
  );
  await writeFile(
    join(root, "edges.json"),
    JSON.stringify({
      schema: "gaia.arbor-edge-index/v1",
      edgeSetVersion: "gaia.arbor-edge/v1",
      coverage: { pairsEvaluated: 0, absenceMeaning: "not-evaluated" },
      edges: [],
    }),
  );
  await writeFile(
    join(root, "runtime", "index.json"),
    JSON.stringify({
      schema: "gaia.arbor-runtime-index/v1",
      runtimeVersion: "gaia.arbor-runtime/v1",
      subjects,
    }),
  );
  for (const subject of subjects) {
    // The publisher's own layout: runtime/<id path>/<contentSha256>.json.
    const dir = join(root, "runtime", ...subject.id.split("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${subject.contentSha256}.json`),
      JSON.stringify({
        schema: "gaia.arbor-runtime/v1",
        subject,
        inputDigest: "d".repeat(64),
        lenses: {
          claims: { status: "absent-no-accepted-record", sourceDigest: null, profile: null },
          hellHeaven: { status: "absent-no-accepted-record", sourceDigest: null, result: null },
          interactions: { status: "absent-no-accepted-record", sourceDigest: null, edges: [] },
        },
      }),
    );
  }
  process.env.ARBOR_PUBLICATION_PATH = root;
  resetArborPublicationCache();
  return root;
}

describe("the committed Arbor publication", () => {
  it("loads offline, from the cache the plugin ships", async () => {
    const publication = await loadArborPublication();
    expect(publication.state).toBe("loaded");
    expect(publication.provenance?.upstream).toMatch(/gaia-skill-tree/u);
    expect(publication.provenance?.commit).toMatch(/^[a-f0-9]{40}$/u);
    // REAL current state, not a fixture: upstream publishes an empty projection.
    expect(publication.subjects).toEqual([]);
    expect(publication.edgeIndex?.edges).toEqual([]);
    expect(publication.problems).toEqual([]);
  });

  it("reports a missing publication as unavailable rather than failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbor-missing-"));
    roots.push(root);
    process.env.ARBOR_PUBLICATION_PATH = join(root, "nowhere");
    resetArborPublicationCache();
    // Falls through to the committed cache, exactly like SKILL_INDEX_PATH does.
    expect((await loadArborPublication()).state).toBe("loaded");
    expect((await readArborPublicationDir(join(root, "nowhere"))).state).toBe("unavailable");
  });

  it("reports a half-written publication directory as a disclosed defect", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbor-partial-"));
    roots.push(root);
    await writeFile(join(root, "edges.json"), "{}");
    const publication = await readArborPublicationDir(root);
    expect(publication.state).toBe("unavailable");
    expect(publication.problems[0]?.detail).toMatch(/missing edges.json or runtime\/index.json/u);
  });

  it("reports unparseable bytes as unreadable, never as absence", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbor-broken-"));
    roots.push(root);
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(join(root, "edges.json"), "{not json");
    await writeFile(join(root, "runtime", "index.json"), "{not json");
    const publication = await readArborPublicationDir(root);
    expect(publication.state).toBe("unreadable");
    expect(publication.problems[0]?.where).toBe("runtime/index.json");
  });
});

describe("summon discloses its behavioral lenses", () => {
  it("carries the disclosure on an ordinary offline summon preview", async () => {
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    expect(outcome.arbor.publicationState).toBe("loaded");
    expect(outcome.arbor.subjectsPublished).toBe(0);
    expect(outcome.arbor.edgeCoverage).toEqual({
      pairsEvaluated: 0,
      absenceMeaning: "not-evaluated",
    });
    expect(outcome.arbor.corpus.canonical).toBe(true);
    expect(outcome.arbor.note).toMatch(/EMPTY/u);
    expect(outcome.previewed.length).toBeGreaterThan(0);
    for (const preview of outcome.previewed) {
      // Nothing is published, so the honest answer for every candidate is that
      // nothing was evaluated — stated, not left blank.
      expect(preview.arbor.join).toBe("no-published-subject");
      expect(preview.arbor.lensesUnknown).toEqual(["claims", "hellHeaven", "interactions"]);
      expect(preview.arbor.claims).toEqual([]);
      expect(preview.arbor.conditionsEvaluated).toBe(false);
    }
  });

  it("discloses lenses on a refusal too — noMatch is a retrieval outcome, not a verdict", async () => {
    const outcome = await summon(committedService(), await session(), {
      query: "zzzz qqqq wwww nonexistent capability xyzzy",
      surface: "any",
    });
    expect(outcome.noMatch).not.toBeNull();
    expect(outcome.arbor.publicationState).toBe("loaded");
    expect(outcome.arbor.note).toMatch(/nothing here is evidence about any skill/u);
  });

  it("reports candidates from a non-canonical source as outside the corpus", async () => {
    // An in-memory/fetched source is not the canonical tree projection the
    // Arbor publication describes, so a colliding id must not read as a match.
    const service = new GaiaService(new InMemoryGaiaRegistrySource(memoryDocuments));
    const outcome = await summon(service, await session(), {
      query: "run the automated test suite",
      preview: true,
      surface: "any",
    });
    expect(outcome.arbor.corpus.canonical).toBe(false);
    expect(outcome.arbor.note).toMatch(/outside the canonical corpus/u);
    for (const preview of outcome.previewed) {
      expect(preview.arbor.join).toBe("source-not-canonical");
    }
  });

  it("says so when the corpus and the publication pin different upstream revisions (synthetic)", async () => {
    const committed = await loadCommittedIndex();
    await useSyntheticPublication([{ id: "example/health", contentSha256: "a".repeat(64) }]);
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    expect(committed.sourceRevision).toBeTruthy();
    expect(outcome.arbor.corpus.sameUpstreamRevision).toBe(false);
    expect(outcome.arbor.note).toMatch(/different upstream revisions/u);
  });

  it("still cannot prove a content pin for a published id, and says that plainly (synthetic)", async () => {
    // The published subject below uses a REAL corpus id. Even so the join stays
    // unknown: the Gaia named projection publishes no per-skill contentSha256,
    // so this runtime has nothing to match the pin against. An id alone is not
    // an identity.
    const realId = "0xdarkmatter/pytest-patterns";
    await useSyntheticPublication([{ id: realId, contentSha256: "a".repeat(64) }]);
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const matching = outcome.previewed.find((preview) => preview.id === realId);
    expect(matching?.arbor.join).toBe("identity-unproven");
    expect(matching?.arbor.lenses.claims.reason).toMatch(/an id match alone proves neither source/u);
  });
});

describe("Arbor never touches relevance", () => {
  /** Everything a caller could rank, order or act on — with the disclosure removed. */
  function retrievalShape(outcome: Awaited<ReturnType<typeof summon>>) {
    return {
      query: outcome.query,
      surface: outcome.surface,
      source: outcome.source,
      margin: outcome.margin,
      noMatch: outcome.noMatch,
      filtered: outcome.filtered,
      skipped: outcome.skipped,
      // `indexAgeDays` is wall-clock and moves between the two runs; everything
      // else about the ranking must not.
      ranking: { ...outcome.ranking, indexAgeDays: null },
      previewed: outcome.previewed.map(({ arbor: _arbor, ...rest }) => rest),
    };
  }

  it("leaves the ranked order, scores, margin and refusal byte-identical (synthetic)", async () => {
    // Two queries on purpose: one that admits a candidate, and one that refuses.
    // Arbor may not move either, and a refusal is exactly where a behavioral
    // signal would be most tempting to read as a reason (SPEC INV-3, §3.4).
    for (const query of ["pytest patterns", "review a pull request"]) {
      const before = await summon(committedService(), await session(), {
        query,
        limit: 5,
        preview: true,
        surface: "any",
      });

      // Publish a subject for whatever the top candidate was. If Arbor leaked
      // into ranking at all, THIS is the summon where the order would move.
      const topId =
        before.previewed[0]?.id ?? before.noMatch?.topCandidates[0]?.id ?? "example/health";
      await useSyntheticPublication([{ id: topId, contentSha256: "a".repeat(64) }]);

      const after = await summon(committedService(), await session(), {
        query,
        limit: 5,
        preview: true,
        surface: "any",
      });

      expect(retrievalShape(after), query).toEqual(retrievalShape(before));
      // ... and the disclosure DID change, so the comparison above is not
      // passing merely because nothing was consumed either time.
      expect(after.arbor.subjectsPublished).toBe(1);
      expect(before.arbor.subjectsPublished).toBe(0);
      resetArborPublicationCache();
      delete process.env.ARBOR_PUBLICATION_PATH;
    }
  });

  it("leaves the outcome intact when the publication is unreadable", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbor-unreadable-"));
    roots.push(root);
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(join(root, "edges.json"), "{not json");
    await writeFile(join(root, "runtime", "index.json"), "{not json");
    process.env.ARBOR_PUBLICATION_PATH = root;
    resetArborPublicationCache();

    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    expect(outcome.previewed.length).toBeGreaterThan(0);
    expect(outcome.arbor.publicationState).toBe("unreadable");
    expect(outcome.arbor.note).toMatch(/does not conform to the pinned contracts/u);
    expect(outcome.previewed[0]?.arbor.join).toBe("publication-unavailable");
  });
});

describe("existing behavior is preserved", () => {
  it("still fails loudly on an unresolvable explicit source, never falling back", async () => {
    // #131 / SPEC §5.1: explicit-source isolation. Arbor consumption must not
    // turn a source error into a partially-disclosed success.
    await expect(
      summon(committedService(), await session(), {
        query: "pytest patterns",
        preview: true,
        surface: "any",
        source: "https://example.invalid/not-a-source",
      }),
    ).rejects.toThrow(/Could not resolve source/u);
  });

  it("prints the lens disclosure on the card an agent actually reads", async () => {
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const lines = arborSubjectLines(outcome.previewed[0]!.arbor);
    expect(lines.join("\n")).toMatch(/consulted: none/u);
    expect(arborPublicationLines(outcome.arbor).join("\n")).toMatch(
      /Arbor source: https:\/\/github.com\/gaia-research\/gaia-skill-tree@[a-f0-9]{40}/u,
    );
  });
});

describe("the public wire", () => {
  it("puts the disclosure in structuredContent, not only on the card", async () => {
    const sourceUrl = "https://github.com/example/health";
    const index = indexFromSnapshot(
      {
        ...memoryDocuments,
        source: {
          kind: "fleet",
          rootUrl: sourceUrl,
          genericUrl: sourceUrl,
          namedUrl: sourceUrl,
          fetchedAt: "2026-09-08T00:00:00Z",
        },
      },
      sourceUrl,
    );
    const service = {
      skillIndex: async () => ({ index, source: sourceUrl, origin: "fetched" as const }),
      namedSkills: async () => [],
    } as unknown as GaiaServiceType;

    const active = await session();
    const previous = process.env.SKILL_SUMMON_SESSION;
    process.env.SKILL_SUMMON_SESSION = active.root;
    const server = createSkillSummonMcpServer({ service });
    const client = new Client({ name: "arbor-wire", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "summon",
        arguments: { query: "run the automated test suite", preview: true, surface: "any" },
      });
      const structured = result.structuredContent as {
        arbor?: { publicationState?: string; note?: string; corpus?: { canonical?: boolean } };
      };
      expect(structured.arbor?.publicationState).toBe("loaded");
      expect(structured.arbor?.corpus?.canonical).toBe(false);
      expect(structured.arbor?.note).toMatch(/outside the canonical corpus/u);
    } finally {
      await client.close();
      await server.close();
      if (previous === undefined) delete process.env.SKILL_SUMMON_SESSION;
      else process.env.SKILL_SUMMON_SESSION = previous;
    }
  });
});
