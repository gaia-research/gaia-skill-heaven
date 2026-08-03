// Single source of truth for landing copy + data, shared across all three
// hero variations. Keeps messaging consistent while the visual treatment
// differs per route.

export const HEADLINE = {
  kicker: 'HELL · HEAVEN · INDEX',
  line1: 'STOP INSTALLING SKILLS.',
  line2: 'START SUMMONING THEM.',
  sub: "Strip your agent's context bloat. Run clean. Skill Heaven composes a lean, benchmarked skill surface at launch — nothing installed, nothing mutated, nothing left behind.",
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
    install: 'claude plugin marketplace add gaia-research/skill-heaven\nclaude plugin install claude-heaven',
    note: 'The flagship door. Native-default launcher + /skill-heaven posture slider.',
  },
  {
    id: 'pi',
    name: 'Pi',
    status: 'vanguard',
    install: 'pi install pi-heaven',
    note: 'The vanguard door. --no-skills clean floor, curated skill mounts.',
  },
  {
    id: 'codex',
    name: 'Codex',
    status: 'recipe',
    install: 'skill-heaven --harness codex --print',
    note: 'Recipe track — per-session skills-config override, surface not yet proven clean.',
  },
  {
    id: 'hermes',
    name: 'Hermes-agent',
    status: 'recipe',
    install: 'skill-heaven --harness hermes --print',
    note: 'Recipe track — compile-only recipe today.',
  },
]

export type Posture = {
  key: string
  label: string
  blurb: string
  dose: string
}

// The posture slider — floor → curated → native. Two-number doses (standing /
// invocation) reported honestly; hell lane is gated (P2).
export const POSTURES: Posture[] = [
  {
    key: 'floor',
    label: 'Floor',
    blurb: 'The doorless benchmark floor. Byte-frozen placebo-of-record. No skills, no door.',
    dose: '19,661 tok · placebo-of-record',
  },
  {
    key: 'product-floor',
    label: 'Product floor',
    blurb: 'The doorful product floor. Minimum control surface survives — the door is +515 tok.',
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
  launch: 'claude-heaven',
  break: '/skill-hell',
}

export const CTA = {
  primary: 'Enter Skill Heaven',
  secondary: 'Read the benchmark method',
}
