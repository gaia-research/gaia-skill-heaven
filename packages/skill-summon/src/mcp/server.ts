import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { GaiaService } from "../service.js";
import { resolveSession, type SummonSession } from "../summon/session.js";
import { summon } from "../summon/summon.js";
import { VERSION } from "../version.js";

export type CreateSkillSummonMcpServerOptions = {
  service: GaiaService;
  version?: string;
};

const summonAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * Build the skill-summon MCP server. Registers ONLY the `summon` tool —
 * gaia_search/gaia_inspect/gaia_status are not exposed here. Their service
 * methods (GaiaService#search/#inspect/#status) still exist and are
 * exercised directly by tests, since summon's ranking depends on them, but
 * they are internal to this package, not MCP-exposed.
 */
export function createSkillSummonMcpServer({
  service,
  version = VERSION,
}: CreateSkillSummonMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: "skill-summon", version },
    {
      instructions:
        "Use summon to install the best-matching skill's full directory (SKILL.md plus any reference/, scripts/, and fixtures) from the public Gaia Registry into a session-locked temp directory. summon returns a printable card and inspect URL plus cloneSeconds, materializeSeconds, totalSeconds, and cacheState (cold or warm) for every materialized skill, an honest ranking disclosure, and totalSeconds for the invocation. The Gaia Registry itself is read-only and cannot be installed into, fused, or mutated; summon does not touch your real configuration. Session payloads are ephemeral; a separate bounded, commit-addressed payload cache may retain copies across sessions and can always be rebuilt on a miss.",
    },
  );

  let sessionPromise: Promise<SummonSession> | undefined;
  function getSession(): Promise<SummonSession> {
    sessionPromise ??= resolveSession().then(({ session }) => session);
    return sessionPromise;
  }

  server.registerTool(
    "summon",
    {
      title: "Summon a skill",
      description:
        "Install the best-matching Named Skill from the live Gaia Registry: resolve the current source commit, reuse a bounded commit-addressed payload cache when available, or shallow-clone transiently on a miss; validate the resolved subpath, discard clone scaffolding, then materialize the whole skill directory (SKILL.md plus any reference/, scripts/, and fixtures) into a session-locked temp directory. Recurses into suiteComponents for suite skills. Never writes to your real configuration. Falls through to the next-best candidate on an install failure and reports what was skipped. The structured result includes a printable card and inspect URL, tree-provided trust fields, per-skill cloneSeconds, materializeSeconds, totalSeconds, and cacheState (cold or warm), an honest ranking disclosure, plus the invocation totalSeconds.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Task or capability to summon a matching skill for."),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "How many skills to summon for this gap. No upper cap — the caller decides the depth.",
          ),
      }),
      annotations: summonAnnotations,
    },
    async ({ query, limit }): Promise<CallToolResult> => {
      try {
        const session = await getSession();
        return toolResult(await summon(service, session, { query, limit }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

function toolResult(value: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: { ...value },
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = {
    error: {
      name: error instanceof Error ? error.name : "Error",
      message,
      retryable: error instanceof Error && error.name === "GaiaDataError",
    },
  };
  return {
    content: [{ type: "text", text: message }],
    structuredContent,
    isError: true,
  };
}
