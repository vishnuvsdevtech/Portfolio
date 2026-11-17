"""Posterised duotone avatar, themed to the site's accent hue.

The reference look is screen-print: four flat tones, no gradients, a lit subject
on a dark ground, paper grain over the top. That is quantisation, so it is code:

  1. flatten detail (median + blur) so quantising produces planes, not confetti
  2. normalise contrast, quantise luma into 4 bands
  3. collapse the outer field into the darkest band (spotlight) — the reference
     is lit, not evenly exposed
  4. map bands through a palette derived from the accent hue
  5. grain last, so it sits on the flats

Memory note: this box has 3.9 GB and an early version was OOM-killed holding
several 1024^2 float arrays. Everything below is float32, one image at a time,
and the spotlight mask is cached rather than rebuilt per theme.
"""
from __future__ import annotations

import argparse
import colorsys
import gc
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = os.path.join(os.path.dirname(__file__), "..", "photo.jpg")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "img", "avatar")

THEMES = {
    "neutral": 145, "green": 145, "teal": 178, "blue": 214,
    "violet": 268, "red": 2, "amber": 38, "orange": 14,
}
BANDS = (0.22, 0.48, 0.72)

_mask_cache: dict[tuple[int, int], np.ndarray] = {}


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def palette(hue: float, sat: float = 1.0):
    return [
        hsl(hue, 0.42 * sat, 0.09),   # shadow
        hsl(hue, 0.62 * sat, 0.30),   # mid
        hsl(hue, 0.88 * sat, 0.58),   # accent
        hsl(hue, 0.22 * sat, 0.86),   # highlight, warm — never white
    ]


def spotlight(shape):
    key = (shape[0], shape[1])
    if key in _mask_cache:
        return _mask_cache[key]
    h, w = shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    r = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) / 1.414
    t = np.clip((r - 0.44) / 0.34, 0, 1)
    m = (t * t * (3 - 2 * t)).astype(np.float32)
    _mask_cache[key] = m
    return m


def load_gray(size: int) -> np.ndarray:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    im = im.resize((size, size), Image.LANCZOS).convert("L")
    im = im.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(im, dtype=np.float32) / 255.0
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    a = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1) ** 0.86
    del im
    gc.collect()
    return a


def grain(shape, amount=0.045, seed=7):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amount, (shape[0], shape[1])).astype(np.float32)
    small = ((n + 0.5) * 255).clip(0, 255).astype(np.uint8)
    coarse = Image.fromarray(small).resize((shape[1] // 3, shape[0] // 3), Image.BILINEAR)
    coarse = coarse.resize((shape[1], shape[0]), Image.BILINEAR)
    c = np.asarray(coarse, dtype=np.float32) / 255.0 - 0.5
    return (c * 0.7 + n * 0.3).astype(np.float32)


def norm3(v):
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def shade(g: np.ndarray, light=(-0.55, -0.42, 0.72)) -> np.ndarray:
    """Lambert + edge glints, blended over the tonal planes.

    Two earlier attempts failed and the reasons matter:
      * raw luminance quantised -> flat poster, no form (the original complaint)
      * normals from the luminance gradient alone -> only edges light up, the
        face blows out to white with contour lines, plus a diagonal wedge from a
        linear key falloff.

    What works is a blend: the luminance carries the tonal planes, a *heavily
    blurred* luminance acts as broad form for the directional term, and specular
    is masked to high-gradient areas so glints land on glasses and lips only.
    Thresholds are percentiles, so the band distribution is stable.
    """
    size = g.shape[0]
    # broad form: blur hard, so normals describe cheeks and brow, not pores
    hb = np.asarray(
        Image.fromarray((g * 255).astype(np.uint8))
             .filter(ImageFilter.GaussianBlur(size * 0.018)),
        dtype=np.float32) / 255.0
    gy, gx = np.gradient(hb)

    relief = 3.2
    nx, ny = -gx * relief, -gy * relief
    nz = np.ones_like(nx)
    nrm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nx, ny, nz = nx / nrm, ny / nrm, nz / nrm
    del nrm

    L = norm3(light)
    lam = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0.0, 1.0)

    H = norm3((L[0], L[1], L[2] + 1.0))
    ndoth = np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0.0, 1.0)
    grad = np.sqrt(gx * gx + gy * gy)
    glint_mask = np.clip(grad * 45.0, 0, 1)
    spec = (ndoth ** 30) * glint_mask

    out = 0.58 * g + 0.62 * lam + 0.42 * spec

    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    out = np.clip((out - lo) / max(hi - lo, 1e-6), 0, 1)
    del hb, gy, gx, nx, ny, nz, lam, ndoth, grad, glint_mask, spec
    return out


def render(name: str, hue: float, size: int, g: np.ndarray, sat: float = 1.0) -> str:
    lit = shade(g)
    # five bands on percentile cut points, so the split adapts to the lighting
    thr = np.percentile(lit, (18, 40, 62, 84))
    idx = np.digitize(lit, thr).astype(np.uint8)
    del lit
    tones = palette(hue, sat)
    # extra tone so the relief has a specular step the flat version never had
    tones = tones[:3] + [hsl(hue, 0.22 * sat, 0.93)] + [tones[3]]
    pal = (np.array(tones, dtype=np.float32) / 255.0)
    rgb = pal[idx]
    del idx
    rgb += grain(rgb.shape)[..., None] * 0.5
    np.clip(rgb, 0, 1, out=rgb)
    out = Image.fromarray((rgb * 255).astype(np.uint8))
    del rgb
    gc.collect()

    path = os.path.join(OUT, f"avatar-{name}.webp")
    out.resize((512, 512), Image.LANCZOS).save(path, quality=88, method=6)
    if name == "green":
        out.save(os.path.join(OUT, "..", "profile-picture.png"), optimize=True)
    with Image.open(path) as im:
        im.resize((1024, 1024), Image.LANCZOS).save(
            os.path.join(OUT, "..", f"portrait-{name}.webp"), quality=84, method=6)
    del out
    gc.collect()
    return path


def sheet(paths) -> str:
    pad, lh, cols = 16, 24, 4
    tw = 256
    rows = (len(paths) + cols - 1) // cols
    W = cols * tw + pad * (cols + 1)
    H = rows * (tw + lh) + pad * (rows + 1)
    canvas = Image.new("RGB", (W, H), (10, 12, 10))
    dr = ImageDraw.Draw(canvas)
    for i, p in enumerate(paths):
        c, r = i % cols, i // cols
        x, y = pad + c * (tw + pad), pad + r * (tw + lh + pad)
        with Image.open(p) as im:
            canvas.paste(im.convert("RGB").resize((tw, tw), Image.LANCZOS), (x, y))
        dr.text((x + 2, y + tw + 5),
                os.path.basename(p).replace("avatar-", "").replace(".webp", ""),
                fill=(150, 200, 165))
    sp = os.path.join(OUT, "_sheet.png")
    canvas.save(sp, optimize=True)
    return sp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=768)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    g = load_gray(a.size)
    paths = []
    for name, hue in THEMES.items():
        sat = 0.18 if name == "neutral" else 1.0
        paths.append(render(name, hue, a.size, g, sat))
    print("\n".join(f"{os.path.basename(p)} {os.path.getsize(p)//1024}KB" for p in paths))
    print(sheet(paths))


if __name__ == "__main__":
    main()
