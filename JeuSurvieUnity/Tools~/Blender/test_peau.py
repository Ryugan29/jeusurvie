# Headless checks of the elf's baked skin, the images the game gets (Blender 5.2, numpy). Exit code 1 when a check fails.
# Usage: blender -b --factory-startup --python-exit-code 1 -P test_peau.py -- <original body texture> <elf export dir>
#   original body texture: Tools~/Sauvegardes/heroine-originale/T_Superhero_Female_Dark_BaseColor.png (her underwear is
#   painted on it, same UV layout as the elf); export dir: what build_elfe.py exported (sortie/export).
import os, sys

import bpy
import numpy as np

ORIGINAL, EXPORT = [os.path.abspath(a) for a in sys.argv[sys.argv.index("--") + 1:][:2]]
FAILS = []


def check(ok, message):
    print(("PASS " if ok else "FAIL ") + message, flush=True)
    if not ok:
        FAILS.append(message)


def load(path):
    """RGB as stored in the PNG (0..1), top row first."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[::-1, :, :3]


def body_map(kind):
    return load(os.path.join(EXPORT, f"T_Elfe_Corps_{kind}.png"))


def grow(mask, r):
    """Square dilation by r pixels (separable)."""
    for axis in (0, 1):
        out = mask.copy()
        for d in range(1, r + 1):
            out |= np.roll(mask, d, axis) | np.roll(mask, -d, axis)
        mask = out
    return mask


def shrink(mask, r):
    return ~grow(~mask, r)


def box_blur(a, r):
    """Mean over a (2r+1)² square (separable, edges wrap: only read away from them)."""
    for axis in (0, 1):
        a = sum(np.roll(a, d, axis) for d in range(-r, r + 1)) / (2 * r + 1)
    return a


def lavender_skin(colour):
    """Pixels of plain lavender skin: blue > red > green (bark is red > green > blue, the painted veins green > blue)."""
    r, g, b = colour[..., 0], colour[..., 1], colour[..., 2]
    return (b > r) & (r > g) & (b > 0.3)


def plain_skin(colour):
    """Lavender skin away from the bark: its torn edges and the greying skin around it are drawn on purpose."""
    return shrink(lavender_skin(colour), 12)


def luma(colour):
    return colour @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def test_no_underwear_mark(colour):
    """Where the base model's bra and panties were painted, the elf's skin is the same as the skin around them."""
    original = load(ORIGINAL)
    hi, lo = original.max(2), original.min(2)
    underwear = ((hi - lo) / np.maximum(hi, 1e-4) < 0.2) & (hi < 0.4)  # dark grey: no skin is that unsaturated
    k = colour.shape[0] // original.shape[0]
    if k < 1 or colour.shape[:2] != (k * original.shape[0], k * original.shape[1]):
        check(False, f"body texture {colour.shape[:2]} is a whole multiple of the original {original.shape[:2]}")
        return
    underwear = np.kron(underwear, np.ones((k, k), bool))
    skin = plain_skin(colour)
    inside = shrink(underwear, 3) & skin
    around = grow(underwear, 14) & ~grow(underwear, 4) & skin
    check(inside.sum() > 5000 and around.sum() > 5000, f"underwear zones found ({inside.sum()} / {around.sum()} px)")
    marked = float((np.abs(luma(colour)[inside] - np.median(luma(colour)[around])) > 0.02).mean())
    check(marked < 0.05, f"no bra or panties mark: {marked:.0%} of the skin there differs from around it (< 5%)")


def test_veins_wide_enough():
    """Glowing lines at least 3 texels wide wherever they show (else thinner than a screen pixel in the game: they twinkle)."""
    glow = body_map("Emission").max(2)
    lines = glow > 0.25
    opened = grow(shrink(lines, 1), 1)  # what a 3x3 square fits in
    thin = float((lines & ~opened).sum()) / max(int(lines.sum()), 1)
    check(lines.sum() > 2000, f"the veins still glow ({int(lines.sum())} px)")
    check(thin < 0.3, f"veins wide enough: {thin:.0%} of the glowing texels in lines under 3 texels (< 30%)")


def test_no_skin_grain(colour):
    """Plain skin has no fine relief (a 3 mm grain is smaller than a screen pixel in the game: it sparkles)."""
    normal = body_map("Normal")[..., :2]
    skin = plain_skin(colour)
    fine = normal - box_blur(normal, 3)
    grain = float(np.sqrt((fine[skin] ** 2).mean()))
    check(grain < 0.004, f"no fine grain in the skin relief (rms {grain:.4f} < 0.004)")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    colour = body_map("BaseColor")
    test_no_underwear_mark(colour)
    test_veins_wide_enough()
    test_no_skin_grain(colour)
    print(f"TEST_PEAU {'OK' if not FAILS else 'FAILED: ' + '; '.join(FAILS)}", flush=True)
    if FAILS:
        sys.exit(1)


main()
