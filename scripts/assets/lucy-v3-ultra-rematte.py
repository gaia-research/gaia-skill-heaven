#!/usr/bin/env python3
"""Recover the accepted Ultra raw from its baked near-white checker plate.

The original isnet matte erased Lucy's light head, hair, and gold wings.  This
script uses the known 16 px checker field plus the retained body matte as a
deterministic signal.  It never paints, inpaints, or generates character
pixels: RGB always comes from the preserved V3-ULTRA-01 raw.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "packages/site/assets/workbench/lucy/V3-ULTRA-01"
RAW = WORK / "raw/ultra-gpt-image-2-raw.png"
OLD_MATTE = WORK / "intermediate/ultra-rembg.png"
OUT = WORK / "intermediate/ultra-checker-rematte.png"
AUDIT = WORK / "audit"


def checker(image: Image.Image, dark: bool) -> Image.Image:
    colors = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", image.size, colors[0])
    draw = ImageDraw.Draw(board)
    for y in range(0, image.height, 48):
        for x in range(0, image.width, 48):
            if (x // 48 + y // 48) % 2:
                draw.rectangle((x, y, x + 47, y + 47), fill=colors[1])
    board.alpha_composite(image)
    return board


def main() -> None:
    raw = np.asarray(Image.open(RAW).convert("RGB"), dtype=np.int16)
    old = np.asarray(Image.open(OLD_MATTE).convert("RGBA"), dtype=np.uint8)
    height, width = raw.shape[:2]

    yy, xx = np.indices((height, width))
    # The generator baked an alternating 16 px checker with nominal 254/249
    # neutral values. Pixel noise is small; subject chroma/luminance diverges.
    parity = ((xx // 16 + yy // 16) % 2).astype(bool)
    expected = np.where(parity[:, :, None], 249, 254)
    delta = np.abs(raw - expected)
    delta_max = delta.max(axis=2)
    chroma = raw.max(axis=2) - raw.min(axis=2)
    darkness = np.clip(247 - raw.min(axis=2), 0, 255)

    # The retained isnet matte is a high-confidence body seed. The checker
    # difference recovers the light face, hair, glass, and gold wing language.
    seed = old[:, :, 3] >= 192
    evidence = (delta_max >= 9) | (chroma >= 6) | (darkness >= 9)
    evidence = ndimage.binary_closing(evidence, iterations=2)

    labels, count = ndimage.label(evidence)
    keep = np.zeros(count + 1, dtype=bool)
    areas = np.bincount(labels.ravel(), minlength=count + 1)
    touches_seed = np.bincount(labels.ravel(), weights=seed.ravel(), minlength=count + 1) > 0
    keep[touches_seed] = True
    # Detached authored pieces are confined to the upper hair/wing/shard field.
    # Requiring meaningful area there rejects baked checker specks elsewhere.
    for label in range(1, count + 1):
        if areas[label] < 60 or keep[label]:
            continue
        y_coords = np.where(labels == label)[0]
        if y_coords.size and int(y_coords.min()) < 780:
            keep[label] = True
    keep[0] = False
    support = keep[labels]

    # Suppress isolated plate noise outside the authored subject envelope while
    # retaining the full sword, hair, shard, and foot silhouette.
    envelope = np.zeros((height, width), dtype=bool)
    envelope[28:1515, 20:1005] = True
    support &= envelope

    signal = np.maximum.reduce([
        np.clip((delta_max - 4) * 34, 0, 255),
        np.clip((chroma - 2) * 28, 0, 255),
        np.clip(darkness * 24, 0, 255),
        old[:, :, 3].astype(np.int16),
    ])
    alpha = np.where(support | seed, signal, 0).astype(np.uint8)
    alpha[seed] = np.maximum(alpha[seed], old[:, :, 3][seed])

    # Feather only the recovered boundary. Opaque body pixels stay identical to
    # the retained matte; no character geometry is synthesized.
    soft = ndimage.gaussian_filter(alpha.astype(np.float32), sigma=0.65)
    recovered_only = ~seed & (alpha > 0)
    alpha[recovered_only] = np.maximum(alpha[recovered_only], np.clip(soft[recovered_only], 0, 255).astype(np.uint8))
    alpha[alpha < 7] = 0

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(raw, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = alpha
    rgba[alpha == 0, :3] = 0
    image = Image.fromarray(rgba, "RGBA")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG")
    checker(image, False).save(AUDIT / "ultra-rematte-light.png")
    checker(image, True).save(AUDIT / "ultra-rematte-dark.png")
    Image.fromarray(alpha, "L").save(AUDIT / "ultra-rematte-alpha.png")
    print(f"Recovered Ultra matte: {int((alpha > 0).sum())} foreground pixels; {int(((alpha > 0) & (alpha < 255)).sum())} fractional-alpha pixels.")


if __name__ == "__main__":
    main()
