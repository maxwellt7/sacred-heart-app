from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math

# Assets are written into apps/mobile/assets (this script lives in apps/mobile/scripts).
OUT = Path(__file__).resolve().parent.parent / 'assets'
REPO_ASSETS = OUT
OUT.mkdir(parents=True, exist_ok=True)

NAVY = '#0B0F19'
NAVY_2 = '#111827'
GOLD = '#D4A853'
GOLD_2 = '#F3D083'
GOLD_DARK = '#9A6B2F'
CREAM = '#FFF4D6'
TRANSPARENT = (0, 0, 0, 0)

def hex_to_rgba(value, alpha=255):
    value = value.lstrip('#')
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)

def draw_gradient_bg(size):
    img = Image.new('RGBA', (size, size), NAVY)
    px = img.load()
    c1 = (11, 15, 25)
    c2 = (20, 25, 40)
    cx, cy = size * 0.45, size * 0.35
    maxd = math.hypot(size, size)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / maxd
            t = min(1, d * 1.8)
            r = int(c2[0] * (1 - t) + c1[0] * t)
            g = int(c2[1] * (1 - t) + c1[1] * t)
            b = int(c2[2] * (1 - t) + c1[2] * t)
            px[x, y] = (r, g, b, 255)
    return img

def heart_points(cx, cy, scale, n=240):
    pts = []
    for i in range(n):
        t = math.pi - (2 * math.pi * i / n)
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t))
        pts.append((cx + x * scale, cy + y * scale))
    return pts

def draw_sacred_mark(draw, size, center_y_shift=0, monochrome=False):
    cx = size / 2
    cy = size * 0.55 + center_y_shift
    scale = size / 34
    color = '#FFFFFF' if monochrome else GOLD
    light = '#FFFFFF' if monochrome else GOLD_2
    dark = '#FFFFFF' if monochrome else GOLD_DARK

    # Rays behind the heart.
    for deg in range(-65, 66, 13):
        length = size * (0.26 if deg % 26 else 0.31)
        start = size * 0.19
        a = math.radians(deg - 90)
        x1 = cx + math.cos(a) * start
        y1 = cy + math.sin(a) * start
        x2 = cx + math.cos(a) * (start + length)
        y2 = cy + math.sin(a) * (start + length)
        draw.line((x1, y1, x2, y2), fill=hex_to_rgba(light, 110 if not monochrome else 180), width=max(4, size // 90))

    # Cross and flame.
    cross_w = size * 0.035
    cross_h = size * 0.18
    cross_y = cy - size * 0.31
    draw.rounded_rectangle((cx - cross_w/2, cross_y, cx + cross_w/2, cross_y + cross_h), radius=size*0.014, fill=color)
    draw.rounded_rectangle((cx - size*0.07, cross_y + size*0.055, cx + size*0.07, cross_y + size*0.09), radius=size*0.012, fill=color)
    flame = [
        (cx, cy - size*0.49), (cx + size*0.075, cy - size*0.39),
        (cx + size*0.045, cy - size*0.29), (cx, cy - size*0.34),
        (cx - size*0.045, cy - size*0.29), (cx - size*0.075, cy - size*0.39)
    ]
    draw.polygon(flame, fill=hex_to_rgba(light, 235))

    # Main heart with outline.
    pts = heart_points(cx, cy, scale)
    draw.polygon(pts, fill=hex_to_rgba(color, 255))
    for width, alpha in [(size//38, 90), (size//58, 150)]:
        draw.line(pts + [pts[0]], fill=hex_to_rgba(light, alpha), width=max(2, width), joint='curve')

    # Inner dark negative-space heart for modern flat mark.
    inner_pts = heart_points(cx, cy + size*0.006, scale * 0.58)
    inner_fill = '#0B0F19' if not monochrome else '#000000'
    draw.polygon(inner_pts, fill=hex_to_rgba(inner_fill, 245))

    # Small center spark.
    if not monochrome:
        draw.ellipse((cx-size*0.025, cy-size*0.005, cx+size*0.025, cy+size*0.045), fill=CREAM)

    # Crown arc under heart.
    arc_bbox = (cx - size*0.24, cy + size*0.08, cx + size*0.24, cy + size*0.39)
    draw.arc(arc_bbox, 205, 335, fill=hex_to_rgba(dark, 215), width=max(4, size//65))

def make_icon(size=1024):
    img = draw_gradient_bg(size)
    overlay = Image.new('RGBA', (size, size), TRANSPARENT)
    d = ImageDraw.Draw(overlay)
    # Soft halo.
    halo = Image.new('RGBA', (size, size), TRANSPARENT)
    hd = ImageDraw.Draw(halo)
    hd.ellipse((size*0.20, size*0.18, size*0.80, size*0.82), fill=hex_to_rgba(GOLD, 45))
    halo = halo.filter(ImageFilter.GaussianBlur(size//18))
    img.alpha_composite(halo)
    # Framing ring.
    d.ellipse((size*0.12, size*0.12, size*0.88, size*0.88), outline=hex_to_rgba(GOLD, 120), width=size//42)
    d.ellipse((size*0.17, size*0.17, size*0.83, size*0.83), outline=hex_to_rgba(GOLD_2, 45), width=size//115)
    draw_sacred_mark(d, size)
    img.alpha_composite(overlay)
    return img

def make_foreground(size=1024, monochrome=False):
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    draw_sacred_mark(d, size, center_y_shift=-size*0.01, monochrome=monochrome)
    return img

def make_splash(size=1024):
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    # Compact mark for splash image; background is configured separately in app.json.
    draw_sacred_mark(d, size, center_y_shift=-size*0.04)
    return img

def save_all():
    assets = {
        'icon.png': make_icon(1024),
        'android-icon-background.png': Image.new('RGBA', (1024, 1024), NAVY),
        'android-icon-foreground.png': make_foreground(1024),
        'android-icon-monochrome.png': make_foreground(1024, monochrome=True),
        'splash-icon.png': make_splash(1024),
        'favicon.png': make_icon(512).resize((48, 48), Image.LANCZOS),
    }
    for name, img in assets.items():
        img.save(OUT / name)
        img.save(REPO_ASSETS / name)
    # Preview contact sheet.
    sheet = Image.new('RGBA', (1600, 900), NAVY)
    labels = ['icon.png', 'splash-icon.png', 'android-icon-foreground.png', 'android-icon-monochrome.png']
    sd = ImageDraw.Draw(sheet)
    x = 90
    for label in labels:
        thumb = assets[label].copy()
        if thumb.mode != 'RGBA':
            thumb = thumb.convert('RGBA')
        bg = Image.new('RGBA', (300, 300), '#111827')
        if label in {'splash-icon.png', 'android-icon-foreground.png', 'android-icon-monochrome.png'}:
            checker = Image.new('RGBA', (300, 300), '#0B0F19')
            bg = checker
        thumb.thumbnail((260, 260), Image.LANCZOS)
        bg.alpha_composite(thumb, ((300-thumb.width)//2, (300-thumb.height)//2))
        sheet.alpha_composite(bg, (x, 190))
        sd.text((x, 520), label, fill=CREAM)
        x += 370
    sd.text((90, 90), 'Sacred Heart App production asset preview', fill=CREAM)
    sheet.save(OUT / 'asset-preview.png')

if __name__ == '__main__':
    save_all()
