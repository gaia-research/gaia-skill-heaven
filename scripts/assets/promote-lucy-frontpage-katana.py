#!/usr/bin/env python3
"""Promote FP-KATANA-01 into both front-page variations deterministically.

The shared pack is the only source.  This script deliberately deletes only
the resolved katana target files before copying the complete 15-file pack, so
both variation directories are byte-identical to production authority.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "packages/site/src/assets/lucy/frontpage/katana-authority-v2"
VARIATIONS = ("a", "b")
SOURCE_PREFIX = "packages/site/src/assets/lucy/frontpage/katana-authority-v2"


def main() -> None:
    files = sorted(path for path in SHARED.glob("*.webp") if path.is_file())
    if len(files) != 15:
        raise SystemExit(f"expected 15 authority WebPs, found {len(files)}")
    names = [path.name for path in files]

    for variation in VARIATIONS:
        root = ROOT / f"packages/site/src/assets/lucy/frontpage/variation-{variation}"
        target = root / "components/katana"
        target.mkdir(parents=True, exist_ok=True)
        for old in target.glob("*.webp"):
            old.unlink()
        for source in files:
            shutil.copy2(source, target / source.name)

        manifest_path = root / "ASSET_MANIFEST.json"
        manifest = json.loads(manifest_path.read_text())
        if variation == "a":
            non_katana = [item for item in manifest["outputs"] if not item.startswith("components/katana/")]
            manifest["outputs"] = sorted(non_katana + [f"components/katana/{name}" for name in names])
            manifest["katana_authority"] = {
                "source": SOURCE_PREFIX,
                "job": "FP-KATANA-01",
                "model": "gpt-image-2",
                "files": names,
            }
            gaps_path = root / "SOURCE_GAPS.json"
            gaps = json.loads(gaps_path.read_text())
            gaps["unavailable"] = [item for item in gaps["unavailable"] if item.get("asset") not in {"sheathed katana", "saya"}]
            gaps_path.write_text(json.dumps(gaps, indent=2) + "\n")
        else:
            manifest["sourceGaps"] = {
                "isolatedHair": "Unavailable: no accepted separate hair layers exist; not fabricated."
            }
            manifest["assets"] = [item for item in manifest["assets"] if "/components/katana/" not in item.get("path", "")]
            manifest["assets"].extend(
                {
                    "path": f"packages/site/src/assets/lucy/frontpage/variation-b/components/katana/{name}",
                    "source": f"{SOURCE_PREFIX}/{name}",
                }
                for name in names
            )
            manifest["katanaAuthority"] = {
                "source": SOURCE_PREFIX,
                "job": "FP-KATANA-01",
                "model": "gpt-image-2",
                "files": names,
            }
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(json.dumps({"shared": str(SHARED.relative_to(ROOT)), "files": names, "variations": list(VARIATIONS)}, indent=2))


if __name__ == "__main__":
    main()
