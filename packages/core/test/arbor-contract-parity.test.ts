// The anti-fork gate for Lane A (issue #118).
//
// `packages/core/src/arbor/*` is a hand-rolled mirror of ratified upstream
// contracts. A mirror that drifts is a local Arbor schema wearing a consumer's
// clothes — precisely the thing SPEC §4.2 forbids — and it would drift
// SILENTLY, because every one of our own tests would keep passing against our
// own shape. So the mirror is checked against the PINNED upstream schema BYTES,
// and the committed publication cache is checked against the bytes it claims to
// be a copy of.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ARBOR_EDGE_INDEX_SCHEMA,
  ARBOR_EDGE_SCHEMA,
  ARBOR_FACETS,
  ARBOR_LENS_STATUS,
  ARBOR_PROFILE_SCHEMA,
  ARBOR_RELATIONS,
  ARBOR_RUNTIME_SCHEMA,
  EDGE_ABSENCE_MEANING,
  EDGE_STRUCTURAL_OVERLAP,
  GOVERNED_SUPPORT,
  PROJECTED_SUPPORT,
} from "../src/arbor/contract.js";
import { assertArborEdgeIndex, assertArborRuntimeIndex } from "../src/arbor/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "arbor");
const repoRoot = join(here, "..", "..", "..");
const cacheRoot = join(repoRoot, "plugins", "skill-heaven", "data", "arbor");

type JsonSchema = Record<string, any>;

function pinned(name: string): JsonSchema {
  return JSON.parse(readFileSync(join(fixtures, "contracts", name), "utf8")) as JsonSchema;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("pinned upstream Arbor contracts", () => {
  const manifest = JSON.parse(readFileSync(join(fixtures, "PINNED.json"), "utf8")) as {
    commit: string;
    files: Record<string, string>;
  };

  it("the pinned schema fixtures are the exact upstream bytes they claim to be", () => {
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
    for (const [relative, digest] of Object.entries(manifest.files)) {
      expect(sha256File(join(fixtures, relative)), relative).toBe(digest);
    }
    expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/u);
  });

  it("mirrors every schema id verbatim", () => {
    expect(pinned("profile.schema.json").$id).toBe(ARBOR_PROFILE_SCHEMA);
    expect(pinned("runtime.schema.json").$id).toBe(ARBOR_RUNTIME_SCHEMA);
    expect(pinned("edge.schema.json").$id).toBe(ARBOR_EDGE_SCHEMA);
    expect(pinned("edge-index.schema.json").$id).toBe(ARBOR_EDGE_INDEX_SCHEMA);
  });

  it("mirrors the profile claim's required fields exactly — no additions, no omissions", () => {
    const claim = pinned("profile.schema.json").definitions.claim;
    // The consumer's claim type and validator must cover exactly this set: a
    // field we dropped would be silently lost on projection, and a field we
    // added would be invented.
    expect([...claim.required].sort()).toEqual(
      [
        "authority",
        "benchmarkSources",
        "conditions",
        "declarationId",
        "declarationSource",
        "declaredAt",
        "facet",
        "id",
        "interpretationSource",
        "rationale",
        "support",
      ].sort(),
    );
    expect(claim.additionalProperties).toBe(false);
    expect(Object.keys(claim.properties).sort()).toEqual([...claim.required].sort());
  });

  it("mirrors the PROJECTED support enum at five values and the GOVERNED enum at four", () => {
    // Upstream keeps these deliberately different: a curator may set four
    // values; only an untouched declaration carries `expert-declared`.
    expect(pinned("profile.schema.json").definitions.claim.properties.support.enum).toEqual([
      ...PROJECTED_SUPPORT,
    ]);
    expect(pinned("edge.schema.json").properties.support.enum).toEqual([...PROJECTED_SUPPORT]);
    expect(pinned("interpretation.schema.json").properties.support.enum).toEqual([
      ...GOVERNED_SUPPORT,
    ]);
    expect(pinned("edge-interpretation.schema.json").properties.support.enum).toEqual([
      ...GOVERNED_SUPPORT,
    ]);
    expect(PROJECTED_SUPPORT).toHaveLength(5);
    expect(GOVERNED_SUPPORT).toHaveLength(4);
    expect(GOVERNED_SUPPORT as readonly string[]).not.toContain("expert-declared");
  });

  it("mirrors facets, relations, lens statuses and the two consts", () => {
    expect(pinned("profile.schema.json").definitions.claim.properties.facet.enum).toEqual([
      ...ARBOR_FACETS,
    ]);
    expect(pinned("edge.schema.json").properties.relation.enum).toEqual([...ARBOR_RELATIONS]);
    expect(pinned("runtime.schema.json").definitions.status.enum).toEqual([...ARBOR_LENS_STATUS]);
    expect(pinned("edge.schema.json").properties.structuralOverlap.const).toBe(
      EDGE_STRUCTURAL_OVERLAP,
    );
    expect(pinned("edge-index.schema.json").definitions.coverage.properties.absenceMeaning.const).toBe(
      EDGE_ABSENCE_MEANING,
    );
  });

  it("mirrors the runtime aggregate's three lenses and their required fields", () => {
    const runtime = pinned("runtime.schema.json");
    expect([...runtime.required].sort()).toEqual(["inputDigest", "lenses", "schema", "subject"]);
    expect([...runtime.properties.lenses.required].sort()).toEqual([
      "claims",
      "hellHeaven",
      "interactions",
    ]);
    expect([...runtime.definitions.claimsLens.required].sort()).toEqual([
      "profile",
      "sourceDigest",
      "status",
    ]);
    expect([...runtime.definitions.hellHeavenLens.required].sort()).toEqual([
      "result",
      "sourceDigest",
      "status",
    ]);
    expect([...runtime.definitions.interactionsLens.required].sort()).toEqual([
      "edges",
      "sourceDigest",
      "status",
    ]);
  });

  it("every contract this consumer reads is closed to unknown fields upstream", () => {
    for (const name of ["profile", "runtime", "edge", "edge-index"]) {
      expect(pinned(`${name}.schema.json`).additionalProperties, name).toBe(false);
    }
  });
});

describe("committed Arbor publication cache", () => {
  const provenance = JSON.parse(readFileSync(join(cacheRoot, "provenance.json"), "utf8")) as {
    commit: string;
    upstream: string;
    path: string;
    files: Record<string, string>;
  };

  it("records which upstream revision the cached bytes came from", () => {
    expect(provenance.upstream).toMatch(/gaia-skill-tree/u);
    expect(provenance.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(provenance.path).toBe("docs/graph/arbor");
  });

  it("the cached bytes match the digests the provenance record claims", () => {
    for (const [relative, digest] of Object.entries(provenance.files)) {
      expect(sha256File(join(cacheRoot, relative)), relative).toBe(digest);
    }
  });

  it("the real published documents validate against the mirrored contracts", () => {
    const runtimeIndex = JSON.parse(readFileSync(join(cacheRoot, "runtime", "index.json"), "utf8"));
    const edges = JSON.parse(readFileSync(join(cacheRoot, "edges.json"), "utf8"));
    expect(() => assertArborRuntimeIndex(runtimeIndex)).not.toThrow();
    expect(() => assertArborEdgeIndex(edges)).not.toThrow();
  });

  it("records the CURRENT real state of the canonical publication: empty", () => {
    // This is a statement of fact about upstream at the pinned revision, not a
    // fixture convenience. If it ever fails, upstream published something and
    // this consumer's disclosures should be re-read against real records
    // instead of only synthetic ones.
    const runtimeIndex = JSON.parse(readFileSync(join(cacheRoot, "runtime", "index.json"), "utf8"));
    const edges = JSON.parse(readFileSync(join(cacheRoot, "edges.json"), "utf8"));
    expect(runtimeIndex.subjects).toEqual([]);
    expect(edges.edges).toEqual([]);
    expect(edges.coverage).toEqual({ pairsEvaluated: 0, absenceMeaning: "not-evaluated" });
  });
});
