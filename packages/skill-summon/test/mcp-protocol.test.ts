import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSkillSummonMcpServer,
  GaiaService,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import { openSession, type SummonSession } from "../src/summon/session.js";

const documents: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Runs test suites and explains failures.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "active",
      },
    ],
  },
  named: {
    generatedAt: "2026-07-16",
    buckets: {
      "automated-testing": [
        {
          // installable per isInstallable() (a well-formed links.github), but
          // registry-only per the top-level `installable: false` guard — so
          // summon() ranks it as a candidate, then installSingle() rejects it
          // without ever touching the network. Exercises the real
          // rank -> install-attempt -> skipped[] pipeline offline.
          // No level/trust/trustMagnitude — this is deliberate: comparable
          // trust fields would flip ranking.mode to "trust-then-relevance"
          // and this test wants the honest relevance-only disclosure.
          id: "example/health",
          name: "Health",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs automated tests.",
          catalogRef: "example-health",
          tags: [],
          links: { github: "https://github.com/example/health/blob/main/SKILL.md" },
          evidence: [],
          installable: false,
        },
      ],
    },
  },
};

describe("skill-summon MCP protocol", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];
  // The `summon` tool always resolves/creates a real session (mkdtemp) before
  // it does anything else, even on a request that will fail validation. Pin
  // SKILL_SUMMON_SESSION to one throwaway session per test so nothing leaks
  // into the shared OS temp directory across runs.
  let session: SummonSession | undefined;
  let previousSessionEnv: string | undefined;

  beforeEach(async () => {
    previousSessionEnv = process.env.SKILL_SUMMON_SESSION;
    session = await openSession();
    process.env.SKILL_SUMMON_SESSION = session.root;
  });

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
    await session?.close();
    session = undefined;
    if (previousSessionEnv === undefined) delete process.env.SKILL_SUMMON_SESSION;
    else process.env.SKILL_SUMMON_SESSION = previousSessionEnv;
  });

  it("registers summon and only summon", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "skill-summon-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["summon"]);
  });

  it("ranks and attempts an install, reporting a registry-only skip without touching the network", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents), {
      now: () => new Date("2026-07-16T12:00:00Z"),
    });
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "skill-summon-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const result = await client.callTool({
      name: "summon",
      arguments: { query: "automated testing" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "automated testing",
      summoned: [],
      skipped: [
        {
          id: "example/health",
          reason: expect.stringContaining("registry-only"),
        },
      ],
      ranking: {
        mode: "relevance-only",
        disclosure:
          "Tree published no comparable trust signals; candidates are ranked by relevance only.",
      },
    });
  });

  it("returns a structured tool error for a query that trims to empty", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "skill-summon-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const result = await client.callTool({
      name: "summon",
      arguments: { query: " " },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: {
        name: "Error",
        message: "Summon query must not be empty.",
        retryable: false,
      },
    });
  });

  // There is NO summon cap. Nobody assigned a ceiling, so the engine must not
  // invent one: a depth the product never ruled out has to go through. Only
  // genuinely malformed values are refused, and they are refused — never
  // silently clamped into range, which would answer a question nobody asked.
  it.each([0, -1, 1.5])("refuses malformed limit %s rather than clamping it", async (limit) => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "skill-summon-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const result = await client.callTool({
      name: "summon",
      arguments: { query: "automated testing", limit },
    });

    expect(result.isError, `limit ${limit} was accepted`).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/limit/i);
    expect((result.structuredContent as Record<string, unknown> | undefined)?.summoned).toBeUndefined();
  });

  it("accepts any positive depth, with no upper cap", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
    const client = new Client({ name: "skill-summon-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    // 6 and 25 are the point: the old port capped at 5 and would have refused
    // both. The fixture is registry-only so nothing installs — what matters is
    // that the call is ACCEPTED and reports the skip.
    for (const limit of [1, 5, 6, 25]) {
      const result = await client.callTool({
        name: "summon",
        arguments: { query: "automated testing", limit },
      });
      expect(result.isError, `limit ${limit} was rejected`).toBeFalsy();
    }
  });

  it.each(SUPPORTED_PROTOCOL_VERSIONS)(
    "initializes and lists tools using MCP protocol %s",
    async (protocolVersion) => {
      const service = new GaiaService(
        new InMemoryGaiaRegistrySource(documents),
      );
      const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
      const client = new Client({ name: "protocol-test", version: "1.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const send = clientTransport.send.bind(clientTransport);
      clientTransport.send = async (message, options) => {
        if ("method" in message && message.method === "initialize") {
          (message.params as { protocolVersion: string }).protocolVersion =
            protocolVersion;
        }
        await send(message, options);
      };
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      closeCallbacks.push(
        () => client.close(),
        () => server.close(),
      );

      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(1);
    },
  );
});
