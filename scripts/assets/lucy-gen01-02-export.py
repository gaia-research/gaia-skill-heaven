#!/usr/bin/env python3
"""Pixel-exact implementation for lucy-gen01-02-export.mjs.

It performs only deterministic local alpha keying, crop/contain, compositing,
and lossless WebP encoding from the two preserved raw one-shot results.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path.cwd()
WEBP = {"format": "WEBP", "lossless": True, "method": 6}
JOBS = (
    {
        "id": "GEN-01",
        "state": "ultra",
        "raw": "packages/site/assets/workbench/lucy/GEN-01/raw-gpt-image-2.png",
        "primary": "packages/site/src/assets/lucy/hero/lucy-ultra-primary.webp",
        "wide": "packages/site/src/assets/lucy/hero/lucy-ultra-desktop-wide.webp",
        "state_out": "packages/site/src/assets/lucy/states/lucy-ultra.webp",
        "panel": "packages/site/src/assets/lucy/states/panels/lucy-ultra-panel.webp",
        "background": "packages/site/src/assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp",
        "portrait": "packages/site/src/assets/lucy/portraits/lucy-ultra.webp",
        "portrait_crop": (360, 120, 1080, 840),
        "subject_gravity": "east",
        "desktop_gravity": "east",
        "base": (7, 7, 13),
        "accent": (247, 200, 75),
    },
    {
        "id": "GEN-02",
        "state": "heaven",
        "raw": "packages/site/assets/workbench/lucy/GEN-02/raw-gpt-image-2.png",
        "primary": "packages/site/src/assets/lucy/hero/lucy-heaven-alternate.webp",
        "wide": "packages/site/src/assets/lucy/hero/lucy-heaven-desktop-wide.webp",
        "state_out": "packages/site/src/assets/lucy/states/lucy-heaven.webp",
        "panel": "packages/site/src/assets/lucy/states/panels/lucy-heaven-panel.webp",
        "background": "packages/site/src/assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp",
        "portrait": "packages/site/src/assets/lucy/portraits/lucy-heaven.webp",
        "portrait_crop": (180, 170, 830, 820),
        "subject_gravity": "west",
        "desktop_gravity": "west",
        "base": (5, 10, 21),
        "accent": (124, 196, 255),
    },
)


def path(relative: str) -> Path:
    return ROOT / relative


def save_webp(image: Image.Image, relative: str) -> None:
    target = path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, **WEBP)


def save_png(image: Image.Image, relative: str) -> None:
    target = path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.contain(image, size, Image.Resampling.LANCZOS)


def anchored_canvas(image: Image.Image, size: tuple[int, int], gravity: str) -> Image.Image:
    resized = contain(image, size)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    left = 0 if gravity == "west" else size[0] - resized.width if gravity == "east" else (size[0] - resized.width) // 2
    top = (size[1] - resized.height) // 2
    canvas.alpha_composite(resized, (left, top))
    return canvas


def key_green(raw: Image.Image) -> tuple[Image.Image, dict[str, int]]:
    rgba = np.array(raw.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3].astype(np.float32)
    distance = np.sqrt(rgb[:, :, 0] ** 2 + (rgb[:, :, 1] - 255) ** 2 + rgb[:, :, 2] ** 2)
    # The model antialiases against #00FF00. A broad soft key plus despill is
    # needed for hair filaments and glass tips; cyan/blue/gold all remain far
    # enough from chroma green to survive this threshold.
    alpha = np.where(distance <= 100, 0, np.where(distance < 250, np.rint((distance - 100) * 255 / 150), 255)).astype(np.uint8)
    edge = (distance < 280) & (rgb[:, :, 1] > np.maximum(rgb[:, :, 0], rgb[:, :, 2]))
    rgba[:, :, 1][edge] = np.maximum(rgba[:, :, 0][edge], rgba[:, :, 2][edge])
    fully_transparent = alpha == 0
    rgba[:, :, :3][fully_transparent] = 0
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA"), {
        "pixels": int(alpha.size),
        "transparent": int(np.count_nonzero(fully_transparent)),
        "partial": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
    }


def alpha_audit(image: Image.Image) -> dict[str, int]:
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    zero = alpha == 0
    hidden_rgb = np.any(rgba[:, :, :3] != 0, axis=2) & zero
    return {
        "width": image.width,
        "height": image.height,
        "transparent": int(np.count_nonzero(zero)),
        "partial": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
        "hidden_rgb": int(np.count_nonzero(hidden_rgb)),
    }


def checker(size: tuple[int, int]) -> Image.Image:
    out = Image.new("RGBA", size, (232, 232, 232, 255))
    draw = ImageDraw.Draw(out)
    unit = 48
    for y in range(0, size[1], unit):
        for x in range(0, size[0], unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle((x, y, x + unit - 1, y + unit - 1), fill=(169, 169, 169, 255))
    return out


def background(job: dict) -> Image.Image:
    width, height = 2560, 1440
    yy, xx = np.mgrid[0:height, 0:width]
    base = np.zeros((height, width, 3), dtype=np.float32)
    for channel, value in enumerate(job["base"]):
        base[:, :, channel] = value
    radius = np.sqrt(((xx - width * 0.72) / (width * 0.65)) ** 2 + ((yy - height * 0.43) / (height * 0.65)) ** 2)
    glow = np.clip(1 - radius, 0, 1) ** 2 * 0.22
    for channel, value in enumerate(job["accent"]):
        base[:, :, channel] = base[:, :, channel] * (1 - glow) + value * glow
    return Image.fromarray(np.uint8(np.clip(base, 0, 255)), "RGB")


def inverted(image: Image.Image) -> Image.Image:
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgba[:, :, :3] = 255 - rgba[:, :, :3]
    return Image.fromarray(rgba, "RGBA")


def render_job(job: dict) -> dict:
    raw = Image.open(path(job["raw"]))
    cutout, cutout_audit = key_green(raw)
    workbench = f"packages/site/assets/workbench/lucy/{job['id']}"
    cutout_path = f"{workbench}/cutout-alpha.png"
    save_png(cutout, cutout_path)

    save_webp(cutout, job["primary"])
    save_webp(cutout, job["state_out"])
    save_webp(anchored_canvas(cutout, (1024, 1280), job["subject_gravity"]), job["panel"])

    plate = background(job)
    save_webp(plate, job["background"])
    desktop = ImageOps.fit(plate, (2560, 1080), Image.Resampling.LANCZOS).convert("RGBA")
    subject = contain(cutout, (1110, 1020))
    desktop.alpha_composite(subject, (1450 if job["desktop_gravity"] == "east" else 0, (1080 - subject.height) // 2))
    save_webp(desktop, job["wide"])

    portrait = cutout.crop(job["portrait_crop"])
    save_webp(anchored_canvas(portrait, (1024, 1024), "center"), job["portrait"])

    normal = checker(cutout.size)
    normal.alpha_composite(cutout)
    save_png(normal, f"{workbench}/alpha-normal-checker.png")
    inverse = checker(cutout.size)
    inverse.alpha_composite(inverted(cutout))
    save_png(inverse, f"{workbench}/alpha-inverted-checker.png")

    cutout_png_audit = alpha_audit(Image.open(path(cutout_path)))
    audit = alpha_audit(Image.open(path(job["primary"])))
    payload = {"job": job["id"], "cutout": cutout_audit | {"width": cutout.width, "height": cutout.height}, "cutout_png": cutout_png_audit, "production_webp": audit}
    target = path(f"{workbench}/alpha-audit.json")
    target.write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def katana_kit() -> None:
    sword = Image.open(path("packages/site/src/assets/hero-commission/v01/sword.png")).convert("RGBA")
    slash = Image.open(path("packages/site/src/assets/hero-commission/v01/slash-arc.png")).convert("RGBA")
    base = "packages/site/src/assets/lucy/components/katana"
    save_webp(sword, f"{base}/lucy-katana-neutral-steel.webp")
    save_webp(sword, f"{base}/lucy-katana-right.webp")
    save_webp(ImageOps.mirror(sword), f"{base}/lucy-katana-left.webp")
    save_webp(sword.crop((1130, 320, 1650, 640)).getbbox() and sword.crop((1130, 320, 1650, 640)) or sword, f"{base}/lucy-katana-handle.webp")
    save_webp(slash, f"{base}/lucy-katana-slash-01.webp")
    dual = Image.new("RGBA", (2000, 1200), (0, 0, 0, 0))
    first = contain(sword, (1750, 985)).rotate(-16, expand=True, resample=Image.Resampling.BICUBIC)
    second = contain(ImageOps.mirror(sword), (1750, 985)).rotate(16, expand=True, resample=Image.Resampling.BICUBIC)
    dual.alpha_composite(first, ((2000 - first.width) // 2, max(0, (1200 - first.height) // 2 - 100)))
    dual.alpha_composite(second, ((2000 - second.width) // 2, min(1200 - second.height, (1200 - second.height) // 2 + 100)))
    save_webp(dual, f"{base}/lucy-katana-dual.webp")


def main() -> None:
    results = [render_job(job) for job in JOBS]
    katana_kit()
    print(json.dumps({"jobs": results, "katana": "exported from approved hero-commission/v01 artwork"}, indent=2))


if __name__ == "__main__":
    main()
