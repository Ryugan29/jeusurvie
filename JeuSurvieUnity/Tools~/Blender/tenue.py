# The elf's outfit fitted on her skin (decision-2026-11-02-tenue-souple-et-lianes): a belt riding on the pelvis, skirt
# leaves tucked under it that hang and follow her thighs, leaves lying over the shoulders, vines that touch the skin all along
# (their volume kept, their ends tucked in), skinned so nothing slides when the rig moves. The leaves' free motion (wind,
# rain, her movements) is Unity Cloth's job in the game: here they get their rest shape, and their UV v (along the leaf,
# by length) tells the game how free each point is: tied above ATTACHED_V, free at the tip (1). Used by build_elfe.py.
import math
import bmesh, bpy
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

import ecorce

DOWN = Vector((0.0, 0.0, -1.0))
MAX_INFLUENCES = 4  # bones per vertex in a glTF skin
ATTACHED_V = 0.15  # the top of a leaf (UV v) that is tied and never moves: same value as LeafCloth.AttachedV in the game
BELT_Z, BELT_RADIUS = 0.962, 0.012
BELT_BACK_RISE = 0.06  # the belt rises at the back, over the small of it: in her relaxed stance her buttocks rise
TUCKED_M = (0.004, 0.007)  # how far off the skin the two rows of skirt leaves pass under the belt (inner, outer)
FOLLOW_FROM_V = ATTACHED_V + 0.2  # below the belt a skirt leaf follows the skin under it fully from there down


def _smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def on_skin(anatomy, p, lift):
    """p moved onto the skin nearest to it, then `lift` metres out along the skin's normal."""
    q, n, _, _ = anatomy.tree.find_nearest(p)
    return q + n * lift


def _smooth_line(points, rounds=2):
    return [Vector(p) for p in ecorce.chaikin(np.array([tuple(p) for p in points], np.float64), rounds)]


# --- Belt, necklace, calf vines: tubes lying on the skin (centre one radius out, pressed in a little)
def belt_z(theta):
    """Height of the belt `theta` degrees round from the front: low on the hips, rising smoothly at the back, like a
    belt worn on the hips (in the game her relaxed stance lifts her buttocks over a level belt)."""
    back = ((1 - math.cos(math.radians(theta))) / 2) ** 2
    return BELT_Z + BELT_BACK_RISE * back


def belt_line(anatomy, count=48, radius=BELT_RADIUS):
    """Closed ring around the hips, resting on the skirt leaves tucked under it: each point is cast from the torso's axis
    onto the skin, then lifted by the radius and the two layers of leaves."""
    ring = [on_skin(anatomy, anatomy.torso(360 * k / count, belt_z(360 * k / count), 1), radius + TUCKED_M[-1] + 0.002)
            for k in range(count)]
    return [(p, radius) for p in ring + ring[:1]]


def necklace(anatomy, z=1.50, count=36, radius=0.0035, seed_radius=0.011):
    """A vine choker on the neck and three seeds resting on the top of the chest, each hung from the choker by a strand
    that lies on the skin. Returns the choker, the strands (lists of (point, radius)) and the seeds' centres."""
    ring = [on_skin(anatomy, anatomy.torso(360 * k / count, z, 1), radius * 0.85) for k in range(count)]
    seeds = [on_skin(anatomy, anatomy.torso(theta, height, 1), seed_radius) for theta, height in ((0, 1.392), (15, 1.408), (-15, 1.408))]
    strands = []
    for s in seeds:
        top = min(ring, key=lambda p: (p - s).length)
        line = [on_skin(anatomy, top.lerp(s, k / 8), 0.0025 * 0.85) for k in range(8)] + [s + Vector((0, 0, seed_radius * 1.2))]
        strands.append([(p, 0.0025) for p in _smooth_line(line, 1)])
    return [(p, radius) for p in ring + ring[:1]], strands, seeds


def calf_vine(anatomy, side, z0=0.13, z1=0.44, turns=3.0, radius=0.0055, phase=0.0):
    """A vine wound round the calf, between the ankle and below the knee: a smooth spiral touching the skin all along
    (its centre one radius out, pressed in a little), thinning at both ends where it tucks into the skin."""
    steps = 72  # 24 points per turn, rounded once: smooth without a heavy tube
    line = [anatomy.leg(z0 + (z1 - z0) * k / steps, (360 * (turns * k / steps + phase)) % 360, side) for k in range(steps + 1)]
    line = _smooth_line(line, 1)
    out = []
    for k, p in enumerate(line):
        t = k / (len(line) - 1)
        end = min(1.0, t / 0.07, (1 - t) / 0.07) ** 0.5
        r = radius * (0.3 + 0.7 * end)
        out.append((on_skin(anatomy, p, r * (0.85 * end + 0.3 * (1 - end))), r))  # the ends sink in a little more
    return out


# --- Leaves: strips of 2 vertices per row, hanging from the belt or lying over the shoulders
def hang(anatomy, base, out, length, rows=5, clearance=0.007, gravity=0.45):
    """Rows of a leaf hanging from `base`: it starts down and a little outwards, keeps clear of the skin (it drapes over
    the hips instead of passing through them) and bends towards the vertical under its own weight."""
    d = (DOWN + out * 0.25).normalized()
    pts, step = [base], length / (rows - 1)
    for k in range(1, rows):
        p = pts[-1] + d * step
        q, n, _, _ = anatomy.tree.find_nearest(p)
        need = clearance * (1 + 0.6 * k / (rows - 1))
        gap = (p - q).dot(n)
        if gap < need:
            p = p + n * (need - gap)
        p = pts[-1] + (p - pts[-1]).normalized() * step  # the leaf keeps its length
        d = ((p - pts[-1]).normalized() * (1 - gravity) + DOWN * gravity).normalized()
        pts.append(p)
    return pts


def lay(anatomy, base, along, length, rows=5, clearance=0.005):
    """Rows of a leaf lying on the skin from `base` towards `along` (over the shoulder and down the arm)."""
    pts, step = [base], length / (rows - 1)
    for k in range(1, rows):
        n = anatomy.normal_at(pts[-1])
        d = (along - n * along.dot(n)).normalized()
        p = on_skin(anatomy, pts[-1] + d * step, clearance * (1 + 0.5 * k / (rows - 1)))
        pts.append(pts[-1] + (p - pts[-1]).normalized() * step)
    return pts


def strips_object(name, material, leaves):
    """One mesh of leaf strips: each leaf is (rows, outward direction, width, roll); UV u across, v from the top (0) to the
    tip (1) by length along the leaf. Each leaf's rows share their points (one piece for the cloth)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for rows, out, width, roll in leaves:
        along = [0.0]
        for a, b in zip(rows, rows[1:]):
            along.append(along[-1] + (b - a).length)
        pairs = []
        for k, p in enumerate(rows):
            d = (rows[min(k + 1, len(rows) - 1)] - rows[max(k - 1, 0)]).normalized()
            side = d.cross(out).normalized()
            side = (side * math.cos(roll) + d.cross(side) * math.sin(roll)).normalized()
            pairs.append((bm.verts.new(p - side * width / 2), bm.verts.new(p + side * width / 2), along[k] / along[-1]))
        for (a0, b0, v0), (a1, b1, v1) in zip(pairs, pairs[1:]):
            f = bm.faces.new((a0, b0, b1, a1))
            f.smooth = True  # a leaf bends smoothly when the cloth moves it
            for loop, co in zip(f.loops, ((0, v0), (1, v0), (1, v1), (0, v1))):
                loop[uv].uv = co
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def skirt_leaves(anatomy, rng):
    """Two overlapping rows of leaves tucked under the belt: each starts on the skin a little above it (their tops show over
    the belt), passes under it against the skin and hangs over the hips; the outer row starts higher and is shorter, so
    the inner row's tips show under it."""
    leaves = []
    for above, tucked, count, size, phase in ((0.018, TUCKED_M[0], 30, 0.24, 0.0), (0.03, TUCKED_M[1], 30, 0.20, 0.5)):
        for k in range(count):
            theta = 360 * (k + phase) / count
            z = belt_z(theta)
            top = on_skin(anatomy, anatomy.torso(theta, z + above, 1), tucked)
            knot = on_skin(anatomy, anatomy.torso(theta, z, 1), tucked)  # under the belt, held against the skin
            out = anatomy.normal_at(knot)
            out = Vector((out.x, out.y, 0)).normalized()
            length = size * rng.uniform(0.9, 1.1) + (z - BELT_Z)  # longer where the belt rises: the hem stays level
            leaves.append(([top] + hang(anatomy, knot, out, length, clearance=tucked + 0.003), out, length * 0.42, rng.uniform(-0.25, 0.25)))
    return leaves


def shoulder_leaves(anatomy, rng):
    """A fan of six leaves on each shoulder, lying over the top of the shoulder and down the outer arm (they follow the arm
    when it hangs), each a little above the previous one."""
    leaves = []
    for side in (1, -1):
        for k in range(6):
            base = on_skin(anatomy, anatomy.arm(0.115, 30 + 24 * k, side), 0.004)
            length = rng.uniform(0.15, 0.19)
            rows = lay(anatomy, base, Vector((side, 0, 0)), length, clearance=0.005 + 0.0015 * k)
            leaves.append((rows, anatomy.normal_at(base), length * 0.5, rng.uniform(-0.15, 0.15)))
    return leaves


# --- Skin weights from the body triangle under each point (blended corners), so pieces follow the skin exactly
class SurfaceWeights:
    def __init__(self, body):
        self.bm = bmesh.new(); self.bm.from_mesh(body.data)
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces[:])
        self.bm.faces.ensure_lookup_table()
        self.tree = BVHTree.FromBMesh(self.bm)
        self.groups = [[(g.group, g.weight) for g in v.groups] for v in body.data.vertices]
        self.names = [g.name for g in body.vertex_groups]

    def free(self):
        self.bm.free()

    def at(self, p):
        """{bone name: weight} on the skin nearest to p."""
        loc, _, fi, _ = self.tree.find_nearest(p)
        verts = self.bm.faces[fi].verts
        acc = {}
        for share, v in zip(poly_3d_calc([v.co for v in verts], loc), verts):
            for g, w in self.groups[v.index]:
                acc[self.names[g]] = acc.get(self.names[g], 0.0) + share * w
        return acc


def _top(acc):
    best = sorted(acc.items(), key=lambda kv: -kv[1])[:MAX_INFLUENCES]
    total = sum(w for _, w in best) or 1.0
    return [(name, w / total) for name, w in best if w / total > 1e-3]


def _skin(o, arm, weights_of):
    """Skins `o` to the rig with `weights_of(vertex)` ({bone name: weight}, at most MAX_INFLUENCES kept)."""
    groups = {}
    for v in o.data.vertices:
        for name, w in _top(weights_of(v)):
            if name not in groups:
                groups[name] = o.vertex_groups.new(name=name)
            groups[name].add([v.index], w, "REPLACE")
    o.parent = arm
    o.modifiers.new("Armature", "ARMATURE").object = arm


def skin_on_surface(o, arm, weights):
    """Skins `o` to the rig like the skin under it (vines, choker, shoulder leaves)."""
    _skin(o, arm, lambda v: weights.at(v.co))


def skin_rigid(o, arm, bone="pelvis"):
    """Skins `o` wholly to one bone: the belt rides on the pelvis and does not stretch when the thighs move."""
    _skin(o, arm, lambda v: {bone: 1.0})


def skin_skirt(o, arm, weights):
    """Skins the skirt leaves: their held top follows her waist like the belt (the skin under it, thighs left out); below
    the belt each point comes to follow fully the skin under it (by FOLLOW_FROM_V), so a thigh moving forward carries the
    leaves on it instead of coming through them. The cloth adds the swing, kept from sinking behind that place."""
    uv = o.data.uv_layers[0].data
    v_of = {loop.vertex_index: uv[loop.index].uv.y for loop in o.data.loops}

    def weights_of(v):
        skin = weights.at(v.co)
        waist = {k: w for k, w in skin.items() if not k.startswith("thigh")}
        total = sum(waist.values())
        waist = {k: w / total for k, w in waist.items()} if total > 0 else {"pelvis": 1.0}
        share = _smoothstep(ATTACHED_V, FOLLOW_FROM_V, v_of.get(v.index, 0.0))
        return {k: waist.get(k, 0.0) * (1 - share) + skin.get(k, 0.0) * share for k in set(waist) | set(skin)}
    _skin(o, arm, weights_of)


def paint_contact(body, strands, reach=0.012):
    """Body attribute ElfeContact: 1 where a vine, the belt or a strand presses on the skin, fading over `reach` metres
    (the shader shades it a little, so they sit in the skin instead of floating above it)."""
    pts, radii = [], []
    for line in strands:
        for (a, ra), (b, rb) in zip(line, line[1:]):
            steps = max(1, int((b - a).length / 0.004))
            for k in range(steps):
                pts.append(a.lerp(b, k / steps)); radii.append(ra + (rb - ra) * k / steps)
    tree = kdtree.KDTree(len(pts))
    for i, p in enumerate(pts):
        tree.insert(p, i)
    tree.balance()
    layer = body.data.attributes.new("ElfeContact", "FLOAT", "POINT")
    for i, v in enumerate(body.data.vertices):
        gap = min(((co - v.co).length - radii[j] for co, j, _ in tree.find_n(v.co, 4)), default=1.0)
        layer.data[i].value = 1 - _smoothstep(0.0, reach, gap)
