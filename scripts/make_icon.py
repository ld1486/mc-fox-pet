"""Build the app icon from the real three.js render (sitting pose, no UI).

Produced by the app itself with a transparent background:
  node scripts/launch.js --shot=.inspect/icon_sit.png --pet-query=ui=none&state=sit
"""
import os

import numpy as np
from PIL import Image, ImageDraw

BASE = r"C:\Users\39348\Documents\deepseek-harness\default-workspace\mc-fox-pet"
SRC = os.path.join(BASE, ".inspect", "icon_sit.png")
SIZE = 1024

fox = Image.open(SRC).convert("RGBA")
arr = np.array(fox)
# drop the soft ground shadow (low alpha); keep the fox itself
arr[..., 3] = np.where(arr[..., 3] > 150, 255, 0)
fox = Image.fromarray(arr)
fox = fox.crop(fox.getbbox())

side = max(fox.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(fox, ((side - fox.width) // 2, (side - fox.height) // 2))

canvas = Image.new("RGBA", (SIZE, SIZE), (250, 243, 232, 255))
disc = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(disc)
d.ellipse((24, 24, SIZE - 24, SIZE - 24), fill=(255, 250, 242, 255))
d.ellipse((24, 24, SIZE - 24, SIZE - 24), outline=(232, 130, 58, 255), width=12)
canvas.alpha_composite(disc)

target = int(SIZE * 0.80)
pet = square.resize((target, target), Image.LANCZOS)
canvas.alpha_composite(pet, ((SIZE - target) // 2, (SIZE - target) // 2))

out_dir = os.path.join(BASE, "build")
os.makedirs(out_dir, exist_ok=True)
canvas.save(os.path.join(out_dir, "icon.png"))
canvas.save(
    os.path.join(out_dir, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("wrote build/icon.png + build/icon.ico")
