#!/usr/bin/env python3
"""Fail-closed Lucy alpha extraction and matte audit.

This is the Lucy specialization of Gaia Image Production's cutout, pixel-diff,
and checkerboard recipes.  It accepts only native transparency or a verified
flat #00FF00 plate.  Opaque white/checker/scene backgrounds are rejected; they
are never reconstructed into speculative alpha.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


KEY = np.asarray((0.0, 255.0, 0.0), dtype=np.float32)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-dir", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--regions", type=Path, help="JSON semantic occupancy boxes")
    parser.add_argument("--asset-type", choices=("character", "component"), default="character")
    parser.add_argument("--candidate", default="unknown")
    parser.add_argument(
        "--exact-inverted-hell",
        action="store_true",
        help=(
            "audit a final Hell image already proven to be an exact inversion "
            "of a source that passed the flat-key spill gate; allows legitimate "
            "green created by inverting canonical source magenta"
        ),
    )
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def checker(size: tuple[int, int], dark: bool) -> Image.Image:
    width, height = size
    colors = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", size, colors[0])
    draw = ImageDraw.Draw(board)
    unit = 48
    for y in range(0, height, unit):
        for x in range(0, width, unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle((x, y, x + unit - 1, y + unit - 1), fill=colors[1])
    return board


def composite(subject: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    plate = Image.new("RGBA", subject.size, color)
    plate.alpha_composite(subject)
    return plate


def inverse_rgb(subject: Image.Image) -> Image.Image:
    data = np.asarray(subject.convert("RGBA"), dtype=np.uint8).copy()
    foreground = data[:, :, 3] > 0
    data[foreground, :3] = 255 - data[foreground, :3]
    data[~foreground, :3] = 0
    return Image.fromarray(data, "RGBA")


def exterior_band(alpha: np.ndarray, radius: int = 4) -> np.ndarray:
    exterior = alpha == 0
    for _ in range(radius):
        grown = exterior.copy()
        grown[1:] |= exterior[:-1]
        grown[:-1] |= exterior[1:]
        grown[:, 1:] |= exterior[:, :-1]
        grown[:, :-1] |= exterior[:, 1:]
        exterior = grown
    return exterior & (alpha > 0) & (alpha < 255)


def interior_boundary_band(alpha: np.ndarray, radius: int = 2) -> np.ndarray:
    """Foreground pixels within ``radius`` of transparent space.

    Unlike ``exterior_band``, this includes opaque boundary pixels. Generated
    green plates can bake key-color bounce into an opaque hair or glass rim;
    exact Hell inversion then turns that missed green spill magenta.
    """
    near_exterior = alpha == 0
    for _ in range(radius):
        grown = near_exterior.copy()
        grown[1:] |= near_exterior[:-1]
        grown[:-1] |= near_exterior[1:]
        grown[:, 1:] |= near_exterior[:, :-1]
        grown[:, :-1] |= near_exterior[:, 1:]
        near_exterior = grown
    return near_exterior & (alpha > 0)


def native_alpha(source: Image.Image) -> tuple[np.ndarray, dict]:
    data = np.asarray(source.convert("RGBA"), dtype=np.uint8).copy()
    alpha = data[:, :, 3]
    hidden = (alpha == 0) & np.any(data[:, :, :3] != 0, axis=2)
    stats = {
        "mode": "native-alpha",
        "source_hidden_rgb_at_alpha_zero": int(hidden.sum()),
    }
    data[alpha == 0, :3] = 0
    return data, stats


def border_pixels(rgb: np.ndarray, depth: int = 12) -> np.ndarray:
    top = rgb[:depth].reshape(-1, 3)
    bottom = rgb[-depth:].reshape(-1, 3)
    left = rgb[depth:-depth, :depth].reshape(-1, 3)
    right = rgb[depth:-depth, -depth:].reshape(-1, 3)
    return np.concatenate((top, bottom, left, right), axis=0)


def chroma_alpha(source: Image.Image) -> tuple[np.ndarray, dict]:
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32).copy()
    border = border_pixels(rgb)
    border_distance = np.linalg.norm(border - KEY, axis=1)
    key_fraction = float((border_distance <= 12.0).mean())
    border_std = [float(value) for value in border.std(axis=0)]
    if key_fraction < 0.90 or max(border_std) > 42.0:
        raise ValueError(
            "opaque source is not a verified flat #00FF00 plate "
            f"(border key fraction={key_fraction:.4f}, std={border_std}); "
            "baked checker/white/scene reconstruction is forbidden"
        )

    distance = np.linalg.norm(rgb - KEY, axis=2)
    alpha_f = np.clip((distance - 18.0) / 152.0, 0.0, 1.0)
    definite_key = (
        (rgb[:, :, 1] > 170)
        & (rgb[:, :, 1] > rgb[:, :, 0] * 1.65 + 56)
        & (rgb[:, :, 1] > rgb[:, :, 2] * 1.65 + 56)
    )
    alpha_f[definite_key] = 0.0

    partial = (alpha_f > 0.0) & (alpha_f < 1.0)
    for channel, key in enumerate(KEY):
        values = rgb[:, :, channel]
        values[partial] = np.clip(
            (values[partial] - (1.0 - alpha_f[partial]) * key) / alpha_f[partial],
            0,
            255,
        )

    alpha = np.round(alpha_f * 255.0).astype(np.uint8)
    band = exterior_band(alpha, radius=4)
    interior = interior_boundary_band(alpha, radius=2)
    max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = band & (rgb[:, :, 1] > max_rb + 6.0)
    rgb[:, :, 1][spill] = max_rb[spill]
    # Generated green plates can bake key bounce into fully opaque contour
    # pixels. Partial-alpha despill cannot reach those pixels, and an exact
    # Hell inversion turns them into a magenta rim. Lucy has no canonical
    # green boundary material, so neutralize only strongly green, fully opaque
    # pixels in the two-pixel interior contour before the final audit.
    opaque_interior_spill = (
        interior
        & (alpha == 255)
        & (rgb[:, :, 1] >= 140.0)
        & (rgb[:, :, 0] <= 175.0)
        & (rgb[:, :, 2] <= 175.0)
        & (rgb[:, :, 1] >= rgb[:, :, 0] + 15.0)
        & (rgb[:, :, 1] >= rgb[:, :, 2] + 8.0)
    )
    rgb[:, :, 1][opaque_interior_spill] = max_rb[opaque_interior_spill]

    data = np.dstack((np.clip(rgb, 0, 255).astype(np.uint8), alpha))
    data[alpha == 0, :3] = 0
    return data, {
        "mode": "verified-flat-green-chroma",
        "border_key_fraction": key_fraction,
        "border_rgb_std": border_std,
        "despilled_exterior_pixels": int(spill.sum()),
        "despilled_opaque_interior_pixels": int(opaque_interior_spill.sum()),
    }


def load_regions(path: Path | None, width: int, height: int) -> list[dict]:
    if path is None:
        return []
    payload = json.loads(path.read_text())
    regions = payload.get("regions", payload)
    required = {"face-core", "head", "hair", "torso", "left-arm-hand", "right-arm-hand", "left-leg-foot", "right-leg-foot", "wings", "weapons"}
    names = {item["name"] for item in regions}
    missing = sorted(required - names)
    if missing:
        raise ValueError(f"semantic region file is missing: {', '.join(missing)}")
    normalized: list[dict] = []
    for item in regions:
        box = item["box"]
        if max(box) <= 1.0:
            x1, y1, x2, y2 = (
                round(box[0] * width), round(box[1] * height),
                round(box[2] * width), round(box[3] * height),
            )
        else:
            x1, y1, x2, y2 = map(round, box)
        normalized.append({
            "name": item["name"],
            "box": [x1, y1, x2, y2],
            "minimum_foreground_pixels": int(item.get("minimum_foreground_pixels", 64)),
            "minimum_alpha_128_fraction": float(item.get("minimum_alpha_128_fraction", 0.0)),
            "minimum_alpha_192_fraction": float(item.get("minimum_alpha_192_fraction", 0.70 if item["name"] == "face-core" else 0.0)),
            "minimum_alpha_240_fraction": float(item.get("minimum_alpha_240_fraction", 0.0)),
            "minimum_median_alpha": int(item.get(
                "minimum_median_alpha",
                224 if item["name"] == "face-core" else 128 if item["name"] == "head" else 64 if item["name"] == "hair" else 0,
            )),
        })
    return normalized


def audit(data: np.ndarray, regions: list[dict], *, exact_inverted_hell: bool = False) -> dict:
    rgb = data[:, :, :3].astype(np.int16)
    alpha = data[:, :, 3]
    height, width = alpha.shape
    transparent = alpha == 0
    foreground = alpha > 0
    partial = foreground & (alpha < 255)
    band = exterior_band(alpha)
    interior_boundary = interior_boundary_band(alpha)

    strong_green = (rgb[:, :, 1] > rgb[:, :, 0] + 30) & (rgb[:, :, 1] > rgb[:, :, 2] + 30)
    key_green_dominant = (
        (rgb[:, :, 1] >= 140)
        & (rgb[:, :, 0] <= 175)
        & (rgb[:, :, 2] <= 175)
        & (rgb[:, :, 1] >= rgb[:, :, 0] + 15)
        & (rgb[:, :, 1] >= rgb[:, :, 2] + 8)
    )
    strong_magenta = (rgb[:, :, 0] > 170) & (rgb[:, :, 2] > 170) & (rgb[:, :, 1] < 100)
    hidden_rgb = transparent & np.any(rgb != 0, axis=2)

    border = np.zeros_like(alpha, dtype=bool)
    border[:3] = True
    border[-3:] = True
    border[:, :3] = True
    border[:, -3:] = True
    border_foreground = int((border & foreground).sum())

    ys, xs = np.where(foreground)
    bbox = None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
    region_results = []
    for region in regions:
        x1, y1, x2, y2 = region["box"]
        values = alpha[y1:y2, x1:x2]
        count = int((values > 0).sum())
        area = int(values.size)
        minimum = region["minimum_foreground_pixels"]
        nonzero = values[values > 0]
        median = int(np.median(nonzero)) if nonzero.size else 0
        fraction_128 = float((values >= 128).sum() / area) if area else 0.0
        fraction_192 = float((values >= 192).sum() / area) if area else 0.0
        fraction_240 = float((values >= 240).sum() / area) if area else 0.0
        passed = all((
            count >= minimum,
            fraction_128 >= region["minimum_alpha_128_fraction"],
            fraction_192 >= region["minimum_alpha_192_fraction"],
            fraction_240 >= region["minimum_alpha_240_fraction"],
            median >= region["minimum_median_alpha"],
        ))
        region_results.append({
            **region,
            "area_pixels": area,
            "foreground_pixels": count,
            "alpha_128_fraction": fraction_128,
            "alpha_192_fraction": fraction_192,
            "alpha_240_fraction": fraction_240,
            "median_nonzero_alpha": median,
            "pass": passed,
        })

    checks = {
        "has_transparency": int(transparent.sum()) > width * height * 0.05,
        "has_opaque_foreground": int((alpha == 255).sum()) > 1000,
        "has_fractional_alpha": int(partial.sum()) > 100,
        "foreground_not_on_canvas_border": border_foreground == 0,
        "zero_hidden_rgb_after_export": int(hidden_rgb.sum()) == 0,
        "zero_strong_green_exterior_fringe": int((band & strong_green).sum()) == 0,
        "zero_strong_magenta_exterior_fringe": int((band & strong_magenta).sum()) == 0,
        "zero_strong_green_interior_boundary_spill": (
            exact_inverted_hell or int((interior_boundary & key_green_dominant).sum()) == 0
        ),
        "all_semantic_regions_occupied": all(item["pass"] for item in region_results),
    }
    return {
        "width": width,
        "height": height,
        "transparent_pixels": int(transparent.sum()),
        "opaque_pixels": int((alpha == 255).sum()),
        "fractional_alpha_pixels": int(partial.sum()),
        "border_foreground_pixels": border_foreground,
        "hidden_rgb_pixels": int(hidden_rgb.sum()),
        "strong_green_exterior_pixels": int((band & strong_green).sum()),
        "strong_magenta_exterior_pixels": int((band & strong_magenta).sum()),
        "strong_green_interior_boundary_pixels": int((interior_boundary & key_green_dominant).sum()),
        "strong_magenta_interior_boundary_pixels": int((interior_boundary & strong_magenta).sum()),
        "exact_inverted_hell_mode": exact_inverted_hell,
        "foreground_bbox": bbox,
        "semantic_regions": region_results,
        "checks": checks,
        "pass": all(checks.values()),
    }


def main() -> None:
    args = parse_args()
    targets = [args.output, args.report]
    if not args.force and any(path.exists() for path in targets):
        raise SystemExit("refusing to overwrite output/report without --force")

    source = Image.open(args.input)
    source_rgba = source.convert("RGBA")
    source_alpha = np.asarray(source_rgba, dtype=np.uint8)[:, :, 3]
    native = "A" in source.getbands() and int(source_alpha.min()) == 0 and int(source_alpha.max()) == 255
    try:
        data, extraction = native_alpha(source) if native else chroma_alpha(source)
        if args.asset_type == "character" and args.regions is None:
            raise ValueError("character masters require --regions semantic occupancy data")
        regions = load_regions(args.regions, source.width, source.height)
        metrics = audit(data, regions, exact_inverted_hell=args.exact_inverted_hell)
        error = None
    except Exception as exc:
        data = np.asarray(source_rgba, dtype=np.uint8).copy()
        extraction = {"mode": "rejected"}
        metrics = {"checks": {}, "pass": False}
        error = str(exc)

    report = {
        "candidate": args.candidate,
        "input": str(args.input),
        "output": str(args.output),
        "source_bands": list(source.getbands()),
        "source_alpha_min": int(source_alpha.min()),
        "source_alpha_max": int(source_alpha.max()),
        "extraction": extraction,
        "metrics": metrics,
        "error": error,
        "pass": error is None and metrics.get("pass", False),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")

    if error is not None:
        print(json.dumps(report, indent=2))
        raise SystemExit(1)

    subject = Image.fromarray(data, "RGBA")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    subject.save(args.output, "PNG")
    composite(subject, (255, 255, 255, 255)).save(args.audit_dir / "white.png", "PNG")
    composite(subject, (0, 0, 0, 255)).save(args.audit_dir / "black.png", "PNG")
    composite(subject, (128, 128, 128, 255)).save(args.audit_dir / "mid-gray.png", "PNG")
    light = checker(subject.size, dark=False)
    light.alpha_composite(subject)
    light.save(args.audit_dir / "light-checker.png", "PNG")
    dark = checker(subject.size, dark=True)
    dark.alpha_composite(subject)
    dark.save(args.audit_dir / "dark-checker.png", "PNG")
    inverse = checker(subject.size, dark=True)
    inverse.alpha_composite(inverse_rgb(subject))
    inverse.save(args.audit_dir / "inverted-rgb-dark-checker.png", "PNG")
    Image.fromarray(data[:, :, 3], "L").save(args.audit_dir / "alpha.png", "PNG")

    print(json.dumps(report, indent=2))
    if not report["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
