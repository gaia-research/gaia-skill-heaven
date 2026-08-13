import lucyHeaven from '../../assets/lucy/v3/masters/lucy-heaven.webp'
import lucyHell from '../../assets/lucy/v3/masters/lucy-hell.webp'
import lucyUltra from '../../assets/lucy/v3/masters/lucy-ultra.webp'
import katanaHeaven from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-heaven.webp'
import katanaHell from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-hell.webp'
import katanaUltra from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-ultra.webp'
import slashArc from '../../assets/lucy/frontpage/katana-authority-v2/lucy-katana-slash-01.webp'

export type LucyHeroState = 'heaven' | 'hell' | 'ultra'

/** Approved character sources for the live prototype: v3 registered bodies. */
export const HERO_ASSETS: Record<LucyHeroState, { lucy: string; katana: string; slashArc: string }> = {
  heaven: { lucy: lucyHeaven, katana: katanaHeaven, slashArc },
  hell: { lucy: lucyHell, katana: katanaHell, slashArc },
  ultra: { lucy: lucyUltra, katana: katanaUltra, slashArc },
}
