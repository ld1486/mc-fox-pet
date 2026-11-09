"""Build the cub atlas: a chibi re-proportioning of the adult fox texture.

The cub keeps the vanilla pivots (so every pose keeps working) but re-sizes the
boxes: bigger head, shorter body, shorter legs, chunkier tail.  Each face of the
adult atlas is copied, nearest-neighbour resized, into the matching face slot of
the new 64x32 cub atlas.
"""
import os

from PIL import Image

BASE = r"C:\Users\39348\Documents\deepseek-harness\default-workspace\mc-fox-pet"
TEX = os.path.join(BASE, "assets", "textures")

# name: (uv, box) — box = [x, y, z, w, h, d]
ADULT = {
    "head": ((1, 5), (8, 6, 6)),
    "right_ear": ((8, 1), (2, 2, 1)),
    "left_ear": ((15, 1), (2, 2, 1)),
    "nose": ((6, 18), (4, 2, 3)),
    "body": ((24, 15), (6, 11, 6)),
    "tail": ((30, 0), (4, 9, 5)),
    "legR": ((13, 24), (2, 6, 2)),
    "legL": ((4, 24), (2, 6, 2)),
}

# Cub boxes: same pivots, cuter proportions.
PUP = {
    "head": ((0, 0), (10, 8, 8)),
    "body": ((36, 0), (7, 8, 7)),
    "tail": ((0, 16), (5, 8, 6)),
    "legR": ((22, 16), (3, 5, 3)),
    "legL": ((34, 16), (3, 5, 3)),
    "nose": ((46, 16), (5, 2, 3)),
    "right_ear": ((46, 22), (3, 3, 1)),
    "left_ear": ((54, 22), (3, 3, 1)),
}

FACES = ("north", "south", "west", "east", "up", "down")


def face_rects(u, v, w, h, d):
    return {
        "north": (u + d, v + d, w, h),
        "south": (u + d + w + d, v + d, w, h),
        "west": (u, v + d, d, h),
        "east": (u + d + w, v + d, d, h),
        "up": (u + d, v, w, d),
        "down": (u + d + w, v, w, d),
    }


def build(src_name, dst_name):
    src = Image.open(os.path.join(TEX, src_name)).convert("RGBA")
    out = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    for part, ((pu, pv), (pw, ph, pd)) in PUP.items():
        au, av = ADULT[part][0]
        aw, ah, ad = ADULT[part][1]
        src_faces = face_rects(au, av, aw, ah, ad)
        dst_faces = face_rects(pu, pv, pw, ph, pd)
        for face in FACES:
            sx, sy, sw, sh = src_faces[face]
            dx, dy, dw, dh = dst_faces[face]
            piece = src.crop((sx, sy, sx + sw, sy + sh)).resize((dw, dh), Image.NEAREST)
            out.alpha_composite(piece, (dx, dy))
    out.save(os.path.join(TEX, dst_name))
    print("wrote", dst_name)


build("fox.png", "cub_red.png")
build("fox_sleep.png", "cub_red_sleep.png")
build("fox_snow.png", "cub_snow.png")
build("fox_snow_sleep.png", "cub_snow_sleep.png")
