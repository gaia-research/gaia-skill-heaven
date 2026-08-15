#!/usr/bin/env python3
"""Focused mechanical gate for the FP-KATANA-01 authority promotion."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "packages/site/src/assets/lucy/frontpage/katana-authority-v2"
NAMES = sorted(path.name for path in SHARED.glob("*.webp"))


def rgba(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        if image.format != "WEBP":
            raise AssertionError(f"not a WebP: {path}")
        return np.asarray(image.convert("RGBA"), dtype=np.uint8)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    expected = 15
    if len(NAMES) != expected:
        raise AssertionError(f"expected {expected} shared WebPs, found {len(NAMES)}")
    results: dict[str, object] = {"shared_files": len(NAMES), "alpha": {}, "variation_hash_match": {}}
    for name in NAMES:
        path = SHARED / name
        pixels = rgba(path)
        alpha = pixels[:, :, 3]
        if not (alpha == 0).any() or not ((alpha > 0) & (alpha < 255)).any():
            raise AssertionError(f"alpha is not real/fractional: {path}")
        corners = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]
        if corners != [0, 0, 0, 0]:
            raise AssertionError(f"non-transparent corner: {path}")
        results["alpha"][name] = {
            "dimensions": [int(pixels.shape[1]), int(pixels.shape[0])],
            "transparent_pixels": int((alpha == 0).sum()),
            "fractional_pixels": int(((alpha > 0) & (alpha < 255)).sum()),
            "transparent_corners": corners,
        }

    heaven, hell = rgba(SHARED / "lucy-katana-heaven.webp"), rgba(SHARED / "lucy-katana-hell.webp")
    if heaven.shape != hell.shape or not np.array_equal(heaven[:, :, 3], hell[:, :, 3]):
        raise AssertionError("Heaven/Hell dimensions or alpha differ")
    foreground = heaven[:, :, 3] > 0
    if not np.array_equal(255 - heaven[:, :, :3][foreground], hell[:, :, :3][foreground]):
        raise AssertionError("Hell foreground RGB is not Heaven exact inversion")
    results["heaven_hell"] = {
        "same_dimensions": True,
        "alpha_byte_identical": True,
        "foreground_rgb_exact_inverse": True,
    }

    for variation in ("a", "b"):
        target = ROOT / f"packages/site/src/assets/lucy/frontpage/variation-{variation}/components/katana"
        actual = sorted(path.name for path in target.glob("*.webp"))
        if actual != NAMES:
            raise AssertionError(f"variation {variation} katana file set diverges")
        mismatches = [name for name in NAMES if sha(SHARED / name) != sha(target / name)]
        if mismatches:
            raise AssertionError(f"variation {variation} differs from authority: {mismatches}")
        results["variation_hash_match"][variation] = {"files": len(actual), "identical_to_shared": True}

    production_pngs = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "packages/site/src/assets/lucy/frontpage").rglob("*.png"))
    if production_pngs:
        raise AssertionError(f"production PNGs found: {production_pngs}")
    results["production_pngs"] = 0
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
