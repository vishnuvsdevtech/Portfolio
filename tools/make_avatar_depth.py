"""Depth-relit posterised portrait.

Why this replaces the luminance version: shape-from-shading on a photograph
cannot invent form — luminance is already a picture of light, so its gradient
only responds at edges. Here the geometry comes from a monocular depth model
(Depth Anything V2, ONNX, CPU), so the normals describe the actual surface of
the face, and the lighting is real:

    normal <- gradient of predicted depth
    lambert = max(0, N . L)          key light, upper left
    spec    = (N . H)^n * glint mask
    ao      = creases from the depth laplacian
    mask    = depth threshold -> subject separated from ground

Then the lit field is quantised into five tones and mapped through the accent
palette, which is what produces the printed, carved look rather than a photo.
"""
from __future__ import annotations

import argparse
import colorsys
import gc
import os

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "photo.jpg")
IMG_DIR = os.path.join(ROOT, "assets", "img")
AV_DIR = os.path.join(IMG_DIR, "avatar")
MODEL = "/opt/data/models/depth.onnx"

THEMES = {"neutral": 145, "green": 145, "teal": 178, "blue": 214,
          "violet": 268, "red": 2, "amber": 38, "orange": 14}
NET = 518                      # multiple of 14, what the model expects
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

_sess = None


def session():
    global _sess
    if _sess is None:
        _sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    return _sess


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def palette(hue, sat=1.0):
    return [
        hsl(hue, 0.45 * sat, 0.07),   # 0 deepest shadow
        hsl(hue, 0.62 * sat, 0.26),   # 1 shadow
        hsl(hue, 0.90 * sat, 0.52),   # 2 accent
        hsl(hue, 0.55 * sat, 0.78),   # 3 lit
        hsl(hue, 0.20 * sat, 0.95),   # 4 peak highlight
    ]


def load_rgb(size):
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    return im.resize((size, size), Image.LANCZOS)


def predict_depth(im):
    small = im.resize((NET, NET), Image.BILINEAR)
    x = np.asarray(small, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    x = np.transpose(x, (2, 0, 1))[None].astype(np.float32)
    out = session().run(None, {session().get_inputs()[0].name: x})[0]
    d = np.asarray(out, dtype=np.float32).squeeze()
    d = (d - d.min()) / max(d.max() - d.min(), 1e-6)      # 0 far, 1 near
    del x, out
    gc.collect()
    return d


def smooth(a, radius):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im, dtype=np.float32) / 255.0


def lit_field(depth, hue, sat):
    """Relight the predicted surface, return float tone index + subject mask."""
    # the depth model's output has soft banding; the gradient amplifies it into
    # topographic contour lines unless it is smoothed hard first
    z = smooth(depth, 6.0)
    gy, gx = np.gradient(z)
    k = 11.0                                   # relief strength in normal space
    nx, ny = -gx * k, gy * k                   # image y points down
    nz = np.ones_like(nx)
    nrm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nx, ny, nz = nx / nrm, ny / nrm, nz / nrm

    L = np.array([-0.52, -0.58, 0.62], np.float32)
    L /= np.linalg.norm(L)
    lam = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)

    H = L + np.array([0, 0, 1], np.float32)
    H /= np.linalg.norm(H)
    ndoth = np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0, 1)
    spec = ndoth ** 30

    # ambient occlusion: concavity of the depth surface
    lap = np.abs(np.gradient(np.gradient(z, axis=0), axis=0) +
                 np.gradient(np.gradient(z, axis=1), axis=1))
    ao = 1.0 - np.clip(lap * 6.0, 0, 0.4)

    # rim: grazing angles on the lit side
    rim = np.clip((1.0 - nz) * 2.2, 0, 1) * lam

    shade = (0.12 + 0.95 * lam) * ao + 0.22 * spec + 0.28 * rim

    lo, hi = np.percentile(shade, 1), np.percentile(shade, 99)
    shade = np.clip((shade - lo) / max(hi - lo, 1e-6), 0, 1)
    del z, gy, gx, nx, ny, nz, nrm, lam, ndoth, spec, lap, ao, rim
    gc.collect()
    return shade


def render(name, hue, size, sat=1.0, im=None):
    im = im or load_rgb(size)
    depth = predict_depth(im)
    shade = lit_field(depth, hue, sat)

    # subject mask straight from depth: near = person, far = ground
    ds = smooth(depth, 9.0)
    mask = np.clip((ds - 0.40) * 5.0, 0, 1)

    thr = np.percentile(shade[mask > 0.5], (16, 38, 60, 82)) if (mask > 0.5).any() else \
        np.percentile(shade, (16, 38, 60, 82))
    idx = np.digitize(shade, thr).astype(np.float32)

    # ground: flat deep tone, lifted slightly toward the subject's feet
    ground_idx = np.zeros_like(shade)     # the ground holds one flat tone
    idx = idx * mask + ground_idx * (1 - mask)

    pal = np.array(palette(hue, sat), np.float32) / 255.0
    rgb = pal[np.clip(idx, 0, 4).astype(np.uint8)]
    del idx, shade, depth, mask, ds

    # grain + a whisper of vignette
    rng = np.random.default_rng(5)
    g = rng.normal(0, 0.035, rgb.shape[:2]).astype(np.float32)
    rgb = np.clip(rgb + g[..., None] * 0.5, 0, 1)

    out = Image.fromarray((rgb * 255).astype(np.uint8))
    del rgb
    gc.collect()

    web = out.resize((512, 512), Image.LANCZOS)
    web.save(os.path.join(AV_DIR, f"avatar-{name}.webp"), quality=88, method=6)
    out.save(os.path.join(IMG_DIR, f"portrait-{name}.webp"), quality=84, method=6)
    if name == "green":
        out.save(os.path.join(IMG_DIR, "profile-picture.png"), optimize=True)
    return os.path.join(IMG_DIR, f"portrait-{name}.webp")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=896)
    ap.add_argument("--only", default=None)
    a = ap.parse_args()
    os.makedirs(AV_DIR, exist_ok=True)
    im = load_rgb(a.size)
    tiles = []
    for name, hue in THEMES.items():
        if a.only and name != a.only:
            continue
        sat = 0.20 if name == "neutral" else 1.0
        p = render(name, hue, a.size, sat, im)
        print(f"{os.path.basename(p)} {os.path.getsize(p)//1024}KB")
        tiles.append(p)
    if len(tiles) > 1:
        tw, pad = 256, 14
        cols = 4
        rows = (len(tiles) + cols - 1) // cols
        from PIL import ImageDraw
        canvas = Image.new("RGB", (cols * tw + pad * (cols + 1),
                                   rows * (tw + 22) + pad * (rows + 1)), (10, 12, 10))
        dr = ImageDraw.Draw(canvas)
        for i, p in enumerate(tiles):
            c, r = i % cols, i // cols
            x, y = pad + c * (tw + pad), pad + r * (tw + 22 + pad)
            with Image.open(p) as t:
                canvas.paste(t.convert("RGB").resize((tw, tw), Image.LANCZOS), (x, y))
            dr.text((x + 2, y + tw + 4), os.path.basename(p).replace("portrait-", "").replace(".webp", ""),
                    fill=(150, 200, 165))
        sp = os.path.join(AV_DIR, "_sheet.png")
        canvas.save(sp, optimize=True)
        print(sp)


if __name__ == "__main__":
    main()
