"""Hides the emulator's test-pattern camera picture in the scan screenshots.

The emulator's virtual camera draws coloured blocks. For the manual the picture
is replaced by a plain dark background; the app's own frame, hint and panels
stay exactly as they were. Run once after retaking the scan screenshots:

    python docs/manual/mask-camera.py
"""
import os
from PIL import Image

shots = os.path.join(os.path.dirname(__file__), 'shots')
DARK = (26, 31, 28)


def mask(name, bottom_pct):
    path = os.path.join(shots, name + '.png')
    raw = path.replace('.png', '.raw.png')
    if not os.path.exists(raw):
        os.replace(path, raw)  # keep the original
    im = Image.open(raw).convert('RGB')
    w, h = im.size
    out = im.copy()
    px, src = out.load(), im.load()
    top, bottom = int(h * 0.088), int(h * bottom_pct)  # between the header and the bottom panel
    tip = (int(w * 0.055), int(h * 0.612), int(w * 0.945), int(h * 0.657))
    for y in range(top, bottom):
        for x in range(w):
            r, g, b = src[x, y]
            frame = r > 190 and 110 < g < 200 and b < 110  # the orange dashed frame
            grey = max(r, g, b) - min(r, g, b) < 45  # the white hint pill and its text, not the coloured test pattern
            in_tip = tip[0] <= x <= tip[2] and tip[1] <= y <= tip[3] and grey
            if not (frame or in_tip):
                px[x, y] = DARK
    out.save(path)


mask('43-scan', 0.905)
mask('43b-scan-unknown', 0.83)
print('camera pictures hidden')
