#!/usr/bin/env python3
"""Build the owner-facing v4 candidate gate without promoting any candidate."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "packages/site/src/assets/lucy/v4-candidates"
MANIFEST = BASE / "CANDIDATE_MANIFEST.json"
CONTACT = BASE / "LUCY_V4_CANDIDATE_CONTACT_SHEET.webp"
HTML = ROOT / "docs/lucy/production/v4/LUCY_V4_CANDIDATE_REVIEW.html"
REVIEW = ROOT / "docs/lucy/production/v4/V4_INDEPENDENT_REVIEW.json"


def repo_path(relative: str) -> Path:
    return ROOT / relative


def art_status(candidate: dict) -> tuple[str, list[str]]:
    checks = candidate["self_review"]["checks"]
    failures = []
    for key in ("identity", "anatomy_counts", "modesty", "state", "state_face_edit", "weapon_count_and_construction", "pose_quality"):
        value = checks.get(key)
        if value and str(value).startswith("FAIL"):
            failures.append(f"{key}: {value}")
    return ("FAIL", failures) if failures else ("PASS", [])


def contact_sheet(candidates: list[dict]) -> None:
    by_id = {item["id"]: item for item in candidates}
    cell_w, cell_h, title_h, gap = 320, 480, 42, 24
    sheet = Image.new("RGB", (cell_w * 3 + gap * 4, (cell_h + title_h) * 3 + gap * 4), (7, 10, 17))
    draw = ImageDraw.Draw(sheet)
    for row, set_name in enumerate(("A", "B", "C")):
        for column, state in enumerate(("heaven", "hell", "ultra")):
            candidate = by_id[f"{state}-{set_name}"]
            source = Image.open(repo_path(candidate["visual_preview_path"])).convert("RGB")
            source.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
            left = gap + column * (cell_w + gap) + (cell_w - source.width) // 2
            top = gap + row * (cell_h + title_h + gap) + title_h
            sheet.paste(source, (left, top))
            visual, _ = art_status(candidate)
            color = (126, 255, 181) if visual == "PASS" else (255, 122, 147)
            draw.text((gap + column * (cell_w + gap), top - 29), f"OWNER APPROVED / {set_name} {state.upper()} / GUARD {visual}", fill=color)
    CONTACT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CONTACT, "WEBP", quality=92, method=6)


def build_html(manifest: dict, independent: dict | None) -> str:
    payload = json.dumps({"manifest": manifest, "independent": independent}, separators=(",", ":"))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lucy v4 candidate gate</title><style>
:root{{--bg:#070a11;--panel:#0d1320;--ink:#eef4ff;--muted:#94a3b8;--line:#263244;--blue:#7cc4ff;--pink:#ff7a93;--gold:#ffd24a;--green:#7fffb5}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}}header,main{{max-width:1560px;margin:auto;padding:26px}}header{{position:sticky;top:0;z-index:4;background:rgba(7,10,17,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}}
h1,h2,h3,p{{margin:0 0 10px}}h1{{font-size:clamp(28px,5vw,62px);letter-spacing:-.06em}}h2{{margin-top:40px}}.muted{{color:var(--muted)}}.fail{{color:var(--pink)}}.pass{{color:var(--green)}}
.summary,.sets{{display:grid;gap:14px}}.summary{{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}}.sets{{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}}.panel,.set,.card{{border:1px solid var(--line);background:var(--panel);padding:16px}}
.states{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}figure{{margin:0;background:repeating-conic-gradient(#182233 0 25%,#2f4059 0 50%) 0/32px 32px;min-height:340px;display:grid;place-items:center;overflow:hidden}}figure img{{width:100%;height:100%;max-height:520px;object-fit:contain}}.badge{{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:2px 7px;margin:0 5px 6px 0;font-size:10px}}
code{{font-size:11px;color:#c8d4e8;overflow-wrap:anywhere}}ul{{padding-left:18px}}.contact{{max-width:100%;display:block;border:1px solid var(--line)}}.stop{{border-color:#7b2636;background:#1a0e15}}
@media(max-width:720px){{header,main{{padding:16px}}.sets{{grid-template-columns:1fr}}.states{{grid-template-columns:1fr}}figure{{min-height:480px}}}}
</style></head><body>
<header><h1>Lucy v4 / owner-approved variations</h1><p class="pass">OWNER APPROVED: all nine visual variations may feed downstream production. Automated and independent guard failures remain visible evidence.</p></header>
<main><section class="summary">
<div class="panel"><strong>Generation accounting</strong><p>18 total `gpt-image-2` calls · 9 guard-triggered replacements · 9 active candidates · 9 superseded Hell references preserved. No unbriefed call was made.</p></div>
<div class="panel"><strong>Hell strategy</strong><p>Each active Hell is an exact full RGB inversion of a separately generated Heaven-palette source with natural closed lids and one continuous complementary-cyan tear from eyelid through the full cheek. There is no post-inversion edit or recolor.</p></div>
<div class="panel"><strong>Matte result</strong><p id="matte-summary" class="fail"></p></div>
<div class="panel"><strong>Art-only shortlist</strong><p>Read each card and the independent report. A visual pass never overrides an alpha, anatomy, modesty, state, weapon, or continuous-tear failure.</p></div>
<div class="panel"><strong>Owner decision</strong><p class="pass">All sets A, B, and C are approved for downstream use. This override authorizes production without rewriting failed alpha, edge, framing, or tear checks as passes.</p></div>
</section>
<h2>All nine active previews</h2><img class="contact" src="../../../../packages/site/src/assets/lucy/v4-candidates/LUCY_V4_CANDIDATE_CONTACT_SHEET.webp" alt="Lucy v4 candidate contact sheet">
<h2>Set comparison</h2><section id="sets" class="sets"></section>
<h2>Independent reviewer</h2><section id="review" class="panel"></section>
<h2>Hard boundary</h2><section class="panel stop"><p>V3 remains rejected reference. These candidate WebPs are owner-approved visual sources, not guard-certified alpha masters. Downstream receipts must cite the owner override, preserve provenance, and report every deterministic matte/composite transform honestly.</p></section>
</main><script>const DATA={payload};const prefix='../../../../';
const bySet={{A:[],B:[],C:[]}};DATA.manifest.candidates.forEach(c=>bySet[c.set].push(c));
const order={{heaven:0,hell:1,ultra:2}};function art(c){{const keys=['identity','anatomy_counts','modesty','state','state_face_edit','weapon_count_and_construction','pose_quality'];const bad=keys.flatMap(k=>String(c.self_review.checks[k]||'').startsWith('FAIL')?[`${{k}}: ${{c.self_review.checks[k]}}`]:[]);return{{status:bad.length?'FAIL':'PASS',bad}}}}
document.querySelector('#matte-summary').textContent=`${{DATA.manifest.alpha_deliverable_count}} / 9 active alpha deliverables passed the fail-closed matte gate. No candidate is promoted before owner selection.`;
document.querySelector('#sets').innerHTML=Object.entries(bySet).map(([set,items])=>{{items.sort((a,b)=>order[a.state]-order[b.state]);return`<article class="set"><h3>Set ${{set}}</h3><div class="states">${{items.map(c=>{{const a=art(c);const alpha=c.review_webp_path?'PASS':'FAIL';return`<div class="card"><span class="badge pass">OWNER APPROVED</span><span class="badge ${{a.status==='PASS'?'pass':'fail'}}">GUARD ART ${{a.status}}</span><span class="badge ${{alpha==='PASS'?'pass':'fail'}}">GUARD ALPHA ${{alpha}}</span><figure><img src="${{prefix+c.visual_preview_path}}" alt="${{c.id}}"></figure><h3>${{c.id}}</h3>${{a.bad.length?`<ul>${{a.bad.map(x=>`<li>${{x}}</li>`).join('')}}</ul>`:'<p class="pass">Worker visual guards pass. Owner approved this variation for downstream use.</p>'}}<code>${{c.visual_preview_path}}</code></div>`}}).join('')}}</div></article>`}}).join('');
const review=DATA.independent;document.querySelector('#review').innerHTML=review?`<p><strong>${{review.overall_status||review.status}}</strong></p><pre>${{JSON.stringify(review,null,2)}}</pre>`:'<p class="muted">Independent review is still running. Regenerate this artifact after its JSON lands.</p>';
</script></body></html>"""


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    assert manifest["generated_call_count"] == 18
    assert manifest["replacement_call_count"] == 9
    assert len(manifest["candidates"]) == 9
    assert len(manifest.get("superseded_candidates", [])) == 9
    for candidate in manifest["candidates"]:
        assert repo_path(candidate["visual_preview_path"]).is_file()
        if candidate["review_webp_path"] is not None:
            assert repo_path(candidate["review_webp_path"]).is_file()
    assert manifest["alpha_deliverable_count"] == sum(
        candidate["review_webp_path"] is not None for candidate in manifest["candidates"]
    )
    independent = json.loads(REVIEW.read_text()) if REVIEW.is_file() else None
    contact_sheet(manifest["candidates"])
    HTML.parent.mkdir(parents=True, exist_ok=True)
    HTML.write_text(build_html(manifest, independent))
    print(json.dumps({
        "manifest_status": manifest["status"],
        "candidate_count": len(manifest["candidates"]),
        "art_pass_count": sum(art_status(item)[0] == "PASS" for item in manifest["candidates"]),
        "alpha_deliverable_count": manifest["alpha_deliverable_count"],
        "independent_review": bool(independent),
    }, indent=2))


if __name__ == "__main__":
    main()
