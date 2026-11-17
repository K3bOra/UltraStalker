#!/usr/bin/env python3
"""Paints the website's background art: black silk with flowing champagne-gold threads.

Run once; it writes web/ui/bg-art.webp (wide, computer) and web/ui/bg-art-tall.webp
(phone). Everything is drawn here from maths: no stock images, nothing to license.
The art is static on the page (one fixed layer), so it costs nothing while scrolling."""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "web", "ui")


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def ribbon(draw, W, H, ss, n, y0, y1, amp, freq, phase, spread, twist, weight, horizontal=True, seed=0):
    """A bundle of thin threads that flows across the canvas like a fold of silk."""
    rnd = random.Random(seed)
    steps = 900
    for i in range(n):
        t = i / max(1, n - 1)
        u = np.linspace(-0.08, 1.08, steps)
        env = 0.55 + 0.45 * np.sin(math.pi * u * 1.15 + phase * 0.7) ** 2
        base = y0 + (y1 - y0) * smooth(u) + amp * np.sin(2 * math.pi * freq * u + phase)
        fold = spread * (t - 0.5) * env * np.cos(2 * math.pi * u * twist + t * 1.9 + phase)
        v = base + fold + 0.004 * np.sin(2 * math.pi * u * 7 + t * 9)
        # brighter in the middle of the bundle, fading at both ends of each thread
        core = math.exp(-((t - 0.5) ** 2) / 0.06)
        lum = weight * (0.28 + 0.72 * core) * (0.75 + 0.25 * rnd.random())
        if horizontal:
            xs, ys = u * W, v * H
        else:
            xs, ys = v * W, u * H
        pts = list(zip((xs * ss).tolist(), (ys * ss).tolist()))
        # draw in short segments so the ends can fade out
        seg = 30
        for k in range(0, steps - 1, seg):
            a = k / steps
            fade = float(smooth(np.array(a / 0.12)) * smooth(np.array((1 - a) / 0.12)))
            val = lum * fade
            if val < 0.01:
                continue
            draw.line(pts[k : k + seg + 1], fill=int(min(1.0, val) * 255), width=max(1, int(ss * (0.9 if core < 0.6 else 1.3))))


def paint(W, H, tall, path):
    ss = 2
    layer = Image.new("L", (W * ss, H * ss), 0)
    d = ImageDraw.Draw(layer)
    if not tall:
        # main silk fold: rises from the lower left to the upper right
        ribbon(d, W, H, ss, 120, 0.95, 0.30, 0.08, 0.8, 0.6, 0.34, 1.25, 1.0, seed=1)
        # a slimmer echo across the top right
        ribbon(d, W, H, ss, 60, 0.26, 0.04, 0.05, 1.1, 2.4, 0.16, 1.7, 0.55, seed=2)
        # a faint low thread bundle at the bottom
        ribbon(d, W, H, ss, 22, 1.02, 0.80, 0.03, 0.6, 4.1, 0.08, 0.9, 0.35, seed=3)
    else:
        ribbon(d, W, H, ss, 100, 0.10, 0.95, 0.10, 0.7, 1.2, 0.42, 1.1, 1.0, horizontal=False, seed=4)
        ribbon(d, W, H, ss, 26, 1.05, 0.55, 0.06, 1.2, 3.0, 0.12, 1.5, 0.5, horizontal=False, seed=5)
    layer = layer.resize((W, H), Image.LANCZOS)
    f = lambda im: np.asarray(im, dtype=np.float32) / 255.0
    lines = f(layer)
    glow1 = f(layer.filter(ImageFilter.GaussianBlur(3)))
    glow2 = f(layer.filter(ImageFilter.GaussianBlur(18)))
    glow3 = f(layer.filter(ImageFilter.GaussianBlur(60)))
    light = lines * 0.85 + glow1 * 0.8 + glow2 * 1.3 + glow3 * 2.0

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = xx / W, yy / H
    # base: obsidian with a warm charcoal centre
    r = np.sqrt((nx - 0.5) ** 2 * (1.0 if not tall else 2.2) + (ny - 0.45) ** 2)
    base = np.clip(1 - r * 1.25, 0, 1)
    img = np.zeros((H, W, 3), np.float32)
    img += np.array([9, 9, 10], np.float32)
    img += base[..., None] * np.array([16, 13, 9], np.float32)
    # champagne halo at the top, copper ember at the lower right
    halo = np.exp(-(((nx - 0.5) / 0.55) ** 2 + ((ny + 0.05) / 0.35) ** 2))
    ember = np.exp(-(((nx - 0.92) / 0.30) ** 2 + ((ny - 0.95) / 0.30) ** 2))
    img += halo[..., None] * np.array([44, 36, 22], np.float32)
    img += ember[..., None] * np.array([34, 18, 10], np.float32)

    # gold that shifts from champagne to deep gold to copper across the picture
    g = (nx * 0.7 + ny * 0.3)
    champagne = np.array([255, 232, 180], np.float32)
    gold = np.array([226, 176, 84], np.float32)
    copper = np.array([176, 108, 64], np.float32)
    col = np.where(g[..., None] < 0.55, champagne + (gold - champagne) * (g[..., None] / 0.55), gold + (copper - gold) * ((g[..., None] - 0.55) / 0.45))
    lit = np.clip(light, 0, 1.6)[..., None]
    img += col * lit * 0.78
    # hot white-gold where many threads cross
    img += np.array([255, 244, 214], np.float32) * np.clip(lines - 0.55, 0, 1)[..., None] * 0.35

    # soft bokeh along the light
    rnd = random.Random(11 if not tall else 12)
    bok = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(bok)
    ys_, xs_ = np.nonzero(glow2 > glow2.max() * 0.35)
    for _ in range(46 if not tall else 30):
        if not len(xs_):
            break
        j = rnd.randrange(len(xs_))
        cx, cy = int(xs_[j] + rnd.uniform(-60, 60)), int(ys_[j] + rnd.uniform(-60, 60))
        rad = rnd.choice([3, 4, 6, 9, 14, 22, 30])
        bd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=int(rnd.uniform(0.05, 0.22) * 255))
    bok = np.asarray(bok.filter(ImageFilter.GaussianBlur(2.5)), dtype=np.float32) / 255.0
    img += bok[..., None] * np.array([255, 214, 140], np.float32) * 0.8

    # keep the reading area calm: a gentle dark veil through the middle
    veil = np.exp(-(((nx - 0.5) / 0.42) ** 2 + ((ny - 0.55) / 0.40) ** 2))
    img *= (1 - 0.32 * veil)[..., None]
    # vignette
    vig = np.clip(1 - (((nx - 0.5) * 1.15) ** 2 + ((ny - 0.5) * 1.25) ** 2) * 0.9, 0.35, 1)
    img *= vig[..., None]
    # film grain
    rng = np.random.default_rng(7)
    img += rng.normal(0, 2.2, (H, W, 1)).astype(np.float32)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    out.save(path, "WEBP", quality=82, method=6)
    print(path, os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    paint(2560, 1440, False, os.path.join(OUT, "bg-art.webp"))
    paint(1170, 2532, True, os.path.join(OUT, "bg-art-tall.webp"))
