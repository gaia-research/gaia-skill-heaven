// The /skill-hell renderer. Shells out to the skill-hell summon engine
// (resolved by resolve-hell.mjs) for the user's intent, then prints the
// minimal header the founder asked for — which skill was summoned, nothing
// more — followed by the skill's real SKILL.md body, so the skill is
// genuinely in context for the rest of this session with no restart.
//
// ZERO DEPENDENCIES, same reason as resolve-hell.mjs and render-posture.mjs.
//
// Founder requirement: /skill-hell works whether or not claude-heaven or
// pi-heaven launched the session. This file never reads a door's launch
// manifest or session directory — only the engine's own --json output.
//
// Always exits 0: this is a display surface invoked from a slash command,
// and a non-zero exit risks the harness dropping the very text that carries
// an honest failure message (mirrors render-posture.mjs's main()).

import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HellEngineNotFoundError, resolveHellEngine } from "./resolve-hell.mjs";

const LABEL_WIDTH = 8;
const PREFIX_WIDTH = 2 + LABEL_WIDTH + 2; // matches skill-hell's own printSkillLine gutter
const SUMMON_TIMEOUT_MS = 30_000;

/** @param {number | undefined} value */
function formatTrustMagnitude(value) {
  return typeof value === "number" ? value.toFixed(1) : "n/a";
}

/**
 * `winner.path` is the materialized skill DIRECTORY, not a file. Summon has
 * install parity with `gaia install`: it clones the source repo and brings down
 * the whole skill dir (SKILL.md plus reference/, scripts/, fixtures). Read
 * SKILL.md from inside it — never read the path itself.
 *
 * @param {{ id: string, level: string, trustMagnitude?: number, path: string,
 *           fileCount?: number, cache?: string, totalSeconds?: number }} winner
 */
function renderHeader(winner) {
  const head = `  ${"summoned".padEnd(LABEL_WIDTH)}  ${winner.id}  ${winner.level}  TM ${formatTrustMagnitude(winner.trustMagnitude)}${renderCost(winner)}`;
  const pointer = `${" ".repeat(PREFIX_WIDTH)}-> ${winner.path}${renderFileCount(winner)}`;
  return `${head}\n${pointer}`;
}

/**
 * Install time plus whether the repo cache was cold or warm. The two differ by
 * roughly an order of magnitude, so a timing shown without its cache state
 * cannot be interpreted — never print one without the other.
 *
 * @param {{ cache?: string, totalSeconds?: number }} winner
 */
function renderCost(winner) {
  const parts = [];
  if (typeof winner.totalSeconds === "number") parts.push(`${winner.totalSeconds.toFixed(2)}s`);
  if (winner.cache) parts.push(winner.cache);
  return parts.length ? `  (${parts.join(", ")})` : "";
}

/** @param {{ fileCount?: number }} winner */
function renderFileCount(winner) {
  if (typeof winner.fileCount !== "number") return "";
  return `  (${winner.fileCount} file${winner.fileCount === 1 ? "" : "s"})`;
}

/** @param {{ query?: string, skipped?: Array<{ id: string, reason: string }> }} outcome @param {string} fallbackQuery */
function renderNoMatch(outcome, fallbackQuery) {
  const lines = [`skill-hell: no skill could be summoned for "${outcome.query ?? fallbackQuery}".`];
  for (const skip of outcome.skipped ?? []) {
    lines.push(`  skipped ${skip.id}: ${skip.reason}`);
  }
  return lines.join("\n");
}

/**
 * @param {string[]} argv
 * @returns {{ text: string, ok: boolean }}
 */
export function renderHell(argv) {
  const intent = argv.join(" ").trim();
  if (!intent) {
    return { text: "skill-hell: no intent given — usage: /skill-hell <intent>\n", ok: false };
  }

  let engine;
  try {
    engine = resolveHellEngine();
  } catch (error) {
    if (error instanceof HellEngineNotFoundError) return { text: `${error.message}\n`, ok: false };
    return { text: `skill-hell: could not resolve the summon engine: ${errorMessage(error)}\n`, ok: false };
  }

  const result = spawnSync(engine.command, [...engine.args, "summon", intent, "--json"], {
    encoding: "utf-8",
    timeout: SUMMON_TIMEOUT_MS,
  });

  if (result.error) {
    return {
      text: `skill-hell: could not run the summon engine (${engine.binPath}): ${errorMessage(result.error)}\n`,
      ok: false,
    };
  }

  let outcome;
  try {
    outcome = JSON.parse(result.stdout);
  } catch {
    const stderr = (result.stderr ?? "").trim();
    return {
      text: `skill-hell: engine returned unreadable output.${stderr ? `\n${stderr}` : ""}\n`,
      ok: false,
    };
  }

  const winner = outcome.summoned?.[0];
  if (!winner) {
    return { text: `${renderNoMatch(outcome, intent)}\n`, ok: false };
  }

  // winner.path is the skill DIRECTORY (install parity). Read SKILL.md from
  // inside it; reading the directory itself raises EISDIR.
  const skillFile = join(winner.path, "SKILL.md");
  let body;
  try {
    body = readFileSync(skillFile, "utf-8");
  } catch (error) {
    return {
      text: `skill-hell: summoned ${winner.id} but could not read its materialized SKILL.md at ${skillFile}: ${errorMessage(error)}\n`,
      ok: false,
    };
  }

  return { text: `${renderHeader(winner)}\n\n${body}\n`, ok: true };
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  const { text } = renderHell(argv);
  process.stdout.write(text);
  return 0;
}

// Same realpath-vs-raw-argv guard as render-posture.mjs (KC1): a plugin
// cache path routed through a macOS /tmp or /var symlink makes the naive
// `import.meta.url === pathToFileURL(argv[1]).href` check disagree, which
// would silently skip main() and print nothing.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
