# DESIGN.md — the Skill Heaven site

Written from the built world, not ahead of it. Two production surfaces share
one visual system:

| Route | Surface | Register |
|---|---|---|
| `/` | **The hero** — "the instrument" | poster; one screen, operable |
| `/landing` | **The document** | scannable; numbered sections, ledger density |

`/hero-a` and `/hero-b` are retained prototype review routes, reachable only by
direct URL. They still load the older `styles/tokens.css` and are **not** part
of this system — see the collision note at the end.

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
hell      #efece7 paper · #171618 ink · rgba(23,22,24,.16) line
house     #38bdf8 research · #fbbf24 tree   (hairlines and links only)
```

Two rules that are easy to break:

- **The spectrum appears as split light, never as a fill** — the 56px 2px rule
  under a section number or a selected direction plate, the footer band, the
  section marker. Never a gradient background, never gradient body text.
- **Hell is monochrome.** The invert carries no colour at all; that is what
  makes the impact frame land. Any accent surviving into Hell is a bug. The
  character art is the one exemption, because the Hell master is *itself* a full
  RGB inversion — the page flips and the art does not.

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

## The hero — "the instrument"

**Thesis: a hero you operate, not one you watch.** It refuses the scroll-jacked
cinematic hero the previous version was, and the headline-plus-screenshot hero
the category ships. The product *is* four surfaces plus a discrete ladder, so
the first viewport hands the visitor that control and lets them work it before
installing anything.

Composition: nav → registration row (a **state index**, not an eyebrow) →
`SKILL` + the state word in Anton → command and role → blurb → the command line,
which rewrites live off the instrument → the filled CTA plus a ghost CTA → the
raw install string. The approved character master for the active state anchors
the right column, bottom-aligned.

The instrument band closes the viewport: a thesis caption, four direction plates
(`/skill-zero` · `/skill-heaven` · `/skill-hell` · `/skill-ultra`), and the
`off…max` ladder with a slot strip showing how many skills may be auto-summoned
per capability gap.

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
- Per-rung auto-summon counts are **provisional** and every surface that renders
  one carries the WIP mark.
- **`slider` is banned vocabulary.** The control is a ladder with discrete rungs.
- Hell is not gated, locked, or refused; it is one of two live directions.
- No fabricated logos, pricing, testimonials, or counts. `19,661` · `20,176` ·
  `28,379` · `−28.9%` · `+515 tok` are the real measured figures.
- A standing `WIP · v0` disclosure sits in the chrome and the footer.

## Token collision — read before adding a surface

`styles/tokens.css` (the retained prototype routes) and `styles/system.css`
both define seven `--sh-*` names with **different meanings**, most dangerously
`--sh-ink`: bone body text here, a near-black card fill there. Import order
decided the winner at `:root`, which made both production surfaces draw
`#10121d` on `#1b1a1c` — invisible.

`system.css` re-declares the contested names on the `.hx` and `.lp` roots, so
specificity settles it instead of import order and the legacy routes keep their
own values. **A new production surface must add its root to that block**, or
retire `tokens.css` along with the prototype routes.
