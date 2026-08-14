#!/usr/bin/env python3
"""Deterministic preparation for owner-gated Lucy v4 candidates.

This script never generates pixels. It prepares exact Hell RGB inversions and
bounded face crops, composites returned face patches through a tracked
antialiased mask, and exports only matte-guard-passing candidates as lossless
alpha WebP files.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def parse_box(value: str) -> tuple[int, int, int, int]:
    parts = tuple(int(item) for item in value.split(","))
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("box must be x1,y1,x2,y2")
    return parts


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)

    prepare = commands.add_parser("prepare-hell")
    prepare.add_argument("--heaven", required=True, type=Path)
    prepare.add_argument("--out-base", required=True, type=Path)
    prepare.add_argument("--out-face", required=True, type=Path)
    prepare.add_argument("--face-box", required=True, type=parse_box)
    prepare.add_argument("--report", required=True, type=Path)

    compose = commands.add_parser("compose-hell")
    compose.add_argument("--base", required=True, type=Path)
    compose.add_argument("--patch", required=True, type=Path)
    compose.add_argument("--face-box", required=True, type=parse_box)
    compose.add_argument("--mask-config", required=True, type=Path)
    compose.add_argument("--out", required=True, type=Path)
    compose.add_argument("--out-mask", required=True, type=Path)
    compose.add_argument("--report", required=True, type=Path)

    export = commands.add_parser("export-webp")
    export.add_argument("--input", required=True, type=Path)
    export.add_argument("--matte-report", required=True, type=Path)
    export.add_argument("--output", required=True, type=Path)
    export.add_argument("--report", required=True, type=Path)

    rejected = commands.add_parser("audit-rejected")
    rejected.add_argument("--input", required=True, type=Path)
    rejected.add_argument("--matte-report", required=True, type=Path)
    rejected.add_argument("--audit-dir", required=True, type=Path)

    rejected_webp = commands.add_parser("export-rejected-webp")
    rejected_webp.add_argument("--input", required=True, type=Path)
    rejected_webp.add_argument("--matte-report", required=True, type=Path)
    rejected_webp.add_argument("--output", required=True, type=Path)
    rejected_webp.add_argument("--report", required=True, type=Path)

    invert_source = commands.add_parser("invert-hell-source")
    invert_source.add_argument("--source", required=True, type=Path)
    invert_source.add_argument("--output", required=True, type=Path)
    invert_source.add_argument("--report", required=True, type=Path)
    invert_source.add_argument("--regions", type=Path)
    invert_source.add_argument("--require-canonical-tear", action="store_true")
    return root


def rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8).copy()


def prepare_hell(args: argparse.Namespace) -> None:
    source_image = Image.open(args.heaven)
    source = np.asarray(source_image.convert("RGBA"), dtype=np.uint8).copy()
    has_real_alpha = (
        "A" in source_image.getbands()
        and int(source[:, :, 3].min()) == 0
        and int(source[:, :, 3].max()) == 255
    )
    foreground = source[:, :, 3] > 0 if has_real_alpha else np.ones(source.shape[:2], dtype=bool)
    inverted = source.copy()
    inverted[foreground, :3] = 255 - source[foreground, :3]
    inverted[~foreground, :3] = 0

    args.out_base.parent.mkdir(parents=True, exist_ok=True)
    args.out_face.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(inverted, "RGBA").save(args.out_base, "PNG")
    face = Image.fromarray(inverted, "RGBA").crop(args.face_box)
    if has_real_alpha:
        plate = Image.new("RGBA", face.size, (255, 255, 255, 255))
        plate.alpha_composite(face)
        face = plate
    face.convert("RGB").save(args.out_face, "PNG")
    payload = {
        "heaven": str(args.heaven),
        "out_base": str(args.out_base),
        "out_face": str(args.out_face),
        "face_box": list(args.face_box),
        "source_bands": list(source_image.getbands()),
        "source_has_real_alpha": has_real_alpha,
        "inversion_scope": "foreground-alpha" if has_real_alpha else "entire-opaque-failed-source",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n")


def antialiased_mask(size: tuple[int, int], config: dict) -> Image.Image:
    scale = 4
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    for item in config["shapes"]:
        if item["type"] == "ellipse":
            draw.ellipse(tuple(round(value * scale) for value in item["box"]), fill=255)
        elif item["type"] == "polygon":
            draw.polygon(
                [tuple(round(value * scale) for value in point) for point in item["points"]],
                fill=255,
            )
        else:
            raise ValueError(f"unknown mask shape: {item['type']}")
    return mask.resize(size, Image.Resampling.LANCZOS)


def compose_hell(args: argparse.Namespace) -> None:
    base = rgba(args.base)
    x1, y1, x2, y2 = args.face_box
    width, height = x2 - x1, y2 - y1
    patch = Image.open(args.patch).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    patch_data = np.asarray(patch, dtype=np.uint8)
    config = json.loads(args.mask_config.read_text())
    local_mask_image = antialiased_mask((width, height), config)
    local_mask = np.asarray(local_mask_image, dtype=np.uint8).astype(np.float32) / 255.0

    result = base.copy()
    before = base[y1:y2, x1:x2, :3].astype(np.float32)
    blended = np.round(before * (1.0 - local_mask[:, :, None]) + patch_data * local_mask[:, :, None])
    result[y1:y2, x1:x2, :3] = np.clip(blended, 0, 255).astype(np.uint8)
    result[:, :, 3] = base[:, :, 3]

    full_mask = Image.new("L", (base.shape[1], base.shape[0]), 0)
    full_mask.paste(local_mask_image, (x1, y1))
    full_mask_data = np.asarray(full_mask, dtype=np.uint8)
    changed = np.any(result[:, :, :3] != base[:, :, :3], axis=2)
    outside_diff = int((changed & (full_mask_data == 0)).sum())
    inside_changed = int((changed & (full_mask_data > 0)).sum())

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out_mask.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(result, "RGBA").save(args.out, "PNG")
    full_mask.save(args.out_mask, "PNG")
    payload = {
        "base": str(args.base),
        "patch": str(args.patch),
        "mask_config": str(args.mask_config),
        "face_box": list(args.face_box),
        "output": str(args.out),
        "output_mask": str(args.out_mask),
        "alpha_byte_identical_to_base": bool(np.array_equal(result[:, :, 3], base[:, :, 3])),
        "rgb_differences_outside_antialiased_mask": outside_diff,
        "rgb_changed_pixels_inside_antialiased_mask": inside_changed,
        "pass_registration": outside_diff == 0 and inside_changed > 0,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n")


def export_webp(args: argparse.Namespace) -> None:
    matte = json.loads(args.matte_report.read_text())
    if not matte.get("pass"):
        raise SystemExit("refusing to export candidate whose matte guard did not pass")
    source = Image.open(args.input).convert("RGBA")
    alpha = np.asarray(source, dtype=np.uint8)[:, :, 3]
    if int(alpha.min()) != 0 or int(alpha.max()) != 255:
        raise SystemExit("refusing to export without both transparent and opaque pixels")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    source.save(args.output, "WEBP", lossless=True, method=6, exact=True)
    reopened = Image.open(args.output).convert("RGBA")
    reopened_alpha = np.asarray(reopened, dtype=np.uint8)[:, :, 3]
    payload = {
        "input": str(args.input),
        "output": str(args.output),
        "dimensions": list(source.size),
        "alpha_byte_identical_after_reopen": bool(np.array_equal(alpha, reopened_alpha)),
        "transparent_pixels": int((reopened_alpha == 0).sum()),
        "fractional_alpha_pixels": int(((reopened_alpha > 0) & (reopened_alpha < 255)).sum()),
        "opaque_pixels": int((reopened_alpha == 255).sum()),
    }
    payload["pass"] = payload["alpha_byte_identical_after_reopen"] and payload["transparent_pixels"] > 0
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n")
    if not payload["pass"]:
        raise SystemExit(1)


def checker(size: tuple[int, int], dark: bool) -> Image.Image:
    colors = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", size, colors[0])
    draw = ImageDraw.Draw(board)
    unit = 48
    for y in range(0, size[1], unit):
        for x in range(0, size[0], unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle((x, y, x + unit - 1, y + unit - 1), fill=colors[1])
    return board


def audit_rejected(args: argparse.Namespace) -> None:
    matte = json.loads(args.matte_report.read_text())
    if matte.get("pass"):
        raise SystemExit("audit-rejected is only for fail-closed matte results")
    source = Image.open(args.input).convert("RGBA")
    data = np.asarray(source, dtype=np.uint8).copy()
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    source.save(args.audit_dir / "source-rgb.png", "PNG")
    Image.fromarray(data[:, :, 3], "L").save(args.audit_dir / "alpha.png", "PNG")
    for name, color in (
        ("white", (255, 255, 255, 255)),
        ("black", (0, 0, 0, 255)),
        ("mid-gray", (128, 128, 128, 255)),
    ):
        plate = Image.new("RGBA", source.size, color)
        plate.alpha_composite(source)
        plate.save(args.audit_dir / f"{name}.png", "PNG")
    for name, dark in (("light-checker", False), ("dark-checker", True)):
        plate = checker(source.size, dark)
        plate.alpha_composite(source)
        plate.save(args.audit_dir / f"{name}.png", "PNG")
    inverted = data.copy()
    inverted[:, :, :3] = 255 - inverted[:, :, :3]
    plate = checker(source.size, True)
    plate.alpha_composite(Image.fromarray(inverted, "RGBA"))
    plate.save(args.audit_dir / "inverted-rgb-dark-checker.png", "PNG")


def export_rejected_webp(args: argparse.Namespace) -> None:
    matte = json.loads(args.matte_report.read_text())
    if matte.get("pass"):
        raise SystemExit("use export-webp for matte-guard-passing candidates")
    source = Image.open(args.input).convert("RGBA")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    source.save(args.output, "WEBP", lossless=True, method=6, exact=True)
    reopened = Image.open(args.output).convert("RGBA")
    alpha = np.asarray(reopened, dtype=np.uint8)[:, :, 3]
    payload = {
        "input": str(args.input),
        "output": str(args.output),
        "dimensions": list(source.size),
        "lossless_reopen": reopened.size == source.size,
        "matte_guard_pass": False,
        "transparent_pixels": int((alpha == 0).sum()),
        "fractional_alpha_pixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "opaque_pixels": int((alpha == 255).sum()),
        "presentation_status": "FAIL-OPAQUE-SOURCE",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n")


def invert_hell_source(args: argparse.Namespace) -> None:
    """Apply the complete Hell transform without a patch, mask, or recolor."""
    source_image = Image.open(args.source)
    source = np.asarray(source_image.convert("RGBA"), dtype=np.uint8).copy()
    alpha = source[:, :, 3]
    has_real_alpha = (
        "A" in source_image.getbands()
        and int(alpha.min()) == 0
        and int(alpha.max()) == 255
    )
    foreground = alpha > 0 if has_real_alpha else np.ones(alpha.shape, dtype=bool)
    result = source.copy()
    result[foreground, :3] = 255 - source[foreground, :3]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(result, "RGBA").save(args.output, "PNG")
    reopened = np.asarray(Image.open(args.output).convert("RGBA"), dtype=np.uint8)
    exact_inversion = bool(
        np.array_equal(
            reopened[foreground, :3],
            255 - source[foreground, :3],
        )
    )
    unchanged_outside = bool(
        np.array_equal(reopened[~foreground, :3], source[~foreground, :3])
    )
    payload = {
        "source": str(args.source),
        "output": str(args.output),
        "dimensions": list(source_image.size),
        "source_bands": list(source_image.getbands()),
        "source_has_real_alpha": has_real_alpha,
        "inversion_scope": "foreground-alpha" if has_real_alpha else "entire-opaque-preview-source",
        "foreground_pixels": int(foreground.sum()),
        "alpha_byte_identical": bool(np.array_equal(reopened[:, :, 3], alpha)),
        "rgb_exact_255_minus_source_on_scope": exact_inversion,
        "rgb_unchanged_outside_scope": unchanged_outside,
        "local_edits_or_recolor": False,
    }

    if args.require_canonical_tear and args.regions is None:
        raise SystemExit("--require-canonical-tear requires --regions")
    if args.regions is not None:
        region_payload = json.loads(args.regions.read_text())
        regions = region_payload.get("regions", region_payload)
        face = next((item for item in regions if item["name"] == "face-core"), None)
        if face is None:
            raise SystemExit("semantic regions must include face-core")
        box = face["box"]
        if max(box) <= 1.0:
            x1, y1, x2, y2 = (
                round(box[0] * source.shape[1]), round(box[1] * source.shape[0]),
                round(box[2] * source.shape[1]), round(box[3] * source.shape[0]),
            )
        else:
            x1, y1, x2, y2 = map(round, box)
        source_face = source[y1:y2, x1:x2]
        final_face = reopened[y1:y2, x1:x2]
        source_cyan = (
            (source_face[:, :, 0] <= 35)
            & (source_face[:, :, 1] >= 195)
            & (source_face[:, :, 2] >= 195)
            & (source_face[:, :, 3] > 0)
        )
        final_red = (
            (final_face[:, :, 0] >= 220)
            & (final_face[:, :, 1] <= 60)
            & (final_face[:, :, 2] <= 60)
            & (final_face[:, :, 3] > 0)
        )
        ys, _ = np.where(final_red)
        vertical_span = 0 if not len(ys) else int(ys.max() - ys.min() + 1)
        face_height = max(1, y2 - y1)
        tear = {
            "face_core_box": [x1, y1, x2, y2],
            "source_vivid_cyan_pixels": int(source_cyan.sum()),
            "final_vivid_red_pixels": int(final_red.sum()),
            "final_vivid_red_vertical_span_pixels": vertical_span,
            "final_vivid_red_vertical_span_fraction": vertical_span / face_height,
            "minimum_vivid_pixels": 12,
            "minimum_vertical_span_fraction": 0.35,
        }
        tear["pass"] = all((
            tear["source_vivid_cyan_pixels"] >= tear["minimum_vivid_pixels"],
            tear["final_vivid_red_pixels"] >= tear["minimum_vivid_pixels"],
            tear["source_vivid_cyan_pixels"] == tear["final_vivid_red_pixels"],
            tear["final_vivid_red_vertical_span_fraction"] >= tear["minimum_vertical_span_fraction"],
        ))
        payload["canonical_tear_color_and_span"] = tear
    payload["pass"] = all((
        payload["alpha_byte_identical"],
        payload["rgb_exact_255_minus_source_on_scope"],
        payload["rgb_unchanged_outside_scope"],
        not args.require_canonical_tear or payload["canonical_tear_color_and_span"]["pass"],
    ))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n")
    if not payload["pass"]:
        raise SystemExit(1)


def main() -> None:
    args = parser().parse_args()
    if args.command == "prepare-hell":
        prepare_hell(args)
    elif args.command == "compose-hell":
        compose_hell(args)
    elif args.command == "export-webp":
        export_webp(args)
    elif args.command == "audit-rejected":
        audit_rejected(args)
    elif args.command == "export-rejected-webp":
        export_rejected_webp(args)
    else:
        invert_hell_source(args)


if __name__ == "__main__":
    main()
