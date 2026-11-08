import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  JevClient,
  PINNED_MODEL,
  type JevTransport,
} from "skill-zero";

import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import { openSession, type SummonSession } from "../src/summon/session.js";
import { summon } from "../src/summon/summon.js";

const testDocuments: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "testing",
        name: "Testing",
        type: "basic",
        description: "General software testing and performance debugging.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "awakened",
      },
    ],
  },
  named: {
    generatedAt: "2026-07-16T00:00:00Z",
    buckets: {
      testing: [
        {
          id: "example/alpha-profiler",
          name: "Alpha Profiler",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Profiles database queries and finds execution bottlenecks.",
          tags: ["performance", "bottlenecks", "queries"],
          links: { github: "https://github.com/example/alpha-profiler/blob/main/SKILL.md" },
          evidence: [],
        },
        {
          id: "example/beta-tracer",
          name: "Beta Tracer",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Distributed tracing and request span timing analysis.",
          tags: ["tracing", "spans", "timing", "bottlenecks"],
          links: { github: "https://github.com/example/beta-tracer/blob/main/SKILL.md" },
          evidence: [],
        },
        {
          id: "example/model-only-tool",
          name: "Model Only Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          invocation: "model",
          description: "Autonomous model-driven bottleneck solver.",
          tags: ["bottlenecks"],
          links: { github: "https://github.com/example/model-only-tool/blob/main/SKILL.md" },
          evidence: [],
        },
        {
          id: "example/human-only-tool",
          name: "Human Only Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          invocation: "human",
          description: "Interactive human-driven bottleneck guide.",
          tags: ["bottlenecks"],
          links: { github: "https://github.com/example/human-only-tool/blob/main/SKILL.md" },
          evidence: [],
        },
        {
          id: "example/registry-only-tool",
          name: "Registry Only Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          installable: false,
          description: "Registry only bottleneck inspector.",
          tags: ["bottlenecks"],
          links: { github: "https://github.com/example/registry-only-tool/blob/main/SKILL.md" },
          evidence: [],
        },
        {
          id: "example/suite-human",
          name: "Suite With Human Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Suite bundling a human-only tool.",
          tags: ["suite", "bottlenecks"],
          links: {},
          suiteComponents: ["example/human-only-tool"],
          evidence: [],
        },
        {
          id: "example/suite-model",
          name: "Suite With Model Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Suite bundling a model-only tool.",
          tags: ["suite", "bottlenecks"],
          links: {},
          suiteComponents: ["example/model-only-tool"],
          evidence: [],
        },
        {
          id: "example/suite-unmaterializable",
          name: "Suite With Unmaterializable Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Suite bundling an unmaterializable tool.",
          tags: ["suite", "bottlenecks"],
          links: {},
          suiteComponents: ["example/unmaterializable-tool"],
          evidence: [],
        },
        {
          id: "example/unmaterializable-tool",
          name: "Unmaterializable Tool",
          contributor: "example",
          genericSkillRef: "testing",
          status: "named",
          description: "Tool with verified not materializable status.",
          tags: ["bottlenecks"],
          links: { github: "https://github.com/example/unmaterializable-tool/blob/main/SKILL.md" },
          evidence: [],
          installability: {
            applicability: "verified",
            applicabilityReason: "matched",
            state: "not-materializable",
            reason: "no-source",
            projectionIndexPath: "test/projection.json",
            upstream: null,
          },
        },
      ],
    },
  },
};

function createMockTransport(
  choice: string,
  partialProbs: Record<string, number>,
  confidence = 0.95,
  options: { failStatus?: number; error?: Error } = {},
): { transport: JevTransport; getCallCount: () => number } {
  let calls = 0;
  const transport: JevTransport = async (_endpoint, _headers, body) => {
    calls++;
    if (options.error) throw options.error;
    if (options.failStatus) {
      return { status: options.failStatus, body: "Mock Server Error" };
    }

    const lastBody = JSON.parse(body);
    const q = lastBody.questions.selection ?? Object.values(lastBody.questions)[0];
    const expectedChoices: string[] = q.criteria ? Object.keys(q.criteria) : (q.choices ?? []);

    const probabilities: Record<string, number> = {};
    let sum = 0;
    for (const c of expectedChoices) {
      const p = partialProbs[c] ?? 0;
      probabilities[c] = p;
      sum += p;
    }

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
      usage: { input_tokens: 120, output_tokens: 15 },
    };

    return {
      status: 200,
      body: JSON.stringify(mockResponse),
    };
  };

  return {
    transport,
    getCallCount: () => calls,
  };
}

describe("DecisionBackend integration in summon", () => {
  const roots: string[] = [];
  const closeCallbacks: Array<() => Promise<void>> = [];
  let service: GaiaService;

  beforeEach(() => {
    service = new GaiaService(new InMemoryGaiaRegistrySource(testDocuments));
  });

  afterEach(async () => {
    delete process.env.SKILL_HEAVEN_DECISION;
    delete process.env.SKILL_DECISION_BACKEND;
    await Promise.all(closeCallbacks.splice(0).map((cb) => cb()));
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function makeSession(): Promise<SummonSession> {
    const s = await openSession();
    roots.push(s.root);
    return s;
  }

  it("verify default summon is classic with classic disclosure", async () => {
    const session = await makeSession();
    const outcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
    });

    expect(outcome.ranking.decision).toEqual({
      mode: "classic",
      backend: "classic",
    });
    expect(outcome.ranking.disclosure).toMatch(/Ranked by BM25F over the committed retrieval index;/);
    expect(outcome.ranking.disclosure).not.toMatch(/Jev/i);
    expect(outcome.ranking.disclosure).not.toMatch(/Compare mode/i);
    expect(outcome.previewed.length).toBeGreaterThan(0);
    expect(outcome.previewed[0]?.id).toBe("example/alpha-profiler");
  });

  it("verify explicit decision: 'classic' matches default", async () => {
    const session = await makeSession();
    const defaultOutcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
    });

    const explicitOutcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
      decision: "classic",
    });

    expect(explicitOutcome.ranking.decision).toEqual(defaultOutcome.ranking.decision);
    expect(explicitOutcome.ranking.disclosure).toBe(defaultOutcome.ranking.disclosure);
    expect(explicitOutcome.previewed.map((p) => p.id)).toEqual(
      defaultOutcome.previewed.map((p) => p.id),
    );
  });

  it("resolves decision mode from SKILL_HEAVEN_DECISION and SKILL_DECISION_BACKEND env vars", async () => {
    const session = await makeSession();

    // 1. SKILL_HEAVEN_DECISION
    process.env.SKILL_HEAVEN_DECISION = "compare";
    const envOutcome1 = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
    });
    expect(envOutcome1.ranking.decision?.mode).toBe("compare");

    // 2. Explicit options.decision overrides env var
    const overrideOutcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
      decision: "classic",
    });
    expect(overrideOutcome.ranking.decision?.mode).toBe("classic");

    // 3. SKILL_DECISION_BACKEND fallback
    delete process.env.SKILL_HEAVEN_DECISION;
    process.env.SKILL_DECISION_BACKEND = "compare";
    const envOutcome2 = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
    });
    expect(envOutcome2.ranking.decision?.mode).toBe("compare");
  });

  describe("verify decision: 'jev' with mock transport", () => {
    it("uses Jev semantic choice when valid", async () => {
      const session = await makeSession();
      // BM25F query for bottlenecks ranks alpha-profiler top, but Jev chooses beta-tracer
      const { transport, getCallCount } = createMockTransport(
        "example/beta-tracer",
        {
          "example/beta-tracer": 0.85,
          "example/alpha-profiler": 0.12,
          none: 0.03,
        },
        0.92,
      );

      const jevClient = new JevClient({
        apiKey: "mock-key",
        live: true,
        transport,
      });

      const outcome = await summon(service, session, {
        query: "execution bottlenecks",
        surface: "any",
        preview: true,
        decision: "jev",
        jevClient,
      });

      expect(getCallCount()).toBe(1);
      expect(outcome.ranking.decision?.mode).toBe("jev");
      expect(outcome.ranking.decision?.backend).toBe("jev");
      expect(outcome.previewed.length).toBeGreaterThan(0);
      expect(outcome.previewed[0]?.id).toBe("example/beta-tracer");
      expect(outcome.ranking.disclosure).toMatch(/Probabilistic semantic decision evaluated candidates via Jev/);
    });

    it("respects surface gates (heaven excludes model-only)", async () => {
      const session = await makeSession();
      const { transport } = createMockTransport(
        "example/model-only-tool",
        {
          "example/model-only-tool": 0.9,
          none: 0.1,
        },
        0.95,
      );

      const jevClient = new JevClient({
        apiKey: "mock-key",
        live: true,
        transport,
      });

      const outcome = await summon(service, session, {
        query: "execution bottlenecks",
        surface: "heaven",
        preview: true,
        decision: "jev",
        jevClient,
      });

      // Model-only tool must be filtered out under heaven surface
      expect(outcome.previewed.every((p) => p.id !== "example/model-only-tool")).toBe(true);
      expect(outcome.filtered.some((f) => f.id === "example/model-only-tool")).toBe(true);
    });

    it("respects registry-only (installable: false) installability gate", async () => {
      const session = await makeSession();
      const { transport } = createMockTransport(
        "example/registry-only-tool",
        {
          "example/registry-only-tool": 0.9,
          none: 0.1,
        },
        0.95,
      );

      const jevClient = new JevClient({
        apiKey: "mock-key",
        live: true,
        transport,
      });

      const outcome = await summon(service, session, {
        query: "execution bottlenecks",
        surface: "any",
        preview: true,
        decision: "jev",
        jevClient,
      });

      // Registry-only tool must be withheld by withholdReason and never admitted
      expect(outcome.previewed.every((p) => p.id !== "example/registry-only-tool")).toBe(true);
      expect(outcome.filtered.some((f) => f.id === "example/registry-only-tool")).toBe(true);
      expect(
        outcome.filtered.find((f) => f.id === "example/registry-only-tool")?.why,
      ).toMatch(/registry-only/);
    });
  });

  it("verify decision: 'jev' with offline fallback degrades gracefully to classic BM25F with fallback disclosed in ranking", async () => {
    const session = await makeSession();
    const { transport } = createMockTransport(
      "example/beta-tracer",
      {},
      0,
      { error: new Error("Network unreachable: ENETUNREACH") },
    );

    const jevClient = new JevClient({
      apiKey: "mock-key",
      live: true,
      transport,
    });

    const outcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
      decision: "jev",
      jevClient,
    });

    // Degraded gracefully to classic BM25F
    expect(outcome.ranking.decision?.mode).toBe("jev");
    expect(outcome.ranking.decision?.backend).toBe("fallback");
    expect(outcome.ranking.disclosure).toMatch(/fallback/i);
    expect(outcome.ranking.disclosure).toMatch(/degraded gracefully to classic BM25F fallback/);
    // Classic BM25F winner should be returned
    expect(outcome.previewed.length).toBeGreaterThan(0);
    expect(outcome.previewed[0]?.id).toBe("example/alpha-profiler");
  });

  describe("verify decision: 'compare'", () => {
    it("BM25F remains 100% authoritative when shadow Jev agrees", async () => {
      const session = await makeSession();
      // Jev shadow agrees on alpha-profiler
      const { transport } = createMockTransport(
        "example/alpha-profiler",
        {
          "example/alpha-profiler": 0.88,
          "example/beta-tracer": 0.1,
          none: 0.02,
        },
        0.95,
      );

      const jevClient = new JevClient({
        apiKey: "mock-key",
        live: true,
        transport,
      });

      const outcome = await summon(service, session, {
        query: "database bottlenecks",
        surface: "any",
        preview: true,
        decision: "compare",
        jevClient,
      });

      expect(outcome.ranking.decision?.mode).toBe("compare");
      expect(outcome.ranking.decision?.backend).toBe("compare");
      const compare = outcome.ranking.decision?.compare as any;
      expect(compare).toBeDefined();
      expect(compare.agreement).toBe(true);
      expect(compare.classic.chosen).toBe("example/alpha-profiler");
      expect(compare.semantic.chosen).toBe("example/alpha-profiler");
      expect(outcome.previewed[0]?.id).toBe("example/alpha-profiler");
      expect(outcome.ranking.disclosure).toMatch(/Compare mode: BM25F authoritative; shadow semantic decision agreed\./);
    });

    it("BM25F remains 100% authoritative when shadow Jev disagrees", async () => {
      const session = await makeSession();
      // Jev shadow selects beta-tracer, but BM25F ranks alpha-profiler top
      const { transport } = createMockTransport(
        "example/beta-tracer",
        {
          "example/beta-tracer": 0.9,
          "example/alpha-profiler": 0.08,
          none: 0.02,
        },
        0.94,
      );

      const jevClient = new JevClient({
        apiKey: "mock-key",
        live: true,
        transport,
      });

      const outcome = await summon(service, session, {
        query: "database bottlenecks",
        surface: "any",
        preview: true,
        decision: "compare",
        jevClient,
      });

      expect(outcome.ranking.decision?.mode).toBe("compare");
      expect(outcome.ranking.decision?.backend).toBe("compare");
      const compare = outcome.ranking.decision?.compare as any;
      expect(compare).toBeDefined();
      expect(compare.agreement).toBe(false);
      expect(compare.classic.chosen).toBe("example/alpha-profiler");
      expect(compare.semantic.chosen).toBe("example/beta-tracer");
      // BM25F remains 100% authoritative for admitted/previewed skills
      expect(outcome.previewed[0]?.id).toBe("example/alpha-profiler");
      expect(outcome.ranking.disclosure).toMatch(/Compare mode: BM25F authoritative; shadow semantic decision disagreed\./);
    });
  });

  it("verify MCP tool 'summon' handles decision: 'compare' and returns structuredContent with ranking.decision", async () => {
    const session = await makeSession();
    process.env.SKILL_SUMMON_SESSION = session.root;

    const server = createSkillSummonMcpServer({ service, version: "0.1.0" });
    const client = new Client({ name: "summon-decision-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const tools = await client.listTools();
    const summonTool = tools.tools.find((t) => t.name === "summon");
    expect(summonTool).toBeDefined();
    expect(summonTool?.inputSchema.properties?.decision).toBeDefined();

    expect(tools.tools.find((t) => t.name === "summon")?.inputSchema.properties?.live).toBeDefined();

    const result = await client.callTool({
      name: "summon",
      arguments: {
        query: "database bottlenecks",
        preview: true,
        decision: "compare",
        live: true,
      },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as any;
    expect(structured).toBeDefined();
    expect(structured.ranking).toBeDefined();
    expect(structured.ranking.decision).toMatchObject({
      mode: "compare",
      backend: "compare",
    });
    expect(structured.ranking.decision.compare).toBeDefined();
    expect(typeof structured.ranking.decision.compare.agreement).toBe("boolean");
  });

  it("gracefully falls back to 'classic' when decision env var is unrecognized", async () => {
    const session = await makeSession();
    process.env.SKILL_HEAVEN_DECISION = "bogus_unsupported_mode";

    const outcome = await summon(service, session, {
      query: "database bottlenecks",
      surface: "any",
      preview: true,
    });

    expect(outcome.ranking.decision?.mode).toBe("classic");
    expect(outcome.ranking.decision?.backend).toBe("classic");
  });

  it("supports live opt-in parameter in summon()", async () => {
    const session = await makeSession();
    const { transport, getCallCount } = createMockTransport(
      "example/beta-tracer",
      { "example/beta-tracer": 0.85, "example/alpha-profiler": 0.15 },
      0.95,
    );

    const client = new JevClient({
      apiKey: "test-key",
      live: false, // initially false
      transport,
    });

    // Explicit live: true parameter
    const outcome = await summon(service, session, {
      query: "execution bottlenecks",
      surface: "any",
      preview: true,
      decision: "jev",
      jevClient: client,
      live: true,
    });

    expect(outcome.ranking.decision?.mode).toBe("jev");
  });

  it("per-call live: false prevents an injected live client from dispatching", async () => {
    let calls = 0;
    const client = new JevClient({
      apiKey: "test-key",
      live: true,
      transport: async () => {
        calls++;
        return {
          status: 200,
          body: JSON.stringify({
            model: "jev-1.13.0",
            answers: {
              selection: {
                type: "choice",
                choice: "example/profiler-pro",
                confidence: 0.9,
                probabilities: { "example/profiler-pro": 0.9, none: 0.1 },
              },
            },
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
        };
      },
    });

    const session = await makeSession();
    const outcome = await summon(service, session, {
      query: "execution bottlenecks",
      surface: "any",
      preview: true,
      decision: "jev",
      jevClient: client,
      live: false, // Explicitly override live client to dry!
    });

    expect(calls).toBe(0);
    expect(outcome.ranking.decision?.backend).toBe("fallback");
  });

  it("per-call live: true enables an injected dry client to dispatch", async () => {
    const { transport, getCallCount } = createMockTransport(
      "example/alpha-profiler",
      { "example/alpha-profiler": 0.85, none: 0.15 },
      0.9,
    );
    const client = new JevClient({
      apiKey: "test-key",
      live: false, // dry client
      transport,
    });

    const session = await makeSession();
    const outcome = await summon(service, session, {
      query: "execution bottlenecks",
      surface: "any",
      preview: true,
      decision: "jev",
      jevClient: client,
      live: true, // Explicitly enable per-call live!
    });

    expect(getCallCount()).toBe(1);
    expect(outcome.ranking.decision?.backend).toBe("jev");
  });

  describe("Recursive suite component policy enforcement on surface mismatch", () => {
    it("fails suite component installation on surface:hell when component is human-led", async () => {
      const session = await makeSession();
      const outcome = await summon(service, session, {
        query: "example/suite-human",
        surface: "hell",
      });

      expect(outcome.suites.length).toBeGreaterThan(0);
      const suiteAttempt = outcome.suites.find((s) => s.suiteId === "example/suite-human");
      expect(suiteAttempt).toBeDefined();
      expect(suiteAttempt?.ok).toBe(false);
      expect(suiteAttempt?.failedComponents.length).toBeGreaterThan(0);
      expect(suiteAttempt?.failedComponents).toContain("example/human-only-tool");

      // The human-led skill must not have been materialized into summoned
      expect(outcome.summoned.some((s) => s.id === "example/human-only-tool")).toBe(false);
    });

    it("fails suite component installation on surface:heaven when component is model-led", async () => {
      const session = await makeSession();
      const outcome = await summon(service, session, {
        query: "example/suite-model",
        surface: "heaven",
      });

      expect(outcome.suites.length).toBeGreaterThan(0);
      const suiteAttempt = outcome.suites.find((s) => s.suiteId === "example/suite-model");
      expect(suiteAttempt).toBeDefined();
      expect(suiteAttempt?.ok).toBe(false);
      expect(suiteAttempt?.failedComponents).toContain("example/model-only-tool");

      // The model-led skill must not have been materialized into summoned
      expect(outcome.summoned.some((s) => s.id === "example/model-only-tool")).toBe(false);
    });

    it("fails suite component installation when component is verified not materializable", async () => {
      const session = await makeSession();
      const outcome = await summon(service, session, {
        query: "example/suite-unmaterializable",
        surface: "any",
      });

      expect(outcome.suites.length).toBeGreaterThan(0);
      const suiteAttempt = outcome.suites.find(
        (s) => s.suiteId === "example/suite-unmaterializable",
      );
      expect(suiteAttempt).toBeDefined();
      expect(suiteAttempt?.ok).toBe(false);
      expect(suiteAttempt?.failedComponents).toContain("example/unmaterializable-tool");

      // The unmaterializable component must not have been materialized
      expect(outcome.summoned.some((s) => s.id === "example/unmaterializable-tool")).toBe(false);
    });
  });
});
