#!/usr/bin/env python3
"""Materialize Lucy front-page Variation A without modifying character pixels.

This exporter has one generated input: the opaque FRONTPAGE-A atmosphere atlas.
All Lucy-bearing outputs are direct re-exports or composites of accepted v2
masters (or the validated v1 Zero/neutral sources).  Hell uses only the
registered v2 Hell output; no inversion, mask, or character edit occurs here.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/frontpage/variation-a"
LUCY = ROOT / "packages/site/src/assets/lucy"
ATLAS = ROOT / "packages/site/assets/workbench/lucy/FRONTPAGE-A/raw/heaven-ascension-atlas-gpt-image-2-raw.png"


def open_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save_webp(image: Image.Image, rel: str) -> Path:
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", lossless=True, method=6, exact=True)
    return target


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def transparent_fit(image: Image.Image, size: tuple[int, int], scale: float = 0.92) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    box = (max(1, int(size[0] * scale)), max(1, int(size[1] * scale)))
    copy = image.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    canvas.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def opaque_atlas_crop(atlas: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    return fit(atlas.crop(box).convert("RGBA"), size).convert("RGBA")


def inverse_opaque(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    return ImageOps.invert(rgb).convert("RGBA")


def composite(bg: Image.Image, subject: Image.Image, size: tuple[int, int], scale: float) -> Image.Image:
    canvas = fit(bg, size).convert("RGBA")
    canvas.alpha_composite(transparent_fit(subject, size, scale))
    return canvas


def source(state: str) -> Path:
    return {
        "zero": LUCY / "states/lucy-zero.webp",
        "heaven": LUCY / "v2/masters/lucy-heaven.webp",
        "hell": LUCY / "v2/masters/lucy-hell.webp",
        "ultra": LUCY / "v2/masters/lucy-ultra.webp",
        "neutral": LUCY / "models/lucy-neutral.webp",
    }[state]


def export_copy(src: Path, rel: str, size: tuple[int, int] | None = None, alpha: bool = True) -> None:
    image = open_rgba(src)
    if size:
        image = transparent_fit(image, size) if alpha else fit(image, size)
    save_webp(image, rel)


def main() -> None:
    if not ATLAS.exists():
        raise SystemExit(f"missing one-shot atlas: {ATLAS}")
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = open_rgba(ATLAS)
    w, h = atlas.size
    # Fixed crop coordinates are a deterministic, non-visual layout contract.
    # Hell is deliberately calculated as an exact RGB inverse of Heaven here.
    heaven_bg = opaque_atlas_crop(atlas, (0, 0, w // 2, h // 2), (2560, 1440))
    ultra_bg = opaque_atlas_crop(atlas, (w // 2, 0, w, h // 2), (2560, 1440))
    zero_bg = opaque_atlas_crop(atlas, (0, h // 2, w // 3, h), (2560, 1440))
    hell_bg = inverse_opaque(heaven_bg)
    backgrounds = {"zero": zero_bg, "heaven": heaven_bg, "hell": hell_bg, "ultra": ultra_bg}
    for state, image in backgrounds.items():
        save_webp(image, f"backgrounds/lucy-{state}-2560x1440.webp")

    # P0: transparent accepted character references and state/panel exports.
    for state in ("zero", "heaven", "hell", "ultra"):
        export_copy(source(state), f"states/lucy-{state}.webp")
        panel_source = LUCY / (f"v2/states/panels/lucy-{state}-panel.webp" if state != "zero" else "states/panels/lucy-zero-panel.webp")
        export_copy(panel_source, f"states/panels/lucy-{state}-panel.webp", (1024, 1280))
    export_copy(source("heaven"), "hero/lucy-primary.webp")
    export_copy(source("ultra"), "hero/lucy-alternate.webp")
    save_webp(composite(heaven_bg, open_rgba(source("heaven")), (2560, 1080), 0.94), "hero/lucy-primary-desktop-2560x1080.webp")
    save_webp(composite(ultra_bg, open_rgba(source("ultra")), (2560, 1080), 0.94), "hero/lucy-alternate-desktop-2560x1080.webp")
    save_webp(composite(heaven_bg, open_rgba(source("heaven")), (1440, 2560), 0.89), "hero/lucy-primary-mobile-1440x2560.webp")
    save_webp(composite(ultra_bg, open_rgba(source("ultra")), (1440, 2560), 0.89), "hero/lucy-alternate-mobile-1440x2560.webp")

    # P1: portraits, expressions and eyes are namespaced re-exports.
    for state in ("neutral", "zero", "heaven", "hell", "ultra"):
        portrait = LUCY / (f"v2/portraits/lucy-{state}.webp" if state in {"heaven", "hell", "ultra"} else ("portraits/lucy-neutral.webp" if state == "neutral" else "portraits/lucy-zero.webp"))
        export_copy(portrait, f"portraits/lucy-{state}.webp", (1024, 1024))
    for path in sorted((LUCY / "components/expressions").glob("*.webp")):
        export_copy(path, f"components/expressions/{path.name}")
    for path in sorted((LUCY / "components/eyes").glob("*.webp")):
        export_copy(path, f"components/eyes/{path.name}")

    # Eight usable ribbon files: canonical state ribbons plus airflow variants.
    ribbon_sources = [
        LUCY / "components/ribbons/lucy-ribbon-zero.webp",
        LUCY / "v2/components/ribbons/lucy-ribbon-heaven.webp",
        LUCY / "v2/components/ribbons/lucy-ribbon-hell.webp",
        LUCY / "components/ribbons/lucy-ribbon-ultra.webp",
        *sorted((LUCY / "components/ribbons").glob("lucy-ribbon-airflow-*.webp")),
    ]
    for path in ribbon_sources:
        export_copy(path, f"components/ribbons/{path.name}")
    # Six state wing sides and three assembled pairs; all are established exports.
    for state in ("heaven", "hell", "ultra"):
        for side in ("left", "right", "pair"):
            candidate = LUCY / f"v2/components/wings/lucy-wing-{state}-{side}.webp"
            if not candidate.exists():
                candidate = LUCY / f"components/wings/lucy-wing-{state}-{side}.webp"
            export_copy(candidate, f"components/wings/lucy-wing-{state}-{side}.webp")
    for path in sorted((LUCY / "components/shards").glob("lucy-shard-[0-9][0-9].webp")):
        export_copy(path, f"components/shards/{path.name}")
    for state in ("heaven", "hell", "ultra"):
        candidate = LUCY / f"v2/components/shards/lucy-shard-cluster-{state}.webp"
        if not candidate.exists():
            candidate = LUCY / f"components/shards/lucy-shard-cluster-{state}.webp"
        export_copy(candidate, f"components/shards/lucy-shard-cluster-{state}.webp")
    for path in sorted((LUCY / "components/katana").glob("*.webp")):
        export_copy(path, f"components/katana/{path.name}")

    # P2: atlas-derived effects only; no output below uses atlas pixels on Lucy.
    zones = {
        "cyan-caustic": (0, h // 2, w // 3, h),
        "gold-caustic": (w // 3, h // 2, 2 * w // 3, h),
        "prismatic-ribbon-sweep": (2 * w // 3, h // 2, w, h),
        "shard-band": (0, h // 3, w // 2, 2 * h // 3),
        "spectral-particles": (w // 2, h // 3, w, 2 * h // 3),
        "divider-arc": (w // 4, h // 2, 3 * w // 4, h),
    }
    for name, box in zones.items():
        save_webp(opaque_atlas_crop(atlas, box, (1200, 300)), f"fx/atlas-{name}.webp")
    for path in sorted((LUCY / "fx").glob("*.webp")):
        export_copy(path, f"fx/reused-{path.name}")
    for state in ("zero", "heaven", "hell", "ultra"):
        divider = LUCY / (f"v2/identity/lucy-divider-{state}.webp" if state in {"heaven", "hell"} else f"identity/lucy-divider-{state}.webp")
        export_copy(divider, f"identity/lucy-divider-{state}.webp")
        icon = LUCY / (f"v2/identity/lucy-state-icon-{state}.webp" if state in {"heaven", "hell"} else f"identity/lucy-state-icon-{state}.webp")
        export_copy(icon, f"identity/lucy-state-icon-{state}.webp")
    motif_sources = {
        "lucy-diamond-eye.webp": LUCY / "identity/lucy-diamond-eye.webp",
        "lucy-red-tear.webp": LUCY / "identity/lucy-red-tear.webp",
        "lucy-wing-emblem-heaven.webp": LUCY / "v2/identity/lucy-wing-emblem-heaven.webp",
        "lucy-wing-emblem-hell.webp": LUCY / "v2/identity/lucy-wing-emblem-hell.webp",
        "lucy-wing-emblem-ultra.webp": LUCY / "identity/lucy-wing-ultra.webp",
    }
    for name, path in motif_sources.items():
        export_copy(path, f"identity/{name}")
    for path in sorted((LUCY / "identity").glob("*.svg")):
        target = OUT / "identity" / path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    export_copy(LUCY / "identity/lucy-avatar-zero.webp", "identity/lucy-avatar-neutral.webp")
    export_copy(LUCY / "v2/identity/lucy-avatar-heaven.webp", "identity/lucy-avatar-heaven.webp")
    export_copy(LUCY / "identity/lucy-horizontal-header.webp", "identity/lucy-horizontal-header.webp")

    # P3 campaign crops use the approved Heaven primary. They are composites,
    # not new character illustrations.
    heaven = open_rgba(source("heaven"))
    for rel, size, scale in [
        ("social/lucy-og-1200x630.webp", (1200, 630), 0.90),
        ("social/lucy-square-1080.webp", (1080, 1080), 0.88),
        ("social/lucy-portrait-1080x1350.webp", (1080, 1350), 0.88),
        ("social/lucy-story-1080x1920.webp", (1080, 1920), 0.86),
    ]:
        save_webp(composite(heaven_bg, heaven, size, scale), rel)

    hair_inventory = {
        "state": "unavailable-as-isolated-layers",
        "reason": "Accepted masters are flattened character compositions; no isolated hair source may be fabricated.",
        "available_character_masters": {state: str(source(state).relative_to(ROOT)) for state in ("zero", "heaven", "hell", "ultra", "neutral")},
    }
    (OUT / "components/hair").mkdir(parents=True, exist_ok=True)
    (OUT / "components/hair/INVENTORY.json").write_text(json.dumps(hair_inventory, indent=2) + "\n")
    gaps = {
        "unavailable": [
            {"asset": "isolated hair layers", "reason": "flattened approved masters only; not fabricated"},
            {"asset": "sheathed katana", "reason": "no approved isolated source"},
            {"asset": "saya", "reason": "no approved isolated source"},
        ]
    }
    (OUT / "SOURCE_GAPS.json").write_text(json.dumps(gaps, indent=2) + "\n")
    outputs = sorted(str(path.relative_to(OUT)) for path in OUT.rglob("*") if path.is_file() and path.name not in {"ASSET_MANIFEST.json"})
    manifest = {
        "variation": "A — Heaven Ascension",
        "paid_generation": {"model": "gpt-image-2", "calls": 1, "raw_atlas": str(ATLAS.relative_to(ROOT))},
        "character_policy": "All Lucy-bearing outputs are direct accepted-master re-exports or non-destructive alpha composites. No character pixel is generated, inverted, recolored, masked, or regenerated in this exporter.",
        "hell_registration": "v2/masters/lucy-hell.webp is reused as-is; its registered Heaven complement relationship is not changed.",
        "outputs": outputs,
        "source_gaps": "SOURCE_GAPS.json",
    }
    (OUT / "ASSET_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Variation A exported {len(outputs)} production files.")


if __name__ == "__main__":
    main()
