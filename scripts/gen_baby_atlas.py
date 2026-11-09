"""Generate 48x32 "pup" atlases from the adult fox atlases.

The supplied 32x32 baby textures are a hand-painted chibi layout that does not
match the 48x32 box unwrap of the vanilla fox model, so they cannot be projected
onto the 3D model as-is.  Instead we derive pup variants that keep the same art
language (palette, muzzle, ear tips) but use the canonical unwrap:

  * a freshly painted face: big round eyes, cream muzzle, soft forehead
  * wan inner ears and a gentle warm lift on the fur
  * matching closed-eye sleep atlases

Outputs:
  assets/textures/baby_red.png       baby_red_sleep.png
  assets/textures/baby_snow.png      baby_snow_sleep.png
"""
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(BASE, "assets", "textures")

# face front rect inside the head unwrap (texOffs 1,5, box 8x6x6)
FACE_X, FACE_Y = 7, 11


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def tint(c, other, amount):
    return tuple(int(round(c[i] * (1 - amount) + other[i] * amount)) for i in range(3))


def palette(im):
    colors = [c[:3] for c in im.getdata() if c[3] > 200]
    dark = min(colors, key=lum)
    light = max(colors, key=lum)
    common = max(set(colors), key=colors.count)
    # main fur: most common mid-bright orange
    fur = max(colors, key=lambda c: colors.count(c) * (1.0 if 90 < lum(c) < 210 else 0.0))
    return dark, light, common, fur


def patch(im, dark, light, fur, snow):
    px = im.load()

    def put(x, y, color):
        if 0 <= x < im.width and 0 <= y < im.height:
            px[x, y] = (*color, 255)

    warm = tint(light, (255, 205, 160), 0.3)

    # --- fur: gentle warm lift, keep outlines and pupils crisp
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] == 0:
                continue
            r, g, b = c[:3]
            if lum((r, g, b)) < 40:
                continue
            px[x, y] = (*tint((r, g, b), warm, 0.08), c[3])

    # --- ears: wan inner membrane
    for x, y in ((9, 2), (10, 2), (9, 3), (10, 3), (16, 2), (17, 2), (16, 3), (17, 3)):
        c = px[x, y]
        if c[3]:
            put(x, y, tint(c[:3], warm, 0.4))

    # --- face: repaint clean
    base = fur
    cheek = tint(base, warm, 0.22)
    cream = tint(light, warm, 0.1)
    for y in range(6):
        for x in range(8):
            put(FACE_X + x, FACE_Y + y, base)
    for x in (2, 3, 4, 5):
        put(FACE_X + x, FACE_Y, tint(base, light, 0.18))
    for x in (1, 2, 5, 6):
        put(FACE_X + x, FACE_Y + 1, cheek)

    # eyes: 2x2, wide set, glint on the top inner pixel
    for cx in (1, 5):
        for dx in (0, 1):
            put(FACE_X + cx + dx, FACE_Y + 2, dark)
            put(FACE_X + cx + dx, FACE_Y + 3, dark)
        put(FACE_X + cx + 1, FACE_Y + 2, light)

    # muzzle + chin
    for x in (2, 3, 4, 5):
        put(FACE_X + x, FACE_Y + 4, cream)
    for x in (1, 2, 3, 4, 5, 6):
        put(FACE_X + x, FACE_Y + 5, cream)
    put(FACE_X + 3, FACE_Y + 4, tint(dark, cream, 0.25))
    put(FACE_X + 4, FACE_Y + 4, tint(dark, cream, 0.25))

    # keep the eye spill off the neighbouring side faces
    for y in (13, 14, 15, 16):
        for x in (FACE_X - 1, FACE_X - 2, FACE_X + 8, FACE_X + 9):
            if px[x, y][3]:
                put(x, y, tint(px[x, y][:3], base, 0.5))
    return im


def sleep_version(im, dark):
    out = im.copy()
    px = out.load()
    for cx in (1, 5):
        for dx in (0, 1):
            px[FACE_X + cx + dx, FACE_Y + 2] = (*dark, 255)
            px[FACE_X + cx + dx, FACE_Y + 3] = (*tint(dark, (255, 255, 255), 0.7), 255)
    return out


def main():
    for src_name, out_name in (("fox.png", "baby_red.png"), ("fox_snow.png", "baby_snow.png")):
        src = Image.open(os.path.join(TEX, src_name)).convert("RGBA")
        dark, light, common, fur = palette(src)
        baby = patch(src.copy(), dark, light, fur, "snow" in src_name)
        baby.save(os.path.join(TEX, out_name))
        sleep_version(baby, dark).save(os.path.join(TEX, out_name.replace(".png", "_sleep.png")))
        print("wrote", out_name, "(+ sleep)")


if __name__ == "__main__":
    main()
