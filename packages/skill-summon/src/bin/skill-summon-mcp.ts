#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  DEFAULT_GENERIC_REGISTRY_URL,
  DEFAULT_NAMED_REGISTRY_URL,
  HttpGaiaRegistrySource,
  resolveConfiguredRegistryUrl,
} from "../data/source.js";
import { createSkillSummonMcpServer } from "../mcp/server.js";
import { GaiaService } from "../service.js";

async function main(): Promise<void> {
  const source = new HttpGaiaRegistrySource({
    genericUrl: resolveConfiguredRegistryUrl(
      process.env.TREE_URL,
      DEFAULT_GENERIC_REGISTRY_URL,
    ),
    namedUrl: resolveConfiguredRegistryUrl(
      process.env.TREE_NAMED_URL,
      DEFAULT_NAMED_REGISTRY_URL,
    ),
  });
  const service = new GaiaService(source);
  const server = createSkillSummonMcpServer({ service });
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await server.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`skill-summon-mcp failed: ${message}\n`);
  process.exitCode = 1;
});
