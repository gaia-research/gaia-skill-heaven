import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSkillSummonMcpServer,
  type GaiaService,
  type GaiaRegistrySnapshot,
  type NamedSkill,
} from "../src/index.js";
import { indexFromSnapshot } from "../src/data/skill-index-source.js";
import {
  openSession,
  type InstalledSkill,
  type SummonSession,
} from "../src/summon/session.js";

const DEFAULT_SOURCE = "https://github.com/default/repo/blob/main/SKILL.md";
const OVERRIDE_SOURCE = "https://github.com/override/repo/blob/main/SKILL.md";
const BODY = "---\nname: health\ndescription: fixture\n---\n";

const sessions: SummonSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

function fixtureSkill(
  sourceUrl: string,
  name = "Health",
): NamedSkill {
  return {
    id: "example/health",
    name,
    contributor: "example",
    status: "named",
    description: "A source identity fixture.",
    tags: [],
    links: { github: sourceUrl },
    evidence: [],
    frontmatter: { name: "health", description: "A source identity fixture." },
    installable: true,
  };
}

function fixtureSnapshot(
  sourceUrl: string,
  skill: NamedSkill,
): GaiaRegistrySnapshot {
  const rootUrl = new URL(sourceUrl).origin + new URL(sourceUrl).pathname.split("/blob/")[0];
  return {
    generic: { generatedAt: "2026-09-08T00:00:00Z", skills: [] },
    named: {
      generatedAt: "2026-09-08T00:00:00Z",
      buckets: { fixture: [skill] },
    },
    source: {
      kind: "fleet",
      rootUrl,
      genericUrl: rootUrl,
      namedUrl: rootUrl,
      fetchedAt: "2026-09-08T00:00:00Z",
    },
  };
}

function serviceFor(
  sourceUrl: string,
  indexSkill: NamedSkill,
  metadata: () => Promise<NamedSkill[]>,
): GaiaService {
  const index = indexFromSnapshot(fixtureSnapshot(sourceUrl, indexSkill), sourceUrl);
  return {
    skillIndex: async () => ({
      index,
      source: sourceUrl,
      origin: "fetched" as const,
    }),
    namedSkills: metadata,
  } as unknown as GaiaService;
}

async function primeResident(
  session: SummonSession,
  skill: NamedSkill,
  sourceUrl: string,
): Promise<void> {
  await mkdir(session.skillsRoot, { recursive: true });
  const resident = path.join(session.skillsRoot, "resident");
  await mkdir(resident, { recursive: true });
  await writeFile(path.join(resident, "SKILL.md"), BODY);
  const parsed = new URL(sourceUrl);
  await session.recordSkill({
    id: skill.id,
    name: skill.name,
    contributor: skill.contributor,
    sourceUrl,
    repoUrl: `${parsed.origin}${parsed.pathname.split("/blob/")[0]}.git`,
    branch: "main",
    subpath: "",
    path: resident,
    fileCount: 1,
    sha256: createHash("sha256").update(BODY).digest("hex"),
    cacheState: "warm",
    cache: "warm",
    cacheSource: "session",
    inspectUrl: sourceUrl,
    card: "fixture",
    cloneSeconds: 0,
    materializeSeconds: 0,
    totalSeconds: 0,
  });
}

async function callSummon(
  service: GaiaService,
  args: Record<string, unknown>,
): Promise<Awaited<ReturnType<Client["callTool"]>>> {
  const session = await openSession();
  sessions.push(session);
  const previousSession = process.env.SKILL_SUMMON_SESSION;
  process.env.SKILL_SUMMON_SESSION = session.root;
  const server = createSkillSummonMcpServer({ service });
  const client = new Client({ name: "wire-regression", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: "summon", arguments: args });
  } finally {
    await client.close();
    await server.close();
    if (previousSession === undefined) delete process.env.SKILL_SUMMON_SESSION;
    else process.env.SKILL_SUMMON_SESSION = previousSession;
  }
}

function resourceLinks(result: Awaited<ReturnType<Client["callTool"]>>): unknown[] {
  return (result.content as Array<{ type?: string }>).filter(
    (block) => block.type === "resource_link",
  );
}

describe("summon resource-link enrichment", () => {
  it("keeps same-source links while requiring source and identity correspondence", async () => {
    const skill = fixtureSkill(DEFAULT_SOURCE);
    const session = await openSession();
    sessions.push(session);
    await primeResident(session, skill, DEFAULT_SOURCE);
    const service = serviceFor(
      "https://github.com/default/repo",
      skill,
      async () => [skill],
    );
    const previousSession = process.env.SKILL_SUMMON_SESSION;
    process.env.SKILL_SUMMON_SESSION = session.root;
    const server = createSkillSummonMcpServer({ service });
    const client = new Client({ name: "wire-regression", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "summon",
        arguments: { query: "health", surface: "any" },
      });
      expect(result.isError).toBeFalsy();
      expect(resourceLinks(result)).toEqual([
        expect.objectContaining({
          type: "resource_link",
          uri: "skill://example/health/SKILL.md",
        }),
      ]);
    } finally {
      await client.close();
      await server.close();
      if (previousSession === undefined) delete process.env.SKILL_SUMMON_SESSION;
      else process.env.SKILL_SUMMON_SESSION = previousSession;
    }
  });

  it("omits links for a same-ID different-route explicit source override", async () => {
    const overrideSkill = fixtureSkill(OVERRIDE_SOURCE, "Override Health");
    const configuredSkill = fixtureSkill(DEFAULT_SOURCE, "Override Health");
    const session = await openSession();
    sessions.push(session);
    await primeResident(session, overrideSkill, OVERRIDE_SOURCE);
    const service = serviceFor(
      "https://github.com/override/repo",
      overrideSkill,
      async () => [configuredSkill],
    );
    const previousSession = process.env.SKILL_SUMMON_SESSION;
    process.env.SKILL_SUMMON_SESSION = session.root;
    const server = createSkillSummonMcpServer({ service });
    const client = new Client({ name: "wire-regression", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "summon",
        arguments: {
          query: "health",
          surface: "any",
          source: "https://github.com/override/repo",
        },
      });
      expect(result.isError).toBeFalsy();
      expect((result.structuredContent as { summoned: unknown[] }).summoned).toHaveLength(1);
      expect(resourceLinks(result)).toEqual([]);
    } finally {
      await client.close();
      await server.close();
      if (previousSession === undefined) delete process.env.SKILL_SUMMON_SESSION;
      else process.env.SKILL_SUMMON_SESSION = previousSession;
    }
  });

  it("preserves noMatch and preview outcomes when metadata enrichment fails", async () => {
    const skill = fixtureSkill(DEFAULT_SOURCE);
    const metadata = async (): Promise<NamedSkill[]> => {
      throw new Error("metadata source unavailable");
    };
    const service = serviceFor(
      "https://github.com/default/repo",
      skill,
      metadata,
    );

    const noMatch = await callSummon(service, {
      query: "capability that is not present",
      surface: "any",
    });
    expect(noMatch.isError).toBeFalsy();
    expect(noMatch.structuredContent).toMatchObject({
      summoned: [],
      previewed: [],
      noMatch: expect.any(Object),
    });
    expect(resourceLinks(noMatch)).toEqual([]);

    const preview = await callSummon(service, {
      query: "health",
      surface: "any",
      preview: true,
    });
    expect(preview.isError).toBeFalsy();
    expect(preview.structuredContent).toMatchObject({
      summoned: [],
      previewed: [expect.objectContaining({ id: skill.id })],
      noMatch: null,
    });
    expect(resourceLinks(preview)).toEqual([]);
  });

  it("still returns a wire error when summon source resolution fails", async () => {
    const service = {
      skillIndex: async () => {
        throw new Error("explicit source resolution failed");
      },
      namedSkills: async () => [],
    } as unknown as GaiaService;
    const result = await callSummon(service, {
      query: "health",
      source: "https://github.com/does-not-exist/repo",
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { message: "explicit source resolution failed" },
    });
  });
});
