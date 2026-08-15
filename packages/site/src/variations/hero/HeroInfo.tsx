import { useState } from 'react'

// Upper-left, whisper-quiet info affordance. On the acts (Acts 1–4) it offers a
// subtle "What is this?" that explains the Skill Heaven system; on the ladder
// (Act 5) it explains "Skill entropy" with a small visual. Collapsed by default,
// dismissable, and responsive down to mobile (see .vha-info* in the CSS).
export function HeroInfo({
  atLadder,
  fg,
  bg,
  dim,
  accent,
}: {
  atLadder: boolean
  fg: string
  bg: string
  dim: string
  accent: string
}) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)

  if (hidden) {
    return (
      <button
        type="button"
        className="vha-info-nub"
        onClick={() => setHidden(false)}
        aria-label="Show explainer"
        style={{ color: dim, borderColor: dim }}
      >
        ?
      </button>
    )
  }

  const label = atLadder ? 'Skill entropy' : 'What is this?'

  return (
    <div className="vha-info" data-open={open ? '1' : '0'}>
      <button
        type="button"
        className="vha-info-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ color: dim, borderColor: dim }}
      >
        <span className="vha-info-q" style={{ borderColor: dim }}>
          ?
        </span>
        <span className="vha-info-label">{label}</span>
      </button>

      {open && (
        <div
          className="vha-info-panel"
          style={{ color: fg, background: `${bg}f2`, borderColor: dim }}
        >
          {atLadder ? (
            <>
              <p className="vha-info-title" style={{ color: accent }}>
                Skill entropy
              </p>
              <p className="vha-info-body" style={{ color: dim }}>
                How many skills — and how varied — sit in the agent&apos;s context.
                Climb the ladder and entropy rises: more experts weigh in, quality
                climbs, and so does cost. The win is the useful few, not the crowd.
              </p>
              <EntropyCurve fg={fg} dim={dim} accent={accent} />
            </>
          ) : (
            <>
              <p className="vha-info-title" style={{ color: accent }}>
                Skill Heaven
              </p>
              <p className="vha-info-body" style={{ color: dim }}>
                Summon a skill into one session instead of installing it forever.
                One line, one session — nothing installed, nothing mutated, nothing
                left behind. The ladder sets how much of the summoning is automatic.
              </p>
            </>
          )}
          <button
            type="button"
            className="vha-info-hide"
            onClick={() => {
              setOpen(false)
              setHidden(true)
            }}
            style={{ color: dim }}
          >
            hide
          </button>
        </div>
      )}
    </div>
  )
}

// Tiny "quality & cost rise with entropy" sketch — two curves over the rungs.
function EntropyCurve({ fg, dim, accent }: { fg: string; dim: string; accent: string }) {
  return (
    <svg className="vha-info-curve" viewBox="0 0 220 96" role="img" aria-label="Quality and cost rise with skill entropy">
      {/* axes */}
      <line x1="16" y1="8" x2="16" y2="80" stroke={dim} strokeWidth="1" opacity="0.5" />
      <line x1="16" y1="80" x2="212" y2="80" stroke={dim} strokeWidth="1" opacity="0.5" />
      {/* cost — straight-ish climb */}
      <path d="M16 76 L212 20" fill="none" stroke={dim} strokeWidth="1.5" strokeDasharray="3 3" />
      {/* quality — rises then plateaus (diminishing returns) */}
      <path d="M16 74 C 80 30, 120 20, 212 30" fill="none" stroke={accent} strokeWidth="2" />
      <text x="150" y="16" fill={dim} fontSize="9" letterSpacing="0.12em">
        cost
      </text>
      <text x="120" y="44" fill={fg} fontSize="9" letterSpacing="0.12em">
        quality
      </text>
      <text x="150" y="93" fill={dim} fontSize="8" letterSpacing="0.14em">
        entropy →
      </text>
    </svg>
  )
}
