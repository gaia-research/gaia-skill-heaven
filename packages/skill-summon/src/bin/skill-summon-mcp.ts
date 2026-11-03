#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createConfiguredService } from "../configured-service.js";
import { createSkillSummonMcpServer } from "../mcp/server.js";

async function main(): Promise<void> {
  const service = createConfiguredService();
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
