// #123 — the configured zero cut, enforced by the summon server itself.
// `zero_cuts = all` means no skill is used: no route this server offers may put
// a skill into a session, and the server does no work towards one.

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  GaiaService,
  InMemoryGaiaRegistrySource,
  ZERO_CUT_REFUSAL,
  createSkillSummonMcpServer,
  normalizeZeroCut,
  zeroCutFromEnv,
  type GaiaRegistryDocuments,
  type ZeroCut,
} from "../src/index.js";

const body = "---\nname: health\ndescription: Exact body\n---\n\n# Health\n";
const skillUri = "skill://example/health/SKILL.md";
const bodyDigest = `sha256:${createHash("sha256").update(body).digest("hex")}`;

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
          installable: true,
        },
      ],
    },
  },
};

/** Counts every registry read, so "did no work" is observable. */
class CountingSource extends InMemoryGaiaRegistrySource {
  reads = 0;
  override async load() {
    this.reads++;
    return super.load();
  }
}

const sessionDirs = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith("skill-summon-session-")).sort();

describe("zero cut — configuration", () => {
  it("reads SKILL_HEAVEN_ZERO_CUTS; only `all` cuts, anything else is temporary", () => {
    expect(zeroCutFromEnv({})).toBe("temporary");
    expect(zeroCutFromEnv({ SKILL_HEAVEN_ZERO_CUTS: " ALL " })).toBe("all");
    expect(zeroCutFromEnv({ SKILL_HEAVEN_ZERO_CUTS: "temporary" })).toBe("temporary");
    // An unsubstituted placeholder or junk never cuts, and never errors.
    expect(zeroCutFromEnv({ SKILL_HEAVEN_ZERO_CUTS: "${user_config.zero_cuts}" })).toBe("temporary");
    expect(normalizeZeroCut(undefined)).toBe("temporary");
  });

  it("refuses in reference language, echoing nothing (#85/#91)", () => {
    const lower = ZERO_CUT_REFUSAL.toLowerCase();
    for (const phrase of ["standing instruction", "follow it", "armed", "verbatim", "auto-summon", "must obey"]) {
      expect(lower).not.toContain(phrase);
    }
  });
});

describe("zero cut — the server", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function connect(zeroCut?: ZeroCut) {
    const source = new CountingSource(documents);
    const service = new GaiaService(source);
    const counters = { reader: 0, describe: 0 };
    const server = createSkillSummonMcpServer({
      service,
      ...(zeroCut === undefined ? {} : { zeroCut }),
      describeSkill: async () => {
        counters.describe++;
        return { resources: [{ uri: skillUri, digest: bodyDigest, size: Buffer.byteLength(body) }] };
      },
      readSkillResource: async () => {
        counters.reader++;
        return { mimeType: "text/markdown", text: body };
      },
    });
    const client = new Client({ name: "zero-cut-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closers.push(() => client.close(), () => server.close());
    const raw = (client.request as unknown as Function).bind(client);
    return { client, raw, source, counters };
  }

  it("leaves every route working when the cut is temporary or unset", async () => {
    for (const zeroCut of [undefined, "temporary" as const]) {
      const { client, raw } = await connect(zeroCut);
      const listed = (await raw({ method: "skills/list", params: {} }, z.any())) as { skills: unknown[] };
      expect(listed.skills).toHaveLength(1);
      const read = await client.readResource({ uri: skillUri });
      expect(read.contents[0]).toMatchObject({ text: body });
    }
  });

  it("refuses summon — and preview — with no session, index or network work", async () => {
    const { client, source, counters } = await connect("all");
    const before = sessionDirs();
    for (const args of [{ query: "automated testing" }, { query: "automated testing", preview: true }, { query: "Health", surface: "any" }]) {
      const result = await client.callTool({ name: "summon", arguments: args });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: "text", text: ZERO_CUT_REFUSAL }]);
      expect(result.structuredContent).toEqual({
        error: { name: "ZeroCutError", message: ZERO_CUT_REFUSAL, retryable: false },
      });
    }
    expect(sessionDirs()).toEqual(before);
    expect(source.reads).toBe(0);
    expect(counters).toEqual({ reader: 0, describe: 0 });
  });

  it("serves no skill through the Skills API: listings empty, get and read refused", async () => {
    const { client, raw, source, counters } = await connect("all");
    const listed = (await raw({ method: "skills/list", params: {} }, z.any())) as Record<string, unknown>;
    expect(listed).toMatchObject({ resultType: "complete", skills: [] });
    expect(listed.nextCursor).toBeUndefined();
    expect((await client.listResources()).resources).toEqual([]);
    await expect(raw({ method: "skills/get", params: { uri: skillUri } }, z.any())).rejects.toThrow(ZERO_CUT_REFUSAL);
    await expect(client.readResource({ uri: skillUri })).rejects.toThrow(ZERO_CUT_REFUSAL);
    expect(source.reads).toBe(0);
    expect(counters).toEqual({ reader: 0, describe: 0 });
  });

  it("still lists exactly one tool, so the cut is visible as a refusal rather than an absence", async () => {
    const { client } = await connect("all");
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["summon"]);
  });
});
