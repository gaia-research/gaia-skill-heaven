import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import {
  GithubFleetSource,
  readSkillFrontmatter,
  readVerifiedSkillFrontmatter,
  type GithubFleetCheckout,
} from "../src/data/fleet-source.js";
import {
  createSkillSummonMcpServer,
  InMemoryGaiaRegistrySource,
  type GaiaRegistryDocuments,
} from "../src/index.js";
import { GaiaService } from "../src/service.js";

const roots: string[] = [];
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureCheckout(): Promise<{
  root: string;
  checkout: GithubFleetCheckout;
  cleanup: ReturnType<typeof vi.fn>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "fleet-source-test-"));
  roots.push(root);
  const cleanup = vi.fn(async () => undefined);
  return {
    root,
    cleanup,
    checkout: {
      path: root,
      repoUrl: "https://github.com/example/skills.git",
      webUrl: "https://github.com/example/skills",
      commit: COMMIT,
      contributor: "example",
      cleanup,
    },
  };
}

describe("GithubFleetSource", () => {
  it("discovers flat SKILL.md directories and classifies Matt Pocock invocation metadata", async () => {
    const { root, checkout, cleanup } = await fixtureCheckout();
    await mkdir(path.join(root, "skills", "ask-human"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "ask-human", "SKILL.md"),
      `---\nname: ask-human\ndescription: >-\n  Human orchestrator for a deliberate flow.\ndisable-model-invocation: true\n---\n`,
    );
    await mkdir(path.join(root, "skills", "diagnose"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "diagnose", "SKILL.md"),
      `---\nname: diagnosing-bugs\ndescription: Diagnose hard bugs with evidence.\n---\n`,
    );

    const source = new GithubFleetSource("https://github.com/example/skills", {
      checkout: async () => checkout,
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });
    const snapshot = await source.load();
    const skills = snapshot.named.buckets.fleet ?? [];

    expect(skills).toHaveLength(2);
    expect(skills.map(({ name, invocation }) => ({ name, invocation }))).toEqual([
      { name: "ask-human", invocation: "human" },
      { name: "diagnosing-bugs", invocation: "model" },
    ]);
    expect(skills[0]?.genericSkillRef).toBeUndefined();
    // The folded description and boolean are still used by legacy fleet
    // routing, but the lossy projection is not exposed as protocol metadata.
    expect(skills[0]?.frontmatter).toBeUndefined();
    expect(skills[1]?.frontmatter).toEqual({
      name: "diagnosing-bugs",
      description: "Diagnose hard bugs with evidence.",
    });
    expect(skills[0]?.links.github).toBe(
      `https://github.com/example/skills/blob/${COMMIT}/skills/ask-human/SKILL.md`,
    );
    expect(snapshot.source).toMatchObject({
      kind: "fleet",
      commit: COMMIT,
      rootUrl: "https://github.com/example/skills",
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("serves the verified flat path through MCP and omits lossy nested metadata", async () => {
    const { root, checkout } = await fixtureCheckout();
    await mkdir(path.join(root, "flat"), { recursive: true });
    await writeFile(
      path.join(root, "flat", "SKILL.md"),
      `---\nname: flat-supported\ndescription: A realistic flat fleet skill.\ndisable-model-invocation: true\nversion: 2.1\nretired: null\n---\n# Flat\n`,
    );
    await mkdir(path.join(root, "nested"), { recursive: true });
    await writeFile(
      path.join(root, "nested", "SKILL.md"),
      `---\nname: nested\ndescription: Legacy retrieval remains available.\nmetadata:\n  labels: [alpha, beta]\n---\n# Nested\n`,
    );

    const source = new GithubFleetSource("https://github.com/example/skills", {
      checkout: async () => checkout,
    });
    const snapshot = await source.load();
    const documents: GaiaRegistryDocuments = {
      generic: snapshot.generic,
      named: snapshot.named,
    };
    const server = createSkillSummonMcpServer({
      service: new GaiaService(new InMemoryGaiaRegistrySource(documents)),
      readSkillResource: async () => ({
        mimeType: "text/markdown",
        text: "# Flat\n",
      }),
    });
    const client = new Client({ name: "fleet-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const rawRequest = (client.request as unknown as Function).bind(client);
      const listed = await rawRequest(
        { method: "skills/list", params: {} },
        z.any(),
      ) as { skills: Array<Record<string, unknown>> };
      expect(listed.skills).toHaveLength(1);
      expect(listed.skills[0]).toMatchObject({
        uri: "skill://example/flat-supported/SKILL.md",
        frontmatter: {
          name: "flat-supported",
          description: "A realistic flat fleet skill.",
          "disable-model-invocation": true,
          version: 2.1,
          retired: null,
        },
      });
      const read = await client.readResource({
        uri: "skill://example/flat-supported/SKILL.md",
      });
      expect(read.contents).toEqual([
        {
          uri: "skill://example/flat-supported/SKILL.md",
          mimeType: "text/markdown",
          text: "# Flat\n",
        },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reports collection-only routing and relevance-searches without generic refs", async () => {
    const { root, checkout } = await fixtureCheckout();
    await mkdir(path.join(root, "debug"), { recursive: true });
    await writeFile(
      path.join(root, "debug", "SKILL.md"),
      `---\nname: evidence-debugger\ndescription: Diagnose failing and slow systems.\n---\n`,
    );
    const service = new GaiaService(
      new GithubFleetSource("https://github.com/example/skills", {
        checkout: async () => checkout,
      }),
    );
    const result = await service.search({ query: "diagnose slow failure" });
    expect(result.results[0]).toMatchObject({
      name: "evidence-debugger",
      invocation: "model",
    });
    expect(result.meta).toMatchObject({
      sourceKind: "fleet",
      routingMode: "collection-only",
    });
    expect(result.meta.warnings.join(" ")).toContain("no generic map");
  });

  it("rejects empty fleets and still cleans up", async () => {
    const { checkout, cleanup } = await fixtureCheckout();
    const source = new GithubFleetSource("https://github.com/example/empty", {
      checkout: async () => checkout,
    });
    await expect(source.load()).rejects.toThrow("no discoverable SKILL.md");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe("readSkillFrontmatter", () => {
  it("parses quoted and folded scalar metadata for legacy fleet behavior", () => {
    expect(
      readSkillFrontmatter(
        `---\nname: "ask-matt"\ndescription: >-\n  Route to the right\n  reusable skill.\ndisable-model-invocation: true\n---\n`,
      ),
    ).toEqual({
      name: "ask-matt",
      description: "Route to the right reusable skill.",
      "disable-model-invocation": "true",
    });
  });

  it("verifies a flat scalar document without stringifying native YAML scalars", () => {
    expect(
      readVerifiedSkillFrontmatter(
        `---\nname: diagnosing-bugs\ndescription: Diagnose hard bugs with evidence.\ndisable-model-invocation: true\nversion: 2.1\nretired: null\n---\n`,
      ),
    ).toEqual({
      name: "diagnosing-bugs",
      description: "Diagnose hard bugs with evidence.",
      "disable-model-invocation": true,
      version: 2.1,
      retired: null,
    });
  });

  it.each(["y", "Y", "n", "N"])(
    "omits YAML 1.1-compatible ambiguous scalar %s",
    (value) => {
      expect(
        readVerifiedSkillFrontmatter(
          `---\nname: demo\ndescription: safe\nmetadata-flag: ${value}\n---\n`,
        ),
      ).toBeUndefined();
    },
  );

  it("accepts ordinary strings that are not exact ambiguous scalars", () => {
    expect(
      readVerifiedSkillFrontmatter(
        `---\nname: demo\ndescription: safe\nmetadata-flag: yesterday\n---\n`,
      ),
    ).toMatchObject({ "metadata-flag": "yesterday" });
  });

  it.each([
    ["tRuE", "tRuE"],
    ["fAlSe", "fAlSe"],
    ["nUlL", "nUlL"],
  ])("preserves mixed-case scalar %s as a string", (value, expected) => {
    expect(
      readVerifiedSkillFrontmatter(
        `---\nname: demo\ndescription: safe\nmetadata-flag: ${value}\n---\n`,
      ),
    ).toMatchObject({ "metadata-flag": expected });
  });

  it("omits an unsafe integer instead of emitting a rounded number", () => {
    expect(
      readVerifiedSkillFrontmatter(
        `---\nname: demo\ndescription: safe\nmetadata-number: 9007199254740993\n---\n`,
      ),
    ).toBeUndefined();
  });

  it("omits mapping syntax without YAML separation whitespace", () => {
    expect(
      readVerifiedSkillFrontmatter(
        `---\nname: demo\ndescription: safe\nflag:value\n---\n`,
      ),
    ).toBeUndefined();
  });

  it.each(["true", "yes", "y", "null"])(
    "omits YAML-typed or ambiguous mapping key %s",
    (key) => {
      expect(
        readVerifiedSkillFrontmatter(
          `---\nname: demo\ndescription: safe\n${key}: value\n---\n`,
        ),
      ).toBeUndefined();
    },
  );

  it.each([
    [
      "nested maps and arrays",
      `---\nname: nested\ndescription: Nested metadata\nmetadata:\n  version: 2.1.0\n  labels: [alpha, beta]\n---\n`,
    ],
    [
      "multiline and quoted values",
      `---\nname: \"quoted\"\ndescription: >-\n  folded description\n---\n`,
    ],
    ["duplicate keys", `---\nname: first\nname: second\ndescription: x\n---\n`],
    ["aliases and tags", `---\nname: tagged\ndescription: !secret value\n---\n`],
  ])("omits unsupported %s rather than flattening it", (_label, source) => {
    expect(readVerifiedSkillFrontmatter(source)).toBeUndefined();
  });
});
