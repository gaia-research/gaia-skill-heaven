#!/usr/bin/env python3
"""Regression controls for the fail-closed Lucy matte guard."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "scripts/assets/lucy-matte-guard.py"


def run(input_path: Path, folder: Path, candidate: str, regions: Path | None = None) -> tuple[int, dict]:
    command = [
        sys.executable, str(GUARD),
        "--input", str(input_path),
        "--output", str(folder / "output.png"),
        "--audit-dir", str(folder / "audit"),
        "--report", str(folder / "report.json"),
        "--candidate", candidate,
    ]
    if regions is None:
        command.extend(("--asset-type", "component"))
    else:
        command.extend(("--regions", str(regions)))
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    return result.returncode, json.loads((folder / "report.json").read_text())


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="lucy-matte-guard-") as temp:
        base = Path(temp)

        heaven_regions = base / "heaven-regions.json"
        broad = [0, 0, 1024, 1536]
        heaven_regions.write_text(json.dumps({"regions": [
            {"name": "face-core", "box": [360, 400, 520, 555]},
            {"name": "head", "box": [280, 250, 650, 620]},
            {"name": "hair", "box": [250, 35, 720, 500]},
            *({"name": name, "box": broad} for name in (
                "torso", "left-arm-hand", "right-arm-hand", "left-leg-foot",
                "right-leg-foot", "wings", "weapons",
            )),
        ]}, indent=2))

        heaven_dir = base / "v3-heaven"
        heaven_dir.mkdir()
        heaven_code, heaven = run(
            ROOT / "packages/site/src/assets/lucy/v3/masters/lucy-heaven.webp",
            heaven_dir,
            "v3-heaven-negative-control",
            heaven_regions,
        )
        face = next(item for item in heaven["metrics"]["semantic_regions"] if item["name"] == "face-core")
        assert heaven_code != 0 and not heaven["pass"]
        assert not face["pass"] and face["alpha_192_fraction"] < 0.70

        ultra_dir = base / "v3-ultra"
        ultra_dir.mkdir()
        ultra_code, ultra = run(
            ROOT / "packages/site/src/assets/lucy/v3/masters/lucy-ultra.webp",
            ultra_dir,
            "v3-ultra-negative-control",
        )
        assert ultra_code != 0 and not ultra["pass"]
        assert ultra["metrics"]["strong_magenta_exterior_pixels"] > 0

        katana_dir = base / "authority-katana"
        katana_dir.mkdir()
        katana_code, katana = run(
            ROOT / "packages/site/src/assets/lucy/frontpage/katana-authority-v2/lucy-katana-neutral-steel.webp",
            katana_dir,
            "authority-katana-positive-control",
        )
        assert katana_code == 0 and katana["pass"]

        # A generated flat-green plate may contain opaque green bounce inside
        # the subject contour. The chroma extractor must neutralize that thin
        # rim before exact Hell inversion can turn it magenta.
        chroma_spill_source = base / "synthetic-chroma-interior-green-spill.png"
        synthetic = Image.new("RGB", (256, 256), (0, 255, 0))
        draw = ImageDraw.Draw(synthetic)
        draw.rectangle((63, 63, 192, 192), fill=(120, 220, 120))
        draw.rectangle((67, 67, 188, 188), fill=(60, 90, 150))
        synthetic.save(chroma_spill_source)
        chroma_spill_dir = base / "synthetic-chroma-interior-green-spill"
        chroma_spill_dir.mkdir()
        _, chroma_spill = run(
            chroma_spill_source,
            chroma_spill_dir,
            "synthetic-chroma-interior-green-spill-correction-control",
        )
        assert chroma_spill["extraction"]["despilled_opaque_interior_pixels"] > 0
        assert chroma_spill["metrics"]["strong_green_interior_boundary_pixels"] == 0

        # Native-alpha inputs are never silently recolored. A strong-green
        # opaque boundary in such a source must therefore fail closed.
        native_spill_source = base / "synthetic-native-interior-green-spill.png"
        native = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        draw = ImageDraw.Draw(native)
        draw.rectangle((63, 63, 192, 192), fill=(120, 220, 120, 255))
        draw.rectangle((67, 67, 188, 188), fill=(60, 90, 150, 255))
        native.save(native_spill_source)
        native_spill_dir = base / "synthetic-native-interior-green-spill"
        native_spill_dir.mkdir()
        native_spill_code, native_spill = run(
            native_spill_source,
            native_spill_dir,
            "synthetic-native-interior-green-spill-negative-control",
        )
        assert native_spill_code != 0 and not native_spill["pass"]
        assert native_spill["metrics"]["strong_green_interior_boundary_pixels"] > 0

        print(json.dumps({
            "pass": True,
            "v3_heaven_rejected": True,
            "v3_heaven_face_alpha_192_fraction": face["alpha_192_fraction"],
            "v3_heaven_face_median_nonzero_alpha": face["median_nonzero_alpha"],
            "v3_ultra_rejected": True,
            "v3_ultra_magenta_exterior_pixels": ultra["metrics"]["strong_magenta_exterior_pixels"],
            "synthetic_chroma_interior_green_spill_corrected": True,
            "synthetic_chroma_despilled_opaque_pixels": chroma_spill["extraction"]["despilled_opaque_interior_pixels"],
            "synthetic_native_interior_green_spill_rejected": True,
            "synthetic_native_interior_green_spill_pixels": native_spill["metrics"]["strong_green_interior_boundary_pixels"],
            "authority_katana_accepted": True,
        }, indent=2))


if __name__ == "__main__":
    main()
