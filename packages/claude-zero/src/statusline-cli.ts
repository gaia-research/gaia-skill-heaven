// IO entry for the statusline segment. Claude Code pipes its statusline JSON on
// stdin and renders our stdout (matrix gate (b), GB-1). We read the launched
// profile manifest from $CLAUDE_ZERO_PROFILE (written by the launcher), the
// summon session from $SKILL_SUMMON_SESSION (session.json + summon-log.jsonl,
// read-only), the live context-window usage from stdin, and the mode and width
// from $SKILL_HEAVEN_STATUS and $COLUMNS. Never throws: a broken manifest or
// empty stdin degrades to a minimal/no segment rather than breaking the prompt.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveColorDepth, skillsFromSessionManifest, type ColorDepth, type StatusMode } from "@gaia-skill-heaven/status";
import {
  isHellSessionManifest,
  isProfileManifest,
  parseStatuslineInput,
  renderStatusline,
  type ProfileManifest,
  type SummonSessionFacts,
} from "./statusline.js";

const PROFILE_ENV = "CLAUDE_ZERO_PROFILE";
const SUMMON_SESSION_ENV = "SKILL_SUMMON_SESSION";
const STATUS_MODE_ENV = "SKILL_HEAVEN_STATUS";
const HELL_MANIFEST_FILE = "session.json";
const SUMMON_LOG_FILE = "summon-log.jsonl";
/** The summon log is only counted up to this size. Beyond it the count is
 * unknown (rendered `? summons`), never a partial count presented as exact. */
const SUMMON_LOG_CAP_BYTES = 1024 * 1024;

function loadManifest(path: string | undefined): ProfileManifest | null {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return isProfileManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type FileRead = { text: string } | "missing" | "unreadable" | "too-large";

/** Reads a whole file, or says why it cannot be read. Never throws. */
function readFileOrReason(path: string, maxBytes?: number): FileRead {
  try {
    if (maxBytes !== undefined && statSync(path).size > maxBytes) return "too-large";
    return { text: readFileSync(path, "utf-8") };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable";
  }
}

function countLines(text: string): number {
  return text.split("\n").filter((line) => line.trim() !== "").length;
}

// Reads the summon engine's own files directly off disk — no subprocess, no
// network (the statusline runs on every prompt render, so this must stay
// cheap), and no session is ever created here: unlike the engine's own session
// resolution, resolveSession() would materialize a fresh session root as a side
// effect of merely asking, which a passive statusline read must never do.
//
// Skills (§2.2): with SKILL_SUMMON_SESSION set but no session.json yet, nothing
// has been materialized, so 0. Unset, or a session.json that is unreadable or
// malformed, is unknown (`? skills`).
//
// Summons: the count of summon-log.jsonl lines (one per summon call recorded in
// this session root). A missing log is 0 only when no skill was materialized
// either; otherwise, and when the log is unreadable or over the size cap, the
// count is unknown.
function loadSummonSession(root: string | undefined): SummonSessionFacts {
  if (!root) return { skills: null, summons: null, lastArrival: null };

  let skills: number | null = null;
  let lastArrival: string | null = null;
  const manifest = readFileOrReason(join(root, HELL_MANIFEST_FILE));
  if (manifest === "missing") {
    skills = 0;
  } else if (typeof manifest === "object") {
    try {
      const parsed: unknown = JSON.parse(manifest.text);
      if (isHellSessionManifest(parsed)) {
        const facts = skillsFromSessionManifest(parsed);
        skills = facts.skills;
        lastArrival = facts.last;
      }
    } catch {
      // malformed session.json: skills stays unknown
    }
  }

  const log = readFileOrReason(join(root, SUMMON_LOG_FILE), SUMMON_LOG_CAP_BYTES);
  let summons: number | null = null;
  if (typeof log === "object") summons = countLines(log.text);
  else if (log === "missing" && skills === 0) summons = 0;

  return { skills, summons, lastArrival };
}

function readStdin(): string {
  // Claude Code writes-then-closes stdin before invoking the statusline command
  // (matrix gate (b), GB-1), so a blocking read is safe there. Guard the other
  // cases: an interactive TTY (manual testing, a future interactive invocation)
  // would never close fd 0 and a synchronous read would hang the render tick.
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf-8"); // fd 0; empty string if nothing piped
  } catch {
    return "";
  }
}

/** SKILL_HEAVEN_STATUS=off|compact|full. Unset or unrecognized is compact. */
function statusModeFrom(raw: string | undefined): StatusMode {
  const value = raw?.trim().toLowerCase();
  return value === "off" || value === "full" ? value : "compact";
}

/** A positive integer COLUMNS is the width budget; anything else is no budget. */
function columnsFrom(raw: string | undefined): number | undefined {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

/** Claude Code pipes the statusline and renders ANSI, so stdout is not a TTY by
 * design. Colour is therefore on unless NO_COLOR (or a dumb TERM) turns it off. */
function colorDepthFrom(env: NodeJS.ProcessEnv): ColorDepth {
  return resolveColorDepth({ ...env, FORCE_COLOR: env.FORCE_COLOR ?? "1" }, false);
}

export function main(): void {
  try {
    const mode = statusModeFrom(process.env[STATUS_MODE_ENV]);
    // The user owns whether the HUD exists: `off` prints nothing at all.
    if (mode === "off") return;
    const manifest = loadManifest(process.env[PROFILE_ENV]);
    // No manifest → we are not inside a claude-zero launch (or it is malformed).
    // Emit nothing so a mis-wired statusline is silent, not noisy/misleading.
    if (!manifest) return;
    const input = parseStatuslineInput(readStdin());
    const session = loadSummonSession(process.env[SUMMON_SESSION_ENV]);
    const line = renderStatusline(manifest, input, session, {
      mode,
      columns: columnsFrom(process.env.COLUMNS),
      colorDepth: colorDepthFrom(process.env),
    });
    process.stdout.write(line);
  } catch {
    // Never break the user's prompt: any unexpected failure is a silent segment.
  }
}

main();
