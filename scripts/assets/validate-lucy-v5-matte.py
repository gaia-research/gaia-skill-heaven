#!/usr/bin/env python3
"""Run the tracked semantic/matte gate against every Lucy v5 delivery."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "scripts/assets/lucy-matte-guard.py"
MANIFEST = ROOT / "packages/site/src/assets/lucy/v5/delivery/DELIVERY_MANIFEST.json"
REGIONS = ROOT / "docs/lucy/production/v5/semantic-regions"
STATES = ("zero", "heaven", "hell", "ultra")
ALLOWED_EXCEPTIONS = {
    ("zero", "wings", "canonically-absent"),
    ("heaven", "wings", "source-external"),
}


def fail(message: str) -> None:
    raise SystemExit(f"Lucy v5 matte validation failed: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_metrics(alpha: np.ndarray) -> dict[str, int | str]:
    return {
        "minimum": int(alpha.min()),
        "maximum": int(alpha.max()),
        "transparent_pixels": int((alpha == 0).sum()),
        "opaque_pixels": int((alpha == 255).sum()),
        "fractional_pixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "sha256_raw": hashlib.sha256(alpha.tobytes()).hexdigest(),
    }


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    outputs = {item["state"]: item for item in manifest.get("outputs", [])}
    if set(outputs) != set(STATES):
        fail(f"manifest states are {sorted(outputs)}")

    summaries = []
    with tempfile.TemporaryDirectory(prefix="lucy-v5-matte-") as temp:
        temp_root = Path(temp)
        for state in STATES:
            item = outputs[state]
            source = ROOT / item["source"]
            delivery = ROOT / item["output"]
            region_path = REGIONS / f"lucy-{state}.json"
            if not region_path.exists():
                fail(f"missing semantic regions for {state}")
            region_payload = json.loads(region_path.read_text())
            if region_payload.get("source") != item["source"]:
                fail(f"{state} semantic source does not match manifest")
            if sha256(source) != item["source_sha256"]:
                fail(f"{state} approved source hash drifted")

            decoded_alpha = np.asarray(Image.open(delivery).convert("RGBA"), dtype=np.uint8)[:, :, 3]
            if alpha_metrics(decoded_alpha) != item.get("decoded_alpha"):
                fail(f"{state} decoded alpha evidence does not match the WebP")
            source_alpha = Image.open(source).convert("RGBA").getchannel("A")
            baseline_alpha = np.asarray(
                source_alpha.resize((decoded_alpha.shape[1], decoded_alpha.shape[0]), Image.Resampling.LANCZOS),
                dtype=np.uint8,
            )
            if not np.array_equal(decoded_alpha, baseline_alpha):
                fail(f"{state} decoded alpha differs from the declared direct-2x canonical baseline")
            adjustments = item.get("alpha_adjustments", {})
            if any(adjustments.get(name) != 0 for name in (
                "removed_nonzero_pixels", "added_nonzero_pixels", "differing_pixels", "maximum_delta",
            )):
                fail(f"{state} manifest claims nonzero alpha adjustment against the canonical baseline")

            exceptions = {
                (state, region["name"], region.get("expected", "present"))
                for region in region_payload["regions"]
                if region.get("expected", "present") != "present"
            }
            if not exceptions <= ALLOWED_EXCEPTIONS:
                fail(f"{state} has unapproved semantic exceptions: {sorted(exceptions)}")
            expected_for_state = {item for item in ALLOWED_EXCEPTIONS if item[0] == state}
            if exceptions != expected_for_state:
                fail(f"{state} semantic exceptions are {sorted(exceptions)}, expected {sorted(expected_for_state)}")

            state_dir = temp_root / state
            command = [
                sys.executable,
                str(GUARD),
                "--input", str(delivery),
                "--output", str(state_dir / "verified.png"),
                "--audit-dir", str(state_dir / "audit"),
                "--report", str(state_dir / "report.json"),
                "--regions", str(region_path),
                "--candidate", f"ISSUE-73-{state.upper()}",
                "--allow-canvas-contact",
                "--source-native-prism",
                "--prism-reference", str(source),
                "--force",
            ]
            completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            report = json.loads((state_dir / "report.json").read_text())
            if completed.returncode or not report.get("pass"):
                fail(f"{state} guard failed: {report.get('error') or report['metrics']['checks']}")
            metrics = report["metrics"]
            summaries.append({
                "state": state,
                "pass": True,
                "transparent_pixels": metrics["transparent_pixels"],
                "opaque_pixels": metrics["opaque_pixels"],
                "fractional_alpha_pixels": metrics["fractional_alpha_pixels"],
                "border_foreground_pixels": metrics["border_foreground_pixels"],
                "new_border_foreground_pixels": metrics["new_border_foreground_pixels"],
                "new_strong_green_exterior_pixels": metrics["new_strong_green_exterior_pixels"],
                "new_strong_magenta_exterior_pixels": metrics["new_strong_magenta_exterior_pixels"],
                "new_strong_green_interior_boundary_pixels": metrics["new_strong_green_interior_boundary_pixels"],
                "declared_exceptions": sorted("/".join(value) for value in exceptions),
            })

    print(json.dumps({"pass": True, "states": summaries}, indent=2))


if __name__ == "__main__":
    main()
