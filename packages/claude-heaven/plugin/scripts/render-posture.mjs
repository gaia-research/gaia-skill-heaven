// Zero-dependency renderer for `/skill-heaven`, the subtractive half of the
// ladder. Heaven is selected at boot; this renderer never claims to recompose a
// running process.

import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const profileEnv = "CLAUDE_HEAVEN_PROFILE";

/**
 * @typedef {object} LaunchManifest
 * @property {string} posture
 * @property {number} standingTokens
 * @property {string} scope
 * @property {boolean} [incomplete]
 */

/** @typedef {{ heaven: string[], hell: string[], unratified: string[] }} LadderData */

/** @returns {LadderData | null} */
export function readLadderData(dataDir = join(here, "..", "data")) {
  try {
    const value = JSON.parse(readFileSync(join(dataDir, "ladder.json"), "utf8"));
    if (
      Array.isArray(value?.heavenLevels) &&
      Array.isArray(value?.hellLevels) &&
      Array.isArray(value?.unratifiedLevels) &&
      [...value.heavenLevels, ...value.hellLevels, ...value.unratifiedLevels].every(
        (entry) => typeof entry === "string",
      )
    ) {
      return {
        heaven: value.heavenLevels,
        hell: value.hellLevels,
        unratified: value.unratifiedLevels,
      };
    }
  } catch {
    // Fail closed below.
  }
  return null;
}

/** @param {unknown} value */
export function formatTokens(value) {
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
export function loadManifest(path = process.env[profileEnv]) {
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
  if (posture === "native") return "med";
  return null;
}

/** @param {string} level */
function launchCommand(level) {
  if (level === "low") return "claude-heaven --level low --skill <path>";
  return `claude-heaven --level ${level}`;
}

/** @param {LaunchManifest} manifest */
function sessionLine(manifest) {
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

/**
 * @param {object} [options]
 * @param {LaunchManifest | null} [options.manifest]
 * @param {string} [options.target]
 * @param {LadderData | null} [options.data]
 * @returns {{ text: string, refused: boolean }}
 */
export function renderPosture(options = {}) {
  const manifest = options.manifest ?? null;
  const target = normalizeTarget(options.target);
  const data = options.data === undefined ? readLadderData() : options.data;

  if (!data) {
    return { text: "⛔ ladder policy data is unavailable; refusing all moves (fail-closed).\n", refused: true };
  }

  if (!manifest) {
    return {
      text: [
        "⚡ Skill Heaven · off · low · med",
        "   Heaven rungs are boot-time decisions and this session was not launched by claude-heaven.",
        "   Start one with: → claude-heaven --level low --skill <path>",
        "   This command did not change the running session.",
        "",
      ].join("\n"),
      refused: false,
    };
  }

  if (target !== null && data.hell.includes(target)) {
    return {
      text: `↗ ${target} belongs to the additive half. Arm it with: /skill-hell ${target}\n`,
      refused: false,
    };
  }
  if (target !== null && data.unratified.includes(target)) {
    return { text: `⛔ ${target} is UNRATIFIED — no approved summon budget exists.\n`, refused: true };
  }

  const current = levelForPosture(manifest.posture);
  const currentIndex = current === null ? data.heaven.length : data.heaven.indexOf(current);
  const lines = ["⚡ Skill Heaven · off · low · med", `   ${sessionLine(manifest)}`, ""];

  for (const [index, level] of data.heaven.entries()) {
    const selected = target === level ? "  ← selected" : "";
    if (level === current) {
      const meaning = level === "off" ? "near-empty; door open" : level === "low" ? "named skills only" : "native setup";
      lines.push(`   ● ${level.padEnd(4)} ${meaning} · current${selected}`);
    } else if (index < currentIndex) {
      lines.push(`   ⊘ ${level.padEnd(4)} DOWNWARD LOCKED (D12) · relaunch: ${launchCommand(level)}${selected}`);
    } else {
      lines.push(`   ○ ${level.padEnd(4)} upward · → ${launchCommand(level)} (new session)${selected}`);
    }
  }

  if (target !== "" && (target === null || !data.heaven.includes(target))) {
    lines.push("", "   Unknown Heaven rung. Choose off, low, or med.");
  }
  lines.push("", "   Downward moves stay locked: a running session cannot evict context (D12).");
  return { text: `${lines.join("\n")}\n`, refused: false };
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  process.stdout.write(renderPosture({ manifest: loadManifest(), target: argv.join(" ") }).text);
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
