// Hook 4 — PostToolUse on the summon tool.
//
// Writes an OBSERVED receipt: the harness saw this call happen. That is the
// point — `gaia-research/skill-cost` is the canonical basis for every cost
// measure precisely because self-reported counts are not evidence. A receipt
// records shape and provenance only: the query is reduced to a length and a
// truncated digest so the ledger correlates without carrying prompt content.
//
// Degraded state: no receipts. Nothing else changes.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { appendReceipt, digest, emit, normalizeSessionId, readPayload, readSession, resolveRung, writeSession } from "./session-state.mjs";

/** Pull the summoned skill's identity out of a tool response without depending
 * on its full shape — the card format is still moving.
 * @param {unknown} response */
export function skillRefFrom(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [response.skill, response.name, response.id, response.path, response.slug];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }
  const content = Array.isArray(response.content) ? response.content : [];
  for (const part of content) {
    if (part && typeof part.text === "string") {
      const match = part.text.match(/^\s*(?:skill|name)\s*[::]\s*(.+)$/im);
      if (match) return match[1].trim().slice(0, 200);
    }
  }
  return null;
}

/** @param {Record<string, unknown>} payload */
export function buildReceipt(payload, rung, source) {
  const input = payload.tool_input ?? {};
  const query = typeof input.query === "string" ? input.query : "";
  const skill = skillRefFrom(payload.tool_response);
  return {
    ts: new Date().toISOString(),
    sessionId: normalizeSessionId(payload.session_id) ?? "unknown",
    tool: typeof payload.tool_name === "string" ? payload.tool_name : "unknown",
    rung,
    rungSource: source,
    surface: typeof input.surface === "string" ? input.surface : null,
    queryChars: query.length,
    queryDigest: query ? digest(query) : null,
    skill,
    // Routing is relevance ranking. Recorded explicitly so a reader of this
    // ledger never mistakes a receipt for evidence of stamped routing.
    routing: "relevance",
  };
}

function main() {
  const payload = readPayload();
  const sessionId = normalizeSessionId(payload.session_id);
  const { rung, source } = resolveRung(sessionId);
  const receipt = buildReceipt(payload, rung, source);
  appendReceipt(receipt);
  if (sessionId) {
    const state = readSession(sessionId);
    const carry = state?.carry ?? [];
    writeSession(sessionId, {
      rung,
      source,
      summons: (state?.summons ?? 0) + 1,
      carry: receipt.skill ? [...carry, receipt.skill] : carry,
    });
  }
  // PostToolUse cannot block, and this hook has nothing to say to the model.
  emit({});
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
