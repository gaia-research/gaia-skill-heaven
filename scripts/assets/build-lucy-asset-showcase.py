#!/usr/bin/env python3
"""Build the internal Lucy brief-to-asset showcase and brandkit manifest."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
LUCY = ROOT / "packages/site/src/assets/lucy"
OUT = ROOT / "docs/lucy/production/frontpage"
HTML = OUT / "LUCY_ASSET_SHOWCASE.html"
BRANDKIT = LUCY / "brandkit/APPROVED_BRANDKIT_MANIFEST.json"
GUARDS = OUT / "LUCY_GUARD_REVIEW.md"


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def category(path: Path) -> str:
    rel = relative(path)
    for name in ("authority", "masters", "hero", "states", "panels", "portraits", "mobile", "backgrounds", "social", "katana", "expressions", "eyes", "ribbons", "wings", "shards", "fx", "identity", "models"):
        if f"/{name}/" in rel or rel.endswith(f"/{name}.webp"):
            return name
    return "other"


def state(path: Path) -> str:
    name = path.name.lower()
    for item in ("zero", "heaven", "hell", "ultra", "neutral"):
        if item in name:
            return item
    return "shared"


def disposition(path: Path) -> tuple[str, str]:
    rel = relative(path)
    if "/authority/" in rel:
        return "approved", "canonical authority"
    if "/frontpage/katana-authority-v2/" in rel:
        return "approved", "focused authority katana pack"
    if "/v3/" in rel:
        if any(token in rel for token in ("/backgrounds/", "/fx/")):
            return "approved-static", "character-free deterministic plate retained during v4"
        return "rejected-reference", "owner-rejected v3 character matte or character-bearing derivative"
    if "/frontpage/variation-" in rel:
        if any(token in rel for token in ("/backgrounds/", "/fx/")):
            return "approved-static", "character-free front-page atmosphere retained during v4"
        if path.suffix.lower() == ".svg" and "/identity/" in rel:
            return "approved-static", "character-free deterministic vector identity"
        if any(token in rel for token in ("/components/wings/", "/components/ribbons/", "/components/shards/")):
            return "reference-only", "retained modular candidate; full-body frontend does not consume it"
        return "blocked-derived", "contains or may contain owner-rejected v3 character pixels; rebuild after v4 selection"
    if any(token in rel for token in ("/states/lucy-zero", "/portraits/lucy-zero", "/portraits/lucy-neutral", "/models/lucy-neutral", "/components/expressions/", "/components/eyes/", "/fx/")):
        return "approved", "retained v1 shared/Zero source with alpha audit"
    if "/identity/" in rel and path.suffix.lower() == ".svg":
        return "approved", "deterministic vector identity"
    return "reference-only", "retained for recovery and comparison"


def metadata(path: Path) -> dict:
    result = {"path": relative(path), "bytes": path.stat().st_size, "category": category(path), "state": state(path)}
    status, note = disposition(path)
    result.update(status=status, note=note)
    if path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg"}:
        with Image.open(path) as image:
            result.update(width=image.width, height=image.height, format=image.format, alpha="A" in image.getbands())
    else:
        result.update(format="SVG", alpha=True)
    return result


def collect() -> list[dict]:
    paths: set[Path] = set()
    paths.update((LUCY / "authority").glob("*"))
    paths.update((LUCY / "v3").rglob("*.webp"))
    paths.update((LUCY / "frontpage/katana-authority-v2").glob("*.webp"))
    for variation in ("variation-a", "variation-b"):
        base = LUCY / "frontpage" / variation
        paths.update(base.rglob("*.webp"))
        paths.update(base.rglob("*.svg"))
    for pattern in (
        "states/lucy-zero.webp", "states/panels/lucy-zero-panel.webp",
        "portraits/lucy-zero.webp", "portraits/lucy-neutral.webp", "models/lucy-neutral.webp",
        "components/expressions/*.webp", "components/eyes/*.webp", "components/ribbons/*.webp",
        "components/wings/*.webp", "components/shards/*.webp", "fx/*.webp", "identity/*.webp", "identity/*.svg",
    ):
        paths.update(LUCY.glob(pattern))
    return [metadata(path) for path in sorted(path for path in paths if path.is_file())]


BRIEF = [
    ("P0", "Canonical master sheet", "authority/lucy-character-sheet-master.png", "approved"),
    ("P0", "Primary homepage hero", "frontpage/variation-a/hero/lucy-primary.webp", "blocked-derived"),
    ("P0", "Alternate homepage hero", "frontpage/variation-a/hero/lucy-alternate.webp", "blocked-derived"),
    ("P0", "Zero full state", "states/lucy-zero.webp", "approved"),
    ("P0", "Heaven full state", "v3/states/lucy-heaven.webp", "rejected-reference"),
    ("P0", "Hell registered full state", "v3/states/lucy-hell.webp", "rejected-reference"),
    ("P0", "Ultra full state", "v3/states/lucy-ultra.webp", "rejected-reference"),
    ("P0", "Responsive hero pair", "frontpage/variation-a/hero/", "blocked-derived"),
    ("P1", "Four-state panels", "frontpage/variation-a/states/panels/", "blocked-derived"),
    ("P1", "State + neutral portraits", "frontpage/variation-a/portraits/", "blocked-derived"),
    ("P1", "Modular hair pack", "frontpage/variation-a/components/hair/INVENTORY.json", "gap"),
    ("P1", "Ribbon pack", "frontpage/variation-a/components/ribbons/", "reference-only"),
    ("P1", "Wing / shard pack", "frontpage/variation-a/components/wings/", "reference-only"),
    ("P1", "Authority katana pack", "frontpage/katana-authority-v2/", "approved"),
    ("P1", "Eye pack", "frontpage/variation-b/components/eyes/", "approved-derived"),
    ("P2", "Shard + optical FX", "frontpage/variation-a/fx/", "approved-static"),
    ("P2", "Background plates", "frontpage/variation-a/backgrounds/", "approved-static"),
    ("P2", "Dividers + state icons", "frontpage/variation-a/identity/", "mixed-review"),
    ("P3", "OpenGraph 1200x630", "frontpage/variation-a/social/lucy-og-1200x630.webp", "blocked-derived"),
    ("P3", "Social square 1080", "frontpage/variation-a/social/lucy-square-1080.webp", "blocked-derived"),
    ("P3", "Social portrait 1080x1350", "frontpage/variation-a/social/lucy-portrait-1080x1350.webp", "blocked-derived"),
    ("P3", "Story 1080x1920", "frontpage/variation-a/social/lucy-story-1080x1920.webp", "blocked-derived"),
]


def html(inventory: list[dict]) -> str:
    data = json.dumps({"inventory": inventory, "brief": [dict(priority=p, item=i, path=x, status=s) for p, i, x, s in BRIEF]}, separators=(",", ":"))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lucy asset + brief showcase</title><style>
:root{{--ink:#eef4ff;--muted:#94a3b8;--line:#263244;--blue:#7cc4ff;--pink:#ff183b;--gold:#ffd24a;--bg:#070a11;--panel:#0d1320}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}} a{{color:var(--blue)}}
header,main{{max-width:1600px;margin:auto;padding:28px}} header{{position:sticky;top:0;z-index:8;background:rgba(7,10,17,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(16px)}}
h1,h2,h3,p{{margin:0 0 12px}} h1{{font-size:clamp(28px,4vw,64px);letter-spacing:-.06em}} h2{{margin-top:42px;font-size:24px}} .muted{{color:var(--muted)}}
.summary,.guards,.brief{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}} .panel,.guard,.brief-card,.asset{{border:1px solid var(--line);background:var(--panel)}}
.panel,.guard,.brief-card{{padding:16px}} .pass{{color:#7fffb5}} .gap,.fail,.blocked-derived,.rejected-reference,.mixed-review{{color:#ff7a93}} .reference-only{{color:#f7c76a}} .approved,.approved-derived,.approved-static{{color:#7fffb5}}
.guard img{{width:100%;height:420px;object-fit:contain;background:repeating-conic-gradient(#192334 0 25%,#34445d 0 50%) 0/36px 36px;border:1px solid var(--line)}}
.filters{{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}} input,select{{border:1px solid var(--line);background:#090e18;color:var(--ink);padding:10px 12px}}
input{{min-width:min(520px,100%)}} .gallery{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}}
.asset{{min-width:0}} .asset figure{{margin:0;height:240px;display:grid;place-items:center;overflow:hidden;background:repeating-conic-gradient(#111927 0 25%,#2a3850 0 50%) 0/32px 32px}}
.asset img{{display:block;max-width:100%;max-height:100%;object-fit:contain}} .asset-body{{padding:12px}} code{{font-size:11px;overflow-wrap:anywhere;color:#c8d4e8}}
.badge{{display:inline-block;padding:2px 7px;border:1px solid currentColor;border-radius:999px;font-size:10px;margin:0 5px 6px 0}} table{{width:100%;border-collapse:collapse}} td,th{{text-align:left;padding:9px;border-bottom:1px solid var(--line);vertical-align:top}}
@media(max-width:640px){{header,main{{padding:18px}}.guard img{{height:320px}}}}
</style></head><body>
<header><h1>Lucy / candidate recovery stack</h1><p class="muted">Internal static artifact · v3 character masters are owner-rejected. V4 candidate selection is active; no Heaven/Hell/Ultra character is approved yet.</p></header>
<main><section class="summary">
<div class="panel"><strong>Registered bodies</strong><p class="fail">V3 Heaven/Hell lose opaque head information. V3 Ultra carries 21,372 exterior magenta-fringe pixels. All three are rejected references.</p></div>
<div class="panel"><strong>Frontend</strong><p class="fail">The prototype still imports rejected v3 characters. Character-bearing derivatives are blocked until owner-selected v4 rebuild.</p></div>
<div class="panel"><strong>Known gap</strong><p>Isolated hair layers do not exist. Flattened v3 wing/ribbon/shard crops stay reference-only and are not consumed by the hero.</p></div>
<div class="panel"><strong>V4 gate</strong><p class="fail">Active: three Heaven/Hell/Ultra candidate sets, independent review, then owner selection.</p><p>No downstream rebuild before selection.</p></div>
</section>
<h2>Guard review</h2><section class="guards" id="guards"></section>
<h2>Front-page brief correlation</h2><section class="brief" id="brief"></section>
<h2>Whole brandkit inventory</h2><p class="muted">Default filter shows approved assets. Switch status to reference-only to inspect retained candidates and source gaps.</p>
<div class="filters"><input id="search" type="search" placeholder="Filter path, category, state"><select id="status"><option value="approved-set">approved set</option><option value="all">all</option><option value="approved">approved</option><option value="approved-static">approved-static</option><option value="blocked-derived">blocked-derived</option><option value="rejected-reference">rejected-reference</option><option value="reference-only">reference-only</option></select><select id="source"><option value="all">all sources</option><option value="v3">v3</option><option value="variation-a">variation A</option><option value="variation-b">variation B</option><option value="katana">katana</option><option value="shared">shared/authority</option></select><span id="count" class="muted"></span></div>
<section class="gallery" id="gallery"></section></main>
<script>const DATA={data}; const rootPrefix='../../../../';
const guardData=[
{{name:'Zero',status:'PASS',path:'packages/site/src/assets/lucy/states/lucy-zero.webp',note:'Seated, closed eyes, one katana, no wings/shards. Mixed alpha verified; hidden green RGB is not visible in normal/dark composites.'}},
{{name:'Heaven v3',status:'FAIL',path:'packages/site/src/assets/lucy/v3/masters/lucy-heaven.webp',note:'Owner-rejected: face/head/hair are ghosted by low alpha. Tight face core has only 6.625% of pixels at alpha 192 or higher.'}},
{{name:'Hell v3',status:'FAIL',path:'packages/site/src/assets/lucy/v3/masters/lucy-hell.webp',note:'Owner-rejected: shares the defective Heaven head alpha. Registration and inversion cannot rescue a missing matte.'}},
{{name:'Ultra v3',status:'FAIL',path:'packages/site/src/assets/lucy/v3/masters/lucy-ultra.webp',note:'Owner-rejected: 21,372 strong-magenta pixels remain in the exterior partial-alpha band.'}}];
const url=p=>rootPrefix+p; document.querySelector('#guards').innerHTML=guardData.map(g=>`<article class="guard"><span class="badge ${{g.status==='PASS'?'pass':'fail'}}">${{g.status}}</span><h3>${{g.name}}</h3><img loading="lazy" src="${{url(g.path)}}" alt="${{g.name}}"><p>${{g.note}}</p><code>${{g.path}}</code></article>`).join('');
document.querySelector('#brief').innerHTML=DATA.brief.map(x=>`<article class="brief-card"><span class="badge ${{x.status}}">${{x.priority}} · ${{x.status}}</span><h3>${{x.item}}</h3><code>packages/site/src/assets/lucy/${{x.path}}</code></article>`).join('');
const search=document.querySelector('#search'), status=document.querySelector('#status'), source=document.querySelector('#source'), gallery=document.querySelector('#gallery'), count=document.querySelector('#count');
function sourceOf(p){{if(p.includes('/v3/'))return'v3';if(p.includes('/variation-a/'))return'variation-a';if(p.includes('/variation-b/'))return'variation-b';if(p.includes('katana-authority'))return'katana';return'shared'}}
function draw(){{const q=search.value.toLowerCase();const rows=DATA.inventory.filter(x=>{{const approved=['approved','approved-derived','approved-static'].includes(x.status);const statusOK=status.value==='all'||(status.value==='approved-set'&&approved)||x.status===status.value;return statusOK&&(source.value==='all'||sourceOf(x.path)===source.value)&&(`${{x.path}} ${{x.category}} ${{x.state}}`.toLowerCase().includes(q))}});count.textContent=`${{rows.length}} / ${{DATA.inventory.length}} assets`;gallery.innerHTML=rows.map(x=>`<article class="asset"><figure><img loading="lazy" src="${{url(x.path)}}" alt=""></figure><div class="asset-body"><span class="badge ${{x.status}}">${{x.status}}</span><span class="badge">${{x.state}}</span><span class="badge">${{x.category}}</span><p><code>${{x.path}}</code></p><p class="muted">${{x.width?`${{x.width}}×${{x.height}} · `:''}}${{x.note}}</p></div></article>`).join('')}}
[search,status,source].forEach(x=>x.addEventListener('input',draw));draw();</script></body></html>"""


def main() -> None:
    inventory = collect()
    approved = [item for item in inventory if item["status"] in {"approved", "approved-derived", "approved-static"}]
    references = [item for item in inventory if item["status"] not in {"approved", "approved-derived", "approved-static"}]
    manifest = {
        "version": "lucy-approved-brandkit/v1-recovery-gate",
        "character_authority": None,
        "frontend_stack": "blocked pending owner-selected v4 character set",
        "policy": "v3 character masters and character-bearing derivatives are rejected; character-free plates, Zero/shared sources, authority, and authority katanas remain eligible",
        "approved_count": len(approved),
        "reference_count": len(references),
        "approved": approved,
        "reference_only": references,
        "brief_correlation": [dict(priority=p, item=i, path=f"packages/site/src/assets/lucy/{x}", status=s) for p, i, x, s in BRIEF],
    }
    BRANDKIT.parent.mkdir(parents=True, exist_ok=True)
    BRANDKIT.write_text(json.dumps(manifest, indent=2) + "\n")
    OUT.mkdir(parents=True, exist_ok=True)
    HTML.write_text(html(inventory))
    GUARDS.write_text("""# Lucy Full-Body Guard Review

Status: **FAIL — owner rejection supersedes the prior v3 pass.**

## Review scope

- Direct visual review of Zero plus the v3 Heaven, registered Hell, and Ultra masters.
- Normal and dark transparency composites for Zero, Heaven, Hell, and recovered Ultra.
- Mechanical v3 gates: WebP reopen, alpha, exterior-green, registered inversion, bounded Hell face edit, and upper-silhouette occupancy.
- Front-page source audit: v2 character paths removed from both exporters and the React hero.

## State results

| State | Anatomy / modesty | State contract | Alpha / inversion | Result |
|---|---|---|---|---|
| Zero | seated anatomy readable; opaque skirt | closed eyes, one katana, no wings or shards | mixed alpha; normal/dark composites clean | PASS |
| Heaven | anatomy count was previously accepted | state art present | face/head/hair are present in RGB but ghosted by low alpha; face-core alpha-density gate fails | FAIL |
| Hell | registered to Heaven | inversion and face edit present | byte-identical defective Heaven alpha; head loss remains | FAIL |
| Ultra | anatomy count was previously accepted | Ultra state art present | 21,372 strong-magenta exterior partial-alpha pixels | FAIL |

## Corrected review finding

The prior occupancy-based validator was insufficient. Heaven's nominal head
occupancy hid a median nonzero alpha of only 38 in the reviewed head/hair ROI,
while its tight face core has only 6.625 percent of pixels at alpha 192 or
higher. Ultra's checker reconstruction promoted magenta plate contamination.
Both failures are now regression controls in
`scripts/assets/test-lucy-matte-guard.py`.

Zero's source retains green RGB under transparent pixels, which a raw-channel
viewer can display as green. Its normal and dark composites show that the alpha
field is valid; this is not a visible production matte.

## Recovery disposition

- All v3 Heaven/Hell/Ultra character pixels and character-bearing derivatives
  are rejected references, not approved brandkit assets.
- Character-free background/FX plates, Zero/shared sources, canonical authority,
  and the authority katana pack remain eligible.
- V4 is an active three-set owner candidate gate. No downstream rebuild or live
  import change occurs before owner selection.
""")
    print(f"Showcase: {len(inventory)} assets; approved set: {len(approved)}; references: {len(references)}")


if __name__ == "__main__":
    main()
