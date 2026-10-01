"""Build a compact tile-face atlas from consented sample photographs.

Usage: python scripts/build_vision_atlas.py photo1.jpg photo2.jpg photo3.jpg
The original photographs are never copied into dist/.
"""

from pathlib import Path
import sys
from PIL import Image

LABELS = [
    ["west", "east", "9s", "3m", "north", "1s", "red", "2s", "8m", "9p", "2p", "1s", "6p"],
    ["7s", "9s", "5s", "3s", "8m", "8p", "8m", "white", "2p", "3m", "2m", "6s", "6p"],
    ["1m", "green", "south", "north", "west", "8m", "9s", "north", "3m", "4p", "red", "6p", "1m"],
]
CENTERS = [
    [84, 166, 268, 358, 440, 528, 620, 706, 774, 850, 932, 1012, 1092],
    [187, 273, 367, 437, 517, 587, 675, 781, 837, 893, 987, 1065, 1143],
    [155, 237, 325, 419, 493, 571, 639, 735, 795, 869, 961, 1019, 1099],
]
BANDS = [(436, 544), (476, 574), (386, 494)]
PITCHES = [1116 / 13, 1067 / 13, 1026 / 13]
CELL = (68, 96)

if len(sys.argv) != 4:
    raise SystemExit(__doc__)

atlas = Image.new("RGB", (CELL[0] * 13, CELL[1] * 3), "white")
for row, path in enumerate(sys.argv[1:]):
    image = Image.open(path).convert("RGB")
    if image.size != (1280, 960):
        raise SystemExit(f"Expected a 1280x960 sample, got {image.size}: {path}")
    top, bottom = BANDS[row]
    pitch = PITCHES[row]
    for column, center in enumerate(CENTERS[row]):
        face = image.crop((round(center - pitch * .41), top,
                           round(center - pitch * .41) + round(pitch * .82), bottom))
        face = face.resize(CELL, Image.Resampling.BILINEAR)
        atlas.paste(face, (column * CELL[0], row * CELL[1]))

destination = Path("dist/assets/vision-tiles-atlas.webp")
atlas.save(destination, "WEBP", quality=88, method=6)
print(f"{destination}: {destination.stat().st_size} bytes; {sum(map(len, LABELS))} tile samples")
