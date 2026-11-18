// ─────────────────────────────────────────────────────────────────────────
// The visit's Lucy (owner, 2026-11-18): "Lucy Rive default, but if user
// skipped rive assets loading page (should show up once someone goes to the
// site) then static. Similar behavior to the home page. Nothing should be
// loaded twice."
//
// The entrance shows once per page load, on whichever page the visitor
// arrives at (/ or /landing). Its outcome holds for every page after it:
//   · 'live'   — the rig came up; later pages go live without an entrance
//   · 'static' — Skip, or Rive cannot run here; later pages use the masters
// It lives in module memory, not storage: a reload offers the live figure
// again (the 2026-11-04 rule kept Skip free of a persisted flag).
// ─────────────────────────────────────────────────────────────────────────

import { abortSharedFetches } from './rive/sharedFetch'

export type LucyVisit = 'unset' | 'live' | 'static'

let visit: LucyVisit = 'unset'

export function lucyVisit(): LucyVisit {
  return visit
}

/** Record the entrance's outcome. 'static' is final for the visit. */
export function setLucyVisit(next: Exclude<LucyVisit, 'unset'>): void {
  if (visit === 'static') return
  visit = next
  // Static for the rest of the visit: nothing more of the live figure is needed.
  if (next === 'static') abortSharedFetches()
}

/** Test seam. */
export function resetLucyVisit(): void {
  visit = 'unset'
}
