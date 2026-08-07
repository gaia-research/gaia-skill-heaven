// Shared vector art for the Skill Heaven / Lucy motifs, recreated in pure SVG
// from the concept pegs (glass-shard angel, prismatic halo, oversized single
// wing, angel katana). No external image assets — everything is drawable and
// animatable, so it ships self-contained and scales crisply.

type Props = { className?: string }

// Prismatic gradient defs shared by the art pieces below.
export function PrismDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="sh-prism" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="22%" stopColor="#4d7bff" />
          <stop offset="44%" stopColor="#37d6e0" />
          <stop offset="62%" stopColor="#58f2a6" />
          <stop offset="82%" stopColor="#ffd84d" />
          <stop offset="100%" stopColor="#ff7ac2" />
        </linearGradient>
        <radialGradient id="sh-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f7f8ff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#7c5cff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <filter id="sh-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
    </svg>
  )
}

// Oversized single angel wing built from layered translucent glass shards,
// echoing the "Glass Wings" and single-wing pegs. Feathers = quads.
export function GlassWing({ className }: Props) {
  // Deterministic shard layout (no RNG so it renders identically every build).
  const rows = 7
  const shards: JSX.Element[] = []
  for (let r = 0; r < rows; r++) {
    const count = 4 + r
    for (let c = 0; c < count; c++) {
      const x = 60 + c * 34 + r * 10
      const y = 40 + r * 46
      const w = 40 - r * 2
      const h = 90 - r * 6
      const skew = (c - count / 2) * 3
      shards.push(
        <polygon
          key={`${r}-${c}`}
          className="sh-wing__shard"
          points={`${x},${y} ${x + w},${y + skew} ${x + w - 6},${y + h} ${x - 4},${y + h - skew}`}
          style={{ animationDelay: `${(r * count + c) * 40}ms`, opacity: 0.14 + r * 0.04 }}
        />,
      )
    }
  }
  return (
    <svg
      className={className}
      viewBox="0 0 520 560"
      fill="none"
      stroke="url(#sh-prism)"
      strokeWidth="1.1"
      aria-hidden
    >
      {shards}
    </svg>
  )
}

// Angel katana — long, thin, luminous edge with a prism-lit blade.
export function AngelKatana({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 480 120" aria-hidden>
      <line x1="20" y1="96" x2="360" y2="30" stroke="url(#sh-prism)" strokeWidth="3" />
      <line
        x1="20"
        y1="96"
        x2="360"
        y2="30"
        stroke="#f7f8ff"
        strokeWidth="1"
        opacity="0.9"
      />
      {/* tsuba + grip */}
      <circle cx="372" cy="26" r="5" fill="none" stroke="#a9adc4" strokeWidth="2" />
      <line x1="378" y1="24" x2="430" y2="14" stroke="#6b6f88" strokeWidth="6" strokeLinecap="round" />
      {/* shard debris off the tip */}
      <polygon points="12,100 2,108 18,110" fill="url(#sh-prism)" opacity="0.6" />
    </svg>
  )
}

// Prismatic halo ring — the angel's ring, refracting.
export function Halo({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 200 80" aria-hidden>
      <ellipse
        cx="100"
        cy="40"
        rx="78"
        ry="20"
        fill="none"
        stroke="url(#sh-prism)"
        strokeWidth="3"
      />
      <ellipse cx="100" cy="40" rx="78" ry="20" fill="none" stroke="#f7f8ff" strokeWidth="1" opacity="0.7" />
    </svg>
  )
}
