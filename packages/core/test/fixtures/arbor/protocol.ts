// SYNTHETIC protocol fixtures.
//
// Every record below is invented for this test suite. It conforms to the pinned
// upstream contracts, and it is NOT evidence of any real accepted behavior:
// the canonical publication at the pinned revision contains zero subjects and
// zero edges (see `arbor-contract-parity.test.ts`). These exist so the positive
// consumption paths can be exercised at all — they must never be cited as
// observed behavior of a real skill.

import type {
  ArborClaim,
  ArborEdge,
  ArborProfile,
  ArborRuntime,
  ArborSubjectRef,
} from "../../../src/arbor/contract.js";

export const digest = (seed: string): string => seed.repeat(64).slice(0, 64);

export const SUBJECT: ArborSubjectRef = {
  id: "synthetic/alpha",
  contentSha256: digest("a"),
};

export const OTHER: ArborSubjectRef = {
  id: "synthetic/beta",
  contentSha256: digest("b"),
};

export function claim(overrides: Partial<ArborClaim> = {}): ArborClaim {
  return {
    id: "claim.one",
    facet: "human-led",
    conditions: "only on a repository the operator already has write access to",
    rationale: "the declared workflow assumes an authenticated local checkout",
    authority: { actor: "synthetic-curator", basis: "fixture" },
    support: "expert-declared",
    declarationId: "decl.one",
    declaredAt: "2026-09-01T00:00:00Z",
    declarationSource: digest("c"),
    benchmarkSources: [],
    interpretationSource: null,
    ...overrides,
  };
}

export function profile(claims: ArborClaim[] = [claim()]): ArborProfile {
  return {
    schema: "gaia.arbor-profile/v1",
    skill: SUBJECT,
    inputDigest: digest("d"),
    sources: {
      declarations: [digest("c")],
      benchmarkReceipts: [],
      interpretations: claims.some((entry) => entry.interpretationSource !== null)
        ? [digest("e")]
        : [],
    },
    claims,
  };
}

export function edge(overrides: Partial<ArborEdge> = {}): ArborEdge {
  return {
    schema: "gaia.arbor-edge/v1",
    edgeKey: digest("f"),
    pair: { from: SUBJECT, to: OTHER },
    target: { declarationSha256: digest("c"), claimId: "claim.one" },
    relation: "stabilizes",
    conditions: "only when beta runs after alpha in the same session",
    authority: { actor: "synthetic-curator", basis: "fixture" },
    support: "expert-declared",
    declarationSource: digest("c"),
    observationSources: [],
    interpretationSource: null,
    structuralOverlap: "not-evaluated",
    pairApplicable: true,
    ...overrides,
  };
}

export function runtime(overrides: {
  subject?: ArborSubjectRef;
  claims?: ArborRuntime["lenses"]["claims"];
  hellHeaven?: ArborRuntime["lenses"]["hellHeaven"];
  interactions?: ArborRuntime["lenses"]["interactions"];
} = {}): ArborRuntime {
  const subject = overrides.subject ?? SUBJECT;
  return {
    schema: "gaia.arbor-runtime/v1",
    subject,
    inputDigest: digest("d"),
    lenses: {
      claims:
        overrides.claims ??
        { status: "absent-no-accepted-record", sourceDigest: null, profile: null },
      hellHeaven:
        overrides.hellHeaven ??
        { status: "absent-no-accepted-record", sourceDigest: null, result: null },
      interactions:
        overrides.interactions ??
        { status: "absent-no-accepted-record", sourceDigest: null, edges: [] },
    },
  };
}

export function publicationDocuments(runtimes: ArborRuntime[], edges: ArborEdge[] = []) {
  return {
    provenance: {
      upstream: "synthetic",
      commit: "0".repeat(40),
      path: "docs/graph/arbor",
      capturedAt: "2026-09-13",
      files: {},
    },
    runtimeIndex: {
      schema: "gaia.arbor-runtime-index/v1",
      runtimeVersion: "gaia.arbor-runtime/v1",
      subjects: runtimes.map((entry) => entry.subject),
    },
    edgeIndex: {
      schema: "gaia.arbor-edge-index/v1",
      edgeSetVersion: "gaia.arbor-edge/v1",
      coverage: { pairsEvaluated: edges.length, absenceMeaning: "not-evaluated" },
      edges,
    },
    runtimes: runtimes.map((entry) => ({
      path: `runtime/${entry.subject.id}/${entry.subject.contentSha256}.json`,
      document: entry,
    })),
  };
}
