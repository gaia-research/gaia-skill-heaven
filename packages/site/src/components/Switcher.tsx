import { NavLink } from 'react-router-dom'

// Fixed prototype switcher so the reviewer can flip between the 3 variations.
// Not part of the real landing page — a preview harness only.
const VARIATIONS = [
  { to: '/overdrive', label: 'Overdrive', hint: 'Landing-page overdrive · scroll-world · (v1)' },
  { to: '/manifesto', label: 'Manifesto', hint: 'Wood-type · imperative verbs · slice destroys grid' },
  { to: '/instrument', label: 'Instrument', hint: 'Nixie counter · honest two-number dosing' },
  { to: '/onebit', label: 'One-Bit', hint: 'One-bit OS · invert is the material' },
  { to: '/prism', label: 'Prism', hint: 'Luminance · prismatic · Lucy' },
  { to: '/default', label: 'Default', hint: 'White on black · restraint' },
]

export function Switcher() {
  return (
    <div className="sh-switcher" role="navigation" aria-label="Prototype variation switcher">
      <span className="sh-switcher__brand">SKILL HEAVEN · prototype</span>
      <div className="sh-switcher__tabs">
        {VARIATIONS.map((v) => (
          <NavLink
            key={v.to}
            to={v.to}
            title={v.hint}
            className={({ isActive }) =>
              'sh-switcher__tab' + (isActive ? ' sh-switcher__tab--active' : '')
            }
          >
            {v.label}
          </NavLink>
        ))}
      </div>
      <span className="sh-switcher__hint">pick 1 of 3</span>
    </div>
  )
}
