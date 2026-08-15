#!/usr/bin/env python3
"""Build the portable Lucy v4 approved-art registry and static review page.

This consolidates the three independently exported A/B/C receipts without
changing their alpha findings. It intentionally records owner authorization and
guard evidence as separate facts.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "packages/site/src/assets/lucy/v4-approved"
OUT_MANIFEST = ASSET_ROOT / "APPROVED_V4_ASSET_MANIFEST.json"
OUT_SHOWCASE = ROOT / "docs/lucy/production/v4/LUCY_V4_APPROVED_SHOWCASE.html"
OWNER_APPROVAL = "docs/lucy/production/v4/V4_OWNER_APPROVAL.md"
CANDIDATE_MANIFEST = "packages/site/src/assets/lucy/v4-candidates/CANDIDATE_MANIFEST.json"


def load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


def path_for(set_id: str, rel: str) -> str:
    return f"packages/site/src/assets/lucy/v4-approved/set-{set_id}/{rel}"


def priority(rel: str) -> str:
    if rel.startswith(("masters/", "heroes/", "hero/")):
        return "P0"
    if rel.startswith("states/") and "/panels/" not in rel:
        return "P0"
    if rel.startswith(("features/", "portraits/", "states/panels/")):
        return "P1"
    if rel.startswith("social/"):
        return "P3"
    raise ValueError(f"Cannot determine brief priority for {rel}")


def state_for(rel: str) -> str:
    for state in ("heaven", "hell", "ultra", "zero", "neutral"):
        if f"lucy-{state}" in rel:
            return state
    return "shared"


def image_info(repo_rel: str) -> dict:
    with Image.open(ROOT / repo_rel) as image:
        image.load()
        return {
            "format": image.format,
            "dimensions": [image.width, image.height],
            "has_alpha_channel": "A" in image.getbands(),
        }


def alpha_note(set_id: str, state: str, has_alpha: bool, direct: str | None = None) -> str:
    if direct:
        return direct
    if state in {"zero", "neutral"}:
        return "ESTABLISHED_ALPHA_SOURCE"
    if not has_alpha:
        return "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE; upstream matte failures retained"
    if set_id == "a":
        return "LOCAL_BIREFNET_EXTRACTION_ALPHA; upstream candidate matte failure retained"
    return "OWNER_OVERRIDE_UNCERTIFIED_SEGMENTATION_ALPHA; upstream matte failures retained"


def transform_for(rel: str) -> str:
    if rel.startswith("masters/"):
        return "standardized master export"
    if rel.startswith("states/") and "/panels/" not in rel:
        return "full-state export"
    if rel.startswith(("heroes/", "hero/")):
        return "separately assembled responsive hero composition"
    if rel.startswith(("features/", "states/panels/")):
        return "runtime feature-panel composite"
    if rel.startswith("portraits/"):
        return "bust portrait crop/composite"
    if rel.startswith("social/"):
        return "social campaign composition"
    return "recorded downstream transform"


def add_asset(collection: list[dict], set_id: str, rel: str, source: str, alpha: str | None = None) -> None:
    repo_rel = path_for(set_id, rel)
    info = image_info(repo_rel)
    if info["format"] != "WEBP":
        raise ValueError(f"Expected WebP: {repo_rel}")
    state = state_for(rel)
    collection.append(
        {
            "set": set_id.upper(),
            "priority": priority(rel),
            "state": state,
            "path": repo_rel,
            **info,
            "source_provenance": source,
            "transform": transform_for(rel),
            "alpha_disclosure": alpha_note(set_id, state, info["has_alpha_channel"], alpha),
            "owner_authorization": OWNER_APPROVAL,
            "retained_guard_evidence": [
                "docs/lucy/production/v4/V4_INDEPENDENT_REVIEW.md",
                "docs/lucy/production/v4/V4_VALIDATION_REPORT.md",
                CANDIDATE_MANIFEST,
            ],
        }
    )


def build() -> dict:
    set_a = load("packages/site/src/assets/lucy/v4-approved/set-a/ASSET_MANIFEST.json")
    set_b = load("packages/site/src/assets/lucy/v4-approved/set-b/SET_B_ASSET_MANIFEST.json")
    set_c = load("packages/site/src/assets/lucy/v4-approved/set-c/PROVENANCE_AND_ASSEMBLY_MANIFEST.json")
    assets: list[dict] = []

    for item in set_a["mechanical_reopen"]["entries"]:
        repo_rel = item["path"]
        rel = repo_rel.split("/set-a/", 1)[1]
        state = state_for(rel)
        source = set_a["active_visual_sources"].get(state, "shared established source")
        add_asset(assets, "a", rel, f"candidate/source: {source}")

    for item in set_b["assets"]:
        add_asset(assets, "b", item["rel"], item["source"], item.get("alpha"))

    for item in set_c["outputs"]:
        rel = item["path"]
        state = state_for(rel)
        source = set_c["source_candidates"].get(state, "shared established source")
        alpha = None
        if not item["alpha"]:
            alpha = "OPAQUE_OWNER_APPROVED_PREVIEW_COMPOSITE; upstream matte failures retained"
        add_asset(assets, "c", rel, json.dumps(source, sort_keys=True) if isinstance(source, dict) else source, alpha)

    assets.sort(key=lambda item: (item["set"], item["priority"], item["path"]))
    counts = {key: sum(1 for asset in assets if asset["priority"] == key) for key in ("P0", "P1", "P2", "P3")}
    reusable_p2 = {
        "set_a": set_a["p0_p3_mapping"]["P2"]["reused_by_exact_path_reference"],
        "set_b": set_b["p2_reused_by_reference"],
        "set_c": set_c["reusable_asset_references"],
    }
    return {
        "schema": "lucy-v4-approved-collective/v1",
        "purpose": "Owner-authorized downstream registry for all A/B/C visual variations; it does not claim a pristine-alpha guard pass.",
        "owner_authorization": {"path": OWNER_APPROVAL, "scope": "all nine active v4 visual variations"},
        "retained_guard_evidence": {
            "candidate_gate": "STOP_ALL_NINE_ACTIVE_CANDIDATES_HARD_FAIL",
            "independent_review": "docs/lucy/production/v4/V4_INDEPENDENT_REVIEW.md",
            "validator": "docs/lucy/production/v4/V4_VALIDATION_REPORT.md",
            "candidate_manifest": CANDIDATE_MANIFEST,
            "rule": "Owner approval permits downstream use but never relabels retained automated or independent failures as passes.",
        },
        "brief_coverage": {
            "P0": "all three sets: canonical state masters, full-state surfaces, and independently assembled desktop/mobile hero pair",
            "P1": "all three sets: runtime panels/features and zero/heaven/hell/ultra/neutral busts",
            "P2": "reused by exact path reference; no duplicate workbench PNGs or copies",
            "P3": "all three sets: OG, square, portrait, and story WebPs",
        },
        "counts": {"production_webps": len(assets), "by_priority": counts, "production_pngs": 0},
        "sets": {
            "A": {"receipt": "docs/lucy/production/v4/downstream/SET-A.md", "manifest": "packages/site/src/assets/lucy/v4-approved/set-a/ASSET_MANIFEST.json"},
            "B": {"receipt": "docs/lucy/production/v4/downstream/SET-B.md", "manifest": "packages/site/src/assets/lucy/v4-approved/set-b/SET_B_ASSET_MANIFEST.json"},
            "C": {"receipt": "docs/lucy/production/v4/downstream/SET-C.md", "manifest": "packages/site/src/assets/lucy/v4-approved/set-c/PROVENANCE_AND_ASSEMBLY_MANIFEST.json"},
        },
        "reused_p2_exact_references": reusable_p2,
        "assets": assets,
    }


def showcase(manifest: dict) -> str:
    groups = []
    asset_prefix = "../../../../"
    for p in ("P0", "P1", "P3"):
        alpha_groups: dict[str, list[str]] = {}
        for asset in (item for item in manifest["assets"] if item["priority"] == p):
            src = asset_prefix + asset["path"]
            tile = f'''<article class="asset">
  <img loading="lazy" src="{html.escape(src)}" alt="{asset['set']} {asset['state']} {html.escape(Path(asset['path']).name)}" />
  <h3>Set {asset['set']} · {asset['state']}</h3>
  <p class="path">{html.escape(asset['path'])}</p>
  <dl><dt>Dimensions</dt><dd>{asset['dimensions'][0]}×{asset['dimensions'][1]}</dd><dt>Alpha</dt><dd>{html.escape(asset['alpha_disclosure'])}</dd><dt>Source</dt><dd>{html.escape(asset['source_provenance'])}</dd></dl>
</article>'''
            alpha_groups.setdefault(asset["alpha_disclosure"], []).append(tile)
        subgroups = "".join(
            f"<h3 class=\"alpha-status\">{html.escape(status)}</h3><div class=\"grid\">{''.join(tiles)}</div>"
            for status, tiles in sorted(alpha_groups.items())
        )
        groups.append(f"<section><h2>{p}</h2><p>{html.escape(manifest['brief_coverage'][p])}</p>{subgroups}</section>")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lucy v4 Approved Asset Showcase</title>
<style>body{{margin:0;background:#09111b;color:#e8f4ff;font:14px/1.45 system-ui,sans-serif}}main{{max-width:1600px;margin:auto;padding:32px}}h1{{font-size:34px}}h2{{margin-top:42px;color:#76dcff}}.alpha-status{{margin:24px 0 10px;padding:8px 10px;background:#17283a;border-left:3px solid #b16cff;font:600 12px/1.3 ui-monospace,monospace;overflow-wrap:anywhere}}.notice{{border:1px solid #b16cff;background:#20142a;padding:16px;border-radius:10px}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}}.asset{{background:#101c29;border:1px solid #29445c;border-radius:10px;overflow:hidden;padding-bottom:14px}}img{{width:100%;height:220px;object-fit:contain;background:repeating-conic-gradient(#233447 0 25%,#152233 0 50%) 50%/20px 20px}}.asset h3,.asset p,.asset dl{{margin:10px 12px}}.path,dd{{font-family:ui-monospace,monospace;font-size:11px;overflow-wrap:anywhere}}dl{{display:grid;grid-template-columns:88px 1fr;gap:4px}}dt{{color:#93aabe}}dd{{margin:0}}a{{color:#9ee5ff}}</style></head>
<body><main><h1>Lucy v4 approved visual asset showcase</h1>
<p>All three owner-approved character sets are shown here. Set labels refer to character-art sets, not Hero A/B layouts.</p>
<div class="notice"><strong>Evidence boundary:</strong> <a href="V4_OWNER_APPROVAL.md">owner approval</a> authorizes downstream use. It does not erase the <a href="V4_INDEPENDENT_REVIEW.md">independent STOP report</a>, <a href="V4_VALIDATION_REPORT.md">candidate validation</a>, or retained alpha disclosures below. P2 is a reusable exact-path reference library, not duplicated surfaces.</div>
<p>Production WebPs: {manifest['counts']['production_webps']} · P0: {manifest['counts']['by_priority']['P0']} · P1: {manifest['counts']['by_priority']['P1']} · P3: {manifest['counts']['by_priority']['P3']} · Production PNGs: 0</p>
{''.join(groups)}
<section><h2>P2</h2><p>{html.escape(manifest['brief_coverage']['P2'])}</p><pre>{html.escape(json.dumps(manifest['reused_p2_exact_references'], indent=2))}</pre></section>
</main></body></html>'''


if __name__ == "__main__":
    manifest = build()
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    OUT_SHOWCASE.write_text(showcase(manifest))
    print(f"wrote {OUT_MANIFEST.relative_to(ROOT)} and {OUT_SHOWCASE.relative_to(ROOT)} ({manifest['counts']['production_webps']} WebPs)")
