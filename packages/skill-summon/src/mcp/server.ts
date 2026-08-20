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
        "Use summon to materialize the best-matching skill's full directory from the configured SKILL_SOURCE into a session-locked temp directory. A website root resolves a Skill Tree (generic map plus named collection); a GitHub repository resolves a flat SKILL.md fleet. Human-led fleet skills belong to Skill Heaven and require explicit invocation; model-led skills belong to Skill Hell and may be reached automatically. summon returns printable disclosure cards and never touches real agent configuration.",
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
        "Materialize the best-matching skill from the configured Skill Tree or flat GitHub fleet. The agent supplies the capability query and optional surface: Heaven admits human-led/unspecified skills; Hell admits model-led/unspecified skills and is the safe default; explicit manual summon passes any. Source commits and subpaths are validated, payloads are commit-addressed, and real agent configuration is never modified.",
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
        surface: z
          .enum(["any", "heaven", "hell"])
          .optional()
          .describe(
            "Invocation lane. Omitted defaults safely to hell; heaven excludes model-led-only skills; explicit manual summon passes any.",
          ),
      }),
      annotations: summonAnnotations,
    },
    async ({ query, limit, surface }): Promise<CallToolResult> => {
      try {
        const session = await getSession();
        return toolResult(
          await summon(service, session, {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(surface === undefined ? {} : { surface }),
          }),
        );
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
