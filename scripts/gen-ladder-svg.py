#!/usr/bin/env python3
"""Generate the entropy-ladder diagram as a single self-contained SVG.

What the ladder measures — skill entropy, i.e. how much skill variety and
volume enters a session — is the canonical statement in docs/LADDER-FLOW.md
("What the ladder measures — skill entropy"). This file draws the shape that
section explains; it does not restate the argument, only the four bands and
seven rungs (N13): `zero` (floor) · `low · med` (Heaven, converge) ·
`high · xhigh · max` (Hell, explore) · `ultra` (the top of the line, picks
the entropy for you, gap by gap).

Palette and type come from the site prototype's token system
(packages/site/src/styles/tokens.css) rather than anything invented here:

  Heaven side  luminous white on void, prismatic accent used sparingly
  Hell side    the inversion — black on white, no color, only impact

That inversion is the whole idea, so the diagram is drawn as two grounds meeting
at the divider instead of one ground with two labels. `zero` shares Heaven's
void ground (it is the floor the converge band sits above) and `ultra` shares
Hell's white ground (it sits at the high end of the line) — but each still gets
its own heading, because neither is actually part of Heaven or Hell: `zero` is
its own band (Skill Zero) and so is `ultra` (Skill Ultra). Sharing a ground is
a layout convenience, not a claim about which band something belongs to.

Because each half carries its own ground, the file needs no light/dark variants
and cannot drift.

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
LUMEN = "#f7f8ff"
LUMEN_DIM = "#a9adc4"
LUMEN_FAINT = "#6b6f88"
PRISM = "#37d6e0"  # --sh-prism-3, aqua

# Hell — the inversion. No color by design.
HELL_BG = "#f4f4f2"
HELL_INK = "#050505"
HELL_DIM = "#6a6a68"
HELL_FAINT = "#9a9a97"
HELL_LINE = "#050505"

# rung, sublabel, band — the four bands are N13's surfaces
# (docs/LADDER-FLOW.md): zero and ultra are single-rung bands, heaven and
# hell are two/three-rung bands. No rung carries a count (N13) — the
# sublabel is a one-word tag, never a number.
RUNGS = [
    ("zero", "floor", "zero"),
    ("low", "", "heaven"),
    ("med", "", "heaven"),
    ("high", "", "hell"),
    ("xhigh", "", "hell"),
    ("max", "", "hell"),
    ("ultra", "", "ultra"),
]

BOX_W, BOX_H, GAP = 96, 46, 12
RISE = 9          # each rung sits a step higher: more skill entropy, literally
BASE_TOP = 168    # top edge of the lowest rung (zero)
SPLIT_GAP = 44

WIDTH, HEIGHT = 900, 348

ARIA_LABEL = (
    "The skill-entropy ladder is one line of seven rungs measuring how much "
    "skill variety and volume enters a session: zero is the floor with no "
    "automatic summoning, Heaven (low, med) converges narrowly on the gap, "
    "Hell (high, xhigh, max) explores widely around it, and Ultra sits at "
    "the top of the line, picking the entropy for you, gap by gap. Every "
    "rung is reachable; nothing on the line refuses."
)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, *, size, fill, family=BODY, weight="400", anchor="middle", spacing=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
    )


def span(rungs, xs, band):
    """Left edge, right edge, and midpoint of the boxes belonging to one band."""
    idxs = [i for i, r in enumerate(rungs) if r[2] == band]
    left = xs[idxs[0]]
    right = xs[idxs[-1]] + BOX_W
    return left, right, (left + right) / 2


def build():
    p = []
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{esc(ARIA_LABEL)}">'
    )

    # void_n counts the boxes sharing the void ground (zero + heaven); the
    # remainder (hell + ultra) share the white ground. This is a LAYOUT split,
    # not a band assignment — see the module docstring.
    void_n = sum(1 for r in RUNGS if r[2] in ("zero", "heaven"))
    void_w = void_n * BOX_W + (void_n - 1) * GAP
    white_n = len(RUNGS) - void_n
    white_w = white_n * BOX_W + (white_n - 1) * GAP
    # The loop below emits a GAP after every box, including the last void one,
    # so the run is void + GAP + SPLIT_GAP + white. Counting it here is what
    # keeps the left and right margins equal.
    total = void_w + GAP + SPLIT_GAP + white_w
    x0 = (WIDTH - total) / 2

    xs, tops = [], []
    x = x0
    for i, (_, _, band) in enumerate(RUNGS):
        if i == void_n:
            x += SPLIT_GAP
        xs.append(x)
        tops.append(BASE_TOP - i * RISE)
        x += BOX_W + GAP

    # ── band spans, from the box positions just laid out ──────────────────
    _, _, zero_mid = span(RUNGS, xs, "zero")
    heaven_l, heaven_r, heaven_mid = span(RUNGS, xs, "heaven")
    hell_l, hell_r, hell_mid = span(RUNGS, xs, "hell")
    _, _, ultra_mid = span(RUNGS, xs, "ultra")
    heaven_w2 = heaven_r - heaven_l
    hell_w2 = hell_r - hell_l

    # Midway between the last void box and the first white one.
    split_x = (xs[void_n - 1] + BOX_W + xs[void_n]) / 2

    # ── the two grounds ─────────────────────────────────────────────────
    p.append(f'<rect x="0" y="0" width="{split_x:.1f}" height="{HEIGHT}" fill="{VOID}"/>')
    p.append(
        f'<rect x="{split_x:.1f}" y="0" width="{WIDTH - split_x:.1f}" height="{HEIGHT}" '
        f'fill="{HELL_BG}"/>'
    )

    # ── band headings ───────────────────────────────────────────────────
    # zero and ultra are single-rung bands: a short title, no subtitle lines
    # (their box already carries a one-word tag below it).
    p.append(text(zero_mid, 52, "ZERO", size=12, fill=LUMEN,
                  family=DISPLAY, weight="700", spacing="2.4"))

    p.append(text(heaven_mid, 52, "HEAVEN", size=13, fill=LUMEN,
                  family=DISPLAY, weight="700", spacing="3.2"))
    p.append(text(heaven_mid, 74, "converge", size=12, fill=PRISM, family=MONO, weight="600"))
    p.append(text(heaven_mid, 94, "narrows onto the gap", size=11.5, fill=LUMEN_FAINT))

    p.append(text(hell_mid, 52, "HELL", size=13, fill=HELL_INK,
                  family=DISPLAY, weight="700", spacing="3.2"))
    p.append(text(hell_mid, 74, "explore", size=12, fill=HELL_INK, family=MONO, weight="600"))
    p.append(text(hell_mid, 94, "widens around the gap", size=11.5, fill=HELL_DIM))

    p.append(text(ultra_mid, 52, "ULTRA", size=12, fill=HELL_INK,
                  family=DISPLAY, weight="700", spacing="2.4"))

    # ── rungs ───────────────────────────────────────────────────────────
    for i, (rung, sub, band) in enumerate(RUNGS):
        bx, by = xs[i], tops[i]
        void_side = band in ("zero", "heaven")
        # The crown rung is drawn distinctly because it sits at the top of the
        # line, NOT because it is withheld — nothing on the line refuses (N13).
        crown = rung == "ultra"

        if void_side:
            fill, stroke, label, sub_fill = INK, LINE, LUMEN, LUMEN_FAINT
        else:
            fill, stroke, label, sub_fill = "#ffffff", HELL_LINE, HELL_INK, HELL_DIM
        if crown:
            fill, stroke, label, sub_fill = HELL_BG, HELL_LINE, HELL_INK, HELL_DIM

        p.append(
            f'<rect x="{bx:.1f}" y="{by}" width="{BOX_W}" height="{BOX_H}" rx="7" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
        )
        p.append(text(bx + BOX_W / 2, by + 29, rung, size=17,
                      fill=label, family=MONO, weight="600"))
        if sub:
            p.append(text(bx + BOX_W / 2, by + BOX_H + 18, sub, size=11,
                          fill=sub_fill, family=MONO))

    # ── command bands ───────────────────────────────────────────────────
    # Spans exactly the Heaven / Hell boxes — not zero, not ultra, which are
    # their own bands with their own commands (/skill-zero, /skill-ultra).
    band_y, band_h = 250, 56
    p.append(
        f'<rect x="{heaven_l:.1f}" y="{band_y}" width="{heaven_w2}" height="{band_h}" rx="9" '
        f'fill="none" stroke="{PRISM}" stroke-width="1.5"/>'
    )
    p.append(text(heaven_mid, band_y + 25, "/skill-heaven", size=15,
                  fill=LUMEN, family=MONO, weight="600"))
    p.append(text(heaven_mid, band_y + 43, "lower-entropy direction", size=10.5,
                  fill=LUMEN_DIM, spacing="0.4"))

    p.append(
        f'<rect x="{hell_l:.1f}" y="{band_y}" width="{hell_w2}" height="{band_h}" rx="9" '
        f'fill="none" stroke="{HELL_LINE}" stroke-width="1.5"/>'
    )
    p.append(text(hell_mid, band_y + 25, "/skill-hell", size=15,
                  fill=HELL_INK, family=MONO, weight="600"))
    p.append(text(hell_mid, band_y + 43, "higher-entropy direction", size=10.5,
                  fill=HELL_DIM, spacing="0.4"))

    # ── nothing on the line refuses (N13) ───────────────────────────────
    p.append(text(heaven_mid, 330, "every rung is reachable", size=11, fill=LUMEN_FAINT))
    p.append(text(hell_mid, 330, "nothing on the line refuses", size=11, fill=HELL_DIM))

    p.append("</svg>")
    return "\n".join(p) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "entropy-ladder.svg"
    path.write_text(build(), encoding="utf-8")
    print(f"wrote {path.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()
