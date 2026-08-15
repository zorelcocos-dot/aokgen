#!/usr/bin/env python3
"""
Bakes the raw magenta-backed JPG sprite sheets into clean, pre-keyed,
pixel-perfect PNG atlases in public/assets/sprites/.

Why offline instead of at runtime:
  * The runtime ChromaKeyer re-decoded ~6 MB of JPG, ran a per-pixel key over
    1376x768 buffers and rebuilt an atlas on the main thread during the first
    seconds of play. That work is identical every single load.
  * JPG compression puts ringing around every sprite edge, so the runtime key
    had to use loose thresholds - which ate dark pixels inside the sprites and
    still left magenta fringes. Keying once, offline, with edge cleanup, gives
    a far cleaner result than any threshold can at runtime.
  * The sheets carry caption gutters ("WALKING", "ATTACK"), frame labels
    ("1a", "2b") and black grid rules. Those are art, not sprite, and were
    being rendered into the game. They are cropped out here by measuring the
    real grid rather than guessing an inset.

The grid for each sheet is measured from the image itself (the dark rules and
the magenta background), so a re-exported sheet with different margins still
slices correctly.

Output: one PNG per sheet, RGBA, frames packed edge to edge with no bleed,
plus a JSON manifest describing the grid.

Usage: python3 tools/build_sprites.py
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "assets")
OUT = os.path.join(ROOT, "public", "assets", "sprites")
os.makedirs(OUT, exist_ok=True)

# sheet -> (cols, rows, has caption gutter on the left)
SHEETS = {
    "chicken_monster":   (4, 2, False),
    "chicken_hatchling": (4, 4, True),
    "colonel_stalker":   (4, 2, False),
    "employee_hands":    (4, 2, False),
    "kfc_props":         (4, 2, False),
    "kfc_items2":        (4, 2, False),
}

# Target size per frame in the baked atlas. Everything is resampled to this so
# the game gets a predictable, power-of-two-friendly grid.
FRAME = 256


def magenta_mask(a):
    """True where the pixel is chroma-key background."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    # Generous on the magenta itself, strict about not eating sprite pixels:
    # a real sprite pixel is never simultaneously high-red, high-blue and
    # low-green by this margin.
    return (r > 120) & (b > 110) & (g < 120) & ((r - g) > 45) & ((b - g) > 35)


def content_box(mask_bg, dark, W, H, gutter):
    """
    Measure the frame grid: the region that actually holds sprites, excluding
    the caption gutter and the outer margin.
    """
    content = ~mask_bg & ~dark
    cols = content.mean(axis=0)
    rows = content.mean(axis=1)

    def span(profile, thresh=0.004):
        idx = [i for i, v in enumerate(profile) if v > thresh]
        return (idx[0], idx[-1]) if idx else (0, len(profile) - 1)

    x0, x1 = span(cols)
    y0, y1 = span(rows)

    if gutter:
        # The caption block is a wide low-density run at the far left. Find the
        # first sustained gap after it and start the grid there.
        gap_start = None
        for i in range(x0, min(x1, W - 1)):
            if cols[i] < 0.002:
                gap_start = gap_start if gap_start is not None else i
            elif gap_start is not None:
                if i - gap_start > 12:       # a real gutter gap
                    x0 = i
                    break
                gap_start = None
    return x0, y0, x1, y1


def snap_to_rules(a, x0, x1, cols):
    """
    If the sheet has drawn grid rules, use them: they are the authored frame
    boundaries and are far more reliable than the content extents (a sprite
    that does not touch its cell edge would otherwise shrink the grid).
    """
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    dark = (r < 95) & (g < 95) & (b < 95)
    colwise = dark.mean(axis=0)
    rules = [i for i, v in enumerate(colwise) if v > 0.45]
    if not rules:
        return x0, x1

    # Group adjacent columns into single rules.
    groups, cur = [], [rules[0]]
    for i in rules[1:]:
        if i - cur[-1] <= 2:
            cur.append(i)
        else:
            groups.append(sum(cur) / len(cur))
            cur = [i]
    groups.append(sum(cur) / len(cur))

    # An interior rule sits at x0 + k*(width/cols). Solve for the grid that
    # puts a rule closest to each interior boundary.
    best = (x0, x1)
    best_err = 1e9
    for lo in range(max(0, x0 - 40), x0 + 41, 2):
        for hi in range(x1 - 40, min(a.shape[1], x1 + 41), 2):
            if hi - lo < 100:
                continue
            step = (hi - lo) / cols
            err = 0
            for k in range(1, cols):
                want = lo + k * step
                err += min(abs(want - gr) for gr in groups)
            if err < best_err:
                best_err, best = err, (lo, hi)
    return best


def strip_frame_label(sub, sub_bg):
    """
    Erase the authored frame label ("1a", "2c") from a cell.

    The sheets carry a small index caption in the bottom corner of every
    frame. Chroma keying cannot remove them - they are opaque paint, often
    drawn straight over the sprite (the mop frames put "1b" on the sleeve) -
    so without this they render in-game as text floating over the player's
    hands.

    They are found by their typographic signature rather than their position:
    a white glyph core wrapped in a hard black outline. Sprite art in these
    sheets never puts pure white immediately against pure black, so the test
    picks up labels sitting on the sprite and leaves highlights alone. The
    search is additionally confined to the bottom of the cell and to blobs of
    glyph size, which is where and what a caption is.
    """
    h, w = sub_bg.shape
    if h < 24 or w < 24:
        return

    r = sub[..., 0].astype(int)
    g = sub[..., 1].astype(int)
    b = sub[..., 2].astype(int)

    near_white = (r > 165) & (g > 165) & (b > 165)
    near_black = (r < 80) & (g < 80) & (b < 80)

    # Dilate the black mask; a glyph core is white paint hugging black outline.
    outline = near_black.copy()
    for _ in range(3):
        p = np.pad(outline, 1, constant_values=False)
        outline |= (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])

    cand = near_white & outline
    cand[: int(h * 0.60), :] = False      # captions live low in the cell
    if not cand.any():
        return

    min_glyph = max(12, int(h * w * 0.00025))
    max_glyph = int(h * w * 0.02)
    seen = np.zeros_like(cand)
    ys, xs = np.nonzero(cand)

    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        comp = []
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            if len(comp) > max_glyph:
                break
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if not (min_glyph <= len(comp) <= max_glyph):
            continue

        cy0 = min(c[0] for c in comp); cy1 = max(c[0] for c in comp)
        cx0 = min(c[1] for c in comp); cx1 = max(c[1] for c in comp)
        gh, gw = cy1 - cy0 + 1, cx1 - cx0 + 1
        # Glyph-shaped: small, roughly upright, not a long thin highlight.
        if gh > h * 0.22 or gw > w * 0.22:
            continue
        if gw > gh * 3 or gh > gw * 4:
            continue

        # Erase the glyph together with the outline that frames it.
        pad = 3
        for cy in range(max(0, cy0 - pad), min(h, cy1 + pad + 1)):
            for cx in range(max(0, cx0 - pad), min(w, cx1 + pad + 1)):
                if near_white[cy, cx] or near_black[cy, cx]:
                    sub_bg[cy, cx] = True


def key_and_clean(rgb, bg):
    """Apply the key, then erode one pixel to kill JPG ringing on the edge."""
    h, w = bg.shape
    alpha = np.where(bg, 0, 255).astype(np.uint8)

    # Any opaque pixel with a background neighbour is an edge pixel: JPG
    # ringing makes those a magenta-tinted halo, so drop them.
    pad = np.pad(bg, 1, constant_values=True)
    neighbour_bg = (
        pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:] |
        pad[:-2, :-2] | pad[:-2, 2:] | pad[2:, :-2] | pad[2:, 2:]
    )
    edge = (~bg) & neighbour_bg
    alpha[edge] = 0

    out = np.dstack([rgb, alpha])
    # Neutralise any residual magenta tint left in the remaining pixels.
    r, g, b = out[..., 0].astype(int), out[..., 1].astype(int), out[..., 2].astype(int)
    tinted = (out[..., 3] > 0) & (r > g + 60) & (b > g + 50)
    avg = ((r + b) // 2)
    out[..., 0] = np.where(tinted, np.minimum(r, avg), r)
    out[..., 2] = np.where(tinted, np.minimum(b, avg), b)
    return out


def process(name, cols, rows, gutter):
    path = os.path.join(SRC, f"{name}.jpg")
    if not os.path.exists(path):
        print(f"  skip {name}: no source")
        return None

    img = Image.open(path).convert("RGB")
    a = np.asarray(img)
    H, W, _ = a.shape
    bg = magenta_mask(a)
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    dark = (r < 95) & (g < 95) & (b < 95)

    x0, y0, x1, y1 = content_box(bg, dark, W, H, gutter)
    x0, x1 = snap_to_rules(a, x0, x1, cols)
    # Rows: the sheets all run edge to edge vertically.
    y0, y1 = 0, H

    cell_w = (x1 - x0) / cols
    cell_h = (y1 - y0) / rows

    atlas = Image.new("RGBA", (FRAME * cols, FRAME * rows), (0, 0, 0, 0))
    for ry in range(rows):
        for rx in range(cols):
            # Inset by 3px to drop the drawn rule without eating the sprite.
            l = int(round(x0 + rx * cell_w)) + 3
            t = int(round(y0 + ry * cell_h)) + 3
            rgt = int(round(x0 + (rx + 1) * cell_w)) - 3
            bot = int(round(y0 + (ry + 1) * cell_h)) - 3
            sub = a[t:bot, l:rgt]
            sub_bg = bg[t:bot, l:rgt].copy()
            strip_frame_label(sub, sub_bg)
            rgba = key_and_clean(sub, sub_bg)
            frame = Image.fromarray(rgba, "RGBA")

            # Trim to the sprite's own bounds, then centre it in the cell so
            # every frame shares one origin - this is what stops the sprite
            # jittering between animation frames.
            bbox = frame.getbbox()
            if bbox:
                frame = frame.crop(bbox)
            fw, fh = frame.size
            scale = min((FRAME - 8) / max(fw, 1), (FRAME - 8) / max(fh, 1), 1.0)
            if scale < 1.0:
                frame = frame.resize((max(1, int(fw * scale)), max(1, int(fh * scale))), Image.NEAREST)
                fw, fh = frame.size
            # Bottom-centre anchored: characters stand on the cell floor.
            ox = rx * FRAME + (FRAME - fw) // 2
            oy = ry * FRAME + (FRAME - fh) - 4
            atlas.paste(frame, (ox, oy), frame)

    out_path = os.path.join(OUT, f"{name}.png")
    atlas.save(out_path, optimize=True)
    kb = os.path.getsize(out_path) / 1024
    src_kb = os.path.getsize(path) / 1024
    print(f"  {name}: {cols}x{rows} grid  x[{x0}..{x1}]  {kb:.0f} KB (was {src_kb:.0f} KB jpg)")
    return {"cols": cols, "rows": rows, "frame": FRAME}


def main():
    manifest = {}
    for name, (cols, rows, gutter) in SHEETS.items():
        info = process(name, cols, rows, gutter)
        if info:
            manifest[name] = info
    with open(os.path.join(OUT, "sprites.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nwrote {len(manifest)} atlases + manifest")


if __name__ == "__main__":
    main()
