// The statusline segment — the ambient posture + standing-dose readout that
// creates the "pain moment" (D10). Pure render, unit-tested; all IO lives in
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
  /** census scope disclosure, e.g. "user+project" (see census.ts) */
  scope: string;
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

export function renderStatusline(manifest: ProfileManifest, input?: StatuslineInput | null): string {
  const parts = [`⚡ ${manifest.posture} · ${formatTokens(manifest.standingTokens)} standing`];
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
