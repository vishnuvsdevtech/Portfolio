"""Recolour the hero portrait for every accent theme on the site.

The master (assets/img/gen/master.png) is a single-hue relief illustration: flat
planes of one colour from near-black to pale highlights. To theme it, each pixel's
hue is rotated in OKLCH space while its lightness and chroma are kept. OKLCH is
perceptual, so a green or teal version looks exactly as light and as contrasty as
the red original — an HSL rotation would turn the same mid-tones into neon.

Run from the repo root:  python3 tools/recolor.py
Outputs: assets/img/portrait-<accent>.webp (1024px hero), avatar/avatar-<accent>.webp
(512px nav avatar), portrait.webp (untouched master), profile-picture.png and
og-image.jpg (default green theme), and a contact sheet in gen/_sheet.png.
"""
from __future__ import annotations

import colorsys
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "img", "gen", "master.png")
IMG = os.path.join(ROOT, "assets", "img")
AV = os.path.join(IMG, "avatar")

# must match the swatches in index.html and --accent-h in style.css
THEMES = {"orange": 14, "red": 2, "amber": 38, "green": 145,
          "teal": 178, "blue": 214, "violet": 268}
DEFAULT = "green"


# ---- sRGB <-> OKLab -------------------------------------------------------
def _to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def rgb_to_oklab(rgb):
    r, g, b = np.moveaxis(_to_lin(rgb), -1, 0)
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return np.stack([0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                     1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                     0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s], -1)


def oklab_to_lin(lab):
    L, a, b = np.moveaxis(lab, -1, 0)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return np.stack([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                     -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                     -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s], -1)


def oklch_hue_of_hsl(h):
    rgb = np.array(colorsys.hls_to_rgb(h / 360, 0.56, 0.92), np.float64)
    _, a, b = rgb_to_oklab(rgb[None, None])[0, 0]
    return np.arctan2(b, a)


def source_hue(lab):
    """Chroma-weighted mean hue of the master."""
    a, b = lab[..., 1], lab[..., 2]
    c = np.hypot(a, b)
    return np.arctan2((np.sin(np.arctan2(b, a)) * c).sum(), (np.cos(np.arctan2(b, a)) * c).sum())


def recolor(lab, dh):
    L, a, b = np.moveaxis(lab, -1, 0)
    C, h = np.hypot(a, b), np.arctan2(b, a) + dh
    # keep L and hue, shrink chroma only as far as needed to stay inside sRGB
    lo, hi = np.zeros_like(C), np.ones_like(C)
    ok = lambda k: np.all((oklab_to_lin(np.stack([L, C * k * np.cos(h), C * k * np.sin(h)], -1)) >= -1e-4)
                          & (oklab_to_lin(np.stack([L, C * k * np.cos(h), C * k * np.sin(h)], -1)) <= 1 + 1e-4), -1)
    full = ok(hi)
    for _ in range(10):
        mid = (lo + hi) / 2
        good = ok(mid)
        lo, hi = np.where(good, mid, lo), np.where(good, hi, mid)
    k = np.where(full, 1.0, lo)
    out = np.stack([L, C * k * np.cos(h), C * k * np.sin(h)], -1)
    return _to_srgb(oklab_to_lin(out))


def save(arr, path, size, **kw):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).resize(
        (size, size) if isinstance(size, int) else size, Image.LANCZOS).save(path, **kw)


def main():
    src = Image.open(SRC).convert("RGB")
    rgb = np.asarray(src, np.float64) / 255.0
    lab = rgb_to_oklab(rgb)
    h0 = source_hue(lab)
    os.makedirs(AV, exist_ok=True)

    save(rgb, os.path.join(IMG, "portrait.webp"), 1024, quality=86, method=6)
    for name, hue in THEMES.items():
        out = recolor(lab, oklch_hue_of_hsl(hue) - h0)
        save(out, os.path.join(IMG, f"portrait-{name}.webp"), 1024, quality=86, method=6)
        save(out, os.path.join(AV, f"avatar-{name}.webp"), 512, quality=88, method=6)
        if name == DEFAULT:
            save(out, os.path.join(IMG, "profile-picture.png"), 1024, optimize=True)
            # og card: portrait centred on the darkest tone of the theme
            og = Image.new("RGB", (1200, 630), tuple(int(v * 255) for v in out[8, 8]))
            face = Image.fromarray((out * 255 + 0.5).astype(np.uint8)).resize((630, 630), Image.LANCZOS)
            og.paste(face, (285, 0))
            og.save(os.path.join(IMG, "og-image.jpg"), quality=88, optimize=True)
        print(f"portrait-{name}.webp  {os.path.getsize(os.path.join(IMG, f'portrait-{name}.webp')) // 1024}KB")

    names = ["source", *THEMES]
    tw, pad, cols = 240, 12, 4
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + pad * (cols + 1), rows * (tw + 20) + pad * (rows + 1)), (10, 10, 10))
    dr = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        p = os.path.join(IMG, "portrait.webp" if n == "source" else f"portrait-{n}.webp")
        c, r = i % cols, i // cols
        x, y = pad + c * (tw + pad), pad + r * (tw + 20 + pad)
        with Image.open(p) as t:
            sheet.paste(t.convert("RGB").resize((tw, tw), Image.LANCZOS), (x, y))
        dr.text((x + 2, y + tw + 3), n, fill=(200, 200, 200))
    sheet.save(os.path.join(IMG, "gen", "_sheet.png"))
    print("sheet:", os.path.join(IMG, "gen", "_sheet.png"))


if __name__ == "__main__":
    main()
