// Shared state for the plugin's hooks.
//
// P3 — NEVER MUTATE SHARED STATE. Everything here writes under the plugin's own
// data directory (`${CLAUDE_PLUGIN_DATA}`, exported by the harness when the
// plugin is enabled). Nothing in this file may write to `~/.claude`, the user's
// settings, the user's skills, or the project tree. If the data directory is
// unavailable we degrade to a temp dir, and if that fails we degrade to doing
// nothing — a hook that cannot record must never break the session.
//
// ZERO DEPENDENCIES BY NECESSITY: a marketplace install has no node_modules
// beside it, so this runs on plain Node with only `node:` builtins.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const STATE_SCHEMA = "skill-heaven/session-state@1";
export const RECEIPT_SCHEMA = "skill-heaven/summon-receipt@1";

/** Every rung on the one line, floor first. Kept in sync with data/ladder.json;
 * the band lookup below is the only thing hooks need from it. */
const BAND_BY_RUNG = {
  zero: "zero",
  low: "heaven",
  med: "heaven",
  high: "hell",
  xhigh: "hell",
  max: "hell",
  ultra: "ultra",
};

/** @param {string} rung */
export function bandForRung(rung) {
  return BAND_BY_RUNG[rung] ?? null;
}

export function knownRungs() {
  return Object.keys(BAND_BY_RUNG);
}

/** The plugin's own writable directory. Never the user's config.
 * @param {NodeJS.ProcessEnv} [env] @returns {string | null} */
export function dataDir(env = process.env) {
  const configured = (env.CLAUDE_PLUGIN_DATA ?? env.SKILL_HEAVEN_DATA ?? "").trim();
  const dir = configured || join(tmpdir(), "skill-heaven-data");
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** Session ids come from the harness on stdin. Constrain them before they reach
 * a path: a hostile id must not be able to escape the data directory.
 * @param {unknown} raw @returns {string | null} */
export function normalizeSessionId(raw) {
  const value = String(raw ?? "").trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

/** @param {string} sessionId @param {NodeJS.ProcessEnv} [env] */
export function sessionPath(sessionId, env = process.env) {
  const dir = dataDir(env);
  const id = normalizeSessionId(sessionId);
  if (!dir || !id) return null;
  try {
    mkdirSync(join(dir, "sessions"), { recursive: true });
  } catch {
    return null;
  }
  return join(dir, "sessions", `${id}.json`);
}

/** @typedef {object} SessionState
 * @property {string} schema
 * @property {string} sessionId
 * @property {string} rung
 * @property {string} source  how the rung was determined
 * @property {number} summons
 * @property {string[]} carry  skills summoned this session, for compaction carry-over
 * @property {string} updatedAt */

/** @param {string} sessionId @param {NodeJS.ProcessEnv} [env] @returns {SessionState | null} */
export function readSession(sessionId, env = process.env) {
  const path = sessionPath(sessionId, env);
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.schema !== STATE_SCHEMA || typeof value?.rung !== "string") return null;
    return {
      schema: STATE_SCHEMA,
      sessionId: value.sessionId ?? sessionId,
      rung: bandForRung(value.rung) ? value.rung : "zero",
      source: typeof value.source === "string" ? value.source : "unknown",
      summons: Number.isInteger(value.summons) ? value.summons : 0,
      carry: Array.isArray(value.carry) ? value.carry.filter((s) => typeof s === "string").slice(0, 32) : [],
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return null;
  }
}

/** Best-effort persist. A failure is silent by design: no hook may break a
 * session because a disk write did not land.
 * @param {string} sessionId @param {Partial<SessionState>} patch @param {NodeJS.ProcessEnv} [env]
 * @returns {SessionState | null} */
export function writeSession(sessionId, patch, env = process.env) {
  const path = sessionPath(sessionId, env);
  if (!path) return null;
  const current = readSession(sessionId, env);
  /** @type {SessionState} */
  const next = {
    schema: STATE_SCHEMA,
    sessionId,
    rung: patch.rung ?? current?.rung ?? "zero",
    source: patch.source ?? current?.source ?? "default",
    summons: patch.summons ?? current?.summons ?? 0,
    carry: (patch.carry ?? current?.carry ?? []).slice(-32),
    updatedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  } catch {
    return null;
  }
}

/** @param {string} sessionId @param {NodeJS.ProcessEnv} [env] */
export function clearSession(sessionId, env = process.env) {
  const path = sessionPath(sessionId, env);
  if (!path) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // Best effort.
  }
}

/** Resolve the armed rung, most specific source first. This is the one place
 * that decides where a session sits on the line.
 * @param {string | null} sessionId @param {NodeJS.ProcessEnv} [env]
 * @returns {{ rung: string, source: string }} */
export function resolveRung(sessionId, env = process.env) {
  const forced = String(env.SKILL_HEAVEN_RUNG ?? "").trim().toLowerCase();
  if (bandForRung(forced)) return { rung: forced, source: "env" };

  if (sessionId) {
    const state = readSession(sessionId, env);
    if (state && bandForRung(state.rung)) return { rung: state.rung, source: state.source };
  }

  // The claude-zero launcher writes a boot manifest; its posture maps onto the
  // low end of the line. Absent one, a session sits at the floor.
  const manifestPath = String(env.CLAUDE_ZERO_PROFILE ?? "").trim();
  if (manifestPath) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest?.schema === "claude-zero/profile@1") {
        const byPosture = { "product-floor": "zero", curated: "low", native: "med" };
        const rung = byPosture[manifest.posture];
        if (rung) return { rung, source: "launcher" };
      }
    } catch {
      // Fall through to the floor.
    }
  }

  return { rung: "zero", source: "default" };
}

/** What Skill Zero cuts. Mirrors `zeroCuts` in scripts/render-ladder.mjs — the
 * hooks cannot import from there without coupling the two entry points, and
 * this must keep working if the renderer is absent.
 * @param {NodeJS.ProcessEnv} [env] @returns {"temporary" | "all"} */
export function zeroCuts(env = process.env) {
  const raw = (env.CLAUDE_PLUGIN_OPTION_ZERO_CUTS ?? env.SKILL_HEAVEN_ZERO_CUTS ?? "").trim().toLowerCase();
  return raw === "all" ? "all" : "temporary";
}

/** Automatic, gap-driven summoning. OFF unless the user turns it on: it is the
 * research surface, and until #85 is resolved nothing it emits may carry remote
 * catalogue text. @param {NodeJS.ProcessEnv} [env] */
export function autoSummonEnabled(env = process.env) {
  const raw = (env.CLAUDE_PLUGIN_OPTION_AUTO_SUMMON ?? env.SKILL_HEAVEN_AUTO_SUMMON ?? "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1";
}

/** Append one observed receipt. Records shape and provenance, never the user's
 * text: a query is recorded as its length and a truncated digest so the ledger
 * can be correlated without carrying prompt content.
 * @param {object} receipt @param {NodeJS.ProcessEnv} [env] */
export function appendReceipt(receipt, env = process.env) {
  const dir = dataDir(env);
  if (!dir) return null;
  const line = JSON.stringify({ schema: RECEIPT_SCHEMA, ...receipt });
  try {
    appendFileSync(join(dir, "receipts.jsonl"), `${line}\n`);
    return line;
  } catch {
    return null;
  }
}

/** @param {unknown} value */
export function digest(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Read the hook payload the harness writes to stdin. Returns `{}` on anything
 * unparseable so a malformed payload degrades to a no-op rather than a crash. */
export function readPayload() {
  try {
    const raw = readFileSync(0, "utf8");
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** Emit a hook result and exit. @param {object} output @param {number} [code] */
export function emit(output, code = 0) {
  try {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // Nothing useful to do if stdout is gone.
  }
  process.exit(code);
}
