#!/usr/bin/env python3
"""Prepare the accepted v3 Heaven matte, exact Hell inversion, and face crop."""
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "packages/site/assets/workbench/lucy"
SOURCE = WORK / "V3-HH-01/intermediate/heaven-rembg.png"
OUT = WORK / "V3-HH-01/intermediate"
FACE = WORK / "V3-HH-02/raw"
FACE_BOX = (270, 330, 570, 630)


def main() -> None:
    rgba = np.asarray(Image.open(SOURCE).convert("RGBA"), dtype=np.uint8).copy()
    alpha = rgba[:, :, 3]

    # Correct only the exterior-connected fractional-alpha band. This protects
    # intentional cyan interiors while removing matte contamination.
    partial = (alpha > 0) & (alpha < 255)
    outside = alpha == 0
    exterior = outside.copy()
    for _ in range(3):
        grown = exterior.copy()
        grown[1:] |= exterior[:-1]
        grown[:-1] |= exterior[1:]
        grown[:, 1:] |= exterior[:, :-1]
        grown[:, :-1] |= exterior[:, 1:]
        exterior = grown
    band = partial & exterior
    rgb = rgba[:, :, :3]
    max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = band & (rgb[:, :, 1] > max_rb + 30)
    rgb[:, :, 1][spill] = max_rb[spill] + 30
    rgba[:, :, :3] = rgb
    rgba[alpha == 0, :3] = 0

    hell = rgba.copy()
    foreground = alpha > 0
    hell[foreground, :3] = 255 - rgba[foreground, :3]
    hell[~foreground, :3] = 0

    OUT.mkdir(parents=True, exist_ok=True)
    FACE.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(OUT / "heaven-accepted-alpha.png")
    Image.fromarray(hell, "RGBA").save(OUT / "hell-registered-base.png")

    face = Image.fromarray(hell, "RGBA").crop(FACE_BOX)
    plate = Image.new("RGBA", face.size, (255, 255, 255, 255))
    plate.alpha_composite(face)
    plate.convert("RGB").save(FACE / "hell-inverted-face-context.png")
    (FACE / "face-crop.json").write_text(
        '{\n  "source_box": [270, 330, 570, 630],\n'
        '  "contract": "edit only both eyelids plus exactly one tear"\n}\n'
    )


if __name__ == "__main__":
    main()
