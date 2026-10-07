// The instrument palette (docs/CONTROL-PLANE.md §4). One table for the site,
// the console mod and the terminal. Roles, not colours, are what the renderer
// emits; each projection paints a role in its own medium.

export type Role =
  | "umbrella" // ◇ and the word "entropy"
  | "ultra" // ◆, ULTRA, controller fields
  | "zero"
  | "heaven" // ‹‹ and converge
  | "hell" // ›› and explore — never red
  | "ink" // primary values
  | "dim" // separators, labels, secondary values
  | "arbor" // canonical Arbor evidence only
  | "stop" // real failure only — never Hell
  | "amber"; // FIXTURE / PREVIEW / PROVISIONAL / stale

export interface RoleColor {
  hex: `#${string}`;
  ansi256: number;
  /** SGR foreground code for the 16-colour ladder. */
  ansi16: number;
  /** CSS custom property the site and docs use for this role. */
  cssVar: `--sh-${string}`;
}

export const ROLE_COLORS: Readonly<Record<Role, RoleColor>> = Object.freeze({
  umbrella: { hex: "#a58ae0", ansi256: 141, ansi16: 35, cssVar: "--sh-violet" },
  ultra: { hex: "#d9b25c", ansi256: 179, ansi16: 33, cssVar: "--sh-ultra" },
  zero: { hex: "#5fc2d6", ansi256: 80, ansi16: 36, cssVar: "--sh-zero" },
  heaven: { hex: "#6f96d8", ansi256: 68, ansi16: 34, cssVar: "--sh-heaven" },
  hell: { hex: "#e094c8", ansi256: 175, ansi16: 95, cssVar: "--sh-hell" },
  ink: { hex: "#eeebe6", ansi256: 255, ansi16: 39, cssVar: "--sh-bone" },
  dim: { hex: "#9a9691", ansi256: 246, ansi16: 90, cssVar: "--sh-dim" },
  arbor: { hex: "#55c878", ansi256: 77, ansi16: 32, cssVar: "--sh-arbor" },
  stop: { hex: "#c81e1e", ansi256: 160, ansi16: 31, cssVar: "--sh-stop" },
  amber: { hex: "#e0b45c", ansi256: 179, ansi16: 33, cssVar: "--sh-amber" },
});

/** The ground every role is checked against (≥ 4.5:1 for text roles). */
export const GROUND_HEX = "#1b1a1c";
