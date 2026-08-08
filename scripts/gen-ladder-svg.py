#!/usr/bin/env python3
"""Generate the entropy-ladder diagram as a single self-contained SVG.

Palette and type come from the site prototype's token system
(packages/site/src/styles/tokens.css) rather than anything invented here:

  Heaven  luminous white on void, prismatic accent used sparingly
  Hell    the inversion — black on white, no color, only impact

That inversion is the whole idea, so the diagram is drawn as two grounds meeting
at the divider instead of one ground with two labels. Because each half carries
its own ground, the file needs no light/dark variants and cannot drift.

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

# rung, sublabel, half
RUNGS = [
    ("off", "product-floor", "heaven"),
    ("low", "curated", "heaven"),
    ("med", "= native", "heaven"),
    ("high", "default", "hell"),
    ("xhigh", "", "hell"),
    ("max", "", "hell"),
    ("ultra", "unratified", "hell"),
]

BOX_W, BOX_H, GAP = 96, 46, 12
RISE = 9          # each rung sits a step higher: more entropy, literally
BASE_TOP = 168    # top edge of the lowest rung (off)
SPLIT_GAP = 44

WIDTH, HEIGHT = 900, 348


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, *, size, fill, family=BODY, weight="400", anchor="middle", spacing=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
    )


def build():
    p = []
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="The entropy ladder. '
        f'Heaven is subtractive and holds off, low, and med (which equals native); it is served '
        f'by slash skill-heaven and needs the launcher. Hell is additive and holds high (the '
        f'default), xhigh, max, and ultra (unratified); it is served by slash skill-hell and '
        f'needs only the plugin.">'
    )

    heaven_n = sum(1 for r in RUNGS if r[2] == "heaven")
    heaven_w = heaven_n * BOX_W + (heaven_n - 1) * GAP
    hell_n = len(RUNGS) - heaven_n
    hell_w = hell_n * BOX_W + (hell_n - 1) * GAP
    # The loop below emits a GAP after every box, including the last Heaven one,
    # so the run is heaven + GAP + SPLIT_GAP + hell. Counting it here is what
    # keeps the left and right margins equal.
    total = heaven_w + GAP + SPLIT_GAP + hell_w
    x0 = (WIDTH - total) / 2

    xs, tops = [], []
    x = x0
    for i, (_, _, half) in enumerate(RUNGS):
        if i == heaven_n:
            x += SPLIT_GAP
        xs.append(x)
        tops.append(BASE_TOP - i * RISE)
        x += BOX_W + GAP

    heaven_mid = xs[0] + heaven_w / 2
    hell_mid = xs[heaven_n] + hell_w / 2
    # Midway between the last Heaven box and the first Hell one.
    split_x = (xs[heaven_n - 1] + BOX_W + xs[heaven_n]) / 2

    # ── the two grounds ─────────────────────────────────────────────────
    p.append(f'<rect x="0" y="0" width="{split_x:.1f}" height="{HEIGHT}" fill="{VOID}"/>')
    p.append(
        f'<rect x="{split_x:.1f}" y="0" width="{WIDTH - split_x:.1f}" height="{HEIGHT}" '
        f'fill="{HELL_BG}"/>'
    )

    # ── half headings ───────────────────────────────────────────────────
    p.append(text(heaven_mid, 52, "HEAVEN", size=13, fill=LUMEN,
                  family=DISPLAY, weight="700", spacing="3.2"))
    p.append(text(heaven_mid, 74, "subtractive", size=12, fill=PRISM, family=MONO))
    p.append(text(heaven_mid, 94, "withholds what you already have", size=11.5, fill=LUMEN_FAINT))

    p.append(text(hell_mid, 52, "HELL", size=13, fill=HELL_INK,
                  family=DISPLAY, weight="700", spacing="3.2"))
    p.append(text(hell_mid, 74, "additive", size=12, fill=HELL_INK, family=MONO, weight="600"))
    p.append(text(hell_mid, 94, "summons what you do not", size=11.5, fill=HELL_DIM))

    # ── rungs ───────────────────────────────────────────────────────────
    for i, (rung, sub, half) in enumerate(RUNGS):
        bx, by = xs[i], tops[i]
        heaven = half == "heaven"
        unratified = rung == "ultra"

        if heaven:
            fill, stroke, label = INK, LINE, LUMEN
            sub_fill = PRISM if sub == "= native" else LUMEN_FAINT
        else:
            fill, stroke, label = "#ffffff", HELL_LINE, HELL_INK
            sub_fill = HELL_DIM
        if unratified:
            fill, stroke, label, sub_fill = HELL_BG, HELL_FAINT, HELL_FAINT, HELL_FAINT

        dash = ' stroke-dasharray="4 4"' if unratified else ""
        width = "2" if sub == "default" else "1.5"
        p.append(
            f'<rect x="{bx:.1f}" y="{by}" width="{BOX_W}" height="{BOX_H}" rx="7" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{width}"{dash}/>'
        )
        p.append(text(bx + BOX_W / 2, by + 29, rung, size=17,
                      fill=label, family=MONO, weight="600"))
        if sub:
            p.append(text(bx + BOX_W / 2, by + BOX_H + 18, sub, size=11,
                          fill=sub_fill, family=MONO,
                          weight="600" if sub == "default" else "400"))

    # ── command bands ───────────────────────────────────────────────────
    band_y, band_h = 250, 56
    p.append(
        f'<rect x="{xs[0]:.1f}" y="{band_y}" width="{heaven_w}" height="{band_h}" rx="9" '
        f'fill="none" stroke="{PRISM}" stroke-width="1.5"/>'
    )
    p.append(text(heaven_mid, band_y + 25, "/skill-heaven", size=15,
                  fill=LUMEN, family=MONO, weight="600"))
    p.append(text(heaven_mid, band_y + 43, "needs the LAUNCHER", size=10.5,
                  fill=LUMEN_DIM, spacing="0.8"))

    p.append(
        f'<rect x="{xs[heaven_n]:.1f}" y="{band_y}" width="{hell_w}" height="{band_h}" rx="9" '
        f'fill="none" stroke="{HELL_LINE}" stroke-width="1.5"/>'
    )
    p.append(text(hell_mid, band_y + 25, "/skill-hell", size=15,
                  fill=HELL_INK, family=MONO, weight="600"))
    p.append(text(hell_mid, band_y + 43, "needs only the PLUGIN", size=10.5,
                  fill=HELL_DIM, spacing="0.8"))

    # ── why the line falls where it does ────────────────────────────────
    p.append(text(heaven_mid, 330, "a boot-time decision — a session cannot evict",
                  size=11, fill=LUMEN_FAINT))
    p.append(text(hell_mid, 330, "any live session — adding context always works",
                  size=11, fill=HELL_DIM))

    p.append("</svg>")
    return "\n".join(p) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "entropy-ladder.svg"
    path.write_text(build(), encoding="utf-8")
    print(f"wrote {path.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()
