"""Makes the small, cropped JPEGs the manual uses from the full-size screenshots.

    python scripts/prepare-manual-images.py

Reads docs/manual/shots/*.png, applies docs/manual/crops.json (percent of the
height to keep, from the top), writes docs/manual/web/*.jpg at 720 px wide.
"""
import json
import os
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..', 'docs', 'manual')
crops = json.load(open(os.path.join(root, 'crops.json'), encoding='utf8'))
os.makedirs(os.path.join(root, 'web'), exist_ok=True)
for name in sorted(os.listdir(os.path.join(root, 'shots'))):
    if not name.endswith('.png'):
        continue
    key = name[:-4]
    im = Image.open(os.path.join(root, 'shots', name)).convert('RGB')
    w, h = im.size
    keep = crops.get(key, 100)
    im = im.crop((0, 0, w, int(h * keep / 100))).resize((720, int(h * keep / 100 * 720 / w)), Image.LANCZOS)
    im.save(os.path.join(root, 'web', key + '.jpg'), quality=84, optimize=True)
print('images ready')
