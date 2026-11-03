# Headless checks of the elf's hair in the model the game gets (Blender 5.2). Exit code 1 when a check fails.
# Usage: blender -b --factory-startup --python-exit-code 1 -P test_cheveux.py -- <elf export dir>
#   export dir: what build_elfe.py exported (sortie/export), or the game's copy (StreamingAssets/.../characters/heroine).
# The hair must read as natural hair (José, 2026-11-03): one opaque mass of rounded locks, no flat cards stacked on a cap,
# a round top with a thin parting, free and wavy at the back, a mass of hair in front, as long as before.
import json, os, sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

EXPORT = os.path.abspath(sys.argv[sys.argv.index("--") + 1:][0])
GLTF = os.path.join(EXPORT, "heroine.gltf")
FAILS = []


def check(ok, message):
    print(("PASS " if ok else "FAIL ") + message, flush=True)
    if not ok:
        FAILS.append(message)


def world_points(o):
    """Vertex positions in the rest pose, in world space (metres, z up, she faces -y)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = o.evaluated_get(dg).to_mesh()
    pts = np.array([tuple(o.matrix_world @ v.co) for v in me.vertices])
    o.evaluated_get(dg).to_mesh_clear()
    return pts


def parts(o):
    """Vertex index lists of the mesh's connected pieces: the importer splits each lock along its sharp outline, so a
    lock comes back as its outer surface and the rest of its volume."""
    parent = list(range(len(o.data.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for e in o.data.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    groups = {}
    for i in range(len(parent)):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def test_one_opaque_mass(doc):
    names = {n.get("name") for n in doc["nodes"]}
    check("Elfe_Cheveux" in names, "the hair is one sculpted mass (Elfe_Cheveux)")
    check(not names & {"Hair_Long", "Elfe_Cheveux_Longs"}, "no original hair cap, no flat ribbon cards")
    check({"Elfe_Cheveux_LOD1", "Elfe_Cheveux_LOD2"} <= names, "the hair has its lighter copies for distance (LOD1, LOD2)")
    hair = {m.get("name"): m for m in doc["materials"]}.get("MI_Elfe_Cheveux")
    if hair is None:
        check(False, "the hair material MI_Elfe_Cheveux is exported")
        return
    mode = hair.get("alphaMode", "OPAQUE")
    check(mode == "OPAQUE" and not hair.get("doubleSided", False),
          f"hair material opaque and one-sided: no cut-out edge to twinkle (alphaMode {mode})")


def test_locks_are_volumes(hair):
    """No edge bounds a single face: a flat card has its whole outline open. The glTF export splits points along UV seams
    and sharp edges, so the points it doubled are welded back first."""
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    bm.free()
    check(open_edges == 0, f"every lock is a closed volume, not a flat card ({open_edges} open edges)")


def test_length(pts):
    lowest = pts[:, 2].min()
    check(1.19 <= lowest <= 1.26, f"as long as before at the back: tips at {lowest:.3f} m (1.19 to 1.26)")
    front = pts[(pts[:, 1] < -0.05) & (pts[:, 2] < 1.45)]
    check(len(front) > 300, f"a mass of hair falls in front of the shoulders ({len(front)} points on the chest)")


def test_round_top(hair):
    """Across the parting the top of the hair stays round: both sides never rise above the middle (that read as an M).
    The parting itself is a thin line, so the middle is read just beside it, half a centimetre each way."""
    bvh = BVHTree.FromObject(hair, bpy.context.evaluated_depsgraph_get())
    to_local, worst = hair.matrix_world.inverted(), -1.0
    for y in (-0.04, -0.02, 0.0, 0.02, 0.04):
        top = {}
        for x in (-0.03, -0.02, -0.005, 0.005, 0.02, 0.03):
            hit = bvh.ray_cast(to_local @ Vector((x, y, 2.5)), to_local.to_3x3() @ Vector((0, 0, -1)))[0]
            top[x] = (hair.matrix_world @ hit).z if hit is not None else None
        if None in top.values():
            check(False, f"the top of the head is covered at y = {y}")
            return
        middle = (top[-0.005] + top[0.005]) / 2
        sides = min((top[-0.03] + top[-0.02]) / 2, (top[0.02] + top[0.03]) / 2)
        worst = max(worst, sides - middle)
    check(worst < 0.004, f"round top, a thin parting: both sides at most {worst * 1000:.1f} mm above the middle (< 4 mm)")


def test_free_back(pts):
    """Free hair spreads a little as it falls: it never gathers at the back as if tied."""
    back = pts[pts[:, 1] > 0.06]

    def width(z0, z1):
        band = back[(back[:, 2] > z0) & (back[:, 2] < z1)]
        return band[:, 0].max() - band[:, 0].min() if len(band) else 0.0

    high, low = width(1.52, 1.56), width(1.30, 1.34)
    check(high > 0 and low >= 0.95 * high,
          f"free at the back: {low * 100:.1f} cm wide low down, {high * 100:.1f} cm higher (no gathering)")


def test_wavy(hair, pts):
    """The long locks wave: their middle line swings from side to side along the fall."""
    swings = []
    for idx in parts(hair):
        p = pts[idx]
        if p[:, 2].min() > 1.35 or p[:, 1].mean() < 0.03:
            continue  # only the long locks down the back
        line = []
        for z in np.arange(p[:, 2].min() + 0.03, 1.55, 0.02):
            near = np.abs(p[:, 2] - z) < 0.01
            if near.any():
                line.append((z, p[near, 0].mean()))
        if len(line) < 6:
            continue
        z, x = np.array(line).T
        x = x - np.polyval(np.polyfit(z, x, 1), z)
        swings.append(x.max() - x.min())
    swing = float(np.median(swings)) if swings else 0.0
    check(len(swings) >= 10 and swing > 0.012,
          f"wavy: the long locks swing {swing * 100:.1f} cm from side to side (> 1.2 cm, over {len(swings)} pieces, 10 or more)")


def test_clear_of_body(body, pts):
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    to_local = body.matrix_world.inverted()
    hanging = pts[pts[:, 2] < 1.58]
    inside = 0
    for p in hanging:
        q = to_local @ Vector(p)
        hit, n, _, _ = bvh.find_nearest(q, 0.05)
        if hit is not None and abs((body.matrix_world @ hit).x) < 0.17 and (q - hit).dot(n) < -0.002:
            inside += 1  # arms (out sideways in the rest pose) aside
    share = inside / max(len(hanging), 1)
    check(share < 0.01, f"the hanging hair stays out of the neck, back and chest ({share:.1%} of its points inside, < 1%)")


def test_follows_head_and_back(hair, pts):
    """The scalp follows the head; lower down the hair follows the neck, back and collarbones, never an arm or a finger."""
    allowed = ("Head", "neck_", "spine_", "pelvis", "clavicle_")
    names = [g.name for g in hair.vertex_groups]
    stray = loose = stiff = 0
    for v, p in zip(hair.data.vertices, pts):
        w = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-3}
        stray += any(not n.startswith(allowed) for n in w)
        loose += p[2] > 1.62 and w.get("Head", 0.0) < 0.99
        stiff += p[2] < 1.40 and w.get("Head", 0.0) > 0.5
    check(stray == 0, f"the hair only follows the head, neck, back and collarbones ({stray} points on other bones)")
    check(loose == 0, f"on the head the hair follows the Head bone only ({loose} points not fully on it)")
    check(stiff == 0, f"down the back and chest it follows the body, not the head ({stiff} points mostly on the head)")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with open(GLTF, encoding="utf-8") as f:
        doc = json.load(f)
    test_one_opaque_mass(doc)
    bpy.ops.import_scene.gltf(filepath=GLTF)
    hair, body = bpy.data.objects.get("Elfe_Cheveux"), bpy.data.objects.get("Superhero_Female")
    if hair is None or body is None:
        check(False, "the export holds the hair (Elfe_Cheveux) and the body (Superhero_Female)")
    else:
        pts = world_points(hair)
        test_locks_are_volumes(hair)
        test_length(pts)
        test_round_top(hair)
        test_free_back(pts)
        test_wavy(hair, pts)
        test_clear_of_body(body, pts)
        test_follows_head_and_back(hair, pts)
    print(f"TEST_CHEVEUX {'OK' if not FAILS else 'FAILED: ' + '; '.join(FAILS)}", flush=True)
    if FAILS:
        sys.exit(1)


main()
