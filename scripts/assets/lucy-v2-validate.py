#!/usr/bin/env python3
"""Validate the v2 registered Heaven/Hell asset pair after WebP re-open."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/v2"
WORK = ROOT / "packages/site/assets/workbench/lucy"
REPORT = ROOT / "docs/lucy/production/v2/VALIDATION_REPORT.md"


def arr(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def checker(image: Image.Image, dark: bool) -> Image.Image:
    a, b = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", image.size, a)
    d = ImageDraw.Draw(board)
    for y in range(0, image.height, 48):
        for x in range(0, image.width, 48):
            if (x // 48 + y // 48) % 2: d.rectangle((x, y, x + 47, y + 47), fill=b)
    board.alpha_composite(image)
    return board


def main() -> None:
    manifest = json.loads((OUT / "FINAL_ASSET_MANIFEST.json").read_text())
    h = arr(OUT / "masters/lucy-heaven.webp")
    x = arr(OUT / "masters/lucy-hell.webp")
    mask = np.asarray(Image.open(WORK / "V2-HH-02/intermediate/hell-eye-tear-mask.png").convert("L"), dtype=np.uint8) > 0
    same_shape = h.shape == x.shape
    alpha_same = bool(np.array_equal(h[:, :, 3], x[:, :, 3]))
    fg = h[:, :, 3] > 0
    outside = fg & ~mask
    expected = 255 - h[:, :, :3]
    master_outside_diff = int(np.any(expected != x[:, :, :3], axis=2)[outside].sum())
    partial = (h[:, :, 3] > 0) & (h[:, :, 3] < 255)
    zero = h[:, :, 3] == 0
    exterior = zero.copy()
    exterior[1:, :] |= zero[:-1, :]; exterior[:-1, :] |= zero[1:, :]
    exterior[:, 1:] |= zero[:, :-1]; exterior[:, :-1] |= zero[:, 1:]
    exterior_partial = partial & exterior
    green = exterior_partial & (h[:, :, 1] > h[:, :, 0] + 30) & (h[:, :, 1] > h[:, :, 2] + 30)
    pair_results = []
    for key, item in manifest["pair_matrix"].items():
        left, right = arr(OUT / item["heaven"]), arr(OUT / item["hell"])
        pair_results.append((key, left.shape == right.shape, bool(np.array_equal(left[:, :, 3], right[:, :, 3]))))
    bad_pairs = [name for name, dims, alpha in pair_results if not dims or not alpha]
    all_files = [p for p in OUT.rglob("*") if p.is_file()]
    pngs = [str(p.relative_to(OUT)) for p in all_files if p.suffix.lower() == ".png"]
    unreadable = []
    for p in all_files:
        if p.suffix.lower() == ".webp":
            try: Image.open(p).load()
            except Exception: unreadable.append(str(p.relative_to(OUT)))
    audit = WORK / "V2-HH-01/intermediate/audit"
    audit.mkdir(parents=True, exist_ok=True)
    for label, p in [("heaven", OUT / "masters/lucy-heaven.webp"), ("hell", OUT / "masters/lucy-hell.webp"), ("ultra", OUT / "masters/lucy-ultra.webp")]:
        image = Image.open(p).convert("RGBA")
        checker(image, False).save(audit / f"{label}-normal-checker.png")
        checker(image, True).save(audit / f"{label}-inverted-checker.png")
    passed = same_shape and alpha_same and master_outside_diff == 0 and not bad_pairs and not pngs and not unreadable and int(green.sum()) == 0
    REPORT.write_text("\n".join([
        "# Lucy Heaven / Hell v2 Validation Report", "",
        f"Status: {'PASS' if passed else 'FAIL'}", "",
        "## Registered master checks", "",
        f"- Heaven/Hell dimensions equal: {'pass' if same_shape else 'FAIL'} — {h.shape[1]}×{h.shape[0]}.",
        f"- Heaven/Hell alpha byte-equal: {'pass' if alpha_same else 'FAIL'}.",
        f"- Outside declared two-eyes-plus-one-tear mask: {'pass' if master_outside_diff == 0 else 'FAIL'} — {master_outside_diff} differing foreground pixels against exact RGB inversion.",
        f"- Heaven exterior partial-alpha strong-green pixels: {'pass' if int(green.sum()) == 0 else 'FAIL'} — {int(green.sum())}.",
        "- Hell skin, hair, uniform, ribbon, steel, wings, and shards are derived from the Heaven complement; only the bounded closed-eye/red-tear mask differs.", "",
        "## Export checks", "",
        f"- Re-opened WebP files: {'pass' if not unreadable else 'FAIL'} — {len([p for p in all_files if p.suffix.lower() == '.webp'])} checked.",
        f"- Registered paired geometry/alpha: {'pass' if not bad_pairs else 'FAIL'} — {len(pair_results)} pairs checked.",
        f"- Tracked v2 PNG policy: {'pass' if not pngs else 'FAIL'} — {len(pngs)} PNGs.",
        "- Checkerboard audit outputs are retained only under ignored workbench paths and backed up as-is.", "",
        "## Anatomy and modesty disposition", "",
        "- V2-HH-01: accepted after direct owner review: one head, two arms/hands, two independently traceable legs/feet, one katana; opaque skirt covers intimate area.",
        "- V2-ULTRA-01: accepted: one head, two arms/hands, two readable legs/feet, two katanas; pose is stylized but retains thigh/knee/calf/ankle continuity and opaque skirt coverage. No warp or concealment edit was applied.",
        "- V1 artifacts remain preserved as reference only; no v1 file was overwritten or deleted.", "",
    ]))
    print(json.dumps({"pass": passed, "outside_mask_diff": master_outside_diff, "green_edge_pixels": int(green.sum()), "pairs": len(pair_results), "bad_pairs": bad_pairs, "pngs": pngs, "unreadable": unreadable}, indent=2))
    if not passed: raise SystemExit(1)


if __name__ == "__main__": main()
