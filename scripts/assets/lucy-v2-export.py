#!/usr/bin/env python3
"""Deterministically promote the accepted v2 Lucy masters and linked pairs.

No image model is called here.  Hell is an RGB complement of Heaven except
inside the recorded 315x275 eye/tear edit mask; all pair geometry stays
registered. V1 assets are only re-exported as explicit FX source geometry.
"""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "packages/site/assets/workbench/lucy"
OUT = ROOT / "packages/site/src/assets/lucy/v2"
V1 = ROOT / "packages/site/src/assets/lucy"
H_DIR = WORK / "V2-HH-01/intermediate"
F_DIR = WORK / "V2-HH-02"
U_DIR = WORK / "V2-ULTRA-01"


def mkdir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def png(image: Image.Image, path: Path) -> None:
    mkdir(path)
    image.save(path, "PNG")


def webp(image: Image.Image, path: Path) -> None:
    mkdir(path)
    image.save(path, "WEBP", lossless=True, method=6, exact=True)


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def inverse(image: Image.Image) -> Image.Image:
    a = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    fg = a[:, :, 3] > 0
    a[fg, :3] = 255 - a[fg, :3]
    a[~fg, :3] = 0
    return Image.fromarray(a, "RGBA")


def chroma_alpha(image: Image.Image) -> Image.Image:
    """Fractional known-green matte with straight-RGB recovery and narrow despill."""
    a = np.asarray(image.convert("RGBA"), dtype=np.float32)
    rgb = a[:, :, :3]
    dist = np.sqrt(rgb[:, :, 0] ** 2 + (rgb[:, :, 1] - 255) ** 2 + rgb[:, :, 2] ** 2)
    alpha = np.clip((dist - 18) / 152, 0, 1)
    # The requested field is pure green and has no role in Ultra's rendering.
    bg = (rgb[:, :, 1] > 170) & (rgb[:, :, 1] > rgb[:, :, 0] * 1.65 + 56) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.65 + 56)
    alpha[bg] = 0
    partial = (alpha > 0) & (alpha < 1)
    for channel, key in enumerate((0, 255, 0)):
        rgb[:, :, channel][partial] = np.clip((rgb[:, :, channel][partial] - (1 - alpha[partial]) * key) / alpha[partial], 0, 255)
    # Only exterior-connected partial-alpha pixels are despilled. Interior gold,
    # cyan and pink remain untouched.
    zero = alpha == 0
    exterior = zero.copy()
    for _ in range(3):
        n = exterior.copy()
        n[1:] |= exterior[:-1]; n[:-1] |= exterior[1:]
        n[:, 1:] |= exterior[:, :-1]; n[:, :-1] |= exterior[:, 1:]
        exterior = n
    band = exterior & (alpha > 0) & (alpha < 1)
    max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = band & (rgb[:, :, 1] > max_rb + 8)
    rgb[:, :, 1][spill] = max_rb[spill]
    out = np.dstack((rgb, np.round(alpha * 255))).astype(np.uint8)
    out[out[:, :, 3] == 0, :3] = 0
    return Image.fromarray(out, "RGBA")


def fit(image: Image.Image, size: tuple[int, int], position: str = "center") -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - copy.width) // 2
    y = 0 if position == "top" else (size[1] - copy.height) // 2
    canvas.alpha_composite(copy, (x, y))
    return canvas


def crop(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return image.crop(box)


def pair_export(heaven: Image.Image, hell: Image.Image, relative: str, made: list[str], matrix: dict, size: tuple[int, int] | None = None, position: str = "center") -> None:
    h, x = (fit(heaven, size, position), fit(hell, size, position)) if size else (heaven, hell)
    hp = OUT / relative.format(state="heaven")
    xp = OUT / relative.format(state="hell")
    webp(h, hp); webp(x, xp)
    made.extend([str(hp.relative_to(OUT)), str(xp.relative_to(OUT))])
    matrix[relative] = {"heaven": str(hp.relative_to(OUT)), "hell": str(xp.relative_to(OUT)), "size": list(h.size), "position": position}


def eye_tear_mask(size: tuple[int, int]) -> Image.Image:
    scale = 4
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    d = ImageDraw.Draw(mask)
    # These masks deliberately cover only the existing two iris/eyelid regions
    # and one narrow screen-left tear corridor in the fixed crop.
    d.ellipse((61*scale, 101*scale, 132*scale, 158*scale), fill=255)
    d.ellipse((128*scale, 104*scale, 198*scale, 160*scale), fill=255)
    d.polygon([(99*scale, 132*scale), (124*scale, 132*scale), (129*scale, 184*scale), (120*scale, 207*scale), (110*scale, 184*scale)], fill=255)
    return mask.resize(size, Image.Resampling.LANCZOS)


def face_edit(hell_base: Image.Image) -> tuple[Image.Image, Image.Image]:
    source_box = (315, 385, 630, 660)
    patch = rgba(F_DIR / "raw/hell-face-gpt-image-2-raw.png").convert("RGB").resize((315, 275), Image.Resampling.LANCZOS)
    local_mask = eye_tear_mask((315, 275))
    result = hell_base.copy()
    layer = result.crop(source_box)
    layer_rgb = layer.convert("RGB")
    layer_rgb.paste(patch, (0, 0), local_mask)
    # Alpha is copied from the deterministic inversion, never model supplied.
    result.paste(Image.merge("RGBA", (*layer_rgb.split(), layer.getchannel("A"))), source_box)
    full = Image.new("L", result.size, 0)
    full.paste(local_mask, source_box[:2])
    return result, full


def background_pair() -> tuple[Image.Image, Image.Image]:
    w, h = 2560, 1440
    yy, xx = np.ogrid[:h, :w]
    r = np.sqrt(((xx - w * .68) / w) ** 2 + ((yy - h * .45) / h) ** 2)
    s = np.clip(1 - r / .85, 0, 1)
    base = np.zeros((h, w, 4), dtype=np.uint8)
    base[:, :, 0] = 5 + 13 * s
    base[:, :, 1] = 13 + 50 * s
    base[:, :, 2] = 31 + 90 * s
    base[:, :, 3] = 255
    heaven = Image.fromarray(base, "RGBA")
    hell = inverse(heaven)
    return heaven, hell


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    heaven = rgba(H_DIR / "heaven-accepted-alpha.png")
    hell_base = rgba(H_DIR / "hell-registered-base.png")
    hell, full_mask = face_edit(hell_base)
    ultra = chroma_alpha(rgba(U_DIR / "raw/ultra-gpt-image-2-raw.png"))
    png(hell, F_DIR / "intermediate/hell-final-alpha.png")
    png(full_mask, F_DIR / "intermediate/hell-eye-tear-mask.png")
    png(ultra, U_DIR / "intermediate/ultra-alpha.png")

    made: list[str] = []
    matrix: dict = {}
    # Exact registered Heaven/Hell output families.
    for rel, size, position in [
        ("masters/lucy-{state}.webp", None, "center"),
        ("hero/lucy-{state}-desktop-wide.webp", (2560, 1080), "center"),
        ("states/lucy-{state}.webp", None, "center"),
        ("states/panels/lucy-{state}-panel.webp", (1024, 1280), "center"),
        ("portraits/lucy-{state}.webp", (1024, 1024), "top"),
        ("mobile/lucy-{state}-hero-1440x2560.webp", (1440, 2560), "center"),
        ("identity/lucy-avatar-{state}.webp", (512, 512), "top"),
    ]:
        pair_export(heaven, hell, rel, made, matrix, size, position)
    white = Image.new("RGBA", hell.size, (255, 255, 255, 255)); white.alpha_composite(hell)
    webp(white, OUT / "states/lucy-hell-white.webp"); made.append("states/lucy-hell-white.webp")

    bh, bx = background_pair()
    pair_export(bh, bx, "backgrounds/lucy-bg-{state}-desktop.webp", made, matrix)

    # Crops are registered components from the accepted paired master.  They
    # remain usefully composable without claiming unflattened source layers.
    components = {
        "wings/lucy-wing-{state}-left.webp": (110, 420, 580, 930),
        "wings/lucy-wing-{state}-right.webp": (535, 260, 1015, 900),
        "ribbons/lucy-ribbon-{state}.webp": (165, 585, 515, 785),
        "shards/lucy-shard-cluster-{state}.webp": (500, 210, 1000, 940),
    }
    for rel, box in components.items(): pair_export(crop(heaven, box), crop(hell, box), f"components/{rel}", made, matrix)
    # Pair component made from the two matching side crops in one local canvas.
    for state, master in [("heaven", heaven), ("hell", hell)]:
        left, right = crop(master, (110,420,580,930)), crop(master, (535,260,1015,900))
        pair = Image.new("RGBA", (1060, 640), (0,0,0,0)); pair.alpha_composite(left, (0, 130)); pair.alpha_composite(right, (580, 0))
        webp(pair, OUT / f"components/wings/lucy-wing-{state}-pair.webp")
        made.append(f"components/wings/lucy-wing-{state}-pair.webp")
    matrix["components/wings/lucy-wing-{state}-pair.webp"] = {"heaven": "components/wings/lucy-wing-heaven-pair.webp", "hell": "components/wings/lucy-wing-hell-pair.webp", "size": [1060,640], "position": "registered side crop assembly"}
    shard_boxes = [(660,270,755,420),(760,225,865,410),(850,180,990,430),(585,510,685,665),(700,510,815,690),(850,470,980,700)]
    for i, box in enumerate(shard_boxes, 1): pair_export(crop(heaven, box), crop(hell, box), f"components/shards/lucy-shard-{i:02d}-{{state}}.webp", made, matrix)

    # Re-export v1 Heaven-only FX geometry only where it was already accepted;
    # each Hell FX is a deterministic inversion with identical alpha and bounds.
    fx_sources = {
        "particles": "fx/lucy-particles-cyan.webp", "caustic": "fx/lucy-caustics-cyan.webp",
        "aura": "fx/lucy-aura-heaven.webp", "dust": "fx/lucy-glass-dust-cyan.webp",
        "trail": "fx/lucy-shard-trail-cyan.webp", "fragment": "fx/lucy-micro-shards.webp",
        "streak": "fx/lucy-light-streaks.webp", "reflection": "fx/lucy-glass-reflection.webp",
        "flare": "fx/lucy-rainbow-edge-flare.webp", "spectral": "fx/lucy-spectral-band.webp",
        "refraction": "fx/lucy-refraction-arc.webp",
    }
    for name, source in fx_sources.items():
        hfx = rgba(V1 / source); xfx = inverse(hfx)
        pair_export(hfx, xfx, f"fx/lucy-{name}-{{state}}.webp", made, matrix)

    # Small derived identity marks stay geometrically paired too.
    for rel, box in {
        "identity/lucy-state-icon-{state}.webp": (340,410,610,680),
        "identity/lucy-wing-emblem-{state}.webp": (535,260,850,610),
        "identity/lucy-divider-{state}.webp": (120,560,965,780),
    }.items(): pair_export(crop(heaven, box), crop(hell, box), rel, made, matrix)
    webp(crop(heaven, (350,445,500,560)), OUT / "identity/lucy-heaven-diamond-eye.webp"); made.append("identity/lucy-heaven-diamond-eye.webp")
    webp(crop(hell, (375,465,485,600)), OUT / "identity/lucy-hell-red-tear.webp"); made.append("identity/lucy-hell-red-tear.webp")

    # Ultra is a separate new master: no pair claim is made against Heaven/Hell.
    ultra_files = {
        "masters/lucy-ultra.webp": ultra,
        "hero/lucy-ultra-desktop-wide.webp": fit(ultra, (2560,1080)),
        "states/lucy-ultra.webp": ultra,
        "states/panels/lucy-ultra-panel.webp": fit(ultra, (1024,1280)),
        "portraits/lucy-ultra.webp": fit(ultra, (1024,1024), "top"),
        "mobile/lucy-ultra-hero-1440x2560.webp": fit(ultra, (1440,2560)),
        "identity/lucy-avatar-ultra.webp": fit(ultra, (512,512), "top"),
        "components/wings/lucy-wing-ultra-pair.webp": crop(ultra, (30,160,1000,830)),
        "components/katana/lucy-katana-ultra-dual.webp": crop(ultra, (0,700,1024,1536)),
    }
    ubg = Image.new("RGBA", (2560,1440), (11,7,22,255)); webp(ubg, OUT / "backgrounds/lucy-bg-ultra-desktop.webp"); made.append("backgrounds/lucy-bg-ultra-desktop.webp")
    for rel, image in ultra_files.items(): webp(image, OUT / rel); made.append(rel)

    assembly = {
        "version": "v2", "state": "heaven", "master": "masters/lucy-heaven.webp",
        "counterpart": "masters/lucy-hell.webp", "hell_rule": "exact registered foreground RGB inversion except eyes-plus-one-tear mask",
        "face_mask": "workbench/lucy/V2-HH-02/intermediate/hell-eye-tear-mask.png (ignored)",
        "components": ["components/wings/lucy-wing-heaven-pair.webp", "components/ribbons/lucy-ribbon-heaven.webp", "components/shards/lucy-shard-cluster-heaven.webp"],
    }
    for state in ("heaven", "hell", "ultra"):
        data = dict(assembly); data["state"] = state
        if state == "ultra": data = {"version":"v2","state":"ultra","master":"masters/lucy-ultra.webp","components":["components/wings/lucy-wing-ultra-pair.webp","components/katana/lucy-katana-ultra-dual.webp"]}
        p = OUT / f"assemblies/lucy-{state}-assembly.json"; mkdir(p); p.write_text(json.dumps(data, indent=2) + "\n"); made.append(str(p.relative_to(OUT)))
    manifest = {
        "version": "v2", "paid_generation_calls": 3,
        "heaven_source": "V2-HH-01 accepted original gpt-image-2 master", "hell_source": "registered exact inversion + V2-HH-02 bounded face mask", "ultra_source": "V2-ULTRA-01 original gpt-image-2 master",
        "v1_preserved": True, "pair_matrix": matrix, "outputs": sorted(made),
    }
    p = OUT / "FINAL_ASSET_MANIFEST.json"; p.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Exported {len(made)} WebP/JSON v2 deliverables.")


if __name__ == "__main__":
    main()
