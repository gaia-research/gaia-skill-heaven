// The statusline segment — the ambient posture + standing-dose readout that
// creates the "pain moment" (N8: the user reaches for this when it hurts).
// Pure render, unit-tested; all IO lives in
// statusline-cli.ts so this stays deterministic.
//
// TWO NUMBERS, TWO SCOPES (matrix gate (b), B1). `standing` is the skills-only
// STANDING dose, census-derived from the launched profile (baked into the
// manifest at launch — it does not change mid-session). The optional `ctx%` is
// Claude Code's live `context_window.used_percentage`: whole-session RUNNING
// usage (system + skills + messages + tool results), a different scope — so it is
// rendered as a clearly separate readout and never conflated with the standing
// dose. No statusline-input field isolates the standing number (GB-3), which is
// exactly why standing must come from the census, not from stdin.

import type { Posture } from "skill-heaven";

export interface ProfileManifest {
  schema: "claude-heaven/profile@1";
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
  /** true when launched via the claude-heaven launcher (the subtractive floor is
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

/** 14200 → "14.2k"; 57 → "57"; sub-1k stays exact (standing doses run small). */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

/** Compact exclusion disclosure (KC2, corrected under A3/KC4). `scope:
 * "user+project"` (native launches) is a partial census: bundled CLI skills
 * and plugin-provided skills are not counted (see census.ts header). `scope:
 * "session"` (curated/product-floor) enumerates the launched skill SET
 * exactly, but the session's skill LISTING is not exact: a bundled skill
 * named `doctor` survives `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` regardless
 * of posture — a founder-ruled, permanent, harness-level residual, measured
 * live by packages/claude-heaven/scripts/probe-kc4-listing-residual.sh
 * (2/2 runs, claude 2.1.220; see packages/core/src/compile.ts's curated
 * note). The old "session scope has nothing to disclose" claim this
 * replaces was FALSE — see launcher.ts's KC4 correction. This caveat's
 * wording assumes the concurrent fix to the curated composition (dropping
 * the project-scope leak the same probe found) has landed, so `doctor` is
 * the only residual; if that fix has not landed, this under-discloses —
 * see the PR body for the dependency.
 *
 * A5c fail-closed: this is an explicit allowlist, not an
 * `expected ? caveat : ""` optimistic default. Any scope value this function
 * does not recognize — including a future third scope nobody has named yet —
 * renders a "coverage unknown" caveat rather than silence, matching the
 * fail-closed discipline `readGatedLevels`/`readLaunchablePostures` already
 * use elsewhere in this door. The narrow statusline strip gets the compact
 * form; `/skill-heaven`'s session line carries the fuller sentence
 * (render-posture.mjs `sessionLine` / `scopeNote`) — keep both in sync. */
function scopeCaveat(scope: string): string {
  if (scope === "user+project") return " (excl. bundled/plugin)";
  if (scope === "session") return " (excl. bundled doctor)";
  return " (coverage unknown)";
}

export function renderStatusline(manifest: ProfileManifest, input?: StatuslineInput | null): string {
  const floor = manifest.incomplete ? "+" : "";
  const parts = [
    `⚡ ${manifest.posture} · ${formatTokens(manifest.standingTokens)}${floor} standing${scopeCaveat(manifest.scope)}`,
  ];
  const pct = input?.context_window?.used_percentage;
  if (typeof pct === "number" && Number.isFinite(pct)) {
    parts.push(`${Math.round(pct)}% ctx`);
  }
  return parts.join(" · ");
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

const MANIFEST_KEYS: Array<keyof ProfileManifest> = ["schema", "posture", "standingTokens", "skillCount", "scope", "launcherLocked"];

/** Validate a parsed manifest just enough to render safely. */
export function isProfileManifest(value: unknown): value is ProfileManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    m.schema === "claude-heaven/profile@1" &&
    typeof m.posture === "string" &&
    typeof m.standingTokens === "number" &&
    typeof m.skillCount === "number" &&
    typeof m.scope === "string" &&
    typeof m.launcherLocked === "boolean" &&
    MANIFEST_KEYS.every((k) => k in m)
  );
}
