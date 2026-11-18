import { describe, expect, it } from "vitest";
import {
  ARBOR_EDGE_SCHEMA,
  ARBOR_RELATIONS,
  CAMPAIGN_MANIFEST_ENTRY_KEYS,
  CAMPAIGN_MANIFEST_GAP_KEYS,
  CAMPAIGN_MANIFEST_KEYS,
  CAMPAIGN_MANIFEST_LENS_KEYS,
  CAMPAIGN_MANIFEST_SCHEMA,
  CAMPAIGN_SCHEMA_IDS,
  CampaignManifestError,
  EDGE_ABSENCE_MEANING,
  EDGE_STRUCTURAL_OVERLAP,
  MANIFEST_ARBOR_HELL_HEAVEN_KEYS,
  MANIFEST_ARBOR_LENS_KEYS,
  MANIFEST_FRESHNESS_ABSENT_KEYS,
  MANIFEST_FRESHNESS_PRESENT_KEYS,
  MANIFEST_GRAPH_LENS_KEYS,
  MANIFEST_INSTALLABILITY_LENS_KEYS,
  MANIFEST_LANE_LENS_KEYS,
  MANIFEST_RETRIEVAL_ABSENT_KEYS,
  MANIFEST_RETRIEVAL_EXACT_KEYS,
  MANIFEST_RETRIEVAL_RANKED_KEYS,
  buildCampaignManifest,
  isValidManifestForRecon,
  parseCampaignManifest,
  tryBuildCampaignManifest,
  type ArborClaim,
  type ArborInteractionReport,
  type CampaignReconRecordInput,
  type ReconCandidateCardInput,
  type ReconGapRecordInput,
} from "../src/index.js";

const COMBINED_SCORE_FIELDS = [
  "combinedScore",
  "masterScore",
  "rankBlend",
  "weight",
  "weightedScore",
  "blendedRank",
  "compositeScore",
  "overallScore",
  "totalScore",
  "arborScore",
  "graphScore",
  "trustScore",
  "utility",
  "priority",
] as const;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCandidate(
  reconId: string,
  gapIndex: number,
  id: string,
  overrides: Partial<ReconCandidateCardInput> = {},
): ReconCandidateCardInput {
  return {
    cardRef: `recon:${reconId}:gap:${gapIndex}:card:${id}`,
    id,
    name: id,
    title: `Title for ${id}`,
    description: `Description for ${id}`,
    source: "tree",
    sourceUrl: `https://example.com/${id}`,
    card: `[Preview] ${id}`,
    retrieval: {
      score: 0.85,
      margin: 0.25,
      matchKind: "ranked",
      classified: true,
      nameMatchesQuery: true,
    },
    lane: {
      status: "present",
      invocation: "model",
      lane: "model-led",
      convergenceOnly: false,
    },
    installability: {
      status: "present",
      state: "materializable",
      reason: null,
      applicability: "verified",
      applicabilityReason: "Verified against projection index.",
      observationDigest: "sha256:obs-1",
      observedAt: "2026-01-01T00:00:00Z",
    },
    arbor: {
      status: "absent-no-accepted-record",
      availability: "absent",
      join: "content-pinned",
      upstreamStatus: "absent-no-accepted-record",
      sourceDigest: null,
      claims: [],
      conditionsEvaluated: false,
      reason: "No accepted record published.",
      hellHeaven: {
        status: "absent-not-published",
        availability: "unknown",
        upstreamStatus: null,
        reason: "Heaven/Hell behavioral polarity payload is not published.",
      },
    },
    graph: {
      status: "absent-no-edges",
      availability: "absent",
      join: "content-pinned",
      upstreamStatus: "absent-no-accepted-record",
      sourceDigest: null,
      absenceMeaning: EDGE_ABSENCE_MEANING,
      relations: [],
      reason: "No edges published.",
    },
    freshness: {
      status: "present",
      indexGeneratedAt: "2026-01-01T00:00:00Z",
      indexAgeDays: 3,
      stale: false,
      indexOrigin: "committed",
      source: "tree",
    },
    ...overrides,
  };
}

function makeRecon(): CampaignReconRecordInput {
  const reconId = "recon-1";
  const claim: ArborClaim = {
    id: "claim-1",
    facet: "human-led",
    conditions: "Requires human operator confirmation before commit.",
    rationale: "Safety-critical workflow.",
    authority: { actor: "curator-a", basis: "review" },
    support: "expert-declared",
    declarationId: "decl-1",
    declaredAt: "2026-01-01T00:00:00Z",
    declarationSource: "registry/arbor/decl-1.json",
    benchmarkSources: ["bench-1"],
    interpretationSource: null,
  };
  const relation: ArborInteractionReport = {
    edge: {
      schema: ARBOR_EDGE_SCHEMA,
      edgeKey: "skill/a->skill/b",
      pair: {
        from: { id: "skill/a", contentSha256: "a".repeat(64) },
        to: { id: "skill/b", contentSha256: "b".repeat(64) },
      },
      target: { declarationSha256: "c".repeat(64), claimId: "claim-1" },
      relation: "conflicts",
      conditions: "When both edit the same config.",
      authority: { actor: "curator-a", basis: "review" },
      support: "expert-declared",
      declarationSource: "registry/arbor/edge-1.json",
      observationSources: ["obs-1"],
      interpretationSource: null,
      structuralOverlap: EDGE_STRUCTURAL_OVERLAP,
      pairApplicable: true,
    },
    direction: "subject-acts-on",
    counterpart: { id: "skill/b", contentSha256: "b".repeat(64) },
    counterpartPin: "verified",
  };

  return {
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    reconId,
    gaps: [
      {
        gapIndex: 0,
        query: "build manifest",
        status: "matched",
        refused: false,
        refusal: null,
        candidates: [
          makeCandidate(reconId, 0, "skill/a", {
            retrieval: {
              score: 1,
              margin: 0.5,
              matchKind: "exact",
              matchedBy: { key: "id", scope: "whole-query" },
              classified: true,
              nameMatchesQuery: true,
            },
            arbor: {
              status: "present",
              availability: "consulted",
              join: "content-pinned",
              upstreamStatus: "present",
              sourceDigest: "sha256:arbor-1",
              claims: [claim],
              conditionsEvaluated: false,
              reason: "Record read as published.",
              hellHeaven: {
                status: "unavailable-unsupported-payload",
                availability: "unknown",
                upstreamStatus: "unavailable-unsupported-payload",
                reason: "Payload contract not published.",
              },
            },
            graph: {
              status: "present",
              availability: "consulted",
              join: "content-pinned",
              upstreamStatus: "present",
              sourceDigest: "sha256:graph-1",
              absenceMeaning: EDGE_ABSENCE_MEANING,
              relations: [relation],
              reason: "Ordered edges read as published.",
            },
          }),
          makeCandidate(reconId, 0, "skill/b", {
            lane: {
              status: "present",
              invocation: "human",
              lane: "human-led",
              convergenceOnly: true,
            },
            retrieval: {
              status: "absent-not-measured",
              reason: "Not measured in exact-only fallback.",
            },
            freshness: {
              status: "absent-unavailable",
              indexGeneratedAt: null,
              indexAgeDays: null,
              stale: null,
              indexOrigin: null,
              source: null,
              reason: "Index metadata unavailable.",
            },
          }),
        ],
      },
      {
        gapIndex: 1,
        query: "impossible gap",
        status: "no-match",
        refused: true,
        refusal: {
          kind: "no-match",
          reason: "No matching skill in index.",
          note: "Recorded gap outcome.",
        },
        candidates: [],
      },
      {
        gapIndex: 2,
        query: "verify manifest",
        status: "matched",
        refused: false,
        refusal: null,
        candidates: [
          makeCandidate(reconId, 2, "skill/c", {
            lane: {
              status: "absent-not-published",
              invocation: "any",
              lane: "unclassified",
              convergenceOnly: false,
            },
          }),
        ],
      },
    ],
  };
}

describe("campaign-manifest", () => {
  it("snapshots all exported key allowlists and forbids combined/blended/weight keys", () => {
    expect(CAMPAIGN_MANIFEST_SCHEMA).toBe("skill-heaven/campaign-manifest/v1");
    expect(CAMPAIGN_MANIFEST_KEYS).toEqual([
      "schema",
      "reconId",
      "gaps",
      "entries",
    ]);
    expect(CAMPAIGN_MANIFEST_GAP_KEYS).toEqual([
      "gapIndex",
      "query",
      "status",
      "refused",
      "refusal",
      "selectedCardRefs",
    ]);
    expect(CAMPAIGN_MANIFEST_ENTRY_KEYS).toEqual([
      "reconId",
      "gapIndex",
      "gap",
      "cardRef",
      "id",
      "name",
      "title",
      "description",
      "source",
      "sourceUrl",
      "card",
      "convergenceOnly",
      "retrieval",
      "lane",
      "installability",
      "arbor",
      "graph",
      "freshness",
    ]);
    expect(CAMPAIGN_MANIFEST_LENS_KEYS).toEqual([
      "retrieval",
      "lane",
      "installability",
      "arbor",
      "graph",
      "freshness",
    ]);
    expect(MANIFEST_RETRIEVAL_RANKED_KEYS).toEqual([
      "score",
      "margin",
      "matchKind",
      "classified",
      "nameMatchesQuery",
    ]);
    expect(MANIFEST_RETRIEVAL_EXACT_KEYS).toEqual([
      "score",
      "margin",
      "matchKind",
      "matchedBy",
      "classified",
      "nameMatchesQuery",
    ]);
    expect(MANIFEST_RETRIEVAL_ABSENT_KEYS).toEqual(["status", "reason"]);
    expect(MANIFEST_LANE_LENS_KEYS).toEqual([
      "status",
      "invocation",
      "lane",
      "convergenceOnly",
    ]);
    expect(MANIFEST_INSTALLABILITY_LENS_KEYS).toEqual([
      "status",
      "state",
      "reason",
      "applicability",
      "applicabilityReason",
      "observationDigest",
      "observedAt",
    ]);
    expect(MANIFEST_ARBOR_LENS_KEYS).toEqual([
      "status",
      "availability",
      "join",
      "upstreamStatus",
      "sourceDigest",
      "claims",
      "conditionsEvaluated",
      "reason",
      "hellHeaven",
    ]);
    expect(MANIFEST_ARBOR_HELL_HEAVEN_KEYS).toEqual([
      "status",
      "availability",
      "upstreamStatus",
      "reason",
    ]);
    expect(MANIFEST_GRAPH_LENS_KEYS).toEqual([
      "status",
      "availability",
      "join",
      "upstreamStatus",
      "sourceDigest",
      "absenceMeaning",
      "relations",
      "reason",
    ]);
    expect(MANIFEST_FRESHNESS_PRESENT_KEYS).toEqual([
      "status",
      "indexGeneratedAt",
      "indexAgeDays",
      "stale",
      "indexOrigin",
      "source",
    ]);
    expect(MANIFEST_FRESHNESS_ABSENT_KEYS).toEqual([
      "status",
      "indexGeneratedAt",
      "indexAgeDays",
      "stale",
      "indexOrigin",
      "source",
      "reason",
    ]);

    const recon = makeRecon();
    const manifest = buildCampaignManifest(recon, [
      "recon:recon-1:gap:0:card:skill/a",
      "recon:recon-1:gap:0:card:skill/b",
      "recon:recon-1:gap:2:card:skill/c",
    ]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
    expect(Object.isFrozen(manifest.gaps)).toBe(true);

    const forbiddenPattern =
      /combined|blend|weight|master|composite|overall|aggregate|scalar|total/i;
    for (const key of Object.keys(manifest)) {
      expect(key).not.toMatch(forbiddenPattern);
    }
    for (const gap of manifest.gaps) {
      for (const key of Object.keys(gap)) {
        expect(key).not.toMatch(forbiddenPattern);
      }
    }
    for (const entry of manifest.entries) {
      for (const key of Object.keys(entry)) {
        expect(key).not.toMatch(forbiddenPattern);
      }
      for (const lens of CAMPAIGN_MANIFEST_LENS_KEYS) {
        for (const key of Object.keys(entry[lens])) {
          expect(key).not.toMatch(forbiddenPattern);
        }
      }
    }
  });

  it("rejects any combined, blended, or weight field at every level and in selection inputs", () => {
    const recon = makeRecon();
    const manifest = buildCampaignManifest(recon, [
      "recon:recon-1:gap:0:card:skill/a",
    ]);

    for (const field of COMBINED_SCORE_FIELDS) {
      const top = clone(manifest) as Record<string, unknown>;
      top[field] = 0.5;
      expect(parseCampaignManifest(top)).toBeNull();

      const gapBad = clone(manifest) as unknown as {
        gaps: Record<string, unknown>[];
      };
      gapBad.gaps[0]![field] = 0.5;
      expect(parseCampaignManifest(gapBad)).toBeNull();

      const entryBad = clone(manifest) as unknown as {
        entries: Record<string, unknown>[];
      };
      entryBad.entries[0]![field] = 0.5;
      expect(parseCampaignManifest(entryBad)).toBeNull();

      for (const lens of CAMPAIGN_MANIFEST_LENS_KEYS) {
        const lensBad = clone(manifest) as unknown as {
          entries: Record<string, Record<string, unknown>>[];
        };
        lensBad.entries[0]![lens]![field] = 0.5;
        expect(parseCampaignManifest(lensBad)).toBeNull();
      }

      expect(() =>
        buildCampaignManifest(recon, [
          {
            cardRef: "recon:recon-1:gap:0:card:skill/a",
            [field]: 0.5,
          } as unknown as string,
        ]),
      ).toThrow(CampaignManifestError);

      const res = tryBuildCampaignManifest(recon, {
        selections: ["recon:recon-1:gap:0:card:skill/a"],
        [field]: 0.5,
      } as unknown as readonly string[]);
      expect(res.ok).toBe(false);
    }
  });

  it("accepts U1 RetrievalDisclosure with matchedBy: undefined and selection container variants", () => {
    const recon = makeRecon();
    const reconWithUndefinedMatchedBy: CampaignReconRecordInput = {
      ...recon,
      gaps: [
        {
          ...recon.gaps[0]!,
          candidates: [
            makeCandidate("recon-1", 0, "skill/a", {
              retrieval: {
                score: 0.7,
                margin: 0.2,
                matchKind: "ranked",
                matchedBy: undefined,
                classified: true,
                nameMatchesQuery: true,
              },
            }),
          ],
        },
        recon.gaps[1]!,
        recon.gaps[2]!,
      ],
    };

    const m1 = buildCampaignManifest(reconWithUndefinedMatchedBy, {
      reconId: "recon-1",
      selections: [
        {
          reconId: "recon-1",
          gapIndex: 0,
          gap: "build manifest",
          cardRef: "recon:recon-1:gap:0:card:skill/a",
          id: "skill/a",
          skillId: "skill/a",
        },
      ],
    });
    expect(m1.entries).toHaveLength(1);
    expect("matchedBy" in m1.entries[0]!.retrieval).toBe(false);
    expect(isValidManifestForRecon(reconWithUndefinedMatchedBy, m1)).toBe(true);
    expect(parseCampaignManifest(m1, reconWithUndefinedMatchedBy)).toEqual(m1);

    const m2 = buildCampaignManifest(recon, {
      entries: [{ cardRef: "recon:recon-1:gap:2:card:skill/c", gap: 2 }],
    });
    expect(m2.entries).toHaveLength(1);
    expect(m2.entries[0]!.id).toBe("skill/c");
  });

  it("rejects uncited entries, non-matched gaps, and tampered lens values", () => {
    const recon = makeRecon();
    const valid = buildCampaignManifest(recon, [
      "recon:recon-1:gap:0:card:skill/a",
    ]);

    expect(isValidManifestForRecon(recon, valid)).toBe(true);
    expect(parseCampaignManifest(valid, recon)).toEqual(valid);

    expect(() =>
      buildCampaignManifest(recon, ["recon:recon-1:gap:0:card:skill/missing"]),
    ).toThrow(CampaignManifestError);

    expect(() =>
      buildCampaignManifest(recon, [
        {
          reconId: "recon-other",
          cardRef: "recon:recon-1:gap:0:card:skill/a",
        },
      ]),
    ).toThrow(CampaignManifestError);

    expect(() =>
      buildCampaignManifest(recon, [
        {
          gapIndex: 2,
          cardRef: "recon:recon-1:gap:0:card:skill/a",
        },
      ]),
    ).toThrow(CampaignManifestError);

    expect(() =>
      buildCampaignManifest(recon, [
        {
          gap: "wrong query",
          cardRef: "recon:recon-1:gap:0:card:skill/a",
        },
      ]),
    ).toThrow(CampaignManifestError);

    expect(() =>
      buildCampaignManifest(recon, [
        {
          id: "skill/other",
          cardRef: "recon:recon-1:gap:0:card:skill/a",
        },
      ]),
    ).toThrow(CampaignManifestError);

    const reconWithBadGapCandidate: CampaignReconRecordInput = {
      ...recon,
      gaps: [
        recon.gaps[0]!,
        {
          ...recon.gaps[1]!,
          candidates: [makeCandidate("recon-1", 1, "skill/no-match")],
        },
        recon.gaps[2]!,
      ],
    };
    const noMatchAttempt = tryBuildCampaignManifest(reconWithBadGapCandidate, [
      "recon:recon-1:gap:1:card:skill/no-match",
    ]);
    expect(noMatchAttempt.ok).toBe(false);

    const tamperedScore = clone(valid) as unknown as {
      entries: { retrieval: { score: number } }[];
    };
    tamperedScore.entries[0]!.retrieval.score = 0.12345;
    expect(parseCampaignManifest(tamperedScore)).not.toBeNull();
    expect(isValidManifestForRecon(recon, tamperedScore)).toBe(false);
    expect(parseCampaignManifest(tamperedScore, recon)).toBeNull();

    const forgedEntry = clone(valid) as unknown as {
      entries: ReconCandidateCardInput[];
      gaps: { selectedCardRefs: string[] }[];
    };
    const forgedRef = "recon:recon-1:gap:0:card:skill/forged";
    forgedEntry.entries[0] = {
      ...forgedEntry.entries[0]!,
      ...makeCandidate("recon-1", 0, "skill/forged"),
      cardRef: forgedRef,
    };
    forgedEntry.gaps[0]!.selectedCardRefs = [forgedRef];
    expect(isValidManifestForRecon(recon, forgedEntry)).toBe(false);
    expect(parseCampaignManifest(forgedEntry, recon)).toBeNull();
  });

  it("enforces FD-3 human-led convergence-only invariant", () => {
    const recon: CampaignReconRecordInput = {
      schema: CAMPAIGN_SCHEMA_IDS.recon,
      reconId: "recon-fd3",
      gaps: [
        {
          gapIndex: 0,
          query: "mixed lanes",
          status: "matched",
          refused: false,
          refusal: null,
          candidates: [
            // Even if recon candidate had convergenceOnly: false on human-led, builder enforces true.
            makeCandidate("recon-fd3", 0, "skill/human-lane", {
              lane: {
                status: "present",
                invocation: "any",
                lane: "human-led",
                convergenceOnly: false,
              },
            }),
            makeCandidate("recon-fd3", 0, "skill/human-invoc", {
              lane: {
                status: "present",
                invocation: "human",
                lane: "unclassified",
                convergenceOnly: false,
              },
            }),
            makeCandidate("recon-fd3", 0, "skill/model", {
              lane: {
                status: "present",
                invocation: "model",
                lane: "model-led",
                convergenceOnly: false,
              },
            }),
            makeCandidate("recon-fd3", 0, "skill/unclassified", {
              lane: {
                status: "absent-unknown",
                invocation: "any",
                lane: "unclassified",
                convergenceOnly: false,
              },
            }),
          ],
        },
      ],
    };

    const manifest = buildCampaignManifest(recon, [
      "recon:recon-fd3:gap:0:card:skill/human-lane",
      "recon:recon-fd3:gap:0:card:skill/human-invoc",
      "recon:recon-fd3:gap:0:card:skill/model",
      "recon:recon-fd3:gap:0:card:skill/unclassified",
    ]);

    expect(manifest.entries[0]!.convergenceOnly).toBe(true);
    expect(manifest.entries[0]!.lane.convergenceOnly).toBe(true);
    expect(manifest.entries[1]!.convergenceOnly).toBe(true);
    expect(manifest.entries[1]!.lane.convergenceOnly).toBe(true);
    expect(manifest.entries[2]!.convergenceOnly).toBe(false);
    expect(manifest.entries[2]!.lane.convergenceOnly).toBe(false);
    expect(manifest.entries[3]!.convergenceOnly).toBe(false);
    expect(manifest.entries[3]!.lane.convergenceOnly).toBe(false);

    const badHuman = clone(manifest) as unknown as {
      entries: { convergenceOnly: boolean; lane: { convergenceOnly: boolean } }[];
    };
    badHuman.entries[0]!.convergenceOnly = false;
    expect(parseCampaignManifest(badHuman)).toBeNull();

    badHuman.entries[0]!.convergenceOnly = false;
    badHuman.entries[0]!.lane.convergenceOnly = false;
    expect(parseCampaignManifest(badHuman)).toBeNull();

    const badModel = clone(manifest) as unknown as {
      entries: { convergenceOnly: boolean; lane: { convergenceOnly: boolean } }[];
    };
    badModel.entries[2]!.convergenceOnly = true;
    badModel.entries[2]!.lane.convergenceOnly = true;
    expect(parseCampaignManifest(badModel)).toBeNull();
  });

  it("K5 property test: relations annotate and never filter or reorder selected entries across 260 seeded trials", () => {
    const rng = mulberry32(0x5eed2026);
    const directions = ["subject-acts-on", "acts-on-subject"] as const;
    const pins = ["verified", "mismatched", "unverified"] as const;
    const skillIds = [
      "skill/alpha",
      "skill/beta",
      "skill/gamma",
      "skill/delta",
      "skill/epsilon",
    ] as const;

    const shuffle = <T>(arr: readonly T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    };

    const makeRandomRelations = (
      subjectId: string,
    ): readonly ArborInteractionReport[] => {
      const count = Math.floor(rng() * 5);
      const rels: ArborInteractionReport[] = [];
      for (let k = 0; k < count; k++) {
        const relation =
          ARBOR_RELATIONS[Math.floor(rng() * ARBOR_RELATIONS.length)]!;
        const direction =
          directions[Math.floor(rng() * directions.length)]!;
        const counterpartPin = pins[Math.floor(rng() * pins.length)]!;
        const otherId = skillIds[Math.floor(rng() * skillIds.length)]!;
        const subjectRef = { id: subjectId, contentSha256: "a".repeat(64) };
        const otherRef = { id: otherId, contentSha256: "b".repeat(64) };
        rels.push({
          edge: {
            schema: ARBOR_EDGE_SCHEMA,
            edgeKey: `${subjectId}:${otherId}:${relation}:${k}`,
            pair:
              direction === "subject-acts-on"
                ? { from: subjectRef, to: otherRef }
                : { from: otherRef, to: subjectRef },
            target: {
              declarationSha256: "d".repeat(64),
              claimId: `claim-${k}`,
            },
            relation,
            conditions: `Condition ${k}`,
            authority: { actor: "curator-test", basis: "benchmark" },
            support: "expert-declared",
            declarationSource: "registry/arbor/edge.json",
            observationSources: ["obs-1"],
            interpretationSource: null,
            structuralOverlap: EDGE_STRUCTURAL_OVERLAP,
            pairApplicable: rng() > 0.5,
          },
          direction,
          counterpart: otherRef,
          counterpartPin,
        });
      }
      return shuffle(rels);
    };

    for (let trial = 0; trial < 260; trial++) {
      const reconId = `recon-prop-${trial}`;
      const gap0Candidates: ReconCandidateCardInput[] = [];
      const gap1Candidates: ReconCandidateCardInput[] = [];

      for (const id of skillIds) {
        const rels0 = makeRandomRelations(id);
        const rels1 = makeRandomRelations(id);
        const absentMode = rng() > 0.5;

        gap0Candidates.push(
          makeCandidate(reconId, 0, id, {
            graph:
              rels0.length === 0
                ? {
                    status: absentMode
                      ? "absent-no-edges"
                      : "absent-publication-unavailable",
                    availability: absentMode ? "absent" : "unknown",
                    join: absentMode
                      ? "content-pinned"
                      : "publication-unavailable",
                    upstreamStatus: absentMode
                      ? "absent-no-accepted-record"
                      : null,
                    sourceDigest: null,
                    absenceMeaning: EDGE_ABSENCE_MEANING,
                    relations: [],
                    reason: "No relations.",
                  }
                : {
                    status: "present",
                    availability: "consulted",
                    join: "content-pinned",
                    upstreamStatus: "present",
                    sourceDigest: "sha256:graph",
                    absenceMeaning: EDGE_ABSENCE_MEANING,
                    relations: rels0,
                    reason: "Ordered edges read as published.",
                  },
          }),
        );

        gap1Candidates.push(
          makeCandidate(reconId, 1, id, {
            graph:
              rels1.length === 0
                ? {
                    status: "absent-no-edges",
                    availability: "absent",
                    join: "content-pinned",
                    upstreamStatus: "absent-no-accepted-record",
                    sourceDigest: null,
                    absenceMeaning: EDGE_ABSENCE_MEANING,
                    relations: [],
                    reason: "No relations.",
                  }
                : {
                    status: "present",
                    availability: "consulted",
                    join: "content-pinned",
                    upstreamStatus: "present",
                    sourceDigest: "sha256:graph",
                    absenceMeaning: EDGE_ABSENCE_MEANING,
                    relations: rels1,
                    reason: "Ordered edges read as published.",
                  },
          }),
        );
      }

      const gaps: ReconGapRecordInput[] = [
        {
          gapIndex: 0,
          query: "gap zero",
          status: "matched",
          refused: false,
          refusal: null,
          candidates: gap0Candidates,
          graph: {
            status: "present",
            interactions: shuffle([
              ...gap0Candidates.flatMap((c) => c.graph.relations),
            ]),
          },
        },
        {
          gapIndex: 1,
          query: "gap one",
          status: "matched",
          refused: false,
          refusal: null,
          candidates: gap1Candidates,
          graph: {
            status: "present",
            interactions: shuffle([
              ...gap1Candidates.flatMap((c) => c.graph.relations),
            ]),
          },
        },
      ];

      const recon: CampaignReconRecordInput = {
        schema: CAMPAIGN_SCHEMA_IDS.recon,
        reconId,
        gaps,
      };

      const allSelections = [
        ...gap0Candidates.map((c) => ({ gapIndex: 0, cardRef: c.cardRef, id: c.id, relations: c.graph.relations })),
        ...gap1Candidates.map((c) => ({ gapIndex: 1, cardRef: c.cardRef, id: c.id, relations: c.graph.relations })),
      ];
      const selected = shuffle(allSelections).slice(0, 4 + Math.floor(rng() * 3));

      const manifest = buildCampaignManifest(
        recon,
        selected.map((s) => s.cardRef),
      );

      expect(manifest.entries.map((e) => e.cardRef)).toEqual(
        selected.map((s) => s.cardRef),
      );
      expect(manifest.entries.map((e) => e.id)).toEqual(
        selected.map((s) => s.id),
      );

      for (let i = 0; i < selected.length; i++) {
        expect(manifest.entries[i]!.graph.relations).toEqual(
          selected[i]!.relations,
        );
      }
      expect(isValidManifestForRecon(recon, manifest)).toBe(true);
    }
  });

  it("hardens validateReconRecord against unknown/combined-score fields, sparse arrays, getters, and missing citations", () => {
    const recon = makeRecon();
    const valid = buildCampaignManifest(recon, [
      "recon:recon-1:gap:0:card:skill/a",
    ]);

    // 1. Unknown / combined-score fields on recon, gap, and candidate
    for (const field of COMBINED_SCORE_FIELDS) {
      const badRecon = clone(recon) as unknown as Record<string, unknown>;
      badRecon[field] = 0.5;
      expect(() =>
        buildCampaignManifest(badRecon as CampaignReconRecordInput, [
          "recon:recon-1:gap:0:card:skill/a",
        ]),
      ).toThrow(CampaignManifestError);
      expect(
        isValidManifestForRecon(badRecon as CampaignReconRecordInput, valid),
      ).toBe(false);

      const badGap = clone(recon) as unknown as {
        gaps: Record<string, unknown>[];
      };
      badGap.gaps[0]![field] = 0.5;
      expect(() =>
        buildCampaignManifest(badGap as unknown as CampaignReconRecordInput, [
          "recon:recon-1:gap:0:card:skill/a",
        ]),
      ).toThrow(CampaignManifestError);
      expect(
        isValidManifestForRecon(
          badGap as unknown as CampaignReconRecordInput,
          valid,
        ),
      ).toBe(false);

      const badCandidate = clone(recon) as unknown as {
        gaps: { candidates: Record<string, unknown>[] }[];
      };
      badCandidate.gaps[0]!.candidates[0]![field] = 0.5;
      expect(() =>
        buildCampaignManifest(
          badCandidate as unknown as CampaignReconRecordInput,
          ["recon:recon-1:gap:0:card:skill/a"],
        ),
      ).toThrow(CampaignManifestError);
      expect(
        isValidManifestForRecon(
          badCandidate as unknown as CampaignReconRecordInput,
          valid,
        ),
      ).toBe(false);
    }

    // 2. Sparse recon.gaps and sparse gap.candidates arrays
    const sparseGapsRecon = clone(recon);
    const sparseGaps = [sparseGapsRecon.gaps[0]!];
    sparseGaps.length = 2;
    (sparseGapsRecon as unknown as { gaps: unknown }).gaps = sparseGaps;
    expect(() =>
      buildCampaignManifest(sparseGapsRecon, [
        "recon:recon-1:gap:0:card:skill/a",
      ]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(sparseGapsRecon, valid)).toBe(false);

    const sparseCandidatesRecon = clone(recon);
    const sparseCandidates = [sparseCandidatesRecon.gaps[0]!.candidates[0]!];
    sparseCandidates.length = 2;
    (
      sparseCandidatesRecon.gaps[0] as unknown as { candidates: unknown }
    ).candidates = sparseCandidates;
    expect(() =>
      buildCampaignManifest(sparseCandidatesRecon, [
        "recon:recon-1:gap:0:card:skill/a",
      ]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(sparseCandidatesRecon, valid)).toBe(false);

    // 3. Getter accessors on recon, gap, and candidate
    const getterRecon = clone(recon);
    Object.defineProperty(getterRecon, "findings", {
      enumerable: true,
      get() {
        return ["forged"];
      },
    });
    expect(() =>
      buildCampaignManifest(getterRecon, ["recon:recon-1:gap:0:card:skill/a"]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(getterRecon, valid)).toBe(false);

    const getterGap = clone(recon);
    Object.defineProperty(getterGap.gaps[0]!, "query", {
      enumerable: true,
      get() {
        return "build manifest";
      },
    });
    expect(() =>
      buildCampaignManifest(getterGap, ["recon:recon-1:gap:0:card:skill/a"]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(getterGap, valid)).toBe(false);

    const getterCandidate = clone(recon);
    Object.defineProperty(getterCandidate.gaps[0]!.candidates[0]!, "name", {
      enumerable: true,
      get() {
        return "skill/a";
      },
    });
    expect(() =>
      buildCampaignManifest(getterCandidate, [
        "recon:recon-1:gap:0:card:skill/a",
      ]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(getterCandidate, valid)).toBe(false);

    // 4. Candidate cardRef missing from recon.citations when citations is provided
    const uncitedRecon: CampaignReconRecordInput = {
      ...clone(recon),
      citations: ["recon:recon-1:gap:0:card:skill/b"],
    };
    expect(() =>
      buildCampaignManifest(uncitedRecon, ["recon:recon-1:gap:0:card:skill/a"]),
    ).toThrow(CampaignManifestError);
    expect(isValidManifestForRecon(uncitedRecon, valid)).toBe(false);

    const citedRecon: CampaignReconRecordInput = {
      ...clone(recon),
      citations: ["recon:recon-1:gap:0:card:skill/a"],
    };
    expect(
      buildCampaignManifest(citedRecon, ["recon:recon-1:gap:0:card:skill/a"]),
    ).toEqual(valid);
    expect(isValidManifestForRecon(citedRecon, valid)).toBe(true);
  });
});
