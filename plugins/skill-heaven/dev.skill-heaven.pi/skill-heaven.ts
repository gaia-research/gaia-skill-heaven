// Pi 0.84.2 compatibility adapter for the portable Agent Plugin.
//
// Pi does not natively load Agent Plugins or MCP servers. Its package loader
// does understand package.json's `pi` manifest, so this thin adapter exposes
// the plugin's portable skills as native Pi skills, maps their explicit
// surfaces to slash commands, and bridges the portable stdio MCP declaration
// to one native `summon` tool. The engine remains the bundled mcp/ artifact.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_CONFIG = join(PLUGIN_ROOT, "mcp.json");
const REQUEST_TIMEOUT_MS = 180_000;
const SESSION_ROOT_PREFIX = "skill-summon-session-";

type JsonObject = Record<string, unknown>;
type McpResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
type StdioServer = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readServerConfig(): StdioServer {
  const parsed: unknown = JSON.parse(readFileSync(MCP_CONFIG, "utf8"));
  if (!isObject(parsed) || !isObject(parsed.mcpServers)) {
    throw new Error(`Invalid Agent Plugin MCP configuration: ${MCP_CONFIG}`);
  }
  const server = parsed.mcpServers["skill-summon"];
  if (!isObject(server) || server.type !== "stdio" || typeof server.command !== "string") {
    throw new Error('mcp.json has no valid stdio server named "skill-summon"');
  }
  if (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every((arg) => typeof arg === "string"))) {
    throw new Error('mcp.json skill-summon "args" must be an array of strings');
  }
  if (server.env !== undefined && (!isObject(server.env) || !Object.values(server.env).every((value) => typeof value === "string"))) {
    throw new Error('mcp.json skill-summon "env" must contain only string values');
  }
  if (server.cwd !== undefined && typeof server.cwd !== "string") {
    throw new Error('mcp.json skill-summon "cwd" must be a string');
  }
  return server as StdioServer;
}

function expandPluginValue(value: string, pluginData: string): string {
  return value
    .replaceAll("${PLUGIN_ROOT}", PLUGIN_ROOT)
    .replaceAll("${PLUGIN_DATA}", pluginData);
}

function resolveCommand(command: string): string {
  if (!command.startsWith("./")) return command;
  const resolved = resolve(PLUGIN_ROOT, command);
  if (!resolved.startsWith(`${PLUGIN_ROOT}/`)) {
    throw new Error(`MCP command escapes the plugin root: ${command}`);
  }
  return resolved;
}

function resolveCwd(value: string | undefined, pluginData: string): string {
  if (!value) return PLUGIN_ROOT;
  const expanded = expandPluginValue(value, pluginData);
  const resolved = isAbsolute(expanded) ? resolve(expanded) : resolve(PLUGIN_ROOT, expanded);
  const insidePlugin = resolved === PLUGIN_ROOT || resolved.startsWith(`${PLUGIN_ROOT}/`);
  const insideData = resolved === pluginData || resolved.startsWith(`${pluginData}/`);
  if (!insidePlugin && !insideData) throw new Error(`MCP cwd escapes plugin containment: ${value}`);
  return resolved;
}

class SkillSummonClient {
  readonly sessionRoots = new Set<string>();
  private pluginData: string | undefined;
  private child: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private stdoutBuffer = "";
  private startPromise: Promise<void> | undefined;

  async callSummon(
    input: { query: string; limit?: number; surface?: "any" | "heaven" | "hell" },
    signal?: AbortSignal,
  ): Promise<McpResult> {
    await this.start();
    const result = await this.request("tools/call", { name: "summon", arguments: input }, signal);
    if (!isObject(result)) throw new Error("skill-summon returned a non-object MCP result");
    this.captureSessionRoots(result.structuredContent);
    return result as McpResult;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.startPromise = undefined;
    this.rejectPending(new Error("skill-summon MCP server stopped"));
    if (child && child.exitCode === null && !child.killed) {
      await new Promise<void>((resolveExit) => {
        const force = setTimeout(() => child.kill("SIGKILL"), 1_000);
        const giveUp = setTimeout(resolveExit, 3_000);
        child.once("exit", () => {
          clearTimeout(force);
          clearTimeout(giveUp);
          resolveExit();
        });
        child.kill("SIGTERM");
      });
    }
    for (const root of this.sessionRoots) rmSync(root, { recursive: true, force: true });
    this.sessionRoots.clear();
    this.pluginData = undefined;
  }

  private async start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.startServer();
    try {
      await this.startPromise;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async startServer(): Promise<void> {
    const config = readServerConfig();
    const sessionRoot = mkdtempSync(join(tmpdir(), SESSION_ROOT_PREFIX));
    this.sessionRoots.add(sessionRoot);
    writeFileSync(
      join(sessionRoot, "session.json"),
      JSON.stringify({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        pid: process.pid,
        skills: [],
      }),
      "utf8",
    );
    const pluginData = join(sessionRoot, "plugin-data");
    mkdirSync(pluginData, { recursive: true });
    this.pluginData = pluginData;
    const args = (config.args ?? []).map((arg) => expandPluginValue(arg, pluginData));
    const env = Object.fromEntries(
      Object.entries(config.env ?? {}).map(([key, value]) => [key, expandPluginValue(value, pluginData)]),
    );
    const child = spawn(resolveCommand(config.command), args, {
      cwd: resolveCwd(config.cwd, pluginData),
      env: {
        ...process.env,
        ...env,
        PLUGIN_ROOT,
        PLUGIN_DATA: pluginData,
        // Keep every adapter-owned write inside this disposable summon root.
        // Override ambient values rather than inheriting a shared cache/session.
        SKILL_SUMMON_SESSION: sessionRoot,
        SKILL_SUMMON_CACHE_DIR: join(pluginData, "payload-cache"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stderr = "";
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8192);
    });
    child.stdout.on("data", (chunk: string) => this.consumeStdout(chunk));
    child.once("error", (error) => this.rejectPending(error));
    child.once("exit", (code, signal) => {
      if (this.child === child) {
        this.child = undefined;
        this.startPromise = undefined;
      }
      this.rejectPending(
        new Error(
          `skill-summon MCP server exited (${signal ?? code ?? "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "skill-heaven-pi", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  private request(method: string, params: JsonObject, signal?: AbortSignal): Promise<unknown> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("skill-summon MCP server is not running"));
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectRequest(new Error(`skill-summon MCP request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      const abort = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectRequest(new Error(`skill-summon MCP request aborted: ${method}`));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolveRequest(value);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          rejectRequest(error);
        },
        timer,
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isObject(message) || typeof message.id !== "number") continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (isObject(message.error)) {
        pending.reject(new Error(String(message.error.message ?? "Unknown MCP error")));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private captureSessionRoots(value: unknown): void {
    if (!isObject(value) || !Array.isArray(value.summoned)) return;
    for (const item of value.summoned) {
      if (!isObject(item) || typeof item.path !== "string") continue;
      let current = resolve(item.path);
      while (dirname(current) !== current) {
        if (dirname(current) === resolve(tmpdir()) && current.split("/").pop()?.startsWith(SESSION_ROOT_PREFIX)) {
          if (existsSync(current)) this.sessionRoots.add(current);
          break;
        }
        current = dirname(current);
      }
    }
  }
}

const commandAliases = [
  ["summon", "summon", "Summon one skill for this session"],
  ["skill-zero", "skill-zero", "Arm the zero rung"],
  ["skill-heaven", "skill-heaven", "Arm converge at low or med"],
  ["skill-hell", "skill-hell", "Arm explore at high, xhigh, or max"],
  ["skill-ultra", "skill-ultra", "Arm the adaptive crown rung"],
] as const;

export default function skillHeavenPi(pi: ExtensionAPI): void {
  const client = new SkillSummonClient();

  pi.registerTool({
    name: "summon",
    label: "Summon",
    description:
      "Summon the best-matching skill from the configured Skill URL into a session-locked temporary directory. Returns printable disclosure cards and materialized skill paths; never writes to agent configuration.",
    promptSnippet: "Summon a matching skill for a concrete capability gap",
    promptGuidelines: [
      "Manual /summon uses any; human-led Skill Heaven routing uses heaven; automatic model-led Skill Hell routing uses hell. Print every returned card verbatim before using the skill.",
    ],
    parameters: Type.Object({
      query: Type.String({ minLength: 1, description: "Task or capability to summon a matching skill for" }),
      limit: Type.Optional(
        Type.Integer({ minimum: 1, description: "Requested depth; no upper cap" }),
      ),
      surface: Type.Optional(
        Type.Union(
          [Type.Literal("any"), Type.Literal("heaven"), Type.Literal("hell")],
          { description: "Invocation lane: manual, human-led, or model-led" },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await client.callSummon(params, signal);
      if (result.isError) {
        const message = result.content?.find((item) => item.type === "text")?.text ?? "skill-summon failed";
        throw new Error(message);
      }
      const details = isObject(result.structuredContent) ? result.structuredContent : {};
      const cards = Array.isArray(details.cards)
        ? details.cards.filter((card): card is string => typeof card === "string")
        : [];
      const fallback = (result.content ?? [])
        .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
        .map((item) => ({ type: "text" as const, text: item.text }));
      return {
        // Pi's default tool renderer displays this text directly. Put the
        // engine's cards here, unchanged, so disclosure is visible even when
        // a model fails to repeat it in the following assistant message.
        content: cards.length > 0
          ? [{ type: "text" as const, text: cards.join("\n\n") }]
          : fallback,
        details,
      };
    },
  });

  for (const [command, skill, description] of commandAliases) {
    pi.registerCommand(command, {
      description,
      handler: async (args, ctx) => {
        const suffix = args.trim() ? ` ${args.trim()}` : "";
        pi.sendUserMessage(`/skill:${skill}${suffix}`, { expandPromptTemplates: true });
        await ctx.waitForIdle();
      },
    });
  }

  pi.on("session_shutdown", async () => {
    await client.stop();
  });
}

export { PLUGIN_ROOT, SkillSummonClient, readServerConfig };
