#!/usr/bin/env python3
"""Mechanical-only validator for Lucy front-page Variation A."""
from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/frontpage/variation-a"
REPORT = ROOT / "docs/lucy/production/frontpage/VARIATION_A_VALIDATION.md"

EXACT = {
    "hero/lucy-primary-desktop-2560x1080.webp": (2560, 1080, False),
    "hero/lucy-alternate-desktop-2560x1080.webp": (2560, 1080, False),
    "hero/lucy-primary-mobile-1440x2560.webp": (1440, 2560, False),
    "hero/lucy-alternate-mobile-1440x2560.webp": (1440, 2560, False),
    "hero/lucy-primary.webp": (1024, 1536, True),
    "hero/lucy-alternate.webp": (1024, 1536, True),
    "social/lucy-og-1200x630.webp": (1200, 630, False),
    "social/lucy-square-1080.webp": (1080, 1080, False),
    "social/lucy-portrait-1080x1350.webp": (1080, 1350, False),
    "social/lucy-story-1080x1920.webp": (1080, 1920, False),
    "components/katana/lucy-katana-heaven.webp": (1200, 320, True),
    "components/katana/lucy-katana-hell.webp": (1200, 320, True),
    "components/katana/lucy-katana-sheathed.webp": (1800, 480, True),
    "components/katana/lucy-katana-saya.webp": (1800, 480, True),
}

def main() -> None:
    failures: list[str] = []
    checked = 0
    for path in sorted(OUT.rglob("*.webp")):
        checked += 1
        try:
            with Image.open(path) as image:
                image.load()
                if image.format != "WEBP":
                    failures.append(f"not WebP: {path.relative_to(OUT)}")
        except Exception as exc:
            failures.append(f"unreadable: {path.relative_to(OUT)} ({exc})")
    for rel, (width, height, alpha) in EXACT.items():
        size = (width, height)
        path = OUT / rel
        if not path.exists():
            failures.append(f"missing: {rel}")
            continue
        with Image.open(path) as image:
            if image.size != size:
                failures.append(f"wrong dimensions: {rel}: {image.size} != {size}")
            has_alpha_band = "A" in image.getbands()
            if alpha and not has_alpha_band:
                failures.append(f"missing alpha channel: {rel}")
            if not alpha and has_alpha_band and image.getchannel("A").getextrema() != (255, 255):
                failures.append(f"unexpected transparent pixels: {rel}")
    pngs = list(OUT.rglob("*.png"))
    if pngs:
        failures.extend(f"tracked frontpage PNG: {p.relative_to(OUT)}" for p in pngs)
    status = "PASS" if not failures else "FAIL"
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join([
        "# Variation A Mechanical Validation",
        "",
        f"Status: {status}",
        "",
        f"- Re-opened production WebPs: {checked}",
        "- Visual review: deliberately not performed (explicit owner instruction).",
        "- Katana exception: FP-KATANA-01 has a separate focused authority/alpha review in KATANA_AUTHORITY_REVIEW.md.",
        "- Character pixels: no generated, inverted, recolored, or masked character output in this batch.",
        "- Registered Hell: reused from v2 without modification.",
        f"- Tracked Variation A PNGs: {len(pngs)}",
        "",
        "## Failures",
        *( [f"- {item}" for item in failures] if failures else ["- None."] ),
        "",
    ]))
    print(f"{status}: {checked} WebPs; {len(failures)} failures")
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
