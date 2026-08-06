import { NavLink } from 'react-router-dom'
import { useHeroAssetVariation } from '../variations/hero/HeroAssetRouter'

// Fixed prototype switcher so the reviewer can flip between the variations.
// Not part of the real landing page — a preview harness only.
const VARIATIONS = [
  { to: '/hero-a', label: 'Hero A', hint: 'Reredos · centered monumental wordmark · (current winner)' },
  { to: '/hero-b', label: 'Hero B', hint: 'Guillotine · asymmetric, frame-cropped' },
  { to: '/overdrive', label: 'Overdrive', hint: 'Landing-page overdrive · scroll-world · (v1)' },
  { to: '/manifesto', label: 'Manifesto', hint: 'Wood-type · imperative verbs · slice destroys grid' },
  { to: '/instrument', label: 'Instrument', hint: 'Nixie counter · honest two-number dosing' },
  { to: '/onebit', label: 'One-Bit', hint: 'One-bit OS · invert is the material' },
  { to: '/prism', label: 'Prism', hint: 'Luminance · prismatic · Skill Angel' },
  { to: '/default', label: 'Default', hint: 'White on black · restraint' },
]

export function Switcher() {
  const { variation } = useHeroAssetVariation()

  return (
    <div className="sh-switcher" role="navigation" aria-label="Prototype variation switcher">
      <span className="sh-switcher__brand">SKILL HEAVEN · prototype</span>
      <div className="sh-switcher__tabs">
        {VARIATIONS.map((v) => (
          <NavLink
            key={v.to}
            to={v.to === '/hero-a' || v.to === '/hero-b' ? `${v.to}?variation=${variation}` : v.to}
            title={v.hint}
            className={({ isActive }) =>
              'sh-switcher__tab' + (isActive ? ' sh-switcher__tab--active' : '')
            }
          >
            {v.label}
          </NavLink>
        ))}
      </div>
      <span className="sh-switcher__hint">pick 1 of {VARIATIONS.length}</span>
    </div>
  )
}
