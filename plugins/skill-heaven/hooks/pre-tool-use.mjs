// Hook 3 — PreToolUse on the summon tool.
//
// Makes `zero_cuts: all` an actual refusal. Today it is a documented posture the
// model is asked to respect; a posture the runtime cannot enforce is a promise,
// not a cut. Exit 2 blocks the call and the reason is shown to the model.
//
// Degraded state: the posture stays advisory, exactly as before.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { emit, normalizeSessionId, readPayload, resolveRung, zeroCuts } from "./session-state.mjs";

/** @returns {{ deny: boolean, reason: string }} */
export function decide(env = process.env) {
  if (zeroCuts(env) !== "all") {
    return { deny: false, reason: "" };
  }
  return {
    deny: true,
    reason:
      "Skill Zero is configured with zero_cuts = all: every skill summon is cut for this session, including manual /summon. Change it in the plugin's settings (zero_cuts: temporary) to restore the manual call. Do not work around this by fetching the skill another way.",
  };
}

function main() {
  const payload = readPayload();
  const { deny, reason } = decide();
  if (!deny) {
    // Say nothing. An allow decision here would override a user or project hook
    // that wanted to deny, and this hook has no standing to do that.
    process.exit(0);
  }
  const sessionId = normalizeSessionId(payload.session_id);
  const { rung } = resolveRung(sessionId);
  emit(
    {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
      systemMessage: `Skill Heaven: summon blocked at rung ${rung} (zero_cuts = all).`,
    },
    2,
  );
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
