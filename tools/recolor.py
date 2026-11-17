"""Recolour the generated portrait across the site's accent hues.

The master is a crimson relief: one key light, four or five tonal planes, cream
highlights. Rather than re-generating per accent (eight paid calls), rotate hue in
HSL space — that preserves the plane structure exactly — and pull saturation out
of the top of the range so highlights stay near-cream instead of going green or
blue, which is what a naive hue-rotate does.
"""
from __future__ import annotations

import colorsys
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "img", "gen", "master.png")
IMG = os.path.join(ROOT, "assets", "img")
AV = os.path.join(IMG, "avatar")

THEMES = {"green": 145, "teal": 178, "blue": 214, "violet": 268,
          "red": 2, "amber": 38, "orange": 14}
SRC_HUE = 12.0          # the master's dominant hue


def rotate(rgb: np.ndarray, to_hue: float, sat_scale: float = 1.0) -> np.ndarray:
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    l = (mx + mn) / 2.0
    d = mx - mn
    s = np.where(d == 0, 0, d / (1 - np.abs(2 * l - 1) + 1e-6))

    # hue of each pixel
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    idx = m & (mx == r); h[idx] = ((g[idx] - b[idx]) / d[idx]) % 6
    idx = m & (mx == g) & (mx != r); h[idx] = (b[idx] - r[idx]) / d[idx] + 2
    idx = m & (mx == b) & (mx != r) & (mx != g); h[idx] = (r[idx] - g[idx]) / d[idx] + 4
    h *= 60.0

    h = (h - SRC_HUE + to_hue) % 360.0
    # highlights stay neutral: saturation falls away at the top of the range
    top = np.clip((l - 0.72) / 0.28, 0, 1) ** 1.5
    s = s * sat_scale * (1 - 0.8 * top)

    # back to rgb
    def f(n):
        k = (n + h / 30.0) % 12
        a = s * np.minimum(l, 1 - l)
        return l - a * np.maximum(-1, np.minimum(np.minimum(k - 3, 9 - k), 1))
    out = np.stack([f(0), f(8), f(4)], axis=2)
    return np.clip(out, 0, 1)


def lit(rgb: np.ndarray, to_hue: float) -> np.ndarray:
    """Accent as lighting rather than as pigment.

    Full hue rotation turns a face green on a cool accent, which reads as a bug.
    Real cinematography tints the *environment* and the shadows: skin stays warm,
    the ground and the shadow mass take the accent. So rotate hue only where the
    image is dark, and leave mid-tones and highlights alone.
    """
    mx = rgb.max(axis=2); mn = rgb.min(axis=2)
    l = (mx + mn) / 2.0
    # weight: 1 in deep shadow, 0 through mid-tones and highlights
    w = np.clip((0.46 - l) / 0.46, 0, 1) ** 1.15
    bold = rotate(rgb, to_hue)
    out = rgb * (1 - w[..., None]) + bold * w[..., None]
    # the ground is near-black and carries no hue of its own: tint it directly
    ground = np.clip((0.10 - l) / 0.10, 0, 1)[..., None]
    tint = np.array(colorsys.hls_to_rgb((to_hue % 360) / 360.0, 0.10, 0.45), np.float32)
    return np.clip(out * (1 - ground) + tint * ground, 0, 1)


def main():
    im = Image.open(SRC).convert("RGB")
    rgb = np.asarray(im, dtype=np.float32) / 255.0
    os.makedirs(AV, exist_ok=True)
    for name, hue in THEMES.items():
        bold = Image.fromarray((rotate(rgb, hue) * 255).astype(np.uint8))
        bold.resize((1024, 1024), Image.LANCZOS).save(
            os.path.join(IMG, f"portrait-{name}-bold.webp"), quality=86, method=6)
        out = lit(rgb, hue)
        img = Image.fromarray((out * 255).astype(np.uint8))
        img.resize((1024, 1024), Image.LANCZOS).save(
            os.path.join(IMG, f"portrait-{name}.webp"), quality=86, method=6)
        img.resize((512, 512), Image.LANCZOS).save(
            os.path.join(AV, f"avatar-{name}.webp"), quality=88, method=6)
        if name == "green":
            img.save(os.path.join(IMG, "profile-picture.png"), optimize=True)
            img.resize((1200, 630), Image.LANCZOS).save(
                os.path.join(IMG, "og-image.jpg"), quality=88, optimize=True)
        print(f"portrait-{name}.webp  {os.path.getsize(os.path.join(IMG, f'portrait-{name}.webp'))//1024}KB")

    # neutral: desaturated, for places with no accent context
    out = rotate(rgb, SRC_HUE, sat_scale=0.18)
    img = Image.fromarray((out * 255).astype(np.uint8))
    img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(IMG, "portrait-neutral.webp"), quality=86, method=6)
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(AV, "avatar-neutral.webp"), quality=88, method=6)

    # contact sheet
    tiles = [os.path.join(IMG, f"portrait-{n}.webp") for n in ["neutral", *THEMES]]
    tw, pad, cols = 240, 12, 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + pad * (cols + 1), rows * (tw + 20) + pad * (rows + 1)), (10, 12, 10))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for i, p in enumerate(tiles):
        c, r = i % cols, i // cols
        x, y = pad + c * (tw + pad), pad + r * (tw + 20 + pad)
        with Image.open(p) as t:
            sheet.paste(t.convert("RGB").resize((tw, tw), Image.LANCZOS), (x, y))
        dr.text((x + 2, y + tw + 3), os.path.basename(p).replace("portrait-", "").replace(".webp", ""), fill=(150, 200, 165))
    sheet.save(os.path.join(IMG, "gen", "_sheet.png"))
    print("sheet:", os.path.join(IMG, "gen", "_sheet.png"))


if __name__ == "__main__":
    main()
