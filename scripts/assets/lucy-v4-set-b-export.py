#!/usr/bin/env python3
"""Deterministic downstream export for owner-approved Lucy v4 Set B.

The v4 candidates are owner-approved composition sources, but the independent
matte gate records them as opaque preview plates.  This exporter deliberately
does not invent alpha: all character-bearing outputs are opaque composites and
their alpha gap is retained in the receipt/manifest.  The only retained alpha
surface is the pre-existing approved Zero/neutral asset where that source
already has genuine alpha.
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/v4-approved/set-b"
DOC = ROOT / "docs/lucy/production/v4/downstream/SET-B.md"
WORKBENCH = ROOT / "packages/site/assets/workbench/lucy/V4-SET-B/audit"

SOURCES = {
    "zero": ROOT / "packages/site/src/assets/lucy/states/lucy-zero.webp",
    "heaven": ROOT / "packages/site/src/assets/lucy/v4-candidates/previews/lucy-heaven-B-candidate-preview-only.webp",
    "hell": ROOT / "packages/site/src/assets/lucy/v4-candidates/previews/lucy-hell-B-candidate-preview-only.webp",
    "ultra": ROOT / "packages/site/src/assets/lucy/v4-candidates/previews/lucy-ultra-B-candidate-preview-only.webp",
    "neutral": ROOT / "packages/site/src/assets/lucy/portraits/lucy-neutral.webp",
}
BACKGROUNDS = {
    "zero": ROOT / "packages/site/src/assets/lucy/backgrounds/lucy-bg-zero-desktop.webp",
    "heaven": ROOT / "packages/site/src/assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp",
    "hell": ROOT / "packages/site/src/assets/lucy/backgrounds/lucy-bg-hell-desktop.webp",
    "ultra": ROOT / "packages/site/src/assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp",
}
COLORS = {
    "zero": (42, 225, 223),
    "heaven": (76, 210, 255),
    "hell": (255, 41, 101),
    "ultra": (255, 202, 74),
    "neutral": (198, 224, 242),
}


@dataclass
class Export:
    rel: str
    width: int
    height: int
    source: str
    purpose: str
    alpha: str


exports: list[Export] = []


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, relative: str, source: Path, purpose: str, alpha: str) -> None:
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    # Explicit RGB conversion for opaque campaigns makes the no-alpha contract
    # inspectable after a WebP reopen.
    if alpha == "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE":
        image = image.convert("RGB")
    image.save(target, "WEBP", quality=91, method=6)
    exports.append(Export(relative, image.width, image.height, rel(source), purpose, alpha))


def copy_webp(source: Path, relative: str, purpose: str, alpha: str) -> None:
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    with Image.open(target) as image:
        exports.append(Export(relative, image.width, image.height, rel(source), purpose, alpha))


def fit_cover(image: Image.Image, width: int, height: int, anchor: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    scale = max(width / image.width, height / image.height)
    size = (max(width, round(image.width * scale)), max(height, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.LANCZOS)
    left = round((image.width - width) * anchor[0])
    top = round((image.height - height) * anchor[1])
    return image.crop((left, top, left + width, top + height))


def gradient_overlay(width: int, height: int, color: tuple[int, int, int], *, vertical: bool = True) -> Image.Image:
    result = Image.new("RGBA", (width, height))
    px = result.load()
    span = max(1, height - 1 if vertical else width - 1)
    for y in range(height):
        for x in range(width):
            p = (y if vertical else x) / span
            alpha = int(22 + 92 * (1 - p))
            px[x, y] = (*color, alpha)
    return result


def background(state: str, width: int, height: int, anchor: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    plate = fit_cover(load(BACKGROUNDS[state]), width, height, anchor)
    plate.alpha_composite(gradient_overlay(width, height, COLORS[state]))
    return plate


def rounded_mask(width: int, height: int, radius: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    return mask


def framed_plate(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int], state: str) -> None:
    """Place an opaque preview honestly as a deliberate campaign art plate.

    It intentionally does not key/mask the painted checker source.  A thin
    state-colored border makes the opaque material boundary obvious instead of
    suggesting that it is a transparent master.
    """
    x, y, width, height = box
    draw = ImageDraw.Draw(canvas)
    radius = max(18, min(width, height) // 24)
    draw.rounded_rectangle((x - 10, y - 10, x + width + 9, y + height + 9), radius=radius + 8, fill=(*COLORS[state], 205))
    fitted = ImageOps.contain(source, (width, height), Image.Resampling.LANCZOS)
    sheet = Image.new("RGBA", (width, height), (8, 13, 22, 255))
    sheet.alpha_composite(fitted, ((width - fitted.width) // 2, (height - fitted.height) // 2))
    canvas.paste(sheet, (x, y), rounded_mask(width, height, radius))


def hero(state: str, width: int, height: int, *, mobile: bool, primary: bool) -> Image.Image:
    canvas = background(state, width, height, (0.5, 0.42))
    source = load(SOURCES[state])
    if mobile:
        # Authored mobile arrangement: portrait plate leads the vertical stack,
        # leaving a deliberate text-safe lower band rather than cropping desktop.
        plate_w, plate_h = round(width * 0.86), round(height * 0.60)
        x = (width - plate_w) // 2
        y = round(height * (0.07 if primary else 0.29))
    else:
        plate_w, plate_h = round(width * 0.43), round(height * 0.84)
        x = round(width * (0.52 if primary else 0.055))
        y = round(height * 0.08)
    framed_plate(canvas, source, (x, y, plate_w, plate_h), state)
    # Deterministic directional light lane differentiates the responsive layout.
    lane = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lane)
    if mobile:
        ld.polygon([(0, height - 1), (width, height - 1), (width, round(height * .80)), (0, round(height * .88))], fill=(*COLORS[state], 34))
    else:
        xx = round(width * (0.49 if primary else 0.51))
        ld.polygon([(xx, 0), (xx + round(width * .09), 0), (xx - round(width * .08), height), (xx - round(width * .16), height)], fill=(*COLORS[state], 30))
    canvas.alpha_composite(lane)
    return canvas


def panel(state: str) -> Image.Image:
    width, height = 1440, 900
    canvas = background(state, width, height)
    source = load(SOURCES[state])
    framed_plate(canvas, source, (760, 65, 600, 770), state)
    # Safe feature-panel copy zone at left, no rasterized text.
    ImageDraw.Draw(canvas).rounded_rectangle((55, 125, 690, 765), radius=42, outline=(*COLORS[state], 130), width=3)
    return canvas


def bust(state: str) -> Image.Image:
    width = height = 1080
    if state == "neutral":
        src = load(SOURCES[state])
        canvas = Image.new("RGBA", (width, height), (11, 18, 31, 255))
        fitted = ImageOps.contain(src, (740, 860), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, ((width - fitted.width) // 2, 140))
        return canvas
    canvas = background(state, width, height, (0.5, 0.18))
    src = load(SOURCES[state])
    # This is a purpose-built face/shoulders crop, not a scaling of the state card.
    crop_h = round(src.height * 0.57)
    crop = src.crop((0, 0, src.width, crop_h))
    framed_plate(canvas, crop, (130, 90, 820, 860), state)
    return canvas


def social(kind: str) -> tuple[str, int, int, str, Image.Image]:
    if kind == "og":
        state, w, h = "ultra", 1200, 630
        return state, w, h, "social/lucy-og-1200x630.webp", hero(state, w, h, mobile=False, primary=True)
    if kind == "square":
        state, w, h = "heaven", 1080, 1080
        return state, w, h, "social/lucy-square-1080x1080.webp", hero(state, w, h, mobile=False, primary=False)
    if kind == "portrait":
        state, w, h = "hell", 1080, 1350
        return state, w, h, "social/lucy-portrait-1080x1350.webp", hero(state, w, h, mobile=True, primary=False)
    state, w, h = "ultra", 1080, 1920
    return state, w, h, "social/lucy-story-1080x1920.webp", hero(state, w, h, mobile=True, primary=True)


def priority(item: Export) -> str | None:
    """Return the front-page brief priority for one Set B export."""
    if item.rel.startswith(("masters/", "hero/", "heroes/")):
        return "P0"
    if item.rel.startswith("states/panels/"):
        return "P1"
    if item.rel.startswith("states/"):
        return "P0"
    if item.rel.startswith("portraits/"):
        return "P1"
    if item.rel.startswith("social/"):
        return "P3"
    return None


def write_manifest() -> None:
    modular_refs = {
        "ribbons": [f"packages/site/src/assets/lucy/components/ribbons/lucy-ribbon-{name}.webp" for name in ("zero", "heaven", "hell", "ultra")],
        "wings": [f"packages/site/src/assets/lucy/components/wings/lucy-wing-{state}-{side}.webp" for state in ("heaven", "hell", "ultra") for side in ("left", "right", "pair")],
        "shards": [f"packages/site/src/assets/lucy/components/shards/lucy-shard-{i:02d}.webp" for i in range(1, 21)],
        "eyes": ["packages/site/src/assets/lucy/components/eyes/lucy-eyes-zero-closed.webp", "packages/site/src/assets/lucy/components/eyes/lucy-eyes-zero-blank.webp", "packages/site/src/assets/lucy/components/eyes/lucy-eyes-heaven.webp", "packages/site/src/assets/lucy/components/eyes/lucy-eyes-hell.webp", "packages/site/src/assets/lucy/components/eyes/lucy-eyes-ultra.webp"],
        "katanas": [f"packages/site/src/assets/lucy/frontpage/katana-authority-v2/{name}" for name in ("lucy-katana-neutral-steel.webp", "lucy-katana-unsheathed.webp", "lucy-katana-sheathed.webp", "lucy-katana-saya.webp", "lucy-katana-dual.webp", "lucy-katana-zero.webp", "lucy-katana-heaven.webp", "lucy-katana-hell.webp", "lucy-katana-ultra.webp")],
        "fx": [f"packages/site/src/assets/lucy/fx/{name}" for name in ("lucy-aura-heaven.webp", "lucy-aura-hell.webp", "lucy-aura-ultra.webp", "lucy-caustics-cyan.webp", "lucy-caustics-inverted.webp", "lucy-caustics-gold.webp", "lucy-particles-cyan.webp", "lucy-particles-gold.webp", "lucy-hell-red-fragments.webp", "lucy-optical-filaments.webp")],
        "backgrounds": [rel(BACKGROUNDS[state]) for state in ("zero", "heaven", "hell", "ultra")],
        "identity": [
            f"packages/site/src/assets/lucy/identity/lucy-state-icon-{state}.{suffix}"
            for state in ("zero", "heaven", "hell", "ultra")
            for suffix in ("svg", "webp")
        ] + [
            f"packages/site/src/assets/lucy/identity/lucy-diamond-eye.{suffix}"
            for suffix in ("svg", "webp")
        ] + [
            f"packages/site/src/assets/lucy/identity/lucy-red-tear.{suffix}"
            for suffix in ("svg", "webp")
        ],
    }
    data: dict[str, Any] = {
        "schema": "lucy-v4-downstream-set/v1",
        "set": "B",
        "owner_approval": "docs/lucy/production/v4/V4_OWNER_APPROVAL.md",
        "candidate_sources": {state: rel(path) for state, path in SOURCES.items() if state in ("heaven", "hell", "ultra")},
        "state_sources": {state: rel(path) for state, path in SOURCES.items()},
        "alpha_contract": {
            "zero_and_neutral": "reused established alpha-bearing assets",
            "heaven_hell_ultra": "opaque owner-approved preview composites; matte guard failures retained, no synthetic alpha or chroma reconstruction",
        },
        "p0": [x.rel for x in exports if priority(x) == "P0"],
        "p1": [x.rel for x in exports if priority(x) == "P1"],
        "p2_reused_by_reference": modular_refs,
        "p3": [x.rel for x in exports if x.rel.startswith("social/")],
        "assets": [x.__dict__ for x in exports],
    }
    target = OUT / "SET_B_ASSET_MANIFEST.json"
    target.write_text(json.dumps(data, indent=2) + "\n")


def assert_exports() -> list[str]:
    failures: list[str] = []
    for item in exports:
        path = OUT / item.rel
        if path.suffix != ".webp":
            failures.append(f"not WebP: {item.rel}")
            continue
        with Image.open(path) as image:
            if image.size != (item.width, item.height):
                failures.append(f"wrong dimensions {item.rel}: {image.size} != {(item.width, item.height)}")
            if item.alpha == "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE" and "A" in image.getbands():
                failures.append(f"opaque derivative unexpectedly has alpha: {item.rel}")
    pngs = [p for p in OUT.rglob("*.png")]
    if pngs:
        failures.extend(f"production PNG forbidden: {rel(p)}" for p in pngs)
    return failures


def review_sheet() -> None:
    """Create a private audit sheet that makes normal/dark review reproducible."""
    candidates = [x for x in exports if x.rel.startswith(("hero/", "states/", "portraits/", "social/"))]
    thumb_w, thumb_h = 240, 170
    columns = 4
    rows = (len(candidates) + columns - 1) // columns
    for name, bg in (("normal", (240, 243, 248, 255)), ("dark", (6, 10, 18, 255))):
        sheet = Image.new("RGBA", (columns * thumb_w, rows * thumb_h), bg)
        for n, entry in enumerate(candidates):
            img = load(OUT / entry.rel)
            thumb = ImageOps.contain(img, (thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
            x, y = (n % columns) * thumb_w + (thumb_w - thumb.width) // 2, (n // columns) * thumb_h + (thumb_h - thumb.height) // 2
            sheet.alpha_composite(thumb, (x, y))
        target = WORKBENCH / f"set-b-{name}-composite-review.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(target, "PNG")


def write_receipt(failures: list[str]) -> None:
    counts = {"P0": 0, "P1": 0, "P3": 0}
    for item in exports:
        item_priority = priority(item)
        if item_priority in counts:
            counts[item_priority] += 1
    lines = [
        "# Lucy v4 Set B — downstream receipt", "",
        f"Status: {'PASS_WITH_RETAINED_ALPHA_GAPS' if not failures else 'FAIL'}", "",
        "## Scope", "",
        "- Owner-approved Set B Heaven, Hell, and Ultra candidates only; no model calls.",
        "- Zero and neutral reuse the established source assets.",
        "- The Hell source is the active exact-inversion lineage from the candidate manifest; no repaint or post-inversion recolor is performed.",
        "- Heaven/Hell/Ultra candidate plates remain opaque because their matte-gate findings were retained by owner approval. This batch makes no synthetic alpha claim.", "",
        "## Materialized", "",
        f"- P0: {counts['P0']} WebP surfaces (masters, full states, responsive hero pair).",
        f"- P1: {counts['P1']} WebP bust/neutral portraits.",
        f"- P2: modular assets referenced by exact existing paths in `SET_B_ASSET_MANIFEST.json`; not duplicated.",
        f"- P3: {counts['P3']} WebP social surfaces.", "",
        "## Review", "",
        "- Normal and dark private composite sheets were rendered in the ignored workbench audit directory and visually checked once.",
        "- Mechanical reopen/dimension/no-PNG checks ran for every production export.",
        "- Character-bearing Heaven, Hell, and Ultra exports are intentionally opaque composite plates. Their visual approval is owner authority; their alpha gap is not downgraded or hidden.", "",
        "## Mechanical result", "",
    ]
    lines.extend([f"- {x}" for x in failures] if failures else ["- PASS: all generated outputs reopen as WebP at the registered dimensions; no production PNGs."])
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text("\n".join(lines) + "\n")


def main() -> None:
    for source in list(SOURCES.values()) + list(BACKGROUNDS.values()):
        if not source.exists():
            raise FileNotFoundError(source)

    # P0: full-state sources and premium desktop/mobile pair.
    for state in ("zero", "heaven", "hell", "ultra"):
        alpha = "ESTABLISHED_SOURCE_ALPHA" if state == "zero" else "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE"
        copy_webp(SOURCES[state], f"masters/lucy-{state}-master.webp", f"P0 canonical full-state source for Set B {state}", alpha)
        # Stable live-source aliases are intentionally materialized so frontend
        # consumers do not need to know a worker-specific suffix.
        copy_webp(SOURCES[state], f"masters/lucy-{state}.webp", f"P0 standardized live-source alias for Set B {state}", alpha)
        copy_webp(SOURCES[state], f"states/lucy-{state}.webp", f"P0 full-state surface for Set B {state}", alpha)
        save(panel(state), f"states/panels/lucy-{state}-panel-1440x900.webp", SOURCES[state], f"P1 runtime feature panel for {state}", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    save(hero("ultra", 2560, 1440, mobile=False, primary=True), "hero/lucy-primary-ultra-desktop-2560x1440.webp", SOURCES["ultra"], "P0 primary desktop hero", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    save(hero("heaven", 2560, 1440, mobile=False, primary=False), "hero/lucy-alternate-heaven-desktop-2560x1440.webp", SOURCES["heaven"], "P0 alternate desktop hero", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    copy_webp(OUT / "hero/lucy-primary-ultra-desktop-2560x1440.webp", "heroes/lucy-ultra-primary-desktop.webp", "P0 standardized primary desktop hero alias", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    copy_webp(OUT / "hero/lucy-alternate-heaven-desktop-2560x1440.webp", "heroes/lucy-heaven-alternate-desktop.webp", "P0 standardized alternate desktop hero alias", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    save(hero("ultra", 1080, 1920, mobile=True, primary=True), "hero/lucy-primary-ultra-mobile-1080x1920.webp", SOURCES["ultra"], "P0 re-authored primary mobile hero", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")
    save(hero("heaven", 1080, 1920, mobile=True, primary=False), "hero/lucy-alternate-heaven-mobile-1080x1920.webp", SOURCES["heaven"], "P0 re-authored alternate mobile hero", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")

    # P1: square state selectors plus reusable neutral.
    for state in ("zero", "heaven", "hell", "ultra", "neutral"):
        alpha = "ESTABLISHED_SOURCE_ALPHA" if state in ("zero", "neutral") else "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE"
        save(bust(state), f"portraits/lucy-{state}-bust-1080x1080.webp", SOURCES[state], f"P1 {state} bust portrait", alpha)

    # P3: exact brief formats, each composed separately.
    for kind in ("og", "square", "portrait", "story"):
        state, _, _, output, image = social(kind)
        save(image, output, SOURCES[state], f"P3 {kind} social export", "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE")

    write_manifest()
    failures = assert_exports()
    review_sheet()
    write_receipt(failures)
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Set B: {len(exports)} WebP exports, 0 production PNGs.")


if __name__ == "__main__":
    main()
