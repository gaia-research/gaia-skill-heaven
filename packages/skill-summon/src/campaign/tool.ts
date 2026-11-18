import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AgentOps,
  initialCampaignState,
  toControllerStatus,
  tokenize,
} from "skill-zero";
import { z } from "zod";

import type { GaiaService } from "../service.js";
import type { SummonSession } from "../summon/session.js";
import { ZERO_CUT_REFUSAL, type ZeroCut } from "../zero-cut.js";
import { executeOpen } from "./ops/open.js";
import { executeRecon } from "./ops/recon.js";
import { buildCampaignDigest, executeStatus } from "./ops/status.js";

export const CAMPAIGN_TOOL_NAME = "campaign" as const;
export const CAMPAIGN_TOOL_TITLE = "Campaign control plane" as const;
export const CAMPAIGN_TOOL_DESCRIPTION =
  "Campaign state and recon control plane (op: \"open\" | \"recon\" | \"status\"). Opens a campaign goal contract, previews candidate skills per gap without materializing anything to disk, or inspects current campaign status. Returns structured campaign state and a digest; output is reference data and authorizes nothing.";

export const campaignInputSchema = z
  .object({
    op: z.string().describe("Campaign operation to run (open, recon, status)."),
    goal: z.string().optional().describe("Campaign goal string for op=open."),
    workUniverse: z
      .array(z.string())
      .optional()
      .describe("In-scope paths or surfaces for op=open."),
    repositories: z
      .array(z.string())
      .optional()
      .describe("Target repositories for op=open."),
    acceptanceCommands: z
      .array(z.string())
      .optional()
      .describe("Verification commands for op=open."),
    humanOnlyOperations: z
      .array(z.string())
      .optional()
      .describe("Operations requiring a person for op=open."),
    stopConditions: z
      .array(z.string())
      .optional()
      .describe("Conditions that stop the campaign for op=open."),
    gaps: z
      .array(z.string())
      .optional()
      .describe("Capability gap queries to preview for op=recon."),
    surface: z
      .enum(["any", "heaven", "hell"])
      .optional()
      .describe("Optional lane filter for op=recon previews."),
    source: z
      .string()
      .optional()
      .describe("Optional skill source override for op=recon previews."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Optional candidate depth per gap for op=recon previews."),
  })
  .passthrough();

export type CampaignToolStandingDose = Readonly<{
  tokenizer: "chars4";
  nameChars: number;
  nameTokens: number;
  descriptionChars: number;
  descriptionTokens: number;
  inputSchemaJson: string;
  inputSchemaChars: number;
  inputSchemaTokens: number;
  definitionJson: string;
  definitionChars: number;
  standingTokens: number;
}>;

export function getCampaignToolInputJsonSchema(): Record<string, unknown> {
  return toJsonSchemaCompat(campaignInputSchema, {
    strictUnions: true,
    pipeStrategy: "input",
  }) as Record<string, unknown>;
}

export function measureCampaignToolStandingDose(
  inputSchemaJsonOverride?: Record<string, unknown>,
): CampaignToolStandingDose {
  const inputSchema =
    inputSchemaJsonOverride ?? getCampaignToolInputJsonSchema();
  const inputSchemaJson = JSON.stringify(inputSchema);
  const definitionJson = JSON.stringify({
    name: CAMPAIGN_TOOL_NAME,
    description: CAMPAIGN_TOOL_DESCRIPTION,
    inputSchema,
  });

  return Object.freeze({
    tokenizer: "chars4" as const,
    nameChars: CAMPAIGN_TOOL_NAME.length,
    nameTokens: tokenize(CAMPAIGN_TOOL_NAME, "chars4"),
    descriptionChars: CAMPAIGN_TOOL_DESCRIPTION.length,
    descriptionTokens: tokenize(CAMPAIGN_TOOL_DESCRIPTION, "chars4"),
    inputSchemaJson,
    inputSchemaChars: inputSchemaJson.length,
    inputSchemaTokens: tokenize(inputSchemaJson, "chars4"),
    definitionJson,
    definitionChars: definitionJson.length,
    standingTokens: tokenize(definitionJson, "chars4"),
  });
}

export type CampaignToolContext = Readonly<{
  service: GaiaService;
  getSession: () => Promise<SummonSession>;
  zeroCut?: ZeroCut;
}>;

export async function executeCampaignTool(
  context: CampaignToolContext,
  rawArgs: unknown,
): Promise<CallToolResult> {
  const op =
    isPlainObject(rawArgs) && typeof rawArgs.op === "string"
      ? rawArgs.op.trim()
      : "";

  try {
    if (op === AgentOps.recon && context.zeroCut === "all") {
      const initial = initialCampaignState();
      const status = toControllerStatus(initial);
      const digest = buildCampaignDigest(initial, status);
      return {
        isError: true,
        content: [{ type: "text", text: ZERO_CUT_REFUSAL }],
        structuredContent: {
          ok: false,
          refused: true,
          op: AgentOps.recon,
          state: initial,
          status,
          digest,
          error: {
            name: "ZeroCutError",
            code: "zero-cut",
            message: ZERO_CUT_REFUSAL,
            retryable: false,
          },
        },
      };
    }

    if (op === AgentOps.open) {
      const session = await context.getSession();
      const result = await executeOpen(session, rawArgs);
      return toCampaignCallToolResult(result);
    }

    if (op === AgentOps.recon) {
      const session = await context.getSession();
      const result = await executeRecon(context.service, session, rawArgs, {
        zeroCut: context.zeroCut,
      });
      return toCampaignCallToolResult(result);
    }

    if (op === AgentOps.status) {
      const session = await context.getSession();
      const result = await executeStatus(session);
      return toCampaignCallToolResult(result);
    }

    const session = await context.getSession();
    const statusResult = await executeStatus(session);
    const structuredContent = {
      ok: false,
      refused: true,
      op: op || "unknown",
      state: statusResult.state,
      status: statusResult.status,
      digest: statusResult.digest,
      error: {
        code: "unknown-op",
        message: `Unsupported or unknown campaign op: ${JSON.stringify(op)}. Supported ops in U1: open, recon, status.`,
        retryable: false,
      },
    };
    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify(structuredContent, null, 2) },
      ],
      structuredContent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const initial = initialCampaignState();
    const status = toControllerStatus(initial);
    const fallbackDigest = buildCampaignDigest(initial, status);
    const structuredContent = {
      ok: false,
      refused: true,
      op: op || "unknown",
      state: initial,
      status,
      digest: fallbackDigest,
      error: {
        name: error instanceof Error ? error.name : "Error",
        code: "campaign-tool-error",
        message,
        retryable: false,
      },
    };
    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify(structuredContent, null, 2) },
      ],
      structuredContent,
    };
  }
}

export function registerCampaignTool(
  server: McpServer,
  context: CampaignToolContext,
): void {
  server.registerTool(
    CAMPAIGN_TOOL_NAME,
    {
      title: CAMPAIGN_TOOL_TITLE,
      description: CAMPAIGN_TOOL_DESCRIPTION,
      inputSchema: campaignInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args) => executeCampaignTool(context, args),
  );
}

function toCampaignCallToolResult(
  result: Readonly<{ ok: boolean; refused?: boolean } & Record<string, unknown>>,
): CallToolResult {
  const isError = result.ok === false || result.refused === true;
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: { ...result },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
