#!/usr/bin/env python3
"""Checkout-portable validation for the Lucy v5 browser delivery set."""
from __future__ import annotations

import hashlib
import json
import struct
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DELIVERY = ROOT / "packages/site/src/assets/lucy/v5/delivery"
MANIFEST = DELIVERY / "DELIVERY_MANIFEST.json"
TARGETS = {
    "zero": (2048, 3072),
    "heaven": (2048, 3072),
    "hell": (2048, 3072),
    "ultra": (2190, 2874),
}
CONSUMERS = (
    ROOT / "packages/site/src/variations/hero/heroAssets.ts",
    ROOT / "packages/site/src/surfaces/Landing.tsx",
    ROOT / "packages/site/src/surfaces/Hero.tsx",
)


def fail(message: str) -> None:
    raise SystemExit(f"Lucy v5 delivery validation failed: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        fail(f"not a PNG source: {path.relative_to(ROOT)}")
    return struct.unpack(">II", data[16:24])


def webp_vp8x(path: Path) -> tuple[tuple[int, int], bool]:
    data = path.read_bytes()[:30]
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP" or data[12:16] != b"VP8X":
        fail(f"expected extended WebP container: {path.relative_to(ROOT)}")
    flags = data[20]
    width = int.from_bytes(data[24:27], "little") + 1
    height = int.from_bytes(data[27:30], "little") + 1
    return (width, height), bool(flags & 0x10)


def main() -> None:
    if not MANIFEST.exists():
        fail("delivery manifest is missing")
    manifest = json.loads(MANIFEST.read_text())
    if manifest.get("schema") != "lucy-v5-overkill-delivery/v1":
        fail("unexpected manifest schema")
    pipeline = manifest.get("pipeline", {})
    if pipeline.get("mode") != "overkill-hybrid" or pipeline.get("full_16x_frame_materialized") is not False:
        fail("manifest does not describe the bounded Overkill pipeline")

    outputs = {item["state"]: item for item in manifest.get("outputs", [])}
    if set(outputs) != set(TARGETS):
        fail(f"manifest states are {sorted(outputs)}, expected {sorted(TARGETS)}")

    total_source = 0
    total_delivery = 0
    for state, target in TARGETS.items():
        item = outputs[state]
        source = ROOT / item["source"]
        output = ROOT / item["output"]
        if source.suffix.lower() != ".png" or output.suffix.lower() != ".webp":
            fail(f"{state} must retain PNG source and ship WebP")
        if not source.exists() or not output.exists():
            fail(f"{state} source or output is missing")
        if png_size(source) != tuple(item["source_dimensions"]):
            fail(f"{state} source dimensions drifted")
        webp_size, has_alpha = webp_vp8x(output)
        if webp_size != target or webp_size != tuple(item["output_dimensions"]):
            fail(f"{state} output is {webp_size}, expected {target}")
        if not has_alpha:
            fail(f"{state} WebP does not declare alpha")
        if source.stat().st_size != item["source_bytes"] or sha256(source) != item["source_sha256"]:
            fail(f"{state} source provenance drifted")
        if output.stat().st_size != item["output_bytes"] or sha256(output) != item["output_sha256"]:
            fail(f"{state} output provenance drifted")
        if output.stat().st_size >= source.stat().st_size or not item.get("output_smaller_than_source"):
            fail(f"{state} delivery is not smaller than its source PNG")
        alpha = item.get("decoded_alpha", {})
        if alpha.get("minimum") != 0 or alpha.get("maximum") != 255:
            fail(f"{state} decoded alpha range is not 0..255")
        if alpha.get("opaque_pixels", 0) <= 1000 or alpha.get("fractional_pixels", 0) <= 100:
            fail(f"{state} decoded alpha lacks opaque or fractional coverage")
        if alpha.get("transparent_pixels", 0) <= target[0] * target[1] * 0.05:
            fail(f"{state} decoded alpha lacks real transparency")
        adjustments = item.get("alpha_adjustments", {})
        if adjustments.get("removed_nonzero_pixels") != 0:
            fail(f"{state} alpha support was removed")
        total_source += source.stat().st_size
        total_delivery += output.stat().st_size

    for consumer in CONSUMERS:
        text = consumer.read_text()
        if "assets/lucy/v5/masters" in text or "/v5/masters/" in text:
            fail(f"live source PNG import remains in {consumer.relative_to(ROOT)}")
        if "assets/lucy/v5/delivery" not in text:
            fail(f"v5 delivery imports are missing from {consumer.relative_to(ROOT)}")
        for state in TARGETS:
            if f"lucy-{state}.webp" not in text:
                fail(f"{consumer.relative_to(ROOT)} does not import {state} delivery")

    tracked = subprocess.run(
        ["git", "ls-files", "packages/site/assets/workbench", "packages/site/src/assets/lucy/v5/delivery"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    forbidden = [path for path in tracked if "workbench" in path or any(token in Path(path).name.lower() for token in ("4x", "8x", "16x"))]
    if forbidden:
        fail(f"tracked workbench/intermediate files: {forbidden}")

    reduction = 1.0 - total_delivery / total_source
    print(
        json.dumps(
            {
                "pass": True,
                "states": len(TARGETS),
                "source_bytes": total_source,
                "delivery_bytes": total_delivery,
                "byte_reduction_fraction": round(reduction, 6),
                "routes": ["/", "/landing", "/instrument"],
                "frontend_png_imports": 0,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
