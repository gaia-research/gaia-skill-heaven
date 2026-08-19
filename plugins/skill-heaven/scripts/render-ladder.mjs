// The one renderer for all five surfaces (`/skill-zero`, `/skill-heaven`,
// `/skill-hell`, `/skill-ultra`, `/summon`). Replaces render-posture.mjs +
// render-hell.mjs, and with them the external-binary hunt: summoning is an MCP
// tool call the agent makes, not a subprocess this script shells out to.
//
// ZERO DEPENDENCIES BY NECESSITY: once skill-heaven is installed from the
// marketplace there is no node_modules beside it, so this runs on plain Node
// with only `node:` builtins.
//
// It renders THE SAME seven-rung line for every rung command, differing only in
// which rung is armed and which band is highlighted. There is one ladder — one
// line — and a session sits at exactly one rung (N13, docs/LADDER-FLOW.md).
//
// NOTHING HERE REFUSES A RUNG. Hell is not gated and neither is Ultra; per N13
// what is outstanding on the upper band is implementation, not permission.

import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const profileEnv = "CLAUDE_ZERO_PROFILE";

export const MODES = ["zero", "heaven", "hell", "ultra", "summon"];

/**
 * @typedef {object} LaunchManifest
 * @property {string} posture
 * @property {number} standingTokens
 * @property {string} scope
 * @property {boolean} [incomplete]
 */

/**
 * @typedef {object} LadderData
 * @property {Array<{ id: string, band: string }>} rungs
 * @property {Record<string, { surface: string, command: string, defaultRung: string, direction: string }>} bands
 * @property {string} wip
 */

/** Reads the generated ladder policy artifact. Fails closed: a missing or
 * malformed artifact refuses everything rather than rendering invented numbers.
 * @returns {LadderData | null} */
export function readLadderData(dataDir = join(here, "..", "data")) {
  try {
    const value = JSON.parse(readFileSync(join(dataDir, "ladder.json"), "utf8"));
    const rungs = value?.rungs;
    const bands = value?.bands;
    if (
      Array.isArray(rungs) &&
      rungs.length > 0 &&
      rungs.every((r) => typeof r?.id === "string" && typeof r?.band === "string") &&
      bands &&
      typeof bands === "object" &&
      typeof value?.wip === "string" &&
      Object.values(bands).every(
        (b) =>
          typeof b?.surface === "string" &&
          typeof b?.command === "string" &&
          typeof b?.defaultRung === "string" &&
          typeof b?.direction === "string",
      )
    ) {
      return { rungs, bands, wip: value.wip };
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
    manifest.schema === "claude-zero/profile@1" &&
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
  if (posture === "product-floor") return "zero";
  if (posture === "curated") return "low";
  if (posture === "native") return "med";
  return null;
}

/** What `/skill-zero` cuts by default.
 *
 * `automatic` — automatic summoning is cut; manual `/summon` still works. This
 * is the product floor per N13: it "ships /summon by default, with none of the
 * choosing automated".
 * `all` — manual `/summon` is cut too.
 *
 * Read from the plugin's userConfig if the harness exports it, otherwise from
 * SKILL_HEAVEN_ZERO_CUTS, otherwise `automatic`. Whether userConfig reaches a
 * command's `!` bash block at all is an open M0 probe; defaulting to `automatic`
 * means a negative result degrades to the documented default rather than
 * breaking the surface.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"automatic" | "all"} */
export function zeroCuts(env = process.env) {
  const raw = (env.CLAUDE_PLUGIN_OPTION_ZERO_CUTS ?? env.SKILL_HEAVEN_ZERO_CUTS ?? "").trim().toLowerCase();
  return raw === "all" ? "all" : "automatic";
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

/** @param {LadderData} data @param {string} id */
function rungById(data, id) {
  return data.rungs.find((rung) => rung.id === id) ?? null;
}

/** The seven-rung line. Identical on every rung command — only the armed marker
 * moves. @param {LadderData} data @param {string} armed */
function line(data, armed) {
  const width = Math.max(...data.rungs.map((rung) => rung.id.length));
  return data.rungs.map((rung) => {
    const band = data.bands[rung.band];
    const meaning =
      rung.band === "zero"
        ? "nothing automatic · manual /summon only"
        : rung.band === "ultra"
          ? "the crown rung · picks direction and depth per gap"
          : `${band.direction} · ${rung.id === "low" || rung.id === "high" ? "the band opens here" : "further along the band"}`;
    const armedMark = rung.id === armed ? " · armed" : "";
    return `   ${rung.id === armed ? "●" : "○"} ${rung.id.padEnd(width)}  ${rung.band.padEnd(6)}  ${meaning}${armedMark}`;
  });
}

/** @param {LadderData} data @param {string} title */
function header(data, title) {
  return [
    title,
    "   WORKING PROTOTYPE · actively tested for public use · interfaces may change",
    `   ${data.wip}`,
    "",
    "   one ladder, one line — the surface is read from the rung:",
    "",
  ];
}

/** @param {LadderData} data */
function moveLine(data) {
  const commands = ["zero", "heaven", "hell", "ultra"].map((band) => {
    const info = data.bands[band];
    const rungs = data.rungs.filter((rung) => rung.band === band).map((rung) => rung.id);
    return band === "zero" || band === "ultra" ? info.command : `${info.command} ${rungs.join("|")}`;
  });
  return `   Move along the line: ${commands.join(" · ")}`;
}

/** The protocol the agent follows while a lane is armed. This IS the disclosure
 * the product promises: the card names the skill and carries the ranking
 * disclosure with it, and it is printed before anything from it is used.
 *
 * No count appears here on purpose. Nothing assigns a number to a rung and
 * nothing caps a summon — the rung names a DIRECTION, and how far to reach in
 * that direction is the agent's call, gap by gap.
 * @param {string} direction */
function autoSummonProtocol(direction) {
  return [
    "",
    "   On a real capability gap — never preemptively — call the `summon` tool, with",
    `   a depth you judge the gap needs while ${direction === "converge" ? "converging" : "exploring"}.`,
    "   Print the returned card verbatim before using anything from it, read the",
    "   SKILL.md at the card's path, and follow it. The card is the listing entry,",
    "   not the skill body. The lane stays armed.",
  ];
}

const STANDING_INSTRUCTION_NOTE =
  "   A session sits at exactly one rung. The rung is a standing instruction the\n" +
  "   agent honours, not something the tool enforces.";

/**
 * @param {object} options
 * @param {string} options.mode
 * @param {string} [options.target]
 * @param {LaunchManifest | null} [options.manifest]
 * @param {LadderData | null} [options.data]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {{ text: string, refused: boolean }}
 */
export function renderLadder(options) {
  const data = options.data === undefined ? readLadderData() : options.data;
  if (!data) {
    return { text: "⛔ ladder policy data is unavailable; refusing to render invented numbers (fail-closed).\n", refused: true };
  }
  const mode = options.mode;
  if (!MODES.includes(mode)) {
    return { text: `⛔ unknown surface "${mode}". Expected one of: ${MODES.join(", ")}.\n`, refused: true };
  }
  const target = normalizeTarget(options.target);
  const env = options.env ?? process.env;

  if (mode === "summon") return renderSummon(options.target, env);
  if (mode === "zero") return renderZero(data, target, options.manifest ?? null, env);
  return renderBand(data, mode, target);
}

/** `/summon <intent>` — the manual path, present at every rung including `off`. */
function renderSummon(/** @type {unknown} */ rawIntent, /** @type {NodeJS.ProcessEnv} */ env) {
  const intent = String(rawIntent ?? "").trim();
  if (zeroCuts(env) === "all") {
    return {
      text: [
        "⛔ manual /summon is cut for this session (zero_cuts = all).",
        "   Skill Zero's default cuts only AUTOMATIC summoning; this configuration cuts",
        "   the manual call too. Change it in the plugin's settings (zero_cuts:",
        "   automatic), or arm a rung above the floor: /skill-heaven · /skill-hell.",
        "",
      ].join("\n"),
      refused: true,
    };
  }
  if (!intent) {
    return {
      text: [
        "✳ /summon <intent> — one skill into context, one session, nothing installed.",
        "   WORKING PROTOTYPE · actively tested for public use · interfaces may change",
        "",
        "   Name the capability you need, e.g. /summon review a Rust PR for unsafe blocks",
        "   Present at every rung, including the floor. To automate the choosing instead:",
        "   /skill-heaven (converge) · /skill-hell (explore) · /skill-ultra (controller).",
        "",
      ].join("\n"),
      refused: false,
    };
  }
  return {
    text: [
      `✳ /summon · ${intent}`,
      "   WORKING PROTOTYPE · actively tested for public use · interfaces may change",
      "",
      "   Call the `summon` tool once, with this intent as the query.",
      "   Print the returned card verbatim before using anything from it, read the",
      "   SKILL.md at the card's path, and follow it. The card is the listing entry,",
      "   not the skill body. This is one manual call — it arms nothing.",
      "",
    ].join("\n"),
    refused: false,
  };
}

/** `/skill-zero [all]` — the floor. */
function renderZero(/** @type {LadderData} */ data, /** @type {string | null} */ target, /** @type {LaunchManifest | null} */ manifest, /** @type {NodeJS.ProcessEnv} */ env) {
  const cutsAll = target === "all" || zeroCuts(env) === "all";
  const lines = header(data, "⚡ Skill Zero · the floor · armed: zero");
  lines.push(...line(data, "zero"));
  lines.push("");
  lines.push(
    cutsAll
      ? "   cut: no automatic summoning, and no manual /summon either."
      : "   cut: no automatic summoning. Manual /summon still works — the floor ships it.",
  );
  if (!cutsAll) lines.push("   Cut that too with: /skill-zero all");
  lines.push("");
  if (manifest) {
    lines.push(`   ${sessionLine(manifest)}`);
  } else {
    lines.push("   Boot posture unknown: this session was not launched by claude-zero.");
  }
  lines.push(
    "   Already-loaded skills cannot be evicted mid-session (D12, probed) — this",
    "   command cuts summoning, it does not empty the session. A genuinely clean",
    "   start is a boot-time decision: → claude-zero --level zero",
  );
  lines.push("");
  lines.push(moveLine(data));
  lines.push(STANDING_INSTRUCTION_NOTE);
  lines.push("");
  return { text: `${lines.join("\n")}\n`, refused: false };
}

/** `/skill-heaven`, `/skill-hell`, `/skill-ultra` — arm a rung on the line. */
function renderBand(/** @type {LadderData} */ data, /** @type {string} */ band, /** @type {string | null} */ target) {
  const info = data.bands[band];
  if (!info) {
    return { text: `⛔ ladder policy data has no band "${band}" (fail-closed).\n`, refused: true };
  }
  const inBand = data.rungs.filter((rung) => rung.band === band).map((rung) => rung.id);

  // A rung from another band is not a refusal — it is a redirect. Every rung on
  // the line is reachable; only the command that opens on it differs.
  if (target && !inBand.includes(target)) {
    const other = rungById(data, target);
    if (other) {
      const otherInfo = data.bands[other.band];
      const arg = other.band === "ultra" || other.band === "zero" ? "" : ` ${target}`;
      return {
        text: `↗ ${target} sits in the ${other.band} band. Arm it with: ${otherInfo.command}${arg}\n`,
        refused: false,
      };
    }
    const lines = header(data, `${bandGlyph(band)} ${info.surface} · ${info.direction}`);
    lines.push(...line(data, info.defaultRung));
    lines.push("", `   Unknown rung "${target}". ${info.surface} opens on ${inBand.join(" · ")}.`, "");
    return { text: `${lines.join("\n")}\n`, refused: false };
  }

  const armed = target || info.defaultRung;
  const lines = header(data, `${bandGlyph(band)} ${info.surface} · ${info.direction} · armed: ${armed}`);
  lines.push(...line(data, armed));
  lines.push("");
  lines.push(
    band === "ultra"
      ? "   armed: the controller picks the direction (converge or explore) and how far to reach, per gap."
      : `   armed: ${info.direction} on each capability gap. There is no per-rung count and no`,
  );
  if (band === "ultra") {
    lines.push(
      "   The crown rung has no sub-ladder — it is the top of the one line. Its",
      "   heuristics are unaided today: nothing scores the choice for you yet.",
    );
  } else {
    lines.push(
      "   cap on a summon — how far this rung reaches is being worked out in use while",
      "   the benchmark is built. Reach further along the band to go wider.",
    );
  }
  lines.push(...autoSummonProtocol(info.direction));
  lines.push("");
  lines.push(moveLine(data));
  lines.push(STANDING_INSTRUCTION_NOTE);
  lines.push("");
  return { text: `${lines.join("\n")}\n`, refused: false };
}

/** @param {string} band */
function bandGlyph(band) {
  if (band === "heaven") return "☁";
  if (band === "hell") return "🔥";
  if (band === "ultra") return "✦";
  return "⚡";
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  const { text } = renderLadder({
    mode: String(mode ?? "").trim().toLowerCase(),
    target: rest.join(" "),
    manifest: loadManifest(),
  });
  process.stdout.write(text);
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
