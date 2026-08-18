// Single source of truth for landing copy + data, shared across all three
// hero variations. Keeps messaging consistent while the visual treatment
// differs per route.

export const HEADLINE = {
  kicker: 'HELL · HEAVEN · INDEX',
  line1: 'STOP INSTALLING SKILLS.',
  line2: 'START SUMMONING THEM.',
  sub: "Strip your agent's context bloat. Run clean. Skill Zero composes a lean, benchmarked skill surface at launch under the Skill Heaven umbrella — nothing installed, nothing mutated, nothing left behind.",
}

export type Harness = {
  id: string
  name: string
  status: 'flagship' | 'vanguard' | 'recipe' | 'gated'
  install: string
  note: string
}

// Per-harness doors. claude is the flagship; pi the vanguard; others recipe-track.
export const HARNESSES: Harness[] = [
  {
    id: 'claude',
    name: 'Claude',
    status: 'flagship',
    install: 'claude plugin marketplace add gaia-research/gaia-skill-heaven\nclaude plugin install skill-heaven@gaia-skill-heaven',
    note: 'The flagship Skill Zero door + the /skill-heaven entropy ladder.',
  },
  {
    id: 'pi',
    name: 'Pi',
    status: 'vanguard',
    install: 'pi install pi-zero',
    note: 'The vanguard door. --no-skills clean floor, curated skill mounts.',
  },
  {
    id: 'codex',
    name: 'Codex',
    status: 'recipe',
    install: 'skill-zero --harness codex --print',
    note: 'Recipe track — per-session skills-config override, surface not yet proven clean.',
  },
  {
    id: 'hermes',
    name: 'Hermes-agent',
    status: 'recipe',
    install: 'skill-zero --harness hermes --print',
    note: 'Recipe track — compile-only recipe today.',
  },
]

export type Posture = {
  key: string
  label: string
  blurb: string
  dose: string
}

// The entropy ladder rungs shown on the site (N11): product-floor (`off`) →
// curated → native. The internal absolute-zero `floor` is a benchmark ruler
// only and is NOT a user-facing row (P8). Two-number doses (standing /
// invocation) reported honestly; the hell lane is gated (P2).
export const POSTURES: Posture[] = [
  {
    key: 'product-floor',
    label: 'Product floor',
    blurb: 'The doorful product floor — "off", the cleanest launchable posture. Minimum control surface survives; the door is +515 tok.',
    dose: '20,176 tok · −28.9% vs native',
  },
  {
    key: 'curated',
    label: 'Curated',
    blurb: 'A clean room with exactly the skills you summon — nothing else discovered or mounted.',
    dose: 'standing + invocation, priced separately',
  },
  {
    key: 'native',
    label: 'Native',
    blurb: 'Nothing composed. No flags, no env, no plan. Exiting Heaven is just switching back.',
    dose: 'your harness as shipped',
  },
]

export const COMMANDS = {
  invoke: '/skill-heaven',
  launch: 'claude-zero',
  break: '/skill-hell',
}

export const CTA = {
  primary: 'Launch Skill Zero',
  secondary: 'Read the benchmark method',
}
