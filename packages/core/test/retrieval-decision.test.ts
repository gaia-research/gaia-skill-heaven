import { describe, expect, it } from "vitest";

import { Bm25fRanker, EXACT_MATCH_SCORE } from "../src/retrieval/bm25f.js";
import { buildSkillIndex, sha256, type NamedProjection } from "../src/retrieval/build-index.js";
import { MARGIN, decide } from "../src/retrieval/decide.js";
import {
  ClassicDecisionBackend,
  CompareDecisionBackend,
  JevDecisionBackend,
  createDecisionBackend,
} from "../src/retrieval/decision.js";
import {
  JevClient,
  PINNED_MODEL,
  getSharedJevClient,
  resetSharedJevClient,
  type JevTransport,
} from "../src/retrieval/jev-client.js";
import type { SkillIndex } from "../src/retrieval/schema.js";

const installable = "https://github.com/a/b/blob/main/SKILL.md";

function makeIndex(
  skills: NamedProjection["buckets"][string],
  floor: number | null = null,
): SkillIndex {
  const index = buildSkillIndex({
    projection: { buckets: { bucket: skills } },
    source: "https://example.test",
    sourceDigest: sha256("test-digest"),
    builderVersion: "test/0.0.0",
    generatedAt: "2026-09-03T00:00:00.000Z",
  });
  index.stats.floor = floor;
  return index;
}

const testIndex = makeIndex(
  [
    {
      id: "someone/profiler",
      name: "Profiler",
      contributor: "someone",
      description: "Finds the slow path in a request.",
      tags: ["latency"],
      links: { github: installable },
    },
    {
      id: "someone/tracer",
      name: "Tracer",
      contributor: "someone",
      description: "A slow path request distributed tracer.",
      tags: ["latency"],
      links: { github: installable },
    },
    {
      id: "someone/unreachable",
      name: "Unreachable",
      contributor: "someone",
      description: "A slow path request analyzer that cannot be reached.",
      tags: ["latency"],
      links: { github: "https://github.com/a/b" }, // not a SKILL.md -> unreachable
    },
    {
      id: "someone/model-led",
      name: "Model Led",
      contributor: "someone",
      invocation: "model",
      description: "A slow path request analyzer driven by model.",
      tags: ["latency"],
      links: { github: installable },
    },
    {
      id: "someone/human-led",
      name: "Human Led",
      contributor: "someone",
      invocation: "human",
      description: "A slow path request analyzer driven by human.",
      tags: ["latency"],
      links: { github: installable },
    },
  ],
  1,
);

const ranker = new Bm25fRanker(testIndex);
const query = "the request is slow";

/**
 * Creates a mock Jev transport that dynamically synthesizes a complete valid
 * Jev response matching the choices requested by the client.
 */
function createMockTransport(
  choice: string,
  partialProbs: Record<string, number>,
  confidence = 0.95,
  usage = { input_tokens: 150, output_tokens: 20 },
): { transport: JevTransport; getCallCount: () => number; getLastBody: () => any } {
  let calls = 0;
  let lastBody: any = null;

  const transport: JevTransport = async (_endpoint, _headers, body) => {
    calls++;
    lastBody = JSON.parse(body);
    const q = lastBody.questions.selection ?? Object.values(lastBody.questions)[0];
    const expectedChoices: string[] = q.criteria ? Object.keys(q.criteria) : (q.choices ?? []);

    const probabilities: Record<string, number> = {};
    let sum = 0;
    for (const c of expectedChoices) {
      const p = partialProbs[c] ?? 0;
      probabilities[c] = p;
      sum += p;
    }

    // Ensure probabilities sum to 1.0 within tolerance
    if (Math.abs(sum - 1.0) > 0.01 && expectedChoices.includes(choice)) {
      probabilities[choice] = Number(
        Math.max(0, 1.0 - (sum - (partialProbs[choice] ?? 0))).toFixed(4),
      );
    }

    const mockResponse = {
      model: PINNED_MODEL,
      answers: {
        selection: {
          type: "choice",
          choice,
          confidence,
          probabilities,
        },
      },
      usage,
    };

    return {
      status: 200,
      body: JSON.stringify(mockResponse),
    };
  };

  return {
    transport,
    getCallCount: () => calls,
    getLastBody: () => lastBody,
  };
}

describe("DecisionBackend factory & initialization", () => {
  it("creates ClassicDecisionBackend by default", () => {
    const backend = createDecisionBackend();
    expect(backend.mode).toBe("classic");
    expect(backend).toBeInstanceOf(ClassicDecisionBackend);
  });

  it("creates specific backends based on mode string or options object", () => {
    const classic = createDecisionBackend("classic");
    expect(classic.mode).toBe("classic");

    const jev = createDecisionBackend("jev");
    expect(jev.mode).toBe("jev");
    expect(jev).toBeInstanceOf(JevDecisionBackend);
    expect((jev as JevDecisionBackend).client).toBe(getSharedJevClient());

    const compare = createDecisionBackend({ mode: "compare" });
    expect(compare.mode).toBe("compare");
    expect(compare).toBeInstanceOf(CompareDecisionBackend);
    expect((compare as CompareDecisionBackend).jev.client).toBe(getSharedJevClient());
  });

  it("rejects unknown modes", () => {
    expect(() => createDecisionBackend("unknown" as any)).toThrow(/Unsupported decision mode/);
  });
});

describe("ClassicDecisionBackend: exact parity with decide()", () => {
  const backend = new ClassicDecisionBackend();

  it("produces identical admitted skills, margin, ambiguity and filtered reasons", async () => {
    const ranked = ranker.rank(query);
    const classicResult = decide({ index: testIndex, query, ranked });
    const backendResult = await backend.decide({ index: testIndex, query, ranked });

    expect(backendResult.backend).toBe("classic");
    expect(backendResult.admitted).toEqual(classicResult.admitted);
    expect(backendResult.noMatch).toEqual(classicResult.noMatch);
    expect(backendResult.margin).toBe(classicResult.margin);
    expect(backendResult.ambiguous).toBe(classicResult.ambiguous);
    expect(backendResult.filtered).toEqual(classicResult.filtered);
    expect(backendResult.floor).toBe(classicResult.floor);
  });

  it("produces identical noMatch when scores are below calibrated floor", async () => {
    const strictIndex = makeIndex(testIndex.docs as never, 10_000);
    const ranked = ranker.rank(query);

    const classicResult = decide({ index: strictIndex, query, ranked });
    const backendResult = await backend.decide({ index: strictIndex, query, ranked });

    expect(backendResult.backend).toBe("classic");
    expect(backendResult.noMatch).not.toBeNull();
    expect(backendResult.noMatch?.reason).toBe("below_floor");
    expect(backendResult.noMatch).toEqual(classicResult.noMatch);
    expect(backendResult.admitted).toEqual([]);
  });

  it("produces identical noMatch for unknown bare id", async () => {
    const bareQuery = "someone/non-existent";
    const ranked = ranker.rank(bareQuery);

    const classicResult = decide({ index: testIndex, query: bareQuery, ranked });
    const backendResult = await backend.decide({ index: testIndex, query: bareQuery, ranked });

    expect(backendResult.backend).toBe("classic");
    expect(backendResult.noMatch?.reason).toBe("name_not_found");
    expect(backendResult.noMatch).toEqual(classicResult.noMatch);
  });
});

describe("JevDecisionBackend with mock transport", () => {
  it("applies semantic preference over lexical ranking", async () => {
    // Profiler is ranked first by BM25, Tracer second. Jev strongly prefers Tracer.
    const ranked = ranker.rank(query);
    expect(ranked[0]?.doc.id).toBe("someone/profiler");
    expect(ranked[1]?.doc.id).toBe("someone/tracer");

    const mock = createMockTransport("someone/tracer", {
      "someone/tracer": 0.85,
      "someone/profiler": 0.10,
      none: 0.05,
    }, 0.94);

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(mock.getCallCount()).toBe(1);
    expect(result.backend).toBe("jev");
    expect(result.noMatch).toBeNull();

    // Semantic preference: Tracer is admitted first despite Profiler having higher BM25
    expect(result.admitted[0]?.doc.id).toBe("someone/tracer");
    expect(result.admitted[0]?.score).toBe(0.85);

    // Semantic decision metadata
    expect(result.semantic).toBeDefined();
    expect(result.semantic?.chosen).toBe("someone/tracer");
    expect(result.semantic?.confidence).toBe(0.94);
    expect(result.semantic?.noneProbability).toBe(0.05);
    expect(result.semantic?.probabilities["someone/tracer"]).toBe(0.85);
    expect(result.semantic?.bypassed).toBe(false);

    // Evaluated candidate list
    const tracerEval = result.semantic?.evaluations.find((e) => e.id === "someone/tracer");
    expect(tracerEval?.chosen).toBe(true);
    expect(tracerEval?.probability).toBe(0.85);
  });

  it("admits multiple candidates within probability BAND and flags ambiguity when within MARGIN", async () => {
    const ranked = ranker.rank(query);
    // Two close candidates: Tracer 0.52, Profiler 0.45.
    // 0.45 >= 0.52 * BAND (0.312), so both admitted.
    // Margin is (0.52 - 0.45) / 0.52 = 0.1346 < MARGIN (0.15) -> ambiguous!
    const mock = createMockTransport("someone/tracer", {
      "someone/tracer": 0.52,
      "someone/profiler": 0.45,
      none: 0.03,
    }, 0.90);

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.admitted).toHaveLength(2);
    expect(result.admitted[0]?.doc.id).toBe("someone/tracer");
    expect(result.admitted[1]?.doc.id).toBe("someone/profiler");
    expect(result.ambiguous).toBe(true);
    expect(result.margin).toBeLessThan(MARGIN);
  });

  it("returns calibrated no-match when Jev chooses none", async () => {
    const ranked = ranker.rank(query);
    const mock = createMockTransport("none", {
      none: 0.92,
      "someone/profiler": 0.05,
      "someone/tracer": 0.03,
    }, 0.92);

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.backend).toBe("jev");
    expect(result.admitted).toEqual([]);
    expect(result.noMatch).not.toBeNull();
    expect(result.noMatch?.reason).toBe("below_floor");
    expect(result.noMatch?.suggestion).toMatch(/none match the query intent/);
    expect(result.semantic?.chosen).toBeNull();
    expect(result.semantic?.noneProbability).toBe(0.92);
  });

  it("returns no-match when choice has low probability below threshold", async () => {
    const ranked = ranker.rank(query);
    // Choice has probability 0.35, which is maximum probability among all choices,
    // but below minProbability threshold (0.40)
    const mock = createMockTransport("someone/profiler", {
      "someone/profiler": 0.35,
      "someone/tracer": 0.33,
      none: 0.32,
    }, 0.60);

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client, minProbability: 0.40 });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.admitted).toEqual([]);
    expect(result.noMatch).not.toBeNull();
    expect(result.noMatch?.reason).toBe("below_floor");
    expect(result.noMatch?.suggestion).toMatch(/below the required threshold/);
  });
});

describe("Exact-name match fast path ($0 bypass)", () => {
  it("bypasses Jev entirely when matchKind is exact", async () => {
    const exactQuery = "Profiler";
    const ranked = ranker.rank(exactQuery);
    expect(ranked[0]?.matchKind).toBe("exact");

    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      throw new Error("Transport must not be called on exact match");
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query: exactQuery, ranked });

    expect(transportCalled).toBe(false);
    expect(client.callCount).toBe(0);
    expect(client.spentAmountUsd).toBe(0);

    expect(result.admitted).toHaveLength(1);
    expect(result.admitted[0]?.doc.id).toBe("someone/profiler");
    expect(result.admitted[0]?.score).toBe(EXACT_MATCH_SCORE);
    expect(result.semantic?.bypassed).toBe(true);
    expect(result.semantic?.chosen).toBe("someone/profiler");
    expect(result.semantic?.rationale).toBe(
      "Exact-match fast path: bypassed Jev semantic inference ($0 spend).",
    );
  });

  it("bypasses Jev entirely on withheld exact match ($0 spend)", async () => {
    const exactQuery = "Human Led";
    const ranked = ranker.rank(exactQuery);
    expect(ranked[0]?.matchKind).toBe("exact");
    expect(ranked[0]?.doc.id).toBe("someone/human-led");

    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      throw new Error("Transport must not be called on exact match");
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport,
    });

    const backend = new JevDecisionBackend({ client });
    // Surface hell excludes human-led
    const result = await backend.decide({
      index: testIndex,
      query: exactQuery,
      ranked,
      surface: "hell",
    });

    expect(transportCalled).toBe(false);
    expect(client.callCount).toBe(0);
    expect(client.spentAmountUsd).toBe(0);

    expect(result.admitted).toEqual([]);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.id).toBe("someone/human-led");
    expect(result.filtered[0]?.why).toBe("surface:hell excludes human-led skills");
    expect(result.semantic?.bypassed).toBe(true);
    expect(result.semantic?.chosen).toBeNull();
    expect(result.semantic?.costUsd).toBe(0);
    expect(result.semantic?.rationale).toBe(
      "Exact-match fast path: bypassed Jev semantic inference ($0 spend).",
    );
  });
});

describe("Deterministic security & policy enforcement", () => {
  it("never admits uninstallable or unreachable skills, even if Jev chooses them", async () => {
    const ranked = ranker.rank(query);
    // Unreachable skill is ranked because description matches query terms
    expect(ranked.some((h) => h.doc.id === "someone/unreachable")).toBe(true);

    const mock = createMockTransport("someone/unreachable", {
      "someone/unreachable": 0.90,
      none: 0.10,
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    // Jev cannot override installability
    expect(result.admitted.map((h) => h.doc.id)).not.toContain("someone/unreachable");
    const filteredReason = result.filtered.find((f) => f.id === "someone/unreachable");
    expect(filteredReason?.why).toMatch(/not installable/);
  });

  it("enforces surface:heaven policy: model-led skills cannot be admitted", async () => {
    const ranked = ranker.rank(query);
    expect(ranked.some((h) => h.doc.id === "someone/model-led")).toBe(true);

    const mock = createMockTransport("someone/model-led", {
      "someone/model-led": 0.88,
      none: 0.12,
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({
      index: testIndex,
      query,
      ranked,
      surface: "heaven",
    });

    expect(result.admitted.map((h) => h.doc.id)).not.toContain("someone/model-led");
    const withheld = result.filtered.find((f) => f.id === "someone/model-led");
    expect(withheld?.why).toBe("surface:heaven excludes model-led skills");
  });

  it("enforces surface:hell policy: human-led skills cannot be admitted", async () => {
    const ranked = ranker.rank(query);
    expect(ranked.some((h) => h.doc.id === "someone/human-led")).toBe(true);

    const mock = createMockTransport("someone/human-led", {
      "someone/human-led": 0.88,
      none: 0.12,
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-api-key",
      transport: mock.transport,
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({
      index: testIndex,
      query,
      ranked,
      surface: "hell",
    });

    expect(result.admitted.map((h) => h.doc.id)).not.toContain("someone/human-led");
    const withheld = result.filtered.find((f) => f.id === "someone/human-led");
    expect(withheld?.why).toBe("surface:hell excludes human-led skills");
  });

  it("bypasses Jev and returns all_filtered if every candidate violates policy", async () => {
    const onlyUninstallable = makeIndex([
      {
        id: "someone/unreachable",
        name: "Unreachable",
        contributor: "someone",
        description: "The request is slow analyzer that is unreachable.",
        links: { github: "https://github.com/a/b" },
      },
    ]);

    let transportCalled = false;
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: async () => {
        transportCalled = true;
        throw new Error("Should not be called");
      },
    });

    const ranked = new Bm25fRanker(onlyUninstallable).rank(query);
    expect(ranked.length).toBeGreaterThan(0);

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: onlyUninstallable, query, ranked });

    expect(transportCalled).toBe(false);
    expect(result.noMatch?.reason).toBe("all_filtered");
    expect(result.admitted).toEqual([]);
  });
});

describe("Safe offline fallback", () => {
  it("degrades gracefully to classic deterministic decision in dry-run mode", async () => {
    const ranked = ranker.rank(query);
    const classicResult = decide({ index: testIndex, query, ranked });

    // Client with live: false (default dry-run)
    const client = new JevClient({ live: false });
    const backend = new JevDecisionBackend({ client });

    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.backend).toBe("fallback");
    expect(result.fallbackReason).toBe("dry_run");
    expect(result.admitted).toEqual(classicResult.admitted);
    expect(result.noMatch).toEqual(classicResult.noMatch);
    expect(result.margin).toBe(classicResult.margin);
    expect(result.filtered).toEqual(classicResult.filtered);
  });

  it("degrades gracefully when API key is missing", async () => {
    const ranked = ranker.rank(query);
    const classicResult = decide({ index: testIndex, query, ranked });

    const client = new JevClient({ live: true, apiKey: "" });
    const backend = new JevDecisionBackend({ client });

    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.backend).toBe("fallback");
    expect(result.fallbackReason).toBe("missing_api_key");
    expect(result.admitted).toEqual(classicResult.admitted);
  });

  it("degrades gracefully when transport experiences network error or timeout", async () => {
    const ranked = ranker.rank(query);
    const classicResult = decide({ index: testIndex, query, ranked });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:443");
      },
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.backend).toBe("fallback");
    expect(result.fallbackReason).toBe("network_error");
    expect(result.admitted).toEqual(classicResult.admitted);
  });

  it("degrades gracefully when server returns HTTP 500 error", async () => {
    const ranked = ranker.rank(query);
    const classicResult = decide({ index: testIndex, query, ranked });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: async () => ({
        status: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      }),
    });

    const backend = new JevDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    expect(result.backend).toBe("fallback");
    expect(result.fallbackReason).toBe("http_500");
    expect(result.admitted).toEqual(classicResult.admitted);
  });
});

describe("CompareDecisionBackend: shadow mode and agreement tracking", () => {
  it("keeps classic strictly authoritative while recording agreement", async () => {
    const ranked = ranker.rank(query);
    const classicExpected = decide({ index: testIndex, query, ranked });
    expect(classicExpected.admitted.length).toBeGreaterThan(0);

    // Mock Jev agreeing on Profiler
    const mock = createMockTransport("someone/profiler", {
      "someone/profiler": 0.85,
      "someone/tracer": 0.10,
      none: 0.05,
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: mock.transport,
    });

    const backend = new CompareDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    // Classic remains strictly authoritative
    expect(result.backend).toBe("compare");
    expect(result.admitted).toEqual(classicExpected.admitted);
    expect(result.noMatch).toEqual(classicExpected.noMatch);
    expect(result.margin).toBe(classicExpected.margin);
    expect(result.ambiguous).toBe(classicExpected.ambiguous);
    expect(result.filtered).toEqual(classicExpected.filtered);

    // Compare record records agreement
    expect(result.compare).toBeDefined();
    expect(result.compare?.agreement).toBe(true);
    expect(result.compare?.classic.chosen).toBe("someone/profiler");
    expect(result.compare?.semantic?.chosen).toBe("someone/profiler");
    expect(result.compare?.semantic?.status).toBe("ok");
    expect(result.compare?.disagreementReason).toBeUndefined();
  });

  it("preserves authoritative classic decision when Jev disagrees", async () => {
    const ranked = ranker.rank(query);
    const classicExpected = decide({ index: testIndex, query, ranked });
    expect(classicExpected.admitted[0]?.doc.id).toBe("someone/profiler");

    // Mock Jev selecting Tracer instead of Profiler
    const mock = createMockTransport("someone/tracer", {
      "someone/tracer": 0.80,
      "someone/profiler": 0.15,
      none: 0.05,
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: mock.transport,
    });

    const backend = new CompareDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    // Admitted candidate is STILL Profiler from authoritative classic decide()!
    expect(result.admitted[0]?.doc.id).toBe("someone/profiler");

    // Disagreement is captured in compare record
    expect(result.compare?.agreement).toBe(false);
    expect(result.compare?.classic.chosen).toBe("someone/profiler");
    expect(result.compare?.semantic?.chosen).toBe("someone/tracer");
    expect(result.compare?.disagreementReason).toMatch(/Classic chose 'someone\/profiler' while Jev chose 'someone\/tracer'/);
  });

  it("handles Jev shadow failure cleanly without affecting classic decision", async () => {
    const ranked = ranker.rank(query);
    const classicExpected = decide({ index: testIndex, query, ranked });

    // Jev transport fails with network error
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: async () => {
        throw new Error("Connection failed");
      },
    });

    const backend = new CompareDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query, ranked });

    // Classic decision is 100% intact
    expect(result.admitted).toEqual(classicExpected.admitted);
    expect(result.noMatch).toEqual(classicExpected.noMatch);

    // Shadow failure is captured
    expect(result.compare?.agreement).toBe(false);
    expect(result.compare?.semantic?.status).toBe("failed");
    expect(result.compare?.shadowError).toBe("network_error");
    expect(result.compare?.disagreementReason).toMatch(/Jev shadow evaluation failed: network_error/);
  });

  it("bypasses Jev in compare mode when matchKind is exact", async () => {
    const exactQuery = "Profiler";
    const ranked = ranker.rank(exactQuery);
    expect(ranked[0]?.matchKind).toBe("exact");

    let transportCalled = false;
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport: async () => {
        transportCalled = true;
        throw new Error("Should not be called");
      },
    });

    const backend = new CompareDecisionBackend({ client });
    const result = await backend.decide({ index: testIndex, query: exactQuery, ranked });

    expect(transportCalled).toBe(false);
    expect(result.admitted[0]?.doc.id).toBe("someone/profiler");
    expect(result.compare?.semantic?.status).toBe("bypassed");
    expect(result.compare?.agreement).toBe(true);
  });
});
