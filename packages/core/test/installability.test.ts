import { describe, expect, it } from "vitest";

import {
  Bm25fRanker,
  buildSkillIndex,
  decide,
  isReachable,
  withInstallability,
  type InstallabilityAssessment,
} from "../src/index.js";

const route = {
  url: "https://github.com/example/tools/blob/main/skill/SKILL.md",
  owner: "example",
  repo: "tools",
  ref: "main",
  subpath: "skill",
  entrypoint: "skill/SKILL.md",
  installSubpath: "skill",
};

const id = "example/core-decorator";

const typedButUnproven: InstallabilityAssessment = {
  state: "not-materializable",
  reason: "intrinsic-content-failure",
  applicability: "verified",
  applicabilityReason: "matched",
  projectionIndexPath: "docs/graph/installability/index.json",
  upstream: {
    state: "not-materializable",
    reason: "intrinsic-content-failure",
    observationDigest: null,
    observedAt: null,
    currentSourceRoute: route,
    currentSkillContentSha256: null,
    observedSourceRoute: route,
    observedSkillContentSha256: null,
    resolvedRevision: null,
    deliveredContentSha256: null,
  },
};

describe("core installability decoration", () => {
  it("cannot promote a verified negative without observation provenance", () => {
    const index = buildSkillIndex({
      projection: {
        buckets: {
          test: [
            {
              id,
              name: "Core Decorator",
              contributor: "example",
              description: "Reject a core decorator test candidate.",
              tags: ["core", "decorator"],
              links: {},
              installable: true,
            },
          ],
        },
      },
      source: "synthetic",
      sourceDigest: "synthetic",
      builderVersion: "test",
      generatedAt: "2026-09-12T00:00:00Z",
    });

    const decorated = withInstallability(
      index,
      new Map([[id, typedButUnproven]]),
    );
    const document = decorated.docs[0]!;
    const decision = decide({
      index: decorated,
      query: "core decorator",
      ranked: new Bm25fRanker(decorated).rank("core decorator"),
      surface: "any",
    });

    expect(document.installability).toMatchObject({
      state: "unknown",
      reason: "unverified-applicability",
      applicability: "unknown",
      applicabilityReason: "invalid-evidence",
    });
    expect(isReachable(document)).toBe(true);
    expect(decision.filtered).toEqual([]);
    expect(decision.noMatch).toBeNull();
    expect(decision.admitted.map((hit) => hit.doc.id)).toEqual([id]);
  });
});
