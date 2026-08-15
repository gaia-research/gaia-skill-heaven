#!/usr/bin/env python3
"""Build the owner-approved Lucy v4 Set A desktop-first front-page pack.

This is deliberately a deterministic derivative exporter: it never calls an
image model and it never overwrites an older variation.  V4 source candidates
were owner-approved as visual compositions but their automated alpha gates
remain failed.  When an exploratory local matte is available it is used only
as an explicitly unverified extraction; every resulting WebP and manifest
retains that fact.  Otherwise the source is preserved as an opaque preview
plate rather than pretending it has transparency.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/v4-approved/set-a"
WB = ROOT / "packages/site/assets/workbench/lucy/V4-SET-A"
LUCY = ROOT / "packages/site/src/assets/lucy"
MANIFEST = LUCY / "v4-candidates/CANDIDATE_MANIFEST.json"

SOURCES = {
    "zero": LUCY / "states/lucy-zero.webp",
    "neutral": LUCY / "models/lucy-neutral.webp",
    "heaven": WB / "matte/heaven-A-guarded.png",
    "hell": WB / "matte/hell-A-guarded.png",
    "ultra": WB / "matte/ultra-A-guarded.png",
}
FALLBACKS = {
    "heaven": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/heaven-A/raw/heaven-A-gpt-image-2.png",
    "hell": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/hell-source-A3/intermediate/hell-A-exact-inversion.png",
    "ultra": ROOT / "packages/site/assets/workbench/lucy/V4-CANDIDATES/ultra-A/raw/ultra-A-gpt-image-2.png",
}
BACKGROUND = {s: LUCY / f"backgrounds/lucy-bg-{s}-desktop.webp" for s in ("zero", "heaven", "hell", "ultra")}
MATTE_REPORTS = {
    "heaven": WB / "audit/heaven/guard.json",
    "hell": WB / "audit/hell/guard.json",
    "ultra": WB / "audit/ultra/guard.json",
}


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(im: Image.Image, relative: str, lossless: bool = False) -> Path:
    path = OUT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", lossless=lossless, quality=93, method=6, exact=True)
    return path


def fit(im: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(im, size, Image.Resampling.LANCZOS, centering=centering).convert("RGBA")


def alpha_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    alpha = im.getchannel("A")
    box = alpha.getbbox()
    return box or (0, 0, im.width, im.height)


def place(im: Image.Image, size: tuple[int, int], scale: float, x: float = 0.5, y: float = 0.5) -> Image.Image:
    """Place the whole subject, preserving a distinct authored position."""
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    subject = im.copy()
    subject.thumbnail((max(1, int(size[0] * scale)), max(1, int(size[1] * scale))), Image.Resampling.LANCZOS)
    px = int(size[0] * x - subject.width * 0.5)
    py = int(size[1] * y - subject.height * 0.5)
    canvas.alpha_composite(subject, (px, py))
    return canvas


def soft_overlay(size: tuple[int, int], state: str) -> Image.Image:
    colors = {
        "zero": (5, 13, 33, 150), "heaven": (46, 155, 255, 108),
        "hell": (242, 39, 108, 95), "ultra": (255, 192, 62, 106),
    }
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    c = colors[state]
    draw.ellipse((-size[0] // 4, -size[1] // 3, size[0] * 3 // 4, size[1] * 3 // 4), fill=c)
    return layer.filter(ImageFilter.GaussianBlur(max(8, size[0] // 20)))


def background(state: str, size: tuple[int, int], *, mobile: bool = False) -> Image.Image:
    base = fit(rgba(BACKGROUND[state]), size, (0.5, 0.46 if mobile else 0.5))
    if mobile:
        # A deliberate vertical composition, not a centered crop of desktop.
        veil = Image.new("RGBA", size, (5, 10, 28, 0))
        px = veil.load()
        for yy in range(size[1]):
            a = int(188 * (yy / max(1, size[1] - 1)) ** 1.5)
            for xx in range(size[0]):
                px[xx, yy] = (5, 10, 28, a)
        base.alpha_composite(veil)
    base.alpha_composite(soft_overlay(size, state))
    return base


def source_for(state: str) -> tuple[Image.Image, dict[str, Any]]:
    if state in ("zero", "neutral"):
        return rgba(SOURCES[state]), {"mode": "established-alpha", "guard": "not re-evaluated in Set A"}
    probe = SOURCES[state]
    fallback = FALLBACKS[state]
    report: dict[str, Any] = {}
    if MATTE_REPORTS[state].exists():
        report = json.loads(MATTE_REPORTS[state].read_text())
    if probe.exists():
        im = rgba(probe)
        alpha = im.getchannel("A")
        transparent = sum(alpha.histogram()[:250])
        if transparent > max(1000, im.width * im.height // 100):
            return im, {
                "mode": "owner-approved-preview + local-birefnet-general-extraction",
                "local_extraction_guard": "PASS" if report.get("pass") else "FAIL",
                "candidate_raw_guard": "FAILED_BEFORE_OWNER_OVERRIDE",
                "source": str(probe.relative_to(ROOT)),
                "fallback": str(fallback.relative_to(ROOT)),
                "local_guard_report": str(MATTE_REPORTS[state].relative_to(ROOT)),
            }
    return rgba(fallback), {
        "mode": "owner-approved-opaque-preview",
        "local_extraction_guard": "NOT_AVAILABLE",
        "candidate_raw_guard": "FAILED_BEFORE_OWNER_OVERRIDE",
        "source": str(fallback.relative_to(ROOT)),
    }


def composite(state: str, subject: Image.Image, size: tuple[int, int], scale: float, x: float, y: float, mobile: bool = False) -> Image.Image:
    canvas = background(state, size, mobile=mobile)
    canvas.alpha_composite(place(subject, size, scale, x, y))
    # Reuse existing state FX at exact referenced sources in the manifest. The
    # subtle overlay avoids duplicating modular assets into the set directory.
    fx_name = {
        "zero": "lucy-particles-cyan.webp", "heaven": "lucy-aura-heaven.webp",
        "hell": "lucy-aura-hell.webp", "ultra": "lucy-aura-ultra.webp",
    }[state]
    fx_path = LUCY / "fx" / fx_name
    if fx_path.exists():
        fx = place(rgba(fx_path), size, 1.12, 0.5, 0.5)
        canvas.alpha_composite(fx)
    return canvas


def portrait(state: str, subject: Image.Image) -> Image.Image:
    box = alpha_bbox(subject)
    left, top, right, bottom = box
    # Bust framing takes the top 57% of the detected subject; this is distinct
    # from the full-state panel and avoids a generic square resize.
    crop_bottom = top + max(1, int((bottom - top) * 0.57))
    crop = subject.crop((left, top, right, min(bottom, crop_bottom)))
    plate = background(state if state != "neutral" else "zero", (1024, 1024))
    plate.alpha_composite(place(crop, (1024, 1024), 0.85, 0.5, 0.58))
    return plate


def panel(state: str, subject: Image.Image) -> Image.Image:
    canvas = composite(state, subject, (1024, 1280), 0.86, 0.52, 0.52)
    # Intentional lower vignette creates room for site-side title/copy overlay.
    shade = Image.new("RGBA", canvas.size, (3, 8, 20, 0))
    draw = ImageDraw.Draw(shade)
    draw.rectangle((0, int(canvas.height * .72), canvas.width, canvas.height), fill=(3, 8, 20, 118))
    canvas.alpha_composite(shade.filter(ImageFilter.GaussianBlur(28)))
    return canvas


def mobile_hero(state: str, subject: Image.Image, *, x: float, y: float, scale: float) -> Image.Image:
    # Separate portrait assembly: background vertical emphasis, upper negative
    # space, and a lower body anchor are all intentional mobile choices.
    canvas = composite(state, subject, (1080, 1920), scale, x, y, mobile=True)
    floor = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(floor).ellipse((80, 1510, 1000, 1960), fill=(0, 0, 0, 75))
    canvas.alpha_composite(floor.filter(ImageFilter.GaussianBlur(45)))
    return canvas


def dimensions_report(path: Path) -> dict[str, Any]:
    with Image.open(path) as im:
        im.load()
        alpha = im.getchannel("A") if "A" in im.getbands() else None
        return {
            "path": str(path.relative_to(ROOT)), "format": im.format,
            "dimensions": list(im.size), "bands": list(im.getbands()),
            "alpha_extrema": list(alpha.getextrema()) if alpha else None,
        }


def copy_referenced(path: Path, rel: str) -> None:
    """Keep established transparent Zero and neutral sources as direct copies."""
    save(rgba(path), rel, lossless=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads(MANIFEST.read_text())
    subjects: dict[str, Image.Image] = {}
    lineage: dict[str, Any] = {}
    for state in ("zero", "heaven", "hell", "ultra", "neutral"):
        subjects[state], lineage[state] = source_for(state)

    # P0 full-state masters. The standardized paths are consumed by frontend
    # coordination without pointing at rejected v3 masters.
    for state in ("zero", "heaven", "hell", "ultra"):
        save(subjects[state], f"masters/lucy-{state}.webp", lossless=True)
        save(subjects[state], f"states/lucy-{state}-full.webp", lossless=True)

    # P0 hero pair: Ultra primary, Heaven alternate. These are the exact paths
    # requested by frontend coordination.
    save(composite("ultra", subjects["ultra"], (2560, 1440), 0.87, 0.62, 0.51), "heroes/lucy-ultra-primary-desktop.webp")
    save(composite("heaven", subjects["heaven"], (2560, 1440), 0.84, 0.60, 0.51), "heroes/lucy-heaven-alternate-desktop.webp")
    save(mobile_hero("ultra", subjects["ultra"], x=0.54, y=0.57, scale=0.91), "heroes/lucy-ultra-primary-mobile.webp")
    save(mobile_hero("heaven", subjects["heaven"], x=0.50, y=0.55, scale=0.90), "heroes/lucy-heaven-alternate-mobile.webp")

    # P1 state panels and portraits. Zero and neutral intentionally remain
    # established alpha sources rather than fabricated new characters.
    for state in ("zero", "heaven", "hell", "ultra"):
        save(panel(state, subjects[state]), f"features/lucy-{state}-feature-panel.webp")
        save(portrait(state, subjects[state]), f"portraits/lucy-{state}-bust.webp")
    save(portrait("neutral", subjects["neutral"]), "portraits/lucy-neutral-bust.webp")

    # P3 social export set derives from the Ultra primary campaign composition.
    social_specs = [
        ("social/lucy-og-1200x630.webp", (1200, 630), "ultra", 0.70, 0.67, 0.52),
        ("social/lucy-square-1080x1080.webp", (1080, 1080), "heaven", 0.74, 0.57, 0.51),
        ("social/lucy-portrait-1080x1350.webp", (1080, 1350), "ultra", 0.80, 0.56, 0.55),
        ("social/lucy-story-1080x1920.webp", (1080, 1920), "heaven", 0.92, 0.50, 0.56),
    ]
    for rel, size, state, scale, x, y in social_specs:
        image = mobile_hero(state, subjects[state], x=x, y=y, scale=scale) if size[1] > size[0] * 1.4 else composite(state, subjects[state], size, scale, x, y)
        save(image, rel)

    output_paths = sorted(p for p in OUT.rglob("*.webp"))
    checks = [dimensions_report(path) for path in output_paths]
    bad = [item for item in checks if item["format"] != "WEBP"]
    manifest = {
        "schema": "lucy-v4-approved-set-a/v1",
        "set": "A",
        "owner_approval": "docs/lucy/production/v4/V4_OWNER_APPROVAL.md",
        "candidate_manifest": str(MANIFEST.relative_to(ROOT)),
        "active_visual_sources": {
            "heaven": "heaven-A", "hell": "hell-A", "ultra": "ultra-A",
            "zero": "packages/site/src/assets/lucy/states/lucy-zero.webp",
            "neutral": "packages/site/src/assets/lucy/models/lucy-neutral.webp",
        },
        "hell_lineage": "hell-A is the exact full-RGB inversion candidate; no eyelid, skin, or tear recolor was applied in this downstream export.",
        "source_condition": lineage,
        "matte_status": {
            "owner_override": True,
            "automated_v4_candidate_alpha_deliverables": 0,
            "statement": "Owner approved visual variations. A local extraction can pass or fail its own recorded matte check; neither result changes the historical candidate raw guard finding or the owner-override provenance.",
        },
        "p0_p3_mapping": {
            "P0": ["masters/", "states/", "heroes/"],
            "P1": ["features/", "portraits/"],
            "P2": {"reused_by_exact_path_reference": [
                "packages/site/src/assets/lucy/frontpage/katana-authority-v2/",
                "packages/site/src/assets/lucy/components/ribbons/",
                "packages/site/src/assets/lucy/components/wings/",
                "packages/site/src/assets/lucy/components/shards/",
                "packages/site/src/assets/lucy/components/eyes/",
                "packages/site/src/assets/lucy/fx/",
                "packages/site/src/assets/lucy/backgrounds/",
                "packages/site/src/assets/lucy/identity/",
            ]},
            "P3": ["social/"],
        },
        "mobile": "Hero mobile WebPs are independently assembled vertical compositions; not a center crop of desktop heroes.",
        "generated_model_calls": 0,
        "output_count": len(checks),
        "mechanical_reopen": {"status": "PASS" if not bad else "FAIL", "entries": checks},
        "source_candidate_status_at_export": source_manifest.get("status"),
    }
    (OUT / "ASSET_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output_count": len(checks), "invalid": bad}, indent=2))


if __name__ == "__main__":
    main()
