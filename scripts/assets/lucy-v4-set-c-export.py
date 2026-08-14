#!/usr/bin/env python3
"""Build the owner-approved Lucy v4 Set C front-page asset surface.

No model call happens here.  The v4 images supplied by gpt-image-2 arrived as
opaque checker previews, so ISNet Anime is used only as a local *proposed*
matte.  The resulting alpha is deliberately recorded as uncertified: owner
approval permits downstream composition, but does not turn that proposal into
a pristine-alpha guard pass.

The only writable production root is ``v4-approved/set-c``.  Reusable art is
listed by reference in the assembly manifest instead of copied into this set.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[2]
LUCY = ROOT / "packages/site/src/assets/lucy"
OUT = LUCY / "v4-approved/set-c"
WORK = ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/set-c-downstream"
MATTE = WORK / "matte-probe"
MANIFEST = OUT / "PROVENANCE_AND_ASSEMBLY_MANIFEST.json"

STATES = ("zero", "heaven", "hell", "ultra")
V4_INPUTS = {
    "heaven": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/heaven-C/raw/heaven-C-gpt-image-2.png",
    "hell": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/hell-source-C3/intermediate/hell-C-exact-inversion.png",
    "ultra": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/ultra-C/raw/ultra-C-gpt-image-2.png",
}
MATTE_INPUTS = {state: MATTE / f"lucy-{state}-C-isnet-anime.png" for state in V4_INPUTS}
BACKGROUND_INPUTS = {
    "zero": LUCY / "backgrounds/lucy-bg-zero-desktop.webp",
    "heaven": LUCY / "backgrounds/lucy-bg-heaven-desktop.webp",
    "hell": LUCY / "backgrounds/lucy-bg-hell-desktop.webp",
    "ultra": LUCY / "backgrounds/lucy-bg-ultra-desktop.webp",
}
ZERO = LUCY / "states/lucy-zero.webp"
NEUTRAL = LUCY / "models/lucy-neutral.webp"

# Body placement is intentionally re-authored for each responsive surface,
# not a crop of the desktop hero.  Coordinates are canvas fractions.
PLACEMENT = {
    "hero_desktop": {
        "heaven": (0.72, 0.52, 0.78), "ultra": (0.72, 0.51, 0.80),
    },
    "hero_mobile": {
        "heaven": (0.50, 0.49, 0.88), "ultra": (0.50, 0.45, 0.94),
    },
    "panel": {
        "zero": (0.52, 0.61, 0.76), "heaven": (0.53, 0.56, 0.82),
        "hell": (0.53, 0.56, 0.82), "ultra": (0.53, 0.55, 0.84),
    },
    "social": {
        "heaven": (0.70, 0.52, 0.88), "ultra": (0.69, 0.50, 0.92),
    },
}
PORTRAIT_CROPS = {
    "zero": (176, 80, 848, 842),
    "neutral": (0, 80, 692, 810),
    "heaven": (155, 25, 900, 820),
    "hell": (155, 30, 900, 820),
    "ultra": (120, 25, 910, 820),
}


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def open_rgba(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def save_webp(image: Image.Image, rel: str, *, lossless: bool = False) -> Path:
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", lossless=lossless, quality=94, method=6, exact=True)
    return target


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5)).convert("RGBA")


def alpha_place(subject: Image.Image, size: tuple[int, int], x: float, y: float, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    max_size = (max(1, int(size[0] * scale)), max(1, int(size[1] * scale)))
    copy = subject.copy()
    copy.thumbnail(max_size, Image.Resampling.LANCZOS)
    left, top = int(size[0] * x - copy.width / 2), int(size[1] * y - copy.height / 2)
    canvas.alpha_composite(copy, (left, top))
    return canvas


def vignette(size: tuple[int, int], color: tuple[int, int, int], opacity: int = 92) -> Image.Image:
    # A simple, deterministic treatment keeps copies readable without adding
    # new illustrated content or UI text.
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    pad = int(min(size) * 0.08)
    draw.rounded_rectangle((pad, pad, size[0] - pad, size[1] - pad), radius=pad, fill=opacity)
    mask = ImageOps.invert(mask.filter(ImageFilter.GaussianBlur(max(18, min(size) // 18))))
    layer = Image.new("RGBA", size, (*color, 0))
    layer.putalpha(mask)
    return layer


def composite(state: str, subject: Image.Image, size: tuple[int, int], placement: tuple[float, float, float]) -> Image.Image:
    background = fit(open_rgba(BACKGROUND_INPUTS[state]), size)
    # State plate is a copy-readable opaque export.  Candidate alpha is only a
    # local segmentation proposal; its guard status is retained in metadata.
    background.alpha_composite(vignette(size, (4, 9, 18) if state != "hell" else (255, 242, 247), 78))
    x, y, scale = placement
    background.alpha_composite(alpha_place(subject, size, x, y, scale))
    return background


def prepare_mattes() -> None:
    """Recreate the three recoverable local matte proposals, no paid call."""
    MATTE.mkdir(parents=True, exist_ok=True)
    for state, source in V4_INPUTS.items():
        target = MATTE_INPUTS[state]
        subprocess.run(
            ["pipx", "run", "--spec", "rembg[cpu,cli]", "rembg", "i", "-m", "isnet-anime", str(source), str(target)],
            check=True,
        )


def source_for(state: str) -> Image.Image:
    if state == "zero":
        return open_rgba(ZERO)
    return open_rgba(MATTE_INPUTS[state])


def alpha_status(state: str) -> str:
    return "VERIFIED_EXISTING_ALPHA" if state == "zero" else "OWNER_OVERRIDE_UNCERTIFIED_ISNET_ANIME_PROPOSAL"


def alpha_summary(image: Image.Image) -> dict[str, int]:
    alpha = image.getchannel("A")
    lo, hi = alpha.getextrema()
    return {"min": int(lo), "max": int(hi), "opaque_pixels": sum(1 for value in alpha.getdata() if value == 255)}


def review_workbench(outputs: list[Path]) -> dict[str, str]:
    """Create normal/dark sheets in ignored workbench for one-pass inspection."""
    review = WORK / "review"
    review.mkdir(parents=True, exist_ok=True)
    for theme, color in (("normal", (224, 231, 244, 255)), ("dark", (8, 10, 15, 255))):
        thumbs: list[Image.Image] = []
        for path in sorted(outputs):
            image = open_rgba(path)
            image.thumbnail((320, 240), Image.Resampling.LANCZOS)
            tile = Image.new("RGBA", (340, 280), color)
            tile.alpha_composite(image, ((340 - image.width) // 2, 20))
            thumbs.append(tile)
        sheet = Image.new("RGBA", (680, ((len(thumbs) + 1) // 2) * 280), color)
        for index, tile in enumerate(thumbs):
            sheet.alpha_composite(tile, ((index % 2) * 340, (index // 2) * 280))
        sheet.save(review / f"set-c-{theme}-composite-review.png")
    return {theme: relative(review / f"set-c-{theme}-composite-review.png") for theme in ("normal", "dark")}


def mechanical_check(outputs: list[Path]) -> dict[str, object]:
    """Re-open every production surface and fail closed on missing dimensions."""
    failures: list[str] = []
    expected = {
        "hero/lucy-ultra-primary-desktop-2560x1440.webp": (2560, 1440),
        "hero/lucy-heaven-alternate-desktop-2560x1440.webp": (2560, 1440),
        "heroes/lucy-ultra-primary-desktop.webp": (2560, 1440),
        "heroes/lucy-heaven-alternate-desktop.webp": (2560, 1440),
        "hero/lucy-ultra-primary-mobile-1080x1920.webp": (1080, 1920),
        "hero/lucy-heaven-alternate-mobile-1080x1920.webp": (1080, 1920),
        "social/lucy-og-1200x630.webp": (1200, 630),
        "social/lucy-square-1080x1080.webp": (1080, 1080),
        "social/lucy-portrait-1080x1350.webp": (1080, 1350),
        "social/lucy-story-1080x1920.webp": (1080, 1920),
    }
    for path in outputs:
        try:
            with Image.open(path) as image:
                image.load()
                if image.format != "WEBP":
                    failures.append(f"not WebP: {path.relative_to(OUT)}")
                required = expected.get(str(path.relative_to(OUT)))
                if required and image.size != required:
                    failures.append(f"wrong dimensions: {path.relative_to(OUT)} {image.size} != {required}")
        except Exception as exc:
            failures.append(f"unreadable: {path.relative_to(OUT)} ({exc})")
    pngs = [str(path.relative_to(OUT)) for path in OUT.rglob("*.png")]
    failures.extend(f"production PNG: {path}" for path in pngs)
    return {"status": "PASS" if not failures else "FAIL", "checked_webps": len(outputs), "production_pngs": len(pngs), "failures": failures}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare-mattes", action="store_true", help="rerun local ISNet Anime proposals from retained workbench sources")
    args = parser.parse_args()
    if args.prepare_mattes:
        prepare_mattes()
    missing = [str(path) for path in MATTE_INPUTS.values() if not path.exists()]
    if missing:
        raise SystemExit("missing matte proposals; rerun with --prepare-mattes:\n" + "\n".join(missing))

    outputs: list[Path] = []
    sources = {state: source_for(state) for state in STATES}

    # P0: canonical full-state webps and both desktop/mobile hero compositions.
    for state in STATES:
        outputs.append(save_webp(sources[state], f"states/lucy-{state}-full.webp", lossless=True))
    # Standard live-source locations are deliberately separate from candidate
    # previews.  They retain the same alpha disclosure in the manifest.
    for state in ("heaven", "hell", "ultra"):
        outputs.append(save_webp(sources[state], f"masters/lucy-{state}.webp", lossless=True))
    ultra_desktop = composite("ultra", sources["ultra"], (2560, 1440), PLACEMENT["hero_desktop"]["ultra"])
    heaven_desktop = composite("heaven", sources["heaven"], (2560, 1440), PLACEMENT["hero_desktop"]["heaven"])
    outputs.append(save_webp(ultra_desktop, "hero/lucy-ultra-primary-desktop-2560x1440.webp"))
    outputs.append(save_webp(heaven_desktop, "hero/lucy-heaven-alternate-desktop-2560x1440.webp"))
    outputs.append(save_webp(ultra_desktop, "heroes/lucy-ultra-primary-desktop.webp"))
    outputs.append(save_webp(heaven_desktop, "heroes/lucy-heaven-alternate-desktop.webp"))
    outputs.append(save_webp(composite("ultra", sources["ultra"], (1080, 1920), PLACEMENT["hero_mobile"]["ultra"]), "hero/lucy-ultra-primary-mobile-1080x1920.webp"))
    outputs.append(save_webp(composite("heaven", sources["heaven"], (1080, 1920), PLACEMENT["hero_mobile"]["heaven"]), "hero/lucy-heaven-alternate-mobile-1080x1920.webp"))

    # P1: matching runtime panels and square busts.
    for state in STATES:
        outputs.append(save_webp(composite(state, sources[state], (1024, 1280), PLACEMENT["panel"][state]), f"states/panels/lucy-{state}-panel-1024x1280.webp"))
    portrait_sources = {**sources, "neutral": open_rgba(NEUTRAL)}
    for state, source in portrait_sources.items():
        crop = source.crop(PORTRAIT_CROPS[state])
        outputs.append(save_webp(fit(crop, (1024, 1024)), f"portraits/lucy-{state}-bust-1024x1024.webp", lossless=(state in {"zero", "neutral"})))

    # P3: campaign exports are fresh opaque compositions, never a center crop.
    for rel, state, size, placement in (
        ("social/lucy-og-1200x630.webp", "ultra", (1200, 630), (0.71, 0.51, 0.90)),
        ("social/lucy-square-1080x1080.webp", "heaven", (1080, 1080), (0.54, 0.51, 0.87)),
        ("social/lucy-portrait-1080x1350.webp", "ultra", (1080, 1350), (0.52, 0.49, 0.92)),
        ("social/lucy-story-1080x1920.webp", "heaven", (1080, 1920), (0.50, 0.48, 0.90)),
    ):
        outputs.append(save_webp(composite(state, sources[state], size, placement), rel))

    reviews = review_workbench(outputs)
    mechanical = mechanical_check(outputs)
    if mechanical["failures"]:
        raise SystemExit("Set C mechanical export failure: " + "; ".join(mechanical["failures"]))
    reusable = {
        "backgrounds": {state: relative(path) for state, path in BACKGROUND_INPUTS.items()},
        "katana_authority_directory": relative(LUCY / "frontpage/katana-authority-v2"),
        "ribbons_directory": relative(LUCY / "components/ribbons"),
        "wings_directory": relative(LUCY / "components/wings"),
        "shards_directory": relative(LUCY / "components/shards"),
        "eyes_directory": relative(LUCY / "components/eyes"),
        "fx_directory": relative(LUCY / "fx"),
        "state_icons_directory": relative(LUCY / "identity"),
    }
    manifest = {
        "schema": "lucy-v4-approved-set-c/v1",
        "set": "C",
        "owner_approval": relative(ROOT / "docs/lucy/production/v4/V4_OWNER_APPROVAL.md"),
        "brief": relative(ROOT / "docs/lucy/authority/LUCY_FRONT_PAGE_CORE_ASSETS.md"),
        "candidate_manifest": relative(LUCY / "v4-candidates/CANDIDATE_MANIFEST.json"),
        "source_candidates": {
            "zero": {"path": relative(ZERO), "alpha_status": alpha_status("zero")},
            "heaven": {"candidate": "heaven-C", "raw": relative(V4_INPUTS["heaven"]), "matte": relative(MATTE_INPUTS["heaven"]), "alpha_status": alpha_status("heaven")},
            "hell": {"candidate": "hell-C", "exact_inversion_source": relative(V4_INPUTS["hell"]), "matte": relative(MATTE_INPUTS["hell"]), "alpha_status": alpha_status("hell"), "lineage": "full Heaven-palette source then exact full RGB inversion; no face patch or tear recolor"},
            "ultra": {"candidate": "ultra-C", "raw": relative(V4_INPUTS["ultra"]), "matte": relative(MATTE_INPUTS["ultra"]), "alpha_status": alpha_status("ultra")},
            "neutral": {"path": relative(NEUTRAL), "alpha_status": "VERIFIED_EXISTING_ALPHA"},
        },
        "local_matte_attempt": {
            "tool": "rembg isnet-anime through pipx",
            "command": "pipx run --spec rembg[cpu,cli] rembg i -m isnet-anime <source> <workbench-matte>",
            "status": "OWNER_OVERRIDE_UNCERTIFIED; candidate hard matte guards remain failed and visible",
        },
        "reusable_asset_references": reusable,
        "brief_coverage": {
            "P0": ["states/lucy-*-full.webp", "hero/lucy-ultra-primary-desktop-2560x1440.webp", "hero/lucy-heaven-alternate-desktop-2560x1440.webp", "hero/*-mobile-1080x1920.webp"],
            "P1": ["states/panels/lucy-*-panel-1024x1280.webp", "portraits/lucy-*-bust-1024x1024.webp", "reusable_asset_references"],
            "P2": ["reusable_asset_references.backgrounds", "reusable_asset_references.fx_directory", "reusable_asset_references.state_icons_directory"],
            "P3": ["social/lucy-og-1200x630.webp", "social/lucy-square-1080x1080.webp", "social/lucy-portrait-1080x1350.webp", "social/lucy-story-1080x1920.webp"],
        },
        "responsive_authoring": "mobile heroes and story each use independent canvas dimensions, placements, scale and state background rather than center-cropping desktop heroes",
        "outputs": [
            {"path": str(path.relative_to(OUT)), "dimensions": list(Image.open(path).size), "alpha": "A" in Image.open(path).getbands()}
            for path in sorted(outputs)
        ],
        "source_alpha_observation": {state: alpha_summary(sources[state]) for state in STATES},
        "review_workbench": reviews,
        "production_pngs": 0,
        "self_review": {
            "normal_and_dark_composites": {
                "status": "REVIEWED_ONCE_WITH_KNOWN_ALPHA_GAP",
                "all_final_surfaces": len(outputs),
                "observation": "opaque hero, panel, and social plates remain visually readable; light-composite alpha surfaces expose model-assisted smoke/halo, strongest around Hell shards and hair. This is recorded, not corrected or relabeled as a guard pass.",
            },
            "mechanical_reopen_and_dimension_check": mechanical,
            "guard_status": "OWNER_APPROVED_VISUALS; NO_PRISTINE_ALPHA_GUARD_PASS_CLAIM",
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Set C exported {len(outputs)} WebPs to {OUT}")


if __name__ == "__main__":
    main()
