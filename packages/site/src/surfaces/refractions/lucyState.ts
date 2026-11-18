/**
 * Lucia Refractions — the one page-level state for /landing.
 *
 * Lucy is the heroine and the page is her instrument: every control that
 * names a surface (the hero handoff, a sampler tab, a rung, a direction card,
 * her own switch) casts her into that state, and the glass the page is built
 * from is cut by it (refractions.css reads `data-lucy` on the page root).
 *
 * Design of record: docs/design/landing-refractions/DESIGN-BRIEF.md (§7).
 * Nothing here invents product behaviour; a state is a visual reading of the
 * surface the visitor chose, never an enforced rung.
 */

import type { SceneState } from '../../lucy-scene/scene'

export type LucyState = SceneState

export const LUCY_STATES: readonly LucyState[] = ['zero', 'heaven', 'hell', 'ultra']

/** The hero's own band grounds (useHeroEngine HERO), so the seam is exact. */
export const STAGE_GROUND: Record<LucyState, string> = {
  zero: '#1B1A1C',
  heaven: '#000000',
  hell: '#F4F2EE',
  ultra: '#080604',
}

/** The hero's state word, continued onto the stage as the seam. */
export const STATE_WORD: Record<LucyState, string> = {
  zero: 'ZERO',
  heaven: 'HEAVEN',
  hell: 'HELL',
  ultra: 'ULTRA',
}

/** Read by assistive tech once per cast. */
export const STATE_ANNOUNCE: Record<LucyState, string> = {
  zero: 'Lucy · Zero — the floor',
  heaven: 'Lucy · Heaven — converge',
  hell: 'Lucy · Hell — explore',
  ultra: 'Lucy · Ultra — the crown',
}

export const STATE_ALT: Record<LucyState, string> = {
  zero: 'Lucy in Skill Zero: seated at rest, eyes closed, a single katana, no wings.',
  heaven: 'Lucy in Skill Heaven: falling with her hair lifting, both diamond eyes open, one katana.',
  hell: 'Lucy in Skill Hell: the inverted Heaven, both eyes closed, a single red tear.',
  ultra: 'Lucy in Skill Ultra: one gold diamond eye open, the other closed with a red tear, two katanas.',
}

/**
 * Where her canonical tear begins, as a fraction of the v5 delivery master
 * (measured from the masters; see the brief §8.1). Only Hell and Ultra carry
 * the tear. Used solely by the founder-gated `?tear=1` preview (D-03).
 */
export const TEAR_ORIGIN: Partial<Record<LucyState, { x: number; y: number }>> = {
  hell: { x: 0.448, y: 0.23 },
  ultra: { x: 0.446, y: 0.218 },
}

/** First frame: the band the visitor left the hero in. */
export function lucyFromLocation(search: string, state: unknown): LucyState {
  const params = new URLSearchParams(search)
  const tab = (state as { tab?: string } | null)?.tab ?? params.get('tab')
  if (tab === 'heaven' || tab === 'hell' || tab === 'ultra' || tab === 'zero') return tab
  const section = (state as { scrollTo?: string } | null)?.scrollTo ?? params.get('section')
  // The hero's Zero band opens the door on #doors with no tab.
  if (section === 'doors') return 'zero'
  // Heaven is the hero's out-of-the-box band.
  return 'heaven'
}

/** A sampler tab names a surface only for these modes; `all` and `summon` leave her be. */
export function lucyFromSampler(mode: string): LucyState | null {
  return mode === 'zero' || mode === 'heaven' || mode === 'hell' || mode === 'ultra' ? mode : null
}

/**
 * The hero's per-state framing (variations/hero/useHeroEngine.ts FIG_CONFIG),
 * expressed relative to Heaven: the masters are framed differently (Zero is a
 * close portrait, Ultra a wider crown), so drawing all four at one size makes
 * Zero and Ultra read too big. `k` = hero zoom / Heaven's zoom (1.59);
 * `origin` is the hero's measured face centre, so the face stays put.
 */
export const FIG_FRAME: Record<LucyState, { k: number; origin: string }> = {
  zero: { k: 1.0 / 1.59, origin: '47% 30%' },
  heaven: { k: 1, origin: '49% 27%' },
  hell: { k: 1.68 / 1.59, origin: '47% 30%' },
  ultra: { k: 1.4 / 1.59, origin: '45% 24%' },
}
