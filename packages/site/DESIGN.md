# DESIGN.md — the Skill Heaven site

Written from the built world, not ahead of it. Two production surfaces share
one visual system:

| Route | Surface | Register |
|---|---|---|
| `/` | **The hero** — Hero A, the animated poster | poster; one screen, operable |
| `/landing` | **The document** | scannable; numbered sections, ledger density |
| `/instrument` | **The instrument** — the sampler | secondary; operate the line |

The old `/hero-a` and `/hero-b` review routes are gone (`main.tsx` routes
anything unknown back to `/`), but `styles/tokens.css` is still imported at the
entry — see the collision note at the end.

## The world

Ported from the approved Claude Design comp. Two pegs own two halves of the
palette and conflating them was the original mistake.

**The ground is washed charcoal `#1b1a1c`, never black.** A warm, desaturated
grey-brown that behaves like printed ink on uncoated stock. It is the reason the
pages read as a document rather than a screen. An earlier pass had it at pure
`#000000`; that over-correction made every accent scream.

**The ink is bone `#eeebe6`**, warm, matched to the peg's linework — not a
blue-white halo. Hairlines are that same bone at low alpha, so every rule on the
page is one family with the type.

**The prism runs at roughly half chroma.** Sampled straight off the character
the hues are display-neon: correct for a figure lit from inside on black, far
too hot as UI on charcoal. Each hue keeps its identity and loses its saturation,
so the spectrum reads as *refracted light* rather than LED.

```
ground    #1b1a1c void · #211f21 panel · #272426 card · #181718 inert
ink       #eeebe6 bone · #9a9691 dim · #67635f faint
hairline  rgba(238,235,230,.11) · strong rgba(238,235,230,.2)
prism     #a58ae0 violet  primary, interactive
          #6f96d8 blue    structure
          #5fc2d6 cyan    highlight, hover, borrowed
          #71ccae mint    measured, safe
          #e094c8 rose    the explore lane
          #d478b0 magenta edge
surface   #5fc2d6 zero · #6f96d8 heaven · #e094c8 hell · #d9b25c ultra
          (these are the calm DOCUMENT hues for /landing + /instrument;
           the animated hero motif below treats each surface as a full
           band, not a single hue)
hell      #efece7 paper · #171618 ink · rgba(23,22,24,.16) line
house     #38bdf8 research · #fbbf24 tree   (hairlines and links only)
```

### The four bands — the hero motif (N13)

The animated hero (`/`, Hero A) reads the **one line** as four bands and gives
each its own colour language. This is louder than the document palette above on
purpose — the hero is operated, the document is read.

- **Zero — zen, washed monochrome.** No deep black; **ink grey `#3A383C` is the
  darkest tone**, on a soft paper ground `#E7E5E0`. Even the figure is rendered
  under a `grayscale(1)` wash. Calm, at rest — the floor.
- **Heaven — the full PRISMATIC spectrum.** Not a blue motif. The state word
  and accents carry the whole refracted spectrum on deep ground.
- **Hell — the INVERTED spectrum.** It is the prism inverted, and it *reads
  red* because that is what the spectrum becomes when inverted — not a red
  motif applied by hand. On the paper (inverted) page.
- **Ultra — a GOLD highlight laid over Heaven, plus a red edge.** Not flat
  gold: the final form is Heaven lit gold with a red accent (`#D9B25C` gold,
  `#C81E1E` red). The figure gets a gold drop-glow.

Two rules that are easy to break:

- **The spectrum appears as split light, never as a fill** — on every surface.
  The 56px 2px rule under a section number or a selected direction plate, the
  footer band, the section marker, and the hero's state word all carry the
  palette as split light or a plain fill. Never a gradient background, never
  gradient body text.
- **Hell is the inverted palette, and it carries no UI red.** The Hell *page*
  is the document inverted (paper + ink flip) and the Hell palette is the prism
  inverted; its only red is the figure's single tear (canon). The impact frame
  lands because the whole page flips; the character art needs no correction
  because the Hell master is *itself* a full RGB inversion — the page flips and
  the art does not.

**Faint (`#67635f`) is a hairline value, not a text value.** At 2.9:1 on
charcoal and 2.7:1 on paper it fails the 4.5:1 body floor. Both surfaces use
`dim` for the smallest labels and reserve `faint` for rules.

## Type

Self-hosted latin subsets in `src/assets/fonts/` — never a font CDN. An external
stylesheet host is a third-party runtime dependency that blocks first paint and
fails closed on restricted networks, and the fallback stack is not the design.

- **Anton** — the condensed heavy display. Two moments only: the hero's state
  word and the footer wordmark. It ships **weight 400 only**, so anything that
  inherits a bolder weight must reset it — an `h1` inheriting 700 makes the
  browser synthesise bold, which clogs the counters and stops it reading as
  Anton at all. `.hx__state` carries `font-weight: 400; font-synthesis-weight: none`.
- **Archivo (variable width)** — display and UI, pushed **wide** to match the
  peg's expanded bowls: headline `wdth 112 / wght 800`, section h2 `wdth 108`,
  labels `wdth 106`.
- **JetBrains Mono** — everything a developer would type or read as data:
  commands, doses, status chips, section numbers, nav, annotations. 9–13px,
  tracking .12–.24em.

Floor: **10px mono for HUD labels, 13px body. Nothing smaller.**

Two structural borrows: **registration marks** (a hairline cross, two 9px
circles, a rotated `PLATE NO. 001`) and **outline as a second voice** — the
footer's `SKILL HELL` as a 1.5px `-webkit-text-stroke` offset behind the solid
`SKILL HEAVEN`. It reads far better than a low-opacity fill.

## The hero (`/`) — Hero A, the animated poster

**The official hero is Hero A** (`src/variations/VariationHeroA.tsx`) — the
five-act, wheel/keyboard/touch-driven scrollytelling piece, centered and
monumental, ending on the **one line** (N13): a single ladder
`ZERO · low · med · high · xhigh · max · ULTRA` whose four surfaces are
contiguous bands. Selecting any rung frontloads the slice/glitch impact and
repaints the page to that band's motif (see the four bands above); the CTA
rewrites and glitches into existence on every switch. A persistent
`Skip · Enter the door` control routes to the document. Ultra is rendered as
the seventh, crown rung — the word reads **SKILL ULTRA**, gold with a red
edge, never "Skill Hell Ultra".

## The instrument (`/instrument`) — the sampler

**Thesis: a surface you operate, not one you watch.** Kept as a secondary
explore page so a visitor can work the surfaces and decide which to pick. It
looks strong on desktop but lacks Hero A's animated feel, which is why it is
no longer the front door.

> **Pending:** the instrument still renders the earlier two-dial model
> (pick a direction, then a per-direction rung). Under N13 it should render
> the single one-line ladder with the four bands read from the rung. Tracked
> for the next iteration.

Composition: nav → registration row (a **state index**, not an eyebrow) →
`SKILL` + the state word in Anton → command and role → blurb → the command line,
which rewrites live off the instrument → the filled CTA plus a ghost CTA → the
raw install string. The approved character master for the active state anchors
the right column, bottom-aligned.

The instrument band closes the viewport: a thesis caption, four direction plates
(`/skill-zero` · `/skill-heaven` · `/skill-hell` · `/skill-ultra`), and the
`zero…max` ladder under a **skill entropy** gauge. The gauge reads out the
current rung's **direction** and its **position along the band** — never a
count. The earlier slot strip (five pips, "how many skills per gap") is
retired along with the count model itself.

**The two surfaces with no ladder render its absence as content** rather than
hiding the control — Zero states that `/summon` is the floor, Ultra states that
the controller decides. That is the clearest thing on the page about what Ultra
*is*.

**Signature interaction.** Selecting a direction fires the impact frame, and the
explore direction inverts the whole page to paper.

Layout stability is load-bearing here: the gauge column reserves one height
across all four states and the blurb reserves its tallest line count, because
otherwise clicking a direction plate relocates the plate you just clicked.

## The document — `/landing`

Wireframe register, deliberately inverting every hero choice: scannable rather
than cinematic, ledger rows and terminals rather than one statement per screen,
numbered sections `01`–`05`.

Wireframe cues are **load-bearing, not decoration**: dashed asset slots, `▸`
annotation strips, section numbers over the 56px split-light rule, 5px accent
squares in panel corners, hairline borders at **0px radius**.

| § | Name |
|---|---|
| — | Arrival header — compact, no repeat of the hero headline; measured dose panel |
| 01 | Choose your door — five real `*-zero` doors, install one-liner, launch command |
| 02 | Watch it run — looping terminal, impact frame scoped to the panel |
| 03 | Skills are permanent. Sessions are not. |
| 04 | Converge or explore — the `/summon` floor, then the four surfaces |
| 05 | One house, three rooms |
| — | Footer — loud wordmark, four minimal link columns |

**§03 is the strongest section and must not be weakened.** The argument in three
beats, then a before/after pair where the reader clicks rows to mount and drop
skills, live counters recomputing off the benchmark floor, and a verdict strip
whose sentence changes with what the reader did. The point lands because the
reader causes the mutation themselves and then watches `git status` refuse to
notice. That is the product.

## The impact frame

One shared mechanic, same numbers on both surfaces:

- `46ms`, `steps(3, end)`, shear plus translate, **max 8px** displacement.
- Hard invert on the same frame: `#1b1a1c → #efece7`, `#eeebe6 → #171618`.
- **The hero owns the full-page invert.** On the landing page it is scoped to
  the terminal panel, because the reader is mid-document.
- Nothing eases. Transitions are linear so the flip reads as a **cut, not a
  fade**.

## Art

Approved v4 character masters at `src/assets/lucy/v4-approved/set-a/`, the
alpha-verified katana pack at `src/assets/lucy/frontpage/katana-authority-v2/`,
and state icons under `identity/`.

Canon that is not negotiable:

- **Zero carries no wings.** Never composite a wing or shard asset behind it.
- **Hell is a full RGB inversion of Heaven** — never colour-corrected back,
  never inverted a second time by a CSS filter.
- Sets A, B and C are all owner-approved; do not collapse them to one. The
  hero and landing default to set A.
- The katana pack is the one alpha-certified family. The character masters carry
  uncertified mattes, so prefer them composited on a dark ground over hard
  cutout use.
- **The logo stays a dashed slot.** It is the one asset still in commission.

## Product-truth guardrails

- Doses are always **two numbers**, never averaged; floors named separately.
- The launcher **composes and execs** — it never stashes, restores, or mutates.
- **The bottom rung is `zero`, never `off`.** `off` named a switch position;
  `zero` names a reading of the quantity the line measures.
- **`slots`, `RUNG_SLOTS`, "budget", "cap", "how many skills", "per-gap budget"
  are banned vocabulary**, along with `slider`. The control is a ladder with
  discrete rungs, and a rung names a **direction** and a **position along its
  band** — never a number. Where each band opens (`low`, `high`) is provisional
  and every surface that renders the line carries the WIP mark.
- **Hell and Ultra are not gated, locked, sealed, or refused.** Nothing on the
  line refuses. Do not write copy that denies a sealing that was never on the
  table — the denial implies the thing.
- **Skill Zero subtracts; Skill Heaven converges.** Never attribute stripping,
  evicting, or subtracting to Heaven.
- **The install copy prints only commands the tool accepts.** The plugin
  two-liner is primary, `install.sh` at the GitHub Pages host is the optional
  launcher route, and there is no `npx` path and no `skill-heaven.dev`.
- No fabricated logos, pricing, testimonials, or counts. `19,661` · `20,176` ·
  `28,379` · `−28.9%` · `+515 tok` are the real measured figures. The entropy
  curve and the Heaven/Hell stamps are **not built** — never rendered as
  results.
- A standing `WIP · v0` disclosure sits in the chrome and the footer.

## Token collision — read before adding a surface

`styles/tokens.css` (the retired prototype routes' palette, still imported by
`main.tsx`) and `styles/system.css`
both define seven `--sh-*` names with **different meanings**, most dangerously
`--sh-ink`: bone body text here, a near-black card fill there. Import order
decided the winner at `:root`, which made both production surfaces draw
`#10121d` on `#1b1a1c` — invisible.

`system.css` re-declares the contested names on the `.hx` and `.lp` roots, so
specificity settles it instead of import order. **A new production surface must
add its root to that block**, or retire `tokens.css` — now that the prototype
routes are gone, retiring it is the cleaner fix and is still outstanding.
