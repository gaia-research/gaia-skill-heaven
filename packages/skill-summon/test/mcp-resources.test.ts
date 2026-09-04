import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { InMemoryGaiaRegistrySource } from "../src/data/source.js";
import { createSkillSummonMcpServer } from "../src/mcp/server.js";
import { GaiaService } from "../src/service.js";
import type { GaiaRegistryDocuments } from "../src/domain/types.js";

// SEP-2640's discovery surface. Resources, never tools: the tool count stays
// at one, because agent tool-selection accuracy degrades as the surface grows.

const documents: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Automated testing.",
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
      "automated-testing": [
        {
          id: "example/health",
          name: "Health",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs the automated test suite and reports failures.",
          tags: ["testing"],
          links: { github: "https://github.com/example/health/blob/main/SKILL.md" },
          evidence: [],
        },
      ],
    },
  },
};

/** Resource contents are text-or-blob at the type level; ours are always text. */
function textOf(result: { contents: Array<Record<string, unknown>> }): string {
  return String(result.contents[0]?.text);
}

const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close().catch(() => undefined);
});

async function connect() {
  const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
  const server = createSkillSummonMcpServer({ service, version: "0.0.0" });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(() => client.close(), () => server.close());
  return client;
}

describe("the SEP-2640 resource surface", () => {
  it("still exposes exactly one tool", async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["summon"]);
  });

  it("publishes skill://index.json", async () => {
    const client = await connect();
    const uris = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(uris).toContain("skill://index.json");
  });

  it("serves the corpus as metadata, and never the retrieval surface", async () => {
    const client = await connect();
    const result = await client.readResource({ uri: "skill://index.json" });
    const payload = JSON.parse(textOf(result)) as {
      count: number;
      skills: Array<Record<string, unknown>>;
    };

    expect(payload.count).toBe(1);
    expect(payload.skills[0]).toMatchObject({
      id: "example/health",
      description: "Runs the automated test suite and reports failures.",
      reachable: true,
    });
    // `retrieval` is index data, ranked on and never displayed. It does not
    // leave through this surface either.
    expect(payload.skills[0]).not.toHaveProperty("retrieval");
    // Stamps are not built. The surface says null rather than implying routing.
    expect(payload.skills[0]?.arbor).toBeNull();
  });

  it("serves one skill by its skill:// URI", async () => {
    const client = await connect();
    const listed = JSON.parse(
      textOf(await client.readResource({ uri: "skill://index.json" })),
    ) as { skills: Array<{ uri: string }> };

    expect(listed.skills[0]?.uri).toBe("skill://example/health/SKILL.md");
    const result = await client.readResource({ uri: "skill://example/health/SKILL.md" });
    const payload = JSON.parse(textOf(result)) as Record<string, unknown>;
    expect(payload.id).toBe("example/health");
    expect(payload.arbor).toBeNull();
  });

  it("refuses an unknown skill rather than inventing one", async () => {
    const client = await connect();
    await expect(
      client.readResource({ uri: "skill://nobody/nothing/SKILL.md" }),
    ).rejects.toThrow();
  });
});
