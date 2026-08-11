#!/usr/bin/env node
/**
 * Deterministically export the GEN-05 neutral model and the GEN-06 atlas.
 *
 * Input PNGs stay in the ignored Lucy workbench.  This file intentionally
 * performs no image generation: it only removes the frozen #00FF00 key,
 * extracts fixed atlas cells, exports lossless-alpha WebPs, and writes normal
 * and inverted checkerboard audit previews.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workbench = resolve(repoRoot, "packages/site/assets/workbench/lucy");
const production = resolve(repoRoot, "packages/site/src/assets/lucy");

for (const dir of [
  resolve(production, "models"),
  resolve(production, "portraits"),
  resolve(production, "components/expressions"),
  resolve(production, "components/eyes"),
  resolve(workbench, "GEN-05/audit"),
  resolve(workbench, "GEN-06/audit"),
]) mkdirSync(dir, { recursive: true });

const python = String.raw`
import json, os, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageOps

repo = Path(sys.argv[1])
workbench = repo / "packages/site/assets/workbench/lucy"
production = repo / "packages/site/src/assets/lucy"

def keyed_rgba(path):
    """Turn the one-shot flat #00FF00 field into alpha with a soft, despilled edge."""
    src = Image.open(path).convert("RGBA")
    px = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, old_a = px[x, y]
            # Euclidean distance from the specified key.  The ramp preserves
            # anti-aliased hair/katana edges rather than hard-cutting them.
            d = (r*r + (g-255)*(g-255) + b*b) ** 0.5
            # gpt-image-2 delivered a consistently near-green (roughly
            # 20,240,20) field rather than literal #00FF00.  Green-dominant
            # pixels are therefore background even when their key distance is
            # nonzero; subject cyan has enough red/blue to remain outside it.
            if g > 160 and g > max(r, b) * 2 + 65:
                a = 0
            else:
                a = max(0, min(255, round((d - 58) * 255 / 110)))
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
            else:
                # Remove residual key green without altering cyan/blue art.
                px[x, y] = (r, min(g, max(r, b)), b, min(old_a, a))
    return src

def trim(im, pad=8):
    alpha = im.getchannel("A")
    box = alpha.getbbox()
    if not box:
        raise RuntimeError("expected non-empty alpha after chroma removal")
    l, t, r, b = box
    return im.crop((max(0, l-pad), max(0, t-pad), min(im.width, r+pad), min(im.height, b+pad)))

def save_webp(im, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", lossless=True, method=6, exact=True)
    reread = Image.open(path).convert("RGBA")
    alpha = reread.getchannel("A")
    if alpha.getextrema()[0] != 0 or alpha.getextrema()[1] != 255:
        raise RuntimeError(f"{path} did not preserve mixed alpha")
    return {"path": str(path.relative_to(repo)), "width": reread.width, "height": reread.height,
            "alphaMin": alpha.getextrema()[0], "alphaMax": alpha.getextrema()[1]}

def checker_preview(im, path, inverted=False):
    # Checkerboard makes alpha holes/fringes visible.  Invert only the
    # foreground RGB for the requested inverse-preview edge audit.
    tile, w, h = 24, im.width, im.height
    board = Image.new("RGB", (w, h))
    bp = board.load()
    for y in range(h):
        for x in range(w):
            c = 210 if ((x//tile + y//tile) % 2 == 0) else 120
            bp[x, y] = (c, c, c)
    fg = im.copy()
    if inverted:
        rgb = ImageOps.invert(fg.convert("RGB"))
        fg = Image.merge("RGBA", (*rgb.split(), fg.getchannel("A")))
    board.paste(fg, (0, 0), fg)
    board.save(path, "PNG")

model = keyed_rgba(workbench / "GEN-05/raw-gpt-image-2.png")
model = trim(model)
outputs = [save_webp(model, production / "models/lucy-neutral.webp")]
checker_preview(model, workbench / "GEN-05/audit/model-normal-checker.png")
checker_preview(model, workbench / "GEN-05/audit/model-inverted-checker.png", inverted=True)

atlas = keyed_rgba(workbench / "GEN-06/raw-gpt-image-2.png")
if atlas.width % 3 or atlas.height % 3:
    raise RuntimeError(f"atlas must be divisible into a 3x3 grid, got {atlas.size}")
cw, ch = atlas.width // 3, atlas.height // 3
cells = []
for index in range(9):
    col, row = index % 3, index // 3
    cell = atlas.crop((col*cw, row*ch, (col+1)*cw, (row+1)*ch))
    cells.append(trim(cell, pad=5))
    outputs.append(save_webp(cells[-1], production / f"components/expressions/lucy-expression-{index+1:02}.webp"))

# Portraits are strictly sourced from the corresponding atlas cells.  The
# neutral and Zero portraits are intentionally the same closed-neutral source.
portrait_sources = {"neutral": 0, "zero": 0, "heaven": 2, "hell": 3, "ultra": 4}
for name, index in portrait_sources.items():
    outputs.append(save_webp(cells[index], production / f"portraits/lucy-{name}.webp"))

# Eye components remain whole state cells: the atlas does not isolate a clean
# eye-only layer, so avoiding a speculative crop preserves hair and tear edges.
eye_sources = {"zero-closed": 0, "zero-blank": 1, "heaven": 2, "hell": 3, "ultra": 4}
for name, index in eye_sources.items():
    outputs.append(save_webp(cells[index], production / f"components/eyes/lucy-eyes-{name}.webp"))

checker_preview(atlas, workbench / "GEN-06/audit/atlas-normal-checker.png")
checker_preview(atlas, workbench / "GEN-06/audit/atlas-inverted-checker.png", inverted=True)

manifest = {
  "generator": "scripts/assets/lucy-gen05-06-export.mjs",
  "inputs": ["GEN-05/raw-gpt-image-2.png", "GEN-06/raw-gpt-image-2.png"],
  "chromaKey": "#00FF00",
  "atlas": {"grid": "3x3", "sourceDimensions": [atlas.width, atlas.height], "cellDimensions": [cw, ch]},
  "outputs": outputs,
  "blocked": ["components/hair/lucy-hair-neutral.webp: no genuinely isolated neutral-hair layer exists in GEN-05/06; deliberately not guessed."],
}
(workbench / "GEN-05/export-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
(workbench / "GEN-06/export-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
`;

const run = spawnSync("python3", ["-c", python, repoRoot], { encoding: "utf8" });
if (run.status !== 0) {
  process.stderr.write(run.stderr || run.stdout);
  process.exit(run.status ?? 1);
}
process.stdout.write(run.stdout);
