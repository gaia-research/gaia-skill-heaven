import { describe, expect, it } from "vitest";

import {
  PRICE_PER_INPUT_TOKEN,
  createSyntheticMockJevClient,
  evaluateCompareSuite,
  type DisagreementEntry,
  type GoldEntry,
  type UnanswerableEntry,
} from "../bench/compare-eval.js";
import { buildSkillIndex, sha256, type NamedProjection } from "../src/retrieval/build-index.js";
import { JevClient, PINNED_MODEL, type JevTransport } from "../src/retrieval/jev-client.js";
import type { SkillIndex } from "../src/retrieval/schema.js";

const installable = "https://github.com/example/repo/blob/main/SKILL.md";

function makeTestIndex(
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

const testIndex = makeTestIndex(
  [
    {
      id: "org/calc",
      name: "Calculator",
      contributor: "org",
      description: "Perform mathematical calculations, arithmetic, and formula evaluations.",
      tags: ["math", "calculator", "arithmetic"],
      links: { github: installable },
    },
    {
      id: "org/formatter",
      name: "CodeFormatter",
      contributor: "org",
      description: "Format and beautify TypeScript, JavaScript, and JSON code.",
      tags: ["format", "prettier", "linter"],
      links: { github: installable },
    },
    {
      id: "org/git-helper",
      name: "GitHelper",
      contributor: "org",
      description: "Manage Git branches, pull requests, cherry-picks, and commit histories.",
      tags: ["git", "branch", "commit"],
      links: { github: installable },
    },
    {
      id: "org/exact-skill",
      name: "ExactFastSkill",
      contributor: "org",
      description: "Exact match fast path target skill.",
      tags: ["fast", "exact"],
      links: { github: installable },
    },
  ],
  1.0,
);

const goldQueries: GoldEntry[] = [
  {
    query: "calculate compound interest and arithmetic formula",
    skillId: "org/calc",
  },
  {
    query: "format and beautify this messy javascript code",
    skillId: "org/formatter",
  },
  {
    query: "manage git branches and rebase my pull request",
    skillId: "org/git-helper",
  },
  {
    query: "ExactFastSkill",
    skillId: "org/exact-skill",
  },
];

const unanswerableQueries: UnanswerableEntry[] = [
  {
    query: "bake a chocolate cake in a convection oven at 350 degrees",
    why: "cooking recipe task outside software skills corpus",
  },
  {
    query: "plan a hiking trip across Yosemite National Park trails",
    why: "travel planning task outside software skills corpus",
  },
];

/**
 * Creates a mock Jev transport with per-query configurable answers and token usage.
 */
function createDeterministicMockTransport(
  answersByQuery: Record<
    string,
    {
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
      inputTokens?: number;
    }
  >,
): JevTransport {
  return async (_endpoint, _headers, body) => {
    const payload = JSON.parse(body);
    const state = payload.state as { query: string };
    const query = state?.query ?? "";
    const questions = payload.questions as Record<
      string,
      { choices?: string[]; criteria?: Record<string, string> }
    >;
    const q = questions.selection ?? Object.values(questions)[0];
    const validChoices: string[] = q?.criteria
      ? Object.keys(q.criteria)
      : (q?.choices ?? []);

    const config = answersByQuery[query] ?? {
      choice: validChoices[0] ?? "none",
      confidence: 0.9,
      inputTokens: 100,
    };

    const choice = config.choice;
    const confidence = config.confidence ?? 0.95;
    const input_tokens = config.inputTokens ?? 100;

    let probabilities = config.probabilities;
    if (!probabilities) {
      probabilities = {};
      const otherChoices = validChoices.filter((c) => c !== choice);
      if (otherChoices.length === 0) {
        probabilities[choice] = 1.0;
      } else {
        const primaryProb = 0.85;
        const remaining = 1.0 - primaryProb;
        const eachOther = Number((remaining / otherChoices.length).toFixed(4));
        let sum = 0;
        for (const oc of otherChoices) {
          probabilities[oc] = eachOther;
          sum += eachOther;
        }
        probabilities[choice] = Number((1.0 - sum).toFixed(4));
      }
    }

    return {
      status: 200,
      body: JSON.stringify({
        model: PINNED_MODEL,
        answers: {
          selection: {
            type: "choice",
            choice,
            confidence,
            probabilities,
          },
        },
        usage: {
          input_tokens,
          output_tokens: 15,
        },
      }),
    };
  };
}

describe("evaluateCompareSuite: offline benchmark & shadow evaluation", () => {
  it("authoritatively preserves classic top-1 decisions in compare mode", async () => {
    // Construct a client that intentionally disagrees with classic on one query
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      maxCalls: 100,
      transport: createDeterministicMockTransport({
        "calculate compound interest and arithmetic formula": {
          choice: "org/git-helper", // Jev chooses git-helper instead of calc
          inputTokens: 150,
        },
      }),
    });

    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: goldQueries,
      unanswerableEntries: unanswerableQueries,
      jevClient: client,
    });

    // 1. Authoritative preservation: compare top-1 accuracy strictly matches classic
    expect(result.accuracy.compare).toBe(result.accuracy.classic);
    expect(result.compareTop1Accuracy).toBe(result.classicTop1Accuracy);

    // 2. Authoritative preservation: unanswerable refusal and false positive rates match classic
    expect(result.refusalRate.compare).toBe(result.refusalRate.classic);
    expect(result.unanswerableRefusalRate.compare).toBe(
      result.unanswerableRefusalRate.classic,
    );
    expect(result.falsePositiveRate.compare).toBe(result.falsePositiveRate.classic);
    expect(result.unanswerableFalsePositiveRate.compare).toBe(
      result.unanswerableFalsePositiveRate.classic,
    );

    // 3. For every single query, compare top skill strictly matches classic top skill
    expect(result.details.length).toBe(goldQueries.length + unanswerableQueries.length);
    for (const detail of result.details) {
      expect(detail.compareTop).toBe(detail.classicTop);
    }
  });

  it("accurately records discrepancies in the disagreement corpus", async () => {
    const calcQuery = "calculate compound interest and arithmetic formula";
    const unansQuery = "bake a chocolate cake in a convection oven at 350 degrees";

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      maxCalls: 100,
      transport: createDeterministicMockTransport({
        [calcQuery]: {
          choice: "org/git-helper", // Disagreement on gold query
          inputTokens: 200,
        },
        [unansQuery]: {
          choice: "org/calc", // Jev admits calc on unanswerable (disagreement with classic refusal)
          inputTokens: 120,
        },
      }),
    });

    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: goldQueries,
      unanswerableEntries: unanswerableQueries,
      jevClient: client,
    });

    // Check disagreement corpus entries
    const calcDisagreement = result.disagreementCorpus.find(
      (d) => d.query === calcQuery,
    );
    expect(calcDisagreement).toBeDefined();
    expect(calcDisagreement?.classicTopSkill).toBe("org/calc");
    expect(calcDisagreement?.jevTopSkill).toBe("org/git-helper");
    expect(calcDisagreement?.groundTruthTarget).toBe("org/calc");
    expect(calcDisagreement?.queryType).toBe("gold");

    // Convenience aliases
    expect(calcDisagreement?.classic).toBe("org/calc");
    expect(calcDisagreement?.jev).toBe("org/git-helper");
    expect(calcDisagreement?.target).toBe("org/calc");

    // Check agreement rate arithmetic
    const total = goldQueries.length + unanswerableQueries.length;
    expect(result.totalQueries).toBe(total);
    expect(result.agreementCount + result.disagreementCorpus.length).toBe(total);
    expect(result.agreementRate).toBe(result.agreementCount / total);
  });

  it("accurately calculates total input tokens and estimated cost in USD ($0.042 / 1M tokens)", async () => {
    // 4 gold queries:
    // - calcQuery: 500 tokens
    // - formatQuery: 1000 tokens
    // - gitQuery: 1500 tokens
    // - ExactFastSkill: exact match bypasses Jev ($0 tokens)
    // 2 unanswerable queries:
    // - completely disjoint vocabulary has 0 BM25 candidates, cleanly bypassing Jev ($0 tokens)
    // Total input tokens = 500 + 1000 + 1500 + 0 + 0 + 0 = 3000 tokens.
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      maxCalls: 100,
      transport: createDeterministicMockTransport({
        "calculate compound interest and arithmetic formula": {
          choice: "org/calc",
          inputTokens: 500,
        },
        "format and beautify this messy javascript code": {
          choice: "org/formatter",
          inputTokens: 1000,
        },
        "manage git branches and rebase my pull request": {
          choice: "org/git-helper",
          inputTokens: 1500,
        },
      }),
    });

    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: goldQueries,
      unanswerableEntries: unanswerableQueries,
      jevClient: client,
    });

    expect(result.totalInputTokens).toBe(3000);

    // Exact cost formula: 3000 * (0.042 / 1_000_000) = 0.000126 USD
    const expectedCost = 3000 * PRICE_PER_INPUT_TOKEN;
    expect(expectedCost).toBeCloseTo(0.000126, 8);
    expect(result.estimatedCostUsd).toBe(Number(expectedCost.toFixed(10)));

    // Verify constant matches SPEC §4 ($0.042 / 1M tokens)
    expect(PRICE_PER_INPUT_TOKEN).toBe(0.042 / 1_000_000);
    expect(1_000_000 * PRICE_PER_INPUT_TOKEN).toBe(0.042);
  });

  it("calculates cost accurately when unanswerable near-miss queries evaluate candidate sets", async () => {
    // Unanswerable query containing "calculator" so BM25F retrieves org/calc as near-miss candidate
    const nearMissQueries: UnanswerableEntry[] = [
      {
        query: "need a scientific calculator for quantum physics simulations",
        why: "quantum physics simulation is outside simple math calculator scope",
      },
    ];

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      maxCalls: 100,
      transport: createDeterministicMockTransport({
        "need a scientific calculator for quantum physics simulations": {
          choice: "none",
          confidence: 0.92,
          inputTokens: 450,
        },
      }),
    });

    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: [],
      unanswerableEntries: nearMissQueries,
      jevClient: client,
    });

    expect(result.totalInputTokens).toBe(450);
    expect(result.estimatedCostUsd).toBe(Number((450 * (0.042 / 1_000_000)).toFixed(10)));
    expect(result.refusalRate.jev).toBe(1.0);
    expect(result.falsePositiveRate.jev).toBe(0.0);
  });

  it("verifies refusal and false-positive rates sum to 1.0 on unanswerable queries", async () => {
    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: goldQueries,
      unanswerableEntries: unanswerableQueries,
    });

    expect(result.refusalRate.classic + result.falsePositiveRate.classic).toBeCloseTo(1.0, 6);
    expect(result.refusalRate.jev + result.falsePositiveRate.jev).toBeCloseTo(1.0, 6);
    expect(result.refusalRate.compare + result.falsePositiveRate.compare).toBeCloseTo(1.0, 6);
  });

  it("runs cleanly offline with synthetic mock client when jevClient is omitted", async () => {
    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: goldQueries,
      unanswerableEntries: unanswerableQueries,
    });

    expect(result.totalQueries).toBe(6);
    expect(result.goldCount).toBe(4);
    expect(result.unanswerableCount).toBe(2);

    expect(result.accuracy.classic).toBeGreaterThanOrEqual(0);
    expect(result.accuracy.jev).toBeGreaterThanOrEqual(0);
    expect(result.accuracy.compare).toBe(result.accuracy.classic);

    expect(result.agreementRate).toBeGreaterThanOrEqual(0);
    expect(result.totalInputTokens).toBeGreaterThan(0);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(Array.isArray(result.disagreementCorpus)).toBe(true);
  });

  it("handles empty gold and unanswerable entries gracefully without division by zero", async () => {
    const result = await evaluateCompareSuite({
      index: testIndex,
      goldEntries: [],
      unanswerableEntries: [],
    });

    expect(result.totalQueries).toBe(0);
    expect(result.goldCount).toBe(0);
    expect(result.unanswerableCount).toBe(0);
    expect(result.classicTop1Accuracy).toBe(0);
    expect(result.jevTop1Accuracy).toBe(0);
    expect(result.compareTop1Accuracy).toBe(0);
    expect(result.classicRefusalRate).toBe(0);
    expect(result.classicFalsePositiveRate).toBe(0);
    expect(result.agreementRate).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.disagreementCorpus).toEqual([]);
  });
});
