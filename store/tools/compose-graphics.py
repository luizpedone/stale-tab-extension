"""Composes the Chrome Web Store graphics from real captures.

Inputs (produced by capture-screenshots.mjs):
  raw/screenshot-1-settings.png   1280x800  native
  raw/screenshot-2-sleeping-tab.png 1280x800 native
  raw/screenshot-3-popup.png      300x154   native (real action popup)
  raw/logo-512.png                512x512   transparent

Outputs:
  store/screenshots/*.png  1280x800
  store/promo/*.png        440x280 and 1400x560
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "store" / "raw"
SHOTS = ROOT / "store" / "screenshots"
PROMO = ROOT / "store" / "promo"

INK = (17, 24, 39)
MUTED = (148, 163, 184)
LIGHT = (241, 245, 249)


def font(size: int, weight: str = "regular"):
    """San Francisco at the requested weight, with a safe fallback."""
    sf = "/System/Library/Fonts/SFNS.ttf"
    try:
        f = ImageFont.truetype(sf, size)
        f.set_variation_by_name(weight)
        return f
    except Exception:
        fallback = "Arial Bold.ttf" if weight.lower() == "bold" else "Arial.ttf"
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{fallback}", size)


def vertical_gradient(size, top, bottom):
    w, h = size
    grad = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        grad.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return grad.resize((w, h), Image.BILINEAR)


def rounded_shadow(card, radius=14, blur=34, offset=(0, 18), opacity=70):
    """Returns (shadow_layer, card_with_rounded_corners)."""
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, card.size[0] - 1, card.size[1] - 1], radius, fill=255)

    shadow = Image.new("RGBA", (card.size[0] + blur * 4, card.size[1] + blur * 4), (0, 0, 0, 0))
    silhouette = Image.new("RGBA", card.size, (15, 23, 42, opacity))
    shadow.paste(silhouette, (blur * 2 + offset[0], blur * 2 + offset[1]), mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))

    card_rgba = card.convert("RGBA")
    card_rgba.putalpha(mask)
    return shadow, card_rgba


def popup_screenshot():
    """The 300x154 popup, doubled, sitting on a soft backdrop."""
    popup = Image.open(RAW / "screenshot-3-popup.png").convert("RGB")
    scale = 2
    card = popup.resize((popup.width * scale, popup.height * scale), Image.LANCZOS)

    canvas = vertical_gradient((1280, 800), (252, 253, 255), (234, 239, 246)).convert("RGBA")

    # faint brand glow so the white card does not float on flat grey
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([340, 120, 940, 720], fill=(17, 24, 39, 10))
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(120)))

    shadow, card_rgba = rounded_shadow(card, radius=14 * scale // 2, blur=30, offset=(0, 16), opacity=58)
    x = (canvas.width - card.width) // 2
    y = (canvas.height - card.height) // 2 - 24
    canvas.alpha_composite(shadow, (x - shadow.width // 2 + card.width // 2, y - shadow.height // 2 + card.height // 2))
    canvas.alpha_composite(card_rgba, (x, y))
    return canvas.convert("RGB")


def icon_plate(logo, size, radius=None):
    """The icon on a faint ring, so its dark plate does not vanish into the backdrop."""
    logo = logo.resize((size, size), Image.LANCZOS)
    plate = Image.new("RGBA", (size + 8, size + 8), (0, 0, 0, 0))
    plate.paste(logo, (4, 4), logo)
    d = ImageDraw.Draw(plate)
    r = radius if radius is not None else int(size * 0.22)
    d.rounded_rectangle([4, 4, 4 + size - 1, 4 + size - 1], r, outline=(255, 255, 255, 26), width=1)
    return plate


def small_tile():
    w, h = 440, 280
    canvas = vertical_gradient((w, h), (23, 32, 51), (15, 20, 33)).convert("RGBA")
    logo = icon_plate(Image.open(RAW / "logo-512.png").convert("RGBA"), 84)

    title, tagline = font(28, "bold"), font(15)
    lines = ["Free the memory", "your idle tabs hold"]
    tag = "Idle tabs unloaded, one click back"

    column = int(max([logo.width] + [title.getlength(t) for t in lines] + [tagline.getlength(tag)]))
    block_h = logo.height + 20 + len(lines) * 30 + 10 + 20
    x0, y = (w - column) // 2, (h - block_h) // 2

    canvas.alpha_composite(logo, (x0 + (column - logo.width) // 2, y))
    y += logo.height + 20

    d = ImageDraw.Draw(canvas)
    for line in lines:
        d.text((x0 + (column - title.getlength(line)) // 2, y), line, font=title, fill=(248, 250, 252))
        y += 30
    d.text((x0 + (column - tagline.getlength(tag)) // 2, y + 10), tag, font=tagline, fill=MUTED)
    return canvas.convert("RGB")


def marquee():
    w, h = 1400, 560
    canvas = vertical_gradient((w, h), (23, 32, 51), (15, 20, 33)).convert("RGBA")
    logo = icon_plate(Image.open(RAW / "logo-512.png").convert("RGBA"), 168)

    d = ImageDraw.Draw(canvas)
    title_f, body_f, pill_f = font(54, "bold"), font(23), font(16, "bold")
    title, body = "Stale Tab Curtain", [
        "Idle background tabs are unloaded, not covered.",
        "Their memory comes back the moment you need it.",
    ]
    label = "Reactivate in one click"
    pill_w, pill_h = 214, 46

    text_w = int(max([title_f.getlength(title)] + [body_f.getlength(b) for b in body] + [pill_w]))
    gap = 54
    block_w = logo.width + gap + text_w
    block_h = max(logo.height, 54 + 78 + 34 + pill_h)

    x, y = (w - block_w) // 2, (h - block_h) // 2
    canvas.alpha_composite(logo, (x, y + (block_h - logo.height) // 2))

    tx, ty = x + logo.width + gap, y
    d.text((tx, ty), title, font=title_f, fill=(248, 250, 252))
    d.text((tx, ty + 78), body[0], font=body_f, fill=MUTED)
    d.text((tx, ty + 112), body[1], font=body_f, fill=MUTED)
    d.rounded_rectangle([tx, ty + 162, tx + pill_w, ty + 162 + pill_h], pill_h // 2, fill=(248, 250, 252))
    d.text((tx + (pill_w - pill_f.getlength(label)) // 2, ty + 162 + 15), label, font=pill_f, fill=INK)
    return canvas.convert("RGB")


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    PROMO.mkdir(parents=True, exist_ok=True)

    Image.open(RAW / "screenshot-1-settings.png").convert("RGB").save(SHOTS / "screenshot-1-settings.png")
    Image.open(RAW / "screenshot-2-sleeping-tab.png").convert("RGB").save(SHOTS / "screenshot-2-sleeping-tab.png")
    popup_screenshot().save(SHOTS / "screenshot-3-popup.png")
    small_tile().save(PROMO / "promo-440x280.png")
    marquee().save(PROMO / "promo-1400x560.png")

    for p in sorted(list(SHOTS.glob("*.png")) + list(PROMO.glob("*.png"))):
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}  {im.width}x{im.height}")


if __name__ == "__main__":
    main()
