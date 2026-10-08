import type { SkillHeavenStatus, SummonEvent } from '@gaia-skill-heaven/status'

/** Fixture rows are handed down from Console.tsx — the one module that imports
 * the fixtures — so nothing else in this folder can reach design data. */
export interface StatusEntry {
  key: string
  label: string
  status: SkillHeavenStatus
}

export interface EventEntry {
  key: string
  label: string
  event: SummonEvent
}

export interface ScopeCase {
  id: string
  label: string
  status: SkillHeavenStatus
  event: SummonEvent | null
}
