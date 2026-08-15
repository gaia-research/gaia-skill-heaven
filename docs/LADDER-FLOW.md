# The Ladder — one mechanic, one line, four surfaces

**Founder ruling, N13 (2026-08-15, corrective).** Restores the single-scale
reading and supersedes the "two independent ladders" reading N12 briefly
carried. There is **one ladder — one line** — and the four surfaces are
contiguous **bands** on it, not four separate controls. `ultra` is the
**crown** of that one line: the controller above everything, rendered as its
seventh selectable rung so the whole thing reads as a single continuous axis.

## The mechanic

`/summon` is the mechanic — **one skill into context, one session, nothing
installed** — and it is present in **every implementation, at every rung, on
every door**, copied straight from how `skill-hell` already does it. Nothing
below is a different mechanic; it's a different amount of automation wrapped
around the same single act.

## One line, read as four bands

A session sits at **exactly one rung**. Which surface you are in is **read
from the rung** — you do not hold a Heaven position and a Hell position at the
same time.

```
  ZERO        HEAVEN            HELL                     ULTRA
 (floor)     (converge)        (explore)              (the controller)
  ┌────┬───────────────┬───────────────────────────┬─────────┐
  │ off │  low   med    │  high    xhigh    max      │  ultra  │
  └────┴───────────────┴───────────────────────────┴─────────┘
    0      1     2         3       4        5         crown
   ships   ▲ default low     ▲ default high          picks direction
  /summon                                             + depth per gap
  (manual)  └─────── auto-summons per capability gap ───────┘
```

- **`off` — Skill Zero.** The product floor. Ships `/summon` by default, with
  **none of the choosing automated**. This is the bottom of the one line.
- **`low · med` — Skill Heaven (converge).** Auto-summons narrowly — the
  right few skills for the gap in front of you. Representative rung: `low`.
- **`high · xhigh · max` — Skill Hell (explore).** Auto-summons widely — more
  experts in context, better until it isn't. Representative rung: `high`.
- **`ultra` — Skill Ultra.** The crown rung. It picks the direction **and**
  the depth per gap — the final form. It sits on the same line as its top
  rung (selectable directly, alongside Heaven and Hell) because there is one
  axis; it has no sub-ladder of its own because it **is** the top of the one.
  Never a slider (N1).

Selecting a surface selects into its band; selecting an individual rung
fine-tunes within it. **Nothing on the line refuses** — every rung and band
is reachable. Hell is not gated, locked, or sealed, and neither is Ultra;
what is outstanding on the upper band is implementation, not permission.

## The rungs (PROVISIONAL until the benchmark lands)

Per-rung counts and the per-band defaults are **provisional** — they do not
land until the Hell/Heaven benchmark does. Every surface that renders one of
these numbers must say so.

| Rung | Band | Skills auto-summoned per capability gap (working mapping) |
|---|---|---|
| `off` | Zero | 0 — manual `/summon` only |
| `low` | Heaven | 1 |
| `med` | Heaven | 2 |
| `high` | Hell | 3 |
| `xhigh` | Hell | 4 |
| `max` | Hell | 5 |
| `ultra` | Ultra | controller — picks direction + depth per gap |

Heaven's representative rung is `low`; Hell's is `high`.

`floor` is **not on the line.** It is the doorless benchmark
placebo-of-record, byte-frozen, reachable only as `--posture floor`. Users
never select it.

## Two dials that share the bottom rung

`off` is where the one line meets Skill Zero's own **boot dial**, and the two
are different questions — worth keeping straight.

**Skill Zero's boot dial is subtractive.** `--level off|low|med →
product-floor | curated | native` decides how much of your ambient setup is
*withheld at launch*. A running session cannot un-load what it already loaded
(D12), so that decision can only be made **at boot** — which is why the
launcher owns it. (These `low|med` are boot postures of the launcher, **not**
the global line's Heaven rungs; the collision of names is historical.)

**The summon line is additive.** `low` through `max` differ by how freely
skills are *summoned in* on top of whatever the session already booted at.
Adding context to a live session is something every harness can do — that is
why summoning works live, launcher or not, native session or not, and why
climbing the line in-session is always allowed (upward-only, same D12
constraint applied to a different dial).

## Stamps are not built

Heaven/Hell stamps remain **out of scope**. Routing falls back to relevance
ranking, and no surface may present stamp-gated routing as running — Skill
Heaven is the surface that will eventually consume stamps, but nothing
consumes them yet.

## Flow

```mermaid
flowchart TD
    A([user picks a rung on the one line]) --> B{which band?}

    B -->|off · Zero| Z[boot dial:<br/>product-floor · curated · native]
    Z --> Z2["`ships /summon by default —<br/>manual, none of the choosing automated`"]

    B -->|low·med · Heaven| E["`converge — summon narrowly<br/>default low`"]
    E --> F[arm converge at that depth]

    B -->|high·xhigh·max · Hell| K["`explore — summon widely<br/>default high`"]
    K --> L[arm explore at that depth]

    B -->|ultra · Ultra| U["`crown rung — picks direction<br/>+ depth per gap · ratified N13`"]

    F --> O([session is armed])
    L --> O
    U --> O
    O --> P{agent hits a<br/>capability gap}
    P -->|yes| Q[/summon/]
    P -->|no| O

    Q --> R[materialize whole skill dir<br/>into the session root]
    R --> S["`print the card: name · tree's own<br/>trust fields (or relevance-only) · cost · path · link`"]
    S --> T[agent uses it — scripts and<br/>reference files intact on disk]
    T --> O

    style U fill:#4a3a2a,stroke:#8a6a3a,color:#e8dcc8
    style F fill:#2a3a4a,stroke:#3a6a8a,color:#c8dce8
    style L fill:#2a3a4a,stroke:#3a6a8a,color:#c8dce8
    style S fill:#2a3a4a,stroke:#3a6a8a,color:#c8dce8
```

## Summoning is ambient, not a search box

Sitting anywhere above `off` does not fetch one skill and stop. Once armed,
the agent summons on its own when it needs something, and the user never
types another command.

Each arrival prints a card — identity, whatever trust fields *the tree
published* (or an explicit "relevance-only" disclosure when it published
none — see Stamps above), install cost (timing always paired with cold/warm
cache state), on-disk path, and a link to inspect it.

Two properties make this work:

- **The whole directory lands on disk**, not just `SKILL.md` — `reference/`,
  `scripts/`, fixtures. That is what makes a summoned skill genuinely usable
  rather than quoted.
- **The card is what makes it known.** Claude builds its skill listing at
  boot and has no mid-session load path (probed, Claude Code 2.1.224). A
  directory written at minute 40 is on disk but invisible to the model. The
  card is the listing entry — and it is far cheaper than pasting the entire
  body, which is what the first prototype did.

`skill-hell summon <intent>` stays available for users who want to name the
skill themselves. That is the advanced path, not the default one.

## Session roots stay warm

Summoned skills live in a session root, never in the user's repo and never in
`~/.claude`. The root survives the session so a later one re-attaches instead
of re-cloning — hot on the iron. A TTL and an LRU payload cache bound the
disk cost.

## What a tree must provide

Nothing beyond an identity. Trust fields — stars, rank, Trust Magnitude,
anything a tree invents — are **carried through and displayed if present,
omitted if absent**. When a tree publishes no trust signal, ranking falls
back to relevance and *says so*, so a caller can tell trust-ranked from
text-matched. A new tree must be able to add a trust dimension we have never
heard of and have it display without an engine change.
