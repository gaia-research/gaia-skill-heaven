import { useState } from 'react'
import { HARNESSES } from '../content'
import './harness-chooser.css'

const STATUS_LABEL: Record<string, string> = {
  flagship: 'flagship',
  vanguard: 'vanguard',
  recipe: 'recipe track',
  gated: 'gated',
}

// Shared harness chooser: user picks a harness, install + launch script shows.
// Used by all three variations so the "pick your harness" story is consistent.
export function HarnessChooser() {
  const [active, setActive] = useState(HARNESSES[0].id)
  const harness = HARNESSES.find((h) => h.id === active)!

  return (
    <div className="sh-chooser">
      <div className="sh-chooser__tabs" role="tablist" aria-label="Choose your harness">
        {HARNESSES.map((h) => (
          <button
            key={h.id}
            role="tab"
            aria-selected={h.id === active}
            className={'sh-chooser__tab' + (h.id === active ? ' is-active' : '')}
            onClick={() => setActive(h.id)}
          >
            <span className="sh-chooser__name">{h.name}</span>
            <span className={'sh-chooser__badge sh-chooser__badge--' + h.status}>
              {STATUS_LABEL[h.status]}
            </span>
          </button>
        ))}
      </div>

      <div className="sh-chooser__panel" role="tabpanel">
        <p className="sh-chooser__note">{harness.note}</p>
        <pre className="sh-chooser__code">
          <code>
            <span className="sh-chooser__comment"># install</span>
            {'\n'}
            {harness.install}
          </code>
        </pre>
        <div className="sh-chooser__cmds">
          <span className="sh-chooser__cmd">
            <code>/skill-heaven</code> to invoke
          </span>
          <span className="sh-chooser__cmd">
            <code>claude-zero</code> to launch
          </span>
          <span className="sh-chooser__cmd sh-chooser__cmd--break">
            <code>/skill-hell</code> to break loose
          </span>
        </div>
      </div>
    </div>
  )
}
