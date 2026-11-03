# Lucy Atmosphere — the room around Lucy

Tracker: [#200](https://github.com/gaia-research/gaia-skill-heaven/issues/200)
(children #201–#205) · character frontier: [#153](https://github.com/gaia-research/gaia-skill-heaven/issues/153)

> Lucy changes state, and the room believes her.

## One state, two engines, no wire between them

```text
Hero A product state  v.scene : 'zero' | 'heaven' | 'hell' | 'ultra'
        │
        ├── LucyLive        src/lucy-scene/LucyLive.tsx
        │     today: the approved static v5 figure + wings + katana (unchanged)
        │     later: the Rive rig (#153). Hair, ribbons, face, tear, wings,
        │            weapons, attached shards, near-body aura, her own transition.
        │
        └── LucyAtmosphere  src/lucy-scene/atmosphere/
              light, distant glass, depth, pointer parallax, the room's own
              transition. Motion (lazy) over static DOM/CSS paint.
```

Neither imports the other. Both read the same product state and one scene-level
lifecycle attribute, `data-scene-running` on the hero root
(`useSceneLifecycle`: one IntersectionObserver plus `visibilitychange`, no React
state). The Rive adapter should read that attribute rather than run its own
observers.

**Boundary:** if it moves because Lucy moved, it is Rive's. If it moves because
the world moved, it is the atmosphere's.

## Shared timing (`src/lucy-scene/scene.ts`)

| | ms from state change | owner |
|---|---|---|
| impact frame (flash + shear) | 0–150 | hero |
| character transition target | ~900 | LucyLive (today a CSS transform; Rive later) |
| room, longest layer to rest | ~1700 | atmosphere |

The room is heavier than she is, so it keeps moving for a beat after her. Rive
authoring should land Lucy's state change inside ~900ms. Nothing reads these
numbers at runtime to synchronise the engines; they exist so the two can be
designed together.

## The four rooms

Each world has a few **light layers** (its own) and a share of the **shard
field** (nine distant glass planes that persist across every state and are
re-organised by each world).

| | light | shards | gravity / transition |
|---|---|---|---|
| **Zero** | bone bloom on a 12s breath, a soft column, horizon hairline with a breath of Zero cyan, vignette | sunk flat into the horizon, invisible (Zero carries no shards) | everything settles; planes accelerate down out of view |
| **Heaven** | cyan→violet bloom with a core; a **prismatic corona** (spectrum as a ring of split light, orbiting 150s); five light shafts pouring downward | ordered: one shared angle, a lattice, rising together on one tempo | light falls in from above while the glass rises into place, lowest first |
| **Hell** | Heaven's corona twice, in the inverted prism (rust/umber/olive), out of register and counter-spun; registration slips (an ink hairline and its rust echo drifting in and out of register); a stain rising from below | two groups torn along opposing vectors at mismatched tempos; a rust ghost behind four of them arrives 160ms late and drifts a beat late; pointer answers backwards | splits from the centre outwards, each half on its own clock |
| **Ultra** | gold bloom that flares past rest on arrival, then breathes; fine gold interference rings (moiré of two ring fields, one orbiting off-centre); one slow sweep with a red leading edge every 12s | a sparse crown of luminous gold glass fanned behind her head | the crown assembles from its centre spire outwards; light retracts into her on exit |

Canon kept: Zero gets no shards or wings; Hell's red is inverted cyan, never a
hand-applied UI red; Ultra is never inverted.

## Engineering

- **Static first.** React renders the DOM once (memoised; the hero's 46ms glitch
  re-renders never reach it). CSS keyed on `data-state` / `data-shards` paints
  each world at rest. This is the no-JS, pre-load, and reduced-motion path.
- **Conductor** (`conductor.ts`): imported on idle after first paint, never under
  `prefers-reduced-motion: reduce`. It takes over every value, then runs:
  per-layer enter/exit (vector, delay, easing per world), the shard field
  re-forming, rest drift (WAAPI loops), and pointer depth.
- **Compositor-only motion.** Transform and opacity over static paint, with
  cubic-bezier easing so Motion hands them to WAAPI; the room does not stutter
  when the hero re-renders mid-transition. No animated filter, backdrop or blend
  mode. Static `drop-shadow` on the shard skins rasterises once.
- **Pointer depth** is two pairs of Motion springs (crisp and lagged) written
  straight to each plane's `translate`, batched once per frame in Motion's
  render step. Clamped to ±1.6vmin at the nearest plane, smaller than Lucy's
  future gaze. Coarse pointers get a tap response instead: a touch leans the
  room toward the finger and lets it settle back.
- **Lifecycle:** when `data-scene-running="false"` every running animation in
  the room is paused in place and resumed without a jump.
- **Inactive worlds** are `visibility: hidden` once faded, so they leave the
  layer tree.

### Review switches

- `/#/?atmo=off`: Lucy without the room.
- `/#/?lucy=off`: the room without Lucy (figure, wings, katana).

## Measurements

Headless Chromium 1194 in a container with **no GPU** (SwiftShader software
rendering), 1440×900, Playwright probes:

| | atmosphere off | atmosphere on |
|---|---|---|
| main-thread task, 4s idle on Ultra | 0.007–0.009s | 0.047–0.062s |
| style recalc, 4s idle | 0.001s | 0.013–0.014s |
| main-thread task, 6 state changes + pointer sweeps (~5.5s) | 0.85–1.29s | 1.78–2.30s |
| reduced motion: conductor/Motion requested | — | none |
| hidden tab: running → paused animations | — | 16 → 0 running, clock frozen; resumes in place |

The first parallax version wrote inherited custom properties on the room root
and cost 0.68s of style recalc per 4s idle. Writing `translate` per plane cut
that about 50×. Under SwiftShader, rAF frame times roughly double with the room
on, because large composited layers are rasterised in software. That is not
representative of GPU compositing, but it is the one number worth re-measuring
on real hardware (Safari/WebKit included) before production.

Bundle (vite build): main JS +3.6 kB gzip, CSS +2.4 kB gzip. Motion and the
conductor are a separate lazy chunk of 22.5 kB gzip, never fetched under reduced
motion.

## Notes for the Rive frontier (#153)

- The commissioned glass **wings** are dark, semi-opaque glass: about 29% of
  their pixels are partially transparent grey. Wherever they overlap the room's
  bloom they mute it. Rive wings authored as **transmissive/luminous** glass
  would let the room's light through and do most of the "she lights the room"
  work for free.
- Keep Lucy's near aura bounded to her silhouette; the room already supplies
  the large-radius light per state. Two big blooms stacked would read as soup.
- Gaze response should stay larger than the room's ±1.6vmin parallax, so the
  room never looks more alive than she does.

## Evidence

`evidence/` holds the acceptance set: four states with Lucy, room only, Lucy
only, mobile, reduced motion (desktop + mobile), the five-act intro, four
transition filmstrips (+80ms to +1800ms), and two clips.
