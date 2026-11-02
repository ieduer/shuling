#!/usr/bin/env python3
"""書靈美術後製：RAW_DIR/*.jpg -> OUT_DIR/*.webp（遮罩、去底、裁切）。用法：python3 -I post.py RAW_DIR OUT_DIR [--force]
手法同字靈（2026-10-28 管道）：圓章羽化、亮度去底、獸以羽化圓窗、地圖裁掉模型亂畫的書法與印章。"""
import os, sys, glob
from PIL import Image, ImageFilter, ImageDraw, ImageOps, ImageChops
RAW = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
FORCE = "--force" in sys.argv

def load(name):
    for ext in ("png", "jpg"):
        p = f"{RAW}/{name}.{ext}"
        if os.path.exists(p): return Image.open(p).convert("RGB"), p
    return None, None

def bbox_of(im, thr=28):
    g = ImageOps.grayscale(im).point(lambda v: 255 if v > thr else 0)
    g = g.filter(ImageFilter.MaxFilter(5))
    return g.getbbox() or (0, 0, im.width, im.height)

def feather_circle(size, r_in, r_out):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    c = size / 2
    d.ellipse((c - r_out, c - r_out, c + r_out, c + r_out), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(max(1, (r_out - r_in) / 2)))
    # keep full opacity inside r_in
    inner = Image.new("L", (size, size), 0)
    ImageDraw.Draw(inner).ellipse((c - r_in, c - r_in, c + r_in, c + r_in), fill=255)
    return ImageChops.lighter(m, inner)

def coin(name, out_px):
    im, src = load(name)
    if im is None: return "missing"
    x0, y0, x1, y1 = bbox_of(im, 30)
    w, h = x1 - x0, y1 - y0
    s = min(w, h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = s / 2 * 0.985
    half = int(s / 2 + 6)
    sq = im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    size = sq.width
    mask = feather_circle(size, r - 3, r)
    sq.putalpha(mask)
    sq = sq.resize((out_px, out_px), Image.LANCZOS)
    sq.save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    return "ok"

def keyed(name, out_px, lo=14, hi=70, pad=0.06):
    im, src = load(name)
    if im is None: return "missing"
    g = ImageOps.grayscale(im)
    # luminance key: alpha ramps from lo..hi; max channel for coloured glows
    r, gg, b = im.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, gg), b)
    a = mx.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))
    a = a.filter(ImageFilter.GaussianBlur(0.6))
    bb = a.point(lambda v: 255 if v > 40 else 0).getbbox() or (0, 0, im.width, im.height)
    x0, y0, x1, y1 = bb
    w, h = x1 - x0, y1 - y0
    s = int(max(w, h) * (1 + pad * 2))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)
    rgba = im.copy(); rgba.putalpha(a)
    sq = rgba.crop(box)
    sq = sq.resize((out_px, out_px), Image.LANCZOS)
    sq.save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    return "ok"

def keyed_bg(name, out_px, pad=0.06):
    """Key out the dominant background colour sampled from the corners (for images the model refused to put on black)."""
    im, src = load(name)
    if im is None: return "missing"
    px = im.load(); w, h = im.size
    samples = [px[x, y] for x in (4, w - 5) for y in (4, h - 5)] + [px[w // 2, 4], px[w // 2, h - 5], px[4, h // 2], px[w - 5, h // 2]]
    bg = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))
    a = Image.new("L", im.size)
    ap = a.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
            ap[x, y] = 0 if d < 14 else 255 if d > 60 else int((d - 14) * 255 / 46)
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    bb = a.point(lambda v: 255 if v > 60 else 0).getbbox() or (0, 0, w, h)
    x0, y0, x1, y1 = bb
    s = int(max(x1 - x0, y1 - y0) * (1 + pad * 2)); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    rgba = im.copy(); rgba.putalpha(a)
    sq = rgba.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((out_px, out_px), Image.LANCZOS)
    sq.save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    return "ok"

def beast(name, out_px=512):
    im, src = load(name)
    if im is None: return "missing"
    x0, y0, x1, y1 = bbox_of(im, 26)
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    s = int(max(w, h) * 1.08)
    half = s // 2
    # pad with black if the box leaves the frame
    canvas = Image.new("RGB", (s, s), (0, 0, 0))
    crop = im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    canvas.paste(crop, (0, 0))
    mask = feather_circle(s, s * 0.36, s * 0.5)
    canvas.putalpha(mask)
    canvas = canvas.resize((out_px, out_px), Image.LANCZOS)
    canvas.save(f"{OUT}/{name}.webp", "WEBP", quality=86, method=6)
    return "ok"

def photo(name, w, h, q=80, crop_top=0.0, crop_bottom=0.0):
    im, src = load(name)
    if im is None: return "missing"
    if crop_top or crop_bottom: im = im.crop((0, int(im.height * crop_top), im.width, int(im.height * (1 - crop_bottom))))
    im = ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, 0.5))
    im.save(f"{OUT}/{name}.webp", "WEBP", quality=q, method=6)
    return "ok"

def logo():
    im, src = load("logo")
    if im is None: return "missing"
    x0, y0, x1, y1 = bbox_of(im, 30)
    s = min(x1 - x0, y1 - y0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; r = s / 2 * 0.99; half = int(s / 2 + 4)
    sq = im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    sq.putalpha(feather_circle(sq.width, r - 2, r))
    sq.resize((512, 512), Image.LANCZOS).save(f"{OUT}/logo.webp", "WEBP", quality=92, method=6)
    for px in (32, 180, 192, 512):
        sq.resize((px, px), Image.LANCZOS).save(f"{OUT}/icon-{px}.png", "PNG", optimize=True)
    # maskable: pad 12% on dark lacquer
    m = Image.new("RGBA", (512, 512), (23, 19, 16, 255)); inner = sq.resize((400, 400), Image.LANCZOS); m.alpha_composite(inner, (56, 56))
    m.save(f"{OUT}/icon-maskable-512.png", "PNG", optimize=True)
    return "ok"

jobs = []
jobs.append(("logo", logo))
jobs.append(("dial", lambda: coin("dial", 192)))
for n in ["nav-home", "nav-journey", "nav-board", "nav-codex", "nav-me"]: jobs.append((n, lambda n=n: coin(n, 128)))
for i in range(1, 13): jobs.append((f"rank-{i}", lambda i=i: coin(f"rank-{i}", 256)))
for n in ["gem-N", "gem-R", "gem-SR", "gem-SSR", "candle", "mana", "star"]: jobs.append((n, lambda n=n: keyed(n, 160)))
jobs.append(("crown", lambda: keyed_bg("crown", 160)))
for n in ["mode-daily", "mode-free", "mode-wrong"]: jobs.append((n, lambda n=n: photo(n, 960, 640, 78)))
for n in sorted(glob.glob(f"{RAW}/beast-*.*")):
    b = os.path.basename(n).rsplit(".", 1)[0]; jobs.append((b, lambda b=b: beast(b)))
for n in ["map-shi", "map-aegean", "map-rome", "map-fusang", "map-nobel", "map-schools", "map-exam", "map-wen", "map-shuo", "map-xin", "map-east", "map-europe", "map-c19", "map-modern"]: jobs.append((n, lambda n=n: photo(n, 896, 1536, 76, crop_top=0.22, crop_bottom=0.06)))
for n in ["bg-home", "bg-board", "bg-codex", "bg-me", "bg-battle", "bg-result"]: jobs.append((n, lambda n=n: photo(n, 896, 1536, 72)))
for n in ["node-off", "node-lit", "node-clear", "skill-zhuzhao", "skill-zhishui", "skill-shenji"]: jobs.append((n, lambda n=n: coin(n, 160)))
jobs.append(("cardback", lambda: photo("cardback", 384, 512, 84)))
done = 0
for name, fn in jobs:
    out = f"{OUT}/{name}.webp"
    src = next((f"{RAW}/{name}.{e}" for e in ("png", "jpg") if os.path.exists(f"{RAW}/{name}.{e}")), None)
    if src and os.path.exists(out) and not FORCE and os.path.getmtime(out) > os.path.getmtime(src): continue
    r = fn(); print(name, r); done += 1 if r == "ok" else 0
print("processed", done)
