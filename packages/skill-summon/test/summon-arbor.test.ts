// The PRODUCTION Arbor consumption path (issue #118, A3/A4).
//
// An exported-but-uncalled validator would satisfy nothing: the lane's exit is a
// real consumption path with real disclosure on the surfaces a caller actually
// reads. So these tests drive `summon()` itself and the MCP tool wire, against
// the committed publication cache — which at the pinned upstream revision is
// genuinely empty. Where a positive path needs records to exist, the test says
// SYNTHETIC in its name and writes its own publication directory.

import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  arborPublicationLines,
  arborSubjectLines,
  type ArborClaim,
  type ArborIdentityContext,
} from "skill-zero";

import { createSkillSummonMcpServer, type GaiaService as GaiaServiceType } from "../src/index.js";
import { indexFromSnapshot, loadCommittedIndex } from "../src/data/skill-index-source.js";
import {
  loadArborPublication,
  readArborPublicationDir,
  resetArborPublicationCache,
} from "../src/data/arbor-source.js";
import {
  loadArborIdentityContext,
  resetArborIdentityCache,
} from "../src/data/arbor-identity-source.js";
import { InMemoryGaiaRegistrySource } from "../src/data/source.js";
import { GaiaService } from "../src/service.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import { summon } from "../src/summon/summon.js";
import type { GaiaRegistryDocuments } from "../src/domain/types.js";

const roots: string[] = [];
const sessions: SummonSession[] = [];

afterEach(async () => {
  resetArborPublicationCache();
  resetArborIdentityCache();
  delete process.env.ARBOR_PUBLICATION_PATH;
  delete process.env.ARBOR_IDENTITY_PATH;
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

/** One synthetic published subject, optionally carrying a claims profile. */
type SyntheticSubject = {
  id: string;
  contentSha256: string;
  /** When present, the claims lens is `present` and embeds a profile. */
  claims?: ArborClaim[];
  /** Override the EMBEDDED profile's own subject — the cross-identity case. */
  profileSubject?: { id: string; contentSha256: string };
};

type SyntheticOptions = {
  /** Rewrite the finished manifest before it is written (digest-receipt tests). */
  tamper?: (files: Record<string, string>) => Record<string, string>;
  /** Ship no provenance record at all — the explicitly unauditable cache. */
  omitProvenance?: boolean;
};

/**
 * Write a synthetic publication directory.
 *
 * The manifest is computed from the bytes actually written, exactly as a real
 * capture would produce it — a cache that cannot pass its own digest check is
 * not a useful stand-in for one upstream published.
 */
async function writePublication(
  root: string,
  subjects: SyntheticSubject[],
  options: SyntheticOptions = {},
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const put = async (relativePath: string, value: unknown): Promise<void> => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2));
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    files[relativePath] = createHash("sha256").update(bytes).digest("hex");
  };

  await put("edges.json", {
    schema: "gaia.arbor-edge-index/v1",
    edgeSetVersion: "gaia.arbor-edge/v1",
    coverage: { pairsEvaluated: 0, absenceMeaning: "not-evaluated" },
    edges: [],
  });
  await put(join("runtime", "index.json"), {
    schema: "gaia.arbor-runtime-index/v1",
    runtimeVersion: "gaia.arbor-runtime/v1",
    subjects: subjects.map(({ id, contentSha256 }) => ({ id, contentSha256 })),
  });

  for (const subject of subjects) {
    const pin = { id: subject.id, contentSha256: subject.contentSha256 };
    // The publisher's own layout: runtime/<id path>/<contentSha256>.json.
    const relativePath = join("runtime", ...subject.id.split("/"), `${subject.contentSha256}.json`);
    await put(relativePath, {
      schema: "gaia.arbor-runtime/v1",
      subject: pin,
      inputDigest: "d".repeat(64),
      lenses: {
        claims: subject.claims
          ? {
              status: "present",
              sourceDigest: "e".repeat(64),
              profile: {
                schema: "gaia.arbor-profile/v1",
                skill: subject.profileSubject ?? pin,
                inputDigest: "d".repeat(64),
                sources: { declarations: ["c".repeat(64)], benchmarkReceipts: [], interpretations: [] },
                claims: subject.claims,
              },
            }
          : { status: "absent-no-accepted-record", sourceDigest: null, profile: null },
        hellHeaven: { status: "absent-no-accepted-record", sourceDigest: null, result: null },
        interactions: { status: "absent-no-accepted-record", sourceDigest: null, edges: [] },
      },
    });
  }

  if (!options.omitProvenance) {
    await writeFile(
      join(root, "provenance.json"),
      JSON.stringify(
        {
          upstream: "synthetic",
          commit: "0".repeat(40),
          path: "docs/graph/arbor",
          capturedAt: "2026-09-13",
          files: options.tamper ? options.tamper({ ...files }) : files,
        },
        null,
        2,
      ),
    );
  }
  return files;
}

/** Write a synthetic publication directory and point the loader at it. */
async function useSyntheticPublication(
  subjects: SyntheticSubject[],
  options: SyntheticOptions = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arbor-publication-"));
  roots.push(root);
  await writePublication(root, subjects, options);
  process.env.ARBOR_PUBLICATION_PATH = root;
  resetArborPublicationCache();
  return root;
}

/** A synthetic claim. Invented for this suite; never an observation. */
function syntheticClaim(overrides: Partial<ArborClaim> = {}): ArborClaim {
  return {
    id: "claim.one",
    facet: "human-led",
    conditions: "only in a repository that already has a pytest suite",
    rationale: "synthetic fixture — not an accepted upstream record",
    authority: { actor: "synthetic-curator", basis: "fixture" },
    support: "expert-declared",
    declarationId: "decl.one",
    declaredAt: "2026-09-01T00:00:00Z",
    declarationSource: "c".repeat(64),
    benchmarkSources: [],
    interpretationSource: null,
    ...overrides,
  };
}

/**
 * The REAL candidate this suite joins against: a skill that is in the committed
 * retrieval index and pinned in the committed identity context. Its hash is the
 * sha256 of its canonical Tree file at the corpus's own revision — not a value
 * invented here.
 */
const REAL_ID = "0xdarkmatter/pytest-patterns";
const REAL_SHA = "9622a51cf015957da882f634d4c708f2d4859a4824fef1f37c7b8aa2bd299fa6";

async function emptyDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arbor-empty-"));
  roots.push(root);
  return root;
}

/**
 * Take the REAL shipped identity context, apply one deliberate defect, and point
 * the loader at the result. Starting from the real artifact is the point: each
 * variant differs from a working production context in exactly one field.
 */
async function useSyntheticIdentity(
  mutate: (context: ArborIdentityContext) => ArborIdentityContext,
): Promise<void> {
  const real = await loadArborIdentityContext();
  const root = await emptyDir();
  const path = join(root, "arbor-identity.json");
  await writeFile(path, JSON.stringify(mutate(real.context!)));
  process.env.ARBOR_IDENTITY_PATH = path;
  resetArborIdentityCache();
}

/** Summon the real candidate and return its per-skill Arbor report. */
async function previewReal() {
  const outcome = await summon(committedService(), await session(), {
    query: "pytest patterns",
    preview: true,
    surface: "any",
  });
  return outcome.previewed.find((preview) => preview.id === REAL_ID);
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

  it("returns no pin when the publication is outside the corpus revision (synthetic)", async () => {
    // The corpus revision and the identity revision agree; the PUBLICATION is
    // pinned elsewhere. That is disclosed at the publication level and must not
    // be repaired by borrowing a hash across revisions.
    await useSyntheticPublication([{ id: REAL_ID, contentSha256: "a".repeat(64) }]);
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const matching = outcome.previewed.find((preview) => preview.id === REAL_ID);
    // The runtime proved its own canonical pin; the publication pins other
    // bytes, so its records describe other content. Unknown for this version.
    expect(matching?.arbor.contentSha256).toBe(REAL_SHA);
    expect(matching?.arbor.join).toBe("subject-version-unmatched");
    expect(matching?.arbor.claims).toEqual([]);
    expect(matching?.arbor.lenses.claims.reason).toMatch(/different content bytes/u);
  });
});

// Fix 1 (independent review P1): before this, the production `summon()` path
// passed `contentSha256: null` for every candidate, so a positive join was
// unreachable outside a direct unit call. These tests drive the REAL production
// path with the REAL committed identity context — only the PUBLICATION is
// synthetic, because upstream publishes none at the pinned revision.
describe("the production path can prove a canonical content pin", () => {
  it("ships an identity context pinned at the corpus's own revision", async () => {
    const committed = await loadCommittedIndex();
    const identity = await loadArborIdentityContext();
    expect(identity.problem).toBeNull();
    expect(identity.context).not.toBeNull();
    // The central rule, asserted on the shipped artifact rather than a fixture:
    // the pins belong to the revision the corpus was actually built from.
    expect(identity.context?.commit).toBe(committed.sourceRevision);
    expect(identity.context?.skills[REAL_ID]?.contentSha256).toBe(REAL_SHA);
    expect(identity.context?.skills[REAL_ID]?.canonicalPath).toBe(
      `registry/named/${REAL_ID}.md`,
    );
  });

  it("joins a real candidate to a published subject and carries its claims (synthetic publication)", async () => {
    // REAL: the candidate, its id, its canonical content pin and its source
    // route, all from committed artifacts. SYNTHETIC: the published record —
    // upstream has accepted none, and this test does not pretend otherwise.
    await useSyntheticPublication([
      { id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] },
    ]);
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const matching = outcome.previewed.find((preview) => preview.id === REAL_ID);
    expect(matching?.arbor.join).toBe("content-pinned");
    expect(matching?.arbor.matchedSubject).toEqual({ id: REAL_ID, contentSha256: REAL_SHA });
    expect(matching?.arbor.lensesConsulted).toEqual(["claims"]);
    expect(matching?.arbor.claims).toHaveLength(1);
    expect(matching?.arbor.claims[0]?.conditions).toBe(
      "only in a repository that already has a pytest suite",
    );
    // Proving WHICH canonical record a claim belongs to is not a statement
    // about a future execution, and the surface says so in both directions.
    expect(matching?.arbor.conditionsEvaluated).toBe(false);
    expect(matching?.arbor.deliveryContext).toBe("not-materialized");
    const card = arborSubjectLines(matching!.arbor).join("\n");
    expect(card).toMatch(/ONLY UNDER: only in a repository that already has a pytest suite/u);
    expect(card).not.toMatch(/\bsafe\b|\bapproved\b|\brecommended\b/iu);
    expect(matching?.arbor.note).toMatch(/Nothing was materialized/u);
  });

  it("refuses the pin when the candidate's source route is not the canonical one", async () => {
    // An id is mutable upstream. A context that pins some OTHER project's route
    // for this id must not lend it a hash.
    await useSyntheticIdentity((context) => ({
      ...context,
      skills: {
        ...context.skills,
        [REAL_ID]: {
          ...context.skills[REAL_ID]!,
          sourceUrl: "https://github.com/someone-else/other/blob/main/SKILL.md",
        },
      },
    }));
    await useSyntheticPublication([
      { id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] },
    ]);
    const matching = await previewReal();
    expect(matching?.arbor.contentSha256).toBeNull();
    expect(matching?.arbor.join).toBe("identity-unproven");
    expect(matching?.arbor.claims).toEqual([]);
    expect(matching?.arbor.lenses.claims.reason).toMatch(/not the canonical route recorded/u);
  });

  it("refuses the pin when the identity context is pinned at another revision", async () => {
    // The central refinement: a hash taken at a different Tree revision
    // describes different bytes. It is never borrowed by id, not even from a
    // NEWER revision, and not even when the publication would then match.
    await useSyntheticIdentity((context) => ({ ...context, commit: "1".repeat(40) }));
    await useSyntheticPublication([
      { id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] },
    ]);
    const matching = await previewReal();
    expect(matching?.arbor.contentSha256).toBeNull();
    expect(matching?.arbor.join).toBe("identity-unproven");
    expect(matching?.arbor.claims).toEqual([]);
    expect(matching?.arbor.lenses.claims.reason).toMatch(/different Tree revision/u);
  });

  it("does not join when the context pins other bytes for that id", async () => {
    await useSyntheticIdentity((context) => ({
      ...context,
      skills: {
        ...context.skills,
        [REAL_ID]: { ...context.skills[REAL_ID]!, contentSha256: "b".repeat(64) },
      },
    }));
    await useSyntheticPublication([
      { id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] },
    ]);
    const matching = await previewReal();
    expect(matching?.arbor.contentSha256).toBe("b".repeat(64));
    expect(matching?.arbor.join).toBe("subject-version-unmatched");
    expect(matching?.arbor.claims).toEqual([]);
  });

  it("carries no pin at all when the identity context cannot be read", async () => {
    // A malformed context is a disclosed unknown, never a silent fallback to a
    // weaker identity rule: with no pin the join degrades to exactly the state
    // it held before this artifact existed.
    const path = join(await emptyDir(), "arbor-identity.json");
    await writeFile(path, '{"schema":"skill-heaven.arbor-identity-context/v1"');
    process.env.ARBOR_IDENTITY_PATH = path;
    resetArborIdentityCache();
    await useSyntheticPublication([
      { id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] },
    ]);
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const matching = outcome.previewed.find((preview) => preview.id === REAL_ID);
    expect(matching?.arbor.join).toBe("identity-unproven");
    expect(matching?.arbor.claims).toEqual([]);
    expect(outcome.arbor.identity.matchesCorpusRevision).toBe(false);
    expect(outcome.arbor.identity.problem).toMatch(/JSON/u);
    expect(outcome.arbor.note).toMatch(/No canonical identity context is available/u);
  });

  it("falls back to the committed context when a configured path is absent", async () => {
    // Same posture as SKILL_INDEX_PATH and the publication cache: an override
    // that points nowhere is not a way to silently disable the check.
    process.env.ARBOR_IDENTITY_PATH = join(await emptyDir(), "nothing.json");
    resetArborIdentityCache();
    const load = await loadArborIdentityContext();
    expect(load.problem).toBeNull();
    expect(load.context?.skills[REAL_ID]?.contentSha256).toBe(REAL_SHA);
  });

  it("never lets an embedded profile for another skill be served as this one (synthetic)", async () => {
    // Fix 2 on the production path: beta's runtime carrying alpha's profile.
    await useSyntheticPublication([
      {
        id: REAL_ID,
        contentSha256: REAL_SHA,
        claims: [syntheticClaim({ conditions: "the other skill's condition" })],
        profileSubject: { id: "someone/else", contentSha256: "c".repeat(64) },
      },
    ]);
    const matching = await previewReal();
    expect(matching?.arbor.join).toBe("content-pinned");
    expect(matching?.arbor.claims).toEqual([]);
    expect(matching?.arbor.lenses.claims.availability).toBe("unknown");
    expect(arborSubjectLines(matching!.arbor).join("\n")).not.toMatch(
      /the other skill's condition/u,
    );
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

// Fix 4 (independent review P2): the contract's id pattern rules out a literal
// `..` but says nothing about symlinks. Without physical confinement, bytes
// from outside the declared publication become Arbor evidence and are rendered
// to a caller as though upstream had published them.
describe("the publication is physically confined", () => {
  /** Bytes that live OUTSIDE any publication — the thing a link would smuggle in. */
  async function outsideRuntime(subject: { id: string; contentSha256: string }): Promise<string> {
    const outside = await emptyDir();
    await writePublication(outside, [
      { id: subject.id, contentSha256: subject.contentSha256, claims: [syntheticClaim({
        conditions: "smuggled from outside the publication root",
      })] },
    ]);
    return outside;
  }

  it("loads a publication in an ordinary directory — the control", async () => {
    const root = await emptyDir();
    await writePublication(root, [{ id: REAL_ID, contentSha256: REAL_SHA, claims: [syntheticClaim()] }]);
    const publication = await readArborPublicationDir(root);
    expect(publication.state).toBe("loaded");
    expect(publication.runtimes.size).toBe(1);
    expect(publication.problems).toEqual([]);
  });

  it("refuses a runtime document that is a symlink to bytes outside the root", async () => {
    const subject = { id: REAL_ID, contentSha256: REAL_SHA };
    const outside = await outsideRuntime(subject);
    const relativePath = join("runtime", ...subject.id.split("/"), `${subject.contentSha256}.json`);

    const root = await emptyDir();
    await writePublication(root, [subject]);
    await rm(join(root, relativePath));
    await symlink(join(outside, relativePath), join(root, relativePath));

    const publication = await readArborPublicationDir(root);
    // Nothing from outside was consumed, and the cache does not get to keep
    // presenting a trusted-looking commit while carrying unreadable records.
    expect(publication.runtimes.size).toBe(0);
    expect(publication.state).toBe("unreadable");
    expect(publication.provenance).toBeNull();
    expect(publication.problems.some((problem) => /symlink/u.test(problem.detail))).toBe(true);
  });

  it("refuses a runtime DIRECTORY that is a symlink out of the root", async () => {
    const subject = { id: REAL_ID, contentSha256: REAL_SHA };
    const outside = await outsideRuntime(subject);
    const [contributor, slug] = subject.id.split("/") as [string, string];

    const root = await emptyDir();
    await writePublication(root, [subject]);
    await rm(join(root, "runtime", contributor, slug), { recursive: true });
    await symlink(join(outside, "runtime", contributor, slug), join(root, "runtime", contributor, slug));

    const publication = await readArborPublicationDir(root);
    expect(publication.runtimes.size).toBe(0);
    expect(publication.state).toBe("unreadable");
    // The real path lands outside the root — caught before the link itself is
    // reached, which is the same refusal by a shorter route.
    expect(
      publication.problems.some((problem) => /symlink|resolves outside/u.test(problem.detail)),
    ).toBe(true);
  });

  it("refuses a publication ROOT that is itself a symlink", async () => {
    const real = await emptyDir();
    await writePublication(real, [{ id: REAL_ID, contentSha256: REAL_SHA }]);
    const link = join(await emptyDir(), "arbor");
    await symlink(real, link);

    const publication = await readArborPublicationDir(link);
    expect(publication.state).not.toBe("loaded");
    expect(publication.subjects).toEqual([]);
  });

  it("still reports an ordinary read error as a defect, not as confinement", async () => {
    // The confinement work must not swallow the plain broken-cache signal.
    const root = await emptyDir();
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(join(root, "edges.json"), "{not json");
    await writeFile(join(root, "runtime", "index.json"), "{not json");
    const publication = await readArborPublicationDir(root);
    expect(publication.state).toBe("unreadable");
    expect(publication.problems.some((problem) => /symlink/u.test(problem.detail))).toBe(false);
  });
});

// Fix 5 (independent review P2): the provenance record names an upstream commit
// on a public surface. Unless the bytes beside it are hashed against its own
// manifest, that commit can be presented for content it never published.
describe("the cached publication is checked against its own receipt", () => {
  const SUBJECT = { id: REAL_ID, contentSha256: REAL_SHA };

  /** Every rejection must fail closed: no subjects, no retained upstream pin. */
  function expectRefused(publication: Awaited<ReturnType<typeof readArborPublicationDir>>, detail: RegExp) {
    expect(publication.state).toBe("unreadable");
    expect(publication.subjects).toEqual([]);
    expect(publication.provenance).toBeNull();
    expect(publication.problems.some((problem) => detail.test(problem.detail))).toBe(true);
  }

  async function publication(options: SyntheticOptions) {
    const root = await emptyDir();
    await writePublication(root, [{ ...SUBJECT, claims: [syntheticClaim()] }], options);
    return readArborPublicationDir(root);
  }

  it("accepts a cache whose bytes match its manifest", async () => {
    const accepted = await publication({});
    expect(accepted.state).toBe("loaded");
    expect(accepted.provenance?.commit).toBe("0".repeat(40));
    expect(accepted.problems).toEqual([]);
  });

  it("refuses a manifest whose digest does not match the bytes", async () => {
    expectRefused(
      await publication({
        tamper: (files) => ({ ...files, "edges.json": "0".repeat(64) }),
      }),
      /hashes to [a-f0-9]{64}, but the provenance record claims/u,
    );
  });

  it("refuses a manifest that does not cover every file in the publication", async () => {
    expectRefused(
      await publication({
        tamper: ({ "edges.json": _dropped, ...rest }) => rest,
      }),
      /does not cover 'edges.json'/u,
    );
  });

  it("refuses a manifest declaring a file this publication does not contain", async () => {
    expectRefused(
      await publication({
        tamper: (files) => ({ ...files, "runtime/somewhere-else.json": "a".repeat(64) }),
      }),
      /which is not part of this publication/u,
    );
  });

  it("refuses conflicting receipts for one path", async () => {
    expectRefused(
      await publication({
        // Two spellings of the same file, disagreeing — a receipt that says two
        // different things about one set of bytes proves nothing about either.
        tamper: (files) => ({ ...files, "./edges.json": "b".repeat(64) }),
      }),
      /conflicting digests for 'edges.json'/u,
    );
  });

  it("refuses a manifest path that escapes the publication directory", async () => {
    expectRefused(
      await publication({
        tamper: (files) => ({ ...files, "../outside.json": "c".repeat(64) }),
      }),
      /escapes the publication directory/u,
    );
  });

  it("refuses a manifest whose commit is not a commit id", async () => {
    const root = await emptyDir();
    await writePublication(root, [SUBJECT], { omitProvenance: true });
    await writeFile(
      join(root, "provenance.json"),
      JSON.stringify({
        upstream: "synthetic",
        commit: "not-a-commit",
        path: "docs/graph/arbor",
        capturedAt: "2026-09-13",
        files: {},
      }),
    );
    expectRefused(
      await readArborPublicationDir(root),
      /provenance\.commit must be a 40-character commit id/u,
    );
  });

  it("keeps a cache with NO receipt readable, and says plainly that it is unauditable", async () => {
    // Deliberate: an absent receipt is not a forged one. The bytes are still
    // consumed, but no upstream revision is presented for them.
    const unaudited = await publication({ omitProvenance: true });
    expect(unaudited.state).toBe("loaded");
    expect(unaudited.provenance).toBeNull();
    expect(unaudited.problems[0]?.detail).toMatch(/UNAUDITABLE/u);
  });

  it("proves byte consistency only — the disclosure never calls it an attestation", async () => {
    const outcome = await summon(committedService(), await session(), {
      query: "pytest patterns",
      preview: true,
      surface: "any",
    });
    const lines = arborPublicationLines(outcome.arbor, outcome.arbor.identity).join("\n");
    expect(lines).toMatch(/byte consistency only, not an authenticated upstream attestation/u);
    expect(lines).not.toMatch(/signed|signature|attested by|verified by upstream/iu);
  });
});
