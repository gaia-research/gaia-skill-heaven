/** WCAG 2.x relative luminance and contrast ratio. Pure; computed, never typed in. */

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export type ContrastGrade = 'text' | 'large' | 'glyph-only'

/** ≥4.5 passes body text (AA); ≥3 passes large text and UI graphics; below that is not for text at all. */
export function gradeContrast(ratio: number): ContrastGrade {
  if (ratio >= 4.5) return 'text'
  if (ratio >= 3) return 'large'
  return 'glyph-only'
}
