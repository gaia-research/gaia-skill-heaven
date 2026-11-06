// Skill Heaven console: the optional SessionStart context line (#123).
//
// Facts only. It states what the console knows at session start and nothing
// else. It does not summon, grant, select or persist a rung, and it writes
// nothing: it prints one JSON object on stdout and exits 0. Off by default
// (userConfig `session_context`); the Core plugin has no hook at all.

import { fileURLToPath } from "node:url";

/** The whole standing dose. Facts about this session, no instruction. */
export const SESSION_CONTEXT_TEXT =
  "Skill Heaven console is on for this session (preview). No rung has been selected in this session yet. " +
  "With the skill-heaven plugin installed, /summon adds one skill to this session; nothing is installed.";

/** Sources that begin a conversation. A resume or a compaction already carries the line. */
export const CONTEXT_SOURCES = ["startup", "clear"];

/**
 * @param {string | undefined} option CLAUDE_PLUGIN_OPTION_SESSION_CONTEXT
 * @param {string | undefined} source SessionStart `source` from the hook input
 * @returns {string} the stdout payload ("" = emit nothing)
 */
export function sessionContextOutput(option, source) {
  if (option !== "on") return "";
  if (source !== undefined && !CONTEXT_SOURCES.includes(source)) return "";
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT_TEXT },
  });
}

async function readSource() {
  let raw = "";
  try {
    for await (const chunk of process.stdin) raw += chunk;
    const parsed = JSON.parse(raw);
    return typeof parsed?.source === "string" ? parsed.source : undefined;
  } catch {
    return undefined;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = sessionContextOutput(process.env.CLAUDE_PLUGIN_OPTION_SESSION_CONTEXT, await readSource());
  if (out) process.stdout.write(out + "\n");
}
