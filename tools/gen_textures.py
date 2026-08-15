#!/usr/bin/env python3
"""
Procedural pixel-art textures for the surfaces that don't have a painted
source. Written by hand (no AI upscaling) so they are deterministic, tiny and
tile perfectly by construction - every pattern is generated modulo the texture
size, so the seam is mathematically impossible.

Outputs albedo/normal/rough triples into public/assets/tex/ using the same
naming convention as build_textures.py.

Usage: python3 tools/gen_textures.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "tex")
os.makedirs(OUT, exist_ok=True)

S = 128  # texture size


def rng(seed):
    return np.random.default_rng(seed)


def value_noise(size, cells, seed, octaves=3):
    """Tileable value noise: lattice wraps, so the result wraps."""
    r = rng(seed)
    acc = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        grid = r.random((c, c)).astype(np.float32)
        # bilinear upsample with wrap
        ys = np.arange(size) * c / size
        xs = np.arange(size) * c / size
        y0 = np.floor(ys).astype(int) % c
        x0 = np.floor(xs).astype(int) % c
        y1 = (y0 + 1) % c
        x1 = (x0 + 1) % c
        fy = (ys - np.floor(ys)).reshape(-1, 1)
        fx = (xs - np.floor(xs)).reshape(1, -1)
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        top = grid[np.ix_(y0, x0)] * (1 - fx) + grid[np.ix_(y0, x1)] * fx
        bot = grid[np.ix_(y1, x0)] * (1 - fx) + grid[np.ix_(y1, x1)] * fx
        acc += (top * (1 - fy) + bot * fy) * amp
        total += amp
        amp *= 0.5
    return acc / total


def quantise(rgb, levels=6):
    """Posterise to keep the 16-bit pixel-art look."""
    q = np.round(rgb / 255.0 * (levels - 1)) / (levels - 1) * 255.0
    return np.clip(q, 0, 255)


def save(name, rgb, normal_strength, rough_base):
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    img = Image.fromarray(rgb, "RGB")
    img.save(os.path.join(OUT, f"{name}_albedo.png"), optimize=True)

    g = np.asarray(img.convert("L")).astype(np.float32) / 255.0
    gx = (np.roll(g, -1, 1) - np.roll(g, 1, 1)) * normal_strength
    gy = (np.roll(g, -1, 0) - np.roll(g, 1, 0)) * normal_strength
    nz = np.ones_like(g)
    ln = np.sqrt(gx * gx + gy * gy + nz * nz)
    nrm = np.stack([(-gx / ln) * .5 + .5, (-gy / ln) * .5 + .5, (nz / ln) * .5 + .5], -1)
    Image.fromarray((nrm * 255).astype(np.uint8), "RGB").save(
        os.path.join(OUT, f"{name}_normal.png"), optimize=True)

    gl = np.asarray(img.convert("L")).astype(np.float32)
    r = np.clip(rough_base + (gl - gl.mean()) * 0.3, 20, 255)
    Image.fromarray(r.astype(np.uint8), "L").convert("RGB").save(
        os.path.join(OUT, f"{name}_rough.png"), optimize=True)
    print(f"  {name}")


def carpet_office():
    n = value_noise(S, 16, 11, 4)
    fleck = (value_noise(S, 64, 12, 1) > 0.62).astype(np.float32)
    base = np.stack([
        58 + n * 40 + fleck * 45,
        40 + n * 28 + fleck * 30,
        28 + n * 20 + fleck * 18,
    ], -1)
    # worn traffic path down the middle, wraps vertically
    y = np.arange(S).reshape(-1, 1)
    x = np.arange(S).reshape(1, -1)
    path = np.exp(-((x - S * 0.5) ** 2) / (2 * (S * 0.16) ** 2))
    base *= (1 - path * 0.22)[..., None]
    # stains
    r = rng(13)
    for _ in range(7):
        cx, cy, rad = r.integers(0, S), r.integers(0, S), r.integers(6, 16)
        d = np.sqrt(((x - cx + S // 2) % S - S // 2) ** 2 + ((y - cy + S // 2) % S - S // 2) ** 2)
        m = np.clip(1 - d / rad, 0, 1) ** 1.5
        base *= (1 - m * 0.35)[..., None]
    save("carpet_office", quantise(base, 7), 1.0, 235)


def freezer_floor():
    y = np.arange(S).reshape(-1, 1)
    x = np.arange(S).reshape(1, -1)
    # diamond plate: two diagonal families, wrapping
    d1 = ((x + y) % 32 < 6).astype(np.float32)
    d2 = ((x - y) % 32 < 6).astype(np.float32)
    plate = np.maximum(d1, d2)
    n = value_noise(S, 12, 21, 3)
    base = np.stack([
        62 + plate * 26 + n * 22,
        74 + plate * 28 + n * 22,
        88 + plate * 30 + n * 20,
    ], -1)
    # frost patches
    frost = np.clip((value_noise(S, 8, 22, 4) - 0.45) * 3.2, 0, 1)
    base = base * (1 - frost[..., None] * 0.42) + np.array([176, 198, 216]) * frost[..., None] * 0.42
    # ice crystal speckle
    spark = (value_noise(S, 64, 23, 1) > 0.80).astype(np.float32)
    base += spark[..., None] * 26
    save("freezer_floor", quantise(base, 8), 2.6, 90)


def facade_brick():
    y = np.arange(S).reshape(-1, 1)
    x = np.arange(S).reshape(1, -1)
    bh, bw = 16, 32
    row = (y // bh)
    offset = (row % 2) * (bw // 2)
    mortar_h = ((y % bh) < 3)
    mortar_v = (((x + offset) % bw) < 3)
    mortar = (mortar_h | mortar_v).astype(np.float32)
    # per-brick colour variation
    r = rng(31)
    brick_id = (row * 977 + ((x + offset) // bw) * 131).astype(int)
    var = (np.sin(brick_id * 12.9898) * 43758.5453) % 1.0
    n = value_noise(S, 24, 32, 3)
    brick = np.stack([
        62 + var * 22 + n * 14,
        28 + var * 10 + n * 9,
        24 + var * 8 + n * 7,
    ], -1)
    mortar_col = np.stack([
        74 + n * 18, 71 + n * 17, 65 + n * 16
    ], -1)
    base = brick * (1 - mortar[..., None]) + mortar_col * mortar[..., None]
    # grime rising from the bottom (wraps because it's clamped at both edges)
    grime = np.clip((y / S - 0.55) * 2.2, 0, 1) * value_noise(S, 10, 33, 2)
    base *= (1 - grime * 0.45)[..., None] if grime.ndim == 2 else 1
    save("facade_brick", quantise(base, 8), 2.2, 220)


def wood_door():
    y = np.arange(S).reshape(-1, 1)
    x = np.arange(S).reshape(1, -1)
    grain = np.sin(x * 0.55 + value_noise(S, 6, 41, 3) * 9.0) * 0.5 + 0.5
    n = value_noise(S, 20, 42, 3)
    base = np.stack([
        58 + grain * 44 + n * 22,
        36 + grain * 28 + n * 15,
        22 + grain * 16 + n * 10,
    ], -1)
    # scratches
    r = rng(43)
    for _ in range(14):
        sx, sy = r.integers(0, S), r.integers(0, S)
        ln = r.integers(8, 34)
        for t in range(ln):
            px = (sx + t) % S
            py = (sy + int(t * float(r.random() - 0.5) * 0.3)) % S
            base[py, px] *= 0.66
    # water damage along the bottom
    dmg = np.clip((y / S - 0.72) * 3.4, 0, 1) * (0.4 + 0.6 * value_noise(S, 8, 44, 2))
    base *= (1 - dmg * 0.42)[..., None] if dmg.ndim == 2 else 1
    save("wood_door", quantise(base, 7), 1.8, 205)


def main():
    carpet_office()
    freezer_floor()
    facade_brick()
    wood_door()


if __name__ == "__main__":
    main()
