/**
 * Product truth for every surface on this site.
 *
 * One mechanic — `summon` — and ONE LINE: a single ladder
 * `zero · low · med · high · xhigh · max · ultra` whose four surfaces are
 * contiguous bands read from the current rung (zero = Zero, low·med = Heaven,
 * high·xhigh·max = Hell, ultra = Ultra, the crown rung).
 *
 * What the line measures is SKILL ENTROPY — how much skill variety and volume
 * enters a session. A rung is a reading of that quantity, so it names a
 * direction and a position along its band; it never names a count. No rung
 * carries a number and no summon is capped.
 *
 * Every figure here is either a real measured benchmark result or explicitly
 * flagged provisional. Nothing is invented: no testimonials, no logos, no user
 * counts, no pricing. No command appears here that the tool would reject.
 *
 * Authority: docs/LADDER-FLOW.md (N13) · docs/AGENT-PLUGIN.md (install) ·
 * gaia-research/founder/RATIFICATION.md · packages/site/PRODUCT.md
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
  /**
   * The per-skill HH Index stamp this band reads, for the two bands that read
   * one. `heaven-native` and `hell-safe` are the two halves of the same
   * question — does a skill hold up when few are in context, and does it stay
   * safe when many are — and they are being measured NOW, in the open, at
   * `HOUSES[0].href`.
   *
   * They are not shipped routing. Stamps are not built, so eligibility today
   * falls back to relevance ranking, and no surface may render stamp-gated
   * routing as running. Every surface that shows a stamp must therefore also
   * say what routing does today; `STAMP_ROUTING_NOTE` is that sentence.
   */
  stamp: { label: string; note: string } | null;
}

/**
 * The one sentence that keeps a stamp honest. Print it wherever the stamps are
 * named — they describe an index being measured, not a router that is running.
 */
export const STAMP_ROUTING_NOTE =
  'Both stamps are being benchmarked in the open. Until the index lands, routing ranks on relevance.';

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
    stamp: null,
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
    stamp: {
      label: 'heaven-native',
      note: 'skills that still carry a gap when few are in context',
    },
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
    stamp: {
      label: 'hell-safe',
      note: 'skills that stay safe when many are',
    },
  },
  {
    id: 'ultra',
    name: 'Skill Ultra',
    command: '/skill-ultra',
    role: 'the controller',
    blurb:
      'Picks the direction and the position for you, gap by gap. No ladder of its own — nothing to set.',
    ladder: null,
    defaultRung: null,
    hue: 'var(--sh-ultra)',
    stamp: null,
  },
];

export const surfaceById = (id: SurfaceId): Surface =>
  SURFACES.find((s) => s.id === id)!;

/* -------------------------------------------------------------------------
   The ladder — discrete rungs, never a continuous fader.

   What it measures is SKILL ENTROPY: how much skill variety and volume enters
   a session. A rung names a DIRECTION along that scale and a POSITION along
   its band. It never names a count — no rung carries a number and no summon
   is capped. How far a rung reaches on a given gap is the agent's call,
   worked out in use while the benchmark is built.

   ⚠ PROVISIONAL. Where each band opens — Heaven at `low`, Hell at `high` —
   is a working default, not a finding. Every surface that renders the line
   carries the WIP mark.
   ------------------------------------------------------------------------- */

export type RungId = 'zero' | 'low' | 'med' | 'high' | 'xhigh' | 'max' | 'ultra';

/** Which way along skill entropy a rung moves the session. Never a quantity. */
export type Direction = 'floor' | 'converge' | 'explore' | 'crown';

export interface Rung {
  id: RungId;
  /** the direction this rung reads as — never a count */
  direction: Direction;
  /** where it sits along its band, reader-facing */
  position: string;
  /** what the rung means, one line */
  note: string;
  /** the band opens here — Heaven's `low`, Hell's `high`. PROVISIONAL. */
  opens?: boolean;
  /** the crown rung: it picks the reading instead of being one */
  crown?: boolean;
}

export const RUNGS: Rung[] = [
  {
    id: 'zero',
    direction: 'floor',
    position: 'the floor of the line',
    note: 'Zero skills, zero skill entropy. Nothing automatic — /summon still works by hand.',
  },
  {
    id: 'low',
    direction: 'converge',
    position: 'the band opens here',
    opens: true,
    note: 'Narrow onto the gap in front of you. The tightest useful reach.',
  },
  {
    id: 'med',
    direction: 'converge',
    position: 'further along the band',
    note: 'Still converging, with more room to move — a second reading of the same gap.',
  },
  {
    id: 'high',
    direction: 'explore',
    position: 'the band opens here',
    opens: true,
    note: 'Widen around the gap. More experts in context — better, until it is not.',
  },
  {
    id: 'xhigh',
    direction: 'explore',
    position: 'further along the band',
    note: 'Reaching wider. A broader search, and a heavier session to pay for it.',
  },
  {
    id: 'max',
    direction: 'explore',
    position: 'the far end of the band',
    note: 'The widest the line reaches. Where the curve is expected to turn.',
  },
  {
    id: 'ultra',
    direction: 'crown',
    position: 'the crown of the line',
    crown: true,
    note: 'Picks the direction and the position for you, gap by gap. Nothing to set.',
  },
];

/** The word a surface shows for a rung's direction. */
export const DIRECTION_WORD: Record<Direction, string> = {
  floor: 'the floor',
  converge: 'converge',
  explore: 'explore',
  crown: 'auto',
};

/** One line, four bands: which surface a given rung belongs to (N13). */
export const RUNG_BAND: Record<RungId, SurfaceId> = {
  zero: 'zero',
  low: 'heaven',
  med: 'heaven',
  high: 'hell',
  xhigh: 'hell',
  max: 'hell',
  ultra: 'ultra',
};

/**
 * The inverse of `RUNG_BAND`: where each band opens on the line. Naming a
 * surface is naming a rung, because a session sits at exactly one rung and the
 * surface is READ from it — there is no separate surface to select.
 *
 * Heaven's `low` and Hell's `high` are PROVISIONAL working defaults, not
 * findings. `zero` and `ultra` are single-rung bands, so theirs are exact.
 */
export const BAND_OPENS: Record<SurfaceId, RungId> = {
  zero: 'zero',
  heaven: 'low',
  hell: 'high',
  ultra: 'ultra',
};

/** What the line measures. Surfaces that already say "skill entropy" use this
 *  as the definition rather than repeating the term. */
export const LADDER_MEASURE =
  'How much skill variety and volume enters a session.';

export const LADDER_WIP =
  'No rung carries a count and no summon is capped: how far one reaches on a given gap is the agent’s call. Where each band opens stays provisional until the benchmark lands.';

/* -------------------------------------------------------------------------
   Install & launch — real, working commands only.

   Settled in docs/AGENT-PLUGIN.md ("Install — the final decision"):
   the plugin is the primary install, install.sh is the optional launcher
   route, `npx` is not an install path, and `skill-heaven.dev` is deferred —
   the site prints the host that actually serves today.
   ------------------------------------------------------------------------- */

export const INSTALL = {
  /** Primary — two lines typed inside Claude Code. Nothing else to install. */
  plugin: [
    '/plugin marketplace add gaia-research/gaia-skill-heaven',
    '/plugin install skill-heaven@gaia-skill-heaven',
  ] as const,
  pluginNote:
    'Two lines inside Claude Code, no terminal. The plugin carries its own summon engine — no sibling checkout, no external package, no npx.',
  /** Optional — the five source-built launcher doors. */
  sh: 'curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh',
  shNote:
    'Optional. Adds the five standalone *-zero launcher doors, and registers the same plugin when Claude Code is already on PATH. It never installs a harness.',
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
    name: 'Gaia Skill Heaven',
    blurb: 'The four surfaces. Composes flags, execs your harness, writes nothing you have to clean up.',
    action: 'Pick a door above',
    href: null,
    hue: 'var(--sh-violet)',
  },
] as const;
