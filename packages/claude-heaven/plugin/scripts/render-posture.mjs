// Zero-dependency renderer for `/skill-heaven`.
//
// The ladder is the interface. Claude cannot remove context from a running
// session (D12), and Claude Code 2.1.224 exposes no mid-session skill-load
// command. The chooser therefore marks direction honestly and emits exact
// launch commands; it never pretends the slash command changed the process.

import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_ENV = "CLAUDE_HEAVEN_PROFILE";

/**
 * @typedef {object} LaunchManifest
 * @property {string} posture
 * @property {number} standingTokens
 * @property {number} [skillCount]
 * @property {string} scope
 * @property {boolean} [incomplete]
 */

/** @typedef {{ levels: string[], gated: string[], unratified: string[] }} LadderData */

/** @returns {LadderData | null} */
export function readLadderData(dataDir = join(HERE, "..", "data")) {
  try {
    const value = JSON.parse(readFileSync(join(dataDir, "p2-gate.json"), "utf8"));
    if (
      Array.isArray(value?.levels) &&
      Array.isArray(value?.gatedLevels) &&
      Array.isArray(value?.unratifiedLevels) &&
      [...value.levels, ...value.gatedLevels, ...value.unratifiedLevels].every(
        (entry) => typeof entry === "string",
      )
    ) {
      return {
        levels: value.levels,
        gated: value.gatedLevels,
        unratified: value.unratifiedLevels,
      };
    }
  } catch {
    // Fail closed below.
  }
  return null;
}

/** @returns {string[] | null} */
export function readGatedLevels(dataDir = join(HERE, "..", "data")) {
  return readLadderData(dataDir)?.gated ?? null;
}

/** 14200 -> "14.2k"; sub-1k stays exact. */
export function formatTokens(/** @type {unknown} */ value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "?";
  if (value < 1000) return String(Math.round(value));
  return `${(value / 1000).toFixed(1)}k`;
}

/** @returns {string | null} */
export function normalizeTarget(/** @type {unknown} */ raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "";
  return /^[a-z][a-z0-9-]{0,31}$/.test(value) ? value : null;
}

/** @param {unknown} value @returns {value is LaunchManifest} */
export function isLaunchManifest(value) {
  if (!value || typeof value !== "object") return false;
  const manifest = /** @type {Record<string, unknown>} */ (value);
  return (
    manifest.schema === "claude-heaven/profile@1" &&
    typeof manifest.posture === "string" &&
    typeof manifest.standingTokens === "number" &&
    typeof manifest.scope === "string"
  );
}

/** @returns {LaunchManifest | null} */
export function loadManifest(path = process.env[PROFILE_ENV]) {
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return isLaunchManifest(value) ? value : null;
  } catch {
    return null;
  }
}

/** @param {string} posture @returns {string | null} */
export function levelForPosture(posture) {
  if (posture === "product-floor") return "off";
  if (posture === "curated") return "low";
  return null;
}

/** @param {string} level */
function launchCommand(level) {
  if (level === "low") return "claude-heaven --level low --skill <path>";
  return `claude-heaven --level ${level}`;
}

/** @param {LaunchManifest | null} manifest */
function scopeNote(manifest) {
  if (!manifest) return "session: no launch manifest · previewing the launcher default: off";
  const plus = manifest.incomplete ? "+" : "";
  const dose = `${formatTokens(manifest.standingTokens)}${plus} standing`;
  if (manifest.scope === "user+project") {
    return `session: ${manifest.posture} · ${dose} · bundled CLI skills and plugin-provided skills are not counted`;
  }
  if (manifest.scope === "session") {
    return `session: ${manifest.posture} · ${dose} · bundled \`doctor\` skill is not counted`;
  }
  return `session: ${manifest.posture} · ${dose} · scope coverage unknown`;
}

/** @param {string | null} target */
function refusal(target) {
  const shown = target && target !== "hell" ? `"${target}"` : "that rung";
  return [
    `⛔ ${shown} is Hell-lane and gated (P2).`,
    "   /skill-hell is a locked door, not an activator. This is a policy hold, not a harness limit.",
    "",
  ].join("\n");
}

/**
 * @param {object} [options]
 * @param {LaunchManifest | null} [options.manifest]
 * @param {string} [options.target]
 * @param {LadderData | null} [options.data]
 * @returns {{ text: string, refused: boolean }}
 */
export function renderPosture(options = {}) {
  const manifest = options.manifest ?? null;
  const data = options.data === undefined ? readLadderData() : options.data;
  const target = normalizeTarget(options.target);

  // Missing generated policy data must never make a gated rung actionable.
  if (!data) {
    return {
      text: "⛔ ladder policy data is unavailable; refusing all moves (fail-closed).\n",
      refused: true,
    };
  }
  if (target === "hell" || (target !== null && data.gated.includes(target))) {
    return { text: refusal(target), refused: true };
  }

  const current = manifest ? levelForPosture(manifest.posture) : "off";
  const currentIndex = current === null ? data.levels.length : data.levels.indexOf(current);
  const lines = [
    "⚡ Skill Heaven",
    "   WORKING PROTOTYPE · actively tested for public use · interfaces may change",
    `   ${scopeNote(manifest)}`,
    "",
    "   off · low · med · high · xhigh · max · ultra",
    "",
  ];

  for (const [index, level] of data.levels.entries()) {
    const pointer = target === level ? "  ← selected" : "";
    if (data.gated.includes(level)) {
      lines.push(`   ⊘ ${level.padEnd(6)} Hell: additive context · LOCKED (P2)${pointer}`);
    } else if (data.unratified.includes(level)) {
      lines.push(`   ⊘ ${level.padEnd(6)} unratified · no approved product mapping${pointer}`);
    } else if (level === current) {
      const effect = level === "off" ? "near-empty; keeps this door" : "curated skills only";
      lines.push(`   ● ${level.padEnd(6)} ${effect} · current${pointer}`);
    } else if (index < currentIndex) {
      lines.push(
        `   ⊘ ${level.padEnd(6)} DOWNWARD LOCKED (D12) · relaunch: ${launchCommand(level)}${pointer}`,
      );
    } else {
      lines.push(`   ○ ${level.padEnd(6)} upward · → ${launchCommand(level)} (new session)${pointer}`);
    }
  }

  if (target !== "" && (target === null || !data.levels.includes(target))) {
    lines.push("", "   Unknown rung. Choose off, low, med, high, xhigh, max, or ultra.");
  }

  lines.push(
    "",
    "   → emits a launch command; Claude cannot load a skill natively into this running session.",
    "   Downward moves stay locked because running-session context cannot be evicted (D12).",
  );
  return { text: `${lines.join("\n")}\n`, refused: false };
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  process.stdout.write(
    renderPosture({ manifest: loadManifest(), target: argv.join(" ") }).text,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
