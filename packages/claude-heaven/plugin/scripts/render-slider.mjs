// The /skill-heaven posture slider renderer (WS4 step 2).
//
// BOUND BY: D12 · P1 · P2 · P3 · B1 · B2 · B4 · D6 · D9.
// (The original step-2 draft cited D13. D13 was RETIRED on 2026-07-24 and its id
// is on RATIFICATION.md's never-reused list, so nothing here may lean on it —
// re-bound by founder ruling V5-6. What the retired D13 was doing the work for
// is now split across D12, which actually rules the locked clean room, and P2,
// which rules the locked Hell notch. See the `restraint` note below for the half
// of the retired D13 that had no live authority left at all.)
//
// ZERO DEPENDENCIES BY NECESSITY. Once claude-heaven is installed from the
// marketplace there is no node_modules next to it, so this file must run on
// plain Node with only `node:` builtins — it cannot import `skill-heaven`. Two
// consequences, both handled rather than hidden:
//   - the P2 (Hell-lane) gate list is MACHINE-copied from core's HELL_LEVELS
//     into ../data/p2-gate.json by scripts/generate-p2-gate.ts, and a freshness
//     test byte-checks it (no hand-authored literal);
//   - the standing dose is NOT recensused here — it is read from the launch
//     manifest the launcher already wrote (the same manifest the statusline
//     renders), so the two readouts cannot disagree.
//
// WHAT THIS SURFACE MAY CLAIM (claim-discipline table, B4). It renders posture
// and prints commands; it never restarts anything and never implies it can —
// D12 rules that an in-session control moves posture UPWARD only, so a surface
// that implied an in-session subtraction would be claiming a transition the
// harness cannot perform. The clean room is launcher-locked (D12: gate (a) came
// back NEGATIVE — no flag combination evicts user/global skills on a continued
// session), so it is a visibly locked upsell everywhere except a session that
// launched there.
//
// THE TWO FLOORS (V5-5, landed in PR #14). `POSTURES` now carries BOTH `floor`
// and `product-floor`, and this slider's clean-room notch is `product-floor`:
//   - `floor` is the DOORLESS BENCHMARK floor, the placebo-of-record (B2). F6
//     established that `--disable-slash-commands` suppresses plugin commands
//     too, so at `floor` THIS COMMAND DOES NOT EXIST. The benchmark floor is
//     deliberately not a notch: a slider cannot offer a door to a posture that
//     has none, and priced as its own arm (B1) it must never be pooled with the
//     product floor.
//   - `product-floor` is the DOORFUL PRODUCT floor — T9b minus
//     `--disable-slash-commands`, the door costing +515 tok (F7). It is the only
//     clean room reachable by a session that can run `/skill-heaven` at all.
// Nothing here records a benchmark arm: the placebo arm flag belongs to core's
// CLI, at the benchmark floor and nowhere else, and no path in this package
// composes one (a test pins the absence).
//
// PLUGIN-PATH NOTE (probed on 2.1.216): ${CLAUDE_PLUGIN_ROOT} is interpolated
// into the *command markdown*, but is NOT exported to the bash child, so this
// script locates its own data dir via import.meta.url rather than the env var.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_ENV = "CLAUDE_HEAVEN_PROFILE";
const SESSION_ENV = "CLAUDE_CODE_SESSION_ID";

/**
 * @typedef {object} LaunchManifest
 * @property {string} posture
 * @property {number} standingTokens
 * @property {number} [skillCount]
 * @property {string} scope
 * @property {boolean} [incomplete]
 * @property {boolean} [launcherLocked]
 */

/** @typedef {"launched" | "reachable" | "locked"} NotchState */

/**
 * @typedef {object} Notch
 * @property {string} id
 * @property {string} label
 * @property {string} blurb
 * @property {"physical" | "gated"} kind
 * @property {string} [lockedNote]
 * @property {(sid: string) => string} [resume]
 */

/**
 * The slider, top (most context) to bottom (least). Only `product-floor` is
 * launcher-locked: gate (a) established that every other physical stop is
 * reachable on a continued session in either direction, and that user/global
 * skill eviction is reachable at boot only.
 *
 * `resume` is a function of the session id so the printed command is exact.
 * A notch with no `resume` is never presented as something the user can run.
 *
 * STOPS THE STEP-2 DRAFT LISTED AND THIS SET DOES NOT — recorded, not silently
 * dropped, so nobody re-adds them from memory:
 *   - `lean` and `add-ons`. RETIRED as slider stops by founder ruling (V5-6
 *     follow-up, 2026-07-29): neither is a ratified term and neither is a
 *     posture — core's `POSTURES` is `floor | product-floor | curated | native`,
 *     and these two were in-session flag moves wearing posture clothing on a
 *     shipped control surface. Unratified vocabulary does not get a notch. They
 *     are `banned` in the federation lexicon with no replacement: the CONCEPT is
 *     gone from this surface, not renamed. `/skill-heaven lean` now falls through
 *     to the ordinary "no notch called …" path — deliberately, because a bespoke
 *     explanation would keep the retired word alive in shipped copy.
 *   - the doorless BENCHMARK `floor` — no door by ruling (F6), see the header.
 *   - `restraint`, the below-vanilla behavioral notch. It shipped as a
 *     "coming — research" row on D13's authority. D13 is retired, gate (e) is
 *     still UNVERIFIED, and RATIFICATION.md OPEN 1 has an unresolved proposal
 *     that behavioral restraint is "behavioral, not positional" — i.e. possibly
 *     not a notch at all. Rendering it as the bottom rung would encode that
 *     provisional mapping in a constant, which OPEN 3 rules out explicitly. Its
 *     absence here is NOT a ruling on where restraint eventually lives; it is
 *     this surface declining to make one. Nothing else in the repo rides it.
 */
/** @type {Notch[]} */
export const NOTCHES = [
  {
    id: "hell",
    label: "hell",
    blurb: "The Hell lane — additive summoning, routed.",
    lockedNote: "LOCKED (P2). Opens only when Hell is proven safe — see /skill-hell.",
    kind: "gated",
  },
  {
    id: "native",
    label: "native",
    blurb: "Your setup as-is — every skill you have installed.",
    kind: "physical",
    resume: (/** @type {string} */ sid) => `claude --resume ${sid}`,
  },
  {
    id: "product-floor",
    label: "clean room",
    blurb: "Evicts your personal skills, MCP servers and bundled skills — keeps this door.",
    lockedNote: "Composed at boot, never mid-session (D12) — and no launcher builds it yet.",
    kind: "physical",
  },
];

/**
 * Postures this surface may print a `claude-heaven` relaunch command for,
 * keyed by notch id.
 *
 * EMPTY ON PURPOSE, and it is not an oversight. `src/cli.ts` refuses every
 * `--posture` outside `LAUNCHABLE_POSTURES` (native only, in this slice) with a
 * non-zero exit. A slider that said "relaunch via `claude-heaven` to unlock the
 * clean room" was offering a door the tool then slams: the user runs it, gets
 * `exit 2`, and the surface has claimed a transition the harness cannot perform
 * (KC7). Two honest resolutions existed — stop offering it, or widen what the
 * CLI accepts — and widening is a product decision nobody has ruled on, so this
 * offers nothing.
 *
 * The clean room stays a visibly locked notch that says WHY it is locked; it
 * simply no longer points at a command that fails. A test walks every rendered
 * mode and asserts that every `claude-heaven --posture <p>` this file could
 * print is accepted by the real CLI validator, so the affordance and the
 * validator cannot drift apart again.
 *
 * @type {Record<string, (sid: string) => string>}
 */
export const RELAUNCH_OFFERS = {};

// Single-column glyphs only — a double-width emoji would break the label gutter
// in a terminal, and this text is rendered verbatim.
/** @type {Record<NotchState, string>} */
const STATE_MARK = { launched: "●", reachable: "○", locked: "⊘" };
const LABEL_WIDTH = 12;
const ROW_INDENT = " ".repeat(3 + 1 + 2 + LABEL_WIDTH);

/**
 * Reads the machine-copied P2 gate list (see scripts/generate-p2-gate.ts).
 * @returns {string[] | null} null when the artifact is missing or corrupt.
 */
export function readGatedLevels(/** @type {string} */ dataDir = join(HERE, "..", "data")) {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, "p2-gate.json"), "utf-8"));
    const levels = parsed?.gatedLevels;
    if (Array.isArray(levels) && levels.every((l) => typeof l === "string")) return levels;
  } catch {
    /* fall through to the fail-closed path */
  }
  return null;
}

/** 14200 -> "14.2k"; sub-1k stays exact. Mirrors src/statusline.ts formatTokens
 * (a parity test pins the two together). */
/** @param {unknown} n */
export function formatTokens(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "?";
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

/**
 * Accepts only a short, plain token. Claude Code shell-escapes `$ARGUMENTS`
 * before substituting it into a command's bash line (probed on 2.1.216), so
 * whatever lands here is inert text — but it is echoed back to the user, so
 * anything exotic is dropped rather than interpreted or reflected.
 * @returns {string | null} the notch name, "" for "no target", or null for
 * "not a notch name" (never echoed back).
 */
export function normalizeTarget(/** @type {unknown} */ raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  return /^[a-z][a-z0-9-]{0,31}$/.test(s) ? s : null;
}

/** Minimal shape check — enough to render safely. The real contract is pinned by
 * a test that feeds this a manifest built by the launcher itself. */
/** @param {unknown} value @returns {value is LaunchManifest} */
export function isLaunchManifest(value) {
  if (!value || typeof value !== "object") return false;
  const m = /** @type {Record<string, unknown>} */ (value);
  return (
    m.schema === "claude-heaven/profile@1" &&
    typeof m.posture === "string" &&
    typeof m.standingTokens === "number" &&
    typeof m.scope === "string"
  );
}

/** @param {string | undefined} path @returns {LaunchManifest | null} */
export function loadManifest(path = process.env[PROFILE_ENV]) {
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return isLaunchManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [opts]
 * @param {LaunchManifest | null} [opts.manifest] launch manifest; null under vanilla claude
 * @param {string} [opts.sessionId] CLAUDE_CODE_SESSION_ID
 * @param {string} [opts.target] the notch the user asked for
 * @param {string[] | null} [opts.gatedLevels] machine-copied Hell-lane levels
 * @returns {{ text: string, refused: boolean }}
 */
export function renderSlider(opts = {}) {
  const manifest = opts.manifest ?? null;
  const gated = opts.gatedLevels === undefined ? readGatedLevels() : opts.gatedLevels;
  const target = normalizeTarget(opts.target);
  const sid = opts.sessionId || "";
  const launched = manifest?.posture ?? "native";

  // P2 first — never render a slider around a Hell-lane request.
  if (isGatedTarget(target, gated)) return { text: refusal(target), refused: true };

  const launchedNote = manifest
    ? "← you launched here (via claude-heaven)"
    : "← you are here (vanilla claude)";

  const lines = ["⚡ Skill Heaven — posture slider", `   ${sessionLine(manifest)}`, "", "   ▲ more context"];
  // Whether this render actually prints a `→` command. The footer's
  // run-it-yourself paragraph is about those commands, so it is printed only
  // when they exist — copy that explains an absent affordance is noise at best
  // and an implied offer at worst.
  let hasMoves = false;
  for (const notch of NOTCHES) {
    const state = notchState(notch, launched);
    const rows = notchLines(notch, state, sid, target, launchedNote);
    if (rows.some((r) => /^\s+→ /.test(r))) hasMoves = true;
    lines.push(...rows);
  }
  lines.push("   ▼ less context", "", ...footer(launched, sid, hasMoves));

  if (target !== "" && !NOTCHES.some((n) => n.id === target)) {
    // `floor` is a real posture that is deliberately not a notch. Say why rather
    // than pretending the name means nothing — refusal transparency.
    lines.push(
      "",
      target === "floor"
        ? "   (`floor` is the benchmark floor: no slash commands, so no door and no slider.\n" +
          "   The clean room you can reach from here is the product floor, above.)"
        : `   (no notch called ${quoteTarget(target)} — the slider above is the whole set.)`,
    );
  }
  return { text: `${lines.join("\n")}\n`, refused: false };
}

/** null target = unparseable. Fail CLOSED: without a readable gate list we
 * cannot tell a Heaven notch from a Hell level, so refuse anything unknown
 * rather than risk rendering a Hell stop as available (P2). */
/** @param {string | null} target @param {string[] | null} gated */
function isGatedTarget(target, gated) {
  if (target === "") return false;
  if (target === "hell") return true;
  if (gated === null) return !NOTCHES.some((n) => n.id === target);
  return target !== null && gated.includes(target);
}

/** @param {string | null} target */
function quoteTarget(target) {
  return target === null ? '"?"' : `"${target}"`;
}

/** @param {string | null} target */
function refusal(target) {
  const shown = target === null || target === "hell" ? "that posture" : `"${target}"`;
  return [
    `⛔ ${shown} is Hell-lane and gated (P2).`,
    "",
    "   /skill-hell is a locked door, not an activator: the Hell lane opens only",
    "   when it is proven safe — benchmark status and the ledger link live there.",
    "   /skill-heaven is the Heaven-lane control and will not compose a Hell posture.",
    "",
  ].join("\n");
}

/** @param {LaunchManifest | null} manifest */
function sessionLine(manifest) {
  if (!manifest) {
    return "session: vanilla claude — no launch manifest, so no standing-dose readout here.";
  }
  const floor = manifest.incomplete ? "+" : "";
  const skills = typeof manifest.skillCount === "number" ? `${manifest.skillCount} skills, ` : "";
  return (
    `session: launched at ${manifest.posture} · ${skills}` +
    `${formatTokens(manifest.standingTokens)}${floor} standing (${manifest.scope} scope)`
  );
}

/**
 * `launched === "floor"` (the doorless benchmark floor) cannot occur in
 * practice — this command does not exist there (F6) — so it deliberately
 * matches no notch and the clean room stays locked, which is the honest
 * rendering for a session that somehow reports a posture with no door.
 * @param {Notch} notch @param {string} launched @returns {NotchState}
 */
function notchState(notch, launched) {
  if (notch.kind === "gated") return "locked";
  if (notch.id === launched) return "launched";
  // D12: the clean room is composed at boot and cannot be reached mid-session.
  if (notch.id === "product-floor") return "locked";
  return "reachable";
}

/**
 * @param {Notch} notch @param {NotchState} state @param {string} sid
 * @param {string | null} target @param {string} launchedNote
 */
function notchLines(notch, state, sid, target, launchedNote) {
  const pointer = notch.id === target ? "  ← you asked for this one" : "";
  const out = [`   ${STATE_MARK[state]}  ${notch.label.padEnd(LABEL_WIDTH)}${notch.blurb}${pointer}`];
  if (state === "launched") out.push(`${ROW_INDENT}${launchedNote}`);
  if (state === "locked") {
    out.push(`${ROW_INDENT}${notch.lockedNote}`);
    // A relaunch is printed ONLY for a posture the launcher actually composes
    // (see RELAUNCH_OFFERS). Empty today, so a locked notch prints a reason and
    // no command — never a command the CLI would refuse.
    const offer = RELAUNCH_OFFERS[notch.id];
    if (offer) out.push(`${ROW_INDENT}→ ${offer(sid || "<session-id>")}`);
  }
  if (state === "reachable" && notch.resume) out.push(`${ROW_INDENT}→ ${notch.resume(sid || "<session-id>")}`);
  return out;
}

/** @param {string} launched @param {string} sid @param {boolean} hasMoves */
function footer(launched, sid, hasMoves) {
  const out = [
    "   The slider moves this session UP from the posture it launched at. It cannot",
    "   take anything out of a session that is already running.",
  ];
  // Only explain the locked clean room to a session that is not already in it.
  if (launched !== "product-floor") {
    out.push(
      "   The clean room — the only posture that evicts your personal skills, MCP",
      "   servers and bundled skills — is composed at boot, never mid-session, and no",
      "   launcher builds it yet. So it is shown, locked, with no command behind it:",
      "   this surface will not hand you a relaunch that the tool then refuses.",
    );
  }
  out.push(
    "",
    "   There is a floor below the clean room, and it is not on this slider: the",
    "   benchmark floor runs with slash commands off, so this command does not exist",
    "   there. It is the measurement placebo, not a place to sit — and the two floors",
    "   are always priced as separate arms, never averaged.",
    "",
  );
  out.push(
    ...(hasMoves
      ? [
          "   Running a → command starts a RESUMED session that carries this conversation",
          "   forward. This command cannot restart Claude Code for you — run it yourself.",
        ]
      : [
          "   No move is on offer from here, and this command",
          "   cannot restart Claude Code for you in any case: it will not print a command",
          "   that the tool would then refuse.",
        ]),
  );
  if (hasMoves && !sid) {
    out.push(
      "",
      "   (no session id in the environment — substitute your own, or run",
      "   `claude --resume` and pick this conversation from the list.)",
    );
  }
  if (launched !== "product-floor") {
    out.push(
      "",
      "   Two numbers, never one: `standing` above is the listing-line dose you pay",
      "   every session. A skill's full body is charged separately, on invoke.",
    );
  }
  return out;
}

export function main(/** @type {string[]} */ argv = process.argv.slice(2)) {
  const { text } = renderSlider({
    manifest: loadManifest(),
    sessionId: process.env[SESSION_ENV],
    target: argv.join(" "),
  });
  process.stdout.write(text);
  // Always exit 0: this is a display surface invoked from a slash command, and a
  // non-zero exit risks the harness dropping the very text that carries the P2
  // refusal. The COMPOSING surface (src/launcher.ts) is where P2 throws.
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
