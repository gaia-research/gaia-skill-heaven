import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  GaiaService,
  InMemoryGaiaRegistrySource,
  createSkillSummonMcpServer,
  type GaiaRegistryDocuments,
} from "../src/index.js";

const body = "---\nname: health\ndescription: Exact body\n---\n\n# Health\n\nπ\n";
const bodyDigest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
const skillUri = "skill://example/health/SKILL.md";
const referenceUri = "skill://example/health/references/guide.md";
const referenceBody = "guide content";
const referenceDigest = `sha256:${createHash("sha256").update(referenceBody).digest("hex")}`;

const documents: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Runs test suites.",
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
          id: "example/health",
          name: "Health",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Exact body",
          frontmatter: { name: "health", description: "Exact body", license: "MIT" },
          tags: [],
          links: { github: "https://github.com/example/health/blob/main/SKILL.md" },
          evidence: [],
          installable: false,
        },
      ],
    },
  },
};

describe("SEP-2640 MCP Skills extension surface", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function connect(inputDocuments: GaiaRegistryDocuments = documents) {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(inputDocuments));
    let reads = 0;
    const server = createSkillSummonMcpServer({
      service,
      describeSkill: inputDocuments === documents ? async () => ({
        resources: [
          { uri: skillUri, digest: bodyDigest, size: Buffer.byteLength(body) },
          {
            uri: referenceUri,
            digest: referenceDigest,
            size: Buffer.byteLength(referenceBody),
          },
        ],
      }) : undefined,
      readSkillResource: async (_skill, relativePath) => {
        reads++;
        if (relativePath === "SKILL.md") {
          return { mimeType: "text/markdown", text: body };
        }
        if (relativePath === "references/guide.md") {
          return { mimeType: "text/markdown", text: referenceBody };
        }
        throw new Error("unexpected reader path");
      },
    });
    const client = new Client({ name: "skills-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closers.push(() => client.close(), () => server.close());
    return { client, reads };
  }

  it("advertises the extension, mandatory methods, resource template, and metadata", async () => {
    const { client } = await connect();
    expect(client.getServerCapabilities()).toMatchObject({
      resources: { listChanged: false },
      extensions: { "io.modelcontextprotocol/skills": {} },
    });

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates).toEqual([
      expect.objectContaining({
        name: "skill-files",
        uriTemplate: "skill://{+resourcePath}",
      }),
    ]);

    const resources = await client.listResources();
    expect(resources.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: skillUri,
          name: "SKILL.md",
          mimeType: "text/markdown",
          size: Buffer.byteLength(body),
        }),
      ]),
    );

    const rawRequest = (client.request as unknown as Function).bind(client);
    const listed = await rawRequest(
      { method: "skills/list", params: {} },
      z.any(),
    ) as Record<string, unknown>;
    expect(listed).toMatchObject({
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private",
      skills: [
        {
          uri: skillUri,
          frontmatter: { name: "health", description: "Exact body", license: "MIT" },
          resources: expect.arrayContaining([
            { uri: skillUri, digest: bodyDigest, size: Buffer.byteLength(body) },
            { uri: referenceUri, digest: referenceDigest, size: Buffer.byteLength(referenceBody) },
          ]),
        },
      ],
    });

    const got = await rawRequest(
      { method: "skills/get", params: { uri: skillUri } },
      z.any(),
    ) as Record<string, unknown>;
    expect(got).toMatchObject({
      resultType: "complete",
      skill: { uri: skillUri, frontmatter: { name: "health" } },
    });
  });

  it("paginates skills/list with an opaque cursor", async () => {
    const manySkills = Array.from({ length: 65 }, (_, index) => ({
      id: `example/skill-${index}`,
      name: `Skill ${index}`,
      contributor: "example",
      genericSkillRef: "automated-testing",
      status: "named",
      description: `Skill ${index}`,
      tags: [],
      links: {},
      evidence: [],
      installable: false,
    }));
    const manyDocuments: GaiaRegistryDocuments = {
      generic: documents.generic,
      named: {
        generatedAt: documents.named.generatedAt,
        buckets: { "automated-testing": manySkills },
      },
    };
    const { client } = await connect(manyDocuments);
    const rawRequest = (client.request as unknown as Function).bind(client);
    const first = await rawRequest(
      { method: "skills/list", params: {} },
      z.any(),
    ) as { skills: unknown[]; nextCursor?: string };
    expect(first.skills).toHaveLength(64);
    expect(first.nextCursor).toMatch(/^skill-list-v1:/u);

    const second = await rawRequest(
      { method: "skills/list", params: { cursor: first.nextCursor } },
      z.any(),
    ) as { skills: unknown[]; nextCursor?: string };
    expect(second.skills).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
  });

  it("reads exact text and manifest-listed supporting files with MIME types", async () => {
    const { client } = await connect();
    const result = await client.readResource({ uri: skillUri });
    expect(result.contents).toEqual([
      { uri: skillUri, mimeType: "text/markdown", text: body },
    ]);

    const supporting = await client.readResource({ uri: referenceUri });
    expect(supporting.contents).toEqual([
      { uri: referenceUri, mimeType: "text/markdown", text: "guide content" },
    ]);

    const rawRequest = (client.request as unknown as Function).bind(client);
    const rawRead = await rawRequest(
      { method: "resources/read", params: { uri: skillUri } },
      z.any(),
    ) as Record<string, unknown>;
    expect(rawRead).toMatchObject({
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private",
      contents: [{ uri: skillUri, mimeType: "text/markdown", text: body }],
    });
  });

  it.each([
    "https://example.test/health/SKILL.md",
    "skill://example/health/%2e%2e/secrets.txt",
    "skill://example/health/../secrets.txt",
    "skill://example/health/..%2fsecrets.txt",
    "skill://example/health//secrets.txt",
  ])("rejects resource URI outside the skill namespace: %s", async (uri) => {
    const { client } = await connect();
    await expect(client.readResource({ uri })).rejects.toMatchObject({
      code: -32602,
    });
  });

  it("does not invoke the reader for an unknown skill resource", async () => {
    const connected = await connect();
    await expect(
      connected.client.readResource({ uri: "skill://example/unknown/SKILL.md" }),
    ).rejects.toThrow(/no skill resource/i);
    expect(connected.reads).toBe(0);
  });
});
