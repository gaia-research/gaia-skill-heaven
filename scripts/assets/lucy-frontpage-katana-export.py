#!/usr/bin/env python3
"""FP-KATANA-01 deterministic export from the single authority atlas.

No model call lives here.  Every production component is a crop or assembly of
the one gpt-image-2 atlas; colour variants keep their geometry and alpha.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "packages/site/assets/workbench/lucy/FP-KATANA-01/raw-gpt-image-2.png"
WORK = ROOT / "packages/site/assets/workbench/lucy/FP-KATANA-01/intermediate"
OUT = ROOT / "packages/site/src/assets/lucy/frontpage/katana-authority-v2"


def write_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")


def write_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", lossless=True, method=6, exact=True)


def chroma_alpha(image: Image.Image) -> Image.Image:
    """Remove the known flat #00ff00 field with straight-RGB recovery/despill."""
    data = np.asarray(image.convert("RGBA"), dtype=np.float32)
    rgb = data[:, :, :3]
    # Distance from the only permitted background colour.  A narrow soft band
    # retains anti-aliased steel/ornament contours as fractional alpha.
    distance = np.sqrt(rgb[:, :, 0] ** 2 + (rgb[:, :, 1] - 255) ** 2 + rgb[:, :, 2] ** 2)
    alpha = np.clip((distance - 20.0) / 126.0, 0.0, 1.0)
    green = (rgb[:, :, 1] > 175) & (rgb[:, :, 1] > rgb[:, :, 0] * 1.6 + 48) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.6 + 48)
    alpha[green] = 0.0
    partial = (alpha > 0.0) & (alpha < 1.0)
    # Solve C = alpha * foreground + (1-alpha) * chroma, so key-colour
    # contamination cannot survive as a green edge.
    for channel, key in enumerate((0.0, 255.0, 0.0)):
        values = rgb[:, :, channel]
        values[partial] = np.clip((values[partial] - (1.0 - alpha[partial]) * key) / alpha[partial], 0, 255)
    # The generator's flat field can leave one green-dominant antialias pixel
    # beside a high-contrast steel edge.  Constrain only the thin
    # exterior-connected alpha boundary; interior navy, pale diamonds, gold,
    # and steel highlights are untouched.
    exterior = alpha == 0.0
    for _ in range(5):
        grown = exterior.copy()
        grown[1:, :] |= exterior[:-1, :]
        grown[:-1, :] |= exterior[1:, :]
        grown[:, 1:] |= exterior[:, :-1]
        grown[:, :-1] |= exterior[:, 1:]
        exterior = grown
    edge = exterior & (alpha > 0.0)
    red_blue = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = edge & (rgb[:, :, 1] > red_blue + 4.0)
    rgb[:, :, 1][spill] = red_blue[spill]
    out = np.dstack((rgb, np.round(alpha * 255.0))).astype(np.uint8)
    out[out[:, :, 3] == 0, :3] = 0
    return Image.fromarray(out, "RGBA")


def crop(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return source.crop(box)


def fit(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    subject = source.copy()
    subject.thumbnail(size, Image.Resampling.LANCZOS)
    canvas.alpha_composite(subject, ((size[0] - subject.width) // 2, (size[1] - subject.height) // 2))
    return canvas


def keep_largest_components(source: Image.Image, count: int = 1, threshold: int = 10) -> Image.Image:
    """Remove detached atlas debris without touching connected weapon pixels.

    The source atlas contains a few tiny, wholly disconnected chroma-edge
    fragments between components.  Katana assets must not ship those fragments.
    This keeps the intended one (or dual) connected silhouettes only.
    """
    data = np.asarray(source.convert("RGBA"), dtype=np.uint8).copy()
    mask = data[:, :, 3] > threshold
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        stack = [(int(y), int(x))]
        seen[y, x] = True
        component: list[tuple[int, int]] = []
        while stack:
            yy, xx = stack.pop()
            component.append((yy, xx))
            for dy, dx in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
                ny, nx = yy + dy, xx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        components.append(component)
    keep = np.zeros_like(mask, dtype=bool)
    for component in sorted(components, key=len, reverse=True)[:count]:
        ys, xs = zip(*component)
        keep[np.asarray(ys), np.asarray(xs)] = True
    # Preserve fractional contour pixels that touch an intended opaque body.
    grown = keep.copy()
    for _ in range(2):
        expanded = grown.copy()
        expanded[1:, :] |= grown[:-1, :]
        expanded[:-1, :] |= grown[1:, :]
        expanded[:, 1:] |= grown[:, :-1]
        expanded[:, :-1] |= grown[:, 1:]
        grown = expanded
    data[~grown, :] = 0
    return Image.fromarray(data, "RGBA")


def tint(source: Image.Image, colour: tuple[int, int, int], strength: float) -> Image.Image:
    """Restrained reflected-light grade; geometry/alpha are unchanged."""
    data = np.asarray(source, dtype=np.float32).copy()
    rgb, alpha = data[:, :, :3], data[:, :, 3]
    # Apply most strongly to already bright steel/highlight pixels.
    highlight = np.clip((rgb.max(axis=2) - 75.0) / 180.0, 0.0, 1.0) * strength
    for channel, value in enumerate(colour):
        rgb[:, :, channel] = rgb[:, :, channel] * (1.0 - highlight) + value * highlight
    data[:, :, 3] = alpha
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), "RGBA")


def inverse(source: Image.Image) -> Image.Image:
    data = np.asarray(source, dtype=np.uint8).copy()
    foreground = data[:, :, 3] > 0
    data[foreground, :3] = 255 - data[foreground, :3]
    data[~foreground, :3] = 0
    return Image.fromarray(data, "RGBA")


def checker(source: Image.Image, inverted: bool = False) -> Image.Image:
    size = 24
    w, h = source.size
    grid = np.indices((h, w)).sum(axis=0) // size
    a, b = ((242, 242, 242, 255), (177, 177, 177, 255)) if not inverted else ((21, 21, 21, 255), (70, 70, 70, 255))
    background = np.zeros((h, w, 4), dtype=np.uint8)
    background[grid % 2 == 0] = a
    background[grid % 2 == 1] = b
    composite = Image.fromarray(background, "RGBA")
    composite.alpha_composite(source)
    return composite


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = Image.open(RAW).convert("RGBA")
    alpha = chroma_alpha(raw)
    write_png(alpha, WORK / "atlas-alpha.png")
    write_png(checker(alpha), WORK / "atlas-alpha-normal-checker.png")
    write_png(checker(alpha, inverted=True), WORK / "atlas-alpha-inverted-checker.png")

    # Crops are intentionally generous: every authority component is fully
    # visible and only transparent margin is sacrificed.
    left = fit(keep_largest_components(crop(alpha, (150, 25, 1325, 175))), (1800, 480))
    right = fit(keep_largest_components(crop(alpha, (145, 155, 1410, 325))), (1800, 480))
    sheathed = fit(keep_largest_components(crop(alpha, (170, 300, 1340, 460))), (1800, 480))
    saya = fit(keep_largest_components(crop(alpha, (245, 450, 1310, 560))), (1800, 480))
    handle = fit(keep_largest_components(crop(alpha, (850, 18, 1325, 190))), (760, 440))
    compact = fit(keep_largest_components(crop(alpha, (135, 852, 855, 1005))), (1200, 320))
    slashes = [
        fit(keep_largest_components(crop(alpha, (860, 790, 1435, 865))), (720, 120)),
        fit(keep_largest_components(crop(alpha, (860, 855, 1435, 935))), (720, 120)),
        fit(keep_largest_components(crop(alpha, (860, 920, 1435, 1018))), (720, 120)),
    ]
    dual = Image.new("RGBA", (1800, 720), (0, 0, 0, 0))
    dual.alpha_composite(fit(left, (1560, 350)), (120, 10))
    dual.alpha_composite(fit(right, (1560, 350)), (120, 360))

    neutral = compact
    heaven = tint(neutral, (100, 207, 255), 0.26)
    zero = tint(neutral, (55, 214, 224), 0.13)
    ultra = tint(dual, (255, 210, 74), 0.24)
    hell = inverse(heaven)

    exports = {
        "lucy-katana-neutral-steel.webp": neutral,
        "lucy-katana-unsheathed.webp": left,
        "lucy-katana-left.webp": left,
        "lucy-katana-right.webp": right,
        "lucy-katana-sheathed.webp": sheathed,
        "lucy-katana-saya.webp": saya,
        "lucy-katana-handle.webp": handle,
        "lucy-katana-dual.webp": dual,
        "lucy-katana-zero.webp": zero,
        "lucy-katana-heaven.webp": heaven,
        "lucy-katana-hell.webp": hell,
        "lucy-katana-ultra.webp": ultra,
        "lucy-katana-slash-01.webp": slashes[0],
        "lucy-katana-slash-02.webp": slashes[1],
        "lucy-katana-slash-03.webp": slashes[2],
    }
    for name, image in exports.items():
        write_webp(image, OUT / name)

    stats = {}
    for name, image in exports.items():
        values = np.asarray(image, dtype=np.uint8)
        channel = values[:, :, 3]
        stats[name] = {
            "dimensions": list(image.size),
            "alpha": {
                "transparent_pixels": int((channel == 0).sum()),
                "fractional_pixels": int(((channel > 0) & (channel < 255)).sum()),
                "opaque_pixels": int((channel == 255).sum()),
                "transparent_corners": [int(channel[0, 0]), int(channel[0, -1]), int(channel[-1, 0]), int(channel[-1, -1])],
            },
        }
    # Exact cross-state contract: RGB inversion at every foreground position;
    # alpha is byte-identical by construction.
    h, x = np.asarray(heaven, dtype=np.uint8), np.asarray(hell, dtype=np.uint8)
    mask = h[:, :, 3] > 0
    inverse_ok = bool(np.array_equal(h[:, :, 3], x[:, :, 3]) and np.array_equal(255 - h[:, :, :3][mask], x[:, :, :3][mask]))
    manifest = {
        "job": "FP-KATANA-01",
        "model": "gpt-image-2",
        "generation_calls": 1,
        "source": str(RAW.relative_to(ROOT)),
        "authority_inputs": [
            "packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png",
            "packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png",
        ],
        "chroma_key": "#00FF00",
        "state_contract": {
            "zero": "neutral geometry with restrained cyan edge reflection",
            "heaven": "neutral geometry with cyan-blue reflection",
            "hell": "exact RGB inversion of Heaven; alpha and dimensions identical",
            "ultra": "matching dual geometry with restrained gold interference",
            "heaven_hell_exact_inversion": inverse_ok,
        },
        "outputs": stats,
    }
    (OUT / "ASSET_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
