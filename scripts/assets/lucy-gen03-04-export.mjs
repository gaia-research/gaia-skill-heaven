import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the production entry point in the repository's normal JS tool surface.
// Pillow performs the pixel-level extraction because this monorepo has no tracked
// runtime image dependency; every transform below is deterministic and repeatable.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const program = String.raw`
from collections import deque
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageDraw
import numpy as np
import sys

root = Path(sys.argv[1])
assets = root / 'packages/site/src/assets/lucy'
workbench = root / 'packages/site/assets/workbench/lucy'
zero_raw = workbench / 'GEN-03/lucy-zero-raw.png'
hell_raw = workbench / 'GEN-04/lucy-hell-raw.png'
zero_alpha = workbench / 'GEN-03/lucy-zero-alpha.png'
hell_alpha = workbench / 'GEN-04/lucy-hell-alpha.png'

def mkdir(path):
    path.parent.mkdir(parents=True, exist_ok=True)

def save_webp(image, path):
    mkdir(path)
    # Lossless mode preserves alpha exactly; method 0 is intentionally used so
    # 2560×1440 backgrounds remain a fast deterministic local export.
    image.save(path, 'WEBP', lossless=True, quality=100, method=0, exact=True)

def green_to_alpha(path):
    rgba = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    rgb = rgba[:, :, :3]
    distance = np.sqrt(rgb[:, :, 0] ** 2 + (rgb[:, :, 1] - 255) ** 2 + rgb[:, :, 2] ** 2)
    alpha = np.clip((distance - 24) / 96, 0, 1)
    # gpt-image-2 returned a near-key green field rather than literal #00FF00
    # at a few pixels. Treat a strongly green-dominant field as background while
    # retaining Lucy's cyan/blue highlights, which contain substantial red/blue.
    field = (rgb[:, :, 1] > 160) & (rgb[:, :, 1] > np.maximum(rgb[:, :, 0], rgb[:, :, 2]) * 2 + 65)
    alpha[field] = 0
    # White/silver edges composited over #00FF00 have r≈b<g≈255. Recover their
    # coverage from r/b instead of mistakenly treating the green-matted pixel
    # as fully opaque (the source of a neon fringe in inverse-preview audit).
    white_edge = (rgb[:, :, 1] > 230) & (np.abs(rgb[:, :, 0] - rgb[:, :, 2]) < 35) & (np.maximum(rgb[:, :, 0], rgb[:, :, 2]) < 250)
    alpha[white_edge] = np.minimum(alpha[white_edge], np.maximum(rgb[:, :, 0][white_edge], rgb[:, :, 2][white_edge]) / 255)
    # Unmix the known green key from the soft transition band before writing alpha.
    edge = (alpha > 0) & (alpha < 1)
    for channel, key in enumerate((0, 255, 0)):
        values = rgb[:, :, channel]
        values[edge] = np.clip((values[edge] - (1 - alpha[edge]) * key) / alpha[edge], 0, 255)
    # A final 3px boundary-only despill removes the residual neon-key contour
    # without touching interior cyan ribbon or hair lighting.
    near_background = alpha <= 0
    for _ in range(3):
        expanded = near_background.copy()
        expanded[1:, :] |= near_background[:-1, :]
        expanded[:-1, :] |= near_background[1:, :]
        expanded[:, 1:] |= near_background[:, :-1]
        expanded[:, :-1] |= near_background[:, 1:]
        near_background = expanded
    max_rb = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    spill = near_background & (alpha > 0) & (rgb[:, :, 1] > max_rb + 10)
    rgb[:, :, 1][spill] = max_rb[spill]
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = np.round(alpha * 255)
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')

def white_background_mask(image):
    arr = np.array(image.convert('RGB'))
    h, w, _ = arr.shape
    candidate = (arr[:, :, 0] >= 242) & (arr[:, :, 1] >= 242) & (arr[:, :, 2] >= 242) & ((arr.max(axis=2) - arr.min(axis=2)) <= 16)
    outside = np.zeros((h, w), dtype=bool)
    queue = deque()
    def add(y, x):
        if candidate[y, x] and not outside[y, x]:
            outside[y, x] = True
            queue.append((y, x))
    for x in range(w):
        add(0, x); add(h - 1, x)
    for y in range(1, h - 1):
        add(y, 0); add(y, w - 1)
    while queue:
        y, x = queue.popleft()
        if y: add(y - 1, x)
        if y + 1 < h: add(y + 1, x)
        if x: add(y, x - 1)
        if x + 1 < w: add(y, x + 1)
    return outside

def corrected_hell(path):
    raw = Image.open(path).convert('RGBA')
    arr = np.array(raw)
    outside = white_background_mask(raw)
    alpha = np.where(outside, 0, 255).astype(np.uint8)
    # The entire isolated visual world is inverted before it is recomposed on white.
    inverted = 255 - arr[:, :, :3]
    # Restore the one semantically required red tear after inversion. This is constrained
    # to the original tear's face region, never a general pink/red recolour.
    ys, xs = np.indices(alpha.shape)
    original = arr[:, :, :3]
    tear = ((xs >= 340) & (xs <= 450) & (ys >= 530) & (ys <= 710) &
            (original[:, :, 0] >= 130) &
            (original[:, :, 0] - original[:, :, 1] >= 45) &
            (original[:, :, 0] - original[:, :, 2] >= 20) &
            (alpha > 0))
    inverted[tear] = np.array([235, 15, 50], dtype=np.uint8)
    result = np.dstack((inverted, alpha))
    return Image.fromarray(result, 'RGBA'), tear

def contain(image, size, background):
    canvas = Image.new('RGBA', size, background)
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas

def cover_top(image, size, background):
    scale = max(size[0] / image.width, size[1] / image.height)
    fitted = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (fitted.width - size[0]) // 2
    return fitted.crop((left, 0, left + size[0], size[1]))

def checker(size, dark):
    light, shade = ((17, 24, 39, 255), (55, 65, 81, 255)) if dark else ((229, 231, 235, 255), (156, 163, 175, 255))
    out = Image.new('RGBA', size, light)
    draw = ImageDraw.Draw(out)
    tile = 48
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=shade)
    return out

def audit(image, out_dir, label):
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, dark in (('normal', False), ('inverted', True)):
        board = checker(image.size, dark)
        board.alpha_composite(image)
        save_webp(board, out_dir / (label + '-' + name + '-checkerboard.webp'))

def background(size, base, accent):
    w, h = size
    yy, xx = np.ogrid[:h, :w]
    distance = np.sqrt(((xx - int(w * .72)) / w) ** 2 + ((yy - int(h * .45)) / h) ** 2)
    strength = np.clip(1 - distance / .68, 0, 1) * .16
    base_rgb = np.array(base, dtype=np.float32)
    accent_rgb = np.array(accent, dtype=np.float32)
    pixels = np.empty((h, w, 4), dtype=np.uint8)
    pixels[:, :, :3] = base_rgb + (accent_rgb - base_rgb) * strength[:, :, None]
    pixels[:, :, 3] = 255
    return Image.fromarray(pixels, 'RGBA')

zero = green_to_alpha(zero_raw)
hell, tear = corrected_hell(hell_raw)
mkdir(zero_alpha); zero.save(zero_alpha, 'PNG')
mkdir(hell_alpha); hell.save(hell_alpha, 'PNG')

white = Image.new('RGBA', hell.size, (255, 255, 255, 255)); white.alpha_composite(hell)
save_webp(zero, assets / 'states/lucy-zero.webp')
save_webp(hell, assets / 'states/lucy-hell.webp')
save_webp(white, assets / 'states/lucy-hell-white.webp')
save_webp(contain(zero, (1024, 1280), (5, 5, 7, 255)), assets / 'states/panels/lucy-zero-panel.webp')
save_webp(contain(white, (1024, 1280), (255, 255, 255, 255)), assets / 'states/panels/lucy-hell-panel.webp')
save_webp(cover_top(zero, (1024, 1024), (5, 5, 7, 255)), assets / 'portraits/lucy-zero.webp')
save_webp(cover_top(white, (1024, 1024), (255, 255, 255, 255)), assets / 'portraits/lucy-hell.webp')
save_webp(background((2560, 1440), (5, 5, 7), (55, 214, 224)), assets / 'backgrounds/lucy-bg-zero-desktop.webp')
save_webp(background((2560, 1440), (255, 255, 255), (255, 22, 93)), assets / 'backgrounds/lucy-bg-hell-desktop.webp')
audit(zero, workbench / 'GEN-03/audit', 'lucy-zero')
audit(hell, workbench / 'GEN-04/audit', 'lucy-hell')
print('Hell tear pixels restored:', int(tear.sum()))
`;

execFileSync('python3', ['-c', program, repoRoot], { stdio: 'inherit' });
