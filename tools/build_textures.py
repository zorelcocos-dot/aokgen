#!/usr/bin/env python3
"""
Bakes the raw generated art in tools/raw/ into pixel-perfect, tileable,
palette-limited game textures in public/assets/tex/.

For every texture we:
  1. downsample to a small power-of-two (true pixel art, nearest neighbour)
  2. make it seamlessly tileable (mirror-blend the seams)
  3. quantise to a fixed palette count so it reads as 16-bit art
  4. write albedo + a derived normal map + a roughness map

Everything is deterministic; re-running produces identical files.

Usage: python3 tools/build_textures.py
"""
import os
from PIL import Image, ImageFilter, ImageChops
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "raw")
OUT = os.path.join(ROOT, "public", "assets", "tex")
os.makedirs(OUT, exist_ok=True)

# name -> (source file, output size, palette colours, normal strength, base roughness)
SPECS = {
    "floor_checker": ("tex_floor_checker.png", 128, 24, 2.0, 150),
    "floor_kitchen": ("tex_floor_kitchen.png", 128, 20, 2.2, 130),
    "wall_dining":   ("tex_wall_dining.png",   128, 20, 1.4, 200),
    "wall_tile":     ("tex_wall_tile.png",     128, 20, 1.8, 90),
    "wall_office":   ("tex_wall_office.png",   128, 18, 1.2, 210),
    "metal_panel":   ("tex_metal_panel.png",   128, 20, 2.4, 70),
    "ceiling":       ("tex_ceiling.png",       128, 18, 1.6, 220),
    "asphalt":       ("tex_asphalt.png",       128, 18, 2.0, 200),
    "dirt_grass":    ("tex_dirt_grass.png",    128, 18, 2.2, 235),
    "concrete":      ("tex_concrete.png",      128, 18, 1.8, 215),
}


def make_tileable(img, blend=0.18):
    """Cross-fade opposite edges so the texture repeats without a visible seam."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    bw = max(2, int(w * blend))
    bh = max(2, int(h * blend))

    # horizontal: blend the left strip over the right strip
    ramp = np.linspace(0.0, 1.0, bw).reshape(1, bw, 1)
    left = a[:, :bw].copy()
    right = a[:, w - bw:].copy()
    a[:, w - bw:] = right * ramp + left[:, ::-1] * (1 - ramp)

    ramp = np.linspace(0.0, 1.0, bh).reshape(bh, 1, 1)
    top = a[:bh].copy()
    bottom = a[h - bh:].copy()
    a[h - bh:] = bottom * ramp + top[::-1] * (1 - ramp)

    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def pixelate(img, size, colors):
    """Hard downsample then palette-quantise: this is what makes it pixel art."""
    img = img.convert("RGB")
    # box filter down (keeps detail), then nearest to lock the grid
    img = img.resize((size, size), Image.BOX)
    img = img.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    return img.convert("RGB")


def normal_from_height(img, strength):
    """Sobel-derived tangent-space normal map."""
    g = np.asarray(img.convert("L")).astype(np.float32) / 255.0
    # wrap edges so the normal map tiles too
    gx = (np.roll(g, -1, axis=1) - np.roll(g, 1, axis=1)) * strength
    gy = (np.roll(g, -1, axis=0) - np.roll(g, 1, axis=0)) * strength
    nz = np.ones_like(g)
    ln = np.sqrt(gx * gx + gy * gy + nz * nz)
    nx, ny, nz = -gx / ln, -gy / ln, nz / ln
    out = np.stack([(nx * 0.5 + 0.5), (ny * 0.5 + 0.5), (nz * 0.5 + 0.5)], axis=-1)
    return Image.fromarray((out * 255).astype(np.uint8), "RGB")


def roughness_from_albedo(img, base):
    """Darker / greasier pixels read as glossier."""
    g = np.asarray(img.convert("L")).astype(np.float32)
    r = base + (g - g.mean()) * 0.35
    r = np.clip(r, 20, 255)
    return Image.fromarray(r.astype(np.uint8), "L").convert("RGB")


def main():
    written = []
    for name, (src, size, colors, strength, rough) in SPECS.items():
        path = os.path.join(RAW, src)
        if not os.path.exists(path):
            print(f"  skip {name}: missing {src}")
            continue
        img = Image.open(path).convert("RGB")
        img = make_tileable(img)
        albedo = pixelate(img, size, colors)

        a_path = os.path.join(OUT, f"{name}_albedo.png")
        n_path = os.path.join(OUT, f"{name}_normal.png")
        r_path = os.path.join(OUT, f"{name}_rough.png")
        albedo.save(a_path, optimize=True)
        normal_from_height(albedo, strength).save(n_path, optimize=True)
        roughness_from_albedo(albedo, rough).save(r_path, optimize=True)
        written += [a_path, n_path, r_path]
        print(f"  {name}: {size}x{size}, {colors} colours")

    total = sum(os.path.getsize(p) for p in written)
    print(f"\n{len(written)} files, {total/1024:.0f} KB total")


if __name__ == "__main__":
    main()
