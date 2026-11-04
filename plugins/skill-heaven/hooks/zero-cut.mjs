// Claude Code PreToolUse hook — makes the configured `zero_cuts = all` a real cut.
//
// Recovered from #124 (hook 3) under #123. Without it, `all` is a refusal the
// /summon renderer prints while the summon TOOL itself stays callable; this hook
// closes that gap at the tool boundary.
//
// What this hook reads, and nothing else:
//   - the configured cut: CLAUDE_PLUGIN_OPTION_ZERO_CUTS (Claude Code exports
//     userConfig values to hook processes), then SKILL_HEAVEN_ZERO_CUTS — the
//     same contract and the same function as scripts/render-ladder.mjs.
//   - `tool_name` from the hook payload on stdin.
//
// What it deliberately does NOT do:
//   - It keeps no session state and resolves no rung. Rung commands are
//     stateless reference renderers (#91, docs/CONTROL-PLANE.md §7). The stored
//     form of `/skill-zero all` IS the zero_cuts setting (founder ruling,
//     2026-11-04); that setting is what this hook reads. Typing the command
//     writes nothing.
//   - It writes nothing, anywhere — not even under ${CLAUDE_PLUGIN_DATA}.
//   - It never answers "allow". When the cut is inactive it exits 0 with no
//     output, so a user or project hook that wants to deny still can.
//   - It injects no context. The only text it emits is the refusal reason, on
//     stderr, and only when it refuses.
//
// Exit codes (Claude Code hook contract): 0 = no decision; 2 = block the tool
// call, with stderr shown to the model as the reason.
//
// ZERO DEPENDENCIES: a marketplace install has no node_modules beside it.

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { zeroCuts } from "../scripts/render-ladder.mjs";

/** The summon tool under every name Claude Code can expose it by:
 * - installed from the marketplace (plugin-declared MCP server, namespaced by
 *   the plugin name), and
 * - the claude-zero launcher's product floor, which admits the bundled server
 *   as a plain `--mcp-config` entry named `skill-summon` (#143).
 * Kept exact on purpose: the hooks.json matcher narrows dispatch, and this list
 * is the second check, so a broad or mis-parsed matcher can never turn this
 * hook against an unrelated tool. */
export const SUMMON_TOOL_NAMES = Object.freeze([
  "mcp__plugin_skill-heaven_skill-summon__summon",
  "mcp__skill-summon__summon",
]);

export const REFUSAL =
  "Skill Heaven: this summon was blocked because the plugin is configured with zero_cuts = all, " +
  "which cuts every skill summon, including manual /summon. Nothing was summoned. " +
  "The user can restore summoning by setting zero_cuts back to temporary " +
  "(the plugin setting, or SKILL_HEAVEN_ZERO_CUTS for a claude-zero launch). " +
  "Do not work around the cut by fetching the skill another way.";

/** @param {unknown} payload @param {NodeJS.ProcessEnv} [env]
 * @returns {{ block: boolean, reason: string }} */
export function decide(payload, env = process.env) {
  if (zeroCuts(env) !== "all") return { block: false, reason: "" };
  const toolName = payload && typeof payload === "object" ? /** @type {any} */ (payload).tool_name : undefined;
  if (typeof toolName !== "string") {
    // Dispatched by the summon matcher but the payload is unreadable. The user
    // configured every summon cut, so fail closed rather than let it through.
    return { block: true, reason: REFUSAL };
  }
  if (!SUMMON_TOOL_NAMES.includes(toolName)) return { block: false, reason: "" };
  return { block: true, reason: REFUSAL };
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  // Cheapest path first: with the cut inactive, stdin is never parsed.
  if (zeroCuts(process.env) !== "all") process.exit(0);
  const { block, reason } = decide(readPayload());
  if (!block) process.exit(0);
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
