import fs from "node:fs";
import readline from "node:readline";

const logPath = process.env.P2A_LOG;
const homeDir = process.env.HOME || "";

function sanitizeArg(arg) {
  if (homeDir && arg.includes(homeDir)) {
    return arg.split(homeDir).join("~");
  }
  return arg;
}

function appendLog(entry) {
  if (!logPath) return;
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function baseFields() {
  return {
    ts: new Date().toISOString(),
    pid: process.pid,
    ppid: process.ppid,
    CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID ?? null,
  };
}

appendLog({
  ...baseFields(),
  event: "start",
  argv: process.argv.map(sanitizeArg),
});

let exitLogged = false;
function logExit(reason, exitCode = 0) {
  if (!exitLogged) {
    exitLogged = true;
    appendLog({
      ...baseFields(),
      event: "exit",
      reason,
    });
  }
  process.exit(exitCode);
}

process.on("SIGTERM", () => logExit("SIGTERM", 0));
process.on("SIGINT", () => logExit("SIGINT", 0));
process.stdin.on("end", () => logExit("stdin_end", 0));
process.on("exit", (code) => {
  if (!exitLogged) {
    exitLogged = true;
    appendLog({
      ...baseFields(),
      event: "exit",
      reason: `process_exit_${code}`,
    });
  }
});

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = req;
  if (id === undefined || id === null) {
    // Notification; no response required.
    return;
  }

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "p2a-probe",
          version: "1.0.0",
        },
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
            name: "p2a_ping",
            description: "No-op probe tool that logs the call with its pid.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    if (toolName === "p2a_ping") {
      appendLog({
        ...baseFields(),
        event: "p2a_ping",
      });
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: "pong" }],
        },
      });
      return;
    }
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: `Unknown tool: ${toolName}` },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});
