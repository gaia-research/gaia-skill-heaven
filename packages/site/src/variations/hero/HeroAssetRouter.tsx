import { useCallback, useEffect, useState } from 'react'
import {
  HERO_ASSET_VARIATION_EVENT,
  HERO_ASSET_VARIATIONS,
  type HeroAssetVariation,
  normalizeHeroAssetVariation,
  readHeroAssetVariation,
  setHeroAssetVariation,
} from './assetVariations'

type HeroAssetRouterProps = {
  variation: HeroAssetVariation
  onChange: (variation: HeroAssetVariation) => void
}

export function useHeroAssetVariation() {
  const [variation, setVariation] = useState<HeroAssetVariation>(readHeroAssetVariation)

  useEffect(() => {
    const sync = () => setVariation(readHeroAssetVariation())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    window.addEventListener(HERO_ASSET_VARIATION_EVENT, sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
      window.removeEventListener(HERO_ASSET_VARIATION_EVENT, sync)
    }
  }, [])

  const selectVariation = useCallback((value: HeroAssetVariation) => {
    const next = normalizeHeroAssetVariation(value)
    setHeroAssetVariation(next)
    setVariation(next)
  }, [])

  return {
    variation,
    assets: HERO_ASSET_VARIATIONS[variation],
    selectVariation,
  }
}

export function HeroAssetRouter({ variation, onChange }: HeroAssetRouterProps) {
  return (
    <div className="vh-asset-router" data-testid="hero-asset-router" aria-label="Wing and sword asset variation">
      <div className="vh-asset-router__copy">
        <span className="vh-asset-router__label">WING + SWORD</span>
        <span className="vh-asset-router__name">{HERO_ASSET_VARIATIONS[variation].name}</span>
      </div>
      <div className="vh-asset-router__buttons" role="group" aria-label="Select hero asset variation">
        {([1, 2, 3] as HeroAssetVariation[]).map((key) => {
          const candidate = HERO_ASSET_VARIATIONS[key]
          const selected = key === variation
          return (
            <button
              key={key}
              type="button"
              data-variation={key}
              aria-label={`${candidate.label} · ${candidate.name}`}
              aria-pressed={selected}
              className={selected ? 'vh-asset-router__button vh-asset-router__button--selected' : 'vh-asset-router__button'}
              onClick={() => onChange(key)}
            >
              {candidate.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
