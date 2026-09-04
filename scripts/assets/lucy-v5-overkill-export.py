#!/usr/bin/env python3
"""Produce compact 2x Lucy v5 WebPs through the hybrid Overkill pipeline.

The approved PNG owns composition and alpha. ArtCNN contributes only a bounded
luma residual; chroma and alpha are resized independently. A tiled numerical
16x -> 4x -> 2x collapse consolidates the final delivery master without ever
materializing or committing a full 16x frame.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

os.environ.setdefault("ONNXRUNTIME_DISABLE_TELEMETRY", "1")

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
from scipy import ndimage


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[2]
SOURCE_DIR = ROOT / "packages/site/src/assets/lucy/v5/masters"
DELIVERY_DIR = ROOT / "packages/site/src/assets/lucy/v5/delivery"
WORKBENCH = ROOT / "packages/site/assets/workbench/lucy/ISSUE-73-OVERKILL"
MODEL = WORKBENCH / "models/ArtCNN_R16F96.onnx"
MODEL_URL = (
    "https://raw.githubusercontent.com/Artoriuz/ArtCNN/"
    "c619fc3292d8867378e072f08bb0500c086440d5/ONNX/ArtCNN_R16F96.onnx"
)
MODEL_SHA256 = "498f1295c43f5799ef5bdea14a8f5b7a68d1f99ae67fee8a8f77ec9b25ca3e8d"
MODEL_LICENSE = "MIT"
TARGETS = {
    "zero": (2048, 3072),
    "heaven": (2048, 3072),
    "hell": (2048, 3072),
    "ultra": (2190, 2874),
}
KR, KG, KB = 0.2126, 0.7152, 0.0722
RESIDUAL_GAIN = 0.85
RESIDUAL_LIMIT = 14.0 / 255.0
NEURAL_TILE = 512
NEURAL_HALO = 48
NEURAL_CORE = NEURAL_TILE - 2 * NEURAL_HALO
COLLAPSE_CORE_4X = 256
COLLAPSE_HALO_4X = 8
EXPECTED_CWEBP_VERSION = "1.6.0\nlibsharpyuv: 0.4.2"
LANCZOS = Image.Resampling.LANCZOS


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ensure_model() -> None:
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    if MODEL.exists() and sha256(MODEL) == MODEL_SHA256:
        return
    partial = MODEL.with_suffix(".download")
    if partial.exists():
        partial.unlink()
    print(f"Downloading pinned ArtCNN model to {MODEL.relative_to(ROOT)}")
    urllib.request.urlretrieve(MODEL_URL, partial)
    actual = sha256(partial)
    if actual != MODEL_SHA256:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"ArtCNN checksum mismatch: expected {MODEL_SHA256}, got {actual}")
    partial.replace(MODEL)


def resize_channel(channel: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    image = Image.fromarray(channel.astype(np.float32), mode="F")
    return np.asarray(image.resize(size, LANCZOS), dtype=np.float32)


def extend_transparent_rgb(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Fill hidden RGB from the nearest visible pixel before resampling."""
    transparent = alpha <= 0.0
    if not transparent.any():
        return rgb
    nearest = ndimage.distance_transform_edt(
        transparent,
        return_distances=False,
        return_indices=True,
    )
    filled = rgb.copy()
    filled[transparent] = rgb[nearest[0][transparent], nearest[1][transparent]]
    return filled


def rgb_to_ycbcr(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = KR * r + KG * g + KB * b
    cb = (b - y) / (2.0 * (1.0 - KB))
    cr = (r - y) / (2.0 * (1.0 - KR))
    return y.astype(np.float32), cb.astype(np.float32), cr.astype(np.float32)


def ycbcr_to_rgb(y: np.ndarray, cb: np.ndarray, cr: np.ndarray) -> np.ndarray:
    r = y + 2.0 * (1.0 - KR) * cr
    b = y + 2.0 * (1.0 - KB) * cb
    g = (y - KR * r - KB * b) / KG
    return np.clip(np.dstack((r, g, b)), 0.0, 1.0).astype(np.float32)


def make_session(provider: str) -> tuple[ort.InferenceSession, str]:
    options = ort.SessionOptions()
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.intra_op_num_threads = max(1, min(8, os.cpu_count() or 1))
    available = set(ort.get_available_providers())
    chosen = provider
    providers: list[Any]
    if provider == "auto":
        chosen = "coreml" if "CoreMLExecutionProvider" in available else "cpu"
    if chosen == "coreml":
        if "CoreMLExecutionProvider" not in available:
            raise RuntimeError("CoreMLExecutionProvider is unavailable; rerun with --provider cpu")
        cache = WORKBENCH / "coreml-cache"
        cache.mkdir(parents=True, exist_ok=True)
        providers = [
            (
                "CoreMLExecutionProvider",
                {
                    "ModelCacheDirectory": str(cache.resolve()),
                    "RequireStaticInputShapes": "0",
                },
            ),
            "CPUExecutionProvider",
        ]
    elif chosen == "cpu":
        providers = ["CPUExecutionProvider"]
    else:
        raise ValueError(f"unknown provider: {provider}")
    session = ort.InferenceSession(str(MODEL), sess_options=options, providers=providers)
    return session, chosen


def artcnn_2x(y: np.ndarray, session: ort.InferenceSession) -> np.ndarray:
    height, width = y.shape
    destination = np.empty((height * 2, width * 2), dtype=np.float32)
    padded = np.pad(
        y,
        ((NEURAL_HALO, NEURAL_HALO + NEURAL_CORE), (NEURAL_HALO, NEURAL_HALO + NEURAL_CORE)),
        mode="reflect",
    )
    input_name = session.get_inputs()[0].name
    for top in range(0, height, NEURAL_CORE):
        core_h = min(NEURAL_CORE, height - top)
        for left in range(0, width, NEURAL_CORE):
            core_w = min(NEURAL_CORE, width - left)
            tile = np.ascontiguousarray(padded[top : top + NEURAL_TILE, left : left + NEURAL_TILE])
            result = session.run(None, {input_name: tile[None, None]})[0][0, 0]
            y1 = NEURAL_HALO * 2
            x1 = NEURAL_HALO * 2
            destination[
                top * 2 : (top + core_h) * 2,
                left * 2 : (left + core_w) * 2,
            ] = result[y1 : y1 + core_h * 2, x1 : x1 + core_w * 2]
    return np.clip(destination, 0.0, 1.0)


def overkill_collapse(channel_4x: np.ndarray) -> np.ndarray:
    """Tiled 4x neural/conservative channel -> 16x -> 4x -> shipping 2x."""
    height, width = channel_4x.shape
    if height % 2 or width % 2:
        raise ValueError(f"4x channel must have even dimensions, got {(width, height)}")
    destination = np.empty((height // 2, width // 2), dtype=np.float32)
    padded = np.pad(
        channel_4x,
        (
            (COLLAPSE_HALO_4X, COLLAPSE_HALO_4X + COLLAPSE_CORE_4X),
            (COLLAPSE_HALO_4X, COLLAPSE_HALO_4X + COLLAPSE_CORE_4X),
        ),
        mode="reflect",
    )
    patch_size = COLLAPSE_CORE_4X + 2 * COLLAPSE_HALO_4X
    for top in range(0, height, COLLAPSE_CORE_4X):
        core_h = min(COLLAPSE_CORE_4X, height - top)
        for left in range(0, width, COLLAPSE_CORE_4X):
            core_w = min(COLLAPSE_CORE_4X, width - left)
            patch = padded[top : top + patch_size, left : left + patch_size]
            image = Image.fromarray(patch.astype(np.float32), mode="F")
            working_16x = image.resize((patch_size * 4, patch_size * 4), LANCZOS)
            collapsed_4x = working_16x.resize((patch_size, patch_size), LANCZOS)
            collapsed_2x = collapsed_4x.resize((patch_size // 2, patch_size // 2), LANCZOS)
            result = np.asarray(collapsed_2x, dtype=np.float32)
            y1 = COLLAPSE_HALO_4X // 2
            x1 = COLLAPSE_HALO_4X // 2
            destination[top // 2 : (top + core_h) // 2, left // 2 : (left + core_w) // 2] = result[
                y1 : y1 + core_h // 2,
                x1 : x1 + core_w // 2,
            ]
    return destination


def checker(size: tuple[int, int], dark: bool) -> Image.Image:
    colors = ((18, 26, 39, 255), (71, 85, 105, 255)) if dark else ((244, 246, 248, 255), (203, 213, 225, 255))
    board = Image.new("RGBA", size, colors[0])
    draw = ImageDraw.Draw(board)
    unit = 64
    for y in range(0, size[1], unit):
        for x in range(0, size[0], unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle((x, y, x + unit - 1, y + unit - 1), fill=colors[1])
    return board


def exterior_band(alpha: np.ndarray, radius: int = 4) -> np.ndarray:
    exterior = alpha == 0
    for _ in range(radius):
        grown = exterior.copy()
        grown[1:] |= exterior[:-1]
        grown[:-1] |= exterior[1:]
        grown[:, 1:] |= exterior[:, :-1]
        grown[:, :-1] |= exterior[:, 1:]
        exterior = grown
    return exterior & (alpha > 0) & (alpha < 255)


def interior_boundary_band(alpha: np.ndarray, radius: int = 2) -> np.ndarray:
    near_exterior = alpha == 0
    for _ in range(radius):
        grown = near_exterior.copy()
        grown[1:] |= near_exterior[:-1]
        grown[:-1] |= near_exterior[1:]
        grown[:, 1:] |= near_exterior[:, :-1]
        grown[:, :-1] |= near_exterior[:, 1:]
        near_exterior = grown
    return near_exterior & (alpha > 0)


def expanded(mask: np.ndarray, radius: int = 20) -> np.ndarray:
    window = radius * 2 + 1
    horizontal_padded = np.pad(mask, ((0, 0), (radius, radius)), mode="constant")
    horizontal_sum = np.pad(
        np.cumsum(horizontal_padded, axis=1, dtype=np.uint32),
        ((0, 0), (1, 0)),
        mode="constant",
    )
    horizontal = (horizontal_sum[:, window:] - horizontal_sum[:, :-window]) > 0
    vertical_padded = np.pad(horizontal, ((radius, radius), (0, 0)), mode="constant")
    vertical_sum = np.pad(
        np.cumsum(vertical_padded, axis=0, dtype=np.uint32),
        ((1, 0), (0, 0)),
        mode="constant",
    )
    return (vertical_sum[window:] - vertical_sum[:-window]) > 0


def prism_outliers(rgba: np.ndarray, reference: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3]
    reference_rgb = reference[:, :, :3].astype(np.int16)
    reference_alpha = reference[:, :, 3]

    strong_green = (rgb[:, :, 1] > rgb[:, :, 0] + 30) & (rgb[:, :, 1] > rgb[:, :, 2] + 30)
    key_green = (
        (rgb[:, :, 1] >= 140)
        & (rgb[:, :, 0] <= 175)
        & (rgb[:, :, 2] <= 175)
        & (rgb[:, :, 1] >= rgb[:, :, 0] + 15)
        & (rgb[:, :, 1] >= rgb[:, :, 2] + 8)
    )
    strong_magenta = (rgb[:, :, 0] > 170) & (rgb[:, :, 2] > 170) & (rgb[:, :, 1] < 100)
    reference_green = (
        (reference_rgb[:, :, 1] > reference_rgb[:, :, 0] + 15)
        & (reference_rgb[:, :, 1] > reference_rgb[:, :, 2] + 15)
    )
    reference_key_green = (
        (reference_rgb[:, :, 1] >= 120)
        & (reference_rgb[:, :, 0] <= 190)
        & (reference_rgb[:, :, 2] <= 190)
        & (reference_rgb[:, :, 1] >= reference_rgb[:, :, 0] + 5)
        & (reference_rgb[:, :, 1] >= reference_rgb[:, :, 2] + 3)
    )
    reference_magenta = (
        (reference_rgb[:, :, 0] > 145)
        & (reference_rgb[:, :, 2] > 145)
        & (reference_rgb[:, :, 1] < 125)
    )

    new_green = (
        (exterior_band(alpha) & strong_green & ~expanded(exterior_band(reference_alpha) & reference_green))
        | (
            interior_boundary_band(alpha)
            & key_green
            & ~expanded(interior_boundary_band(reference_alpha) & reference_key_green)
        )
    )
    new_magenta = (
        exterior_band(alpha)
        & strong_magenta
        & ~expanded(exterior_band(reference_alpha) & reference_magenta)
    )
    return new_green, new_magenta


def apply_prism_masks(
    rgba: np.ndarray,
    new_green: np.ndarray,
    new_magenta: np.ndarray,
) -> tuple[np.ndarray, int]:
    result = rgba.copy()
    green_count = int(new_green.sum())
    magenta_count = int(new_magenta.sum())
    if green_count:
        red = result[:, :, 0].astype(np.int16)
        blue = result[:, :, 2].astype(np.int16)
        ceiling = np.maximum(red + 14, blue + 7).clip(0, 255).astype(np.uint8)
        result[:, :, 1][new_green] = np.minimum(result[:, :, 1][new_green], ceiling[new_green])
    if magenta_count:
        result[:, :, 1][new_magenta] = np.maximum(result[:, :, 1][new_magenta], 100)
    return result, green_count + magenta_count


def constrain_prism(rgba: np.ndarray, reference: np.ndarray) -> tuple[np.ndarray, int]:
    return apply_prism_masks(rgba, *prism_outliers(rgba, reference))


def write_audits(subject: Image.Image, audit_dir: Path) -> None:
    audit_dir.mkdir(parents=True, exist_ok=True)
    for name, color in (
        ("white", (255, 255, 255, 255)),
        ("black", (0, 0, 0, 255)),
        ("mid-gray", (128, 128, 128, 255)),
    ):
        plate = Image.new("RGBA", subject.size, color)
        plate.alpha_composite(subject)
        plate.save(audit_dir / f"{name}.png")
    for name, dark in (("light-checker", False), ("dark-checker", True)):
        plate = checker(subject.size, dark)
        plate.alpha_composite(subject)
        plate.save(audit_dir / f"{name}.png")
    rgba = np.asarray(subject, dtype=np.uint8).copy()
    foreground = rgba[..., 3] > 0
    rgba[foreground, :3] = 255 - rgba[foreground, :3]
    inverse = checker(subject.size, True)
    inverse.alpha_composite(Image.fromarray(rgba, mode="RGBA"))
    inverse.save(audit_dir / "inverted-rgb-dark-checker.png")
    subject.getchannel("A").save(audit_dir / "alpha.png")


def cwebp_version() -> str:
    cwebp = shutil.which("cwebp")
    if not cwebp:
        raise RuntimeError(f"cwebp {EXPECTED_CWEBP_VERSION.splitlines()[0]} is required")
    version = subprocess.run([cwebp, "-version"], capture_output=True, text=True, check=True).stdout.strip()
    if version != EXPECTED_CWEBP_VERSION:
        raise RuntimeError(f"cwebp version mismatch: expected {EXPECTED_CWEBP_VERSION!r}, got {version!r}")
    return version


def encode_webp(png: Path, output: Path, quality: int) -> None:
    cwebp_version()
    cwebp = shutil.which("cwebp")
    assert cwebp is not None
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            cwebp,
            "-quiet",
            "-q",
            str(quality),
            "-alpha_q",
            "100",
            "-m",
            "6",
            "-pass",
            "10",
            "-sharp_yuv",
            "-mt",
            str(png),
            "-o",
            str(output),
        ],
        check=True,
    )


def encode_prism_safe(
    subject: Image.Image,
    reference_source: Image.Image,
    final_png: Path,
    output: Path,
    quality: int,
) -> tuple[np.ndarray, dict[str, int]]:
    reference = np.asarray(reference_source.convert("RGBA").resize(subject.size, LANCZOS), dtype=np.uint8)
    working = np.asarray(subject.convert("RGBA"), dtype=np.uint8).copy()
    constrained_total = 0
    for attempt in range(1, 8):
        working, constrained = constrain_prism(working, reference)
        constrained_total += constrained
        Image.fromarray(working, mode="RGBA").save(final_png, format="PNG", optimize=True)
        encode_webp(final_png, output, quality)
        decoded = np.asarray(Image.open(output).convert("RGBA"), dtype=np.uint8)
        if not np.array_equal(decoded[:, :, 3], working[:, :, 3]):
            raise RuntimeError(f"encoded WebP alpha is not byte-identical for {output.stem}")
        new_green, new_magenta = prism_outliers(decoded, reference)
        if not new_green.any() and not new_magenta.any():
            return decoded, {
                "iterations": attempt,
                "constrained_pixels": constrained_total,
                "decoded_new_green_pixels": 0,
                "decoded_new_magenta_pixels": 0,
            }
        # Lossy chroma can create a threshold crossing absent in the master.
        # Correct only those decoded positions on the original uncompressed
        # working master so a retry never compounds lossy RGB generations.
        working, constrained = apply_prism_masks(working, new_green, new_magenta)
        constrained_total += constrained
        working[working[:, :, 3] == 0, :3] = 0
    new_green, new_magenta = prism_outliers(decoded, reference)
    raise RuntimeError(
        f"WebP prism constraint did not converge for {output.stem}: "
        f"green={int(new_green.sum())}, magenta={int(new_magenta.sum())}"
    )


def alpha_metrics(alpha: np.ndarray) -> dict[str, Any]:
    return {
        "minimum": int(alpha.min()),
        "maximum": int(alpha.max()),
        "transparent_pixels": int((alpha == 0).sum()),
        "opaque_pixels": int((alpha == 255).sum()),
        "fractional_pixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "sha256_raw": sha256_bytes(alpha.tobytes()),
    }


def export_state(state: str, session: ort.InferenceSession, provider: str, quality: int, force: bool) -> dict[str, Any]:
    source = SOURCE_DIR / f"lucy-{state}.png"
    output = DELIVERY_DIR / f"lucy-{state}.webp"
    state_dir = WORKBENCH / state
    final_png = state_dir / "delivery-master.png"
    if output.exists() and not force:
        raise FileExistsError(f"refusing to overwrite {output.relative_to(ROOT)} without --force")
    state_dir.mkdir(parents=True, exist_ok=True)

    source_image = Image.open(source).convert("RGBA")
    source_rgba = np.asarray(source_image, dtype=np.uint8)
    source_alpha = source_rgba[..., 3].astype(np.float32) / 255.0
    rgb = extend_transparent_rgb(source_rgba[..., :3].astype(np.float32) / 255.0, source_alpha)
    y, cb, cr = rgb_to_ycbcr(rgb)
    target = TARGETS[state]
    working_4x = (target[0] * 2, target[1] * 2)

    print(f"[{state}] ArtCNN R16F96 1x -> 2x -> 4x luma oracle")
    neural_2x = artcnn_2x(y, session)
    neural_4x = artcnn_2x(neural_2x, session)
    if neural_4x.shape[::-1] != working_4x:
        raise RuntimeError(f"unexpected ArtCNN dimensions for {state}: {neural_4x.shape[::-1]}")
    baseline_y = resize_channel(y, working_4x)
    raw_residual = neural_4x - baseline_y
    residual = np.clip(raw_residual, -RESIDUAL_LIMIT, RESIDUAL_LIMIT) * RESIDUAL_GAIN
    enhanced_y = np.clip(baseline_y + residual, 0.0, 1.0)

    print(f"[{state}] independent 4x chroma; canonical alpha direct to delivery size")
    cb_4x = resize_channel(cb, working_4x)
    cr_4x = resize_channel(cr, working_4x)

    print(f"[{state}] tiled hybrid 4x -> 16x -> 4x -> 2x consolidation")
    final_y = np.clip(overkill_collapse(enhanced_y), 0.0, 1.0)
    final_cb = overkill_collapse(cb_4x)
    final_cr = overkill_collapse(cr_4x)
    baseline_alpha_u8 = np.asarray(source_image.getchannel("A").resize(target, LANCZOS), dtype=np.uint8)
    alpha_u8 = baseline_alpha_u8.copy()
    removed_nonzero_pixels = int(((baseline_alpha_u8 > 0) & (alpha_u8 == 0)).sum())
    added_nonzero_pixels = int(((baseline_alpha_u8 == 0) & (alpha_u8 > 0)).sum())
    differing_alpha_pixels = int((baseline_alpha_u8 != alpha_u8).sum())
    maximum_alpha_delta = int(
        np.abs(alpha_u8.astype(np.int16) - baseline_alpha_u8.astype(np.int16)).max()
    )

    rgb_u8 = np.round(ycbcr_to_rgb(final_y, final_cb, final_cr) * 255.0).astype(np.uint8)
    rgb_u8[alpha_u8 == 0] = 0
    final_rgba = np.dstack((rgb_u8, alpha_u8))
    subject = Image.fromarray(final_rgba, mode="RGBA")
    decoded_rgba, prism_constraint = encode_prism_safe(subject, source_image, final_png, output, quality)
    decoded = Image.fromarray(decoded_rgba, mode="RGBA")
    write_audits(Image.open(final_png).convert("RGBA"), state_dir / "audit")
    decoded_alpha = decoded_rgba[..., 3]
    if decoded.size != target:
        raise RuntimeError(f"encoded WebP dimensions changed for {state}: {decoded.size}")
    if not np.array_equal(decoded_alpha, alpha_u8):
        raise RuntimeError(f"encoded WebP alpha is not byte-identical for {state}")

    residual_abs = np.abs(raw_residual)
    return {
        "state": state,
        "source": str(source.relative_to(ROOT)),
        "source_sha256": sha256(source),
        "source_dimensions": list(source_image.size),
        "source_bytes": source.stat().st_size,
        "source_alpha": alpha_metrics(source_rgba[..., 3]),
        "output": str(output.relative_to(ROOT)),
        "output_sha256": sha256(output),
        "output_dimensions": list(decoded.size),
        "output_bytes": output.stat().st_size,
        "output_smaller_than_source": output.stat().st_size < source.stat().st_size,
        "decoded_alpha": alpha_metrics(decoded_alpha),
        "alpha_adjustments": {
            "method": "direct source -> 2x deterministic Lanczos; no neural alpha processing",
            "baseline": "direct source -> 2x Lanczos alpha",
            "removed_nonzero_pixels": removed_nonzero_pixels,
            "added_nonzero_pixels": added_nonzero_pixels,
            "differing_pixels": differing_alpha_pixels,
            "maximum_delta": maximum_alpha_delta,
            "hardened_254_pixels": 0,
        },
        "prism_constraint": prism_constraint,
        "neural_residual": {
            "gain": RESIDUAL_GAIN,
            "clip": RESIDUAL_LIMIT,
            "mean_absolute": float(residual_abs.mean()),
            "p99_absolute": float(np.quantile(residual_abs, 0.99)),
            "maximum_absolute": float(residual_abs.max()),
        },
        "provider": provider,
    }


def reencode_existing(quality: int) -> None:
    """Re-encode completed delivery masters after an encode-only gate change."""
    manifest_path = DELIVERY_DIR / "DELIVERY_MANIFEST.json"
    if not manifest_path.exists():
        raise FileNotFoundError("delivery manifest is required for --reencode-existing")
    manifest = json.loads(manifest_path.read_text())
    outputs = {item["state"]: item for item in manifest.get("outputs", [])}
    if set(outputs) != set(TARGETS):
        raise RuntimeError("--reencode-existing requires a complete four-state manifest")
    for state in TARGETS:
        item = outputs[state]
        source_image = Image.open(ROOT / item["source"]).convert("RGBA")
        state_dir = WORKBENCH / state
        final_png = state_dir / "delivery-master.png"
        output = ROOT / item["output"]
        subject = Image.open(final_png).convert("RGBA")
        decoded_rgba, prism_constraint = encode_prism_safe(subject, source_image, final_png, output, quality)
        write_audits(Image.open(final_png).convert("RGBA"), state_dir / "audit")
        item["output_sha256"] = sha256(output)
        item["output_bytes"] = output.stat().st_size
        item["output_smaller_than_source"] = output.stat().st_size < (ROOT / item["source"]).stat().st_size
        item["decoded_alpha"] = alpha_metrics(decoded_rgba[:, :, 3])
        item["prism_constraint"] = prism_constraint
    manifest["pipeline"]["webp_quality"] = quality
    manifest["runtime"]["cwebp"] = cwebp_version()
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    (WORKBENCH / "run-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    subprocess.run([os.sys.executable, str(ROOT / "scripts/assets/validate-lucy-v5-matte.py")], cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("auto", "coreml", "cpu"), default="auto")
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--reencode-existing", action="store_true")
    args = parser.parse_args()
    ort.disable_telemetry_events()
    cwebp_version()
    if args.reencode_existing:
        reencode_existing(args.quality)
        return
    ensure_model()
    session, provider = make_session(args.provider)
    results = [export_state(state, session, provider, args.quality, args.force) for state in TARGETS]
    manifest_path = DELIVERY_DIR / "DELIVERY_MANIFEST.json"
    manifest = {
        "schema": "lucy-v5-overkill-delivery/v1",
        "pipeline": {
            "mode": "overkill-hybrid",
            "structure_owner": "Lanczos conservative 4x baseline collapsed to 2x",
            "detail_oracle": "ArtCNN R16F96 luma-only 1x -> 2x -> 4x cascade; no face enhancement",
            "luma": "bounded 4x ArtCNN residual, then tiled hybrid 4x -> 16x -> 4x -> 2x Lanczos collapse",
            "chroma": "BT.709 Cb/Cr independently supersampled to 4x and collapsed",
            "alpha": "canonical source alpha independently resized directly to 2x with deterministic Lanczos",
            "full_16x_frame_materialized": False,
            "neural_tile": NEURAL_TILE,
            "neural_halo": NEURAL_HALO,
            "collapse_core_4x": COLLAPSE_CORE_4X,
            "collapse_halo_4x": COLLAPSE_HALO_4X,
            "webp_quality": args.quality,
            "webp_alpha_quality": 100,
        },
        "model": {
            "name": "ArtCNN_R16F96.onnx",
            "url": MODEL_URL,
            "sha256": MODEL_SHA256,
            "license": MODEL_LICENSE,
        },
        "runtime": {
            "python": os.sys.version.split()[0],
            "onnxruntime": ort.__version__,
            "numpy": np.__version__,
            "pillow": Image.__version__,
            "scipy": __import__("scipy").__version__,
            "provider": provider,
            "cwebp": cwebp_version(),
        },
        "outputs": results,
    }
    DELIVERY_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    workbench_manifest = WORKBENCH / "run-manifest.json"
    workbench_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    subprocess.run([os.sys.executable, str(ROOT / "scripts/assets/validate-lucy-v5-matte.py")], cwd=ROOT, check=True)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
