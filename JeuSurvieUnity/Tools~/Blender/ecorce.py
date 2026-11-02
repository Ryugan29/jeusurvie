# Bark that grows in the elf's skin (decision-2026-11-02-ecorce-dans-la-peau): a few bark zones drawn along her muscles,
# where the skin itself is densified and raised into bark. No separate pieces: nothing floats, there is no seam, and the
# bark deforms exactly like the skin in every animation. Also paints the tileable bark image the body bake samples along
# each zone's grain (long furrows, never isotropic cells, which read as cracked earth). Used by build_elfe.py.
import math, os
import bmesh, bpy
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

TILE_M = 0.16  # one repeat of the bark images covers 16 x 16 cm of skin
CORE, FADE = 0.4, 1.3  # within CORE x a zone's half-width the skin is all bark; it is back to plain skin at FADE x it
BAKE_SIZE = 256  # the bark images the body bake reads: about the bake's own density (finer detail would only alias)
SCULPT_BLUR_PX = 6  # the height that sculpts the skin is softened by about 1 mm: it keeps the furrows, not the fibres
# Bark colours (linear): deep furrow, warm inner bark on the furrow walls, ridge, worn grey-brown ridge top.
# Kept dark and greyish: a light tan reads as dried mud.
FURROW, INNER, RIDGE, RIDGE_TOP = (0.012, 0.008, 0.006), (0.075, 0.032, 0.018), (0.070, 0.050, 0.035), (0.17, 0.135, 0.10)


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def _image(name, rgb, out_dir, colour):
    """Saves an RGB array (rows = v from the bottom) as a PNG the body bake can sample."""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    if not colour:
        img.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([rgb, np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    img.filepath_raw, img.file_format = os.path.join(out_dir, name + ".png"), "PNG"
    img.save()
    return img


def _tileable_noise(rng, size, across, along):
    """Smooth noise that repeats across the tile, with features about 1/across wide and 1/along long (unit variance)."""
    k = np.fft.fftfreq(size) * size
    ku, kv = np.meshgrid(k, k)
    f = np.exp(-((ku / across) ** 2 + (kv / along) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((size, size))) * f))
    return (out / (out.std() + 1e-9)).astype(np.float32)


def _cells(u, v, columns, stretch, rng):
    """Tileable Voronoi cells `stretch` times longer along v (the grain) than across: returns the gap to the nearest cell
    edge (0 on an edge), the index of each pixel's cell and the cell centres."""
    pts = [((c + 0.5 + rng.uniform(-0.35, 0.35)) / columns, rng.uniform(0, 1))
           for c in range(columns) for _ in range(rng.integers(1, 3))]
    pts = np.array(pts, np.float32)
    f1 = np.full(u.shape, 9.0, np.float32); f2 = f1.copy(); idx = np.zeros(u.shape, np.int32)
    for i, (pu, pv) in enumerate(pts):
        du = (u - pu + 0.5) % 1.0 - 0.5
        dv = ((v - pv + 0.5) % 1.0 - 0.5) / stretch
        d = np.sqrt(du * du + dv * dv)
        nearer = d < f1
        f2 = np.where(nearer, f1, np.minimum(f2, d)); idx = np.where(nearer, i, idx); f1 = np.where(nearer, d, f1)
    return f2 - f1, idx, pts


def paint_bark(out_dir, size=1024, seed=11):
    """Tileable bark (u across, v along the grain): long interlaced ridges split by wide dark furrows, broken across here
    and there, with fibres along the grain. Returns the colour and height images (sampled by the body bake) and the
    height as an array (sculpts the skin)."""
    rng = np.random.default_rng(seed)
    v, u = (np.mgrid[0:size, 0:size].astype(np.float32) + 0.5) / size
    u = u + 0.025 * _tileable_noise(rng, size, 3, 2)  # gently wavy grain
    v = v + 0.015 * _tileable_noise(rng, size, 3, 2)
    gap, idx, pts = _cells(u, v, 6, 5.0, rng)
    fine_gap, _, _ = _cells(u, v, 14, 6.0, rng)
    ridge = _smoothstep(0.008, 0.045, gap) ** 0.8  # flat-ish ridge tops, deep furrows with a dark floor
    fine = _smoothstep(0.0, 0.008, fine_gap)  # shallow grooves splitting the wide ridges
    n = len(pts)
    break_v, tilt, broken = rng.uniform(0, 1, n), rng.uniform(-0.4, 0.4, n), rng.random(n) < 0.6
    du = (u - pts[idx, 0] + 0.5) % 1.0 - 0.5
    dv = (v - break_v[idx] + 0.5) % 1.0 - 0.5 - tilt[idx] * du
    cross = np.exp(-(dv / 0.007) ** 2) * broken[idx]  # a crack across some ridges: the bark breaks into plates
    fibre = _tileable_noise(rng, size, 45, 4)
    height = np.clip(ridge * (0.7 + 0.3 * fine) * (1 - 0.8 * cross) + 0.07 * fibre * ridge, 0, 1).astype(np.float32)

    # a wide dark furrow floor, a narrow warm band where the furrow wall meets the ridge, then the ridge
    stops, colours = (0.0, 0.3, 0.5, 0.7, 1.0), (FURROW, tuple(c * 2.2 for c in FURROW), INNER, RIDGE, RIDGE_TOP)
    col = np.stack([np.interp(height, stops, [c[k] for c in colours]) for k in range(3)], -1)
    tint, grey = rng.uniform(0.85, 1.15, n)[idx], rng.uniform(0.0, 0.2, n)[idx]  # each ridge a little different
    lum = col.mean(-1, keepdims=True)
    col = (col * (1 - grey[..., None]) + lum * grey[..., None]) * tint[..., None]
    col *= ((1 + 0.10 * _tileable_noise(rng, size, 2, 2)) * (1 + 0.08 * fibre))[..., None]
    assert size % BAKE_SIZE == 0, "the bark is painted at a multiple of the size the bake reads"
    f = size // BAKE_SIZE
    shrink = lambda a: a.reshape(BAKE_SIZE, f, BAKE_SIZE, f, *a.shape[2:]).mean((1, 3))
    k = np.fft.fftfreq(size) * size
    blur = np.exp(-(k[None, :] ** 2 + k[:, None] ** 2) * (SCULPT_BLUR_PX * np.pi / size) ** 2 * 2)
    sculpt = np.real(np.fft.ifft2(np.fft.fft2(height) * blur)).astype(np.float32)
    return (_image("T_Elfe_Ecorce_BaseColor", _srgb(shrink(col)).astype(np.float32), out_dir, True),
            _image("T_Elfe_Ecorce_Hauteur", np.repeat(shrink(height)[..., None], 3, -1), out_dir, False), sculpt)


def _sample(img, gu, gv):
    """Bilinear, wrapping read of a square array at tile coordinates (gu across, gv along)."""
    size = img.shape[0]
    x, y = (gu % 1.0) * size - 0.5, (gv % 1.0) * size - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    at = lambda yy, xx: img[yy % size, xx % size]
    return ((at(y0, x0) * (1 - fx) + at(y0, x0 + 1) * fx) * (1 - fy) + (at(y0 + 1, x0) * (1 - fx) + at(y0 + 1, x0 + 1) * fx) * fy)


class Anatomy:
    """Puts points on the rest-pose skin, seen from inside the torso, an arm or a leg (rays from the bones outwards)."""
    TORSO_AXIS_Y = 0.02  # the torso's rays start on the vertical line x = 0, y = TORSO_AXIS_Y

    def __init__(self, body, arm):
        self.tree = BVHTree.FromPolygons([v.co for v in body.data.vertices], [p.vertices for p in body.data.polygons])
        b = arm.data.bones
        self.arm_axis = (b["upperarm_l"].head_local.y, b["upperarm_l"].head_local.z)
        self.leg_x = b["thigh_l"].head_local.x
        self.leg_line = [(p.z, p.y) for p in (b["calf_l"].tail_local, b["calf_l"].head_local, b["thigh_l"].head_local)]

    def _hit(self, origin, direction, what):
        hit, _, _, _ = self.tree.ray_cast(origin, direction)
        assert hit is not None, f"no skin found for {what}"
        return hit

    def normal_at(self, p):
        """Outward normal of the skin nearest to p."""
        return self.tree.find_nearest(p)[1]

    def torso(self, theta, z, side):
        """`theta` degrees around from the front centre (180 = the spine) at height z."""
        t = math.radians(theta)
        return self._hit(Vector((0.0, self.TORSO_AXIS_Y, z)), Vector((side * math.sin(t), -math.cos(t), 0.0)), f"torso {theta} {z}")

    def arm(self, along, around, side):
        """`along` metres from the body's mid-plane (elbow 0.39, wrist 0.64); `around` degrees: 0 front, 90 top (the outer
        side once the arms hang down), 180 back, 270 underneath."""
        a = math.radians(around)
        y, z = self.arm_axis
        return self._hit(Vector((side * along, y, z)), Vector((0.0, -math.cos(a), math.sin(a))), f"arm {along} {around}")

    def leg(self, z, around, side):
        """At height z (knee 0.53, ankle 0.07); `around` degrees: 0 front, 90 outer side, 180 back, 270 inner side."""
        zs, ys = zip(*self.leg_line)
        a = math.radians(around)
        origin = Vector((side * self.leg_x, float(np.interp(z, zs, ys)), z))
        return self._hit(origin, Vector((side * math.sin(a), -math.cos(a), 0.0)), f"leg {z} {around}")


# Bark zones of the body, drawn along the muscles and asymmetric on purpose; joints (elbows, armpits, waist, knees) stay
# skin. The chest stays covered, but never by a matching pair: on her left the bark spills from the collarbone over the
# breast and down the ribs, on her right it climbs from the flank over the breast. Each zone: (side +1 = her left, the
# points of its line (how to place it on the skin, then the half-width there, in metres), relief in metres, raised edge:
# None or (side of the line +-1, start and end along the line as fractions, height in metres)).
ZONES = (
    (1, [("torso", 40, 1.445, 0.035), ("torso", 30, 1.395, 0.06), ("torso", 27, 1.33, 0.095), ("torso", 40, 1.27, 0.075),
         ("torso", 62, 1.22, 0.05), ("torso", 70, 1.15, 0.035)], 0.0045, (-1, 0.35, 0.65, 0.0025)),  # left chest, ribs
    (-1, [("torso", 18, 1.37, 0.05), ("torso", 28, 1.315, 0.095), ("torso", 40, 1.255, 0.075), ("torso", 55, 1.19, 0.05),
          ("torso", 52, 1.11, 0.04), ("torso", 44, 1.05, 0.03)], 0.004, None),                    # right chest, flank
    (1, [("torso", 60, 1.035, 0.03), ("torso", 85, 1.02, 0.045), ("torso", 110, 1.035, 0.04), ("torso", 128, 1.065, 0.025)],
     0.003, None),                                                                                # left hip bone
    (1, [("torso", 172, 0.995, 0.03), ("torso", 167, 1.08, 0.05), ("torso", 160, 1.17, 0.055), ("torso", 150, 1.25, 0.04)],
     0.006, (1, 0.25, 0.7, 0.003)),                                                               # low back, by the spine
    (-1, [("torso", 152, 1.345, 0.035), ("torso", 135, 1.31, 0.055), ("torso", 118, 1.265, 0.04)], 0.004, None),  # shoulder blade
    (1, [("torso", 62, 1.505, 0.03), ("arm", 0.11, 88, 0.04), ("arm", 0.18, 92, 0.055), ("arm", 0.25, 96, 0.05),
         ("arm", 0.32, 100, 0.045), ("arm", 0.365, 104, 0.03)], 0.005, (1, 0.35, 0.8, 0.003)),   # neck, shoulder, arm
    (-1, [("arm", 0.44, 70, 0.025), ("arm", 0.50, 65, 0.035), ("arm", 0.56, 60, 0.035), ("arm", 0.605, 58, 0.025)],
     0.003, None),                                                                                # right forearm
    (1, [("arm", 0.46, 200, 0.02), ("arm", 0.50, 203, 0.03), ("arm", 0.54, 206, 0.02)], 0.0025, None),
    (1, [("leg", 0.82, 85, 0.04), ("leg", 0.71, 90, 0.055), ("leg", 0.60, 95, 0.04)], 0.004, None),  # outer thigh
    (-1, [("leg", 0.44, 15, 0.03), ("leg", 0.33, 10, 0.04), ("leg", 0.21, 5, 0.03)], 0.003, None),   # shin
    (1, [("leg", 0.45, 175, 0.04), ("leg", 0.36, 180, 0.055), ("leg", 0.26, 185, 0.04)], 0.006,
     (-1, 0.2, 0.75, 0.003)),                                                                     # calf
)


def chaikin(points, rounds=2):
    """Rounds the corners of a polyline (rows: any coordinates), keeping its two ends."""
    for _ in range(rounds):
        a, b = points[:-1], points[1:]
        cut = np.stack([0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b], 1).reshape(-1, points.shape[1])
        points = np.vstack([points[:1], cut, points[-1:]])
    return points


class Zone:
    """One bark zone: a smooth line on the skin (its corners rounded, then resampled every centimetre, so the grain never
    jumps at a bend) and the shape of the bark around it."""

    def __init__(self, anatomy, spec, index):
        side, knots, self.relief, self.lift = spec
        pts = [list(getattr(anatomy, kind)(*args, side)) + [w] for kind, *args, w in knots]
        smooth = chaikin(np.array(pts, np.float64))  # x, y, z and the half-width, rounded together
        line, widths = [], []
        for a, b in zip(smooth, smooth[1:]):
            steps = max(1, int(np.linalg.norm(b[:3] - a[:3]) / 0.01))
            for k in range(steps):
                p = a + (b - a) * (k / steps)
                line.append(Vector(p[:3])); widths.append(p[3])
        line.append(Vector(smooth[-1, :3])); widths.append(smooth[-1, 3])
        snapped = [anatomy.tree.find_nearest(p) for p in line]
        self.points = np.array([s[0] for s in snapped], np.float64)
        self.normals = np.array([s[1] for s in snapped], np.float64)
        seg = np.linalg.norm(np.diff(self.points, axis=0), axis=1)
        self.along = np.concatenate([[0.0], np.cumsum(seg)])
        self.widths = (self.along, np.array(widths))  # half-width at each point of the line
        self.offset = np.array([0.37 * index % 1.0, 0.61 * index % 1.0])  # each zone reads its own part of the bark
        self.seed = Vector((index * 7.1, index * 3.3, index * 5.7))

    def measure(self, co, nor):
        """For skin points (n x 3) and their normals, a dict of arrays: `near` (the indices measured, those within reach of
        the zone), and for them `bark` (0..1), `closeness` (1 on the line, 0 where the bark has faded out, below 0
        beyond, -inf on the far side of a limb: it picks the zone a point belongs to), `along` and `across` (metres, the
        point's place relative to the line) and `grain` (bark image coordinates, tile units; also given to the bare skin
        just around the zone, so they stay smooth up to its edge)."""
        reach = max(self.widths[1]) * (FADE + 1.2)  # the ragged outline can reach well beyond FADE
        lo, hi = self.points.min(0) - reach, self.points.max(0) + reach
        near = np.where(np.all((co > lo) & (co < hi), axis=1))[0]
        if not len(near):
            return None
        c = co[near]
        a, b = self.points[:-1], self.points[1:]
        ab = b - a
        t = np.clip(np.einsum("mkj,kj->mk", c[:, None] - a[None], ab) / np.maximum((ab * ab).sum(1), 1e-12), 0, 1)
        q = a[None] + t[..., None] * ab[None]
        k = np.argmin(((c[:, None] - q) ** 2).sum(-1), axis=1)
        rows = np.arange(len(c))
        q, tk = q[rows, k], t[rows, k]
        s = self.along[k] + tk * (self.along[k + 1] - self.along[k])
        n = self.normals[k] * (1 - tk[:, None]) + self.normals[k + 1] * tk[:, None]
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        tangent = ab[k] / np.maximum(np.linalg.norm(ab[k], axis=1, keepdims=True), 1e-12)
        across = np.einsum("mj,mj->m", c - q, np.cross(tangent, n))
        d = np.linalg.norm(c - q, axis=1)
        length = self.along[-1]
        ends = 0.6 + 0.4 * np.sin(np.pi * np.clip(s / max(length, 1e-6), 0, 1)) ** 0.5  # rounder, narrower ends
        # an organic outline: broad lobes and a finer ragged edge, different on each side of the line
        ragged = np.array([0.35 * noise.noise(Vector(p) * 12 + self.seed) + 0.18 * noise.noise(Vector(p) * 40 + self.seed)
                           for p in c])
        sway = np.array([noise.noise(Vector((si * 18, 1.0 if a_ > 0 else -1.0, 0)) + self.seed) for si, a_ in zip(s, across)])
        w = np.interp(s, *self.widths) * ends * (1 + 0.18 * sway)
        dd = d * (1 + ragged)
        facing = np.einsum("mj,mj->m", nor[near], n) > 0.3  # never through to the other side of a limb
        closeness = np.where(facing, 1 - dd / (FADE * w), -np.inf)
        bark = (1 - _smoothstep(CORE * w, FADE * w, dd)) * facing
        grain = np.stack([across / TILE_M + self.offset[0], s / TILE_M + self.offset[1]], -1)
        return dict(near=near, bark=bark, closeness=closeness, along=s, across=across, grain=grain)

    def height(self, m, grain, height_img, along, across):
        """How far the skin rises (metres): stepped edges (strata), furrows in the middle, and the raised lip if any."""
        strata = 0.4 * _smoothstep(0.08, 0.16, m) + 0.3 * _smoothstep(0.3, 0.38, m) + 0.3 * _smoothstep(0.55, 0.63, m)
        core = _smoothstep(0.45, 0.8, m)
        h = _sample(height_img, grain[:, 0], grain[:, 1])
        out = self.relief * strata * (0.8 + 0.2 * h) - 0.002 * (1 - h) * core
        if self.lift:
            lip_side, start, end, amount = self.lift
            s_frac = along / max(self.along[-1], 1e-6)
            window = _smoothstep(start, start + 0.1, s_frac) * (1 - _smoothstep(end - 0.1, end, s_frac))
            out += amount * np.exp(-((m - 0.5) / 0.12) ** 2) * window * (np.sign(across) == lip_side)
        return out


def _measure_all(zones, bm):
    """Measures every vertex against every zone (refreshing the indices and normals first, so `v.index` is valid until
    the topology changes again). A vertex belongs to the zone it is closest to (relative to that zone's width), even
    bare skin around a zone, so neighbouring points share one grain. Returns per vertex: bark amount, grain, place along
    and across its zone's line, and the zone's index (-1: not near any zone)."""
    bm.verts.ensure_lookup_table(); bm.verts.index_update(); bm.normal_update()
    co = np.array([v.co for v in bm.verts]); nor = np.array([v.normal for v in bm.verts])
    count = len(co)
    best, owner = np.full(count, -np.inf), np.full(count, -1)
    bark, grain, along, across = np.zeros(count), np.zeros((count, 2)), np.zeros(count), np.zeros(count)
    for i, z in enumerate(zones):
        r = z.measure(co, nor)
        if r is None:
            continue
        win = r["closeness"] > best[r["near"]]
        idx = r["near"][win]
        best[idx], owner[idx] = r["closeness"][win], i
        bark[idx], grain[idx], along[idx], across[idx] = r["bark"][win], r["grain"][win], r["along"][win], r["across"][win]
    return bark, grain, along, across, owner


def skin_bark_nodes(n, colour_img, height_img):
    """Shader side of the zones (n: build_elfe's node helper): how much bark (0..1), the bark colour read along each
    zone's grain, and its furrows (0..1, 1 = bottom of a furrow)."""
    grain = n.attr("ElfeGrain", "Vector")

    def sample(img):
        t = n.nt.nodes.new("ShaderNodeTexImage"); t.image, t.extension = img, "REPEAT"
        n.link(grain, t.inputs["Vector"])
        return t.outputs["Color"]

    grey = n.nt.nodes.new("ShaderNodeRGBToBW"); n.link(sample(height_img), grey.inputs[0])
    return n.attr("ElfeEcorce"), sample(colour_img), n.math("SUBTRACT", 1.0, grey.outputs[0])


def _densify(bm, mask, threshold, either_end=False):
    """Splits into two every edge whose ends both (or, with `either_end`, at least one) have more bark than `threshold`.
    `mask` is indexed by `v.index`: call right after _measure_all, before any other change to the mesh."""
    test = any if either_end else all
    edges = [e for e in bm.edges if test(mask[v.index] > threshold for v in e.verts)]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True, smooth=0.5)


def grow_bark(body, arm, height_img):
    """Densifies the skin where bark grows, once over each whole zone and once more where the bark is (new points keep
    skin weights and UVs), raises it into bark and stores the zones for the shader: ElfeEcorce (how much bark, 0..1)
    and ElfeGrain (bark image coordinates along each zone)."""
    anatomy = Anatomy(body, arm)
    zones = [Zone(anatomy, spec, i) for i, spec in enumerate(ZONES)]
    bm = bmesh.new(); bm.from_mesh(body.data)
    for threshold, either_end in ((0.0, True), (0.2, False)):
        _densify(bm, _measure_all(zones, bm)[0], threshold, either_end)
    mask, grain, along, across, owner = _measure_all(zones, bm)
    rise = np.zeros(len(mask))
    for i, z in enumerate(zones):
        sel = np.where(owner == i)[0]
        if len(sel):
            rise[sel] = z.height(mask[sel], grain[sel], height_img, along[sel], across[sel])
    assert np.isfinite(rise).all() and np.abs(rise).max() < 0.02, "the bark would tear the skin apart"
    for v in bm.verts:
        if rise[v.index]:
            v.co += v.normal * rise[v.index]
    bm.to_mesh(body.data); bm.free()
    me = body.data
    amount = me.attributes.new("ElfeEcorce", "FLOAT", "POINT")
    amount.data.foreach_set("value", mask.astype(np.float32))
    coords = me.attributes.new("ElfeGrain", "FLOAT_VECTOR", "POINT")
    coords.data.foreach_set("vector", np.concatenate([grain, np.zeros((len(grain), 1))], 1).astype(np.float32).ravel())
    print("ELFE bark grown in the skin:", len(zones), "zones,", int((mask > 0.5).sum()), "bark points,",
          len(me.vertices), "body points")
