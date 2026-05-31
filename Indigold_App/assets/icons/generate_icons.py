#!/usr/bin/env python3
"""
Indigold icon generator — pure standard library, NO network, NO third-party deps.

Produces the PWA / Apple-touch PNG icons used by manifest.json and index.html.
Run:  python3 generate_icons.py
Output (written next to this script):
  icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png

The Indigold mark = an indigo field (#1E1B4B) with a gold (#D4AF37) emblem:
a centered diamond crossed by a vertical "I" bar — "indigo + gold".
This is intentionally trivial/synthetic art; replace freely later.
"""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))

# Palette
INDIGO = (30, 27, 75, 255)      # #1E1B4B background
INDIGO_HI = (49, 46, 129, 255)  # #312E81 subtle inner field
GOLD = (212, 175, 55, 255)      # #D4AF37 emblem
GOLD_HI = (245, 215, 110, 255)  # highlight


def blend(bg, fg):
    """Alpha-composite fg over bg (both RGBA 0-255)."""
    a = fg[3] / 255.0
    return tuple(int(fg[i] * a + bg[i] * (1 - a)) for i in range(3)) + (255,)


def make_canvas(size, bg):
    return [[bg for _ in range(size)] for _ in range(size)]


def fill_radial(px, size):
    """Soft radial field from INDIGO (edges) to INDIGO_HI (center)."""
    cx = cy = (size - 1) / 2.0
    maxd = (cx ** 2 + cy ** 2) ** 0.5
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / maxd
            t = max(0.0, 1.0 - d)  # 1 at center
            col = tuple(
                int(INDIGO[i] + (INDIGO_HI[i] - INDIGO[i]) * t) for i in range(3)
            ) + (255,)
            px[y][x] = col


def draw_diamond(px, size, color, scale=0.62, thickness=0.10):
    """Draw a diamond outline (|x|+|y| == r), thickness as fraction of size."""
    cx = cy = (size - 1) / 2.0
    r = size * scale / 2.0
    half_t = size * thickness / 2.0
    for y in range(size):
        for x in range(size):
            dist = abs(x - cx) + abs(y - cy)
            if abs(dist - r) <= half_t:
                px[y][x] = blend(px[y][x], color)


def draw_ibar(px, size, color):
    """Draw a centered serif 'I'."""
    cx = (size - 1) / 2.0
    stem_w = size * 0.085
    top = size * 0.30
    bot = size * 0.70
    serif_w = size * 0.20
    serif_h = size * 0.055
    for y in range(size):
        for x in range(size):
            in_stem = abs(x - cx) <= stem_w / 2 and top <= y <= bot
            in_top = abs(x - cx) <= serif_w / 2 and top <= y <= top + serif_h
            in_bot = abs(x - cx) <= serif_w / 2 and bot - serif_h <= y <= bot
            if in_stem or in_top or in_bot:
                px[y][x] = blend(px[y][x], color)


def round_corners(px, size, radius_frac=0.0):
    if radius_frac <= 0:
        return
    r = size * radius_frac
    for y in range(size):
        for x in range(size):
            for (cx, cy) in ((r, r), (size - r, r), (r, size - r), (size - r, size - r)):
                inside_box = (
                    (x < r and y < r and cx == r and cy == r) or
                    (x > size - r and y < r and cx == size - r and cy == r) or
                    (x < r and y > size - r and cx == r and cy == size - r) or
                    (x > size - r and y > size - r and cx == size - r and cy == size - r)
                )
                if inside_box and ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 > r:
                    px[y][x] = (0, 0, 0, 0)


def encode_png(px, size, path):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            raw.extend(px[y][x])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


def build(size, maskable=False, corner=0.0):
    px = make_canvas(size, INDIGO)
    fill_radial(px, size)
    # Maskable icons need safe padding; shrink the emblem a touch.
    scale = 0.50 if maskable else 0.62
    draw_diamond(px, size, GOLD, scale=scale, thickness=0.085)
    draw_diamond(px, size, GOLD_HI, scale=scale - 0.14, thickness=0.02)
    draw_ibar(px, size, GOLD)
    round_corners(px, size, corner)
    return px


def main():
    targets = [
        ("icon-192.png", 192, False, 0.0),
        ("icon-512.png", 512, False, 0.0),
        ("icon-512-maskable.png", 512, True, 0.0),
        ("apple-touch-icon.png", 180, False, 0.0),  # iOS applies its own mask
    ]
    for name, size, maskable, corner in targets:
        px = build(size, maskable=maskable, corner=corner)
        out = os.path.join(HERE, name)
        encode_png(px, size, out)
        print("wrote", out, f"({size}x{size})")


if __name__ == "__main__":
    main()
