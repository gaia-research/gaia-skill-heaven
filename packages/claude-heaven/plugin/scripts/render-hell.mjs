// Zero-dependency renderer for `/skill-hell`, the additive half of the ladder.
// Bare invocation shows the chooser; a rung arms an ambient summon budget; any
// other text keeps the advanced manual-summon path.

import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HellEngineNotFoundError, resolveHellEngine } from "./resolve-hell.mjs";

const summonTimeoutMs = 30_000;

export const RUNG_BUDGETS = {
  high: { count: 1, band: "tight", relevance: "best relevant match only" },
  xhigh: { count: 3, band: "balanced", relevance: "matches within 10% of the best score" },
  max: { count: 5, band: "wide", relevance: "matches within 25% of the best score" },
};

function chooser() {
  return [
    "🔥 Skill Hell · high · xhigh · max · ultra",
    "",
    "   ● high    default · 1 skill/gap · tight relevance",
    "   ○ xhigh   3 skills/gap · within 10% of the best score",
    "   ○ max     5 skills/gap · within 25% of the best score",
    "   ⊘ ultra   UNRATIFIED · no approved summon budget",
    "",
    "   Select a rung to arm the lane: /skill-hell high|xhigh|max",
    "   Advanced manual path: /skill-hell <intent>",
    "",
  ].join("\n");
}

/** @param {keyof typeof RUNG_BUDGETS} level */
function armed(level) {
  const budget = RUNG_BUDGETS[level];
  return [
    `🔥 Skill Hell armed: ${level}`,
    `   budget: up to ${budget.count} skill${budget.count === 1 ? "" : "s"} per capability gap · ${budget.relevance}`,
    "   Summon only when the agent hits a real gap; the lane remains armed afterward.",
    `   engine seam: summon --limit ${budget.count}; relevance-band filtering awaits the engine's bounded multi-summon contract.`,
    "",
  ].join("\n");
}

/** @param {Record<string, unknown>} winner */
function trustLines(winner) {
  const source =
    winner.trustFields && typeof winner.trustFields === "object"
      ? winner.trustFields
      : winner.trust && typeof winner.trust === "object"
        ? winner.trust
        : typeof winner.trustMagnitude === "number"
          ? { trustMagnitude: winner.trustMagnitude }
          : null;
  if (!source) return [];
  return Object.entries(/** @type {Record<string, unknown>} */ (source))
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([name, value]) => `   ${name}: ${String(value)}`);
}

/** @param {Record<string, unknown>} winner */
function costLine(winner) {
  const state =
    typeof winner.cacheState === "string"
      ? winner.cacheState
      : typeof winner.cache === "string"
        ? winner.cache
        : null;
  return typeof winner.totalSeconds === "number" && state
    ? `   install: ${winner.totalSeconds.toFixed(2)}s · ${state}`
    : null;
}

/** @param {Record<string, unknown>} winner */
export function renderCard(winner) {
  const path = typeof winner.path === "string" ? winner.path : "";
  const identity =
    typeof winner.name === "string"
      ? winner.name
      : typeof winner.id === "string"
        ? winner.id
        : "summoned skill";
  const lines = [`┌ summoned · ${identity}`];
  if (typeof winner.id === "string" && winner.id !== identity) lines.push(`   id: ${winner.id}`);
  lines.push(...trustLines(winner));
  const cost = costLine(winner);
  if (cost) lines.push(cost);
  if (typeof winner.fileCount === "number") {
    lines.push(`   files: ${winner.fileCount}`);
  }
  if (path) {
    lines.push(`   path: ${path}`);
    lines.push(`   inspect: ${pathToFileURL(join(path, "SKILL.md")).href}`);
  }
  lines.push("└");
  return lines.join("\n");
}

/** @param {{ query?: string, skipped?: Array<{ id: string, reason: string }> }} outcome @param {string} intent */
function noMatch(outcome, intent) {
  const lines = [`skill-hell: no skill could be summoned for "${outcome.query ?? intent}".`];
  for (const skipped of outcome.skipped ?? []) lines.push(`  skipped ${skipped.id}: ${skipped.reason}`);
  return lines.join("\n");
}

/**
 * @param {string} intent
 * @param {keyof typeof RUNG_BUDGETS} level
 * @returns {{ text: string, ok: boolean }}
 */
function summon(intent, level) {
  let engine;
  try {
    engine = resolveHellEngine();
  } catch (error) {
    if (error instanceof HellEngineNotFoundError) return { text: `${error.message}\n`, ok: false };
    return { text: `skill-hell: could not resolve the summon engine: ${errorMessage(error)}\n`, ok: false };
  }

  const budget = RUNG_BUDGETS[level];
  const result = spawnSync(
    engine.command,
    [...engine.args, "summon", intent, "--limit", String(budget.count), "--json"],
    { encoding: "utf8", timeout: summonTimeoutMs },
  );
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
    return { text: `skill-hell: engine returned unreadable output.${stderr ? `\n${stderr}` : ""}\n`, ok: false };
  }

  const winners = Array.isArray(outcome.summoned) ? outcome.summoned : [];
  if (!winners.length) return { text: `${noMatch(outcome, intent)}\n`, ok: false };

  for (const winner of winners) {
    if (typeof winner?.path !== "string" || !existsSync(join(winner.path, "SKILL.md"))) {
      return {
        text: `skill-hell: summoned ${winner?.id ?? "a skill"} but its materialized SKILL.md is unavailable.\n`,
        ok: false,
      };
    }
  }
  return {
    text: `${winners.map((/** @type {Record<string, unknown>} */ winner) => renderCard(winner)).join("\n\n")}\n`,
    ok: true,
  };
}

/**
 * @param {string[]} argv
 * @returns {{ text: string, ok: boolean }}
 */
export function renderHell(argv) {
  if (!argv.length || !argv.join(" ").trim()) return { text: chooser(), ok: true };

  if (argv[0] === "--summon-level") {
    const level = argv[1];
    const intent = argv.slice(2).join(" ").trim();
    if (!(level in RUNG_BUDGETS) || !intent) {
      return { text: "skill-hell: internal summon usage: --summon-level high|xhigh|max <intent>\n", ok: false };
    }
    return summon(intent, /** @type {keyof typeof RUNG_BUDGETS} */ (level));
  }

  const input = argv.join(" ").trim();
  if (input === "ultra") {
    return { text: "⛔ ultra is UNRATIFIED — no approved summon budget exists.\n", ok: false };
  }
  if (input in RUNG_BUDGETS) {
    return { text: armed(/** @type {keyof typeof RUNG_BUDGETS} */ (input)), ok: true };
  }
  return summon(input, "high");
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  process.stdout.write(renderHell(argv).text);
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
