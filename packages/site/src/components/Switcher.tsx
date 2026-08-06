import { NavLink } from 'react-router-dom'
// Fixed prototype switcher so the reviewer can flip between the two retained
// hero directions. The production default is Hero A with the v01 art.
const VARIATIONS = [
  { to: '/hero-a', label: 'Hero A', hint: 'Reredos · centered monumental wordmark · production default' },
  { to: '/hero-b', label: 'Hero B', hint: 'Guillotine · asymmetric, frame-cropped' },
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
      <span className="sh-switcher__hint">pick 1 of {VARIATIONS.length}</span>
    </div>
  )
}
