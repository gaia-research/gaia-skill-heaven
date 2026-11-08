import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ENDPOINT,
  DEFAULT_MAX_CALLS,
  DEFAULT_MONTHLY_LIMIT_USD,
  DEFAULT_TIMEOUT_MS,
  JevClient,
  MAX_INPUT_TOKENS,
  MAX_MONTHLY_LIMIT_USD,
  MAX_QUESTIONS,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  PINNED_MODEL,
  PRICE_PER_INPUT_TOKEN,
  RESERVATION_AMOUNT_USD,
  createJevClient,
  getSharedJevClient,
  resetSharedJevClient,
  type JevQuestion,
  type JevTransport,
} from "../src/retrieval/jev-client.js";

const sampleQuestions: Record<string, JevQuestion> = {
  relevance: {
    type: "choice",
    instructions: "Does the candidate skill match the user query intent?",
    criteria: {
      match: "Strong match for intent",
      no_match: "Does not match intent",
    },
  },
};

const validMockResponse = {
  model: PINNED_MODEL,
  answers: {
    relevance: {
      type: "choice",
      choice: "match",
      confidence: 0.92,
      probabilities: {
        match: 0.92,
        no_match: 0.08,
      },
    },
  },
  usage: {
    input_tokens: 1000,
    output_tokens: 25,
  },
};

describe("JevClient contract constants", () => {
  it("matches TypeSafe System One contract constants exactly", () => {
    expect(PINNED_MODEL).toBe("jev-1.13.0");
    expect(DEFAULT_ENDPOINT).toBe("https://api.typesafe.ai/v1/systemone");
    expect(PRICE_PER_INPUT_TOKEN).toBe(0.042 / 1_000_000);
    expect(RESERVATION_AMOUNT_USD).toBe(0.003);
    expect(DEFAULT_MONTHLY_LIMIT_USD).toBe(0.5);
    expect(MAX_MONTHLY_LIMIT_USD).toBe(5.0);
    expect(DEFAULT_MAX_CALLS).toBe(20);
    expect(MAX_REQUEST_BYTES).toBe(12000);
    expect(MAX_RESPONSE_BYTES).toBe(131072);
    expect(MAX_QUESTIONS).toBe(3);
    expect(MAX_INPUT_TOKENS).toBe(64000);
    expect(DEFAULT_TIMEOUT_MS).toBe(10000);
  });
});

describe("offline default behavior", () => {
  it("defaults to safe offline dry-run with 0 cost when live is false", async () => {
    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const client = new JevClient({ transport });
    const result = await client.evaluate({ query: "find git helper" }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("dry_run");
    expect(result.costUsd).toBe(0);
    expect(result.latencyMs).toBe(0);
    expect(transportCalled).toBe(false);
    expect(client.spentAmountUsd).toBe(0);
    expect(client.reservedAmountUsd).toBe(0);
    expect(client.callCount).toBe(0);
  });

  it("returns missing_api_key when live is true but apiKey is empty", async () => {
    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const originalEnv = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      const client = new JevClient({ live: true, transport, apiKey: "" });
      const result = await client.evaluate({ query: "find git helper" }, sampleQuestions);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("missing_api_key");
      expect(result.costUsd).toBe(0);
      expect(result.latencyMs).toBe(0);
      expect(transportCalled).toBe(false);
    } finally {
      if (originalEnv !== undefined) {
        process.env.TYPESAFE_API_KEY = originalEnv;
      }
    }
  });
});

describe("mock transport success & parsing", () => {
  it("verifies model check, token pricing math, choice parsing, confidence, and probabilities", async () => {
    let recordedEndpoint = "";
    let recordedHeaders: Record<string, string> = {};
    let recordedBody = "";

    const transport: JevTransport = async (endpoint, headers, body) => {
      recordedEndpoint = endpoint;
      recordedHeaders = headers;
      recordedBody = body;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const client = createJevClient({
      live: true,
      apiKey: "test-api-key-123",
      transport,
    });

    const state = { query: "format code with prettier", candidate: "prettier-formatter" };
    const result = await client.evaluate(state, sampleQuestions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Model check
    expect(result.model).toBe(PINNED_MODEL);

    // Endpoint and headers check
    expect(recordedEndpoint).toBe(DEFAULT_ENDPOINT);
    expect(recordedHeaders["Authorization"]).toBe("Bearer test-api-key-123");
    expect(recordedHeaders["Content-Type"]).toBe("application/json");

    // Request payload serialization check
    const sentPayload = JSON.parse(recordedBody);
    expect(sentPayload.model).toBe(PINNED_MODEL);
    expect(sentPayload.state).toEqual(state);

    // Answer validation
    const relevance = result.answers.relevance;
    expect(relevance).toBeDefined();
    expect(relevance.type).toBe("choice");
    expect(relevance.choice).toBe("match");
    expect(relevance.confidence).toBe(0.92);
    expect(relevance.probabilities).toEqual({
      match: 0.92,
      no_match: 0.08,
    });

    // Token pricing math check: 1000 input tokens * $0.042 / 1M = $0.000042
    const expectedCost = 1000 * PRICE_PER_INPUT_TOKEN;
    expect(result.costUsd).toBeCloseTo(expectedCost, 10);
    expect(result.costUsd).toBe(0.000042);
    expect(client.spentAmountUsd).toBeCloseTo(expectedCost, 10);
    expect(client.reservedAmountUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(client.callCount).toBe(1);
    expect(client.successCount).toBe(1);
  });

  it("works identically with classify() alias", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify(validMockResponse),
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const result = await client.classify({ gap: "testing" }, sampleQuestions);
    expect(result.ok).toBe(true);
  });
});

describe("bounded request size check", () => {
  it("rejects payloads > 12,000 bytes before network", async () => {
    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    // Oversized state > 12000 bytes
    const hugeState = {
      data: "x".repeat(13000),
    };

    const result = await client.evaluate(hugeState, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("request_too_large");
    expect(result.costUsd).toBe(0);
    expect(transportCalled).toBe(false);
    expect(client.callCount).toBe(0);
    expect(client.reservedAmountUsd).toBe(0);
  });
});

describe("max questions check", () => {
  it("rejects requests with > 3 questions before network", async () => {
    let transportCalled = false;
    const transport: JevTransport = async () => {
      transportCalled = true;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const fourQuestions: Record<string, JevQuestion> = {
      q1: { type: "choice", instructions: "q1", choices: ["a", "b"] },
      q2: { type: "choice", instructions: "q2", choices: ["a", "b"] },
      q3: { type: "choice", instructions: "q3", choices: ["a", "b"] },
      q4: { type: "choice", instructions: "q4", choices: ["a", "b"] },
    };

    const result = await client.evaluate({ query: "test" }, fourQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_many_questions");
    expect(result.costUsd).toBe(0);
    expect(transportCalled).toBe(false);
    expect(client.callCount).toBe(0);
  });

  it("rejects empty questions", async () => {
    const client = new JevClient({ live: true, apiKey: "k" });
    const result = await client.evaluate({ query: "test" }, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_request");
  });
});

describe("timeout and network error handling", () => {
  it("degrades cleanly on transport timeout without throwing", async () => {
    const transport: JevTransport = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const result = await client.evaluate({ gap: "inspect" }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("timeout");
    expect(result.costUsd).toBe(0);
    expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(result.costStatus).toBe("reserved_unreconciled");
    expect(client.spentAmountUsd).toBe(0);
    // Envelope was reserved for the attempt
    expect(client.reservedAmountUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(client.callCount).toBe(1);
  });

  it("degrades cleanly on network connection errors without throwing", async () => {
    const transport: JevTransport = async () => {
      throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:443");
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const result = await client.evaluate({ gap: "inspect" }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network_error");
    expect(result.costUsd).toBe(0);
    expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(result.costStatus).toBe("reserved_unreconciled");
    expect(client.spentAmountUsd).toBe(0);
    expect(client.reservedAmountUsd).toBe(RESERVATION_AMOUNT_USD);
  });

  it("handles HTTP error status codes cleanly and reports reserved_unreconciled", async () => {
    const transport: JevTransport = async () => ({
      status: 429,
      body: JSON.stringify({ error: "Rate limit exceeded" }),
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const result = await client.evaluate({ gap: "inspect" }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_429");
    expect(result.costUsd).toBe(0);
    expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(result.costStatus).toBe("reserved_unreconciled");
  });

  it("prohibits HTTP redirects to protect credentials", async () => {
    const transport: JevTransport = async () => ({
      status: 302,
      body: "Redirecting...",
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const result = await client.evaluate({ gap: "inspect" }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_redirect_prohibited");
    expect(result.costUsd).toBe(0);
    expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(result.costStatus).toBe("reserved_unreconciled");
  });
});

describe("budget tracking", () => {
  it("tracks spent and reserved amounts and provides budget status", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        usage: { input_tokens: 50000, output_tokens: 10 },
      }),
    });

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      monthlyLimitUsd: 0.1,
      transport,
    });

    expect(client.getBudgetStatus()).toEqual({
      monthlyLimitUsd: 0.1,
      spentUsd: 0,
      reservedUsd: 0,
      remainingUsd: 0.1,
      calls: 0,
      maxCalls: DEFAULT_MAX_CALLS,
      successes: 0,
    });

    const res = await client.evaluate({ test: 1 }, sampleQuestions);
    expect(res.ok).toBe(true);

    const expectedCost = 50000 * PRICE_PER_INPUT_TOKEN; // 0.0021
    const status = client.getBudgetStatus();
    expect(status.spentUsd).toBeCloseTo(expectedCost, 8);
    expect(status.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(status.calls).toBe(1);
    expect(status.successes).toBe(1);
    expect(status.remainingUsd).toBeCloseTo(0.1 - RESERVATION_AMOUNT_USD, 8);
  });

  it("enforces monthly budget limit before network call", async () => {
    let callCount = 0;
    const transport: JevTransport = async () => {
      callCount++;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    // Limit set to 0.005: 1st reservation of 0.003 succeeds (remaining 0.002);
    // 2nd reservation would be 0.003 + 0.003 = 0.006 > 0.005, so it must be rejected!
    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      monthlyLimitUsd: 0.005,
      transport,
    });

    const res1 = await client.evaluate({ test: 1 }, sampleQuestions);
    expect(res1.ok).toBe(true);
    expect(callCount).toBe(1);

    const res2 = await client.evaluate({ test: 2 }, sampleQuestions);
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe("budget_exceeded");
    expect(callCount).toBe(1); // Transport was NOT called for 2nd request
  });

  it("enforces process max calls limit before network call", async () => {
    let callCount = 0;
    const transport: JevTransport = async () => {
      callCount++;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      maxCalls: 2,
      transport,
    });

    const res1 = await client.evaluate({ test: 1 }, sampleQuestions);
    expect(res1.ok).toBe(true);

    const res2 = await client.evaluate({ test: 2 }, sampleQuestions);
    expect(res2.ok).toBe(true);

    const res3 = await client.evaluate({ test: 3 }, sampleQuestions);
    expect(res3.ok).toBe(false);
    expect(res3.reason).toBe("max_calls_exceeded");
    expect(callCount).toBe(2);
  });

  it("clamps monthly limit to MAX_MONTHLY_LIMIT_USD", () => {
    const client = new JevClient({ monthlyLimitUsd: 100.0 });
    expect(client.monthlyLimitUsd).toBe(MAX_MONTHLY_LIMIT_USD);
  });

  it("resets budget cleanly when requested", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify(validMockResponse),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    await client.evaluate({ a: 1 }, sampleQuestions);
    expect(client.callCount).toBe(1);

    client.resetBudget();
    expect(client.callCount).toBe(0);
    expect(client.spentAmountUsd).toBe(0);
    expect(client.reservedAmountUsd).toBe(0);
  });
});

describe("response validation", () => {
  it("rejects responses from unpinned models", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        model: "unpinned-other-model-2.0",
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("model_mismatch");
    expect(result.costUsd).toBe(0);
  });

  it("rejects malformed or unparseable JSON response", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: "502 Bad Gateway (HTML body)",
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
  });

  it("rejects answers with unknown choice option", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        answers: {
          relevance: {
            type: "choice",
            choice: "invented_choice",
            confidence: 0.9,
            probabilities: {
              match: 0.1,
              no_match: 0.9,
            },
          },
        },
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
  });

  it("rejects confidence outside [0, 1]", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        answers: {
          relevance: {
            type: "choice",
            choice: "match",
            confidence: 1.5,
            probabilities: { match: 1.0, no_match: 0.0 },
          },
        },
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
  });

  it("rejects probabilities that do not sum to ~1.0", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        answers: {
          relevance: {
            type: "choice",
            choice: "match",
            confidence: 0.9,
            probabilities: { match: 0.5, no_match: 0.2 }, // Sum is 0.7
          },
        },
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
  });

  it("rejects choice that is not argmax of probabilities", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        answers: {
          relevance: {
            type: "choice",
            choice: "match",
            confidence: 0.9,
            probabilities: { match: 0.2, no_match: 0.8 }, // choice 'match' has 0.2 < 0.8
          },
        },
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
  });

  it("rejects input tokens exceeding MAX_INPUT_TOKENS", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify({
        ...validMockResponse,
        usage: { input_tokens: 70000, output_tokens: 10 },
      }),
    });

    const client = new JevClient({ live: true, apiKey: "k", transport });
    const result = await client.evaluate({ a: 1 }, sampleQuestions);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_response");
    expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
    expect(result.costStatus).toBe("reserved_unreconciled");
  });
});

describe("Terra reviewer report: live opt-in, client config, shared singleton, and budget persistence", () => {
  const origEnv = { ...process.env };
  let tempDirs: string[] = [];

  beforeEach(() => {
    resetSharedJevClient();
  });

  afterEach(() => {
    resetSharedJevClient();
    process.env = { ...origEnv };
    for (const d of tempDirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {}
    }
    tempDirs = [];
  });

  it("defaults live to true when SKILL_HEAVEN_JEV_LIVE is true and API key is present", () => {
    process.env.SKILL_HEAVEN_JEV_LIVE = "true";
    process.env.TYPESAFE_API_KEY = "test-key-1";

    const client = new JevClient();
    expect(client.live).toBe(true);
    expect(client.apiKey).toBe("test-key-1");
  });

  it("defaults live to true when TYPESAFE_LIVE is true and API key is present", () => {
    delete process.env.SKILL_HEAVEN_JEV_LIVE;
    delete process.env.TYPESAFE_API_KEY;
    process.env.TYPESAFE_LIVE = "true";
    process.env.JEV_API_KEY = "test-key-2";

    const client = new JevClient();
    expect(client.live).toBe(true);
    expect(client.apiKey).toBe("test-key-2");
  });

  it("defaults live to true when JEV_LIVE is true and API key is present", () => {
    delete process.env.SKILL_HEAVEN_JEV_LIVE;
    delete process.env.TYPESAFE_LIVE;
    process.env.JEV_LIVE = "true";
    process.env.TYPESAFE_API_KEY = "test-key-3";

    const client = new JevClient();
    expect(client.live).toBe(true);
  });

  it("defaults live to false if live env var is true but no API key is present", () => {
    process.env.SKILL_HEAVEN_JEV_LIVE = "true";
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.JEV_API_KEY;

    const client = new JevClient();
    expect(client.live).toBe(false);
  });

  it("allows explicit live parameter to override env var", () => {
    process.env.SKILL_HEAVEN_JEV_LIVE = "true";
    process.env.TYPESAFE_API_KEY = "test-key";

    const clientFalse = new JevClient({ live: false });
    expect(clientFalse.live).toBe(false);

    delete process.env.SKILL_HEAVEN_JEV_LIVE;
    const clientTrue = new JevClient({ live: true, apiKey: "k" });
    expect(clientTrue.live).toBe(true);
  });

  it("reads default endpoint from TYPESAFE_ENDPOINT or JEV_ENDPOINT", () => {
    process.env.TYPESAFE_ENDPOINT = "https://custom.typesafe.endpoint/v1";
    const client1 = new JevClient();
    expect(client1.endpoint).toBe("https://custom.typesafe.endpoint/v1");

    delete process.env.TYPESAFE_ENDPOINT;
    process.env.JEV_ENDPOINT = "https://custom.jev.endpoint/v1";
    const client2 = new JevClient();
    expect(client2.endpoint).toBe("https://custom.jev.endpoint/v1");
  });

  it("getSharedJevClient singleton reuses call counters and budget tracking across calls", async () => {
    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify(validMockResponse),
    });

    const client1 = getSharedJevClient({
      live: true,
      apiKey: "shared-key",
      transport,
    });
    const client2 = getSharedJevClient();

    expect(client1).toBe(client2);

    await client1.evaluate({ query: "call 1" }, sampleQuestions);
    expect(client1.callCount).toBe(1);
    expect(client2.callCount).toBe(1);

    await client2.evaluate({ query: "call 2" }, sampleQuestions);
    expect(client1.callCount).toBe(2);
    expect(client2.callCount).toBe(2);
    expect(client2.spentAmountUsd).toBeCloseTo(2 * 1000 * PRICE_PER_INPUT_TOKEN, 8);
  });

  it("aborts stream reading with MAX_RESPONSE_BYTES in defaultTransport", async () => {
    const bigChunk = new Uint8Array(80_000);
    const originalFetch = globalThis.fetch;
    let streamAborted = false;

    // Create a mock stream with 2 chunks of 80,000 bytes (160,000 > 131,072)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bigChunk);
        controller.enqueue(bigChunk);
        controller.close();
      },
      cancel() {
        streamAborted = true;
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      if (init?.signal) {
        init.signal.addEventListener("abort", () => {
          streamAborted = true;
        });
      }
      return new Response(stream, { status: 200 });
    });

    try {
      const client = new JevClient({
        live: true,
        apiKey: "test-key",
      });

      const result = await client.evaluate({ query: "huge response" }, sampleQuestions);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("response_too_large");
      expect(result.reservedUsd).toBe(RESERVATION_AMOUNT_USD);
      expect(result.costStatus).toBe("reserved_unreconciled");
      expect(streamAborted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("persists budget across client instances pointing to stateDir with monthly ledger checks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-budget-test-"));
    tempDirs.push(dir);

    const transport: JevTransport = async () => ({
      status: 200,
      body: JSON.stringify(validMockResponse),
    });

    const client1 = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport,
    });

    await client1.evaluate({ query: "q1" }, sampleQuestions);
    expect(client1.callCount).toBe(1);

    const budgetFile = join(dir, "budget.json");
    const savedData = JSON.parse(readFileSync(budgetFile, "utf-8"));
    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(savedData[currentMonth]).toBeDefined();
    expect(savedData[currentMonth].attempts).toBe(1);
    expect(savedData[currentMonth].spent_usd).toBeCloseTo(1000 * PRICE_PER_INPUT_TOKEN, 8);

    // Create a second client instance pointing to the same stateDir
    const client2 = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport,
    });

    expect(client2.callCount).toBe(1);
    expect(client2.spentAmountUsd).toBeCloseTo(client1.spentAmountUsd, 8);

    // Simulate monthly rollover: write previous month to budget.json
    writeFileSync(
      budgetFile,
      JSON.stringify({
        "2020-01": {
          spent_usd: 0.045,
          reserved_usd: 0.05,
          attempts: 15,
          successes: 15,
        },
      }),
      "utf-8",
    );

    const client3 = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport,
    });

    // Month rollover must reset monthly numbers to 0
    expect(client3.callCount).toBe(0);
    expect(client3.spentAmountUsd).toBe(0);
    expect(client3.reservedAmountUsd).toBe(0);
  });

  it("fails closed when budget.json is corrupt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-budget-corrupt-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "budget.json"), "NOT VALID JSON {{{{", "utf-8");

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport: async () => ({ status: 200, body: JSON.stringify(validMockResponse) }),
    });

    const result = await client.evaluate({ query: "corrupt test" }, sampleQuestions);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("budget_corrupt");
  });

  it("respects per-call live option without mutating client state", async () => {
    let callCount = 0;
    const transport: JevTransport = async () => {
      callCount++;
      return { status: 200, body: JSON.stringify(validMockResponse) };
    };

    // Client is dry by default (live: false)
    const client = new JevClient({
      live: false,
      apiKey: "test-key",
      transport,
    });

    // Per-call live: true allows one call
    const res1 = await client.evaluate({ query: "call 1" }, sampleQuestions, { live: true });
    expect(res1.ok).toBe(true);
    expect(callCount).toBe(1);

    // Next call omitting live option must stay dry_run (client was not mutated!)
    const res2 = await client.evaluate({ query: "call 2" }, sampleQuestions);
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe("dry_run");
    expect(callCount).toBe(1);

    // Client created live: true can be per-call disabled with live: false
    const liveClient = new JevClient({
      live: true,
      apiKey: "test-key",
      transport,
    });

    const res3 = await liveClient.evaluate({ query: "call 3" }, sampleQuestions, { live: false });
    expect(res3.ok).toBe(false);
    expect(res3.reason).toBe("dry_run");
    expect(callCount).toBe(1);
  });

  it("handles empty or abandoned lock file atomically without hanging", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-lock-abandoned-"));
    tempDirs.push(dir);

    // Create an empty abandoned lock file with a stale mtime (> 15 seconds ago)
    const lockPath = join(dir, "jev.lock");
    writeFileSync(lockPath, "", "utf-8");
    const pastTime = (Date.now() - 20000) / 1000;
    const { utimesSync } = await import("node:fs");
    utimesSync(lockPath, pastTime, pastTime);

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport: async () => ({ status: 200, body: JSON.stringify(validMockResponse) }),
    });

    // Client must break stale lock atomically and succeed
    const res = await client.evaluate({ query: "lock recovery" }, sampleQuestions);
    expect(res.ok).toBe(true);
    expect(res.costStatus).toBe("reconciled");
  });

  it("fails closed when budget ledger violates schema invariants (successes > attempts)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-budget-invariant-"));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, "budget.json"),
      JSON.stringify({
        "2026-11": {
          spent_usd: 0.1,
          reserved_usd: 0.1,
          attempts: 2,
          successes: 5, // INVALID: successes > attempts!
        },
      }),
      "utf-8",
    );

    const client = new JevClient({
      live: true,
      apiKey: "test-key",
      stateDir: dir,
      transport: async () => ({ status: 200, body: JSON.stringify(validMockResponse) }),
    });

    const res = await client.evaluate({ query: "invariant check" }, sampleQuestions);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("budget_corrupt");
  });
});
