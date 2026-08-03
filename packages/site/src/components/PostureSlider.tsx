import { useState } from 'react'
import { POSTURES } from '../content'
import './posture-slider.css'

// The posture slider — floor → product-floor → curated → native. Mirrors the
// /skill-heaven posture command. Honest two-number dosing shown per stop.
export function PostureSlider() {
  const [i, setI] = useState(0)
  const p = POSTURES[i]

  return (
    <div className="sh-posture">
      <div className="sh-posture__head">
        <span className="sh-posture__eyebrow">POSTURE SLIDER · /skill-heaven</span>
        <span className="sh-posture__dose">{p.dose}</span>
      </div>

      <input
        className="sh-posture__range"
        type="range"
        min={0}
        max={POSTURES.length - 1}
        step={1}
        value={i}
        aria-label="Posture"
        onChange={(e) => setI(Number(e.target.value))}
        style={{ ['--fill' as string]: `${(i / (POSTURES.length - 1)) * 100}%` }}
      />

      <div className="sh-posture__ticks">
        {POSTURES.map((post, idx) => (
          <button
            key={post.key}
            className={'sh-posture__tick' + (idx === i ? ' is-active' : '')}
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
