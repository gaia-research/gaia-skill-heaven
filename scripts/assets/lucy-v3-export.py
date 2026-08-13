#!/usr/bin/env python3
"""Deterministically export the accepted Lucy v3 registered asset system."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "packages/site/assets/workbench/lucy"
OUT = ROOT / "packages/site/src/assets/lucy/v3"
V1 = ROOT / "packages/site/src/assets/lucy"
H_DIR = WORK / "V3-HH-01/intermediate"
F_DIR = WORK / "V3-HH-02"
U_DIR = WORK / "V3-ULTRA-01/intermediate"
FACE_BOX = (270, 330, 570, 630)


def mkdir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def png(image: Image.Image, path: Path) -> None:
    mkdir(path)
    image.save(path, "PNG")


def webp(image: Image.Image, path: Path) -> None:
    mkdir(path)
    image.save(path, "WEBP", lossless=True, method=6, exact=True)


def inverse(image: Image.Image) -> Image.Image:
    data = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    fg = data[:, :, 3] > 0
    data[fg, :3] = 255 - data[fg, :3]
    data[~fg, :3] = 0
    return Image.fromarray(data, "RGBA")


def clean_alpha(image: Image.Image) -> Image.Image:
    data = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    alpha = data[:, :, 3]
    partial = (alpha > 0) & (alpha < 255)
    exterior = alpha == 0
    for _ in range(3):
        grown = exterior.copy()
        grown[1:] |= exterior[:-1]
        grown[:-1] |= exterior[1:]
        grown[:, 1:] |= exterior[:, :-1]
        grown[:, :-1] |= exterior[:, 1:]
        exterior = grown
    band = partial & exterior
    rgb = data[:, :, :3]
    max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = band & (rgb[:, :, 1] > max_rb + 30)
    rgb[:, :, 1][spill] = max_rb[spill] + 30
    data[:, :, :3] = rgb
    data[alpha == 0, :3] = 0
    return Image.fromarray(data, "RGBA")


def fit(image: Image.Image, size: tuple[int, int], position: str = "center") -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - copy.width) // 2
    y = 0 if position == "top" else (size[1] - copy.height) // 2
    canvas.alpha_composite(copy, (x, y))
    return canvas


def face_mask() -> Image.Image:
    scale = 4
    mask = Image.new("L", (300 * scale, 300 * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((65*scale, 116*scale, 142*scale, 187*scale), fill=255)
    draw.ellipse((134*scale, 100*scale, 225*scale, 177*scale), fill=255)
    draw.polygon([
        (86*scale, 154*scale), (121*scale, 151*scale),
        (130*scale, 205*scale), (115*scale, 239*scale),
        (96*scale, 207*scale),
    ], fill=255)
    return mask.resize((300, 300), Image.Resampling.LANCZOS)


def hell_face_edit(hell_base: Image.Image) -> tuple[Image.Image, Image.Image]:
    patch = rgba(F_DIR / "raw/hell-face-gpt-image-2-raw.png").convert("RGB")
    patch = patch.resize((300, 300), Image.Resampling.LANCZOS)
    local_mask = face_mask()
    result = hell_base.copy()
    base_crop = result.crop(FACE_BOX)
    edited = base_crop.convert("RGB")
    edited.paste(patch, (0, 0), local_mask)
    edited_rgba = Image.merge("RGBA", (*edited.split(), base_crop.getchannel("A")))
    result.paste(edited_rgba, FACE_BOX[:2])
    full_mask = Image.new("L", result.size, 0)
    full_mask.paste(local_mask, FACE_BOX[:2])
    return result, full_mask


def pair_export(
    heaven: Image.Image,
    hell: Image.Image,
    relative: str,
    made: list[str],
    matrix: dict,
    size: tuple[int, int] | None = None,
    position: str = "center",
) -> None:
    left, right = (fit(heaven, size, position), fit(hell, size, position)) if size else (heaven, hell)
    hp = OUT / relative.format(state="heaven")
    xp = OUT / relative.format(state="hell")
    webp(left, hp)
    webp(right, xp)
    made.extend([str(hp.relative_to(OUT)), str(xp.relative_to(OUT))])
    matrix[relative] = {
        "heaven": str(hp.relative_to(OUT)),
        "hell": str(xp.relative_to(OUT)),
        "size": list(left.size),
        "position": position,
    }


def background_pair() -> tuple[Image.Image, Image.Image]:
    width, height = 2560, 1440
    yy, xx = np.ogrid[:height, :width]
    radius = np.sqrt(((xx - width * .68) / width) ** 2 + ((yy - height * .45) / height) ** 2)
    strength = np.clip(1 - radius / .85, 0, 1)
    base = np.zeros((height, width, 4), dtype=np.uint8)
    base[:, :, 0] = 5 + 13 * strength
    base[:, :, 1] = 13 + 50 * strength
    base[:, :, 2] = 31 + 90 * strength
    base[:, :, 3] = 255
    heaven = Image.fromarray(base, "RGBA")
    return heaven, inverse(heaven)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    heaven = clean_alpha(rgba(H_DIR / "heaven-accepted-alpha.png"))
    hell_base = inverse(heaven)
    hell, full_mask = hell_face_edit(hell_base)
    ultra = clean_alpha(rgba(U_DIR / "ultra-rembg.png"))
    png(heaven, H_DIR / "heaven-final-alpha.png")
    png(hell_base, H_DIR / "hell-registered-base-final.png")
    png(hell, F_DIR / "intermediate/hell-final-alpha.png")
    png(full_mask, F_DIR / "intermediate/hell-eye-tear-mask.png")
    png(ultra, U_DIR / "ultra-final-alpha.png")

    made: list[str] = []
    matrix: dict = {}
    for relative, size, position in [
        ("masters/lucy-{state}.webp", None, "center"),
        ("hero/lucy-{state}-desktop-wide.webp", (2560, 1080), "center"),
        ("states/lucy-{state}.webp", None, "center"),
        ("states/panels/lucy-{state}-panel.webp", (1024, 1280), "center"),
        ("portraits/lucy-{state}.webp", (1024, 1024), "top"),
        ("mobile/lucy-{state}-hero-1440x2560.webp", (1440, 2560), "center"),
        ("identity/lucy-avatar-{state}.webp", (512, 512), "top"),
    ]:
        pair_export(heaven, hell, relative, made, matrix, size, position)

    white = Image.new("RGBA", hell.size, (255, 255, 255, 255))
    white.alpha_composite(hell)
    webp(white, OUT / "states/lucy-hell-white.webp")
    made.append("states/lucy-hell-white.webp")

    heaven_bg, hell_bg = background_pair()
    pair_export(heaven_bg, hell_bg, "backgrounds/lucy-bg-{state}-desktop.webp", made, matrix)

    paired_crops = {
        "components/wings/lucy-wing-{state}-left.webp": (130, 315, 590, 820),
        "components/wings/lucy-wing-{state}-right.webp": (500, 190, 995, 800),
        "components/ribbons/lucy-ribbon-{state}.webp": (300, 515, 535, 710),
        "components/shards/lucy-shard-cluster-{state}.webp": (490, 170, 1000, 850),
    }
    for relative, box in paired_crops.items():
        pair_export(heaven.crop(box), hell.crop(box), relative, made, matrix)

    for state, master in (("heaven", heaven), ("hell", hell)):
        left = master.crop((130, 315, 590, 820))
        right = master.crop((500, 190, 995, 800))
        pair = Image.new("RGBA", (1030, 680), (0, 0, 0, 0))
        pair.alpha_composite(left, (0, 140))
        pair.alpha_composite(right, (535, 0))
        webp(pair, OUT / f"components/wings/lucy-wing-{state}-pair.webp")
        made.append(f"components/wings/lucy-wing-{state}-pair.webp")
    matrix["components/wings/lucy-wing-{state}-pair.webp"] = {
        "heaven": "components/wings/lucy-wing-heaven-pair.webp",
        "hell": "components/wings/lucy-wing-hell-pair.webp",
        "size": [1030, 680],
        "position": "registered side-crop assembly",
    }

    shard_boxes = [
        (735, 160, 825, 310), (825, 120, 925, 310), (660, 250, 760, 410),
        (795, 365, 910, 540), (650, 470, 760, 635), (890, 500, 1015, 690),
    ]
    for index, box in enumerate(shard_boxes, 1):
        pair_export(
            heaven.crop(box), hell.crop(box),
            f"components/shards/lucy-shard-{index:02d}-{{state}}.webp",
            made, matrix,
        )

    fx_sources = {
        "particles": "fx/lucy-particles-cyan.webp",
        "caustic": "fx/lucy-caustics-cyan.webp",
        "aura": "fx/lucy-aura-heaven.webp",
        "dust": "fx/lucy-glass-dust-cyan.webp",
        "trail": "fx/lucy-shard-trail-cyan.webp",
        "fragment": "fx/lucy-micro-shards.webp",
        "streak": "fx/lucy-light-streaks.webp",
        "reflection": "fx/lucy-glass-reflection.webp",
        "flare": "fx/lucy-rainbow-edge-flare.webp",
        "spectral": "fx/lucy-spectral-band.webp",
        "refraction": "fx/lucy-refraction-arc.webp",
    }
    for name, source in fx_sources.items():
        hfx = rgba(V1 / source)
        pair_export(hfx, inverse(hfx), f"fx/lucy-{name}-{{state}}.webp", made, matrix)

    for relative, box in {
        "identity/lucy-state-icon-{state}.webp": (300, 355, 585, 650),
        "identity/lucy-wing-emblem-{state}.webp": (505, 205, 860, 610),
        "identity/lucy-divider-{state}.webp": (120, 510, 1000, 760),
    }.items():
        pair_export(heaven.crop(box), hell.crop(box), relative, made, matrix)
    webp(heaven.crop((330, 390, 505, 565)), OUT / "identity/lucy-heaven-diamond-eye.webp")
    webp(hell.crop((330, 390, 505, 600)), OUT / "identity/lucy-hell-red-tear.webp")
    made.extend(["identity/lucy-heaven-diamond-eye.webp", "identity/lucy-hell-red-tear.webp"])

    ultra_files = {
        "masters/lucy-ultra.webp": ultra,
        "hero/lucy-ultra-desktop-wide.webp": fit(ultra, (2560, 1080)),
        "states/lucy-ultra.webp": ultra,
        "states/panels/lucy-ultra-panel.webp": fit(ultra, (1024, 1280)),
        "portraits/lucy-ultra.webp": fit(ultra, (1024, 1024), "top"),
        "mobile/lucy-ultra-hero-1440x2560.webp": fit(ultra, (1440, 2560)),
        "identity/lucy-avatar-ultra.webp": fit(ultra, (512, 512), "top"),
        "components/wings/lucy-wing-ultra-pair.webp": ultra.crop((95, 170, 1015, 760)),
        "components/katana/lucy-katana-ultra-dual.webp": ultra.crop((0, 690, 980, 1220)),
    }
    ultra_bg = Image.new("RGBA", (2560, 1440), (11, 7, 22, 255))
    webp(ultra_bg, OUT / "backgrounds/lucy-bg-ultra-desktop.webp")
    made.append("backgrounds/lucy-bg-ultra-desktop.webp")
    for relative, image in ultra_files.items():
        webp(image, OUT / relative)
        made.append(relative)

    for state in ("heaven", "hell", "ultra"):
        if state == "ultra":
            assembly = {
                "version": "v3", "state": state,
                "master": "masters/lucy-ultra.webp",
                "components": [
                    "components/wings/lucy-wing-ultra-pair.webp",
                    "components/katana/lucy-katana-ultra-dual.webp",
                ],
            }
        else:
            assembly = {
                "version": "v3", "state": state,
                "master": f"masters/lucy-{state}.webp",
                "counterpart": f"masters/lucy-{'hell' if state == 'heaven' else 'heaven'}.webp",
                "hell_rule": "full foreground RGB complement including skin, except bounded two-eyes-plus-one-tear mask",
                "components": [
                    f"components/wings/lucy-wing-{state}-pair.webp",
                    f"components/ribbons/lucy-ribbon-{state}.webp",
                    f"components/shards/lucy-shard-cluster-{state}.webp",
                ],
            }
        path = OUT / f"assemblies/lucy-{state}-assembly.json"
        mkdir(path)
        path.write_text(json.dumps(assembly, indent=2) + "\n")
        made.append(str(path.relative_to(OUT)))

    manifest = {
        "version": "v3",
        "worker": "Sol Medium",
        "paid_generation_calls": 3,
        "accepted_raws": ["V3-HH-01", "V3-HH-02", "V3-ULTRA-01"],
        "rejected_raws": [],
        "replacement_calls": 0,
        "heaven_source": "V3-HH-01 accepted gpt-image-2 master",
        "hell_source": "exact registered Heaven inversion plus V3-HH-02 bounded face edit",
        "ultra_source": "V3-ULTRA-01 accepted gpt-image-2 master",
        "v1_v2_preserved": True,
        "pair_matrix": matrix,
        "outputs": sorted(made),
    }
    (OUT / "FINAL_ASSET_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Exported {len(made)} v3 WebP/JSON deliverables.")


if __name__ == "__main__":
    main()
