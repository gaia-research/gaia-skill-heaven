# Lucia Refractions — design brief for the post-door `/landing`

**Status:** DRAFT FOR FOUNDER REVIEW. Design-only. Nothing here merges, deploys or publishes.
**Design lead:** Cloud design lead (Claude Code, then Claude Design). Final website-design authority.
**Image production:** Pi team (Hydrogen preflights, Sol produces). Pi owns pixels, not the design system.
**Gates (two, never merged into one):**

1. **Design acceptance** — the design lead marks each candidate `ACCEPT FOR PROTOTYPE`, `RETAKE`,
   `REJECT` or `HOLD`. This only admits a candidate to the draft prototype.
2. **Founder asset approval** — the founder approves each asset from a reviewable gallery before
   it is promoted into `packages/site/src/assets/`. Until then no generated pixel enters this
   public repository.

Companion files in this folder: [`ASSET-MANIFEST.json`](ASSET-MANIFEST.json) (the job list Pi
works from), [`COORDINATION.md`](COORDINATION.md) (message formats, statuses, staging, decision
log).

---

## 0. The one sentence

**Lucy is the heroine and the page is her instrument: every control a visitor touches plays her,
and the glass the page is built from is cut by the state she is in.**

The hero (`/`) already makes that promise: a lit stage, one girl, four states, one line. The
document (`/landing`) currently breaks it. It drops her into a small corner slot on a charcoal
page made of square boxes. This brief carries the hero's promise through the document without
weakening the parts of the document that already work.

---

## 1. Canon this brief obeys (read, not restated)

| Authority | What it fixes here |
|---|---|
| `packages/site/PRODUCT.md` | One mechanic (`/summon`), one line `zero · low · med · high · xhigh · max · ultra`, four surfaces as bands, two statuses (tool LIVE, research PROVISIONAL), Ultra "provisioned · controller unavailable", no counts, no `autonomous`, install hierarchy |
| `packages/site/DESIGN.md` | Charcoal ground `#1b1a1c`, bone ink `#eeebe6`, half-chroma prism, split light never a fill, Hell = inverted prism with no UI red, impact frame 46ms `steps(3)` ≤8px, landing invert scoped to a panel, Anton two moments, type floors |
| `docs/lucy/authority/lucy-canon.json` and the v5 masters | Lucy's identity, pose per state, eyes, single tear, weapon count, Zero has no wings or shards, Hell master is itself a full RGB inversion |
| `gaia-research/lucy` `docs/DECISIONS.md` (2026-11-03) | Wings are a hero effect layer, not character. Coloured eye flares and the eye-flame were rejected: **no flare or glow is ever attached to her eyes**. |
| `.agents/skills/lucy-image-production/SKILL.md` | `gpt-image-2.6` only, one call per named candidate, real alpha, `#00FF00` chroma fallback, matte guard, Hell derives by exact inversion, receipts |
| HQ lexicon `gaia.brand` (N7) | `Lucia` official first name, `Lucy` everyday name, no surname |
| Brand architecture (three names) | **Gaia Skill Tree — the record. Gaia Research — the laboratory. Gaia Skill Heaven — the runtime.** |

**Lore boundary.** A private lore source was consulted for tone only. **No lore content, clue,
motif, mystery, date or term enters this PR, its comments, the prototype or any preview.** A lore
Easter egg would have to pass that source's own release governance and founder approval first;
none is proposed here. Lore never changes a product fact.

---

## 2. What the rendered site shows today

Captured from a production build at 1440×900 and iPhone 13 (390×844). Evidence is in the PR.

- **The seam breaks.** The hero's last frame is a full-bleed lit stage with Lucy at ~95% viewport
  height. One click later `/landing` opens on a charcoal page, a four-line headline and a dose
  panel. Lucy is reduced to a Zero figure cropped into the bottom-right corner. On mobile she
  appears after about two screens of text.
- **The hero already hands over state** (`?section=…&tab=heaven|hell|ultra`) and the landing
  uses it only to pick a terminal tab. The seam hook exists and is unused.
- **Everything is a box.** Zero-radius hairline rectangles nest inside rectangles (panel, then
  sub-panel, then command block). This is what the founder calls "chonky".
- **Copy is dense where it should demonstrate.** The arrival carries a banner sentence, a
  headline, a 60-word lede, two CTAs, the slash reel and a dose panel. The install commands appear
  three times (§01 primary, §01 launcher, §02 plugin box).
- **Strong and worth keeping:** the footer, the terminal sampler (timing, typing cadence, braille
  spinner, scoped Hell flip), §03's mount/drop story with its live verdict, the install paths, the
  closing triptych of three full-figure masters.

---

## 3. Component audit — retain / reskin / reshape / introduce

**Retain** = untouched (code and look). **Reskin** = same structure and behaviour, new material.
**Reshape** = same content and behaviour, new geometry or layout. **Introduce** = new.

| # | Component | Verdict | What changes, what is protected |
|---|---|---|---|
| 1 | Footer (`.lp-foot`, wordmark, bar) | **Retain** | Non-negotiable. Byte-identical markup and CSS. The stage releases before it. |
| 2 | Terminal logic (`CLAUDE_TURNS`, `SAMPLER_SEQUENCES`, typing/turn timers, braille, sticky tail, scoped Hell flip, reduced-motion path) | **Retain** | No change to logic, timing, interaction contract or content. |
| 3 | Terminal housing (`.lp-cc-term` outer frame) | **Reskin** | Glass case with one beveled corner and a non-mirrored portrait reflection in the bevel facet. Inner `.lp-cc-*` styles untouched. |
| 4 | Sampler tabs | **Reskin** | Blade tabs (kissaki cut). Same buttons, same handlers. Selecting a tab also re-casts Lucy (read-only listener; the terminal is not modified). |
| 5 | §03 session story (beats, tree, rows, counters, verdict) | **Retain + reskin** | Strongest section. Behaviour and copy untouched; beat cards and story panels become shards. |
| 6 | Install paths (§01 primary, Claude compatibility, launcher doors, `/start` links) | **Retain + reskin** | Every command, toggle, copy button and link preserved. Panels become shards; door tiles become blades. |
| 7 | §02 plugin box (third copy of the install command) | **Reshape** | Collapses to a one-line glass strip with a disclosure; commands stay one click away. Founder decision D-04. |
| 8 | Nav | **Reskin** | Same links. INSTALL becomes a blade CTA. |
| 9 | Arrival header (banner, H1, lede, CTAs, slash reel, dose panel) | **Reshape** | Copy retained. LIVE banner becomes a compact chip (same link, same facts). The dose panel becomes a glass instrument readout docked to Lucy's stage. |
| 10 | Arrival figure (Zero corner crop) | **Replace** | Becomes **the Stage**: Lucy in the current state, full height, continuous with the hero. |
| 11 | §04 direction cards | **Reshape** | Asymmetric shards per state grammar (Heaven ordered, Hell fractured paper, Ultra crowned). Ultra gains the mandated `PROVISIONED · CONTROLLER UNAVAILABLE` chip. |
| 12 | §04 ladder | **Reshape** | **The peak.** A blade rail of seven detents under the Stage. Picking a rung re-casts Lucy and re-cuts the page (signature move). Keyboard ←/→ preserved. |
| 13 | §05 "One house, three rooms" | **Reshape** | **The three-name signature.** One beam enters a prism and leaves as three: *the record*, *the laboratory*, *the runtime*. Same links. |
| 14 | Closing triptych | **Reskin** | The three full masters stay; frames become tall shards. The Stage fades out as the triptych arrives so Lucy is never shown twice in one view. |
| 15 | The Stage (`LucyStage`) | **Introduce** | Sticky/fixed right-hand stage on desktop; full-bleed state plate on mobile. Hosts the hero's own `LucyAtmosphere` so the room is literally the same room. |
| 16 | Shard material system (`shards.css`) | **Introduce** | Clip-path geometry, split-light edges, shimmer, state grammars. Replaces 0-radius boxes inside `/landing` only. |
| 17 | State switch (`zero · heaven · hell · ultra` on the Stage) | **Introduce** | Explicit, keyboard-operable way to play her directly. Also driven by hero handoff, sampler tabs and rungs. |

---

## 4. Findings outside this brief's scope (recorded, not fixed here)

| ID | Finding | Why it is not changed in this PR |
|---|---|---|
| F-01 | The terminal's Ultra and Hell turns show a "controller" decomposing gaps and the tool committing and opening draft PRs. DESIGN.md says the terminal "must not show … no pull request the tool opens", and PRODUCT.md says the Ultra controller is not built. An `ILLUSTRATIVE SESSION` tooltip mitigates this. | The founder protects the terminal's content. Founder decision D-06. |
| F-02 | §04 Hell "reach" list says `full agentic autonomy` and `yolo-ing`. PRODUCT.md: never write "autonomous". | Copy is the message owner's call. Founder decision D-06. |
| F-03 | §04 Ultra card shows `LIVE` without "provisioned · controller unavailable". | Fixed in the prototype as a chip (PRODUCT.md mandates it), flagged for confirmation. |
| F-04 | The nav/footer logo is a 1.8 MB PNG drawn at ~40px. | A performance fix belongs in its own PR. |
| F-05 | `--sh-zero`/`--sh-hell` token drift (DESIGN.md "known drift"). | Shard tokens use the documented document hues and never read `--sh-zero`/`--sh-hell`. |

---

## 5. Three character-first studies

All three keep the footer, terminal logic, §03, the install paths and the hero. They differ in
**where Lucy lives** and **what the glass does**.

### Study A — PRISM STAGE  ·  *recommended*

> She never leaves. The document is glass passing in front of her.

- **Lucy:** a fixed stage on the right half of the desktop viewport, full height, in the current
  state, standing in the hero's own atmosphere. Sections slide over her as glass panes. Where a
  pane overlaps her, she reads through it as a faint reflection. In the gaps she is fully present.
  On mobile she opens the page as a full-bleed state plate and returns as a portrait shard in the
  terminal and the ladder.
- **Glass:** every panel is a beveled, asymmetric shard. Its edge carries split light along the
  long bevel only. **The state cuts the glass:** Heaven shards are ordered on one shared angle,
  Hell shards are fractured and printed on paper, Ultra shards rise to a crown point, and Zero
  glass is plain hairline with no prism.
- **Signature move — "her state cuts the page":** any choice (sampler tab, rung, direction card,
  the Stage's own switch, or the hero handoff) re-casts Lucy, and on the same 46ms impact frame
  every shard on the page re-cuts to that state's grammar.
- **Peak:** §04. The ladder is a blade rail beneath her. Crossing `med → high` flips her stage to
  paper (the Hell master is already an inversion), and the page's glass fractures.
- **Cost:** procedural CSS/SVG covers the full prototype. Generated assets raise the fidelity of
  the loose foreground shards (four paid calls).
- **Risk:** text over a figure. Mitigated by ≥0.9 panel faces and ≤10% reflection. The fixed stage
  must yield to the closer and the footer.

### Study B — BROKEN MIRROR

> She is everywhere, in pieces. The page reassembles her.

- **Lucy:** no persistent figure. Each component is a mirror fragment holding one slice of her
  (eye, ribbon, katana guard, hair, wing) cropped from the masters. At the closer, scroll
  reassembles the fragments into her full figure. Heaven converges, Hell scatters.
- **Signature:** reassembly as the converge/explore metaphor made literal.
- **Risk (decisive):** slicing her face into UI tiles breaks "recognizable in every presentation".
  Fragments read as damage. The layout is fragile and costly on mobile, and the arc is
  overwhelmed by an asset per component.

### Study C — KATANA LEDGER

> Restraint. The document stays a document; its edges become blades.

- **Lucy:** full height at the two bookends only (arrival and closer), as cinematic stages.
- **Glass:** long, narrow blade panels with a single diagonal kissaki cut. A fine vertical tear
  line in the margin tracks scroll (red only in Hell and Ultra).
- **Signature:** the blade cut. Lowest risk and lowest cost.
- **Risk:** the founder's ask is an *overdrive* with Lucy as heroine. C leaves her absent for six
  sections, and a margin "tear line" multiplies the tear.

### Decision

**Study A.** It is the only study where Lucy is on screen for the whole document. It also turns
the product's one idea — one line, one state at a time — into the page's own behaviour, and it
directly answers "square looks chonky". B fails the identity rule. C under-delivers the brief. A
takes no element from B or C; mixing them would blur the idea.

---

## 6. Storyboard — the page as a journey (Study A)

Journey beats, feeling curve and device per act. No device family is used twice in a row.

| Act | Section | Beat | Feeling → what causes it | Device | Desktop | Mobile |
|---|---|---|---|---|---|---|
| 0 | Seam | Recognition | *"She's still here."* → the first frame repeats the hero's state, ground and scale | **seam / pin** (fixed stage) | Stage right, state word behind her in Anton (outline + solid), headline left | Full-bleed state plate, headline over the lower third |
| 1 | Arrival | Orientation | Calm confidence → one headline, one chip, instrument readout on her glass | **instrument readout** | Dose bars as split-light rods on a glass plate at her feet | Plate under the headline |
| 2 | §01 Install | Commitment-ready | Practical ease → shards, copy buttons, blade door tiles | **flow + in** | Shards slide over the stage | Stacked shards |
| 3 | §02 Demo | Demonstration | Intrigue, then "it answers me" → a tab click re-casts her | **live surface** | Terminal in a glass case, her reflection in the bevel | Same; portrait shard in the case header |
| 4 | §03 Session | Proof by doing | Relief → the reader mounts/drops and `git status` stays clean | **toggle rows** | Retained, reskinned | Retained |
| 5 | §04 The line | **PEAK** | Awe and agency → a rung re-cuts the whole page around her | **state re-cut + rail** | Rail of seven blade detents under the stage; three state shards | Stage strip pins above the rail while the section is in view |
| 6 | §05 Three names | Belonging | Coherence → a beam enters the prism and leaves as three names | **beam split reveal** | Prism glyph and three beams | Vertical split |
| 7 | Closer | Farewell | Quiet pride → the stage releases; three full figures | **gallery** | Triptych of tall shards | Horizontal snap rail |
| 8 | Footer | — | Unchanged | — | — | — |

**The peak gets the largest span:** §04 keeps its rail and cards and gains the re-cut. The act
before it (§03) is deliberately quieter: no shimmer and no state change.

---

## 7. Responsive interaction specification

### 7.1 One state, many hands

`lucyState: 'zero' | 'heaven' | 'hell' | 'ultra'` — a single page-level value. **The last explicit
visitor action wins.**

| Source | When | Mapping |
|---|---|---|
| Hero handoff | On load | `?tab=heaven|hell|ultra` → that state; `?section=doors` without a tab → `heaven` (the hero's default band) |
| Stage switch | Click/keyboard | Direct |
| Sampler tab | Click only (never the auto-running sequence) | `summon`/`all` → no change; `heaven`/`hell`/`ultra`/`zero` → that state |
| Ladder rung | Click / ←→ | `RUNG_BAND[rung]` |
| Direction card | Click | Card's surface |

The terminal's internal scoped Hell flip is untouched and independent.

### 7.2 The cut (state change)

1. Frame 0–46ms: impact frame on the **Stage only**. Use `steps(3, end)`, shear plus translate of at
   most 8px, and a hard invert flash. Body copy never inverts. This is the only animation that is
   not transform or opacity, and it is bounded.
2. On the same frame: the figure source swaps (preloaded), `data-lucy` updates on the page root,
   and every shard's `clip-path` re-cuts to the new grammar. No easing: it is a cut, not a morph.
3. 0–900ms: the atmosphere runs its own authored transition (existing conductor).
4. An anamorphic split-light streak crosses the stage once at ribbon height (never at eye height).
   It runs for 220ms using transform and opacity.
5. An `aria-live="polite"` region announces the new state once, e.g. "Lucy · Hell — explore".

### 7.3 Pointer, keyboard, reduced motion

- **Keyboard:** the stage switch is a `radiogroup`-like set of four `aria-pressed` buttons. The
  ladder keeps ←/→. Focus rings are drawn inside the shard (`outline-offset: -3px`) because
  `clip-path` clips outer outlines.
- **Pointer (hover-capable only):** a shard under the pointer catches one specular sweep and its
  bevel facet brightens. There is no cursor-follow paint loop.
- **Reduced motion:** no shimmer, no streak and no drift. The cut becomes an instant swap with no
  flash, and the atmosphere stays on its static path. Every state stays reachable and legible.
- **Touch:** no hover states are required to understand anything.

### 7.4 Breakpoints

| Width | Stage | Notes |
|---|---|---|
| ≥ 1100px | Fixed right stage, 46vw, feathered left edge | Panels overlap it as glass |
| 700–1099px | Arrival plate (16:10 crop), portrait shards in terminal and ladder | No fixed layer |
| < 700px | Full-bleed arrival plate (master, `object-position` on face/ribbon), portrait shards | 16px side gutter, no horizontal scroll |

---

## 8. Design brief

### 8.1 Geometry — the shard grammar

Shards are `clip-path` polygons driven by custom properties, so one rule set yields every size.

| Token | Default | Meaning |
|---|---|---|
| `--cut-a` | 26px | Large bevel, top-left — the "struck" corner, where split light enters |
| `--cut-b` | 10px | Small bevel, bottom-right |
| `--rake` | 10px | Top edge falls this far toward the right — no shard has a level top |
| `--tip` | 14px | Blade kissaki cut on tabs, chips, rungs |
| `--drip` | 18px | Tear-geometry terminator depth (Hell, Ultra only) |

| Grammar | State | Shape |
|---|---|---|
| **Ordered** | Heaven | Plate with `--cut-a` and `--cut-b`; every rake shares one angle across the page ("order, not symmetry") |
| **Fractured** | Hell | Plate plus a fracture notch on the right edge; the face is paper, the ink and edges come from the inverted prism, and the rake alternates direction |
| **Crowned** | Ultra | The top edge rises to a peak at 62% (a crown point); the gold edge has a red leading 6px |
| **Plain** | Zero | Only a 4px bevel, hairline edge, no prism, nothing moves |

**Tear geometry (Hell, Ultra).** The founder asked for the blood tear in the components. The
tear itself is canon and is **never multiplied or recoloured**. What the components borrow is its
*shape*: a narrow tapering drip. It appears as one terminator on the lower-left of the §04 state
shard and on the stage's readout plate, drawn in the state's ink, not red. The only red on the
page is still her tear in the art (and Ultra's canonical red edge).

*Optional, founder decision D-03 — "the tear points":* in Hell and Ultra, a 1px red hairline
leaves her actual tear in the art and draws down to the active rung. This extends the one tear
rather than adding another. It is off by default and previewed with `?tear=1`.

### 8.2 Composition — four planes

1. **Room** — the hero's `LucyAtmosphere` (same component, same `state`), dimmed to 70% behind
   the stage only.
2. **Lucy** — the approved v5 delivery master for the state, bottom-aligned, ~92vh. She is never
   mirrored, never re-coloured, and never inverted by CSS (the Hell master is already inverted).
   Zero carries no wings or shards.
3. **Glass UI** — document shards, faces `rgba(33,31,33,.92)` (Hell: paper `rgba(239,236,231,.94)`).
   Lucy reads through them at most as a 10% reflection.
4. **Loose glass** — 5–7 foreground shards around the stage with a small scroll parallax
   (transform only). Procedural stand-ins today, generated shard sprites later (§9). None in Zero.

### 8.3 State behaviour

| | Zero | Heaven | Hell | Ultra |
|---|---|---|---|---|
| Figure | v5 Zero, `grayscale(1)` wash (static, as the hero) | v5 Heaven | v5 Hell (already inverted) on paper stage | v5 Ultra, gold drop-glow |
| Stage ground | Charcoal with a breathing bone bloom (the atmosphere's Zero room) | Deep ground with the prismatic corona | **Paper** stage with the inverted corona | Deep ground with gold bloom |
| Shard edge | Hairline bone | Split prism along the bevel | Inverted prism (rust `#a03d29`, umber `#906927`, olive `#5a751f`) | Gold `#d9b25c` with a red `#c81e1e` leading edge |
| Grammar | Plain | Ordered | Fractured | Crowned |
| Shimmer | None | Specular sweep | Registration slip (static, offset ghost edge) | Gold sweep |
| Loose glass | None (canon) | Ordered shards | Fragmented inverted shards | Gold shards |
| Tear geometry | — | — | Drip terminator | Drip terminator |

### 8.4 Motion

- **Timings:** impact 46ms `steps(3,end)`, streak 220ms, atmosphere ≤1700ms (existing), shimmer
  sweep 1.6s at a 9–14s staggered interval. Parallax runs at no more than 60px of travel across a
  viewport.
- **Rules:** transform and opacity only, except the bounded impact frame. No animated filter,
  backdrop or blend mode. Every loop pauses offscreen. Nothing eases on a state change.

### 8.5 Typography

There are no new families. Archivo (wide) carries display and UI, JetBrains Mono carries data and
labels, and Anton stays at **two moments**: the hero's state word, which continues onto the stage
as the seam, and the footer wordmark. Section numbers become blade chips. Body text floor is 13px
and mono labels stay ≥10px. `faint` is never used for text.

### 8.6 Lighting

- **Split light, never fill.** Prism hues appear only as hard-stop stripes along bevels, rules and
  the streak. They never form a gradient background or gradient text.
- **Flare** belongs to the glass, not to her eyes. It shows only as the streak on a cut and the
  bevel glint on hover. Eye flares were rejected by the owner and stay rejected.
- **Hell** has no hand-placed red. Its warmth is the inverted prism.

### 8.7 Hierarchy

Lucy > headline > the one action (Install) > the demonstration (terminal, §03 rows, §04 rail) >
annotation. Copy that only restates something already shown is collapsed (behind a disclosure)
or proposed for removal (D-05); it is never silently deleted.

### 8.8 Accessibility

WCAG AA. Shard faces keep text at ≥4.5:1 over the worst-case reflection. Every interactive shard
has a visible inside focus ring. The figure carries a per-state `alt`; loose glass and atmosphere
are `aria-hidden`. A state change is announced once. Nothing flashes more than once per change,
and the impact frame is a single 46ms frame.

### 8.9 Performance

- **No new runtime dependencies.** Added CSS ≤ 20 KB gz; added JS ≤ 6 KB gz.
- **Images:** the current state's master loads eagerly, the others preload on idle. No new raster
  enters the build until the founder approves one, and a generated shard sprite is ≤ 120 KB WebP.
- **Mid-range mobile:** LCP ≤ 2.5s with no regression against `main`, CLS 0 on state change
  (fixed boxes), and no layout shift from the stage.

---

## 9. Procedural vs generated

| Effect / element | Route | Why |
|---|---|---|
| Shard geometry, bevels, fractures, crowns, drips | **CSS `clip-path`** | Exact, responsive, re-cuttable on the impact frame |
| Split-light edges, streak, shimmer, registration slip | **CSS gradients (hard stops) + transforms** | Canon says split light, which is vector by nature |
| Prism glyph and beams (§05) | **Inline SVG** | Crisp, themeable, tiny |
| Room behind Lucy | **Existing `LucyAtmosphere`** | Identity with the hero |
| Lucy in every state | **Existing v5 delivery masters** | Identity authority. No regeneration. |
| Portrait reflections and busts | **CSS crops of the same masters** | Zero new bytes, zero identity risk |
| Loose foreground glass (Heaven, Ultra) | **Generated** (LR-G01, LR-G02) | Real refraction, caustics and facet light are what procedural glass cannot fake. The existing component WebPs carry recorded matte artifacts. |
| Loose foreground glass (Hell) | **Derived** (LR-D01) | Canon: Hell descends by exact inversion; fragmentation is deterministic |
| Wing-fragment divider | **Derive first** (LR-D02), generate only if that fails (LR-G03) | The hero's wing layers already exist |
| Caustic light plate | **Hold** (LR-G04) | Only if procedural light fails acceptance |
| New key art "Lucy at the instrument" | **Proposed, not issued** (LR-G05) | New character art needs founder go before a brief exists |

The prototype is **complete without generated assets**. Pi's assets raise fidelity, and nothing
waits on them.

---

## 10. Decision log

| ID | Date | Decision | Owner | Status |
|---|---|---|---|---|
| D-01 | 2026-11-18 | Study A, Prism Stage, recommended | Design lead | Awaiting founder |
| D-02 | 2026-11-18 | Prototype ships procedural stand-ins; generated assets swap in only after both gates | Design lead | Decided |
| D-03 | 2026-11-18 | "The tear points" leader line | Founder | Open, off by default (`?tear=1`) |
| D-04 | 2026-11-18 | §02 duplicate install collapses to a disclosure strip | Founder | Open |
| D-05 | 2026-11-18 | Further copy cuts (list in the PR) | Founder | Open |
| D-06 | 2026-11-18 | F-01/F-02 truth drift in terminal and reach lists | Founder | Open, recorded only |
| D-07 | 2026-11-18 | Phase 2: Lucy alive (Rive `LucyLive`) on the stage instead of static masters | Founder | Open |
| D-08 | 2026-11-18 | Private staging location for unapproved art | Hydrogen + founder | Proposed: `gaia-research/lucy` branch `staging/landing-refractions` |
