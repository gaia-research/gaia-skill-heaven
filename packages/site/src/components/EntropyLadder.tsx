import { useState } from 'react'
import { POSTURES } from '../content'
import './entropy-ladder.css'

// The entropy ladder (N11) — product-floor (`off`) → curated → native. Mirrors
// the /skill-heaven posture command. Discrete rungs only (N1), never a fader.
// Honest two-number dosing shown per rung.
export function EntropyLadder() {
  const [i, setI] = useState(0)
  const p = POSTURES[i]

  return (
    <div className="sh-posture">
      <div className="sh-posture__head">
        <span className="sh-posture__eyebrow">ENTROPY LADDER · /skill-heaven</span>
        <span className="sh-posture__dose">{p.dose}</span>
      </div>

      <div className="sh-posture__ticks" role="radiogroup" aria-label="Entropy ladder rung">
        {POSTURES.map((post, idx) => (
          <button
            key={post.key}
            className={'sh-posture__tick' + (idx === i ? ' is-active' : '')}
            role="radio"
            aria-checked={idx === i}
            onClick={() => setI(idx)}
          >
            {post.label}
          </button>
        ))}
      </div>

      <p className="sh-posture__blurb">{p.blurb}</p>
    </div>
  )
}
