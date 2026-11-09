"""Fetch vanilla Minecraft item icons for the fox's mouth items.

blockrender.dev renders the inventory sprite; asking for a 512 px canvas gives a
clean 32x nearest-neighbour upscale of the original 16x16 icon, so downscaling
back to 16x16 recovers the real pixel art (alpha included).
"""
import io
import os
import urllib.request

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "items")
ITEMS = [
    "emerald",
    "chicken",
    "cooked_chicken",
    "rabbit",
    "rabbit_foot",
    "egg",
    "wheat",
]
URL = "https://blockrender.dev/render/item/{}.png?size=512"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for item in ITEMS:
        req = urllib.request.Request(URL.format(item), headers={"User-Agent": "mc-fox-pet/1.0"})
        with urllib.request.urlopen(req, timeout=40) as res:
            raw = res.read()
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
        icon = img.resize((16, 16), Image.BOX)
        icon.save(os.path.join(OUT, item + ".png"))
        print(f"{item:14s} {img.width}x{img.height} -> 16x16")


if __name__ == "__main__":
    main()
