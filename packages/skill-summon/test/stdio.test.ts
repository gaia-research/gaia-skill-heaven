import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openSession, type SummonSession } from "../src/summon/session.js";

// This monorepo ships TS source directly (no build step — see
// package.json's `main`). Run the stdio entry through tsx exactly the way
// packages/core/bin/skill-zero.mjs resolves it, rather than spawning a
// dist/ build that does not exist here.
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsxCli = join(
  dirname(require.resolve("tsx/package.json")),
  "dist/cli.mjs",
);
const skillSummonMcpEntry = resolve(here, "../src/bin/skill-summon-mcp.ts");

describe("skill-summon-mcp stdio executable", () => {
  let fixtureServer: Server;
  let baseUrl: string;
  let client: Client | undefined;
  // summon always resolves/creates a real session before doing anything
  // else. Pin SKILL_SUMMON_SESSION to a throwaway session owned by this test
  // so the child process reuses it instead of mkdtemp-ing its own — which
  // would otherwise leak into the shared OS temp directory on every run.
  let session: SummonSession;

  beforeEach(async () => {
    session = await openSession();
    fixtureServer = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/named.json") {
        response.end(
          JSON.stringify({
            generatedAt: "2026-07-16",
            buckets: {
              "automated-testing": [
                {
                  // A well-formed links.github passes isInstallable() (so
                  // this becomes a rank candidate), but the top-level
                  // `installable: false` guard makes installSingle() reject
                  // it before any git/network access — exercising the real
                  // rank -> install-attempt -> skipped[] pipeline as a child
                  // process, entirely offline.
                  id: "example/health",
                  name: "Health",
                  contributor: "example",
                  genericSkillRef: "automated-testing",
                  status: "named",
                  description: "Runs tests.",
                  catalogRef: "example-health",
                  tags: [],
                  links: {
                    github: "https://github.com/example/health/blob/main/SKILL.md",
                  },
                  evidence: [],
                  installable: false,
                },
              ],
            },
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
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
        }),
      );
    });
    await new Promise<void>((resolveListen) => {
      fixtureServer.listen(0, "127.0.0.1", resolveListen);
    });
    const address = fixtureServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Fixture server did not open a TCP port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await client?.close();
    await new Promise<void>((resolveClose, reject) => {
      fixtureServer.close((error) => (error ? reject(error) : resolveClose()));
    });
    await session.close();
  });

  it("initializes, lists exactly the summon tool, and runs a query as a child process", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, skillSummonMcpEntry],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TREE_URL: `${baseUrl}/generic.json`,
        TREE_NAMED_URL: `${baseUrl}/named.json`,
        SKILL_SUMMON_SESSION: session.root,
      },
      stderr: "pipe",
    });
    client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["summon"]);

    const result = await client.callTool({
      name: "summon",
      arguments: { query: "automated testing" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      summoned: [],
      skipped: [
        {
          id: "example/health",
          reason: expect.stringContaining("registry-only"),
        },
      ],
    });
  });
});
