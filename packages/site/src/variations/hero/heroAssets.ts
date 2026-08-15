import lucyHeavenSetA from '../../assets/lucy/v4-approved/set-a/masters/lucy-heaven.webp'
import lucyHellSetA from '../../assets/lucy/v4-approved/set-a/masters/lucy-hell.webp'
import lucyUltraSetA from '../../assets/lucy/v4-approved/set-a/masters/lucy-ultra.webp'
import lucyZeroSetA from '../../assets/lucy/v4-approved/set-a/masters/lucy-zero.webp'
import lucyHeavenSetB from '../../assets/lucy/v4-approved/set-b/masters/lucy-heaven.webp'
import lucyHellSetB from '../../assets/lucy/v4-approved/set-b/masters/lucy-hell.webp'
import lucyUltraSetB from '../../assets/lucy/v4-approved/set-b/masters/lucy-ultra.webp'
import lucyZeroSetB from '../../assets/lucy/v4-approved/set-b/masters/lucy-zero.webp'
import lucyHeavenSetC from '../../assets/lucy/v4-approved/set-c/masters/lucy-heaven.webp'
import lucyHellSetC from '../../assets/lucy/v4-approved/set-c/masters/lucy-hell.webp'
import lucyUltraSetC from '../../assets/lucy/v4-approved/set-c/masters/lucy-ultra.webp'
import katanaHeaven from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-heaven.webp'
import katanaHell from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-hell.webp'
import katanaUltra from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-ultra.webp'
import slashArc from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-slash-01.webp'

// Set C ships no bespoke Zero master yet — fall back to Set A's so every set
// resolves a Zero figure. Hero + landing default to Set A regardless.
const lucyZeroSetC = lucyZeroSetA

export type LucyHeroState = 'zero' | 'heaven' | 'hell' | 'ultra'
export type LucyAssetSet = 'a' | 'b' | 'c'

export interface LucyHeroAsset {
  lucy: string
  katana: string
  slashArc: string
}

export type LucyHeroAssetSet = Record<LucyHeroState, LucyHeroAsset>

/**
 * Owner-approved v4 Lucy character sets. The `a`/`b`/`c` identifiers name
 * character-art sets, not the two independently-designed page layouts.
 */
export const HERO_ASSET_SETS: Record<LucyAssetSet, LucyHeroAssetSet> = {
  a: {
    zero: { lucy: lucyZeroSetA, katana: katanaHeaven, slashArc },
    heaven: { lucy: lucyHeavenSetA, katana: katanaHeaven, slashArc },
    hell: { lucy: lucyHellSetA, katana: katanaHell, slashArc },
    ultra: { lucy: lucyUltraSetA, katana: katanaUltra, slashArc },
  },
  b: {
    zero: { lucy: lucyZeroSetB, katana: katanaHeaven, slashArc },
    heaven: { lucy: lucyHeavenSetB, katana: katanaHeaven, slashArc },
    hell: { lucy: lucyHellSetB, katana: katanaHell, slashArc },
    ultra: { lucy: lucyUltraSetB, katana: katanaUltra, slashArc },
  },
  c: {
    zero: { lucy: lucyZeroSetC, katana: katanaHeaven, slashArc },
    heaven: { lucy: lucyHeavenSetC, katana: katanaHeaven, slashArc },
    hell: { lucy: lucyHellSetC, katana: katanaHell, slashArc },
    ultra: { lucy: lucyUltraSetC, katana: katanaUltra, slashArc },
  },
}

export const DEFAULT_LUCY_ASSET_SET: LucyAssetSet = 'a'

/** Keeps malformed review URLs on the approved Set A default. */
export function normalizeLucyAssetSet(value?: string): LucyAssetSet {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'b' || normalized === 'c' || normalized === 'a'
    ? normalized
    : DEFAULT_LUCY_ASSET_SET
}

/** Backwards-compatible default used by existing hero code. */
export const HERO_ASSETS: LucyHeroAssetSet = HERO_ASSET_SETS[DEFAULT_LUCY_ASSET_SET]
