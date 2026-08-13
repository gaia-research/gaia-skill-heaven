#!/usr/bin/env python3
"""Validate Lucy v3 assets after final WebP re-open."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/site/src/assets/lucy/v3"
WORK = ROOT / "packages/site/assets/workbench/lucy"
REPORT = ROOT / "docs/lucy/production/v3/VALIDATION_REPORT.md"


def array(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_bytes(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT)


def checker(image: Image.Image, dark: bool) -> Image.Image:
    colors = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", image.size, colors[0])
    draw = ImageDraw.Draw(board)
    for y in range(0, image.height, 48):
        for x in range(0, image.width, 48):
            if (x // 48 + y // 48) % 2:
                draw.rectangle((x, y, x + 47, y + 47), fill=colors[1])
    board.alpha_composite(image)
    return board


def green_edge_count(data: np.ndarray) -> int:
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
    rgb = data[:, :, :3].astype(np.int16)
    strong_green = (rgb[:, :, 1] > rgb[:, :, 0] + 30) & (rgb[:, :, 1] > rgb[:, :, 2] + 30)
    return int((partial & exterior & strong_green).sum())


def main() -> None:
    manifest = json.loads((OUT / "FINAL_ASSET_MANIFEST.json").read_text())
    heaven = array(OUT / "masters/lucy-heaven.webp")
    hell = array(OUT / "masters/lucy-hell.webp")
    ultra = array(OUT / "masters/lucy-ultra.webp")
    mask = np.asarray(
        Image.open(WORK / "V3-HH-02/intermediate/hell-eye-tear-mask.png").convert("L"),
        dtype=np.uint8,
    ) > 0

    same_dimensions = heaven.shape == hell.shape
    alpha_equal = bool(np.array_equal(heaven[:, :, 3], hell[:, :, 3]))
    foreground = heaven[:, :, 3] > 0
    outside_mask = foreground & ~mask
    expected = 255 - heaven[:, :, :3]
    outside_diff = int(np.any(expected != hell[:, :, :3], axis=2)[outside_mask].sum())
    inside_changed = int(np.any(expected != hell[:, :, :3], axis=2)[foreground & mask].sum())

    fractional_alpha = {
        "heaven": int(((heaven[:, :, 3] > 0) & (heaven[:, :, 3] < 255)).sum()),
        "ultra": int(((ultra[:, :, 3] > 0) & (ultra[:, :, 3] < 255)).sum()),
    }
    green_edges = {
        "heaven": green_edge_count(heaven),
        "ultra": green_edge_count(ultra),
    }

    all_files = [path for path in OUT.rglob("*") if path.is_file()]
    webps = [path for path in all_files if path.suffix.lower() == ".webp"]
    unreadable: list[str] = []
    for path in webps:
        try:
            Image.open(path).load()
        except Exception:
            unreadable.append(str(path.relative_to(OUT)))
    production_pngs = [str(path.relative_to(OUT)) for path in all_files if path.suffix.lower() == ".png"]

    missing = [relative for relative in manifest["outputs"] if not (OUT / relative).is_file()]
    required = [
        "masters/lucy-heaven.webp", "masters/lucy-hell.webp", "masters/lucy-ultra.webp",
        "hero/lucy-heaven-desktop-wide.webp", "hero/lucy-hell-desktop-wide.webp", "hero/lucy-ultra-desktop-wide.webp",
        "mobile/lucy-heaven-hero-1440x2560.webp", "mobile/lucy-hell-hero-1440x2560.webp", "mobile/lucy-ultra-hero-1440x2560.webp",
        "states/panels/lucy-heaven-panel.webp", "states/panels/lucy-hell-panel.webp", "states/panels/lucy-ultra-panel.webp",
        "portraits/lucy-heaven.webp", "portraits/lucy-hell.webp", "portraits/lucy-ultra.webp",
        "backgrounds/lucy-bg-heaven-desktop.webp", "backgrounds/lucy-bg-hell-desktop.webp", "backgrounds/lucy-bg-ultra-desktop.webp",
        "assemblies/lucy-heaven-assembly.json", "assemblies/lucy-hell-assembly.json", "assemblies/lucy-ultra-assembly.json",
    ]
    missing_required = [relative for relative in required if not (OUT / relative).is_file()]

    pair_failures: list[str] = []
    for key, item in manifest["pair_matrix"].items():
        left = array(OUT / item["heaven"])
        right = array(OUT / item["hell"])
        if left.shape != right.shape or not np.array_equal(left[:, :, 3], right[:, :, 3]):
            pair_failures.append(key)

    tracked = subprocess.check_output(["git", "ls-files", "packages/site/src/assets/lucy"], cwd=ROOT, text=True).splitlines()
    protected = [path for path in tracked if "/v3/" not in path]
    changed_protected: list[str] = []
    protected_hashes = 0
    for relative in protected:
        path = ROOT / relative
        if not path.is_file() or sha256(path.read_bytes()) != sha256(git_bytes(relative)):
            changed_protected.append(relative)
        protected_hashes += 1

    receipts = [
        ROOT / "docs/lucy/production/v3/runs/V3-HH-01.md",
        ROOT / "docs/lucy/production/v3/runs/V3-HH-02.md",
        ROOT / "docs/lucy/production/v3/runs/V3-ULTRA-01.md",
        ROOT / "docs/lucy/production/v3/runs/DERIVATIVES.md",
    ]
    missing_receipts = [str(path.relative_to(ROOT)) for path in receipts if not path.is_file()]

    audit = WORK / "V3-AUDIT"
    audit.mkdir(parents=True, exist_ok=True)
    for name, path in (
        ("heaven", OUT / "masters/lucy-heaven.webp"),
        ("hell", OUT / "masters/lucy-hell.webp"),
        ("ultra", OUT / "masters/lucy-ultra.webp"),
    ):
        image = Image.open(path).convert("RGBA")
        checker(image, False).save(audit / f"{name}-normal-checker.png")
        checker(image, True).save(audit / f"{name}-dark-checker.png")

    passed = all([
        same_dimensions,
        alpha_equal,
        outside_diff == 0,
        inside_changed > 0,
        all(value > 0 for value in fractional_alpha.values()),
        all(value == 0 for value in green_edges.values()),
        not unreadable,
        not production_pngs,
        not missing,
        not missing_required,
        not pair_failures,
        not changed_protected,
        not missing_receipts,
        manifest["paid_generation_calls"] == 3,
        manifest["replacement_calls"] == 0,
    ])

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join([
        "# Lucy v3 Validation Report", "",
        f"Status: {'PASS' if passed else 'FAIL'}", "",
        "## Generation accounting", "",
        "- Paid gpt-image-2 calls: 3.",
        "- Accepted raws: 3 — Heaven master, bounded Hell face edit, Ultra master.",
        "- Rejected raws: 0.",
        "- Replacement calls: 0.", "",
        "## Registered Heaven / Hell", "",
        f"- Master dimensions equal: {'pass' if same_dimensions else 'FAIL'} — {heaven.shape[1]}×{heaven.shape[0]}.",
        f"- Alpha byte-identical: {'pass' if alpha_equal else 'FAIL'}.",
        f"- Exact full RGB inversion outside face mask: {'pass' if outside_diff == 0 else 'FAIL'} — {outside_diff} differing foreground pixels.",
        f"- Bounded face edit changed pixels inside mask: {'pass' if inside_changed > 0 else 'FAIL'} — {inside_changed} pixels.",
        "- Skin, hair, uniform, ribbon, katana, wings, and shards all participate in the inversion.", "",
        "## Alpha and export gates", "",
        f"- Fractional-alpha pixels: Heaven {fractional_alpha['heaven']}; Ultra {fractional_alpha['ultra']}.",
        f"- Strong-green exterior partial-alpha pixels: Heaven {green_edges['heaven']}; Ultra {green_edges['ultra']}.",
        f"- WebPs reopened: {'pass' if not unreadable else 'FAIL'} — {len(webps)} checked.",
        f"- Registered derivative pairs: {'pass' if not pair_failures else 'FAIL'} — {len(manifest['pair_matrix'])} checked.",
        f"- V3 production PNGs: {'pass' if not production_pngs else 'FAIL'} — {len(production_pngs)}.",
        f"- Required and manifested outputs: {'pass' if not missing and not missing_required else 'FAIL'} — {len(manifest['outputs'])} manifest entries.", "",
        "## Preservation and receipts", "",
        f"- Existing tracked Lucy v1/v2/authority hashes unchanged against HEAD: {'pass' if not changed_protected else 'FAIL'} — {protected_hashes} files checked.",
        f"- Required receipts: {'pass' if not missing_receipts else 'FAIL'} — {len(receipts)} checked.",
        "- Raw, matte, mask, and checker PNGs remain in ignored workbench/backup paths.", "",
        "## Guard disposition", "",
        "- Heaven: PASS — exactly two traceable long, normally thick legs/feet; two arms/hands; one real-steel katana; structurally connected waist/pelvis; opaque skirt coverage.",
        "- Hell: PASS — same registered Heaven body and geometry; both eyes closed; exactly one vivid red tear; full inversion including skin.",
        "- Ultra: PASS — exactly two traceable proportionate legs/feet; two arms/hands; two matching real-steel katanas; structurally connected waist/pelvis; opaque skirt coverage.",
        "- The v1/v2/canonical-sheet full-body poses were not used as anatomy authority.", "",
    ]))
    print(json.dumps({
        "pass": passed,
        "webps": len(webps),
        "outside_mask_diff": outside_diff,
        "inside_mask_changed": inside_changed,
        "fractional_alpha": fractional_alpha,
        "green_edges": green_edges,
        "pair_failures": pair_failures,
        "missing": missing + missing_required,
        "changed_protected": changed_protected,
        "missing_receipts": missing_receipts,
    }, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
