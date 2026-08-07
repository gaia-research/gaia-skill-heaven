// The /skill-heaven posture renderer (WS4 step 2).
//
// BOUND BY: D12 · P1 · P2 · P3 · B1 · B2 · B4 · D6 · D9.
// (The original step-2 draft cited D13. D13 was RETIRED on 2026-07-24 and its id
// is on RATIFICATION.md's never-reused list, so nothing here may lean on it —
// re-bound by founder ruling V5-6. What the retired D13 was doing the work for
// is now split across D12, which actually rules the locked clean room, and P2,
// which rules the locked Hell row. See the `restraint` note below for the half
// of the retired D13 that had no live authority left at all.)
//
// THE CONTROL HAS NO NOUN — deliberately. `slider` and `notch` are banned in
// the federation lexicon (retired 2026-07-24, oracle N1/N5), and their listed
// replacements (`ladder`/`rung`) name the off…max ladder, which this surface is
// not — it is the mode/posture control, whose name is OPEN (founder ruling R2,
// 2026-07-29: "term or name is open, but the method is locked"). Until a name
// is ratified, rendered copy lists the postures and describes moves without
// naming the widget. Do not coin one here.
//
// ZERO DEPENDENCIES BY NECESSITY. Once claude-heaven is installed from the
// marketplace there is no node_modules next to it, so this file must run on
// plain Node with only `node:` builtins — it cannot import `skill-heaven`. Two
// consequences, both handled rather than hidden:
//   - the P2 (Hell-lane) gate list AND the core posture list are MACHINE-copied
//     from core into ../data/p2-gate.json by scripts/generate-p2-gate.ts, and a
//     freshness test byte-checks the artifact (no hand-authored literal);
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
// and `product-floor`, and the clean-room row here is `product-floor`:
//   - `floor` is the DOORLESS BENCHMARK floor, the placebo-of-record (B2). F6
//     established that `--disable-slash-commands` suppresses plugin commands
//     too, so at `floor` THIS COMMAND DOES NOT EXIST. The benchmark floor is
//     deliberately not a row: this surface cannot offer a door to a posture
//     that has none, and priced as its own arm (B1) it must never be pooled
//     with the product floor.
//   - `product-floor` is the DOORFUL PRODUCT floor — it keeps
//     `--disable-slash-commands` absent, and its P8 composition uses an empty
//     setting-sources allowlist so project scope is not admitted. The door
//     costs +515 tok in the locked F7 evidence. It is the only clean room
//     reachable by a session that can run `/skill-heaven` at all. Per founder
//     ruling R1 (2026-07-29) `clean-room` and `product-floor` are two names for
//     one thing — the cleanest launchable posture; neither name retires the
//     other.
// Nothing here records a benchmark arm: the placebo arm flag belongs to core's
// CLI, at the benchmark floor and nowhere else, and no path in this package
// composes one (a test pins the absence).
//
// PLUGIN-PATH NOTE (probed on 2.1.216): ${CLAUDE_PLUGIN_ROOT} is interpolated
// into the *command markdown*, but is NOT exported to the bash child, so this
// script locates its own data dir via import.meta.url rather than the env var.

import { readFileSync, realpathSync } from "node:fs";
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

/** @typedef {"launched" | "reachable" | "locked"} RowState */

/**
 * @typedef {object} PostureRow
 * @property {string} id
 * @property {string} label
 * @property {string} blurb
 * @property {"physical" | "gated"} kind
 * @property {string} [lockedNote]
 * @property {(sid: string) => string} [resume]
 * @property {(sid: string) => string} [relaunch] a BOOT command for this row —
 *   printed only if the row id is also in the machine-copied launchable list.
 *   A row may only carry one if the BARE command is accepted by the CLI: a
 *   posture that needs further arguments to compile (curated needs `--skill`)
 *   has no bare command to print, and gets no `relaunch`.
 */

/**
 * The rows, top (most context) to bottom (least). Only `product-floor` is
 * launcher-locked: gate (a) established that every other physical stop is
 * reachable on a continued session in either direction, and that user/global
 * skill eviction is reachable at boot only.
 *
 * `resume` is a function of the session id so the printed command is exact.
 * A row with no `resume` is never presented as something the user can run.
 *
 * NAMES THE STEP-2 DRAFT LISTED AND THIS SET DOES NOT — recorded, not silently
 * dropped, so nobody re-adds them from memory:
 *   - `lean` and `add-ons`. RETIRED as stops by founder ruling (V5-6 follow-up,
 *     2026-07-29): neither is a ratified term and neither is a posture — they
 *     were in-session flag moves wearing posture clothing on a shipped control
 *     surface. Unratified vocabulary does not get a row. They are `banned` in
 *     the federation lexicon with no replacement: the CONCEPT is gone from this
 *     surface, not renamed. `/skill-heaven lean` falls through to the ordinary
 *     unknown-name path — deliberately, because a bespoke explanation would
 *     keep the retired word alive in shipped copy.
 *   - the doorless BENCHMARK `floor` — no door by ruling (F6), see the header.
 *     It is core-known, so asking for it by name gets the "not offered here"
 *     line (never "unknown"), and the footer carries the shipped mechanism
 *     fact: slash commands are off there, so this command does not exist there.
 *   - `curated`. Its standing is OPEN (founder ruling R3, 2026-07-29, and
 *     RATIFICATION OPEN 1), so it gets no row and — deliberately — no status
 *     claim in any rendered string: asking for it by name gets the same "not
 *     offered here" line as any other core-known posture name. A test pins that
 *     a core-known name is never rendered as an unknown word. The launcher now
 *     composes it (`LAUNCHABLE_POSTURES` in src/cli.ts), which changes nothing
 *     here for two independent reasons: adding a row is a ruling on an OPEN
 *     posture that this surface has no standing to make, and a curated launch
 *     needs a `--skill <path>` per skill — arguments this surface cannot know.
 *     A bare `claude-heaven --posture curated` is REFUSED by the CLI, so
 *     printing one would be exactly the KC7 defect the offers map exists to
 *     prevent. The curated door is the CLI; it is not an affordance here.
 *   - `restraint`, the below-vanilla behavioral stop. It shipped as a
 *     "coming — research" row on D13's authority. D13 is retired, gate (e) is
 *     still UNVERIFIED, and RATIFICATION.md OPEN 1 has an unresolved proposal
 *     that behavioral restraint is "behavioral, not positional" — i.e. possibly
 *     not a posture stop at all. Rendering it as the bottom row would encode
 *     that provisional mapping in a constant, which OPEN 3 rules out
 *     explicitly. Its absence here is NOT a ruling on where restraint
 *     eventually lives; it is this surface declining to make one. Nothing else
 *     in the repo rides it.
 */
/** @type {PostureRow[]} */
export const POSTURE_ROWS = [
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
    // KC6: this is the harness-incapable class, not a policy hold — say so.
    // Gate (a) came back NEGATIVE: no flag or flag-combination evicts
    // user/global skills on a running session, so there is no key that a
    // future decision could turn; only a boot reaches it.
    lockedNote:
      "Composed at boot, never mid-session (D12) — not a policy hold, a harness limit: no flag or " +
      "flag-combination evicts skills on a running session. So it starts a new session:",
    kind: "physical",
    relaunch: () => "claude-heaven --posture product-floor",
  },
];

/**
 * The one sentence D12 forces onto every relaunch offer.
 *
 * D12 (CURRENT): an in-session control can move posture upward (additive) and
 * carry conversation history, but cannot descend BELOW its launch composition —
 * subtractive recomposition and history survival are mutually exclusive. The
 * clean room is below native, so reaching it is a BOOT, and a boot is a new
 * session. Printing the command without saying so would be offering a door while
 * silently dropping the user's conversation: KC7 — /skill-heaven never claims a
 * transition the harness cannot perform — is exactly the invariant that forbids
 * it. Not decoration; do not trim it to fit.
 */
const RELAUNCH_CAVEAT = "(a new session — this conversation does not carry over)";

/**
 * Postures this surface may print a `claude-heaven` relaunch command for, keyed
 * by row id.
 *
 * DERIVED, NEVER HAND-LISTED. It is the intersection of two things: rows that
 * carry a bare `relaunch` command, and `LAUNCHABLE_POSTURES` from src/cli.ts —
 * machine-copied into plugin/data/p2-gate.json by scripts/generate-p2-gate.ts,
 * because this file cannot import the CLI once installed from the marketplace.
 *
 * The bug this shape prevents: the surface used to tell a locked clean-room
 * session to "relaunch via `claude-heaven` to unlock the clean room" while
 * src/cli.ts refused every `--posture` outside `LAUNCHABLE_POSTURES` with
 * `exit 2`. Offering a door the tool slams is claiming a transition the harness
 * cannot perform (KC7). Deriving the offers from the capability list means the
 * affordance cannot outlive the capability: drop a posture from the CLI array,
 * regenerate the artifact, and the offer withdraws itself.
 *
 * FAILS CLOSED. Unreadable artifact → no offers → locked rows print their reason
 * and no command, which is the pre-existing honest rendering.
 *
 * A test walks every rendered mode and asserts that every
 * `claude-heaven --posture <p>` this file could print is accepted by the real
 * CLI validator, so the affordance and the validator cannot drift apart.
 *
 * @param {string[] | null} [launchable]
 * @returns {Record<string, (sid: string) => string>}
 */
export function buildRelaunchOffers(launchable) {
  const allowed = (launchable === undefined ? readLaunchablePostures() : launchable) ?? [];
  /** @type {Record<string, (sid: string) => string>} */
  const out = {};
  for (const row of POSTURE_ROWS) {
    if (row.kind !== "physical" || !row.relaunch) continue;
    if (!allowed.includes(row.id)) continue;
    out[row.id] = row.relaunch;
  }
  return out;
}

/** @type {Record<string, (sid: string) => string>} */
export const RELAUNCH_OFFERS = buildRelaunchOffers();

// Single-column glyphs only — a double-width emoji would break the label gutter
// in a terminal, and this text is rendered verbatim.
/** @type {Record<RowState, string>} */
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

/**
 * Reads the machine-copied core posture list from the same artifact (see
 * scripts/generate-p2-gate.ts). Used for one thing only: a core-known posture
 * name with no row is answered with "not offered here" rather than rendered as
 * an unknown word (refusal transparency) — with NO further claim about it.
 * Degrades to `null`: without the list an unmatched name gets the unknown-name
 * line, which claims nothing either. (P2 safety does not ride on this list —
 * gating fails closed via readGatedLevels above, checked first.)
 * @returns {string[] | null} null when the artifact is missing or corrupt.
 */
export function readKnownPostures(/** @type {string} */ dataDir = join(HERE, "..", "data")) {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, "p2-gate.json"), "utf-8"));
    const postures = parsed?.postures;
    if (Array.isArray(postures) && postures.every((p) => typeof p === "string")) return postures;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Reads the machine-copied `LAUNCHABLE_POSTURES` from the same artifact — the
 * postures src/cli.ts will actually compose. Used for one thing: gating which
 * rows may print a relaunch command (KC7). Degrades to `null` → no offers at
 * all, which is the fail-closed direction: a locked row with no command claims
 * nothing, a command the CLI refuses claims a transition it cannot perform.
 * @returns {string[] | null} null when the artifact is missing or corrupt.
 */
export function readLaunchablePostures(/** @type {string} */ dataDir = join(HERE, "..", "data")) {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, "p2-gate.json"), "utf-8"));
    const launchable = parsed?.launchablePostures;
    if (Array.isArray(launchable) && launchable.every((p) => typeof p === "string")) return launchable;
  } catch {
    /* fall through */
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
 * @returns {string | null} the posture name, "" for "no target", or null for
 * "not a posture name" (never echoed back).
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
 * @param {string} [opts.target] the posture the user asked for
 * @param {string[] | null} [opts.gatedLevels] machine-copied Hell-lane levels
 * @param {string[] | null} [opts.knownPostures] machine-copied core posture list
 * @returns {{ text: string, refused: boolean }}
 */
export function renderPosture(opts = {}) {
  const manifest = opts.manifest ?? null;
  const gated = opts.gatedLevels === undefined ? readGatedLevels() : opts.gatedLevels;
  const known = opts.knownPostures === undefined ? readKnownPostures() : opts.knownPostures;
  const target = normalizeTarget(opts.target);
  const sid = opts.sessionId || "";
  const launched = manifest?.posture ?? "native";

  // P2 first — never render the posture list around a Hell-lane request.
  if (isGatedTarget(target, gated)) return { text: refusal(target), refused: true };

  const launchedNote = manifest
    ? "← you launched here (via claude-heaven)"
    : "← you are here (vanilla claude)";

  const lines = ["⚡ Skill Heaven — posture", `   ${sessionLine(manifest)}`, "", "   ▲ more context"];
  // WHICH KINDS of `→` command this render actually prints. The footer explains
  // them, and the two kinds do OPPOSITE things to the conversation: a resume
  // carries it, a relaunch does not (D12). Tracking them separately is what
  // stops the footer from making the resume promise over a relaunch command.
  // Copy that explains an absent affordance is noise at best and an implied
  // offer at worst, so neither paragraph prints unless its command does.
  let hasResume = false;
  let hasRelaunch = false;
  for (const row of POSTURE_ROWS) {
    const state = rowState(row, launched);
    const rendered = rowLines(row, state, sid, target, launchedNote);
    if (rendered.resume) hasResume = true;
    if (rendered.relaunch) hasRelaunch = true;
    lines.push(...rendered.lines);
  }
  lines.push("   ▼ less context", "", ...footer(launched, sid, hasResume, hasRelaunch));

  if (target !== "" && !POSTURE_ROWS.some((r) => r.id === target)) {
    // ONE rule, no per-name prose (founder ruling, 2026-07-29): a name core
    // knows as a posture is "not offered here" — with no claim about what it
    // is or when that might change — and anything else is unknown. A
    // core-known posture name is never rendered as an unknown word (refusal
    // transparency); nothing here asserts a status that would need
    // re-ratifying when one moves.
    const coreKnown = target !== null && (known ?? []).includes(target);
    lines.push(
      "",
      coreKnown
        ? `   (\`${target}\` is not offered here — the postures above are the whole set on\n` +
          "   this surface.)"
        : `   (nothing called ${quoteTarget(target)} here — the postures above are the whole set.)`,
    );
  }
  return { text: `${lines.join("\n")}\n`, refused: false };
}

/** null target = unparseable. Fail CLOSED: without a readable gate list we
 * cannot tell a Heaven posture from a Hell level, so refuse anything unknown
 * rather than risk rendering a Hell stop as available (P2). */
/** @param {string | null} target @param {string[] | null} gated */
function isGatedTarget(target, gated) {
  if (target === "") return false;
  if (target === "hell") return true;
  if (gated === null) return !POSTURE_ROWS.some((r) => r.id === target);
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
    "   This is a policy hold, not a harness limit: the mechanism is composable",
    "   today and the key can turn once that bar is met.",
    "   /skill-heaven is the Heaven-lane control and will not compose a Hell posture.",
    "",
  ].join("\n");
}

/**
 * KC2 (Issue #9), corrected under A3/KC4: a scope NAME alone ("user+project
 * scope") tells a reader what the census is called, not what it is missing —
 * an exclusion cannot be inferred from a label by someone who has not read
 * census.ts. `scope: "user+project"` (native launches) is a partial census:
 * bundled CLI skills and plugin-provided skills are not counted. `scope:
 * "session"` (curated/product-floor) enumerates the launched skill SET
 * exactly, but the session's skill LISTING is not exact either: a bundled
 * skill named `doctor` survives `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`
 * regardless of posture — a founder-ruled, permanent, harness-level residual
 * measured live by packages/claude-heaven/scripts/probe-kc4-listing-
 * residual.sh (2/2 runs, claude 2.1.220; see packages/core/src/compile.ts's
 * curated note). Both curated and product-floor use an empty setting-sources
 * allowlist, so project-scope skills are not part of this disclosure; the
 * bundled `doctor` residual remains and is called out below.
 *
 * A5c fail-closed: explicit allowlist, not an `expected ? note : bare-label`
 * optimistic default — an unrecognized scope must still disclose that its
 * coverage is unknown rather than rendering as if it excluded nothing, same
 * discipline as `readGatedLevels`/`readLaunchablePostures` above. This
 * surface carries the full sentence; the statusline strip gets the compact
 * form (src/statusline.ts `scopeCaveat`) — keep both in sync.
 * @param {string} scope
 */
function scopeNote(scope) {
  if (scope === "user+project") {
    return `(${scope} scope — bundled CLI skills and plugin-provided skills are not counted)`;
  }
  if (scope === "session") {
    return `(${scope} scope — bundled \`doctor\` skill is not counted; a harness limitation, not this door's choice — see KC4)`;
  }
  return `(${scope} scope — coverage unknown; this door does not yet know what this scope excludes)`;
}

/** @param {LaunchManifest | null} manifest */
function sessionLine(manifest) {
  if (!manifest) {
    return "session: vanilla claude — no launch manifest, so no standing-dose readout here.";
  }
  // Both curated and product-floor use `scope: "session"`: their selected
  // skill sets are enumerated exactly, and the empty setting-sources allowlist
  // keeps project scope out of product-floor. The generic line below therefore
  // stays in sync with src/statusline.ts and its bundled `doctor` caveat.
  const floor = manifest.incomplete ? "+" : "";
  // A curated set of exactly one is now reachable, so the plural is no longer
  // safe to hard-code.
  const skills =
    typeof manifest.skillCount === "number"
      ? `${manifest.skillCount} skill${manifest.skillCount === 1 ? "" : "s"}, `
      : "";
  return (
    `session: launched at ${manifest.posture} · ${skills}` +
    `${formatTokens(manifest.standingTokens)}${floor} standing ${scopeNote(manifest.scope)}`
  );
}

/**
 * `launched === "floor"` (the doorless benchmark floor) cannot occur in
 * practice — this command does not exist there (F6) — so it deliberately
 * matches no row and the clean room stays locked, which is the honest
 * rendering for a session that somehow reports a posture with no door.
 * @param {PostureRow} row @param {string} launched @returns {RowState}
 */
function rowState(row, launched) {
  if (row.kind === "gated") return "locked";
  if (row.id === launched) return "launched";
  // D12: the clean room is composed at boot and cannot be reached mid-session.
  if (row.id === "product-floor") return "locked";
  return "reachable";
}

/**
 * @param {PostureRow} row @param {RowState} state @param {string} sid
 * @param {string | null} target @param {string} launchedNote
 * @returns {{ lines: string[], resume: boolean, relaunch: boolean }} which kinds
 * of command this row printed, so the footer describes only what is on screen.
 */
function rowLines(row, state, sid, target, launchedNote) {
  const pointer = row.id === target ? "  ← you asked for this one" : "";
  const lines = [`   ${STATE_MARK[state]}  ${row.label.padEnd(LABEL_WIDTH)}${row.blurb}${pointer}`];
  let resume = false;
  let relaunch = false;
  if (state === "launched") lines.push(`${ROW_INDENT}${launchedNote}`);
  if (state === "locked") {
    lines.push(`${ROW_INDENT}${row.lockedNote}`);
    // A relaunch is printed ONLY for a posture the launcher actually composes
    // (see RELAUNCH_OFFERS) — never a command the CLI would refuse. And never
    // without the D12 caveat on the very next line: a relaunch is a boot, and a
    // boot does not carry this conversation.
    const offer = RELAUNCH_OFFERS[row.id];
    if (offer) {
      lines.push(`${ROW_INDENT}→ ${offer(sid || "<session-id>")}`);
      lines.push(`${ROW_INDENT}  ${RELAUNCH_CAVEAT}`);
      relaunch = true;
    }
  }
  if (state === "reachable" && row.resume) {
    lines.push(`${ROW_INDENT}→ ${row.resume(sid || "<session-id>")}`);
    resume = true;
  }
  return { lines, resume, relaunch };
}

/**
 * @param {string} launched @param {string} sid
 * @param {boolean} hasResume @param {boolean} hasRelaunch
 */
function footer(launched, sid, hasResume, hasRelaunch) {
  const out = [
    "   A session moves UP only, from the posture it launched at: nothing can be",
    "   taken out of a session that is already running.",
  ];
  // Only explain the locked clean room to a session that is not already in it.
  if (launched !== "product-floor") {
    out.push(
      "   The clean room — the only posture that evicts your personal skills, MCP",
      "   servers and bundled skills — is composed at boot, never mid-session. It is",
      hasRelaunch
        ? "   shown locked here, with the command that BOOTS one: that is a fresh session,"
        : "   shown locked here, with no command behind it: nothing on this surface will",
      hasRelaunch
        ? "   and this conversation stays where it is."
        : "   hand you a relaunch that the tool then refuses.",
    );
  }
  out.push(
    "",
    "   There is a floor below the clean room, and it is not offered here: the",
    "   benchmark floor runs with slash commands off, so this command does not exist",
    "   there — a harness fact, not a policy choice: there is no key to turn, only a",
    "   route with no door on it. It is the measurement placebo, not a place to sit",
    "   — and the two floors are always priced as separate arms, never averaged.",
    "",
  );
  // The two kinds of → command do OPPOSITE things to this conversation, so each
  // is described only when it is actually on screen, and never in the other's
  // words. D12: a resume carries history and cannot subtract; a boot subtracts
  // and cannot carry history. There is no command that does both.
  if (hasResume) {
    out.push(
      "   A `claude --resume` command starts a RESUMED session that carries this",
      "   conversation forward.",
    );
  }
  if (hasRelaunch) {
    out.push(
      "   A `claude-heaven` command BOOTS a new session at a posture that cannot be",
      "   reached from inside this one. It does not carry this conversation: nothing",
      "   here can subtract from a running session and keep its history.",
    );
  }
  out.push(
    ...(hasResume || hasRelaunch
      ? ["   This command cannot restart Claude Code for you — run it yourself."]
      : [
          "   No move is on offer from here, and this command",
          "   cannot restart Claude Code for you in any case: it will not print a command",
          "   that the tool would then refuse.",
        ]),
  );
  if (hasResume && !sid) {
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
  const { text } = renderPosture({
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

// KC1 fresh-environment check caught this: the textbook `import.meta.url ===
// pathToFileURL(process.argv[1]).href` idiom compares a REALPATH-resolved
// import.meta.url against the RAW argv[1] path. On macOS (and in some
// container/sandbox setups) both `/tmp` and `/var` are symlinks to
// `/private/tmp` / `/private/var` — so a plugin cache path that happens to
// route through either one makes the two sides disagree, `invokedDirectly`
// comes back false, `main()` never runs, and the command silently prints
// nothing (exit 0, empty stdout — no error a user or a naive check would
// catch). Resolving argv[1] through realpath before comparing closes that
// gap; verify-marketplace-install.mjs pins this by running the script from a
// symlink-routed temp dir and asserting on real stdout content.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) main();
