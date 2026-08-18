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
  // Auto-opens on mount: HeroInfo only mounts once the first non-scroll
  // interaction has revealed it, and the whole tooltip should show, not just
  // the toggle.
  const [open, setOpen] = useState(true)
  const [hidden, setHidden] = useState(false)

  if (hidden) {
    return (
      <button
        type="button"
        className="vha-info-nub"
        onClick={() => setHidden(false)}
        aria-label="Show explainer"
        style={{ color: dim, borderColor: dim, background: `${bg}b3`, backdropFilter: 'blur(6px)' }}
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
        style={{ color: accent, borderColor: accent, background: `${bg}b3`, backdropFilter: 'blur(6px)' }}
      >
        <span className="vha-info-q" style={{ borderColor: accent }}>
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
                How much the agent decides for itself.
              </p>
              <p className="vha-info-body" style={{ color: dim, marginTop: 6 }}>
                <strong style={{ color: fg }}>Low · converge.</strong> Tightens toward a
                plan you approve — impeccable weighing craft options, grill-me
                stress-testing a build. You stay in the loop.
              </p>
              <p className="vha-info-body" style={{ color: dim, marginTop: 6 }}>
                <strong style={{ color: fg }}>High · explore.</strong> Hands the agent
                the wheel — gstack pits rival roles against each other, a CSO hunting
                security holes. Not lower quality: more autonomous, more surprising,
                seen only once it ships.
              </p>
              <EntropyCurve fg={fg} dim={dim} accent={accent} />
            </>
          ) : (
            <>
              <p className="vha-info-title" style={{ color: accent }}>
                Skill Heaven
              </p>
              <p className="vha-info-body" style={{ color: dim }}>
                Summon a skill for one session — nothing installed, gone when you
                leave. The ladder sets the agent&apos;s temperament:{' '}
                <strong style={{ color: fg }}>converge</strong> to shape a plan you
                steer, or <strong style={{ color: fg }}>explore</strong> to hand it
                autonomy and trust the surprise. One summon — you choose how much
                control.
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

// Upper-right, below "Skip": a copyable /summon one-liner (summon a standalone
// skill) and a quiet "Where do skills come from?" explainer. Same whisper-quiet
// treatment as HeroInfo, right-aligned.
export function HeroSummon({
  fg,
  bg,
  dim,
  accent,
  copy,
  copied,
}: {
  fg: string
  bg: string
  dim: string
  accent: string
  copy: (text: string, key: string) => void
  copied: string | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="vha-summon">
      <button
        type="button"
        className="vha-summon-cmd"
        onClick={() => copy('/summon', 'summon')}
        style={{ color: fg, borderColor: accent, background: `${bg}b3`, backdropFilter: 'blur(6px)' }}
      >
        <span style={{ color: accent }}>/</span>summon
        <span className="vha-summon-tag" style={{ color: dim }}>
          {copied === 'summon' ? 'copied ⏎' : 'copy'}
        </span>
      </button>
      <span
        className="vha-summon-hint"
        style={{ color: dim, background: `${bg}b3`, padding: '2px 6px', backdropFilter: 'blur(6px)' }}
      >
        summon a standalone skill
      </span>

      <div className="vha-info vha-info--right" data-open={open ? '1' : '0'}>
        <button
          type="button"
          className="vha-info-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ color: accent, borderColor: accent, background: `${bg}b3`, backdropFilter: 'blur(6px)' }}
        >
          <span className="vha-info-label">Where do skills come from?</span>
          <span className="vha-info-q" style={{ borderColor: accent }}>
            ?
          </span>
        </button>
        {open && (
          <div className="vha-info-panel" style={{ color: fg, background: `${bg}f2`, borderColor: dim }}>
            <p className="vha-info-title" style={{ color: accent }}>
              The Gaia Skill Tree
            </p>
            <p className="vha-info-body" style={{ color: dim }}>
              Every summon is drawn from the Gaia Skill Tree — an evidence-backed
              registry where a skill is <strong style={{ color: fg }}>proven to work</strong>,
              then named to the human who authored it. Only skills that earn their
              place get in: curated, ranked, attributed. Off-canon? Summon straight
              from any GitHub repo — our MCP loads it for this session only, nothing
              installed, gone when you leave.
            </p>
            <a
              className="vha-info-link"
              href="https://gaiaskilltree.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: accent, borderColor: accent }}
            >
              Explore the tree · gaiaskilltree.com →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// Skill-entropy sketch. At LOW entropy quality is already high and cost is low
// (not zero) — but a human stays in the loop. Climbing the ladder, cost rises
// and the quality mean rises too, yet the outcome spread widens (stochastic /
// "blurry"). ULTRA is the controller: it holds quality high and crisp across
// the range instead of blurring. Gold is the Ultra crown colour.
function EntropyCurve({ fg, dim, accent }: { fg: string; dim: string; accent: string }) {
  const gold = '#FFD24A'
  return (
    <svg
      className="vha-info-curve"
      viewBox="0 0 220 96"
      role="img"
      aria-label="At low entropy quality is high and cost low but a human stays in the loop; climbing, cost and quality both rise while outcomes grow stochastic; Ultra holds quality high and controlled"
    >
      {/* axes */}
      <line x1="16" y1="8" x2="16" y2="80" stroke={dim} strokeWidth="1" opacity="0.5" />
      <line x1="16" y1="80" x2="212" y2="80" stroke={dim} strokeWidth="1" opacity="0.5" />
      {/* human-in-the-loop at low entropy */}
      <line x1="44" y1="22" x2="44" y2="80" stroke={dim} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      {/* quality: high already, mean rises — but the spread (blur) widens right */}
      <path d="M16 31 C 88 24, 150 14, 210 6 L210 44 C 150 40, 88 36, 16 37 Z" fill={accent} opacity="0.15" />
      <path d="M16 34 C 100 28, 160 23, 210 24" fill="none" stroke={accent} strokeWidth="2" />
      {/* cost: low (not zero) → high */}
      <path d="M16 64 C 90 58, 150 34, 210 16" fill="none" stroke={dim} strokeWidth="1.5" strokeDasharray="3 3" />
      {/* ultra: quality held high and crisp — controls the tradeoff */}
      <path d="M16 28 C 96 18, 158 12, 206 9" fill="none" stroke={gold} strokeWidth="1.75" />
      <circle cx="206" cy="9" r="2.4" fill={gold} />
      <text x="24" y="18" fill={fg} fontSize="9" letterSpacing="0.12em">
        quality
      </text>
      <text x="172" y="9" fill={gold} fontSize="8" letterSpacing="0.1em">
        ultra
      </text>
      <text x="112" y="60" fill={dim} fontSize="9" letterSpacing="0.12em">
        cost
      </text>
      <text x="19" y="74" fill={dim} fontSize="7.5" letterSpacing="0.06em">
        human
      </text>
      <text x="138" y="93" fill={dim} fontSize="8" letterSpacing="0.14em">
        entropy →
      </text>
    </svg>
  )
}
