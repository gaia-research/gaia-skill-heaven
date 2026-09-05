// Hook 5 — PreCompact.
//
// Compaction discards the session's summoned cards along with everything else,
// which loses the entropy reading: after a compact the session is at a rung it
// can no longer account for. PreCompact does not support additionalContext, so
// this hook writes a durable carry-over snapshot instead, and the next
// UserPromptSubmit re-injects it once (see user-prompt-submit.mjs).
//
// Degraded state: cards are lost on compact, as today.

import { dataDir, emit, normalizeSessionId, readPayload, readSession, resolveRung } from "./session-state.mjs";
import { realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export const CARRY_SCHEMA = "skill-heaven/carry-over@1";

/** @param {string} sessionId */
export function carryPath(sessionId, env = process.env) {
  const dir = dataDir(env);
  const id = normalizeSessionId(sessionId);
  return dir && id ? join(dir, "sessions", `${id}.carry.json`) : null;
}

export function buildCarry(state, rung, source) {
  return {
    schema: CARRY_SCHEMA,
    ts: new Date().toISOString(),
    rung,
    rungSource: source,
    summons: state?.summons ?? 0,
    skills: state?.carry ?? [],
  };
}

function main() {
  const payload = readPayload();
  const sessionId = normalizeSessionId(payload.session_id);
  if (!sessionId) emit({});
  const { rung, source } = resolveRung(sessionId);
  const path = carryPath(sessionId);
  if (path) {
    try {
      writeFileSync(path, `${JSON.stringify(buildCarry(readSession(sessionId), rung, source), null, 2)}\n`);
    } catch {
      // Best effort — a failed snapshot must not block a compaction.
    }
  }
  emit({});
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
