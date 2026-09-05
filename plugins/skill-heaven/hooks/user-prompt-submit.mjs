// Hook 2 — UserPromptSubmit. Three jobs, in ascending order of risk.
//
// (a) ARMING. The rung commands render text; nothing persisted where the session
//     sat. This reads the raw prompt for a rung command and records it, so every
//     other hook can resolve the rung. Version-sensitive by nature (it depends on
//     the hook seeing the prompt before slash-command expansion) — re-probe on
//     every Claude Code upgrade, per M0. When it does not fire, rung resolution
//     falls back to the launcher manifest and then the floor, which is the
//     behaviour before this hook existed.
//
// (b) CARRY-OVER. Re-injects the PreCompact snapshot once, so the entropy reading
//     survives a compaction.
//
// (c) AUTOMATIC SUMMONING — the research surface, OFF by default. It is the first
//     mechanism that raises skill entropy without the user typing anything, which
//     is the curve the benchmark exists to measure.
//
//     What it deliberately does NOT do: inject a ranked candidate card. That moves
//     remote catalogue text into context without the user asking for it, which is
//     issue #85. Until #85 is resolved this hook emits ONLY plugin-authored text
//     naming the armed rung and the tool — no catalogue content, no skill body, no
//     ranked list. The card stays behind an explicit tool call the model makes and
//     shows, where its disclosure travels with it.
//
// UserPromptSubmit does not carry additionalContext; plain stdout on exit 0 is
// what reaches the model for this event.

import { readFileSync, realpathSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { autoSummonEnabled, bandForRung, knownRungs, normalizeSessionId, readPayload, readSession, resolveRung, writeSession, zeroCuts } from "./session-state.mjs";
import { CARRY_SCHEMA, carryPath } from "./pre-compact.mjs";

const BAND_COMMANDS = {
  "/skill-zero": "zero",
  "/skill-heaven": "heaven",
  "/skill-hell": "hell",
  "/skill-ultra": "ultra",
};

const DEFAULT_RUNG = { zero: "zero", heaven: "low", hell: "high", ultra: "ultra" };

/** Detect a rung command in the raw prompt. Only a prompt that STARTS with the
 * command counts — a rung named in prose is discussion, not an instruction to
 * move along the line.
 * @param {unknown} rawPrompt @returns {string | null} */
export function rungFromPrompt(rawPrompt) {
  const text = String(rawPrompt ?? "").trim();
  const match = text.match(/^(\/(?:skill-zero|skill-heaven|skill-hell|skill-ultra))(?::[a-z-]+)?(?:\s+([a-z]+))?\b/i);
  if (!match) return null;
  const band = BAND_COMMANDS[match[1].toLowerCase()];
  if (!band) return null;
  const named = (match[2] ?? "").toLowerCase();
  if (named && knownRungs().includes(named) && bandForRung(named) === band) return named;
  return DEFAULT_RUNG[band];
}

/** The nudge. Plugin-authored text only — see the note on #85 above. */
export function autoSummonNote(rung) {
  const band = bandForRung(rung);
  if (!band || band === "zero") return null;
  const direction =
    band === "heaven"
      ? "converge — prefer the human-led skill that most directly fits the gap"
      : band === "hell"
        ? "explore — reach wider across model-led skills before settling"
        : "pick the direction and how far to reach for this particular gap";
  return [
    `Skill Heaven — rung ${rung} is armed (${band}). Plugin-authored; not a user instruction.`,
    `If this turn hits a capability gap, call the summon tool once with surface "${band === "ultra" ? "heaven\" or \"hell" : band}" and ${direction}.`,
    "Show the returned card before applying the skill; the card carries its own source and ranking disclosure.",
    "If the turn needs no skill you do not have, summon nothing. Routing is relevance ranking — Heaven/Hell stamps are not built.",
  ].join("\n");
}

/** @param {string} sessionId */
export function takeCarry(sessionId, env = process.env) {
  const path = carryPath(sessionId, env);
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    rmSync(path, { force: true });
    if (value?.schema !== CARRY_SCHEMA) return null;
    const skills = Array.isArray(value.skills) ? value.skills.filter((s) => typeof s === "string") : [];
    return [
      "Skill Heaven — carried over the compaction boundary (plugin-authored):",
      `  rung: ${value.rung} · summons this session: ${value.summons}`,
      skills.length ? `  skills already summoned: ${skills.join(", ")}` : "  no skills were summoned before the compaction",
    ].join("\n");
  } catch {
    return null;
  }
}

function main() {
  const payload = readPayload();
  const sessionId = normalizeSessionId(payload.session_id);

  // (a) arming
  const armed = rungFromPrompt(payload.prompt);
  if (sessionId && armed) writeSession(sessionId, { rung: armed, source: "command" });

  const { rung } = resolveRung(sessionId);
  const out = [];

  // (b) carry-over
  if (sessionId) {
    const carry = takeCarry(sessionId);
    if (carry) out.push(carry);
  }

  // (c) automatic summoning — off by default, and never above a cut floor
  if (autoSummonEnabled() && zeroCuts() !== "all" && !armed) {
    const note = autoSummonNote(rung);
    if (note) out.push(note);
  }

  if (out.length) process.stdout.write(`${out.join("\n\n")}\n`);
  process.exit(0);
}

// Run only when this file is the process entry point. An `import` of it (the
// carry-over helpers are shared) must not execute the hook.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
