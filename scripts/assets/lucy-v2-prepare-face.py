#!/usr/bin/env python3
"""Prepare the accepted Heaven matte, registered Hell inversion, and fixed face crop.

This is deliberately a pre-edit preparation step.  It does not repaint any
subject pixels: the matte is supplied by the recorded segmentation pass and
Hell is the unpremultiplied RGB complement of the accepted Heaven foreground.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "packages/site/assets/workbench/lucy"
SRC = WORK / "V2-HH-01/intermediate/heaven-rembg.png"
OUT = WORK / "V2-HH-01/intermediate"
FACE = WORK / "V2-HH-02/raw"

rgba = np.array(Image.open(SRC).convert("RGBA"), dtype=np.uint8)
alpha = rgba[:, :, 3]

# The accepted source has no chroma field, but its ML matte can retain a small
# green-dominant fringe in fractional edge pixels. Despill only the one-pixel
# exterior-connected partial-alpha band; cyan interiors and opaque art are
# never touched. This is a local deterministic matte correction, not repaint.
partial = (alpha > 0) & (alpha < 255)
outside = alpha == 0
neighbor_outside = outside.copy()
neighbor_outside[1:, :] |= outside[:-1, :]
neighbor_outside[:-1, :] |= outside[1:, :]
neighbor_outside[:, 1:] |= outside[:, :-1]
neighbor_outside[:, :-1] |= outside[:, 1:]
edge = partial & neighbor_outside
rgb = rgba[:, :, :3]
max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
spill = edge & (rgb[:, :, 1] > max_rb + 30)
rgb[:, :, 1][spill] = max_rb[spill] + 30
rgba[:, :, :3] = rgb

# Rembg's alpha is retained as fractional coverage.  RGB is already straight
# from the extraction pass.  Complement foreground RGB only; transparent
# pixels have hidden RGB zeroed, making the later diff unambiguous.
heaven = rgba.copy()
heaven[alpha == 0, :3] = 0
hell = heaven.copy()
foreground = alpha > 0
hell[foreground, :3] = 255 - heaven[foreground, :3]
hell[~foreground, :3] = 0

OUT.mkdir(parents=True, exist_ok=True)
FACE.mkdir(parents=True, exist_ok=True)
Image.fromarray(heaven, "RGBA").save(OUT / "heaven-accepted-alpha.png")
Image.fromarray(hell, "RGBA").save(OUT / "hell-registered-base.png")

# Fixed bounding box, face + modest context. The edit itself may only be
# composited through the smaller explicit mask authored by the exporter.
box = (315, 385, 630, 660)
face = Image.fromarray(hell, "RGBA").crop(box)
plate = Image.new("RGBA", face.size, (19, 5, 25, 255))
plate.alpha_composite(face)
plate.convert("RGB").save(FACE / "hell-inverted-face-context.png")
(FACE / "face-crop.json").write_text('{\n  "source_box": [315, 385, 630, 660],\n  "context": "registered inverted Hell base; no content outside eyes plus one tear may change"\n}\n')
