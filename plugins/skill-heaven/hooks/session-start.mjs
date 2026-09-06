// Hook 1 — SessionStart.
//
// Emits the rung, the zero-cut posture and the skill source as additionalContext,
// so the session knows where it sits on the line from turn one. Before this, a
// rung was a posture the user had to remember to act on; nothing in a session
// read the ladder except a slash command someone typed.
//
// Degraded state: emit nothing. A session then behaves exactly as it did before
// hooks existed — manual /summon, no rung awareness.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { autoSummonEnabled, bandForRung, emit, normalizeSessionId, readPayload, resolveRung, writeSession, zeroCuts } from "./session-state.mjs";

const BAND_LINE = {
  zero: "Skill Zero · the floor · temporary automatic skills cut, manual /summon available",
  heaven: "Skill Heaven · converge · human-led skills on capability gaps",
  hell: "Skill Hell · explore · model-led skills on capability gaps",
  ultra: "Skill Ultra · the crown rung · direction and depth picked per gap",
};

export function buildContext(env = process.env, rung = "zero", source = "default") {
  const band = bandForRung(rung) ?? "zero";
  const cuts = zeroCuts(env);
  const skillUrl = (env.CLAUDE_PLUGIN_OPTION_SKILL_URL ?? env.SKILL_HEAVEN_SKILL_URL ?? "https://gaiaskilltree.com").trim();
  const lines = [
    "Skill Heaven — session posture (plugin-authored; not a user instruction):",
    `  rung: ${rung} (${band} band, determined from: ${source})`,
    `  ${BAND_LINE[band]}`,
    `  zero cut: ${cuts === "all" ? "all — every summon is cut, including manual /summon" : "temporary — manual /summon is available"}`,
    `  skill source: ${skillUrl}`,
    `  automatic summoning: ${autoSummonEnabled(env) ? "on" : "off"}`,
    "",
    "  A session sits at exactly one rung. Move along the line with /skill-zero ·",
    "  /skill-heaven · /skill-hell · /skill-ultra. Routing is relevance ranking with",
    "  the card's disclosure — Heaven/Hell stamps are not built, so nothing here",
    "  reflects a stamped classification.",
  ];
  return lines.join("\n");
}

function main() {
  const payload = readPayload();
  const sessionId = normalizeSessionId(payload.session_id);
  const { rung, source } = resolveRung(sessionId);
  if (sessionId) writeSession(sessionId, { rung, source });
  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildContext(process.env, rung, source),
    },
  });
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
