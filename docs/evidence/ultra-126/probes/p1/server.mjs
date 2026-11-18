#!/usr/bin/env node
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

const logPath = process.env.P1_LOG;
if (!logPath) {
  process.stderr.write("P1_LOG environment variable is required\n");
  process.exit(1);
}

mkdirSync(dirname(logPath), { recursive: true });

function logEntry(entry) {
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function send(msg) {
  logEntry({ ts: new Date().toISOString(), dir: "out", message: msg });
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

let nextServerRequestId = 1;
const pendingClientResponses = new Map();

function requestClient(method, params, timeoutMs = 60_000) {
  const id = `srv-${nextServerRequestId++}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingClientResponses.delete(id);
      const timeoutRecord = { timedOut: true, timeoutMs, method, id };
      logEntry({ ts: new Date().toISOString(), dir: "meta", event: "elicitation_timeout", detail: timeoutRecord });
      resolve(timeoutRecord);
    }, timeoutMs);

    pendingClientResponses.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });

    send({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
  });
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "p1-probe", version: "1.0.0" },
      },
    });
    return;
  }

  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "probe_elicit",
            description: "Send an MCP elicitation/create request to the client and return {\"sent\": true}.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: "operator_decide",
            description: "No-op probe tool that logs its invocation.",
            inputSchema: {
              type: "object",
              properties: {
                note: { type: "string" },
              },
              additionalProperties: true,
            },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    if (toolName === "probe_elicit") {
      await requestClient("elicitation/create", {
        message: "P1 operator check: type the word ALPHA",
        requestedSchema: {
          type: "object",
          properties: {
            word: { type: "string" },
          },
          required: ["word"],
        },
      });
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ sent: true }) }],
        },
      });
      return;
    }

    if (toolName === "operator_decide") {
      logEntry({
        ts: new Date().toISOString(),
        dir: "meta",
        event: "operator_decide_called",
        arguments: params?.arguments ?? {},
      });
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        },
      });
      return;
    }

    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: `Unknown tool: ${String(toolName)}` },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${String(method)}` },
  });
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (err) {
    logEntry({
      ts: new Date().toISOString(),
      dir: "in",
      parseError: String(err),
      raw: line,
    });
    return;
  }

  logEntry({
    ts: new Date().toISOString(),
    dir: "in",
    message: msg,
  });

  if (msg.id !== undefined && msg.method === undefined) {
    const resolver = pendingClientResponses.get(msg.id);
    if (resolver) {
      pendingClientResponses.delete(msg.id);
      resolver(msg);
    }
    return;
  }

  if (msg.id !== undefined && msg.method !== undefined) {
    void handleRequest(msg);
  }
});
