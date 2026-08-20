#!/usr/bin/env python3
"""Generate the entropy-ladder hero diagram as a single self-contained SVG.

What the ladder measures — skill entropy, i.e. how much skill variety and
volume enters a session — is the canonical statement in docs/LADDER-FLOW.md
("What the ladder measures — skill entropy"). This file draws the shape that
section explains; it does not restate the argument, only the four surfaces and
seven rungs (N13): `zero` (floor) · `low · med` (Heaven, converge) ·
`high · xhigh · max` (Hell, explore) · `ultra` (the top of the line, picks
the entropy for you, gap by gap).

The diagram is a README hero, so it does two jobs at once: it draws the line,
and it sells the four surfaces. Each surface gets a card that names **who it is
for** and **which command opens it** — the two things a reader needs before
they will install anything.

The organising distinction across the cards is **who does the choosing**:

  Zero, Heaven    human-led   — you pick; the agent summons what you point at
  Hell, Ultra     model-led   — the model reaches, and picks for you

That happens to fall on the same seam as the palette inversion, which is why
the two grounds carry it: Heaven's luminous-white-on-void is the human-led
half, Hell's black-on-white is the model-led half.

Palette and type come from the site prototype's token system
(packages/site/src/styles/tokens.css) rather than anything invented here:

  Heaven side  luminous white on void, prismatic accent used sparingly
  Hell side    the inversion — black on white, no color, only impact

`zero` shares Heaven's void ground and `ultra` shares Hell's white ground, but
each still gets its own card, because neither is part of Heaven or Hell: `zero`
is its own surface (Skill Zero) and so is `ultra` (Skill Ultra). Sharing a
ground is a layout convenience, not a claim about which band something belongs
to. `ultra` is drawn inverted *again* (black card on the white ground) because
it is the crown of the line — not because it is withheld; nothing on the line
refuses (N13).

The header and footer bands run full width on the void ground so that the
lines which apply to the whole line — the mechanic, the reachability claim,
the PROVISIONAL caveat — are not cut in half by the divider.

Because each region carries its own ground, the file needs no light/dark
variants and cannot drift.

Everything is drawn with presentation attributes rather than CSS: GitHub renders
SVG in isolated <img> mode, where attribute-styled shapes survive reliably and a
stylesheet may not. Webfonts cannot load in that mode either, so the token font
stacks are declared in full and degrade to system-ui.

Run: python3 scripts/gen-ladder-svg.py
"""

import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "assets"

# --sh-font-* from tokens.css. Single quotes inside: these land in a
# double-quoted XML attribute.
DISPLAY = "'Space Grotesk','Inter',system-ui,sans-serif"
BODY = "'Inter',system-ui,-apple-system,sans-serif"
MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace"

# Heaven — canvas + luminance + one prismatic accent
VOID = "#05060a"
INK = "#10121d"
LINE = "#2b2d3a"
LINE_STRONG = "#3d4155"  # visible hairline on the void ground
LUMEN = "#f7f8ff"
LUMEN_DIM = "#a9adc4"
LUMEN_FAINT = "#6b6f88"
PRISM = "#37d6e0"  # --sh-prism-3, aqua

# Hell — the inversion. No color by design.
HELL_BG = "#f4f4f2"
HELL_INK = "#050505"
HELL_DIM = "#6a6a68"
HELL_LINE = "#050505"
HELL_RULE = "#d3d3cf"

WIDTH, HEIGHT = 1060, 612

# ── the line ──────────────────────────────────────────────────────────────
# rung, band. No rung carries a count (N13) — nothing here is a number.
RUNGS = [
    ("zero", "zero"),
    ("low", "heaven"),
    ("med", "heaven"),
    ("high", "hell"),
    ("xhigh", "hell"),
    ("max", "hell"),
    ("ultra", "ultra"),
]

BOX_W, BOX_H = 104, 44
GAP = 12          # between rungs inside one band
BAND_GAP = 58     # between bands — wide enough that each band reads as a unit
RISE = 10         # each rung sits a step higher: more skill entropy, literally
TOP_LOW = 220     # top edge of the lowest rung (zero)

HEADER_H = 120    # full-width void band above the split
FOOTER_Y = 552    # full-width void band below the split

AXIS_Y = 298
CARD_Y, CARD_H = 336, 196

# ── the four surfaces ─────────────────────────────────────────────────────
# `led` is the organising distinction: who does the choosing. `who` is the
# reader-facing "is this me?" line. Body copy is pre-wrapped because SVG has
# no text flow — line lengths are tuned to each card's inner width.
SURFACES = [
    {
        "band": "zero",
        "title": "Skill Zero",
        "cmd": "/skill-zero",
        "led": "HUMAN-LED",
        "width": 164,
        "body": [
            "Vanilla harness with",
            "nothing loaded. Precise,",
            "bloat-free context.",
        ],
        "who": "MINIMALISTS · DOCTORS",
    },
    {
        "band": "heaven",
        "title": "Skill Heaven",
        "cmd": "/skill-heaven",
        "led": "HUMAN-LED",
        "width": 246,
        "body": [
            "Converge. You pick the direction; the",
            "agent summons the right few skills for",
            "the gap in front of you.",
        ],
        "who": "YOU STAY THE AUTHOR",
    },
    {
        "band": "hell",
        "title": "Skill Hell",
        "cmd": "/skill-hell",
        "led": "MODEL-LED",
        "width": 330,
        "body": [
            "Explore. The model reaches wide and pulls in more",
            "experts into context than you would have picked —",
            "a mixture of agents, for skills.",
        ],
        "who": "THE MODEL DOES THE CHOOSING",
    },
    {
        "band": "ultra",
        "title": "Skill Ultra",
        "cmd": "/skill-ultra",
        "led": "MODEL-LED",
        "width": 170,
        "body": [
            "The crown. Picks the",
            "direction and the depth",
            "for you, gap by gap.",
        ],
        "who": "FLEET OPERATORS",
    },
]

# Direction tags printed above each band's rungs.
BAND_TAG = {
    "zero": "floor",
    "heaven": "converge",
    "hell": "explore",
    "ultra": "crown",
}

ARIA_LABEL = (
    "Skill Heaven's one line of seven rungs measures skill entropy — how much "
    "skill variety and volume enters a session. Zero is the human-led floor: a "
    "clean harness with nothing loaded, opened with /skill-zero. Heaven (low, "
    "med) is human-led and converges narrowly on the gap, opened with "
    "/skill-heaven. Hell (high, xhigh, max) is model-led and explores widely "
    "around it, opened with /skill-hell. Ultra is model-led and sits at the top "
    "of the line, picking the entropy for you gap by gap, opened with "
    "/skill-ultra. Every rung is reachable; nothing on the line refuses."
)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, *, size, fill, family=BODY, weight="400", anchor="middle", spacing=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
    )


def rect(x, y, w, h, *, fill, stroke=None, sw=1.5, rx=None):
    parts = [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"']
    if rx is not None:
        parts.append(f'rx="{rx}"')
    parts.append(f'fill="{fill}"')
    if stroke:
        parts.append(f'stroke="{stroke}" stroke-width="{sw}"')
    return " ".join(parts) + "/>"


def line(x1, y1, x2, y2, *, stroke, sw=1):
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{stroke}" stroke-width="{sw}"/>'
    )


def pill(x, y, label, *, fill, ink):
    """Small caps chip. Width is estimated from the glyph budget — SVG cannot
    measure text, and these labels are a fixed, known set."""
    w = len(label) * 7.4 + 22
    out = [rect(x, y, w, 19, fill=fill, rx=9.5)]
    out.append(
        text(x + w / 2, y + 13.5, label, size=9, fill=ink,
             family=DISPLAY, weight="700", spacing="1.4")
    )
    return out, w


def layout():
    """Positions for the seven rung boxes, keyed left to right."""
    total = len(RUNGS) * BOX_W + (len(RUNGS) - len(BAND_TAG)) * GAP
    total += (len(BAND_TAG) - 1) * BAND_GAP
    x = (WIDTH - total) / 2

    xs, tops = [], []
    prev_band = None
    for i, (_, band) in enumerate(RUNGS):
        if prev_band is not None:
            x += BAND_GAP if band != prev_band else GAP
        xs.append(x)
        tops.append(TOP_LOW - i * RISE)
        x += BOX_W
        prev_band = band
    return xs, tops


def span(xs, band):
    idxs = [i for i, r in enumerate(RUNGS) if r[1] == band]
    left = xs[idxs[0]]
    right = xs[idxs[-1]] + BOX_W
    return left, right, (left + right) / 2


def build():
    p = []
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{esc(ARIA_LABEL)}">'
    )

    xs, tops = layout()
    mids = {b: span(xs, b)[2] for b in BAND_TAG}

    # The divider sits midway between the last human-led rung (med) and the
    # first model-led one (high).
    void_n = sum(1 for _, b in RUNGS if b in ("zero", "heaven"))
    split_x = (xs[void_n - 1] + BOX_W + xs[void_n]) / 2

    # ── grounds ─────────────────────────────────────────────────────────
    p.append(rect(0, 0, WIDTH, HEIGHT, fill=VOID))
    p.append(rect(split_x, HEADER_H, WIDTH - split_x, FOOTER_Y - HEADER_H, fill=HELL_BG))

    # ── header (full width, void) ───────────────────────────────────────
    cx = WIDTH / 2
    p.append(text(cx, 44, "ONE MECHANIC  ·  ONE LINE  ·  FOUR SURFACES", size=11,
                  fill=LUMEN_FAINT, family=DISPLAY, weight="700", spacing="3.4"))
    p.append(text(cx, 78, "Decide how much skill enters the session.", size=24,
                  fill=LUMEN, family=DISPLAY, weight="700"))
    p.append(text(cx, 102,
                  "/summon puts one skill into context — one session, nothing installed. "
                  "The line below sets how far the agent reaches.",
                  size=12.5, fill=LUMEN_DIM))

    # ── the seam: who does the choosing ─────────────────────────────────
    # The palette inversion and the human-led / model-led split are the same
    # seam, so it gets named once, right at the divider.
    p.append(text(split_x - 18, 142, "◀ HUMAN-LED", size=10, fill=LUMEN_FAINT,
                  family=DISPLAY, weight="700", anchor="end", spacing="1.6"))
    p.append(text(split_x + 18, 142, "MODEL-LED ▶", size=10, fill=HELL_DIM,
                  family=DISPLAY, weight="700", anchor="start", spacing="1.6"))

    # ── direction tags, one per band ────────────────────────────────────
    # Each tag sits just above its own band's first rung, so the tags step up
    # with the line rather than sitting on a flat row detached from it.
    for band, tag in BAND_TAG.items():
        # Clear the *highest* rung in the band, not the first — the line rises
        # left to right, so the last rung is the one a tag would collide with.
        crest = min(tops[i] for i, (_, b) in enumerate(RUNGS) if b == band)
        if band == "heaven":
            tag, fill = "◀ converge", PRISM
        elif band == "hell":
            tag, fill = "explore ▶", HELL_INK
        else:
            fill = LUMEN_FAINT if band == "zero" else HELL_DIM
        p.append(text(mids[band], crest - 16, tag, size=12,
                      fill=fill, family=MONO, weight="600"))

    # ── rungs ───────────────────────────────────────────────────────────
    for i, (rung, band) in enumerate(RUNGS):
        bx, by = xs[i], tops[i]
        if band in ("zero", "heaven"):
            fill, stroke, label = INK, (PRISM if band == "heaven" else LINE_STRONG), LUMEN
        elif band == "hell":
            fill, stroke, label = "#ffffff", HELL_LINE, HELL_INK
        else:
            # The crown rung, inverted again against the white ground.
            fill, stroke, label = HELL_INK, HELL_INK, HELL_BG
        p.append(rect(bx, by, BOX_W, BOX_H, fill=fill, stroke=stroke, rx=7))
        p.append(text(bx + BOX_W / 2, by + 28, rung, size=17,
                      fill=label, family=MONO, weight="600"))

    # ── the axis the rungs climb ────────────────────────────────────────
    ax_l, ax_r = xs[0], xs[-1] + BOX_W
    p.append(line(ax_l, AXIS_Y, split_x, AXIS_Y, stroke=LINE_STRONG))
    p.append(line(split_x, AXIS_Y, ax_r - 8, AXIS_Y, stroke=HELL_RULE))
    p.append(
        f'<path d="M {ax_r - 9:.1f} {AXIS_Y - 4} L {ax_r:.1f} {AXIS_Y} '
        f'L {ax_r - 9:.1f} {AXIS_Y + 4} Z" fill="{HELL_RULE}"/>'
    )
    p.append(text(ax_l, AXIS_Y + 18,
                  "skill entropy — how much skill variety and volume enters a session",
                  size=11, fill=LUMEN_FAINT, anchor="start"))
    p.append(text(ax_r, AXIS_Y + 18, "a session sits at exactly one rung",
                  size=11, fill=HELL_DIM, anchor="end"))

    # ── surface cards ───────────────────────────────────────────────────
    for s in SURFACES:
        band = s["band"]
        w = s["width"]
        x = mids[band] - w / 2
        void_side = band in ("zero", "heaven")

        if band == "zero":
            fill, stroke, title_ink, body_ink, accent = INK, LINE_STRONG, LUMEN, LUMEN_DIM, LUMEN
            rule, chip_fill, chip_ink = LINE_STRONG, LUMEN, VOID
        elif band == "heaven":
            fill, stroke, title_ink, body_ink, accent = INK, PRISM, LUMEN, LUMEN_DIM, PRISM
            rule, chip_fill, chip_ink = LINE, PRISM, VOID
        elif band == "hell":
            fill, stroke, title_ink, body_ink, accent = "#ffffff", HELL_LINE, HELL_INK, HELL_DIM, HELL_INK
            rule, chip_fill, chip_ink = HELL_RULE, HELL_INK, HELL_BG
        else:
            fill, stroke, title_ink, body_ink, accent = HELL_INK, HELL_INK, HELL_BG, "#b4b4b0", HELL_BG
            rule, chip_fill, chip_ink = "#3a3a38", HELL_BG, HELL_INK

        p.append(rect(x, CARD_Y, w, CARD_H, fill=fill, stroke=stroke, rx=11))

        chip, _ = pill(x + 16, CARD_Y + 14, s["led"], fill=chip_fill, ink=chip_ink)
        p.extend(chip)

        p.append(text(x + 16, CARD_Y + 66, s["title"], size=20, fill=title_ink,
                      family=DISPLAY, weight="700", anchor="start"))
        p.append(text(x + 16, CARD_Y + 88, s["cmd"], size=13.5, fill=accent,
                      family=MONO, weight="600", anchor="start"))
        p.append(line(x + 16, CARD_Y + 102, x + w - 16, CARD_Y + 102, stroke=rule))

        for j, ln in enumerate(s["body"]):
            p.append(text(x + 16, CARD_Y + 122 + j * 16, ln, size=11,
                          fill=body_ink, anchor="start"))

        p.append(text(x + 16, CARD_Y + 178, s["who"], size=9, fill=accent,
                      family=DISPLAY, weight="700", anchor="start", spacing="1.2"))

    # ── footer (full width, void) ───────────────────────────────────────
    # Nothing on the line refuses, and no rung carries a count (N13).
    p.append(text(cx, 580,
                  "Nothing on the line refuses. No rung carries a count, and no summon is capped.",
                  size=11.5, fill=LUMEN_DIM))
    p.append(text(cx, 598,
                  "Heaven's representative rung (low) and Hell's (high) stay PROVISIONAL  ·  "
                  "docs/LADDER-FLOW.md",
                  size=10, fill=LUMEN_FAINT))

    p.append("</svg>")
    return "\n".join(p) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "entropy-ladder.svg"
    path.write_text(build(), encoding="utf-8")
    print(f"wrote {path.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()
