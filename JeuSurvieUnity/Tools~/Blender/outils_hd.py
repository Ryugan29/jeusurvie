# Builds the 12 harvest tools in high definition (Blender 5.2, headless): axe, pickaxe, hoe and sickle in stone, copper and
# iron. Shaped hafts (straightened branches), knapped flint or forged heads, real leather lashings and sinew cord, and ONE
# texture set per tool (2048 px colour and relief, 1024 px roughness/metal; occlusion and worn edges painted in) baked from
# CC0 scanned materials (Poly Haven, in Tools~/Sources/polyhaven) and procedural detail, in the painted "stylised high
# definition" style José chose on 2026-11-03 (Second cerveau/1 - Projets/jeu-survie/
# decision-2026-11-03-animations-filmees-et-outils-hd.md). Replaces the tools of recolte.py (same names, sizes and grips).
# Usage: blender -b --factory-startup --python-exit-code 1 -P outils_hd.py -- <polyhaven dir> <models dir> <icons dir>
#        <out dir> [Hache_Pierre,Pioche_Fer,... | tout] [rapide]
#   <models dir>: StreamingAssets/assets/models (writes objets/Outil_*.gltf + textures); <icons dir>: Resources/UI/Icones;
#   <out dir>: work folder (bakes, glTF staging, review sheets). The optional list rebuilds only those tools; "rapide"
#   bakes small and writes nothing into the game (review sheet and icons go to <out dir>/previews).
# Conventions shared with the game (as recolte.py): grip at the origin, handle along +Z (glTF +Y), edge toward +X.
import bpy, bmesh, glob, math, os, shutil, sys
from mathutils import Vector, noise

ARGS = sys.argv[sys.argv.index("--") + 1:]
POLYHAVEN, MODELS, ICONS, OUT = [os.path.abspath(a) for a in ARGS[:4]]
ONLY = set(ARGS[4].split(",")) if len(ARGS) > 4 and ARGS[4] != "tout" else None
QUICK = len(ARGS) > 5 and ARGS[5] == "rapide"  # small bakes, nothing written to the game: to check shapes fast
OBJETS = os.path.join(MODELS, "objets")
STAGE, PREVIEWS = os.path.join(OUT, "export"), os.path.join(OUT, "previews")
for d in (OBJETS, ICONS, OUT, STAGE, PREVIEWS):
    os.makedirs(d, exist_ok=True)
TAU = math.pi * 2
SIZE, SMALL = (512, 256) if QUICK else (2048, 1024)  # colour and relief / roughness and metal


def lin(srgb):
    """Display colour (0-1 sRGB, as picked in a paint program) to the linear value shader nodes expect."""
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb) + (1.0,)


def clamp01(v):
    return max(0.0, min(1.0, v))


# Painted palette (sRGB), shared with the nature pack and the heroine (warm wood, soft stone, metals never chrome).
PAL = {
    "bois_sombre": (0.25, 0.14, 0.07), "bois": (0.50, 0.32, 0.17), "bois_clair": (0.74, 0.55, 0.34),
    "silex_sombre": (0.17, 0.15, 0.13), "silex": (0.38, 0.34, 0.30), "silex_clair": (0.66, 0.62, 0.55),
    "cortex": (0.80, 0.75, 0.64), "cuir_sombre": (0.15, 0.08, 0.04), "cuir": (0.38, 0.21, 0.10),
    "cuir_clair": (0.62, 0.40, 0.22), "corde_sombre": (0.38, 0.30, 0.18), "corde": (0.66, 0.56, 0.38),
    "cuivre_sombre": (0.42, 0.18, 0.07), "cuivre": (0.74, 0.38, 0.17), "cuivre_clair": (0.95, 0.64, 0.40),
    "vert_sombre": (0.16, 0.38, 0.30), "vert": (0.36, 0.64, 0.52),
    "fer_sombre": (0.14, 0.14, 0.16), "fer": (0.32, 0.33, 0.36), "fer_clair": (0.55, 0.56, 0.59), "fer_poli": (0.80, 0.81, 0.82),
    "rouille_sombre": (0.30, 0.13, 0.06), "rouille": (0.56, 0.28, 0.11), "creux": (0.10, 0.06, 0.04),
}


# ---------------------------------------------------------------------------------------------------------- geometry

class Builder:
    """One mesh, lofted parts, a material slot per part and metric UVs ("Detail": 1 unit = 1 m, the texture scale)."""

    def __init__(self, name):
        self.name, self.bm = name, bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("Detail")
        self.slots = []

    def slot(self, part):
        if part not in self.slots:
            self.slots.append(part)
        return self.slots.index(part)

    def loft(self, sections, part, u_len, caps=(True, True)):
        """Quads between closed rings (same point count); u runs around (u_len metres per turn), v along (metres)."""
        s = self.slot(part)
        rings = [[self.bm.verts.new(p) for p in r] for r in sections]
        n = len(sections[0])
        along = [0.0]
        for i in range(1, len(sections)):
            c0 = sum((Vector(p) for p in sections[i - 1]), Vector()) / n
            c1 = sum((Vector(p) for p in sections[i]), Vector()) / n
            along.append(along[-1] + (c1 - c0).length)
        for i in range(len(rings) - 1):
            for k in range(n):
                k1 = (k + 1) % n
                f = self.bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]))
                f.material_index, f.smooth = s, True
                for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                    loop[self.uv].uv = (kk / n * u_len, along[ii])
        for end, r in ((0, rings[0]), (1, rings[-1])):
            if caps[end]:
                f = self.bm.faces.new(r if end else list(reversed(r)))
                f.material_index, f.smooth = s, True
                c = sum((v.co for v in r), Vector()) / len(r)
                ax = (r[0].co - c).normalized()
                ay = ax.cross((r[len(r) // 4].co - c)).cross(ax).normalized()
                for loop in f.loops:
                    d = loop.vert.co - c
                    loop[self.uv].uv = (d.dot(ax) + 5 * end, d.dot(ay) + 5)  # caps away from the side's island
        return rings

    def finish(self):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        o = bpy.data.objects.new(self.name, me)
        o["parts"] = list(self.slots)  # material slot order
        bpy.context.scene.collection.objects.link(o)
        return o


def frame(tangent, hint):
    t = Vector(tangent).normalized()
    side = Vector(hint).cross(t)
    if side.length < 1e-5:
        side = Vector((1, 0, 0)).cross(t)
    side.normalize()
    return t, side, t.cross(side).normalized()


def curve(points, steps=8):
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


def lens(centre, u_axis, v_axis, a, b, n=24, pu=1.55, pv=1.9, wobble=None):
    """Closed section: half-size `a` along u (thickness), `b` along v (height); pu/pv < 2 lens-like, > 2 boxy."""
    pts = []
    for k in range(n):
        ang = TAU * k / n
        c, s = math.cos(ang), math.sin(ang)
        u = math.copysign(abs(c) ** (2 / pu), c) * a
        v = math.copysign(abs(s) ** (2 / pv), s) * b
        j = wobble(u, v) if wobble else 1.0
        pts.append(Vector(centre) + Vector(u_axis) * (u * j) + Vector(v_axis) * v)
    return pts


class Haft:
    """A straightened branch: slight S-bend, knob at the butt, optional swelling where a stone head is lashed, a knot."""

    def __init__(self, z0, z1, r, bend=0.007, swell=None, knot=None, knob=0.0045):
        self.z0, self.z1, self.r, self.bend, self.swell, self.knot, self.knob = z0, z1, r, bend, swell, knot, knob

    def axis(self, z):
        s = (z - self.z0) / (self.z1 - self.z0)
        b = self.bend
        return Vector((b * math.sin(math.pi * s) - 0.43 * b * math.sin(TAU * s), 0.3 * b * math.sin(math.pi * s * 1.5), z))

    def radius(self, z):
        span = self.z1 - self.z0
        r = self.r - 0.0012 * clamp01((z - (self.z0 + 0.25 * span)) / (0.35 * span))
        r += self.knob * math.exp(-((z - self.z0 - 0.018) / 0.012) ** 2)
        if self.swell:
            lo, hi, amount = self.swell
            r += amount * clamp01((z - lo) / 0.06) * clamp01((hi - z) / 0.035)
        return r

    def build(self, b):
        zs = [self.z0 + 0.004 * i for i in range(6)]
        z = self.z0 + 0.024
        while z < self.z1 - 0.022:
            zs.append(z)
            z += 0.0105
        zs += [self.z1 - 0.022 + 0.0044 * i for i in range(6)]
        sections = []
        for z in zs:
            cap = 1.0
            if z < self.z0 + 0.012:
                cap = math.sqrt(max(0.05, 1 - ((self.z0 + 0.012 - z) / 0.013) ** 2))
            if z > self.z1 - 0.02:
                cap = math.sqrt(max(0.05, 1 - ((z - (self.z1 - 0.02)) / 0.021) ** 2))
            c, r = self.axis(z), self.radius(z)
            ring = []
            for k in range(20):
                a = TAU * k / 20
                wob = 1 + 0.035 * noise.noise(Vector((math.cos(a) * 1.3, math.sin(a) * 1.3, z * 9)))
                knot = 0.0
                if self.knot:
                    dz, da = z - self.knot[0], math.atan2(math.sin(a - self.knot[1]), math.cos(a - self.knot[1]))
                    knot = 0.0045 * math.exp(-(dz / 0.011) ** 2 - (da / 0.42) ** 2)
                rr = (r * wob + knot) * cap
                ring.append(c + Vector((math.cos(a) * rr, math.sin(a) * rr, 0)))
            sections.append(ring)
        b.loft(sections, "Bois", TAU * self.r)


class Tool:
    """What the material and the lashings need to know about a tool beyond its mesh."""

    def __init__(self, kind, quality, haft):
        self.name, self.kind, self.quality, self.haft = f"Outil_{kind}_{quality}", kind, quality, haft
        self.b = Builder(self.name)
        self.metal = {"Pierre": "Silex", "Cuivre": "Cuivre", "Fer": "Fer"}[quality]
        self.profile = None   # x -> (half-height, half-thickness, centre z) of a head crossing the haft along X
        self.keen = None      # ("x" | "absx" | "-z", lo, hi): the honed cutting edge of a metal head
        self.cortex = None    # ("x" | "-x" | "z", lo, hi): the chalky rind left on a flint head
        self.knot = haft.knot

    def surface_y(self, x, z, side):
        """Outer surface of haft ∪ head at (x, z) on the ±Y side (where crossed straps lie)."""
        ax, r = self.haft.axis(z), self.haft.radius(z)
        d = x - ax.x
        y_haft = math.sqrt(max(0.0, r * r - d * d)) if abs(d) < r else 0.0
        y_head = 0.0
        if self.profile:
            h, w, zc = self.profile(x)
            t = abs(z - zc) / h if h > 0 else 2
            y_head = w * max(0.0, 1 - t ** 1.9) ** (1 / 1.55) if t < 1 else 0.0
        return side * max(y_haft, y_head)


# --- lashings ---

def ribbon(b, path, normals, width, thick, part, lifts=None, overlap=0.0):
    """Flat strap along `path`, lying on surfaces of outward `normals`. With `overlap` (fraction of the width, on the +across
    side) that part of the strap rides `lifts[i]` higher: it lies on the previous turn of a wrap instead of cutting into it."""
    o = 0.5 - overlap
    profile = ((-0.5, 0, 0), (o - 0.12, 0, 0), (o, 0, 1), (0.5, 0, 1), (0.5, 1, 1), (o, 1, 1), (o - 0.12, 1, 0), (-0.5, 1, 0)) \
        if overlap > 0 else ((-0.5, 0, 0), (0.5, 0, 0), (0.5, 1, 0), (-0.5, 1, 0))
    sections = []
    for i, p in enumerate(path):
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        nrm = Vector(normals[i]).normalized()
        across = tan.cross(nrm).normalized()
        wi = width[i] if isinstance(width, list) else width
        lift = lifts[i] if lifts else 0.0
        sections.append([Vector(p) + nrm * (thick * v + lift * l) + across * (wi * u) for u, v, l in profile])
    w = max(width) if isinstance(width, list) else width
    b.loft(sections, part, 2 * w)


def wrap(t, z0, z1, turns, width, thick, phase=0.0, per_turn=18, part="Cuir"):
    """Strap wound around the haft from z0 to z1: each turn half on the wood, half riding on the turn before; ends tapered."""
    total = max(2, int(turns * per_turn))
    pitch = (z1 - z0) / turns
    path, normals, widths, lifts = [], [], [], []
    for i in range(total + 1):
        s = i / total
        a = phase + TAU * turns * s
        z = z0 + (z1 - z0) * s
        radial = Vector((math.cos(a), math.sin(a), 0))
        path.append(t.haft.axis(z) + radial * (t.haft.radius(z) + 0.0004))
        normals.append(radial)
        widths.append(width * (0.35 + 0.65 * min(1.0, s * turns * 2, (1 - s) * turns * 2)))
        lifts.append(thick * 1.05 * clamp01((s * turns - 0.85) / 0.15))  # the first turn lies on the wood
    ribbon(t.b, path, normals, widths, thick, part, lifts, max(0.0, (width - pitch) / width + 0.06))


def cross_strap(t, start, end, side, width, thick):
    """Strap laid diagonally over the head/haft junction on the ±Y face (the X of the lashing)."""
    path, normals = [], []
    for i in range(23):
        s = i / 22
        x, z = start[0] + (end[0] - start[0]) * s, start[1] + (end[1] - start[1]) * s
        path.append(Vector((x, t.surface_y(x, z, side) + side * (0.0006 + 0.0012 * math.sin(math.pi * s)), z)))
        normals.append(Vector((0, side, 0)))
    ribbon(t.b, path, normals, width, thick, "Cuir")


def tube(b, path, radius, part, n=8):
    sections = []
    for i, p in enumerate(path):
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        hint = (0, 1, 0) if abs(tan.normalized().z) > 0.9 else (0, 0, 1)
        _, side, up = frame(tan, hint)
        r = radius(i / (len(path) - 1))
        sections.append([Vector(p) + side * (math.cos(TAU * k / n) * r) + up * (math.sin(TAU * k / n) * r) for k in range(n)])
    b.loft(sections, part, TAU * radius(0.5))


def cord(t, z0, z1, turns, phase):
    """Sinew cord: tight turns around the haft, a knot and two short loose ends."""
    rc = 0.0019
    total = int(turns * 22)
    path = []
    for i in range(total + 1):
        s = i / total
        a = phase + TAU * turns * s
        z = z0 + (z1 - z0) * s
        path.append(t.haft.axis(z) + Vector((math.cos(a), math.sin(a), 0)) * (t.haft.radius(z) + rc * 0.85))
    tube(t.b, path, lambda s: rc, "Corde")
    a = phase + TAU * turns
    out = Vector((math.cos(a), math.sin(a), 0))
    knot_at = t.haft.axis(z1) + out * (t.haft.radius(z1) + rc * 1.6)
    side = out.cross(Vector((0, 0, 1)))
    loop = [knot_at + out * (0.0016 * math.sin(TAU * s)) + Vector((0, 0, 0.0028 * math.cos(TAU * s))) + side * (0.003 * s - 0.0015)
            for s in [i / 12 for i in range(13)]]
    tube(t.b, loop, lambda s: rc * 1.05, "Corde")
    for sgn, sway in ((1, 0.006), (-1, -0.004)):
        tail = [knot_at + out * (0.002 + 0.006 * s) + side * (sgn * 0.004 * s + sway * s * s) - Vector((0, 0, 0.032 * s ** 1.2))
                for s in [i / 10 for i in range(11)]]
        tube(t.b, tail, lambda s: rc * (1 - 0.45 * s), "Corde")


def socket(t, z0, z1, wall=0.0065, stretch=1.25, part=None):
    """The eye of a metal head: a forged sleeve around the haft (a little longer along X, the blade's direction)."""
    sections = []
    for i in range(10):
        z = z0 + (z1 - z0) * i / 9
        c, r = t.haft.axis(z), t.haft.radius(z) + wall * (1 + 0.18 * math.sin(math.pi * i / 9))
        sections.append([c + Vector((math.cos(TAU * k / 24) * r * stretch, math.sin(TAU * k / 24) * r, 0)) for k in range(24)])
    t.b.loft(sections, part or t.metal, TAU * 0.02)


def head_loft(t, xs, profile, n=28, pu=1.55, pv=1.9, edge_from=None, edge_bulge=0.0, part=None, flake=0.0):
    """Head along X: `profile(x)` → (half-height, half-thickness, centre z); a convex cutting edge past `edge_from`."""
    sections = []
    for i, x in enumerate(xs):
        h, w, zc = profile(x)
        edge = clamp01((x - edge_from) / (xs[-1] - edge_from)) if edge_from is not None else 0.0
        ring = []
        for k in range(n):
            a = TAU * k / n
            c, s = math.cos(a), math.sin(a)
            y = math.copysign(abs(c) ** (2 / pu), c) * w
            z = math.copysign(abs(s) ** (2 / pv), s) * h
            px = x + edge * edge_bulge * (1 - (z / h) ** 2) * math.copysign(1, x)
            px += edge * flake * noise.noise(Vector((z * 70, 3.1, i * 0.3)))
            jitter = 1 + (0.07 if part == "Silex" or t.metal == "Silex" else 0.012) * noise.noise(Vector((px * 30, z * 30, 7.0)))
            ring.append(Vector((px, y * jitter, zc + z)))
        sections.append(ring)
    t.b.loft(sections, part or t.metal, 0.30)


def stone_lashing(t, hz, below, above):
    """Leather wound above and below a stone head, an X over the junction on both faces, sinew cord under it."""
    wrap(t, hz + above[0], hz + above[1], 3.2, 0.0125, 0.0018, phase=0.4)
    wrap(t, hz + below[0], hz + below[1], 3.2, 0.0125, 0.0018, phase=2.2)
    if t.profile:
        for side in (1, -1):
            cross_strap(t, (-0.026, hz + below[0] + 0.015), (0.034, hz + above[1] - 0.008), side, 0.011, 0.0017)
            cross_strap(t, (0.034, hz + below[0] + 0.015), (-0.026, hz + above[1] - 0.008), side, 0.011, 0.0017 * 1.7)
    cord(t, hz + below[0] - 0.023, hz + below[0] - 0.007, 2.6, 1.0)


# --- the four tools ---

def make_axe(quality):
    hz = 0.52
    if quality == "Pierre":
        t = Tool("Hache", quality, Haft(-0.13, 0.648, 0.0165, swell=(0.40, 0.645, 0.0052), knot=(0.27, 2.1)))
        t.haft.build(t.b)

        def profile(x):
            s = (x + 0.052) / 0.22
            h = (0.021 + 0.060 * s ** 1.5) * (1 - 0.45 * clamp01((s - 0.97) / 0.03) ** 2)
            w = 0.026 * math.sin(math.pi * min(0.985, 0.10 + 0.95 * s)) ** 0.55 * (1 - 0.86 * s ** 2.2) + 0.0012
            w *= 1 - 0.55 * clamp01((-0.03 - x) / 0.022)
            return h, w, hz - 0.012 * s ** 1.5

        t.profile, t.cortex = profile, ("-x", 0.018, 0.040)
        head_loft(t, [-0.052 + 0.22 * (i / 34) ** 0.92 for i in range(35)], profile, edge_from=0.12, edge_bulge=0.011, flake=0.0022)
        stone_lashing(t, hz, (-0.083, -0.046), (0.045, 0.080))
        wrap(t, -0.095, 0.115, 11.0, 0.0225, 0.0016, per_turn=16)
        return t
    t = Tool("Hache", quality, Haft(-0.13, hz + 0.058, 0.0165, knot=(0.25, 4.0)))
    t.haft.build(t.b)
    hr = t.haft.radius(hz)
    socket(t, hz - 0.044, hz + 0.044)
    x0, x1 = hr * 0.8, 0.172

    def blade(x):
        s = (x - x0) / (x1 - x0)
        return (0.031 + 0.047 * s ** 1.7) * (1 - 0.35 * clamp01((s - 0.97) / 0.03) ** 2), 0.0105 * (1 - s) ** 0.85 + 0.0010, hz - 0.016 * s ** 1.5

    head_loft(t, [x0 + (x1 - x0) * (i / 30) ** 0.9 for i in range(31)], blade, n=24, pu=3.0, pv=3.0, edge_from=0.135, edge_bulge=0.010)
    head_loft(t, [-hr * 0.8 - 0.032 * i / 6 for i in range(7)], lambda x: (0.029, 0.0125, hz), n=24, pu=3.5, pv=3.5)  # poll
    t.keen = ("x", 0.150, 0.172)
    wrap(t, -0.095, 0.115, 11.0, 0.0225, 0.0016, per_turn=16)
    return t


def make_pickaxe(quality):
    hz = 0.62
    if quality == "Pierre":
        span = 0.20
        t = Tool("Pioche", quality, Haft(-0.13, 0.728, 0.0165, swell=(0.50, 0.725, 0.0052), knot=(0.31, 5.0)))
        t.haft.build(t.b)

        def profile(x):
            s = min(1.0, abs(x) / span)
            return 0.030 * (1 - s ** 1.6) + 0.0045, 0.024 * (1 - s ** 1.8) + 0.004, hz - 0.05 * s ** 2

        t.profile, t.cortex = profile, ("z", hz + 0.018, hz + 0.034)
        head_loft(t, [-span + 2 * span * i / 40 for i in range(41)], profile)
        stone_lashing(t, hz, (-0.080, -0.044), (0.044, 0.078))
        wrap(t, -0.095, 0.115, 11.0, 0.0225, 0.0016, per_turn=16)
        return t
    t = Tool("Pioche", quality, Haft(-0.13, hz + 0.052, 0.0165, knot=(0.22, 1.0)))
    t.haft.build(t.b)
    hr = t.haft.radius(hz)
    socket(t, hz - 0.038, hz + 0.038)
    pick_end, chisel_end = 0.26, 0.235

    def pick(x):  # tapers to a point, arched down
        s = clamp01((x - hr * 0.8) / (pick_end - hr * 0.8))
        return 0.018 * (1 - s ** 1.2) + 0.0018, 0.0135 * (1 - s ** 1.1) + 0.0016, hz - 0.075 * s ** 2

    def chisel(x):  # flattens into a wide chisel blade, arched down
        s = clamp01((-x - hr * 0.8) / (chisel_end - hr * 0.8))
        return 0.018 * (1 - 0.78 * s) + 0.0012, 0.0125 + 0.011 * s ** 2, hz - 0.065 * s ** 2

    head_loft(t, [hr * 0.8 + (pick_end - hr * 0.8) * i / 28 for i in range(29)], pick, n=20, pu=2.4, pv=2.4)
    head_loft(t, [-hr * 0.8 - (chisel_end - hr * 0.8) * i / 26 for i in range(27)], chisel, n=20, pu=3.0, pv=2.0)
    t.keen = ("absx", 0.20, 0.26)
    wrap(t, -0.095, 0.115, 11.0, 0.0225, 0.0016, per_turn=16)
    return t


def make_hoe(quality):
    hz = 0.80
    stone = quality == "Pierre"
    t = Tool("Houe", quality, Haft(-0.32, hz + 0.06, 0.0165, bend=0.011, swell=(0.71, hz + 0.055, 0.004) if stone else None,
                                    knot=(0.35, 1.2)))
    t.haft.build(t.b)
    hr = t.haft.radius(hz)
    path = curve([(hr * 0.4, 0, hz + 0.012), (0.045, 0, hz + 0.02), (0.085, 0, hz - 0.05), (0.102, 0, hz - 0.20)], 8)
    sections = []
    for i, p in enumerate(path):
        s = i / (len(path) - 1)
        tan = Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])
        _, side, up = frame(tan, (0, 1, 0))
        width = 0.02 + (0.068 if stone else 0.075) * clamp01((s - 0.12) / 0.45) ** 0.8 * (1 - 0.3 * clamp01((s - 0.92) / 0.08))
        thick = (0.011 - 0.0075 * s) if stone else (0.0085 * (1 - s) ** 3 + 0.0016)  # metal: a neck, then a thin blade
        jit = (lambda u, v, i=i: 1 + 0.08 * noise.noise(Vector((u * 40, v * 40, i * 0.4)))) if stone else None
        # `up` is Y (across the blade: its width), `side` lies in the XZ plane normal to the path (the blade's thickness)
        sections.append(lens(p, up, side, width, thick, 24, 3.0, 1.5 if stone else 2.6, jit))
    t.b.loft(sections, t.metal, 0.30)
    if stone:
        t.cortex = ("z", hz - 0.01, hz + 0.02)
        wrap(t, hz + 0.028, hz + 0.052, 2.4, 0.012, 0.0018, phase=0.8)
        wrap(t, hz - 0.048, hz - 0.022, 2.4, 0.012, 0.0018, phase=2.6)
        cord(t, hz - 0.072, hz - 0.056, 2.4, 0.3)
    else:
        socket(t, hz - 0.034, hz + 0.034, 0.0055, 1.15)
        t.keen = ("-z", -(hz - 0.165), -(hz - 0.20))
    wrap(t, -0.29, -0.11, 9.5, 0.0225, 0.0016, per_turn=16)
    return t


def make_sickle(quality):
    stone = quality == "Pierre"
    t = Tool("Faucille", quality, Haft(-0.085, 0.135, 0.0185, bend=0.003, knob=0.004))
    t.haft.build(t.b)
    cx, cz, rad = 0.10, 0.135, 0.10
    angles = [math.pi - (math.pi + 0.55) * i / 30 for i in range(31)]
    path = [Vector((0.0, 0, 0.105))] + [Vector((cx + rad * math.cos(a), 0, cz + rad * 1.15 * math.sin(a))) for a in angles]
    sections = []
    for i, p in enumerate(path):
        s = i / (len(path) - 1)
        tan = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        inward = Vector((cx - p.x, 0, cz - p.z))
        inward = inward.normalized() if inward.length > 1e-6 else Vector((1, 0, 0))
        inward = (inward - tan.normalized() * inward.dot(tan.normalized())).normalized()
        height = (0.044 if stone else 0.040) * (1 - 0.88 * s ** 1.5) + 0.002
        thick = (0.0065 if stone else 0.0035) * (1 - 0.6 * s) + 0.0008
        centre = p + inward * height * 0.15
        ring = []
        for k in range(20):
            a = TAU * k / 20
            c, sn = math.cos(a), math.sin(a)
            reach = height * 0.5 * c
            if c > 0 and not stone:  # the inner, cutting edge is serrated on the metal blade
                reach *= 1 - 0.07 * (1 if math.sin(s * 260) > 0 else 0) * clamp01((c - 0.85) / 0.15)
            taper = 1 - 0.82 * max(0.0, c)  # thin toward the cutting edge (inside of the curve), thick spine outside
            jitter = 1 + 0.06 * noise.noise(Vector((s * 40, c * 3, 2.0))) if stone else 1.0
            ring.append(centre + inward * reach * jitter + Vector((0, 1, 0)) * (thick * sn * taper))
        sections.append(ring)
    t.b.loft(sections, t.metal, 0.12)
    if stone:
        t.cortex = ("-x", -0.02, 0.01)
        wrap(t, 0.098, 0.128, 2.6, 0.012, 0.0017, phase=1.4)
        cord(t, 0.080, 0.094, 2.2, 0.5)
        wrap(t, -0.06, 0.07, 6.5, 0.0225, 0.0016, per_turn=16)
    else:
        socket(t, 0.104, 0.132, 0.0035, 1.0)
        wrap(t, -0.062, 0.095, 7.5, 0.0225, 0.0016, per_turn=16)
    return t


BUILDERS = {"Hache": make_axe, "Pioche": make_pickaxe, "Houe": make_hoe, "Faucille": make_sickle}
QUALITIES = ("Pierre", "Cuivre", "Fer")


# ---------------------------------------------------------------------------------------------------------- materials

def find_maps(asset):
    """The 2k maps of a Poly Haven asset: colour, normal (GL), roughness, occlusion."""
    folder = os.path.join(POLYHAVEN, asset)

    def one(*suffixes):
        for s in suffixes:
            hits = glob.glob(os.path.join(folder, f"*_{s}_2k.jpg"))
            if hits:
                return hits[0]
        return None

    maps = {"col": one("diff", "albedo", "col"), "nor": one("nor_gl"), "rough": one("rough"), "ao": one("ao")}
    missing = [k for k, v in maps.items() if v is None]
    if missing:
        raise FileNotFoundError(f"{asset}: cartes manquantes {missing} dans {folder}")
    return maps


class N:
    """Small helper to wire shader nodes."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nodes, self.links = self.nt.nodes, self.nt.links

    def put(self, val, sock):
        if isinstance(val, (int, float)):
            sock.default_value = val
        elif isinstance(val, tuple):
            sock.default_value = val[:len(sock.default_value)]
        else:
            self.links.new(val, sock)

    def node(self, kind, **props):
        n = self.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def uv(self, name="Detail"):
        return self.node("ShaderNodeUVMap", uv_map=name).outputs["UV"]

    def obj(self):
        return self.node("ShaderNodeTexCoord").outputs["Object"]

    def scale(self, vec, s):
        m = self.node("ShaderNodeMapping")
        self.put(vec, m.inputs["Vector"])
        m.inputs["Scale"].default_value = s if isinstance(s, tuple) else (s, s, s)
        return m.outputs["Vector"]

    def image(self, path, vec, colour=True):
        img = bpy.data.images.load(path, check_existing=True)
        if not colour:
            img.colorspace_settings.name = "Non-Color"
        t = self.node("ShaderNodeTexImage", image=img)
        self.put(vec, t.inputs["Vector"])
        return t.outputs["Color"]

    def math(self, op, a, b=0.0, c=0.0):
        n = self.node("ShaderNodeMath", operation=op)
        for s, v in zip(n.inputs, (a, b, c)):
            self.put(v, s)
        return n.outputs[0]

    def mix(self, a, b, fac, blend="MIX"):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        self.put(fac, n.inputs["Factor"]); self.put(a, n.inputs[6]); self.put(b, n.inputs[7])
        return n.outputs[2]

    def mixf(self, a, b, fac):
        n = self.node("ShaderNodeMix", data_type="FLOAT", clamp_factor=True)
        self.put(fac, n.inputs["Factor"]); self.put(a, n.inputs[2]); self.put(b, n.inputs[3])
        return n.outputs[0]

    def bw(self, col):
        n = self.node("ShaderNodeRGBToBW"); self.put(col, n.inputs[0])
        return n.outputs[0]

    def remap(self, v, lo, hi, to_lo=0.0, to_hi=1.0, smooth=False):
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR")
        self.put(v, n.inputs["Value"])
        for name, val in (("From Min", lo), ("From Max", hi), ("To Min", to_lo), ("To Max", to_hi)):
            n.inputs[name].default_value = val
        return n.outputs["Result"]

    def ramp(self, fac, stops):
        r = self.node("ShaderNodeValToRGB")
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0][0], lin(stops[0][1])
        els[1].position, els[1].color = stops[-1][0], lin(stops[-1][1])
        for pos, col in stops[1:-1]:
            e = els.new(pos); e.color = lin(col)
        self.put(fac, r.inputs["Fac"])
        return r.outputs["Color"]

    def noise(self, vec, scale, detail=3.0, rough=0.5):
        n = self.node("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value, n.inputs["Detail"].default_value, n.inputs["Roughness"].default_value = scale, detail, rough
        self.put(vec, n.inputs["Vector"])
        return n.outputs["Fac"]

    def voronoi(self, vec, scale, feature="F1", out="Distance", rand=1.0):
        n = self.node("ShaderNodeTexVoronoi", feature=feature)
        n.inputs["Scale"].default_value, n.inputs["Randomness"].default_value = scale, rand
        self.put(vec, n.inputs["Vector"])
        return n.outputs[out]

    def scars(self, vec):
        """Voronoi F1/F2 ratio: 0 in the middle of a cell, 1 on the crest between two cells."""
        f1, f2 = self.voronoi(vec, 1.0, "F1"), self.voronoi(vec, 1.0, "F2")
        return self.math("DIVIDE", f1, self.math("MAXIMUM", f2, 0.001))

    def xyz(self, vec):
        s = self.node("ShaderNodeSeparateXYZ"); self.put(vec, s.inputs[0])
        return s.outputs

    def rgb(self, col):
        s = self.node("ShaderNodeSeparateColor"); self.put(col, s.inputs[0])
        return s.outputs

    def geo(self, out):
        return self.node("ShaderNodeNewGeometry").outputs[out]

    def grey(self, v):
        c = self.node("ShaderNodeCombineColor")
        for i in range(3):
            self.put(v, c.inputs[i])
        return c.outputs[0]

    def normal_map(self, col, strength, uv="Detail"):
        n = self.node("ShaderNodeNormalMap", space="TANGENT", uv_map=uv)
        n.inputs["Strength"].default_value = strength
        self.put(col, n.inputs["Color"])
        return n.outputs["Normal"]

    def bump(self, height, strength, distance, normal=None):
        n = self.node("ShaderNodeBump")
        n.inputs["Strength"].default_value, n.inputs["Distance"].default_value = strength, distance
        self.put(height, n.inputs["Height"])
        if normal is not None:
            self.put(normal, n.inputs["Normal"])
        return n.outputs["Normal"]

    def baked(self, img):
        """A baked atlas image read through the atlas UVs."""
        t = self.node("ShaderNodeTexImage", image=img)
        self.put(self.uv("UVMap"), t.inputs["Vector"])
        return t.outputs["Color"]

    def along(self, p, spec):
        """0..1 ramp along an object axis: spec ("x" | "-x" | "absx" | "z" | "-z", lo, hi) (None: no socket)."""
        if spec is None:
            return None
        axis, lo, hi = spec
        c = self.xyz(p)
        v = {"x": c["X"], "-x": self.math("MULTIPLY", c["X"], -1.0), "absx": self.math("ABSOLUTE", c["X"]),
             "z": c["Z"], "-z": self.math("MULTIPLY", c["Z"], -1.0)}[axis]
        return self.remap(v, lo, hi, 0, 1, True)


def wood(n, p, t, ao):
    mp = find_maps("fine_grained_wood")
    vec = n.scale(n.uv(), (1 / 0.11, 1 / 0.34, 1))                         # grain along the haft
    pz = n.xyz(p)["Z"]
    grip = n.remap(pz, t.haft.z0 + 0.27, t.haft.z0 + 0.23, smooth=True)    # hands polished the grip zone
    facets = n.voronoi(n.scale(p, (1 / 0.010, 1 / 0.010, 1 / 0.055)), 1.0, "DISTANCE_TO_EDGE")  # knife-shaved flats
    height = n.math("MULTIPLY", n.remap(facets, 0.0, 0.25, 0.0, 1.0, True), 0.6)
    dark = 0.0
    if t.knot:
        kc = t.haft.axis(t.knot[0]) + Vector((math.cos(t.knot[1]), math.sin(t.knot[1]), 0)) * (t.haft.radius(t.knot[0]) + 0.004)
        centre = n.node("ShaderNodeCombineXYZ")
        for i, v in enumerate(kc):
            centre.inputs[i].default_value = v
        dist = n.node("ShaderNodeVectorMath", operation="DISTANCE")
        n.put(p, dist.inputs[0]); n.put(centre.outputs[0], dist.inputs[1])
        kd = dist.outputs["Value"]
        rings = n.math("MULTIPLY", n.math("SINE", n.math("MULTIPLY", kd, 1400.0)), n.remap(kd, 0.0, 0.013, 1.0, 0.0, True))
        height = n.math("ADD", height, n.math("MULTIPLY", rings, 0.25))
        dark = n.math("MULTIPLY", n.remap(kd, 0.0, 0.009, 1.0, 0.0, True), 0.55)
    if t.haft.swell:  # the split that holds a stone head, above and below it
        lo, hi, _ = t.haft.swell
        y = n.xyz(p)["Y"]
        split = n.math("MULTIPLY", n.remap(n.math("ABSOLUTE", y), 0.0, 0.0011, 1.0, 0.0, True),
                       n.math("MULTIPLY", n.remap(pz, lo + 0.015, lo + 0.032, 0, 1, True), n.remap(pz, hi - 0.04, hi - 0.02, 1, 0, True)))
        height = n.math("SUBTRACT", height, n.math("MULTIPLY", split, 2.0))
        dark = n.math("MAXIMUM", dark, split)
    nrm = n.bump(height, 0.9, 0.0012, n.normal_map(n.image(mp["nor"], vec, False), 0.6))
    rough = n.mixf(n.mixf(n.bw(n.image(mp["rough"], vec, False)), 0.62, 0.6), 0.45, n.math("MULTIPLY", grip, 0.7))
    tone = n.math("ADD", n.math("MULTIPLY", n.remap(n.bw(n.image(mp["col"], vec)), 0.15, 0.6), 0.3), n.math("MULTIPLY", n.noise(p, 6.0, 1.5), 0.6))
    col = n.ramp(tone, [(0.0, PAL["bois_sombre"]), (0.45, PAL["bois"]), (1.0, PAL["bois_clair"])])
    col = n.mix(col, lin(PAL["bois_sombre"]), dark)
    col = n.mix(col, lin((0.36, 0.22, 0.12)), n.math("MULTIPLY", grip, 0.45))
    return col, rough, 0.0, nrm


def flint(n, p, t, ao):
    mp, cx = find_maps("dark_rock"), find_maps("rock_boulder_dry")
    vec = n.scale(n.uv(), 1 / 0.09)
    # Knapping: concave flake scars, each its own depth, a sharp crest where two meet, faint ripples.
    q = n.scale(p, (1 / 0.019, 1 / 0.017, 1 / 0.028))
    ratio = n.scars(q)
    depth = n.remap(n.bw(n.voronoi(q, 1.0, "F1", "Color")), 0, 1, 0.55, 1.15)
    ripples = n.math("MULTIPLY", n.math("SINE", n.math("MULTIPLY", n.voronoi(q, 1.0, "F1"), 55.0)), 0.012)
    height = n.math("ADD", n.math("MULTIPLY", n.math("POWER", ratio, 0.85), depth), ripples)
    nrm = n.bump(height, 0.45, 0.0022, n.normal_map(n.image(mp["nor"], vec, False), 0.35))
    ridge = n.remap(ratio, 0.93, 0.995, 0, 1, True)
    cortex = n.along(p, t.cortex)
    cortex = n.math("MULTIPLY", cortex, n.remap(n.noise(p, 40.0, 3.0), 0.35, 0.6, 0.4, 1.0)) if cortex else 0.0
    rough = n.mixf(n.mixf(0.46, 0.6, ridge), 0.92, cortex)
    bands = n.node("ShaderNodeTexWave", wave_type="RINGS")
    bands.inputs["Scale"].default_value, bands.inputs["Distortion"].default_value = 7.0, 6.0
    n.put(n.scale(p, (1.0, 2.5, 1.0)), bands.inputs["Vector"])
    scoop = n.math("SUBTRACT", 1.0, n.math("POWER", ratio, 0.85))
    tone = n.math("ADD", n.math("MULTIPLY", n.remap(n.bw(n.image(mp["col"], vec)), 0.02, 0.18), 0.15), n.math("MULTIPLY", bands.outputs["Fac"], 0.3))
    tone = n.math("ADD", n.math("ADD", tone, n.math("MULTIPLY", ridge, 0.25)), n.math("MULTIPLY", scoop, -0.18))
    col = n.ramp(n.math("ADD", tone, 0.2), [(0.0, PAL["silex_sombre"]), (0.5, PAL["silex"]), (1.0, PAL["silex_clair"])])
    col = n.mix(col, n.mix(lin(PAL["cortex"]), n.image(cx["col"], vec), 0.25, "MULTIPLY"), cortex)
    return col, rough, 0.0, nrm


def crevices(n, ao, gain):
    """Where dirt, verdigris and rust gather: occluded places (from the baked occlusion)."""
    return n.math("MULTIPLY", n.math("SUBTRACT", 1.0, ao), gain) if ao is not None else 0.3


def copper(n, p, t, ao):
    mp = find_maps("green_metal_rust")
    vec = n.scale(n.uv(), 1 / 0.10)
    dents = n.scars(n.scale(p, 1 / 0.007))                                  # hammered: small shallow facets
    nrm = n.bump(n.math("POWER", dents, 0.7), 0.35, 0.0007, n.normal_map(n.image(mp["nor"], vec, False), 0.25))
    stains = n.remap(n.bw(n.image(mp["col"], vec)), 0.05, 0.3, 0.6, 1.2)
    patina = n.math("MULTIPLY", n.math("ADD", crevices(n, ao, 1.7), n.math("MULTIPLY", n.noise(p, 22.0, 3.0), 0.75)), stains)
    patina = n.remap(patina, 0.66, 0.95, 0, 1, True)
    keen = n.along(p, t.keen)
    if keen:
        patina = n.math("MULTIPLY", patina, n.math("SUBTRACT", 1.0, keen))
    tone = n.math("ADD", n.math("ADD", 0.3, n.math("MULTIPLY", dents, 0.35)), n.math("MULTIPLY", n.noise(p, 9.0), 0.35))
    bare = n.ramp(tone, [(0.0, PAL["cuivre_sombre"]), (0.55, PAL["cuivre"]), (1.0, PAL["cuivre_clair"])])
    verdigris = n.ramp(n.noise(p, 45.0, 3.0), [(0.3, PAL["vert_sombre"]), (0.7, PAL["vert"])])
    col = n.mix(bare, verdigris, patina)
    rough = n.mixf(0.34, 0.8, patina)
    if keen:
        col = n.mix(col, lin(PAL["cuivre_clair"]), n.math("MULTIPLY", keen, 0.7))
        rough = n.mixf(rough, 0.2, keen)
    return col, rough, n.math("SUBTRACT", 1.0, patina), nrm


def iron(n, p, t, ao):
    rust_mp, plate = find_maps("rusty_metal_04"), find_maps("metal_plate_02")
    vec = n.scale(n.uv(), 1 / 0.14)
    scan = n.rgb(n.image(rust_mp["col"], vec))
    rusty = n.remap(n.math("SUBTRACT", scan["Red"], scan["Blue"]), 0.04, 0.16, 0, 1, True)  # the scan's orange patches
    rust = n.remap(n.math("ADD", n.math("ADD", n.math("MULTIPLY", rusty, 0.55), crevices(n, ao, 1.3)),
                          n.math("MULTIPLY", n.noise(p, 16.0, 3.0), 0.35)), 0.78, 1.08, 0, 1, True)
    keen = n.along(p, t.keen)
    if keen:
        rust = n.math("MULTIPLY", rust, n.math("SUBTRACT", 1.0, keen))
    forged = n.scars(n.scale(p, 1 / 0.012))                                 # hammer blows of the smith
    nrm = n.bump(n.math("POWER", forged, 0.6), 0.25, 0.0009, n.normal_map(n.image(plate["nor"], vec, False), 0.6))
    tone = n.math("ADD", n.math("ADD", 0.25, n.math("MULTIPLY", n.bw(n.image(plate["col"], vec)), 0.9)), n.math("MULTIPLY", n.noise(p, 8.0), 0.3))
    bare = n.ramp(tone, [(0.0, PAL["fer_sombre"]), (0.5, PAL["fer"]), (1.0, PAL["fer_clair"])])
    rust_col = n.ramp(n.noise(p, 30.0, 3.0), [(0.3, PAL["rouille_sombre"]), (0.7, PAL["rouille"])])
    col = n.mix(bare, rust_col, rust)
    rough = n.mixf(0.42, 0.86, rust)
    if keen:
        col = n.mix(col, lin(PAL["fer_poli"]), n.math("MULTIPLY", keen, 0.85))
        rough = n.mixf(rough, 0.22, keen)
    return col, rough, n.math("SUBTRACT", 1.0, rust), nrm


def leather(n, p, t, ao):
    mp = find_maps("brown_leather")
    vec = n.scale(n.uv(), 1 / 0.07)
    nrm = n.normal_map(n.image(mp["nor"], vec, False), 0.5)
    rough = n.mixf(n.bw(n.image(mp["rough"], vec, False)), 0.55, 0.6)
    tone = n.math("ADD", n.math("MULTIPLY", n.remap(n.bw(n.image(mp["col"], vec)), 0.03, 0.2), 0.4), n.math("MULTIPLY", n.noise(p, 30.0), 0.6))
    col = n.ramp(tone, [(0.0, PAL["cuir_sombre"]), (0.5, PAL["cuir"]), (1.0, PAL["cuir_clair"])])
    return col, rough, 0.0, nrm


def sinew(n, p, t, ao):
    """Two-ply twisted cord: diagonal grooves from the metric UVs (u around, v along)."""
    uvs = n.xyz(n.uv())
    twist = n.math("SINE", n.math("MULTIPLY", n.math("ADD", n.math("DIVIDE", uvs["X"], 0.0119), n.math("DIVIDE", uvs["Y"], 0.0045)), TAU))
    fibre = n.noise(n.scale(n.uv(), (1 / 0.0006, 1 / 0.004, 1)), 1.0, 2.0)
    nrm = n.bump(n.math("ADD", n.math("MULTIPLY", twist, 0.5), n.math("MULTIPLY", fibre, 0.25)), 1.0, 0.0006)
    tone = n.math("ADD", n.math("MULTIPLY", twist, 0.25), n.math("ADD", 0.45, n.math("MULTIPLY", fibre, 0.3)))
    return n.ramp(tone, [(0.0, PAL["corde_sombre"]), (1.0, PAL["corde"])]), 0.8, 0.0, nrm


PARTS = {"Bois": wood, "Silex": flint, "Cuivre": copper, "Fer": iron, "Cuir": leather, "Corde": sinew}


def surface(part, t, baked):
    """Material HD_<part> for tool `t`. `baked` holds atlas images already baked (occlusion "ao", convex edges "edge")
    the painted colour builds on: dark creases, worn light edges, light from above as in the nature pack."""
    m = bpy.data.materials.get("HD_" + part) or bpy.data.materials.new("HD_" + part)
    m.use_nodes = True
    for x in list(m.node_tree.nodes):
        m.node_tree.nodes.remove(x)
    n = N(m)
    out = n.node("ShaderNodeOutputMaterial")
    bsdf = n.node("ShaderNodeBsdfPrincipled")
    n.links.new(bsdf.outputs[0], out.inputs["Surface"])
    ao = n.bw(n.baked(baked["ao"])) if "ao" in baked else None
    col, rough, metal, nrm = PARTS[part](n, n.obj(), t, ao)
    if ao is not None:
        crease = n.mix(lin(PAL["creux"]), (1.0, 1.0, 1.0, 1.0), n.math("POWER", ao, 1.3))
        col = n.mix(col, crease, 0.85, "MULTIPLY")
    if "edge" in baked:
        edge = n.bw(n.baked(baked["edge"]))
        col = n.mix(col, n.mix(col, lin((0.95, 0.88, 0.74)), 0.5, "SCREEN"), n.math("MULTIPLY", edge, 0.8 if part not in ("Cuivre", "Fer") else 0.45))
    up = n.remap(n.xyz(n.geo("Normal"))["Z"], -1, 1, 0.86, 1.08)
    col = n.mix(col, n.grey(up), 1.0, "MULTIPLY")
    n.put(col, bsdf.inputs["Base Color"])
    n.put(rough, bsdf.inputs["Roughness"])
    n.put(metal, bsdf.inputs["Metallic"])
    n.put(nrm, bsdf.inputs["Normal"])
    return m


# ---------------------------------------------------------------------------------------------------------- atlas, bake

def select_only(o):
    for x in bpy.context.view_layer.objects:
        x.select_set(x == o)
    bpy.context.view_layer.objects.active = o


def make_atlas(o):
    """Copies the metric UVs to "UVMap" and packs every island into one square (texel density kept equal everywhere)."""
    me = o.data
    atlas = me.uv_layers.new(name="UVMap")
    for a, d in zip(atlas.data, me.uv_layers["Detail"].data):
        a.uv = d.uv
    me.uv_layers.active = atlas
    atlas.active_render = True
    select_only(o)
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.004, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def new_target(name, colour, size=SIZE):
    """8 bits per channel even for data maps: a float image would be exported as a 32-bit PNG (4× the game's memory)."""
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return img


def bake(o, kind, img, samples=1, emit=None):
    """Bakes into `img` across every material of `o`. kind EMIT: `emit(material)` gives the socket to bake (no lighting)."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device, sc.cycles.samples = "CPU", samples
    reroutes, added = [], []
    for m in o.data.materials:
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
        uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"
        nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
        nt.nodes.active = tex
        added += [(nt, tex), (nt, uv)]
        if emit is not None:
            out = next(x for x in nt.nodes if x.type == "OUTPUT_MATERIAL")
            reroutes.append((nt, out, out.inputs["Surface"].links[0].from_socket))
            e = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(emit(m), e.inputs["Color"])
            nt.links.new(e.outputs[0], out.inputs["Surface"])
            added.append((nt, e))
    select_only(o)
    if kind == "NORMAL":
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=16, use_clear=True)
    else:
        bpy.ops.object.bake(type=kind, margin=16, use_clear=True)
    for nt, out, prev in reroutes:
        nt.links.new(prev, out.inputs["Surface"])
    for nt, node in added:
        nt.nodes.remove(node)
    print(f"OUTILS_HD baked {img.name}", flush=True)
    return img


def socket_of(m, name):
    """What feeds the BSDF input `name` (a constant becomes an RGB node, so it can be baked)."""
    s = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs[name]
    if s.links:
        return s.links[0].from_socket
    rgb = m.node_tree.nodes.new("ShaderNodeRGB")
    v = s.default_value
    rgb.outputs[0].default_value = (v, v, v, 1) if isinstance(v, float) else tuple(v)
    return rgb.outputs[0]


def edge_mask(m):
    """Convex edges (bevelled normal ≠ true normal): where a painter puts highlights and where wear shows."""
    n = N(m)
    bevel = n.node("ShaderNodeBevel", samples=16)
    bevel.inputs["Radius"].default_value = 0.0018
    dot = n.node("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    n.put(bevel.outputs["Normal"], dot.inputs[0]); n.put(n.geo("Normal"), dot.inputs[1])
    return n.grey(n.remap(dot.outputs["Value"], 0.985, 0.90, 0, 1, True))


def bake_tool(t):
    """Atlas UVs, occlusion and edges, then colour / roughness / metal / relief → one final material named like the tool."""
    o = t.obj
    for part in o["parts"]:
        o.data.materials.append(surface(part, t, {}))
    make_atlas(o)
    shared = {"ao": bake(o, "AO", new_target(f"T_{t.name}_Occlusion", False), 8 if QUICK else 48),
              "edge": bake(o, "EMIT", new_target(f"T_{t.name}_Usure", False), 4 if QUICK else 16, edge_mask)}
    for part in o["parts"]:
        surface(part, t, shared)
    col = bake(o, "EMIT", new_target(f"T_{t.name}_BaseColor", True), 1, lambda m: socket_of(m, "Base Color"))
    rough = bake(o, "EMIT", new_target(f"T_{t.name}_Roughness", False), 1, lambda m: socket_of(m, "Roughness"))
    metal = bake(o, "EMIT", new_target(f"T_{t.name}_Metallic", False), 1, lambda m: socket_of(m, "Metallic")) if t.metal != "Silex" else None
    nrm = bake(o, "NORMAL", new_target(f"T_{t.name}_Normal", False), 1)
    for img in (rough, metal):
        if img is not None:
            img.scale(SMALL, SMALL)
    final = bpy.data.materials.new(t.name)
    final.use_nodes = True
    n = N(final)
    bsdf = next(x for x in final.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    n.put(n.baked(col), bsdf.inputs["Base Color"])
    n.put(n.bw(n.baked(rough)), bsdf.inputs["Roughness"])
    if metal is not None:
        n.put(n.bw(n.baked(metal)), bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = 0.0
    n.put(n.normal_map(n.baked(nrm), 1.0, "UVMap"), bsdf.inputs["Normal"])
    o.data.materials.clear()
    o.data.materials.append(final)
    for poly in o.data.polygons:
        poly.material_index = 0
    o.data.uv_layers.remove(o.data.uv_layers["Detail"])  # the game reads one UV set
    return o


# ---------------------------------------------------------------------------------------------------------- export

def export(o):
    """glTF (+ .bin + textures) of one tool into the staging folder, then copied over the game's model."""
    select_only(o)
    folder = os.path.join(STAGE, o.name)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, o.name + ".gltf")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", export_texture_dir="", use_selection=True,
                              export_apply=True, export_animations=False, export_yup=True, export_image_format="AUTO",
                              export_cameras=False, export_lights=False, export_extras=False)
    for f in os.listdir(folder):
        shutil.copyfile(os.path.join(folder, f), os.path.join(OBJETS, f))
    print(f"OUTILS_HD exported {o.name}: {sorted(os.listdir(folder))}", flush=True)


# ---------------------------------------------------------------------------------------------------------- pictures

def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.view_settings.view_transform = "AgX"
    sc.render.film_transparent = True
    w = bpy.data.worlds.new("Ciel"); sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value, bg.inputs[1].default_value = (0.80, 0.82, 0.78, 1), 0.8
    for name, energy, rot in (("Soleil", 3.0, (40, 10, -40)), ("Contre", 2.2, (65, 0, 150))):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        l.data.energy, l.rotation_euler = energy, [math.radians(a) for a in rot]
        l.data.angle = math.radians(10)
        sc.collection.objects.link(l)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.type = "ORTHO"
    sc.collection.objects.link(cam); sc.camera = cam
    return cam


def shoot(cam, objs, path, size, view, margin=1.12):
    """Same framing as recolte.py's icons: square, transparent, tools seen from the side, edge forward."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    for x in sc.objects:
        if x.type == "MESH":
            x.hide_render = x not in objs
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
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
    tools = []
    for kind, make in BUILDERS.items():
        for quality in QUALITIES:
            if ONLY and f"{kind}_{quality}" not in ONLY:
                continue
            t = make(quality)
            t.obj = t.b.finish()
            for other in tools:
                other.obj.hide_render = True  # no occlusion from the tools already made
            print(f"OUTILS_HD tris {t.name}: {sum(len(p.vertices) - 2 for p in t.obj.data.polygons)}", flush=True)
            bake_tool(t)
            if not QUICK:
                export(t.obj)
            tools.append(t)
    cam = setup_render()
    for t in tools:
        t.obj.hide_render = False
        icons = PREVIEWS if QUICK else ICONS
        shoot(cam, [t.obj], os.path.join(icons, t.name + ".png"), (256, 256), (0.55, -1.0, 0.35))
    for i, t in enumerate(tools):  # review sheet: one column per tool, one row per quality, on the sky colour
        t.obj.location = Vector(((i // len(QUALITIES)) * 0.55, 0, -(i % len(QUALITIES)) * 1.45))
    bpy.context.scene.render.film_transparent = False
    shoot(cam, [t.obj for t in tools], os.path.join(PREVIEWS, "planche-outils-hd.png"), (1500, 2000), (0.25, -1.0, 0.18), 1.0)
    print("OUTILS_HD done", flush=True)


main()
