# Builds the harvest props (Blender 5.2, headless): the 4 tools in 3 qualities, the item models (also their icons) and the
# new world props (stumps, fallen branches, copper and iron deposits, loose and tilled soil, wild herbs).
# Usage: blender -b --factory-startup --python-exit-code 1 -P recolte.py -- <models dir> <icons dir> <previews dir>
#   <models dir>: StreamingAssets/assets/models (reads nature/, writes objets/ and the new props into nature/)
# Design: Second cerveau/1 - Projets/jeu-survie/decision-2026-11-02-recolte-outils-inventaire.md
# Conventions shared with the game (Runtime/Harvest): every tool has its grip at the origin, the handle along +Z (glTF +Y)
# and its edge or point toward +X; props stand on the origin, up = +Z; materials named after the pack's ("Rocks",
# "Bark_NormalTree") get the pack's normal maps in the game.
import bpy, bmesh, math, os, random, shutil, sys
import numpy as np
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

MODELS, ICONS, PREVIEWS = [os.path.abspath(p) for p in sys.argv[sys.argv.index("--") + 1:][:3]]
NATURE, OBJETS = os.path.join(MODELS, "nature"), os.path.join(MODELS, "objets")
STAGE = os.path.join(PREVIEWS, "export")
for d in (OBJETS, ICONS, PREVIEWS, STAGE):
    os.makedirs(d, exist_ok=True)
random.seed(11)
TAU = 2 * math.pi

# --- Palette: warm painted tones of the nature pack, metals kept soft (no chrome)
WOOD, WOOD_DARK = (0.46, 0.29, 0.15), (0.27, 0.15, 0.07)
LEATHER, VINE = (0.20, 0.11, 0.06), (0.20, 0.26, 0.09)
FLINT, FLINT_DARK = (0.50, 0.46, 0.40), (0.24, 0.22, 0.20)
STONE, STONE_DARK = (0.56, 0.58, 0.62), (0.30, 0.31, 0.35)
COPPER, PATINA = (0.78, 0.40, 0.18), (0.27, 0.60, 0.48)
IRON, RUST = (0.33, 0.34, 0.37), (0.45, 0.22, 0.10)
SOIL, SOIL_DARK = (0.24, 0.15, 0.08), (0.12, 0.07, 0.04)
ROOT, STRAW, SAGE, MAUVE = (0.62, 0.40, 0.20), (0.56, 0.60, 0.24), (0.43, 0.58, 0.42), (0.58, 0.36, 0.78)
QUALITIES = {"Pierre": "Tete_Pierre", "Cuivre": "Tete_Cuivre", "Fer": "Tete_Fer"}


# ---------------------------------------------------------------------------------------------------------- textures

def _noise(shape, scale, octaves=4, seed=0):
    """Smooth value noise in [0, 1] (sum of upsampled random grids)."""
    h, w = shape
    out = np.zeros(shape, np.float32)
    amp, total = 1.0, 0.0
    rng = np.random.default_rng(seed)
    for o in range(octaves):
        n = max(2, int(scale * 2 ** o))
        grid = rng.random((n + 1, n + 1)).astype(np.float32)
        ys, xs = np.linspace(0, n, h, endpoint=False), np.linspace(0, n, w, endpoint=False)
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a, b = grid[y0][:, x0], grid[y0][:, x0 + 1]
        c, d = grid[y0 + 1][:, x0], grid[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        total += amp
        amp *= 0.5
    return out / total


def _mix(c0, c1, t):
    t = np.clip(t, 0, 1)[..., None]
    c0 = np.asarray(c0, np.float32)
    c1 = np.asarray(c1, np.float32)
    return c0 * (1 - t) + c1 * t


def _image(name, rgb):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(np.ascontiguousarray(rgba, np.float32).ravel())
    img.filepath_raw, img.file_format = os.path.join(STAGE, name + ".png"), "PNG"
    img.save()
    return img


def paint_textures():
    """Painted, low-frequency textures in the spirit of the nature pack (no photo detail)."""
    t = {}
    v, u = np.mgrid[0:512, 0:256].astype(np.float32)
    v, u = v / 512, u / 256
    grain = _noise((512, 256), 3, 3, 1) * 0.6 + 0.4 * (0.5 + 0.5 * np.sin(u * TAU * 7 + 3 * _noise((512, 256), 2, 2, 2)))
    t["Manche_Bois"] = _image("T_Recolte_Manche", _mix(WOOD_DARK, WOOD, 0.35 + 0.65 * grain))
    y, x = np.mgrid[0:256, 0:256].astype(np.float32) / 256 - 0.5
    r = np.hypot(x, y) * 2 + 0.06 * _noise((256, 256), 4, 2, 3)
    rings = 0.5 + 0.5 * np.cos(r * TAU * 7)
    cut = _mix((0.47, 0.31, 0.16), (0.70, 0.52, 0.31), 0.55 + 0.45 * (1 - r) - 0.25 * rings)
    cut = np.where((r > 0.93)[..., None], np.array(WOOD_DARK, np.float32), cut)  # bark rim
    t["Bois_Coupe"] = _image("T_Recolte_BoisCoupe", cut)
    n = _noise((128, 128), 6, 3, 4)
    t["Lien_Cuir"] = _image("T_Recolte_Cuir", _mix((0.13, 0.07, 0.04), LEATHER, n))
    t["Lien_Liane"] = _image("T_Recolte_Liane", _mix((0.12, 0.16, 0.05), VINE, n))
    n1, n2 = _noise((256, 256), 4, 4, 5), _noise((256, 256), 9, 2, 6)
    speckles = np.clip((_noise((256, 256), 40, 1, 16) - 0.8) * 8, 0, 1)
    flint = _mix(FLINT_DARK, FLINT, 0.2 + 0.8 * n1) * (0.9 + 0.2 * n2)[..., None]
    t["Tete_Pierre"] = _image("T_Recolte_Silex", _mix(flint, (0.78, 0.74, 0.66), speckles * 0.7))
    t["Pierre_Objet"] = _image("T_Recolte_Pierre", _mix(STONE_DARK, STONE, 0.25 + 0.75 * n1) * (0.88 + 0.24 * n2)[..., None])
    hammered = _noise((256, 256), 12, 2, 7)
    patina = np.clip((_noise((256, 256), 3, 3, 8) - 0.58) * 6, 0, 1)
    t["Tete_Cuivre"] = _image("T_Recolte_Cuivre", _mix(_mix((0.55, 0.26, 0.11), COPPER, hammered), PATINA, patina * 0.8))
    rust = np.clip((_noise((256, 256), 4, 3, 9) - 0.6) * 5, 0, 1)
    t["Tete_Fer"] = _image("T_Recolte_Fer", _mix(_mix((0.22, 0.23, 0.26), IRON, hammered), RUST, rust * 0.7))
    t["Minerai_Cuivre"] = _image("T_Recolte_MineraiCuivre", _mix(_mix((0.70, 0.36, 0.15), (0.95, 0.58, 0.28), n2), PATINA, patina))
    t["Minerai_Fer"] = _image("T_Recolte_MineraiFer", _mix(_mix((0.50, 0.20, 0.11), (0.78, 0.38, 0.20), n1), (0.55, 0.56, 0.60), np.clip((n2 - 0.5) * 4, 0, 1)))
    crumbs = _noise((512, 512), 24, 2, 10)
    soil = _mix(SOIL_DARK, SOIL, 0.25 + 0.75 * _noise((512, 512), 5, 4, 11)) * (0.85 + 0.3 * crumbs)[..., None]
    pebbles = np.clip((_noise((512, 512), 30, 1, 12) - 0.86) * 12, 0, 1)
    t["Terre"] = _image("T_Recolte_Terre", _mix(soil, (0.42, 0.36, 0.30), pebbles))
    t["Terre_Labouree"] = _image("T_Recolte_TerreLabouree", soil * 0.72)
    t["Racine"] = _image("T_Recolte_Racine", _mix((0.45, 0.27, 0.12), ROOT, 0.3 + 0.7 * _noise((256, 256), 3, 3, 13)))
    t["Fibres"] = _image("T_Recolte_Fibres", _mix((0.36, 0.42, 0.14), STRAW, 0.4 + 0.6 * (0.5 + 0.5 * np.sin(u[:256, :256] * TAU * 20))))
    t["Herbe_Sauge"] = _image("T_Recolte_Sauge", _mix((0.30, 0.43, 0.30), SAGE, 0.3 + 0.7 * _noise((128, 128), 3, 3, 14)))
    t["Fleur_Mauve"] = _image("T_Recolte_Mauve", _mix((0.42, 0.22, 0.62), MAUVE, 0.4 + 0.6 * _noise((64, 64), 3, 2, 15)))
    return t


SURFACE = {  # roughness / metallic seen in Blender (the game sets its own per material name in Core/RenderData/Surfaces.cs)
    "Tete_Cuivre": (0.38, 0.75), "Tete_Fer": (0.42, 0.8), "Minerai_Cuivre": (0.4, 0.6), "Minerai_Fer": (0.5, 0.45),
}


def material(name, image):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    rough, metal = SURFACE.get(name, (0.75, 0.0))
    bsdf.inputs["Roughness"].default_value, bsdf.inputs["Metallic"].default_value = rough, metal
    return m


def pack_image(file):
    return bpy.data.images.load(os.path.join(NATURE, file), check_existing=True)


# ---------------------------------------------------------------------------------------------------------- geometry

class Builder:
    """Accumulates lofted parts into one mesh object, each face carrying a material slot and UVs."""

    def __init__(self, name):
        self.name, self.bm = name, bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.slots = []

    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def loft(self, sections, mat, u_tiles=1.0, v_scale=1.0, caps=(True, True), cap_mat=None):
        """sections: closed rings of points (same count). Quads between rings, optional caps (cap_mat for end grain)."""
        s, cs = self.slot(mat), self.slot(cap_mat or mat)
        rings = [[self.bm.verts.new(p) for p in r] for r in sections]
        n = len(sections[0])
        length = [0.0]
        for i in range(1, len(sections)):
            c0 = sum((Vector(p) for p in sections[i - 1]), Vector()) / n
            c1 = sum((Vector(p) for p in sections[i]), Vector()) / n
            length.append(length[-1] + (c1 - c0).length)
        for i in range(len(rings) - 1):
            for k in range(n):
                k1 = (k + 1) % n
                f = self.bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]))
                f.material_index, f.smooth = s, True
                for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                    loop[self.uv].uv = (kk / n * u_tiles, length[ii] * v_scale)
        for end, r in ((0, rings[0]), (1, rings[-1])):
            if not caps[end]:
                continue
            f = self.bm.faces.new(r if end else list(reversed(r)))
            f.material_index, f.smooth = cs, True
            c = sum((v.co for v in r), Vector()) / len(r)
            radius = max((v.co - c).length for v in r) or 1
            axis = (r[0].co - c).normalized()
            other = (r[len(r) // 4].co - c).normalized()
            for loop in f.loops:
                d = loop.vert.co - c
                loop[self.uv].uv = (0.5 + 0.5 * d.dot(axis) / radius, 0.5 + 0.5 * d.dot(other) / radius)
        return rings

    def blob(self, centre, radii, mat, detail=2, jitter=0.0, seed=0, uv_scale=1.0, basis=None):
        """Deformed ico-sphere (stones, nuggets, leaves), UVs from a box projection. basis: optional 3x3 orientation."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=detail, radius=1.0)
        s = self.slot(mat)
        mapping = {}
        for v in tmp.verts:
            d = v.co.normalized()
            j = 1 + jitter * noise.noise(d * 2.3 + Vector((seed, seed * 1.7, 0)))
            p = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * j
            mapping[v] = self.bm.verts.new(Vector(centre) + (basis @ p if basis is not None else p))
        for f in tmp.faces:
            nf = self.bm.faces.new([mapping[v] for v in f.verts])
            nf.material_index, nf.smooth = s, True
            nrm = sum((v.co for v in f.verts), Vector()).normalized()
            axis = max(range(3), key=lambda a: abs(nrm[a]))
            a, b = [i for i in range(3) if i != axis]
            for loop in nf.loops:
                p = loop.vert.co
                loop[self.uv].uv = (p[a] * uv_scale, p[b] * uv_scale)
        tmp.free()

    def finish(self, smooth_angle=50):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        o = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(o)
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        return o


def frame(tangent, up_hint=Vector((0, 0, 1))):
    t = Vector(tangent).normalized()
    side = Vector(up_hint).cross(t)
    if side.length < 1e-4:
        side = Vector((0, 1, 0)).cross(t)
    side.normalize()
    return t, side, t.cross(side).normalized()


def ring(centre, tangent, a, b, n=10, power=2.0, up_hint=Vector((0, 0, 1)), wobble=0.0, seed=0.0):
    """Super-ellipse section: half-size `a` along the side axis, `b` along the up axis (power 2 = ellipse, <2 = lens)."""
    _, side, up = frame(tangent, up_hint)
    pts = []
    for k in range(n):
        ang = TAU * k / n
        c, s = math.cos(ang), math.sin(ang)
        x = math.copysign(abs(c) ** (2 / power), c) * a
        y = math.copysign(abs(s) ** (2 / power), s) * b
        w = 1 + wobble * noise.noise(Vector((c * 1.7 + seed, s * 1.7, seed * 0.3)))
        pts.append(Vector(centre) + side * (x * w) + up * (y * w))
    return pts


def tube(b, path, radius, mat, n=10, wobble=0.0, seed=0.0, caps=(True, True), cap_mat=None, u_tiles=1.0, v_scale=1.0):
    """Round tube along a polyline, radius(t) for t in [0, 1]."""
    sections = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1)
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        hint = Vector((0, 1, 0)) if abs(tan.normalized().z) > 0.9 else Vector((0, 0, 1))
        r = radius(t)
        sections.append(ring(p, tan, r, r, n, 2.0, hint, wobble, seed + t * 3))
    return b.loft(sections, mat, u_tiles, v_scale, caps, cap_mat)


def curve(points, steps=12):
    """Catmull-Rom through control points."""
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for s in range(steps):
            t = s / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def lerp(a, b, t):
    return a + (b - a) * max(0.0, min(1.0, t))


# ---------------------------------------------------------------------------------------------------------- tools

def handle(b, mats, bottom, top, r0, r1, bend=0.012):
    path = [(bend * math.sin(math.pi * i / 16), 0, bottom + (top - bottom) * i / 16) for i in range(17)]
    tube(b, path, lambda t: r0 * 1.25 if t < 0.04 else r0 + (r1 - r0) * t, mats["Manche_Bois"], n=10, v_scale=1.6)


def bands(b, mats, zs, radius, mat="Lien_Cuir", height=0.016):
    for z in zs:
        tube(b, [(0, 0, z - height / 2), (0, 0, z + height / 2)], lambda t: radius, mats[mat], n=12)


def grip(b, mats, r):
    bands(b, mats, [0.018 * i for i in range(-3, 4)], r * 1.12, "Lien_Cuir", 0.017)


def head_sections(xs, w, h, zc, power=1.6, stone=False, seed=0.0):
    """Blade-like loft along +X at height zc(x): thickness w(x) across Y, height h(x) across Z (knapped facets if stone)."""
    return [ring((x, 0, zc(x)), (1, 0, 0), w(x), h(x), 8 if stone else 10, power, wobble=0.22 if stone else 0.0, seed=seed + x * 23) for x in xs]


def make_axe(quality, mats):
    b = Builder(f"Outil_Hache_{quality}")
    stone, head_z = quality == "Pierre", 0.52
    handle(b, mats, -0.11, 0.60, 0.017, 0.015)
    head = mats[QUALITIES[quality]]
    if stone:
        xs = [-0.04 + 0.19 * i / 16 for i in range(17)]
        s = lambda x: (x + 0.04) / 0.19  # knapped teardrop: thick at the poll, rounded thin edge
        b.loft(head_sections(xs, lambda x: 0.026 * math.sin(math.pi * min(0.97, 0.12 + 0.88 * s(x))) ** 0.6 * lerp(1.0, 0.25, s(x)) + 0.002,
                             lambda x: 0.075 * math.sin(math.pi * min(0.97, 0.06 + 0.94 * s(x) ** 0.8)) ** 0.7 + 0.004,
                             lambda x: head_z - 0.01 * s(x), 1.7, True, 1.0), head, v_scale=3)
        bands(b, mats, [head_z - 0.055, head_z - 0.035, head_z + 0.045], 0.020, "Lien_Liane", 0.014)
    else:
        xs = [-0.05 + 0.23 * i / 18 for i in range(19)]
        s = lambda x: max(0.0, (x - 0.025) / 0.15)
        h = lambda x: (0.045 if x < 0.025 else lerp(0.045, 0.125, s(x) ** 1.5)) * (1 - 0.6 * max(0.0, (x - 0.165) / 0.015) ** 2)
        b.loft(head_sections(xs, lambda x: 0.024 if x < 0.025 else lerp(0.022, 0.0025, s(x) ** 0.7), h,
                             lambda x: head_z - 0.03 * s(x) ** 1.6, 1.7), head, v_scale=3)
        grip(b, mats, 0.017)
    return b.finish()


def make_pickaxe(quality, mats):
    b = Builder(f"Outil_Pioche_{quality}")
    stone, head_z = quality == "Pierre", 0.62
    handle(b, mats, -0.11, 0.66, 0.017, 0.016)
    head = mats[QUALITIES[quality]]
    span = 0.20 if stone else 0.26
    xs = [-span * 0.85 + (span * 1.85) * i / 22 for i in range(23)]
    arch = lambda x: head_z - 0.07 * (abs(x) / span) ** 2
    if stone:
        taper = lambda x: 1 - min(1.0, abs(x) / span) ** 1.5
        b.loft(head_sections(xs, lambda x: 0.022 * taper(x) + 0.004, lambda x: 0.03 * taper(x) + 0.004, arch, 2.0, True, 2.0), head, v_scale=3)
        bands(b, mats, [head_z - 0.04, head_z + 0.035], 0.020, "Lien_Liane", 0.016)
    else:
        w = lambda x: (0.016 * (1 - min(1.0, x / span) ** 1.3) + 0.002) if x > 0 else (0.018 * (1 - (-x / span) ** 2) + 0.012 * (-x / span) ** 2)
        h = lambda x: 0.026 * (1 - min(1.0, abs(x) / span) ** 1.3) + 0.003
        b.loft(head_sections(xs, w, h, arch, 2.0), head, v_scale=3)
        grip(b, mats, 0.017)
    return b.finish()


def make_hoe(quality, mats):
    b = Builder(f"Outil_Houe_{quality}")
    stone, head_z = quality == "Pierre", 0.80
    handle(b, mats, -0.30, 0.84, 0.017, 0.016, bend=0.02)
    head = mats[QUALITIES[quality]]
    path = curve([(0.0, 0, head_z), (0.05, 0, head_z + 0.01), (0.09, 0, head_z - 0.06), (0.11, 0, head_z - 0.20)], 6)
    sections = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1)
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        width = lerp(0.024, 0.085 if stone else 0.095, (t - 0.2) / 0.45)  # across Y: the blade width
        thick = lerp(0.016, 0.006 if stone else 0.003, t)
        sections.append(ring(p, tan, width, thick, 10, 1.6, Vector((1, 0, 0)), 0.1 if stone else 0.0, 4.0))
    b.loft(sections, head, v_scale=3)
    bands(b, mats, [head_z - 0.04, head_z + 0.03] if stone else [head_z - 0.03], 0.02, "Lien_Liane" if stone else "Lien_Cuir", 0.016)
    if not stone:
        grip(b, mats, 0.017)
    return b.finish()


def make_sickle(quality, mats):
    b = Builder(f"Outil_Faucille_{quality}")
    stone = quality == "Pierre"
    handle(b, mats, -0.07, 0.12, 0.019, 0.017, bend=0.004)
    head = mats[QUALITIES[quality]]
    cx, cz, rad = 0.10, 0.13, 0.10
    path = [(cx + rad * math.cos(a), 0, cz + rad * math.sin(a) * 1.15) for a in np.linspace(math.pi, -0.55, 20)]
    sections = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1)
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        height = lerp(0.034, 0.004, t ** 1.6) * (1.2 if stone else 1.0)
        thick = lerp(0.006 if stone else 0.0035, 0.0015, t)
        inward = (Vector((cx, 0, cz)) - Vector(p)).normalized()
        sections.append(ring(Vector(p) - inward * height * 0.3, tan, thick, height, 10, 1.5, Vector((0, 1, 0)), 0.15 if stone else 0.0, 6.0))
    b.loft(sections, head, v_scale=3)
    bands(b, mats, [0.115, 0.13], 0.02, "Lien_Liane" if stone else "Lien_Cuir", 0.012)
    return b.finish()


def faceted(o, quality):
    """Knapped stone reads by its flat facets."""
    if quality == "Pierre":
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    return o


TOOLS = {"Hache": make_axe, "Pioche": make_pickaxe, "Houe": make_hoe, "Faucille": make_sickle}


# ---------------------------------------------------------------------------------------------------------- items

def make_log(mats, name="Objet_Buche", length=0.42, r=0.075):
    b = Builder(name)
    path = [(-length / 2 + length * i / 8, 0, r) for i in range(9)]
    tube(b, path, lambda t: r * (1 + 0.05 * math.sin(t * 9)), mats["Bark_NormalTree"], n=12, wobble=0.06,
         cap_mat=mats["Bois_Coupe"], v_scale=1.2)
    return b.finish(60)


def make_branch(mats, name, length, r0, seed):
    b = Builder(name)
    rng = random.Random(seed)
    main = curve([(0, 0, r0), (length * 0.35, rng.uniform(-0.08, 0.08), r0 * 1.4), (length * 0.7, rng.uniform(-0.1, 0.1), r0 * 1.1),
                  (length, rng.uniform(-0.12, 0.12), r0 * 0.6)], 6)
    tube(b, main, lambda t: lerp(r0, r0 * 0.3, t), mats["Bark_NormalTree"], n=8, wobble=0.08, seed=seed, cap_mat=mats["Bois_Coupe"], v_scale=2.0)
    for at, side in ((0.42, 1), (0.68, -1)):
        p = main[int(at * (len(main) - 1))]
        path = curve([p, p + Vector((length * 0.12, side * length * 0.18, 0.02)), p + Vector((length * 0.2, side * length * 0.3, 0.04))], 4)
        tube(b, path, lambda t, at=at: lerp(r0 * (1 - at) * 0.7, r0 * 0.15, t), mats["Bark_NormalTree"], n=6, seed=seed + at,
             v_scale=2.0, caps=(False, True))
    return b.finish(70)


def make_stone(mats, name, size, seed):
    b = Builder(name)
    b.blob((0, 0, size[2] * 0.8), size, mats["Pierre_Objet"], 2, 0.35, seed, 4)
    return b.finish(30)


def scatter_nuggets(b, target, mat, count, size, seed, up_bias=0.0):
    """Ore nuggets half sunk into the surface of `target`, on outward faces."""
    rng = random.Random(seed)
    me = target.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    verts = [target.matrix_world @ v.co for v in me.vertices]
    tree = BVHTree.FromPolygons(verts, [p.vertices for p in me.polygons])
    centre = sum(verts, Vector()) / len(verts)
    placed = 0
    for _ in range(count * 20):
        if placed >= count:
            break
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3 + up_bias, 1))).normalized()
        p, n = tree.ray_cast(centre + d * 10, -d)[:2]
        if p is None or n.z < -0.25:
            continue
        for k in range(rng.randint(2, 4)):
            off = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * size * 1.2
            s = size * rng.uniform(0.55, 1.15)
            b.blob(p + off - n * s * 0.35, (s, s * rng.uniform(0.7, 1.0), s * rng.uniform(0.6, 0.9)), mat, 1, 0.3, seed + placed * 7 + k, 6)
        placed += 1
    target.to_mesh_clear()


def join(*objs):
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=list(objs), selected_objects=list(objs)):
        bpy.ops.object.join()
    return objs[0]


def make_ore_item(mats, metal):
    stone = make_stone(mats, f"Objet_Minerai_{metal}", (0.09, 0.075, 0.06), 31 if metal == "Cuivre" else 37)
    b = Builder(f"_pepites_{metal}")
    scatter_nuggets(b, stone, mats[f"Minerai_{metal}"], 6, 0.018, 5)
    return join(stone, b.finish(60))


def make_fibres(mats):
    b = Builder("Objet_Fibres")
    rng = random.Random(3)
    for k in range(22):
        a, rr = rng.uniform(0, TAU), rng.uniform(0, 0.025)
        y0, z0 = math.cos(a) * rr, 0.03 + math.sin(a) * rr * 0.6
        sag = rng.uniform(-0.03, 0.03)
        path = curve([(-0.2, y0 * 1.6, z0 + sag), (0, y0 * 0.5, z0 * 0.8 + 0.01), (0.2, y0 * 1.8, z0 - sag)], 4)
        tube(b, path, lambda t: 0.0035 * (1 - abs(t - 0.5)) + 0.0008, mats["Fibres"], n=3, caps=(False, False))
    tube(b, [(-0.012, 0, 0.035), (0.012, 0, 0.035)], lambda t: 0.024, mats["Lien_Liane"], n=12)
    return b.finish(80)


def leaf(b, mat, base, direction, length, width, seed):
    """Flattened ellipsoid leaf from `base` along `direction`."""
    d = Vector(direction).normalized()
    _, side, up = frame(d)
    basis = Matrix((side, up, d)).transposed()
    b.blob(Vector(base) + d * length * 0.5, (width, width * 0.18, length * 0.5), mat, 1, 0.05, seed, 6, basis)


def herb_plant(b, mats, stems, height, seed, flowers=True):
    rng = random.Random(seed)
    for k in range(stems):
        a = TAU * k / stems + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.12, 0.3)
        top = Vector((math.cos(a) * lean * height, math.sin(a) * lean * height, height * rng.uniform(0.75, 1.0)))
        path = curve([(0, 0, 0), top * 0.5 + Vector((0, 0, 0.02)), top], 4)
        tube(b, path, lambda t: lerp(0.005, 0.002, t), mats["Herbe_Sauge"], n=4, caps=(False, False))
        for j in range(4):
            t = 0.25 + 0.18 * j
            p = Vector(path[int(t * (len(path) - 1))])
            side = rng.choice((-1, 1))
            out = Vector((math.cos(a + side * 1.2), math.sin(a + side * 1.2), 0.5)).normalized()
            leaf(b, mats["Herbe_Sauge"], p, out, height * 0.22 * (1.1 - t * 0.5), height * 0.07, seed + k * 10 + j)
        if flowers:
            for j in range(5):
                q = top + Vector((rng.uniform(-1, 1) * 0.01, rng.uniform(-1, 1) * 0.01, -j * height * 0.035))
                b.blob(q, (height * 0.022,) * 3, mats["Fleur_Mauve"], 1, 0.2, seed + j, 10)


def make_herbs_item(mats):
    b = Builder("Objet_Herbes")
    herb_plant(b, mats, 5, 0.26, 4)
    o = b.finish(70)
    o.rotation_euler = (0, math.radians(80), 0)  # a lying bouquet (applied at export)
    o.location.z = 0.04
    return o


def make_root(mats, name="Objet_Racine", scale=1.0, seed=8):
    b = Builder(name)
    rng = random.Random(seed)
    for k in range(3):
        a = TAU * k / 3 + rng.uniform(-0.4, 0.4)
        pts = [(0, 0, 0.04 * scale)]
        for j in range(1, 5):
            pts.append((math.cos(a) * 0.05 * j * scale + rng.uniform(-0.01, 0.01), math.sin(a) * 0.05 * j * scale + rng.uniform(-0.01, 0.01), (0.04 - 0.007 * j) * scale))
        tube(b, curve(pts, 4), lambda t: lerp(0.024, 0.004, t ** 0.8) * scale, mats["Racine"], n=8, wobble=0.15, seed=seed + k, caps=(True, False), v_scale=3)
    return b.finish(70)


# ---------------------------------------------------------------------------------------------------------- props

def make_stump(mats, name, bark):
    b = Builder(name)
    sections = []
    top_r, base_r, height = 0.26, 0.31, 0.42
    for i in range(10):
        t = i / 9
        z = -0.06 + (height + 0.06) * t
        flare = (1 - t) ** 3
        pts = []
        for k in range(16):
            a = TAU * k / 16
            r = lerp(base_r, top_r, t) * (1 + 0.35 * flare * max(0.0, math.cos(5 * a + 0.4)) ** 3) * (1 + 0.04 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, z * 4))))
            pts.append(Vector((math.cos(a) * r, math.sin(a) * r, z + 0.05 * math.cos(a) * t ** 6)))  # slanted felling cut
        sections.append(pts)
    b.loft(sections, bark, u_tiles=2, v_scale=1.5, caps=(False, True), cap_mat=mats["Bois_Coupe"])
    return b.finish(60)


def make_soil(mats, name, tilled):
    b = Builder(name)
    s = b.slot(mats["Terre_Labouree" if tilled else "Terre"])
    rings, radius, peak = 10, 0.65, 0.07 if tilled else 0.11
    verts = [[b.bm.verts.new((0, 0, peak))]]
    for i in range(1, rings + 1):
        r = radius * i / rings
        row = []
        for k in range(24):
            a = TAU * k / 24
            x, y = math.cos(a) * r, math.sin(a) * r
            h = peak * (1 - (r / radius) ** 2) ** 1.4
            if tilled:
                h += 0.035 * (0.5 + 0.5 * math.cos(y / 0.22 * TAU)) * (1 - (r / radius) ** 4)  # furrows
            h += 0.012 * noise.noise(Vector((x * 6, y * 6, 1.3))) * (1 - r / radius)
            row.append(b.bm.verts.new((x, y, h - 0.03 * (r / radius) ** 3)))
        verts.append(row)

    def add(face_verts):
        f = b.bm.faces.new(face_verts)
        f.material_index, f.smooth = s, True
        for loop in f.loops:
            loop[b.uv].uv = (loop.vert.co.x * 1.4 + 0.5, loop.vert.co.y * 1.4 + 0.5)

    for k in range(24):
        add((verts[0][0], verts[1][k], verts[1][(k + 1) % 24]))
    for i in range(1, rings):
        for k in range(24):
            k1 = (k + 1) % 24
            add((verts[i][k], verts[i + 1][k], verts[i + 1][k1], verts[i][k1]))
    if not tilled:
        rng = random.Random(5)
        for k in range(4):  # root tips poking out: what the hoe digs up
            a = TAU * k / 4 + rng.uniform(-0.4, 0.4)
            p0 = Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.06))
            path = curve([p0 - Vector((0, 0, 0.05)), p0 + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.03)), p0 + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.0))], 4)
            tube(b, path, lambda t: lerp(0.016, 0.004, t), mats["Racine"], n=6, caps=(False, True))
        herb_plant(b, mats, 3, 0.12, 9, flowers=False)  # a few sprouts
    return b.finish(70)


def make_deposit(mats, metal, k):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(NATURE, f"Rock_Medium_{k}.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    rock = [o for o in new if o.type == "MESH"][0]
    world = rock.matrix_world.copy()
    rock.parent = None
    rock.matrix_world = world
    for o in new:
        if o != rock:
            bpy.data.objects.remove(o)
    rock.name = rock.data.name = f"Gisement_{metal}_{k}"
    for slot in rock.material_slots:  # the importer's copy would be named "Rocks.001": the game keys normal maps by name
        slot.material = mats["Rocks"]
    b = Builder(f"_pepites_{metal}_{k}")
    scatter_nuggets(b, rock, mats[f"Minerai_{metal}"], 13, 0.21, 40 + k, up_bias=0.3)  # readable from 10 m away
    return join(rock, b.finish(60))


def make_wild_herb(mats):
    b = Builder("Herbe_Sauvage")
    herb_plant(b, mats, 8, 0.55, 12)
    return b.finish(70)


# ---------------------------------------------------------------------------------------------------------- export

def only(o):
    for x in bpy.context.scene.objects:
        x.select_set(x == o)
    bpy.context.view_layer.objects.active = o


def export(o, folder):
    only(o)
    path = os.path.join(STAGE, folder, o.name + ".gltf")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", export_texture_dir="", use_selection=True,
                              export_apply=True, export_animations=False, export_yup=True, export_image_format="AUTO",
                              export_cameras=False, export_lights=False, export_extras=False)


def publish(folder, target):
    """Copies the staged glTF of `folder` into `target`; the pack's own images are never overwritten."""
    src = os.path.join(STAGE, folder)
    for f in os.listdir(src):
        if f.lower().endswith(".png") and os.path.exists(os.path.join(NATURE, f)) and not f.startswith("T_Recolte_"):
            if target == NATURE:
                continue
        shutil.copyfile(os.path.join(src, f), os.path.join(target, f))
    if target != NATURE:
        for f in ("Bark_NormalTree_Normal.png", "Bark_DeadTree_Normal.png", "Rocks_Normal.png"):
            shutil.copyfile(os.path.join(NATURE, f), os.path.join(target, f))


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


# ---------------------------------------------------------------------------------------------------------- renders

def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.view_settings.view_transform = "AgX"
    sc.render.film_transparent = True
    w = bpy.data.worlds.new("Ciel"); sc.world = w
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.80, 0.82, 0.78, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    for name, energy, rot in (("Soleil", 3.0, (40, 10, -40)), ("Contre", 2.2, (65, 0, 150))):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        l.data.energy, l.rotation_euler = energy, [math.radians(a) for a in rot]
        l.data.angle = math.radians(10)
        sc.collection.objects.link(l)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.type = "ORTHO"
    sc.collection.objects.link(cam); sc.camera = cam
    return cam


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def shoot(cam, objs, path, size, view, margin=1.12):
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    for x in sc.objects:
        if x.type == "MESH":
            x.hide_render = x not in objs
    lo, hi = bounds(objs)
    centre, extent = (lo + hi) / 2, (hi - lo).length
    d = Vector(view).normalized()
    cam.location = centre + d * extent * 3
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = extent * margin
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {name: material(name, img) for name, img in paint_textures().items()}
    mats["Bark_NormalTree"] = material("Bark_NormalTree", pack_image("Bark_NormalTree.png"))
    mats["Bark_DeadTree"] = material("Bark_DeadTree", pack_image("Bark_DeadTree.png"))
    mats["Rocks"] = material("Rocks", pack_image("Rocks_Diffuse.png"))

    tools = [faceted(make(quality, mats), quality) for make in TOOLS.values() for quality in QUALITIES]
    items = [make_log(mats), make_branch(mats, "Objet_Branche", 0.62, 0.028, 2), make_stone(mats, "Objet_Pierre", (0.10, 0.08, 0.065), 17),
             make_ore_item(mats, "Cuivre"), make_ore_item(mats, "Fer"), make_fibres(mats), make_herbs_item(mats), make_root(mats)]
    props = [make_log(mats, "Tronc_Camp", 1.6, 0.21), # the camp bench the starter tools lie on (its top at 0.42 m)
             make_stump(mats, "Souche_Feuillu", mats["Bark_NormalTree"]), make_stump(mats, "Souche_Morte", mats["Bark_DeadTree"]),
             make_branch(mats, "Branche_Sol_1", 1.25, 0.045, 21), make_branch(mats, "Branche_Sol_2", 1.0, 0.038, 22),
             make_soil(mats, "Terre_Meuble", False), make_soil(mats, "Terre_Labouree", True), make_wild_herb(mats)]
    props += [make_deposit(mats, metal, k) for metal in ("Cuivre", "Fer") for k in (1, 2, 3)]

    flowers = []
    for k in (3, 4):  # the pack's single flowers, laid down, stand for the picked flowers (icon and object on the ground)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(NATURE, f"Flower_{k}_Single.gltf"))
        meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
        for o in [o for o in bpy.data.objects if o not in before and o.type != "MESH"]:
            for c in o.children:
                c.matrix_world = c.matrix_world.copy()
                c.parent = None
            bpy.data.objects.remove(o)
        flower = join(*meshes) if len(meshes) > 1 else meshes[0]
        flower.name = f"Objet_Fleur_{k}"
        flower.scale = (0.45, 0.45, 0.45)
        flower.rotation_euler = (0, math.radians(84), 0)  # lying on its side
        flower.location.z = 0.03
        flowers.append([flower])

    for o in tools + items + [f[0] for f in flowers]:
        export(o, "objets")
    for o in props:
        export(o, "nature")
    publish("objets", OBJETS)
    publish("nature", NATURE)
    for o in tools + items + props:
        print(f"RECOLTE TRIS {o.name}: {tris(o)}")

    cam = setup_render()
    for meshes in flowers:
        shoot(cam, meshes, os.path.join(ICONS, meshes[0].name + ".png"), (256, 256), (0.8, -1.2, 0.6))
    # Icons: square, transparent, the same light for every object; tools seen from the side, edge forward.
    for o in tools + items:
        view = (0.55, -1.0, 0.35) if o.name.startswith("Outil") else (0.8, -1.2, 1.0)
        shoot(cam, [o], os.path.join(ICONS, o.name + ".png"), (256, 256), view)
    # Review sheets (objects moved after the export, for the pictures only).
    for i, o in enumerate(tools):
        o.location.x += (i % 3) * 0.35 + (i // 3) * 1.15
    shoot(cam, tools, os.path.join(PREVIEWS, "planche-outils.png"), (1600, 700), (0.0, -1.0, 0.12), 1.02)
    for i, o in enumerate(items):
        o.location.x += i * 0.7
    shoot(cam, items, os.path.join(PREVIEWS, "planche-objets.png"), (1600, 500), (0.3, -1.0, 0.7), 1.02)
    for i, o in enumerate(props):
        o.location = Vector((((i % 5) - 2) * 3.2, (i // 5) * 3.4, 0))
    shoot(cam, props, os.path.join(PREVIEWS, "planche-decor.png"), (1600, 1000), (0.6, -1.0, 0.75), 1.0)
    print("RECOLTE done")


main()
