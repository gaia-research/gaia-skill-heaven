// Untrusted display text (#137 "Security", #85).
//
// Every skill name, source label, query and reason that reaches a projection
// arrived from the network or from a skill's own metadata. It is rendered as a
// value inside a fixed field, never as instrument chrome:
//   - ANSI / OSC escape sequences are removed, so only our renderer emits colour;
//   - C0/C1 controls and bidi overrides are removed, so a value cannot open a
//     line of its own, move the cursor, or reorder what surrounds it;
//   - the instrument's own glyphs are replaced, so a name cannot paint a fake
//     reading such as `◆ [ULTRA APPROVED]`;
//   - whitespace collapses to single spaces and the value is length-bounded.

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/** Glyphs only the renderer may draw. Mapped to plain look-alikes. */
const RESERVED: ReadonlyMap<string, string> = new Map([
  ["◇", "*"],
  ["◆", "*"],
  ["‹", "<"],
  ["›", ">"],
  ["×", "x"],
]);

export const DEFAULT_FIELD_LIMIT = 48;

export function sanitizeDisplay(value: unknown, limit: number = DEFAULT_FIELD_LIMIT): string {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(ANSI, "").replace(BIDI, "").replace(CONTROLS, " ");
  let out = "";
  for (const ch of text) out += RESERVED.get(ch) ?? ch;
  text = out.replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  if (limit > 0 && chars.length > limit) return chars.slice(0, Math.max(1, limit - 1)).join("") + "…";
  return text;
}

/** Display width in terminal cells for the strings this package emits. The
 * instrument glyphs are all single-cell; wide East Asian characters in an
 * untrusted name count as two so narrow layouts never overflow. */
export function cellWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}
