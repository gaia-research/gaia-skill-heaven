/**
 * Product truth for every surface on this site.
 *
 * One mechanic — `summon` — and ONE LINE: a single ladder
 * `off · low · med · high · xhigh · max · ultra` whose four surfaces are
 * contiguous bands read from the current rung (off = Zero, low·med = Heaven,
 * high·xhigh·max = Hell, ultra = Ultra, the crown rung). Every figure here is
 * either a real measured benchmark result or explicitly flagged provisional.
 * Nothing is invented: no testimonials, no logos, no user counts, no pricing.
 *
 * Authority: gaia-research/founder/RATIFICATION.md (N13) · packages/site/PRODUCT.md
 */

export const SITE = {
  name: 'Skill Heaven',
  repoName: 'Gaia Skill Heaven',
  version: 'WIP · v0',
  tagline: 'Stop installing skills. Start summoning them.',
  repoUrl: 'https://github.com/gaia-research/gaia-skill-heaven',
  issuesUrl: 'https://github.com/gaia-research/gaia-skill-heaven/issues',
  licence: 'Apache-2.0',
} as const;

/* -------------------------------------------------------------------------
   The mechanic
   ------------------------------------------------------------------------- */

export const MECHANIC = {
  verb: 'summon',
  line: 'A skill enters context on demand, for one session. Nothing is installed.',
  floor: '/summon',
  floorNote:
    'The single summon. Present in every implementation, at every rung, on every door.',
} as const;

/* -------------------------------------------------------------------------
   The four surfaces
   ------------------------------------------------------------------------- */

export type SurfaceId = 'zero' | 'heaven' | 'hell' | 'ultra';

export interface Surface {
  id: SurfaceId;
  name: string;
  command: string;
  role: string;
  /** one line, reader-facing */
  blurb: string;
  /** what the ladder means here, or null when the surface has no ladder */
  ladder: 'converge' | 'explore' | null;
  defaultRung: RungId | null;
  hue: string;
}

export const SURFACES: Surface[] = [
  {
    id: 'zero',
    name: 'Skill Zero',
    command: '/skill-zero',
    role: 'the launcher',
    blurb:
      'Severs the catalogue to its nearest achievable zero and restores only what you name. Ships with /summon by default.',
    ladder: null,
    defaultRung: null,
    hue: 'var(--sh-zero)',
  },
  {
    id: 'heaven',
    name: 'Skill Heaven',
    command: '/skill-heaven',
    role: 'converge',
    blurb:
      'Auto-summons narrowly. Fewer skills, chosen tightly against the gap in front of you.',
    ladder: 'converge',
    defaultRung: 'low',
    hue: 'var(--sh-heaven)',
  },
  {
    id: 'hell',
    name: 'Skill Hell',
    command: '/skill-hell',
    role: 'explore',
    blurb:
      'Auto-summons widely. More experts in context — better, until it is not.',
    ladder: 'explore',
    defaultRung: 'high',
    hue: 'var(--sh-hell)',
  },
  {
    id: 'ultra',
    name: 'Skill Ultra',
    command: '/skill-ultra',
    role: 'the controller',
    blurb:
      'Picks the direction and the depth per gap. No ladder of its own — nothing to set.',
    ladder: null,
    defaultRung: null,
    hue: 'var(--sh-ultra)',
  },
];

export const surfaceById = (id: SurfaceId): Surface =>
  SURFACES.find((s) => s.id === id)!;

/* -------------------------------------------------------------------------
   The ladder — discrete rungs, never a continuous fader.
   A rung sets HOW MANY skills may be auto-summoned per capability gap.

   ⚠ PROVISIONAL. The per-rung counts below are a working mapping chosen to
   sit inside the shipped summon tool's own limit range. They do not land
   until the benchmark does, and every surface that renders them must carry
   the WIP mark.
   ------------------------------------------------------------------------- */

export type RungId = 'off' | 'low' | 'med' | 'high' | 'xhigh' | 'max' | 'ultra';

export interface Rung {
  id: RungId;
  /** auto-summons permitted per capability gap — PROVISIONAL */
  slots: number;
  note: string;
  /** the crown rung: the controller, no count to set */
  crown?: boolean;
}

export const RUNGS: Rung[] = [
  { id: 'off', slots: 0, note: 'Nothing automatic. /summon still works by hand.' },
  { id: 'low', slots: 1, note: 'One skill per gap. The tightest useful reach.' },
  { id: 'med', slots: 2, note: 'Two per gap. A second opinion in context.' },
  { id: 'high', slots: 3, note: 'Three per gap. The working default for explore.' },
  { id: 'xhigh', slots: 4, note: 'Four per gap. A wider net, a heavier session.' },
  { id: 'max', slots: 5, note: 'Five per gap. The widest reach the router will take.' },
  { id: 'ultra', slots: 0, crown: true, note: 'The controller picks direction and depth per gap. Nothing to set.' },
];

/** One line, four bands: which surface a given rung belongs to (N13). */
export const RUNG_BAND: Record<RungId, SurfaceId> = {
  off: 'zero',
  low: 'heaven',
  med: 'heaven',
  high: 'hell',
  xhigh: 'hell',
  max: 'hell',
  ultra: 'ultra',
};

export const LADDER_WIP =
  'Per-rung counts are provisional and do not land until the benchmark does.';

/* -------------------------------------------------------------------------
   Install & launch — real, working commands only
   ------------------------------------------------------------------------- */

export const INSTALL = {
  sh: 'curl -fsSL https://skill-heaven.dev/install.sh | sh',
  note: 'Installs every door plus the summon engine. One command, all harnesses.',
  standalone: 'npx --yes skill-hell@latest summon "code review" --card',
  standaloneNote: 'Summon standalone, with no launcher and nothing installed.',
  uninstall: '$HOME/.local/share/gaia-skill-heaven/uninstall.sh',
} as const;

export interface Door {
  id: string;
  pkg: string;
  harness: string;
  status: 'flagship' | 'prototype';
  launch: string;
}

export const DOORS: Door[] = [
  { id: 'claude', pkg: 'claude-zero', harness: 'Claude Code', status: 'flagship', launch: 'claude-zero' },
  { id: 'pi', pkg: 'pi-zero', harness: 'pi', status: 'prototype', launch: 'pi-zero' },
  { id: 'codex', pkg: 'codex-zero', harness: 'Codex', status: 'prototype', launch: 'codex-zero' },
  { id: 'hermes', pkg: 'hermes-zero', harness: 'Hermes', status: 'prototype', launch: 'hermes-zero' },
  { id: 'grok', pkg: 'grok-zero', harness: 'Grok', status: 'prototype', launch: 'grok-zero' },
];

/* -------------------------------------------------------------------------
   Measured evidence — real benchmark results. Two numbers, never averaged.
   ------------------------------------------------------------------------- */

export const DOSES = {
  native: 28_379,
  productFloor: 20_176,
  benchmarkFloor: 19_661,
  deltaVsNative: '−28.9%',
  doorCost: 515,
  note: 'Two numbers, never averaged — the floor you can prove, and the floor you actually ship.',
} as const;

/* -------------------------------------------------------------------------
   The session story
   ------------------------------------------------------------------------- */

export const SESSION_ROWS = [
  { id: 'code-review', origin: 'repo', tokens: 1_840, mounted: true },
  { id: 'tdd', origin: 'repo', tokens: 2_210, mounted: true },
  { id: 'diagnose', origin: 'repo', tokens: 1_460, mounted: true },
  { id: 'mattpocock/to-prd', origin: 'skill-tree', tokens: 2_380, mounted: false },
  { id: 'obra/systematic-debugging', origin: 'skill-tree', tokens: 1_920, mounted: false },
  { id: 'addy-osmani/performance-optimization', origin: 'skill-tree', tokens: 2_640, mounted: false },
] as const;

export const HOUSES = [
  {
    id: 'research',
    room: 'Room 01 · the lab',
    name: 'Gaia Research',
    blurb: 'The HH Index, the benchmark method, and the ledger every dose on this page came out of.',
    action: 'Read the method',
    href: 'https://research.gaiaskilltree.com',
    hue: 'var(--sh-house-research)',
  },
  {
    id: 'tree',
    room: 'Room 02 · the registry',
    name: 'Gaia Skill Tree',
    blurb: 'The curated set Hell routes over and Heaven converges from.',
    action: 'Browse the tree',
    href: 'https://gaiaskilltree.com',
    hue: 'var(--sh-house-tree)',
  },
  {
    id: 'heaven',
    room: 'Room 03 · you are here',
    name: 'Skill Heaven',
    blurb: 'The four surfaces. Composes flags, execs your harness, writes nothing you have to clean up.',
    action: 'Pick a door above',
    href: null,
    hue: 'var(--sh-violet)',
  },
] as const;
