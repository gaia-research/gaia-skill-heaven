import { NavLink, useLocation } from 'react-router-dom'
// Fixed prototype switcher so the reviewer can flip between the two retained
// hero directions. It is a REVIEW tool, not production chrome: the production
// surfaces ("/" and "/landing") carry their own nav, so the switcher hides
// itself there rather than overlaying two navs on the same page.
const VARIATIONS = [
  { to: '/hero-a', label: 'Hero A', hint: 'Reredos · centered monumental wordmark' },
  { to: '/hero-b', label: 'Hero B', hint: 'Guillotine · asymmetric, frame-cropped' },
]

export function Switcher() {
  const { pathname } = useLocation()
  if (!pathname.startsWith('/hero-a') && !pathname.startsWith('/hero-b')) return null

  return (
    <div className="sh-switcher" role="navigation" aria-label="Prototype variation switcher">
      <span className="sh-switcher__brand">SKILL HEAVEN · WORKING PROTOTYPE · ACTIVELY TESTED FOR PUBLIC USE</span>
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
