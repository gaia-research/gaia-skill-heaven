// Closed-shape validation of the pinned Arbor contracts.
//
// Two failure modes matter more than the happy path: a field that is quietly
// ACCEPTED when upstream rejects it (a fork), and a field that is quietly
// DROPPED on projection (a misreport). Both are tested here.

import { describe, expect, it } from "vitest";

import {
  ArborContractError,
  assertArborEdge,
  assertArborEdgeIndex,
  assertArborProfile,
  assertArborRuntime,
  assertArborRuntimeIndex,
  isGovernedSupport,
  isProjectedSupport,
} from "../src/arbor/validate.js";
import {
  claim,
  digest,
  edge,
  profile,
  runtime,
  SUBJECT,
} from "./fixtures/arbor/protocol.js";

describe("Arbor contract validation is closed", () => {
  it("accepts a conforming profile, runtime aggregate, edge and edge index", () => {
    expect(() => assertArborProfile(profile())).not.toThrow();
    expect(() => assertArborRuntime(runtime())).not.toThrow();
    expect(() => assertArborEdge(edge())).not.toThrow();
    expect(() =>
      assertArborEdgeIndex({
        schema: "gaia.arbor-edge-index/v1",
        edgeSetVersion: "gaia.arbor-edge/v1",
        coverage: { pairsEvaluated: 1, absenceMeaning: "not-evaluated" },
        edges: [edge()],
      }),
    ).not.toThrow();
  });

  it("rejects an unknown field rather than carrying it into runtime state", () => {
    expect(() => assertArborProfile({ ...profile(), polarity: 0.7 })).toThrow(ArborContractError);
    expect(() => assertArborProfile({ ...profile(), claims: [{ ...claim(), confidence: "high" }] })).toThrow(
      /unknown field 'confidence'/u,
    );
    // `polarity` and `confidence` are real upstream words on OTHER contracts
    // (the HH result profile and hh-stamp/v1). Accepting either on an Arbor
    // claim is the exact substitution SPEC §4.2 forbids.
    expect(() => assertArborEdge({ ...edge(), weight: 1 })).toThrow(/unknown field 'weight'/u);
  });

  it("rejects a missing required field rather than defaulting it", () => {
    const { conditions: _dropped, ...withoutConditions } = claim();
    expect(() => assertArborProfile(profile([withoutConditions as never]))).toThrow(
      /missing required field 'conditions'/u,
    );
    const { support: _support, ...withoutSupport } = claim();
    expect(() => assertArborProfile(profile([withoutSupport as never]))).toThrow(
      /missing required field 'support'/u,
    );
  });

  it("fails closed on an unrecognised schema id or runtime version", () => {
    expect(() => assertArborProfile({ ...profile(), schema: "gaia.arbor-profile/v2" })).toThrow(
      /must be 'gaia.arbor-profile\/v1'/u,
    );
    expect(() =>
      assertArborRuntimeIndex({
        schema: "gaia.arbor-runtime-index/v1",
        runtimeVersion: "gaia.arbor-runtime/v2",
        subjects: [],
      }),
    ).toThrow(/must be 'gaia.arbor-runtime\/v1'/u);
  });

  it("keeps the projected five-value support enum apart from the governed four", () => {
    for (const value of ["benchmark-confirmed", "benchmark-qualified", "benchmark-revised", "inconclusive"]) {
      expect(isGovernedSupport(value)).toBe(true);
      expect(isProjectedSupport(value)).toBe(true);
    }
    // A curator record may not set a claim back to `expert-declared`; a
    // projection may carry it. Collapsing the two enums would erase that.
    expect(isGovernedSupport("expert-declared")).toBe(false);
    expect(isProjectedSupport("expert-declared")).toBe(true);
    expect(() => assertArborProfile(profile([claim({ support: "benchmark-passed" as never })]))).toThrow(
      /must be one of expert-declared/u,
    );
  });

  it("requires at least one claim, unique digests, and well-formed pins", () => {
    expect(() => assertArborProfile({ ...profile(), claims: [] })).toThrow(/at least one claim/u);
    expect(() =>
      assertArborProfile(profile([claim({ benchmarkSources: [digest("1"), digest("1")] })])),
    ).toThrow(/repeats digest/u);
    expect(() => assertArborProfile({ ...profile(), inputDigest: "not-a-digest" })).toThrow(
      ArborContractError,
    );
    expect(() =>
      assertArborRuntime(runtime({ subject: { id: "../escape", contentSha256: digest("a") } })),
    ).toThrow(ArborContractError);
  });

  it("holds `structuralOverlap` and `absenceMeaning` to their upstream consts", () => {
    expect(() => assertArborEdge({ ...edge(), structuralOverlap: "evaluated" })).toThrow(
      /must be 'not-evaluated'/u,
    );
    expect(() =>
      assertArborEdgeIndex({
        schema: "gaia.arbor-edge-index/v1",
        edgeSetVersion: "gaia.arbor-edge/v1",
        coverage: { pairsEvaluated: 0, absenceMeaning: "no-interaction" },
        edges: [],
      }),
    ).toThrow(/must be 'not-evaluated'/u);
  });

  it("accepts both facets on one subject, as independent nonexclusive claims", () => {
    const both = profile([
      claim({ id: "claim.one", facet: "human-led", conditions: "under operator supervision" }),
      claim({ id: "claim.two", facet: "model-led", conditions: "inside a sandboxed session" }),
    ]);
    expect(() => assertArborProfile(both)).not.toThrow();
    expect(both.claims.map((entry) => entry.facet)).toEqual(["human-led", "model-led"]);
  });

  it("accepts an empty published edge set, because absence is not-evaluated", () => {
    expect(() =>
      assertArborEdgeIndex({
        schema: "gaia.arbor-edge-index/v1",
        edgeSetVersion: "gaia.arbor-edge/v1",
        coverage: { pairsEvaluated: 0, absenceMeaning: "not-evaluated" },
        edges: [],
      }),
    ).not.toThrow();
    expect(() => assertArborRuntimeIndex({
      schema: "gaia.arbor-runtime-index/v1",
      runtimeVersion: "gaia.arbor-runtime/v1",
      subjects: [],
    })).not.toThrow();
    expect(SUBJECT.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
