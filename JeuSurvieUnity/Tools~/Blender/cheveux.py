# The elf's hair: one sculpted mass of wavy locks, natural like real hair (José, 2026-11-03). Used by build_elfe.py.
# - A round head of hair with a thin middle parting: the layer is full right from the parting (a dip there read as an M).
# - From the parting each line follows the skull (over the temples at the front, round the elf ears, which stand out of a
#   thinner layer), then falls straight from the widest point of the head: in front of the shoulders onto the chest for
#   the front third, down the back for the rest. It never gets drawn towards the head's axis (that gathered the back as
#   if tied): free hair spreads a little as it falls, lies on the back or the chest, and waves more and more down its length.
# - The lines are grouped into locks, each a closed opaque volume (no flat card, no cut-out edge that twinkles), grooved
#   between them and gathered into soft points at the tips.
# Coordinates: Blender, z up, she faces -y; azimuth a in degrees from the front (-y) towards her left (+x), 180 = back.
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

HEAD_C = Vector((0.0, 0.02, 1.66))
HAIR_GREY_GREEN = (0.29, 0.33, 0.30)  # paint base: the painted strands average out at the former hair's sage
TEXTURE_SIZE = (512, 1024)

MU_FRONT, MU_CROWN = 44.0, 128.0  # the parting along the top of the skull, from the front hairline to the crown
A_FRONT = 58.0  # the frontmost hair hangs beside the face, in front of the ears
FRONT_TIP, FRONT_UNTIL, FRONT_GROOVE = 1.34, 112.0, 0.28  # the hair in front: down to the chest, from these lines, smoother
FRONT_SPREAD, FRONT_FULL = 0.85, 1.35  # it fans out over the chest and is thicker: a mass, not two locks
T_ROOT, T_MAX = 0.020, 0.028  # thickness of the hair layer, full right from the parting
GROOVE = 0.35  # share of the thickness carved between two locks
SLOPE, CLEAR = 0.25, 0.007  # how fast hanging hair may settle onto the body; least gap to the skin
SPREAD, ANTICIP = 0.45, 0.6  # widening per metre of fall; how early the hair starts to lean over a shoulder or the chest
WAVE_AMP, WAVE_LEN = 0.017, 0.14  # loose waves, growing along the length


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def hdir(a):
    r = math.radians(a)
    return Vector((math.sin(r), -math.cos(r), 0.0))


def sdir(a, e):
    ra, re = math.radians(a), math.radians(e)
    return Vector((math.cos(re) * math.sin(ra), -math.cos(re) * math.cos(ra), math.sin(re)))


class Skull:
    """Radius of the skull seen from the head centre, by azimuth and elevation (rays cast from inside: the ears, which
    stand out of the head, are never hit), blurred so the hair flows over small bumps."""

    def __init__(self, bvh):
        self.az, self.el = np.arange(-180, 181, 4.0), np.arange(-60, 91, 4.0)
        r = np.full((len(self.el), len(self.az)), np.nan)
        for i, e in enumerate(self.el):
            for j, a in enumerate(self.az):
                hit = bvh.ray_cast(HEAD_C, sdir(a, e), 0.35)[0]
                if hit is not None:
                    r[i, j] = (hit - HEAD_C).length
        r = np.where(np.isnan(r), np.nanmean(r, axis=1, keepdims=True), r)
        for _ in range(3):
            p = np.pad(r, 1, mode="edge")
            r = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * p[1:-1, 1:-1]) / 8
        self.r = r

    def radius(self, a, e):
        a = (a + 180) % 360 - 180
        fi, fj = (min(max(e, -60), 90) + 60) / 4.0, (a + 180) / 4.0
        i0, j0 = min(int(fi), len(self.el) - 2), min(int(fj), len(self.az) - 2)
        ti, tj, r = min(fi - i0, 1.0), fj - j0, self.r  # the grid stops at 88 degrees: no extrapolation above it
        return float((r[i0, j0] * (1 - tj) + r[i0, j0 + 1] * tj) * (1 - ti) + (r[i0 + 1, j0] * (1 - tj) + r[i0 + 1, j0 + 1] * tj) * ti)

    def hang_elevation(self, a):
        """Where the hair leaves the skull and falls: the widest point of the head at that azimuth."""
        best, best_h = 0.0, -1.0
        for e in np.arange(30, -40, -1.0):
            h = self.radius(a, e) * math.cos(math.radians(e))
            if h > best_h:
                best, best_h = e, h
        return float(best)


def ear_room(a, e):
    """1, down to 0.3 on the sides of the head where the elf ears come out: the hair stays close to the skull there so
    the ears stand out of it, seen from the front too; the volume stays on top and at the back."""
    near = (1 - smooth(15.0, 42.0, abs(abs(a) - 95.0))) * (1 - smooth(18.0, 40.0, abs(e - 10.0)))
    return 1 - 0.7 * near


def tip_height(a):
    """Length of the back hair by azimuth: the middle of the back, a little shorter at the sides (a soft U)."""
    return 1.225 + 0.06 * (1 - smooth(100.0, 170.0, abs(a)))


def hang_azimuth(s):
    """Where line s (0 at the front of the parting, 1 at the crown) hangs: a few more lines at the back, where it is long."""
    return A_FRONT + (180 - A_FRONT) * s ** 0.85


class Column:
    """One line of the mass, on its inner surface (against the skin): points, outward directions, ear room, and the
    share of its length at each point."""

    def __init__(self, s, sign, skull, body_bvh, n1, n2, notch, phase, front):
        mu = MU_FRONT + (MU_CROWN - MU_FRONT) * s
        a0, e0 = (0.0, mu) if mu < 90 else (180.0, 180 - mu)
        a1 = hang_azimuth(s)
        a0, a1 = a0 * sign, a1 * sign
        e1 = skull.hang_elevation(a1)
        arch = 1 - smooth(0.0, 0.3, s)  # the front lines come down over the temples instead of going round above them
        pts, nrm, room = [], [], []
        for k in range(n1):
            tau = k / (n1 - 1)
            a = a0 + (a1 - a0) * ((1 - (1 - tau) ** 2.2) * (1 - arch) + (1 - (1 - tau) ** 1.2) * arch)
            e = e0 + (e1 - e0) * (tau ** 1.4 * (1 - arch) + tau ** 0.85 * arch)
            d = sdir(a, e)
            lift = 0.008 * (0.3 + 0.7 * smooth(0.0, 0.15, s)) * ear_room(a, e)  # less where the parting meets the forehead
            pts.append(HEAD_C + d * (skull.radius(a, e) + lift)); nrm.append(d); room.append(ear_room(a, e))
        z_h, z_tip = pts[-1].z, (FRONT_TIP if front else tip_height(a1)) + notch
        toward = -1.0 if front else 1.0  # depth q = toward * y: away from the body, which is behind the front hair
        zs = [z_h - (z_h - z_tip) * k / n2 for k in range(1, n2 + 1)]
        xs = [pts[-1].x * (1 + (FRONT_SPREAD if front else SPREAD) * (z_h - z)) for z in zs]
        lim = [self._body_depth(body_bvh, x, z, toward) for x, z in zip(xs, zs)]
        dz = (z_h - z_tip) / n2
        for k in range(n2 - 2, -1, -1):  # lean out ahead of a shoulder or the chest, not at the last moment
            lim[k] = max(lim[k], lim[k + 1] - ANTICIP * dz)
        q = toward * pts[-1].y
        for k, (x, z) in enumerate(zip(xs, zs)):
            q = max(lim[k], q - SLOPE * dz)
            d = z_h - z
            amp, w = WAVE_AMP * smooth(0.04, 0.22, d), 2 * math.pi * d / WAVE_LEN + phase
            # side to side, and only away from the body in depth: a wave never dips into the skin
            pts.append(Vector((x + amp * math.sin(w), toward * (q + 0.7 * amp * (0.5 + 0.5 * math.cos(w))), z)))
            b = smooth(0.0, 0.15, d)
            nrm.append((hdir(a1) * (1 - b) + Vector((0, toward, 0)) * b).normalized())
            room.append(room[n1 - 1] + (1 - room[n1 - 1]) * smooth(0.0, 0.06, d))
        self.inner, self.normal, self.room = pts, nrm, room
        lengths = [0.0]
        for p, p2 in zip(pts, pts[1:]):
            lengths.append(lengths[-1] + (p2 - p).length)
        self.t = [l / lengths[-1] for l in lengths]
        self.s = s

    @staticmethod
    def _body_depth(bvh, x, z, toward):
        """The least depth (toward * y) the hair may have at (x, z): the body surface seen from behind (back hair) or from
        the front (front hair), plus CLEAR. Above the ears or beside the body: no limit. The arms (out sideways in the
        rest pose) never hold the hair."""
        if z > 1.585:
            return -1.0
        hit = bvh.ray_cast(Vector((x, toward * 0.6, z)), Vector((0, -toward, 0)), 1.2)[0]
        if hit is None or abs(hit.x) > 0.17:
            return -1.0
        return toward * hit.y + CLEAR


def thickness(t, s):
    th = T_ROOT + (T_MAX - T_ROOT) * smooth(0.0, 0.16, t)
    th *= (1 - 0.15 * smooth(0.3, 0.6, t)) * (1 - 0.7 * smooth(0.82, 1.0, t))
    edge = 0.25 + 0.75 * smooth(0.0, 0.15, s)  # thin at the forehead hairline, round once it hangs
    return th * (edge + (1 - edge) * smooth(0.2, 0.4, t))


def plan_locks(n_cols, rng):
    """Splits the lines into locks of 4 to 7 lines (5 at both ends, beside the face; the last one takes up a short
    remainder): [(first, last)], neighbours share their boundary line."""
    locks, c = [], 0
    while c < n_cols - 1:
        w = 5 if c == 0 or c >= n_cols - 8 else int(rng.integers(4, 8))
        last = min(c + w, n_cols - 1)
        if n_cols - 1 - last < 3:
            last = n_cols - 1
        locks.append((c, last)); c = last
    return locks


def build_mass(body, nc=38, n1=11, n2=30, seed=3):
    """The hair object (one mesh of closed locks, rest pose) and each lock's centre line [(point, share of length)]."""
    rng = np.random.default_rng(seed)
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())  # whole: a hole would fool the depth limits
    skull = Skull(bvh)
    n_cols = 2 * nc - 1  # from the front of the parting on her left, round the back, to the front on her right
    locks = plan_locks(n_cols, rng)
    def across(c, c0, c1):
        """0 at a lock's edges, 1 in its middle: the lock's rounded section."""
        return max(0.0, math.sin(math.pi * (c - c0) / (c1 - c0))) ** 0.6

    profile, owner = [0.0] * n_cols, [0] * n_cols
    for k, (c0, c1) in enumerate(locks):
        for c in range(c0, c1 + 1):
            profile[c], owner[c] = across(c, c0, c1), k
    jitter = rng.uniform(-0.03, 0.03, len(locks))
    phases = [0.22 * k + rng.uniform(-0.35, 0.35) for k in range(len(locks))]  # neighbouring locks wave nearly together

    def side_of(c):
        return (c / (nc - 1), 1) if c <= nc - 1 else ((n_cols - 1 - c) / (nc - 1), -1)

    front = [sum(hang_azimuth(side_of(c)[0]) for c in range(c0, c1 + 1)) / (c1 - c0 + 1) < FRONT_UNTIL for c0, c1 in locks]

    def column(c, k):
        """Line c as lock k shapes it: a boundary line is shared by two locks that may wave or fall apart."""
        s, sign = side_of(c)
        notch = 0.04 * (1 - profile[c]) + jitter[owner[c]] * (1 - 0.5 * (1 - profile[c]))  # pointed tip ends
        return Column(s, sign, skull, bvh, n1, n2, notch, phases[k], front[k])

    bulge = rng.uniform(0.9, 1.25, len(locks))
    sway = rng.uniform(-1, 1, len(locks))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    centres, rows = [], n1 + n2
    for k, (c0, c1) in enumerate(locks):
        outer, inner, tv = [], [], []
        for c in range(c0, c1 + 1):
            col = column(c, k)
            h = across(c, c0, c1)
            groove = FRONT_GROOVE if front[k] else GROOVE
            o_pts = []
            for r in range(rows):
                th = thickness(col.t[r], col.s) * col.room[r] * (1 - groove * (1 - h)) * (1 + (bulge[k] - 1) * h)
                if front[k]:
                    th *= 1 + (FRONT_FULL - 1) * smooth(0.25, 0.45, col.t[r])
                o_pts.append(col.inner[r] + col.normal[r] * th)
            outer.append(o_pts); inner.append([p.copy() for p in col.inner]); tv.append(col.t)
        centres.append(_gather_tips(outer, inner, tv, sway[k]))
        _add_lock(bm, uv, outer, inner, tv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Elfe_Cheveux")
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new("Elfe_Cheveux", me)
    bpy.context.scene.collection.objects.link(o)
    return o, centres


def _gather_tips(outer, inner, tv, sway):
    """Towards its end a lock's lines gather on its centre line (soft points) and sway a little; returns that line."""
    mid, line = len(outer) // 2, []
    for r in range(len(outer[0])):
        cen_o = sum((col[r] for col in outer), Vector()) / len(outer)
        cen_i = sum((col[r] for col in inner), Vector()) / len(inner)
        t = tv[mid][r]
        pull = 0.35 * smooth(0.78, 1.0, t)
        side = outer[-1][r] - outer[0][r]
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        shift = side * (0.006 * sway * smooth(0.5, 1.0, t))
        for col in outer:
            col[r] = col[r].lerp(cen_o, pull) + shift
        for col in inner:
            col[r] = col[r].lerp(cen_i, pull) + shift
        line.append((cen_o + shift, t))
    return line


def _add_lock(bm, uv, outer, inner, tv):
    """A closed volume: outer and inner surfaces, side walls, root and tip ends; sharp edges round the outer surface.
    UVs: u across the lock, v along it (1 at the root)."""
    w, rows = len(outer), len(outer[0])
    O = [[bm.verts.new(p) for p in col] for col in outer]
    I = [[bm.verts.new(p) for p in col] for col in inner]
    us = [i / (w - 1) for i in range(w)]

    def face(vs, uvs):
        f = bm.faces.new(vs)
        for loop, (uu, vv) in zip(f.loops, uvs):
            loop[uv].uv = (uu, vv)

    for i in range(w - 1):
        for r in range(rows - 1):
            a, b, c, d = 1 - tv[i][r], 1 - tv[i][r + 1], 1 - tv[i + 1][r], 1 - tv[i + 1][r + 1]
            face((O[i][r], O[i + 1][r], O[i + 1][r + 1], O[i][r + 1]), ((us[i], a), (us[i + 1], c), (us[i + 1], d), (us[i], b)))
            face((I[i][r], I[i][r + 1], I[i + 1][r + 1], I[i + 1][r]), ((us[i], a), (us[i], b), (us[i + 1], d), (us[i + 1], c)))
        root, tip = (O[i][0], I[i][0], I[i + 1][0], O[i + 1][0]), (O[i + 1][-1], I[i + 1][-1], I[i][-1], O[i][-1])
        face(root, ((us[i], 1 - tv[i][0]),) * 2 + ((us[i + 1], 1 - tv[i + 1][0]),) * 2)  # ends, wound like the surfaces
        face(tip, ((us[i + 1], 1 - tv[i + 1][-1]),) * 2 + ((us[i], 1 - tv[i][-1]),) * 2)
    for r in range(rows - 1):  # side walls
        a, b = 1 - tv[0][r], 1 - tv[0][r + 1]
        face((O[0][r], O[0][r + 1], I[0][r + 1], I[0][r]), ((0.0, a), (0.0, b), (0.0, b), (0.0, a)))
        a, b = 1 - tv[-1][r], 1 - tv[-1][r + 1]
        face((O[-1][r + 1], O[-1][r], I[-1][r], I[-1][r + 1]), ((1.0, b), (1.0, a), (1.0, a), (1.0, b)))
    outline = [(col[r], col[r + 1]) for col in (O[0], O[-1]) for r in range(rows - 1)]
    outline += [(O[i][r], O[i + 1][r]) for r in (0, rows - 1) for i in range(w - 1)]
    for pair in outline:
        bm.edges.get(pair).smooth = False


def paint_texture():
    """RGBA (rows bottom-up, Blender's order) of the lock texture: strands along the lock, darker in the grooves between
    locks (u at 0 and 1) and at the roots (v at 1), a soft sheen near the top. Low contrast and wide: no fine line that
    would twinkle from the game camera."""
    w, h = TEXTURE_SIZE
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = u / w, v / h
    t = 1 - v  # 0 at the root, 1 at the tip
    drift = 0.012 * np.sin(t * np.pi * 3 + 1.3)
    lines = (0.5 * np.sin(2 * np.pi * (u + drift) * 11 + 0.7) + 0.3 * np.sin(2 * np.pi * (u + 1.7 * drift) * 19 + 2.1)
             + 0.2 * np.sin(2 * np.pi * (u - drift) * 5 + 4.0))
    edge = np.sin(np.pi * u) ** 0.5
    value = (1 + 0.10 * lines) * (0.76 + 0.24 * edge) * (0.80 + 0.20 * np.clip(t / 0.12, 0, 1))
    value *= 1 + 0.16 * np.exp(-((t - 0.22) / 0.07) ** 2) * (0.5 + 0.5 * edge)
    value *= 1 + 0.10 * np.clip((t - 0.8) / 0.2, 0, 1)
    col = np.clip(np.array(HAIR_GREY_GREEN)[None, None] * value[..., None], 0, 1)
    return np.concatenate([col, np.ones((h, w, 1), dtype=np.float32)], axis=2)


def hair_material(image):
    """Opaque and one-sided (the locks are closed volumes): exported as glTF alphaMode OPAQUE, doubleSided false."""
    m = bpy.data.materials.new("MI_Elfe_Cheveux")
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    m.use_backface_culling = True
    return m


def vine_lines(centres):
    """Three vines laid along back locks, wrapping them loosely: tube lines [(point, radius)] and leaf spots
    [(point, direction)]."""
    strands, tips = [], []
    for j, f in enumerate((0.30, 0.52, 0.70)):
        line = [(p, t) for p, t in centres[int(len(centres) * f)] if 0.10 <= t <= 0.86]
        strand = []
        for k, (p, _) in enumerate(line):
            out = Vector((p.x - HEAD_C.x, p.y - HEAD_C.y, 0.4 * (p.z - HEAD_C.z))).normalized()
            side = out.cross(Vector((0, 0, 1))).normalized()
            strand.append((p + out * 0.004 + side * 0.008 * math.sin(k * 0.9 + j), 0.0026 * (1 - 0.45 * k / len(line))))
        strands.append(strand)
        for k in (len(strand) // 3, 2 * len(strand) // 3):
            tips.append((strand[k][0], strand[k + 1][0] - strand[k][0] + Vector((0, 0, 0.02))))
    return strands, tips


def skin_on_head_and_back(o, body, arm, share=lambda z: smooth(1.42, 1.60, z)):
    """Head bone near the scalp; lower, the weights of the nearest body point of the neck, back or collarbones (never an
    arm: the hair must not swing with the shoulders)."""
    allowed = {"Head", "neck_01", "spine_01", "spine_02", "spine_03", "pelvis", "clavicle_l", "clavicle_r"}
    names = [g.name for g in body.vertex_groups]
    pts = []
    for v in body.data.vertices:
        ws = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-4}
        tot = sum(ws.values())
        if tot > 0 and sum(w for n, w in ws.items() if n in allowed) / tot > 0.95:
            pts.append((v.co.copy(), {n: w / tot for n, w in ws.items() if n in allowed}))
    kd = kdtree.KDTree(len(pts))
    for i, (p, _) in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    groups = {}
    for v in o.data.vertices:
        t = share(v.co.z)
        weights = {n: w * (1 - t) for n, w in pts[kd.find(v.co)[1]][1].items()}
        weights["Head"] = weights.get("Head", 0.0) + t
        for n, w in weights.items():
            if w < 1e-4:
                continue
            if n not in groups:
                groups[n] = o.vertex_groups.new(name=n)
            groups[n].add([v.index], w, "REPLACE")
    o.parent = arm
    o.modifiers.new("Armature", "ARMATURE").object = arm
