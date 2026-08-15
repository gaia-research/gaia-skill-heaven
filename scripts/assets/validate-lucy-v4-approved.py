#!/usr/bin/env python3
"""Checkout-portable mechanical validation for Lucy v4 approved downstream art."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "packages/site/src/assets/lucy/v4-approved/APPROVED_V4_ASSET_MANIFEST.json"
SHOWCASE = ROOT / "docs/lucy/production/v4/LUCY_V4_APPROVED_SHOWCASE.html"


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    manifest = json.loads(MANIFEST.read_text())
    if manifest.get("schema") != "lucy-v4-approved-collective/v1":
        fail(errors, "unexpected collective manifest schema")
    if manifest.get("counts", {}).get("production_pngs") != 0:
        fail(errors, "manifest claims production PNGs")
    assets = manifest.get("assets", [])
    if len(assets) != manifest.get("counts", {}).get("production_webps"):
        fail(errors, "asset count differs from manifest count")
    seen: set[str] = set()
    for asset in assets:
        path = asset.get("path", "")
        if path in seen:
            fail(errors, f"duplicate asset path: {path}")
        seen.add(path)
        if not path.endswith(".webp"):
            fail(errors, f"non-WebP production asset: {path}")
            continue
        absolute = ROOT / path
        if not absolute.is_file():
            fail(errors, f"missing production asset: {path}")
            continue
        try:
            with Image.open(absolute) as image:
                image.load()
                if image.format != "WEBP":
                    fail(errors, f"not WebP after reopen: {path}")
                if [image.width, image.height] != asset.get("dimensions"):
                    fail(errors, f"dimension mismatch: {path}")
                if ("A" in image.getbands()) != asset.get("has_alpha_channel"):
                    fail(errors, f"alpha channel mismatch: {path}")
        except Exception as exc:  # noqa: BLE001 - validator must report corrupt media.
            fail(errors, f"cannot reopen {path}: {exc}")
        for key in ("priority", "source_provenance", "alpha_disclosure", "owner_authorization", "retained_guard_evidence"):
            if not asset.get(key):
                fail(errors, f"missing {key}: {path}")
    pngs = list((ROOT / "packages/site/src/assets/lucy/v4-approved").rglob("*.png"))
    if pngs:
        fail(errors, f"production PNGs found: {len(pngs)}")
    p2_references = manifest.get("reused_p2_exact_references", {})
    set_a_references = p2_references.get("set_a", [])
    required_set_a_suffixes = {
        "frontpage/katana-authority-v2",
        "components/ribbons",
        "components/wings",
        "components/shards",
        "components/eyes",
        "fx",
        "backgrounds",
        "identity",
    }
    actual_set_a_suffixes = {str(reference).rstrip("/").split("lucy/", 1)[-1] for reference in set_a_references}
    for missing in sorted(required_set_a_suffixes - actual_set_a_suffixes):
        fail(errors, f"missing Set A P2 category: {missing}")
    for reference in set_a_references:
        if not (ROOT / reference).is_dir():
            fail(errors, f"missing Set A P2 reference directory: {reference}")
    set_b_references = p2_references.get("set_b", {})
    required_set_b_categories = {"ribbons", "wings", "shards", "eyes", "katanas", "fx", "backgrounds", "identity"}
    for missing in sorted(required_set_b_categories - set(set_b_references)):
        fail(errors, f"missing Set B P2 category: {missing}")
    for source in set_b_references.values():
        if isinstance(source, list):
            for item in source:
                if not (ROOT / item).exists():
                    fail(errors, f"missing Set B P2 reference: {item}")
    set_c_references = p2_references.get("set_c", {})
    required_set_c_categories = {
        "backgrounds",
        "katana_authority_directory",
        "ribbons_directory",
        "wings_directory",
        "shards_directory",
        "eyes_directory",
        "fx_directory",
        "state_icons_directory",
    }
    for missing in sorted(required_set_c_categories - set(set_c_references)):
        fail(errors, f"missing Set C P2 category: {missing}")
    for source in set_c_references.values():
        if isinstance(source, str) and not (ROOT / source).exists():
            fail(errors, f"missing Set C P2 reference: {source}")
        elif isinstance(source, dict):
            for item in source.values():
                if not (ROOT / item).exists():
                    fail(errors, f"missing Set C P2 reference: {item}")
    if not SHOWCASE.is_file():
        fail(errors, "missing static showcase")
    else:
        body = SHOWCASE.read_text()
        if "<script" in body.lower():
            fail(errors, "showcase contains inline JavaScript; static showcase must remain script-free")
        for asset in assets:
            expected = "../../../../" + asset["path"]
            if expected not in body:
                fail(errors, f"showcase missing portable asset reference: {asset['path']}")
    payload = {"status": "PASS" if not errors else "FAIL", "checked_webps": len(assets), "errors": errors}
    print(json.dumps(payload, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
