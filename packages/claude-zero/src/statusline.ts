// The statusline segment (docs/CONTROL-PLANE.md §2, §3, §5.1). The instrument —
// the entropy reading, `skills N`, `summons N` — is a projection of the one
// status model in @gaia-skill-heaven/status. This file owns only the door's own
// facts, appended after the instrument: the standing-dose readout (the N8 "pain
// moment") and Claude Code's live ctx%.
//
// Pure: no IO, deterministic. statusline-cli.ts reads the profile manifest,
// the summon session and the statusline stdin JSON, and hands the values here.
//
// TWO NUMBERS, TWO SCOPES (matrix gate (b), B1). `standing` is the skills-only
// STANDING dose, census-derived from the launched profile (baked into the
// manifest at launch — it does not change mid-session). The optional `ctx%` is
// Claude Code's live `context_window.used_percentage`: whole-session RUNNING
// usage (system + skills + messages + tool results), a different scope — so it is
// rendered as a clearly separate readout and never conflated with the standing
// dose. No statusline-input field isolates the standing number (GB-3), which is
// exactly why standing must come from the census, not from stdin.

import {
  paintAnsi,
  readingFromProfileManifest,
  renderStatusSegments,
  segmentsWidth,
  statusLevels,
  type ColorDepth,
  type Segment,
  type SkillHeavenStatus,
  type StatusMode,
} from "@gaia-skill-heaven/status";
import type { Posture } from "skill-zero";

export interface ProfileManifest {
  schema: "claude-zero/profile@1";
  posture: Posture;
  /** census-derived standing dose (chars4 tokens) over the launched profile */
  standingTokens: number;
  skillCount: number;
  /** census scope disclosure, e.g. "user+project" or "session" (see
   * census.ts). Typed as plain `string`, not a union — a third scope can be
   * added upstream without this field's type forcing every reader to update
   * in lockstep. That is exactly why `scopeCaveat` below must fail closed on
   * an unrecognized value (A5c): nothing here stops one from arriving. */
  scope: string;
  /** true when a skill root existed but couldn't be read — standingTokens is a
   * floor, not a complete count. Rendered as a trailing "+" so the readout never
   * presents an under-count as exact (B4). */
  incomplete?: boolean;
  /** true when launched via the claude-zero launcher (the subtractive floor is
   * reachable); false under vanilla claude. Consumed by the WS4-step-2 picker. */
  launcherLocked: boolean;
  createdAt?: string;
}

/** The subset of Claude Code's statusline stdin JSON we read. Field names are
 * authoritative from the 2.1.216 binary probe (matrix gate (b), GB-2). */
export interface StatuslineInput {
  context_window?: {
    used_percentage?: number;
    total_input_tokens?: number;
    context_window_size?: number;
  };
}

/** The summon session facts the instrument shows (§2.2). `null` is unknown and
 * renders as unknown (`? skills`), never as 0. */
export interface SummonSessionFacts {
  /** skills materialized in this session */
  skills: number | null;
  /** summon calls recorded this session (full mode only) */
  summons: number | null;
  /** the most recent materialized skill's name */
  lastArrival: string | null;
}

export interface StatuslineOptions {
  /** SKILL_HEAVEN_STATUS. Default `compact`. `off` renders nothing at all. */
  mode?: StatusMode;
  /** Terminal width in cells, when known. Absent = no budget. */
  columns?: number;
  /** Paint depth. Default `none` (plain text, every word and glyph present). */
  colorDepth?: ColorDepth;
}

/** 14200 → "14.2k"; 57 → "57"; sub-1k stays exact (standing doses run small). */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

/** Compact exclusion disclosure (KC2, corrected under A3/KC4/P8). `scope:
 * "user+project"` (native launches) is a partial census: bundled CLI skills
 * and plugin-provided skills are not counted (see census.ts header). `scope:
 * "session"` (curated/product-floor) enumerates the launched skill SET
 * exactly, but the session's skill LISTING is not exact: a bundled skill
 * named `doctor` survives `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` regardless
 * of posture — a founder-ruled, permanent, harness-level residual, measured
 * live by packages/claude-zero/scripts/probe-kc4-listing-residual.sh
 * (2/2 runs, claude 2.1.220; see packages/core/src/compile.ts's curated
 * note). Both curated and product-floor now use an empty setting-sources
 * allowlist, so project-scope skills are not part of this session disclosure;
 * `doctor` is the remaining disclosed residual.
 *
 * A5c fail-closed: this is an explicit allowlist, not an
 * `expected ? caveat : ""` optimistic default. Any scope value this function
 * does not recognize — including a future third scope nobody has named yet —
 * renders a "coverage unknown" caveat rather than silence, matching the
 * fail-closed discipline `readGatedLevels`/`readLaunchablePostures` already
 * use elsewhere in this door. The narrow statusline strip gets the compact
 * form; `/skill-zero`'s session line carries the fuller sentence
 * (render-posture.mjs `sessionLine` / `scopeNote`) — keep both in sync. */
function scopeCaveat(scope: string): string {
  if (scope === "user+project") return " (excl. bundled/plugin)";
  if (scope === "session") return " (excl. bundled doctor)";
  return " (coverage unknown)";
}

/** The standing phrase.
 *
 * Every posture reads as "<n> standing", where a trailing `+` means the
 * census could not see everything and `n` is therefore a floor, not a total
 * (native: `14.2k+ standing`). Session-scoped curated and product-floor
 * manifests enumerate their selected set, while `scopeCaveat` discloses the
 * bundled `doctor` residual measured in the live listing.
 */
function standingPhrase(manifest: ProfileManifest): string {
  const floor = manifest.incomplete ? "+" : "";
  return `${formatTokens(manifest.standingTokens)}${floor} standing${scopeCaveat(manifest.scope)}`;
}

const SEP: Segment = { text: " · ", role: "dim" };

/** The door's own facts, richest first. Under width pressure they are dropped
 * in this order — ctx% first, then standing — and only then does the
 * instrument itself degrade (the reading is the last thing to go). */
function doorSuffixTiers(manifest: ProfileManifest, input: StatuslineInput | null | undefined): Segment[][] {
  const standing: Segment[] = [SEP, { text: standingPhrase(manifest), role: "dim" }];
  const pct = input?.context_window?.used_percentage;
  const ctx: Segment[] = typeof pct === "number" && Number.isFinite(pct) ? [SEP, { text: `${Math.round(pct)}% ctx`, role: "dim" }] : [];
  return [[...standing, ...ctx], standing, []];
}

/** The richest instrument level, then the door facts that fit beside it. With
 * no budget everything is shown. Otherwise door facts are dropped first (ctx,
 * then standing); only when not even the richest level fits beside no door
 * facts does the instrument step down to a narrower level. */
function composeSegments(status: SkillHeavenStatus, mode: StatusMode, tiers: Segment[][], columns: number | undefined): Segment[] {
  const richest = statusLevels(status, mode)[0];
  if (!richest) return [];
  if (columns === undefined) return [...richest, ...tiers[0]!];
  for (const tier of tiers) {
    if (segmentsWidth(richest) + segmentsWidth(tier) <= columns) return [...richest, ...tier];
  }
  return renderStatusSegments(status, mode, columns);
}

/** The one statusline line: the instrument (§3 grammar) followed by the door's
 * facts. Pure — the CLI supplies the manifest, session facts and stdin JSON. */
export function renderStatusline(
  manifest: ProfileManifest,
  input?: StatuslineInput | null,
  session?: SummonSessionFacts | null,
  options: StatuslineOptions = {},
): string {
  const mode = options.mode ?? "compact";
  if (mode === "off") return "";
  const status: SkillHeavenStatus = {
    reading: readingFromProfileManifest(manifest),
    skills: session?.skills ?? null,
    summons: session?.summons ?? null,
    lastArrival: session?.lastArrival ?? null,
    controller: { kind: "not-selected" },
    summonTool: "unknown",
  };
  const columns = options.columns !== undefined && options.columns > 0 ? options.columns : undefined;
  const segments = composeSegments(status, mode, doorSuffixTiers(manifest, input), columns);
  return paintAnsi(segments, options.colorDepth ?? "none");
}

export function parseStatuslineInput(raw: string): StatuslineInput | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const parsed: unknown = JSON.parse(s);
    return parsed && typeof parsed === "object" ? (parsed as StatuslineInput) : null;
  } catch {
    return null;
  }
}

/** A skill materialized into this session's summon root (session.json
 * at SKILL_SUMMON_SESSION). Only the fields the statusline segment needs. */
export interface HellSummonedSkill {
  id: string;
}

/** The subset of the summon engine's session.json this door reads. */
export interface HellSessionManifest {
  skills: HellSummonedSkill[];
}

/** Validate just enough to render safely — same minimal-shape discipline as
 * isProfileManifest above. */
export function isHellSessionManifest(value: unknown): value is HellSessionManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return Array.isArray(m.skills) && m.skills.every((s) => s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string");
}

const MANIFEST_KEYS: Array<keyof ProfileManifest> = ["schema", "posture", "standingTokens", "skillCount", "scope", "launcherLocked"];

/** Validate a parsed manifest just enough to render safely. */
export function isProfileManifest(value: unknown): value is ProfileManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    m.schema === "claude-zero/profile@1" &&
    typeof m.posture === "string" &&
    typeof m.standingTokens === "number" &&
    typeof m.skillCount === "number" &&
    typeof m.scope === "string" &&
    typeof m.launcherLocked === "boolean" &&
    MANIFEST_KEYS.every((k) => k in m)
  );
}
