"""Annotation engine: red numbered callouts on screenshot crops + blue card-move pictures."""
import os
from PIL import Image, ImageDraw, ImageFont

RED = (229, 50, 45)       # #e5322d  callouts, badges, MUST tags
BLUE = (31, 92, 230)      # #1f5ce6  card moves
SLOT = (236, 242, 255)    # #ecf2ff  destination slot fill
WHITE = (255, 255, 255)
FONT_PATHS = {
    'bold': ['/usr/share/fonts/opentype/inter/Inter-Bold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
    'xbold': ['/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf', '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
}


def _font(size, xbold=False):
    for p in FONT_PATHS['xbold' if xbold else 'bold']:
        if os.path.exists(p):
            return ImageFont.truetype(p, int(size))
    return ImageFont.load_default()


def _badge(d, x, y, n, r):
    d.ellipse((x - r, y - r, x + r, y + r), fill=RED, outline=WHITE, width=max(2, r // 7))
    f = _font(r * 1.25)
    t = str(n)
    bb = d.textbbox((0, 0), t, font=f)
    d.text((x - (bb[2] - bb[0]) / 2 - bb[0], y - (bb[3] - bb[1]) / 2 - bb[1]), t, font=f, fill=WHITE)


def crop_annotate(src, crop, boxes, out, scale=2.0, tags=(), quality=90, k=1.0):
    """Crop a screenshot, upscale it, draw red boxes with numbered badges and red pointer tags.
    crop:  (x0, y0, x1, y1) in source px.
    boxes: (x0, y0, x1, y1, n[, critical]) in source px; n = step number (None = box only); critical = double stroke.
    tags:  dict(text='LEAVE UNTICKED', at=(x, y) source px the tag points to, side='left'|'right'|'above'|'below', size=1.0)
    k:     annotation size multiplier for high-res / zoomed captures (~1.45 for 1568-px zoomed captures).
    Returns the output (width, height) for sizes.json."""
    im = Image.open(src).convert('RGB').crop(crop)
    cx0, cy0 = crop[0], crop[1]
    W, H = im.size
    im = im.resize((round(W * scale), round(H * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    s = scale
    stroke = max(3, round(2.2 * s * k))
    r = max(15, round(12 * s * k))
    T = lambda x, y: ((x - cx0) * s, (y - cy0) * s)
    for b in boxes:
        x0, y0, x1, y1, n = b[:5]
        crit = len(b) > 5 and b[5]
        x0 = max(x0, crop[0] + 2); y0 = max(y0, crop[1] + 2)
        x1 = min(x1, crop[2] - 2); y1 = min(y1, crop[3] - 2)
        (a, b_), (c, e) = T(x0, y0), T(x1, y1)
        d.rounded_rectangle((a, b_, c, e), radius=round(4 * s * k), outline=RED, width=stroke * (2 if crit else 1))
        if n is not None:
            _badge(d, max(r + 2, a - r * 0.55), max(r + 2, b_ - r * 0.55), n, r)
    for t in tags:
        size = t.get('size', 1.0) * k
        f = _font(15 * s * size, xbold=True)
        text = t['text']
        bb = d.textbbox((0, 0), text, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        padx, pady = 9 * s * size, 7 * s * size
        ax, ay = T(*t['at'])
        side = t.get('side', 'left')
        gap, head = 14 * s * size, 10 * s * size
        if side == 'left':
            px1 = ax - gap - head; px0 = px1 - tw - 2 * padx
            py0 = ay - th / 2 - pady; py1 = ay + th / 2 + pady
            tri = [(px1 - 1, ay - head), (px1 - 1, ay + head), (ax - gap * 0.35, ay)]
        elif side == 'right':
            px0 = ax + gap + head; px1 = px0 + tw + 2 * padx
            py0 = ay - th / 2 - pady; py1 = ay + th / 2 + pady
            tri = [(px0 + 1, ay - head), (px0 + 1, ay + head), (ax + gap * 0.35, ay)]
        elif side == 'below':
            py0 = ay + gap + head; py1 = py0 + th + 2 * pady
            px0 = ax - tw / 2 - padx; px1 = ax + tw / 2 + padx
            tri = [(ax - head, py0 + 1), (ax + head, py0 + 1), (ax, ay + gap * 0.35)]
        else:  # above
            py1 = ay - gap - head; py0 = py1 - th - 2 * pady
            px0 = ax - tw / 2 - padx; px1 = ax + tw / 2 + padx
            tri = [(ax - head, py1 - 1), (ax + head, py1 - 1), (ax, ay - gap * 0.35)]
        d.rounded_rectangle((px0, py0, px1, py1), radius=round(6 * s * size), fill=RED, outline=WHITE,
                            width=max(2, round(1.5 * s)))
        d.polygon(tri, fill=RED)
        d.text((px0 + padx - bb[0], py0 + pady - bb[1]), text, font=f, fill=WHITE)
    im.save(out, quality=quality, optimize=True)
    return im.size


def board_move(src, g, from_col, to_col, out, label, mode='move', card_row=0, scale=3.0, quality=92, pad=10,
               clip_x1=None, k=1.0):
    """Card-move picture in the owner's format: card boxed in blue, light-blue slot in the destination column,
    thick blue elbow arrow (down, across, up into the slot), blue label pill.
    g: board geometry in source px: x0 = left edge of the first column, pitch = column spacing, w = column width,
       hy0 = top of the column headers, cy0/cy1 = top/bottom of the first card.
    mode: 'move' (card in from_col -> slot in to_col) | 'appear' (card in from_col, label under it, small up-arrow)
          | 'slot' (like appear, but the column is empty in the capture: draw the slot where the card will land).
    clip_x1: right edge of the visible board when the destination column is cut off. k: line/label multiplier."""
    im = Image.open(src).convert('RGB')
    lo, hi = min(from_col, to_col), max(from_col, to_col)
    x0 = g['x0'] + g['pitch'] * lo - pad
    x1 = g['x0'] + g['pitch'] * hi + g['w'] + pad
    if clip_x1 is not None:
        x1 = min(x1, clip_x1)
    card_h_src = g['cy1'] - g['cy0']
    y0 = g['hy0'] - pad
    y1 = g['cy1'] + card_h_src * card_row + pad
    crop = im.crop((x0, y0, x1, y1))
    S = scale
    crop = crop.resize((round(crop.width * S), round(crop.height * S)), Image.LANCZOS)
    ch = card_h_src * S
    ext = round(ch * (0.95 + 0.6 * (k - 1)))
    canvas = Image.new('RGB', (crop.width, crop.height + ext), crop.getpixel((4, crop.height - 3)))
    canvas.paste(crop, (0, 0))
    d = ImageDraw.Draw(canvas)
    cx = lambda col: ((g['x0'] + g['pitch'] * col - x0) * S, (g['x0'] + g['pitch'] * col + g['w'] - x0) * S)
    cy0 = (g['cy0'] + card_h_src * card_row - y0) * S
    cy1 = (g['cy1'] + card_h_src * card_row - y0) * S
    p = 2 * S
    box_w = max(4, round(ch * 0.045 * k))
    line_w = max(8, round(ch * 0.075 * k))
    rad = round(ch * 0.08)
    fx0, fx1 = cx(from_col)
    d.rounded_rectangle((fx0 - p, cy0 - p, fx1 + p, cy1 + p), radius=rad, fill=SLOT if mode == 'slot' else None,
                        outline=BLUE, width=box_w)
    f = _font(ch * 0.15 * k)
    bb = d.textbbox((0, 0), label, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    lh, lw = th + ch * 0.13 * k, tw + ch * 0.26 * k
    if mode == 'move':
        tx0, tx1 = cx(to_col)
        d.rounded_rectangle((tx0 - p, cy0 - p, tx1 + p, cy1 + p), radius=rad, fill=SLOT, outline=BLUE, width=box_w)
        sx = (fx0 + fx1) / 2
        dx = (tx0 + min(tx1, canvas.width - p)) / 2
        ybot = cy1 + p + box_w / 2
        yh = cy1 + ch * 0.36 * k
        head = ch * 0.13 * k
        d.line([(sx, ybot), (sx, yh)], fill=BLUE, width=line_w)
        d.line([(sx - line_w / 2, yh), (dx + line_w / 2, yh)], fill=BLUE, width=line_w)
        tip = ybot + 2
        d.line([(dx, yh + line_w / 2), (dx, tip + head * 0.9)], fill=BLUE, width=line_w)
        d.polygon([(dx - head, tip + head * 1.15), (dx + head, tip + head * 1.15), (dx, tip)], fill=BLUE)
        ly0 = yh + line_w / 2 + ch * 0.1 * k
        mid = (sx + dx) / 2
    else:
        ly0 = cy1 + p + ch * 0.16 * k
        mid = (fx0 + fx1) / 2
        head = ch * 0.1 * k
        d.polygon([(mid - head, ly0 - 2), (mid + head, ly0 - 2), (mid, cy1 + p + box_w)], fill=BLUE)
    lx0 = max(6, min(canvas.width - lw - 6, mid - lw / 2))
    d.rounded_rectangle((lx0, ly0, lx0 + lw, ly0 + lh), radius=round(lh * 0.22), fill=BLUE)
    d.text((lx0 + (lw - tw) / 2 - bb[0], ly0 + (lh - th) / 2 - bb[1]), label, font=f, fill=WHITE)
    canvas = canvas.crop((0, 0, canvas.width, min(canvas.height, round(ly0 + lh + ch * 0.12 * k))))
    canvas.save(out, quality=quality, optimize=True)
    return canvas.size


def grid(src, out, step=50):
    """Overlay a labelled pixel grid on a screenshot so crop/box coordinates can be read off it by eye."""
    im = Image.open(src).convert('RGB')
    d = ImageDraw.Draw(im)
    f = _font(11)
    for x in range(0, im.width, step):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 255) if x % (step * 2) == 0 else (0, 200, 255), width=1)
        d.text((x + 2, 2), str(x), font=f, fill=(255, 0, 255))
    for y in range(0, im.height, step):
        d.line([(0, y), (im.width, y)], fill=(255, 0, 255) if y % (step * 2) == 0 else (0, 200, 255), width=1)
        d.text((2, y + 2), str(y), font=f, fill=(255, 0, 255))
    im.save(out, quality=85)
