#!/usr/bin/env python3
"""Checkout-portable validation for the Lucy v4 owner candidate gate."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "packages/site/src/assets/lucy/v4-candidates"
MANIFEST = BASE / "CANDIDATE_MANIFEST.json"
REPORT_JSON = ROOT / "docs/lucy/production/v4/V4_VALIDATION_REPORT.json"
REPORT_MD = ROOT / "docs/lucy/production/v4/V4_VALIDATION_REPORT.md"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    failures: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    active = manifest.get("candidates", [])
    superseded = manifest.get("superseded_candidates", [])
    require(manifest.get("status") == "STOP_ALL_NINE_ACTIVE_CANDIDATES_HARD_FAIL", "manifest must remain STOP")
    require(manifest.get("generated_call_count") == 18, "generated_call_count must be 18")
    require(manifest.get("replacement_call_count") == 9, "replacement_call_count must be 9")
    require(manifest.get("alpha_deliverable_count") == 0, "alpha_deliverable_count must be zero")
    require(len(active) == 9, "active candidate count must be 9")
    require(len(superseded) == 9, "superseded candidate count must be 9")

    expected_ids = {f"{state}-{set_name}" for set_name in "ABC" for state in ("heaven", "hell", "ultra")}
    require({item.get("id") for item in active} == expected_ids, "active candidate IDs do not match the 3x3 matrix")
    require(all(item.get("self_review", {}).get("hard_status") == "FAIL" for item in active), "every active candidate must retain HARD FAIL")
    require(all(item.get("review_webp_path") is None for item in active), "no active review WebP may be exposed as an alpha deliverable")
    require(all(item.get("status") == "SUPERSEDED_REJECTED_REFERENCE_ONLY" for item in superseded), "every superseded candidate must be reference-only")

    ordinals = sorted(
        item.get("generated_call_ordinal")
        for item in [*active, *superseded]
        if item.get("generated_call_ordinal") is not None
    )
    require(ordinals == list(range(1, 19)), "call ordinals must cover 1 through 18 exactly once")

    preview_paths = [ROOT / item["visual_preview_path"] for item in active]
    preview_paths += [ROOT / item["visual_preview_path"] for item in superseded]
    reopened = 0
    for path in preview_paths:
        require(path.is_file(), f"missing preview: {path.relative_to(ROOT)}")
        if path.is_file():
            with Image.open(path) as image:
                image.load()
                require(image.width > 0 and image.height > 0, f"invalid preview dimensions: {path.relative_to(ROOT)}")
                reopened += 1

    portable_paths: set[Path] = set()

    def collect(value: object) -> None:
        if isinstance(value, dict):
            for nested in value.values():
                collect(nested)
        elif isinstance(value, list):
            for nested in value:
                collect(nested)
        elif isinstance(value, str) and value.endswith((".md", ".json", ".webp")):
            if not value.startswith("packages/site/assets/workbench/"):
                portable_paths.add(ROOT / value)

    collect(manifest)
    for path in sorted(portable_paths):
        require(path.is_file(), f"missing portable manifest path: {path.relative_to(ROOT)}")

    required_artifacts = [
        ROOT / "docs/lucy/production/v4/V4_CANDIDATE_BRIEF.md",
        ROOT / "docs/lucy/production/v4/V4_INDEPENDENT_REVIEW.md",
        ROOT / "docs/lucy/production/v4/V4_INDEPENDENT_REVIEW.json",
        ROOT / "docs/lucy/production/v4/LUCY_V4_CANDIDATE_REVIEW.html",
        BASE / "LUCY_V4_CANDIDATE_CONTACT_SHEET.webp",
    ]
    for path in required_artifacts:
        require(path.is_file(), f"missing gate artifact: {path.relative_to(ROOT)}")

    production_pngs = sorted(path.relative_to(ROOT).as_posix() for path in BASE.rglob("*.png"))
    require(not production_pngs, "production v4 candidate directory must contain zero PNGs")

    payload = {
        "status": "PASS" if not failures else "FAIL",
        "candidate_gate_status": manifest.get("status"),
        "generated_calls": manifest.get("generated_call_count"),
        "replacement_calls": manifest.get("replacement_call_count"),
        "active_candidates": len(active),
        "superseded_candidates": len(superseded),
        "alpha_deliverables": manifest.get("alpha_deliverable_count"),
        "preview_webps_reopened": reopened,
        "portable_manifest_paths_checked": len(portable_paths),
        "production_pngs": production_pngs,
        "failures": failures,
    }
    REPORT_JSON.write_text(json.dumps(payload, indent=2) + "\n")
    REPORT_MD.write_text(
        "# Lucy v4 candidate validation\n\n"
        f"Validator status: **{payload['status']}**  \n"
        f"Candidate gate status: **{payload['candidate_gate_status']}**\n\n"
        f"- Generated calls: {payload['generated_calls']}\n"
        f"- Guard-triggered replacements: {payload['replacement_calls']}\n"
        f"- Active candidates: {payload['active_candidates']}\n"
        f"- Superseded references: {payload['superseded_candidates']}\n"
        f"- Alpha deliverables: {payload['alpha_deliverables']}\n"
        f"- Preview WebPs reopened: {payload['preview_webps_reopened']}\n"
        f"- Portable manifest paths checked: {payload['portable_manifest_paths_checked']}\n"
        f"- Production PNGs: {len(payload['production_pngs'])}\n\n"
        + ("No validator failures. The automated candidate gate remains STOP evidence; `V4_OWNER_APPROVAL.md` separately authorizes all nine variations for downstream use.\n" if not failures else "## Failures\n\n" + "\n".join(f"- {item}" for item in failures) + "\n")
    )
    print(json.dumps(payload, indent=2))
    raise SystemExit(0 if not failures else 1)


if __name__ == "__main__":
    main()
