#!/usr/bin/env python3
"""
Indigold asset generator — pure standard library, NO network, NO third-party deps.

Generates:
  client/public/icons/icon-192.png, icon-512.png   (app mark)
  client/public/images/hero-dashboard.png          (cosmic backgrounds)
  client/public/images/graph-constellation.png
  client/public/images/timeline-header.png
  client/public/images/weekly-brief.png

These are deliberately synthetic "Deep Space Observatory" textures (near-black with
star fields + soft indigo/gold/teal nebula glows). Replace freely later. Run:
  python3 scripts/generate_assets.py
"""
import os
import math
import random
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ICONS = os.path.join(ROOT, "client", "public", "icons")
IMAGES = os.path.join(ROOT, "client", "public", "images")

BG = (10, 10, 18)          # #0a0a12 near-black canvas
INDIGO = (90, 80, 230)
INDIGO_DEEP = (60, 55, 170)
GOLD = (212, 175, 71)
TEAL = (70, 200, 210)
WHITE = (235, 235, 255)


def clamp(v):
    return 0 if v < 0 else 255 if v > 255 else int(v)


def encode_png_rgb(px, w, h, path):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        row = px[y]
        for x in range(w):
            r, g, b = row[x]
            raw.append(r); raw.append(g); raw.append(b)
    comp = zlib.compress(bytes(raw), 6)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))  # RGB
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def new_canvas(w, h, bg=BG):
    return [[bg for _ in range(w)] for _ in range(h)]


def add_glow(px, w, h, cx, cy, r, color, strength):
    x0, x1 = max(0, int(cx - r)), min(w, int(cx + r))
    y0, y1 = max(0, int(cy - r)), min(h, int(cy + r))
    for y in range(y0, y1):
        dy = y - cy
        row = px[y]
        for x in range(x0, x1):
            dx = x - cx
            d = math.sqrt(dx * dx + dy * dy)
            if d >= r:
                continue
            t = (1 - d / r) ** 2 * strength
            cur = row[x]
            row[x] = (
                clamp(cur[0] + color[0] * t),
                clamp(cur[1] + color[1] * t),
                clamp(cur[2] + color[2] * t),
            )


def add_stars(px, w, h, count, rng):
    for _ in range(count):
        x = rng.randrange(w)
        y = rng.randrange(h)
        b = rng.random()
        tint = rng.random()
        if tint < 0.7:
            col = WHITE
        elif tint < 0.85:
            col = GOLD
        else:
            col = INDIGO
        inten = 0.4 + b * 0.6
        px[y][x] = (clamp(col[0] * inten), clamp(col[1] * inten), clamp(col[2] * inten))
        # faint halo for the brightest stars
        if b > 0.85:
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + ox, y + oy
                if 0 <= nx < w and 0 <= ny < h:
                    c = px[ny][nx]
                    px[ny][nx] = (clamp(c[0] + 40), clamp(c[1] + 40), clamp(c[2] + 55))


def make_background(name, w, h, glows, stars, seed):
    rng = random.Random(seed)
    px = new_canvas(w, h)
    for (cx, cy, r, color, strength) in glows:
        add_glow(px, w, h, cx, cy, r, color, strength)
    add_stars(px, w, h, stars, rng)
    path = os.path.join(IMAGES, name)
    encode_png_rgb(px, w, h, path)
    print("wrote", path, f"({w}x{h})")


def make_icon(size, path):
    px = new_canvas(size, size, BG)
    # radial indigo field
    add_glow(px, size, size, size / 2, size / 2, size * 0.55, INDIGO_DEEP, 0.5)
    cx = cy = (size - 1) / 2.0
    # gold diamond outline
    r = size * 0.34
    ht = size * 0.045
    for y in range(size):
        for x in range(size):
            if abs(abs(x - cx) + abs(y - cy) - r) <= ht:
                px[y][x] = GOLD
    # gold serif "I"
    stem = size * 0.05
    top, bot = size * 0.30, size * 0.70
    serif = size * 0.12
    sh = size * 0.035
    for y in range(size):
        for x in range(size):
            in_stem = abs(x - cx) <= stem and top <= y <= bot
            in_top = abs(x - cx) <= serif and top <= y <= top + sh
            in_bot = abs(x - cx) <= serif and bot - sh <= y <= bot
            if in_stem or in_top or in_bot:
                px[y][x] = GOLD
    encode_png_rgb(px, size, size, path)
    print("wrote", path, f"({size}x{size})")


def main():
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(IMAGES, exist_ok=True)
    make_icon(192, os.path.join(ICONS, "icon-192.png"))
    make_icon(512, os.path.join(ICONS, "icon-512.png"))

    make_background(
        "hero-dashboard.png", 1000, 440,
        glows=[(420, 120, 300, INDIGO, 0.5), (820, 360, 240, GOLD, 0.35)],
        stars=520, seed=7,
    )
    make_background(
        "graph-constellation.png", 800, 800,
        glows=[(400, 400, 360, INDIGO, 0.45), (560, 260, 200, TEAL, 0.25)],
        stars=620, seed=13,
    )
    make_background(
        "timeline-header.png", 1000, 320,
        glows=[(220, 160, 260, TEAL, 0.4), (760, 120, 200, INDIGO, 0.3)],
        stars=360, seed=21,
    )
    make_background(
        "weekly-brief.png", 1000, 360,
        glows=[(780, 160, 280, GOLD, 0.4), (240, 240, 220, INDIGO, 0.3)],
        stars=400, seed=29,
    )


if __name__ == "__main__":
    main()
