// Resolve the door's OWN bundled MCP server into ONE literal stdio declaration
// Claude will actually start under `--strict-mcp-config`.
//
// WHY THIS FILE EXISTS (#143). The product floor evicts ambient MCP servers with
// `--strict-mcp-config`, which is an ALLOWLIST: it suppresses plugin-declared
// MCP exactly as thoroughly as ambient MCP. Measured on claude 2.1.288, the
// door route alone (`--strict-mcp-config --mcp-config '{"mcpServers":{}}'
// --setting-sources '' --plugin-dir <door>`) starts NO server at all
// (`mcp_servers: []`, no `mcp__skill-summon__summon` in the tool inventory), so
// `/summon` resolves as a command whose tool does not exist. The fix is NOT to
// relax isolation — it is to hand claude an explicit, fully-resolved allowlist
// entry for the one server the door itself ships.
//
// WHY RESOLUTION HAPPENS HERE AND NOT IN CLAUDE. Claude does NOT interpolate
// plugin placeholders in an externally supplied `--mcp-config` file: passing the
// plugin's raw `.mcp.json` produces `status: "failed"` with the literal
// `${CLAUDE_PLUGIN_ROOT}` handed to node (same pin, same probe receipt in
// packages/claude-zero/PROBE.md). So `${CLAUDE_PLUGIN_ROOT}` and
// `${user_config.skill_url}` are resolved HERE, to an absolute path and a
// concrete source, before core ever sees them. Nothing is executed and no
// network request is made to build a launch plan.
//
// SCOPE. This is the minimal door contract, not a plugin manifest parser: it
// reads the ONE known server declaration out of the explicitly supplied plugin
// dir and REFUSES anything else (extra servers, an unknown shape, an unknown
// placeholder, a missing bundle) rather than admitting servers the product
// floor exists to keep out.
//
// SOURCE PRECEDENCE: explicit `skillSource` (the CLI passes SKILL_SOURCE from
// the environment) → the plugin manifest's `userConfig.skill_url.default`. No
// installed-plugin preference file is imported and no ambient config is read:
// this function touches exactly the plugin dir its caller named.

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  DOOR_MCP_BUNDLE_RELATIVE,
  DOOR_MCP_SERVER_NAME,
  DOOR_MCP_SOURCE_ENV_KEY,
  type DoorMcpConfig,
  type DoorMcpServer,
} from "skill-zero";

/** The only placeholder the shipped declaration may carry, per server. */
const PLUGIN_ROOT_PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
const SKILL_URL_PLACEHOLDER = "${user_config.skill_url}";

/** The bundle path the declaration's argv must resolve to, relative to the
 * plugin dir — shared with core, which checks the admitted argv against it. */
const BUNDLE_RELATIVE = DOOR_MCP_BUNDLE_RELATIVE;
/** The only env key the door's server carries. */
const SKILL_SOURCE_ENV_KEY = DOOR_MCP_SOURCE_ENV_KEY;

export interface ResolveDoorMcpOptions {
  /** The door's own plugin dir — the one core mounts with `--plugin-dir`. */
  pluginDir: string;
  /** Explicit override for the summon source URL (SKILL_SOURCE). */
  skillSource?: string;
}

function readJsonFile(path: string, what: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    throw new Error(`cannot read the door plugin's ${what} (${path})`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`the door plugin's ${what} (${path}) is not a JSON object`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The source contract skill-summon already enforces: ONE absolute http(s) URL.
 * The documented shapes are a Skill Tree website root (the public default) or a
 * GitHub repository; nothing else is special-cased here because the server, not
 * this launcher, owns what it can read. Validated so a typo fails as a launch
 * error instead of a confusing fetch failure inside the session — and the URL is
 * never fetched: a launch plan is a plan.
 */
export function assertSkillSourceUrl(value: string): string {
  const url = value.trim();
  if (!url) throw new Error("the door's skill source is empty");
  if (/\$\{[^}]*\}/.test(url)) {
    throw new Error(
      `the door's skill source still contains an unresolved \${…} placeholder: ${JSON.stringify(value)} — ` +
        "the door resolves SKILL_SOURCE itself (an explicit override, or the plugin manifest's default)",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `the door's skill source must be an absolute website or GitHub URL, got ${JSON.stringify(value)}`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`the door's skill source must use http or https, got ${JSON.stringify(parsed.protocol)}`);
  }
  return url;
}

/**
 * Build the single explicit server declaration for `--mcp-config`.
 *
 * Throws — loudly and specifically — rather than returning a zero-server config.
 * A silently doorless product floor is precisely the failure #143 reports, so a
 * malformed or missing declaration must stop the launch, not downgrade it.
 */
export function resolveDoorMcpConfig(options: ResolveDoorMcpOptions): DoorMcpConfig {
  const pluginDir = options.pluginDir;
  if (!pluginDir || !isAbsolute(pluginDir)) {
    throw new Error(
      `resolveDoorMcpConfig: pluginDir must be an absolute path to the door's plugin (got ${JSON.stringify(pluginDir)})`,
    );
  }
  if (!existsSync(pluginDir) || !statSync(pluginDir).isDirectory()) {
    throw new Error(`resolveDoorMcpConfig: the door plugin dir is not a directory (${pluginDir})`);
  }

  const declaration = readJsonFile(join(pluginDir, ".mcp.json"), ".mcp.json");
  const servers = asRecord(declaration.mcpServers);
  if (!servers) {
    throw new Error(`the door plugin's .mcp.json (${pluginDir}) declares no mcpServers object`);
  }
  const names = Object.keys(servers);
  if (names.length !== 1 || names[0] !== DOOR_MCP_SERVER_NAME) {
    throw new Error(
      `the door plugin's .mcp.json must declare exactly one server, "${DOOR_MCP_SERVER_NAME}" ` +
        `(got ${names.length === 0 ? "none" : names.join(", ")}) — the door's MCP contract is minimal by ` +
        "design and admits nothing else into the product floor's allowlist",
    );
  }
  const server = asRecord(servers[DOOR_MCP_SERVER_NAME]);
  if (!server) {
    throw new Error(`the door plugin's .mcp.json declares a non-object "${DOOR_MCP_SERVER_NAME}" server`);
  }
  if (server.command !== "node") {
    throw new Error(
      `the door's "${DOOR_MCP_SERVER_NAME}" server must run on plain node — no npx, no external binary ` +
        `(got ${JSON.stringify(server.command)})`,
    );
  }
  const args = server.args;
  if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== "string") {
    throw new Error(
      `the door's "${DOOR_MCP_SERVER_NAME}" server must declare exactly one argv entry, the bundled ` +
        `${BUNDLE_RELATIVE} path (got ${JSON.stringify(args)})`,
    );
  }
  const expectedArg = `${PLUGIN_ROOT_PLACEHOLDER}/${BUNDLE_RELATIVE.split("\\").join("/")}`;
  if (args[0] !== expectedArg) {
    const placeholder = /\$\{([^}]*)\}/u.exec(args[0]);
    if (placeholder && placeholder[1] !== "CLAUDE_PLUGIN_ROOT") {
      throw new Error(
        `the door's "${DOOR_MCP_SERVER_NAME}" argv uses an unknown placeholder: ${JSON.stringify(args[0])} — ` +
          `only ${PLUGIN_ROOT_PLACEHOLDER} is supported`,
      );
    }
    throw new Error(
      `the door's "${DOOR_MCP_SERVER_NAME}" server must point at its own bundle ` +
        `(${JSON.stringify(expectedArg)}), got ${JSON.stringify(args[0])}`,
    );
  }

  const env = asRecord(server.env) ?? {};
  const envKeys = Object.keys(env);
  if (envKeys.some((k) => k !== SKILL_SOURCE_ENV_KEY)) {
    throw new Error(
      `the door's "${DOOR_MCP_SERVER_NAME}" server may carry only ${SKILL_SOURCE_ENV_KEY} (got ${envKeys.join(", ")})`,
    );
  }
  const declaredSource = env[SKILL_SOURCE_ENV_KEY];
  if (declaredSource !== SKILL_URL_PLACEHOLDER) {
    throw new Error(
      `the door's "${DOOR_MCP_SERVER_NAME}" ${SKILL_SOURCE_ENV_KEY} must be the ` +
        `${SKILL_URL_PLACEHOLDER} placeholder so the door resolves it explicitly (got ${JSON.stringify(declaredSource)})`,
    );
  }

  const bundlePath = resolve(pluginDir, BUNDLE_RELATIVE);
  if (!existsSync(bundlePath)) {
    throw new Error(
      `the door plugin does not ship its summon server bundle at ${bundlePath} — refusing to admit an MCP ` +
        "server that cannot start (a silently doorless product floor is the #143 failure)",
    );
  }

  // The plugin manifest is part of the plugin contract and is always read, but
  // its DEFAULT is only load-bearing when the caller supplied no override:
  // precedence is explicit source first, manifest default second. A BLANK
  // override counts as absent (an empty environment variable is "unset", not a
  // malformed URL — `SKILL_SOURCE= claude-zero` must still launch). Nothing
  // else (ambient settings, an installed-plugin preference file) is consulted.
  const manifest = readJsonFile(join(pluginDir, ".claude-plugin", "plugin.json"), ".claude-plugin/plugin.json");
  const explicit = options.skillSource?.trim();
  let skillSource: string;
  if (explicit) {
    skillSource = assertSkillSourceUrl(explicit);
  } else {
    const userConfig = asRecord(manifest.userConfig);
    const skillUrl = asRecord(userConfig?.skill_url);
    const fallback = skillUrl?.default;
    if (typeof fallback !== "string" || fallback.trim() === "") {
      throw new Error(
        "the door plugin's .claude-plugin/plugin.json declares no userConfig.skill_url.default to fall back on — " +
          "pass an explicit SKILL_SOURCE or fix the manifest (the door will not invent a source)",
      );
    }
    skillSource = assertSkillSourceUrl(fallback);
  }

  const resolved: DoorMcpServer = {
    type: "stdio",
    command: "node",
    // ONE argv element, always: a path with spaces stays one argument because
    // this is an argv array, never a shell string.
    args: [bundlePath],
    env: { [SKILL_SOURCE_ENV_KEY]: skillSource },
  };
  return { mcpServers: { [DOOR_MCP_SERVER_NAME]: resolved } };
}