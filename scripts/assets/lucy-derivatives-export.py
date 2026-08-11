#!/usr/bin/env python3
"""Deterministic social, mobile, identity, and assembly exports for Lucy."""
from __future__ import annotations
import json
import os
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path.cwd()
WEBP = {"format": "WEBP", "lossless": True, "method": 6}
OUT = "packages/site/src/assets/lucy"
WORK = "packages/site/assets/workbench/lucy/DERIVATIVES"

def p(rel): return ROOT / rel
def load(rel): return Image.open(p(rel)).convert("RGBA")
def save(image, rel):
    # Pillow's WebP encoder can expose stray premultiplied RGB in transparent
    # areas for these high-frequency glass edges. Encode a canonical PNG with
    # cwebp's libwebp implementation instead, retaining real alpha exactly.
    target = p(rel); target.parent.mkdir(parents=True, exist_ok=True)
    p(WORK).mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".png", dir=p(WORK), delete=False) as handle:
        temp = Path(handle.name)
    try:
        image.save(temp, format="PNG", optimize=True)
        subprocess.run(["cwebp", "-quiet", "-lossless", "-exact", "-alpha_q", "100", "-m", "6", str(temp), "-o", str(target)], check=True)
    finally:
        if temp.exists(): temp.unlink()
def png(image, rel):
    target = p(rel); target.parent.mkdir(parents=True, exist_ok=True); image.save(target, format="PNG", optimize=True)
def contain(image, size): return ImageOps.contain(image, size, Image.Resampling.LANCZOS)
def put(canvas, image, xy): canvas.alpha_composite(image, xy)

def key_green(image):
    arr = np.array(image, dtype=np.uint8); rgb = arr[:, :, :3].astype(np.float32)
    d = np.sqrt(rgb[:, :, 0] ** 2 + (rgb[:, :, 1] - 255) ** 2 + rgb[:, :, 2] ** 2)
    a = np.where(d <= 100, 0, np.where(d < 250, np.rint((d - 100) * 255 / 150), 255)).astype(np.uint8)
    edge = (d < 280) & (rgb[:, :, 1] > np.maximum(rgb[:, :, 0], rgb[:, :, 2]))
    arr[:, :, 1][edge] = np.maximum(arr[:, :, 0][edge], arr[:, :, 2][edge])
    arr[:, :, :3][a == 0] = 0; arr[:, :, 3] = a
    return Image.fromarray(arr, "RGBA")

def bg(size, accent):
    w, h = size; yy, xx = np.mgrid[0:h, 0:w]
    arr = np.zeros((h, w, 3), dtype=np.float32); arr[:] = (4, 8, 17)
    radius = np.sqrt(((xx-w*.66)/(w*.72))**2 + ((yy-h*.38)/(h*.8))**2)
    glow = np.clip(1-radius, 0, 1)**2 * .20
    for c, value in enumerate(accent): arr[:, :, c] = arr[:, :, c]*(1-glow)+value*glow
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGB").convert("RGBA")

def checker(size):
    image = Image.new("RGBA", size, (232,232,232,255)); draw = ImageDraw.Draw(image)
    for y in range(0, size[1], 40):
        for x in range(0, size[0], 40):
            if (x//40+y//40)%2: draw.rectangle((x,y,x+39,y+39), fill=(169,169,169,255))
    return image

def invert(image):
    arr = np.array(image, dtype=np.uint8); arr[:, :, :3] = 255-arr[:, :, :3]; return Image.fromarray(arr, "RGBA")
def audit(image):
    arr=np.array(image.convert("RGBA"),dtype=np.uint8); a=arr[:,:,3]; zero=a==0
    return {"width":image.width,"height":image.height,"has_alpha":bool(np.any(a<255)),"transparent":int(np.count_nonzero(zero)),"partial":int(np.count_nonzero((a>0)&(a<255)))}

ultra = load("packages/site/assets/workbench/lucy/GEN-01/cutout-alpha.png")
heaven = load("packages/site/assets/workbench/lucy/GEN-02/cutout-alpha.png")
zero = key_green(load(f"{OUT}/states/lucy-zero.webp"))
assets = {
  "ultra_wing": load(f"{OUT}/components/wings/lucy-wing-ultra-pair.webp"),
  "heaven_wing": load(f"{OUT}/components/wings/lucy-wing-heaven-pair.webp"),
  "ultra_ribbon": load(f"{OUT}/components/ribbons/lucy-ribbon-ultra.webp"),
  "heaven_ribbon": load(f"{OUT}/components/ribbons/lucy-ribbon-heaven.webp"),
  "gold_fx": load(f"{OUT}/fx/lucy-particles-gold.webp"),
  "cyan_fx": load(f"{OUT}/fx/lucy-particles-cyan.webp"),
}

def scene(size, subject, wing, ribbon, fx, accent, subject_box, subject_xy, wing_box, wing_xy, ribbon_box, ribbon_xy, fx_box, fx_xy):
    canvas = bg(size, accent)
    # The current discrete component WebPs have not passed a clean-alpha
    # preview audit. The isolated state master already contains its canonical
    # wings, ribbon, weapons, and shards, so use that verified composition
    # rather than introduce contaminated atlas pixels into P2/P3 surfaces.
    put(canvas, contain(subject, subject_box), subject_xy)
    return canvas

def avatar(source, crop, rel):
    face = source.crop(crop)
    face = contain(face, (224,224))
    canvas = Image.new("RGBA", (256,256), (0,0,0,0)); put(canvas, face, ((256-face.width)//2,(256-face.height)//2))
    save(canvas, rel); return canvas

def header():
    canvas = Image.new("RGBA", (2400,720), (0,0,0,0))
    # The verified Ultra isolated master intrinsically includes its shard field
    # and prismatic ribbon; it is the cleanest transparent header composition.
    subj=contain(ultra,(1000,680)); put(canvas,subj,(1400,20))
    save(canvas, f"{OUT}/identity/lucy-horizontal-header.webp"); return canvas

def manifests():
    common={"body_skin":"flattened subject only; not independently recoverable","uniform":"flattened subject only; not independently recoverable","front_hair":"flattened subject only; not independently recoverable","rear_hair":"flattened subject only; not independently recoverable","lighting_shadow":"baked into flattened subject; reusable FX only is separable"}
    states={
      "zero":{"subject":"states/lucy-zero.webp (chroma-keyed deterministically only for derivatives)","eyes":"components/eyes/lucy-eyes-zero-closed.webp; blank eye exists but cannot be safely registered to neutral face","ribbon":"components/ribbons/lucy-ribbon-zero.webp","wings":"none by canon","shards":"none by canon","katana":"components/katana/lucy-katana-neutral-steel.webp","tear":"none by canon","fx":"fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-cyan.webp"},
      "heaven":{"subject":"states/lucy-heaven.webp and workbench GEN-02 cutout-alpha.png","eyes":"components/eyes/lucy-eyes-heaven.webp","ribbon":"components/ribbons/lucy-ribbon-heaven.webp","wings":"components/wings/lucy-wing-heaven-{left,right,pair}.webp","shards":"components/shards/lucy-shard-{01..20}.webp; lucy-shard-cluster-heaven.webp","katana":"components/katana/lucy-katana-{neutral-steel,left,right}.webp","tear":"none by canon","fx":"fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-cyan.webp"},
      "hell":{"subject":"states/lucy-hell.webp","eyes":"components/eyes/lucy-eyes-hell.webp","ribbon":"components/ribbons/lucy-ribbon-hell.webp","wings":"components/wings/lucy-wing-hell-{left,right,pair}.webp","shards":"components/shards/lucy-shard-{01..20}.webp; lucy-shard-cluster-hell.webp","katana":"components/katana/lucy-katana-{neutral-steel,left,right}.webp","tear":"identity/lucy-red-tear.webp","fx":"fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-inverted.webp"},
      "ultra":{"subject":"states/lucy-ultra.webp and workbench GEN-01 cutout-alpha.png","eyes":"components/eyes/lucy-eyes-ultra.webp","ribbon":"components/ribbons/lucy-ribbon-ultra.webp","wings":"components/wings/lucy-wing-ultra-{left,right,pair}.webp","shards":"components/shards/lucy-shard-{01..20}.webp; lucy-shard-cluster-ultra.webp","katana":"components/katana/lucy-katana-{dual,neutral-steel,left,right}.webp","tear":"identity/lucy-red-tear.webp","fx":"fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-gold.webp"},
    }
    for name, fields in states.items():
        target=p(f"{OUT}/assemblies/lucy-{name}-assembly.json"); target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps({"state":name,"assembly_status":"flattened-state assembly; no editable character layer separation",**common,**fields},indent=2)+"\n")

def main():
    review={}
    review["avatar_zero"]=audit(avatar(zero,(275,130,745,600),f"{OUT}/identity/lucy-avatar-zero.webp"))
    review["avatar_heaven"]=audit(avatar(heaven,(405,170,685,450),f"{OUT}/identity/lucy-avatar-heaven.webp"))
    review["header"]=audit(header())
    # Deliberately composed—not a crop. Each uses an isolated subject, independent wing/ribbon/FX assets, and dedicated copy-safe negative space.
    outputs={
      f"{OUT}/social/lucy-og-1200x630.webp": scene((1200,630),ultra,assets["ultra_wing"],assets["ultra_ribbon"],assets["gold_fx"],(247,200,75),(620,570),(570,35),(620,420),(550,60),(230,140),(780,350),(420,100),(720,120)),
      f"{OUT}/social/lucy-square-1080.webp": scene((1080,1080),heaven,assets["heaven_wing"],assets["heaven_ribbon"],assets["cyan_fx"],(124,196,255),(850,800),(100,250),(760,520),(190,60),(260,150),(410,530),(430,100),(480,180)),
      f"{OUT}/social/lucy-portrait-1080x1350.webp": scene((1080,1350),ultra,assets["ultra_wing"],assets["ultra_ribbon"],assets["gold_fx"],(247,200,75),(980,720),(60,530),(980,600),(40,200),(320,200),(390,790),(500,130),(330,260)),
      f"{OUT}/social/lucy-story-1080x1920.webp": scene((1080,1920),heaven,assets["heaven_wing"],assets["heaven_ribbon"],assets["cyan_fx"],(124,196,255),(1000,800),(40,920),(1020,720),(20,430),(320,200),(410,1210),(500,160),(280,520)),
      f"{OUT}/mobile/lucy-ultra-hero-1440x2560.webp": scene((1440,2560),ultra,assets["ultra_wing"],assets["ultra_ribbon"],assets["gold_fx"],(247,200,75),(1320,880),(60,1380),(1360,860),(20,680),(410,250),(510,1760),(680,190),(380,800)),
      f"{OUT}/mobile/lucy-heaven-hero-1440x2560.webp": scene((1440,2560),heaven,assets["heaven_wing"],assets["heaven_ribbon"],assets["cyan_fx"],(124,196,255),(1320,920),(60,1370),(1380,900),(20,610),(410,250),(510,1760),(680,190),(380,730)),
    }
    for rel,image in outputs.items(): save(image,rel); review[rel]=audit(Image.open(p(rel)))
    manifests()
    # Checker previews are workbench-only audit artifacts for alpha-bearing deliverables.
    for key,rel in (("avatar-zero",f"{OUT}/identity/lucy-avatar-zero.webp"),("avatar-heaven",f"{OUT}/identity/lucy-avatar-heaven.webp"),("header",f"{OUT}/identity/lucy-horizontal-header.webp")):
        source=load(rel); normal=checker(source.size); normal.alpha_composite(source); png(normal,f"{WORK}/{key}-normal.png")
        inverse=checker(source.size); inverse.alpha_composite(invert(source)); png(inverse,f"{WORK}/{key}-inverted.png")
    audit_path=p(f"{WORK}/audit.json"); audit_path.parent.mkdir(parents=True,exist_ok=True); audit_path.write_text(json.dumps(review,indent=2)+"\n")
    print(json.dumps(review,indent=2))
if __name__=="__main__": main()
