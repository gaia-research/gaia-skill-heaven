// Hook 6 — SessionEnd.
//
// Flushes one session-level line to the ledger so a run can be priced without
// re-reading every receipt, then drops the per-session state. The receipts
// themselves are durable; this is the roll-up beside them.
//
// Degraded state: nothing flushed. Receipts still exist.

import { appendReceipt, clearSession, emit, normalizeSessionId, readPayload, readSession, resolveRung } from "./session-state.mjs";
import { carryPath } from "./pre-compact.mjs";
import { realpathSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

function main() {
  const payload = readPayload();
  const sessionId = normalizeSessionId(payload.session_id);
  if (!sessionId) emit({});
  const state = readSession(sessionId);
  const { rung, source } = resolveRung(sessionId);
  appendReceipt({
    kind: "session-end",
    ts: new Date().toISOString(),
    sessionId,
    rung,
    rungSource: source,
    summons: state?.summons ?? 0,
    skills: state?.carry ?? [],
    reason: typeof payload.reason === "string" ? payload.reason : null,
  });
  const carry = carryPath(sessionId);
  if (carry) {
    try {
      rmSync(carry, { force: true });
    } catch {
      // Best effort.
    }
  }
  clearSession(sessionId);
  emit({});
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
