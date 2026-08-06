import wingLeftV01 from '../../assets/hero-commission/v01/wing-left.png'
import wingRightV01 from '../../assets/hero-commission/v01/wing-right.png'
import swordV01 from '../../assets/hero-commission/v01/sword.png'
import swordDebrisV01 from '../../assets/hero-commission/v01/sword-debris.png'
import slashArcV01 from '../../assets/hero-commission/v01/slash-arc.png'

import wingLeftV02 from '../../assets/hero-commission/v02/wing-left.png'
import wingRightV02 from '../../assets/hero-commission/v02/wing-right.png'
import swordV02 from '../../assets/hero-commission/v02/sword.png'
import swordDebrisV02 from '../../assets/hero-commission/v02/sword-debris.png'
import slashArcV02 from '../../assets/hero-commission/v02/slash-arc.png'

import wingLeftV03 from '../../assets/hero-commission/v03/wing-left.png'
import wingRightV03 from '../../assets/hero-commission/v03/wing-right.png'
import swordV03 from '../../assets/hero-commission/v03/sword.png'
import swordDebrisV03 from '../../assets/hero-commission/v03/sword-debris.png'
import slashArcV03 from '../../assets/hero-commission/v03/slash-arc.png'

export const HERO_ASSET_VARIATIONS = {
  1: {
    label: 'V01',
    name: 'Razor fan',
    wingLeft: wingLeftV01,
    wingRight: wingRightV01,
    sword: swordV01,
    swordDebris: swordDebrisV01,
    slashArc: slashArcV01,
  },
  2: {
    label: 'V02',
    name: 'Cathedral shards',
    wingLeft: wingLeftV02,
    wingRight: wingRightV02,
    sword: swordV02,
    swordDebris: swordDebrisV02,
    slashArc: slashArcV02,
  },
  3: {
    label: 'V03',
    name: 'Swept crescent',
    wingLeft: wingLeftV03,
    wingRight: wingRightV03,
    sword: swordV03,
    swordDebris: swordDebrisV03,
    slashArc: slashArcV03,
  },
} as const

export type HeroAssetVariation = keyof typeof HERO_ASSET_VARIATIONS

const HERO_ASSET_VARIATION_EVENT = 'hero-asset-variation-change'

export function normalizeHeroAssetVariation(value: unknown): HeroAssetVariation {
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return 1
}

export function readHeroAssetVariation(): HeroAssetVariation {
  if (typeof window === 'undefined') return 1

  const hashQuery = window.location.hash.split('?')[1] ?? ''
  const hashValue = new URLSearchParams(hashQuery).get('variation')
  const pageValue = new URLSearchParams(window.location.search).get('variation')
  return normalizeHeroAssetVariation(hashValue ?? pageValue)
}

export function setHeroAssetVariation(value: HeroAssetVariation) {
  if (typeof window === 'undefined') return

  const hashPath = (window.location.hash.split('?')[0] || '#/hero-a').replace(/^#?/, '#')
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hashPath}?variation=${value}`)
  window.dispatchEvent(new Event(HERO_ASSET_VARIATION_EVENT))
}

export { HERO_ASSET_VARIATION_EVENT }
