# Builds the nature elf from the original heroine (Blender 5.2, headless).
# Usage: blender -b --factory-startup -P build_elfe.py -- <heroine.gltf> <output dir>
# Design: Second cerveau/1 - Projets/jeu-survie/ds-personnage-elfe-nature.md
# Everything added stays skinned to the original skeleton (same 65 bones) so the retargeted animations keep working.
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, noise

sys.path.append(os.path.dirname(os.path.abspath(__file__)))  # appended: inspect.py next to it must not hide the stdlib's
import ecorce  # the bark grown in the skin (zones along the muscles) and the bark images
import previews  # the review renders
import tenue  # the outfit fitted on the skin (belt, leaves, vines) and its skin weights

SRC, OUT_DIR = sys.argv[sys.argv.index("--") + 1:][:2]
OUT_DIR = previews.OUT_DIR = os.path.abspath(OUT_DIR)  # Blender reads relative image paths against the .blend
os.makedirs(OUT_DIR, exist_ok=True)
random.seed(7)

# --- Palette (stylised, matches the forest decor)
SKIN_MAUVE = (0.78, 0.52, 0.90, 1)  # lavender: clearly violet, still lighter than the bark so both read
BARK_DARK, BARK_MID, BARK_LIGHT = (0.025, 0.014, 0.008, 1), (0.085, 0.050, 0.028, 1), (0.19, 0.115, 0.060, 1)
LEAF_GREEN, LEAF_YOUNG = (0.07, 0.20, 0.03, 1), (0.25, 0.45, 0.07, 1)
HAIR_GREY_GREEN = (0.22, 0.30, 0.24, 1)
BROW_GREY_GREEN = (0.30, 0.40, 0.31, 1)  # a shade lighter than the hair so the long brows read against it
GLOW = (0.70, 1.00, 0.20, 1)
# By day the veins are paint, not light: a vivid yellow-green a little deeper than GLOW, so they read on the lavender skin
# and on the bark without looking lit; at night the game's glow map lights the same lines up.
VEIN_DAY, VEIN_DAY_STRENGTH, VEIN_DAY_WIDTH = (0.50, 0.80, 0.12, 1), 0.85, 0.036
LEATHER, VINE, SEED = (0.075, 0.045, 0.025, 1), (0.14, 0.18, 0.07, 1), (0.92, 0.96, 0.55, 1)
DAY_GLOW = 0.3  # emission strength by day in Blender previews and in the export; the game drives the night glow itself


def import_heroine():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(o)  # importer's bone display shape, not part of the model
    arm = bpy.data.objects["Armature"]
    for o in bpy.data.objects:  # the 5.2 importer keeps the weights but no deform link: without it the export loses the skin
        if o.type == "MESH" and not any(m.type == "ARMATURE" for m in o.modifiers):
            o.modifiers.new("Armature", "ARMATURE").object = arm
    return arm, bpy.data.objects["Superhero_Female"]


def skin_to_head(o, arm):
    """Rigidly binds a new mesh to the Head bone (follows the head, no new bones)."""
    o.parent = arm
    g = o.vertex_groups.new(name="Head")
    g.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    o.modifiers.new("Armature", "ARMATURE").object = arm


# --- Ears: stretch the outer rim of the existing ears into long elf points (keeps the original Head weights)
def make_pointed_ears(body):
    x0, x1, z0, z1 = 0.070, 0.089, 1.605, 1.690
    tip = Vector((0.050, 0.055, 0.075))  # outward, backward (+y), upward
    for v in body.data.vertices:
        p = v.co
        if not (z0 <= p.z <= z1 and -0.02 <= p.y <= 0.075 and abs(p.x) > x0):
            continue
        w = min(1.0, (abs(p.x) - x0) / (x1 - x0)) * min(1.0, max(0.0, (p.z - z0) / (z1 - z0 - 0.02)))
        w = w ** 1.6
        v.co = p + Vector((math.copysign(tip.x, p.x), tip.y, tip.z)) * w


def bump(x, centre, half_width):
    """1 at centre, smoothly 0 at centre +- half_width."""
    return 1 - smooth(0.0, half_width, abs(x - centre))


def front_fade(y, limit):
    """1 in front of `limit` (more negative y), fading to 0 over ~1.5 cm behind it: no step in the surface."""
    return 1 - smooth(limit - 0.010, limit + 0.005, y)


# --- Head density: the base head has too few points for fine features. Subdivide the head once (x4 faces), then
# the face once more (x4 again); new points inherit skin weights and UVs, so animations and textures keep working.
def densify_head(body):
    me = body.data
    bm = bmesh.new(); bm.from_mesh(me)

    def region(e, z_min, y_max, x_max):
        return all(v.co.z > z_min and v.co.y < y_max and abs(v.co.x) < x_max for v in e.verts)

    head = [e for e in bm.edges if region(e, 1.50, 0.20, 0.13)]
    bmesh.ops.subdivide_edges(bm, edges=head, cuts=1, use_grid_fill=True, smooth=0.5)
    bm.edges.ensure_lookup_table()
    face = [e for e in bm.edges if region(e, 1.545, -0.02, 0.075)]
    bmesh.ops.subdivide_edges(bm, edges=face, cuts=1, use_grid_fill=True, smooth=0.5)
    bm.to_mesh(me); bm.free()
    print("ELFE head densified:", len(me.vertices), "vertices")


# --- Face: small sculpt moves for a finer, more feminine face (the weights stay those of the original vertices)
def refine_face(body):
    for v in body.data.vertices:
        p = v.co.copy()
        if p.y > 0.03 or abs(p.x) > 0.072 or not 1.54 < p.z < 1.70:
            continue
        ax, sx = abs(p.x), math.copysign(1.0, p.x)
        jaw = bump(p.z, 1.578, 0.035) * smooth(0.012, 0.035, ax)  # slimmer jaw towards a soft V
        p.x -= sx * ax * 0.13 * jaw
        chin = bump(p.z, 1.562, 0.014) * (1 - smooth(0.010, 0.026, ax)) * front_fade(p.y, -0.05)  # a slightly longer, finer chin
        p.z -= 0.0035 * chin; p.y -= 0.0015 * chin
        nose = bump(p.z, 1.622, 0.024) * (1 - smooth(0.008, 0.022, ax)) * front_fade(p.y, -0.09)  # narrower nose
        p.x -= sx * ax * 0.24 * nose
        mouth = bump(p.z, 1.586, 0.014) * (1 - smooth(0.015, 0.032, ax)) * front_fade(p.y, -0.075)  # smaller mouth
        p.x -= sx * ax * 0.05 * mouth
        cheek = bump(p.z, 1.632, 0.016) * bump(ax, 0.046, 0.016) * front_fade(p.y, -0.04)  # higher, rounder cheekbones
        p.y -= 0.0025 * cheek; p.x += sx * 0.0015 * cheek
        v.co = p


# Fine sculpt strokes on the front of the face: (centre x, centre z, radius x, radius z, only in front of y), move (x, y, z).
# x is mirrored on both sides; a positive x move goes outward. Each stroke fades out like a soft sculpting brush.
FACE_STROKES = (
    ((0.031, 1.664, 0.016, 0.006, -0.06), (0.0, 0.0, 0.0015)),     # upper lids lifted: a more open eye
    ((0.047, 1.657, 0.007, 0.006, -0.05), (0.0010, 0.0, 0.0022)),  # outer corners lifted: almond, elven tilt
    ((0.015, 1.655, 0.005, 0.005, -0.06), (0.0, 0.0, -0.0008)),    # inner corners slightly lower
    ((0.031, 1.648, 0.014, 0.004, -0.06), (0.0, 0.0, -0.0008)),    # lower lids
    ((0.030, 1.681, 0.025, 0.008, -0.07), (0.0, 0.0015, 0.0010)),  # softer, higher brow ridge
    ((0.000, 1.597, 0.020, 0.006, -0.09), (0.0, 0.0025, 0.0)),     # upper lip less pouty
    ((0.000, 1.578, 0.018, 0.005, -0.08), (0.0, 0.0015, 0.0)),     # lower lip less pouty
    ((0.018, 1.588, 0.006, 0.005, -0.07), (0.0, 0.0, 0.0008)),     # mouth corners lifted: a hint of a smile
    # --- fine strokes, only readable once the head is densified
    ((0.031, 1.6695, 0.016, 0.0025, -0.06), (0.0, 0.0012, 0.0)),   # eyelid crease: a fold above the lash line
    ((0.008, 1.655, 0.006, 0.012, -0.08), (-0.0012, 0.0, 0.0)),    # pinched nose bridge
    ((0.000, 1.612, 0.006, 0.005, -0.10), (0.0, -0.0008, 0.0006)), # small rounded nose tip
    ((0.012, 1.609, 0.004, 0.004, -0.09), (0.0, 0.0012, 0.0)),     # nostril wings defined
    ((0.000, 1.600, 0.003, 0.006, -0.09), (0.0, 0.0008, 0.0)),     # philtrum dip
    ((0.000, 1.5872, 0.018, 0.0015, -0.08), (0.0, 0.0020, 0.0)),   # the line between the lips
    ((0.000, 1.565, 0.010, 0.008, -0.07), (0.0, -0.0010, 0.0)),    # rounder chin ball
    ((0.060, 1.665, 0.010, 0.015, -0.03), (-0.0015, 0.0, 0.0)),    # temples slightly hollowed
    ((0.080, 1.645, 0.006, 0.010, 0.10), (-0.0020, 0.0, 0.0)),     # ear bowl (concha) dipped
)


def recompute_shading(body):
    """After moving vertices, the imported (custom) normals still describe the old shape: dark patches appear.
    Weld the copies made at texture seams, drop the stale normals and let Blender recompute smooth ones."""
    bm = bmesh.new(); bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(body.data); bm.free()
    with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body]):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for poly in body.data.polygons:
        poly.use_smooth = True
    print("ELFE normals recomputed, custom normals left:", body.data.has_custom_normals)


def sculpt_face(body):
    for v in body.data.vertices:
        p = v.co.copy()  # every stroke reads the original position, so strokes do not drag each other
        for (cx, cz, rx, rz, front), (mx, my, mz) in FACE_STROKES:
            w = math.exp(-(((abs(p.x) - cx) / rx) ** 2 + ((p.z - cz) / rz) ** 2)) * front_fade(p.y, front)
            v.co = v.co + Vector((math.copysign(mx, p.x), my, mz)) * w


# --- Curves (antlers, eyebrows): polylines with a radius per point, converted to a mesh
def tube_mesh(name, strands, bevel_res=1):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps = "3D", 1.0, bevel_res, True
    for pts in strands:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, (p, r) in enumerate(pts):
            sp.points[i].co, sp.points[i].radius = (*p, 1.0), r
    tmp = bpy.data.objects.new(name + "_courbe", cu)
    bpy.context.scene.collection.objects.link(tmp)
    # no bpy.ops.object.convert: it would also convert (and strip the skin of) every other selected object
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def branch(start, direction, length, radius, depth, out_strands, out_tips):
    steps, pts, p, d = 6, [], Vector(start), direction.normalized()
    for i in range(steps + 1):
        t = i / steps
        pts.append((p.copy(), radius * (1 - 0.75 * t)))
        if i < steps:
            bend = noise.noise_vector(p * 9 + Vector((depth, 0, 0))) * 0.2
            d = (d + bend + Vector((0, 0, 0.18))).normalized()  # beams curve upward as they grow
            p = p + d * (length / steps)
            if depth > 0 and i in (2, 4):
                side = d.cross(Vector((0, 1, 0)) if random.random() < 0.5 else Vector((0, -1, 0))).normalized()
                sub = (d + side * random.uniform(0.7, 1.1) + Vector((0, 0, 0.3))).normalized()
                branch(p, sub, length * random.uniform(0.40, 0.55), radius * (1 - 0.75 * t) * 0.8, depth - 1, out_strands, out_tips)
    out_strands.append(pts)
    out_tips.append((p, d))


def keep_only_eyelashes(obj, brow_min_z=1.668):
    """The base 'Eyebrows' mesh also holds the eyelashes/lid lines: delete the brow pieces only, darken the lashes."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    seen, doomed = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        stack, island = [f], []
        while stack:  # one connected piece of the mesh
            g = stack.pop()
            if g in seen:
                continue
            seen.add(g); island.append(g)
            stack.extend(h for e in g.edges for h in e.link_faces if h not in seen)
        verts = {v for g in island for v in g.verts}
        if sum(v.co.z for v in verts) / len(verts) > brow_min_z:
            doomed.extend(verts)
    bmesh.ops.delete(bm, geom=list(set(doomed)), context="VERTS")
    bm.to_mesh(obj.data); bm.free()
    obj.name = obj.data.name = "Elfe_Cils"
    obj.data.materials.clear()
    obj.data.materials.append(flat_material("MI_Elfe_Cils", (0.05, 0.03, 0.07, 1)))


# --- Eyebrows: longer than human brows, they just pass the temple and end in a small vine curl with a leaf
def flat_material(name, colour, gradient_to=None):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value, bsdf.inputs["Roughness"].default_value = colour, 0.8
    if gradient_to:
        tex, ramp = nt.nodes.new("ShaderNodeTexNoise"), nt.nodes.new("ShaderNodeValToRGB")
        tex.inputs["Scale"].default_value = 40
        ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = colour, gradient_to
        nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m


class Nodes:
    """Small helper to wire shader math without repeating node boilerplate."""

    def __init__(self, nt):
        self.nt = nt

    def link(self, val, sock):
        if isinstance(val, (int, float, tuple)):
            sock.default_value = val
        else:
            self.nt.links.new(val, sock)

    def attr(self, name, out="Fac"):
        n = self.nt.nodes.new("ShaderNodeAttribute"); n.attribute_name = name
        return n.outputs[out]

    def mix(self, a, b, fac, blend="MIX"):
        n = self.nt.nodes.new("ShaderNodeMix"); n.data_type, n.blend_type = "RGBA", blend
        for sock, val in ((n.inputs["Factor"], fac), (n.inputs[6], a), (n.inputs[7], b)):
            self.link(val, sock)
        return n.outputs[2]

    def mix_value(self, a, b, fac):
        n = self.nt.nodes.new("ShaderNodeMix"); n.data_type = "FLOAT"
        for sock, val in ((n.inputs["Factor"], fac), (n.inputs[2], a), (n.inputs[3], b)):
            self.link(val, sock)
        return n.outputs[0]

    def math(self, op, a, b=0.0, c=0.0):
        n = self.nt.nodes.new("ShaderNodeMath"); n.operation = op
        for sock, val in zip(n.inputs, (a, b, c)):
            self.link(val, sock)
        return n.outputs[0]

    def remap(self, value, lo, hi):
        n = self.nt.nodes.new("ShaderNodeMapRange")
        n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = lo, hi
        self.link(value, n.inputs["Value"])
        return n.outputs["Result"]

    def voronoi(self, vec, scale, feature="DISTANCE_TO_EDGE", out="Distance"):
        n = self.nt.nodes.new("ShaderNodeTexVoronoi"); n.feature = feature
        n.inputs["Scale"].default_value = scale
        self.link(vec, n.inputs["Vector"])
        return n.outputs[out]

    def noise(self, vec, scale, detail=2.0, distortion=0.0):
        n = self.nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value, n.inputs["Detail"].default_value = scale, detail
        n.inputs["Distortion"].default_value = distortion
        self.link(vec, n.inputs["Vector"])
        return n.outputs["Fac"]

    def warped(self, vec, scale, amount):
        n = self.nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale
        self.link(vec, n.inputs["Vector"])
        v = self.nt.nodes.new("ShaderNodeVectorMath"); v.operation = "MULTIPLY_ADD"
        v.inputs[1].default_value = (amount,) * 3
        self.link(n.outputs["Color"], v.inputs[0]); self.link(vec, v.inputs[2])
        return v.outputs[0]

    def vscale(self, vec, factors):
        v = self.nt.nodes.new("ShaderNodeVectorMath"); v.operation = "MULTIPLY"
        v.inputs[1].default_value = factors
        self.link(vec, v.inputs[0])
        return v.outputs[0]

    def xyz(self, vec):
        sep = self.nt.nodes.new("ShaderNodeSeparateXYZ"); self.link(vec, sep.inputs[0])
        return sep.outputs

    def diamond(self, rest, cz, half_w, half_h):
        """1 inside a vertical diamond on the body's front mid-line at height cz (the glowing glyphs)."""
        p = self.xyz(rest)
        dx = self.math("DIVIDE", self.math("ABSOLUTE", p["X"]), half_w)
        dz = self.math("DIVIDE", self.math("ABSOLUTE", self.math("SUBTRACT", p["Z"], cz)), half_h)
        inside = self.remap(self.math("ADD", dx, dz), 1.0, 0.85)
        return self.math("MULTIPLY", inside, self.math("LESS_THAN", p["Y"], -0.03))

    def ellipse(self, rest, cx, cz, rx, rz, softness=2.2):
        """Soft 0..1 spot on the face around (+-cx, cz), mirrored left/right, front of the head only (make-up zones)."""
        p = self.xyz(rest)
        dx = self.math("DIVIDE", self.math("SUBTRACT", self.math("ABSOLUTE", p["X"]), cx), rx)
        dz = self.math("DIVIDE", self.math("SUBTRACT", p["Z"], cz), rz)
        d = self.math("ADD", self.math("POWER", dx, 2.0), self.math("POWER", dz, 2.0))
        spot = self.remap(d, softness, 0.0); spot.node.interpolation_type = "SMOOTHSTEP"  # no hard edge
        return self.math("MULTIPLY", spot, self.math("LESS_THAN", p["Y"], -0.05))

    def ramp(self, fac, stops):
        """Colour ramp from [(position, colour), ...]."""
        r = self.nt.nodes.new("ShaderNodeValToRGB")
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0]
        els[1].position, els[1].color = stops[-1]
        for pos, col in stops[1:-1]:
            e = els.new(pos); e.color = col
        self.link(fac, r.inputs["Fac"])
        return r.outputs["Color"]


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def blob(p, cx, cz, rx, rz, front=True):
    """Soft spot on the body surface around (+-cx, cz), on the front (or the back) only."""
    on_side = p.y < -0.03 if front else p.y > 0.0
    return math.exp(-(((abs(p.x) - cx) / rx) ** 2 + ((p.z - cz) / rz) ** 2)) * on_side


def body_masks(p):
    """Per-vertex zones for a rest-pose position (T-pose, front = -y): glow, freckles, cheek cracks (the bark has its
    own zones: ecorce.py)."""
    ax = abs(p.x)
    forearm = smooth(0.42, 0.45, ax) * (1 - smooth(0.58, 0.61, ax)) * smooth(0.2, 0.4, noise.noise(p * 30))
    cracks = blob(p, 0.050, 1.630, 0.011, 0.014)  # just on the cheekbones
    glow = max(blob(p, 0, 1.43, 0.05, 0.06), blob(p, 0, 1.715, 0.025, 0.03), blob(p, 0, 1.45, 0.06, 0.07, front=False),
               forearm * 0.8)
    freckles = max(blob(p, 0.032, 1.640, 0.022, 0.015), blob(p, 0, 1.648, 0.012, 0.012))
    return glow, freckles, cracks


def paint_body_masks(body):
    me = body.data
    layers = [me.attributes.new(n, "FLOAT", "POINT") for n in ("ElfeLueur", "ElfeTaches", "ElfeFissures")]
    rest = me.attributes.new("ElfeRepos", "FLOAT_VECTOR", "POINT")
    for i, v in enumerate(me.vertices):
        for layer, value in zip(layers, body_masks(v.co)):
            layer.data[i].value = value
        rest.data[i].vector = v.co


# --- Bark: long vertical plates (stretched Voronoi) split by dark furrows, with fibre noise.
def bark_nodes(nt, coords, scale=16):
    """Returns (colour, furrow 0..1 (1 = inside a crack), fibre 0..1)."""
    n = Nodes(nt)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.6, 1.6, 0.30)  # long narrow plates, stretched vertically like bark
    n.link(coords, mapping.inputs["Vector"])
    vec = mapping.outputs["Vector"]
    furrow = n.remap(n.voronoi(n.warped(vec, scale * 0.4, 0.5 / scale), scale), 0.10, 0.04)  # crisp dark cracks
    fibre = n.noise(vec, scale * 3, detail=6)
    plate = n.ramp(fibre, [(0.35, BARK_MID), (0.65, BARK_LIGHT)])
    return n.mix(plate, BARK_DARK, furrow), furrow, fibre


def bark_material(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    coords = nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    colour, furrow, fibre = bark_nodes(nt, coords, scale=55)
    n = Nodes(nt)
    bsdf = nt.nodes["Principled BSDF"]
    n.link(colour, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.6; bump.inputs["Distance"].default_value = 0.003
    n.link(n.math("MULTIPLY_ADD", furrow, -1.0, n.math("MULTIPLY", fibre, 0.25)), bump.inputs["Height"])
    n.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def skin_tone(n, src):
    """Lavender skin: keeps the base texture's shading (eye sockets, nostrils, muscles) but replaces its hue."""
    bw = n.nt.nodes.new("ShaderNodeRGBToBW"); n.link(src, bw.inputs[0])
    lum = bw.outputs[0]
    underwear = n.remap(lum, 0.30, 0.18)  # paints out the base model's dark underwear
    lum = n.math("MULTIPLY_ADD", n.math("SUBTRACT", 0.62, lum), underwear, lum)
    grey = n.nt.nodes.new("ShaderNodeCombineColor")
    for c in ("Red", "Green", "Blue"):
        n.link(n.math("MULTIPLY", lum, 1.35), grey.inputs[c])
    return n.mix(SKIN_MAUVE, grey.outputs[0], 1.0, blend="MULTIPLY")


# Face make-up zones, painted in this order: (centre x, centre z, radius x, radius z), colour, strength, softness.
# Softness 2.2 = blended like powder, 1.3 = a crisp line. Strong enough to read at play distance.
FACE_PAINT = (
    ((0.058, 1.606, 0.012, 0.010), (0.36, 0.18, 0.44, 1), 0.25, 2.2),  # hollow under the cheekbones (kept off the nose)
    ((0.045, 1.624, 0.019, 0.012), (0.92, 0.42, 0.66, 1), 0.35, 2.2),  # blush
    ((0.033, 1.670, 0.024, 0.010), (0.40, 0.16, 0.52, 1), 0.55, 2.2),  # violet shadow in the crease (opens the eye)
    ((0.000, 1.584, 0.022, 0.014), (0.34, 0.08, 0.28, 1), 0.95, 1.8),  # deep rose-plum lips
)


def face_paint(n, skin, rest):
    """Gives the face life with clearly visible make-up (front of the head only)."""
    for (cx, cz, rx, rz), colour, amount, softness in FACE_PAINT:
        skin = n.mix(skin, colour, n.math("MULTIPLY", n.ellipse(rest, cx, cz, rx, rz, softness), amount))
    return skin


def body_factors(n, rest, bark_images):
    """Masks shared by colour, relief and roughness: the bark grown in the skin (where it has become bark, the skin turning
    around it, fine fissures running on from the furrows), cheek cracks, freckles, lips, bark pattern."""
    amount, bark_colour, furrow = ecorce.skin_bark_nodes(n, *bark_images)
    flecks = n.math("MULTIPLY_ADD", n.noise(rest, 45, detail=3), 0.4, amount)  # a torn edge and a few islets around it
    bark = n.remap(n.math("SUBTRACT", flecks, 0.2), 0.28, 0.4)  # from the second stratum of the relief inwards
    turning = n.math("MULTIPLY", n.remap(amount, 0.0, 0.28), n.math("SUBTRACT", 1.0, bark))
    fissure = n.math("MULTIPLY", turning, n.remap(furrow, 0.70, 0.90))
    crack = n.math("MULTIPLY", n.remap(n.voronoi(n.warped(rest, 60, 0.004), 110), 0.010, 0.0), n.attr("ElfeFissures"))
    keep = n.math("GREATER_THAN", n.voronoi(rest, 420, "F1", "Color"), 0.55)  # only some cells get a freckle
    freckle = n.math("MULTIPLY", n.math("MULTIPLY", n.remap(n.voronoi(rest, 420, "F1"), 0.32, 0.18), keep), n.attr("ElfeTaches"))
    return dict(bark=bark, turning=turning, fissure=fissure, crack=crack, freckle=freckle, contact=n.attr("ElfeContact"),
                lips=n.ellipse(rest, 0.0, 1.584, 0.022, 0.014, 1.8), bark_colour=bark_colour, furrow=furrow)


def skin_colour(n, src, rest, f, glow):
    """Lavender skin with a painted face, freckles and fine cheek cracks; where it turns into bark it greys and darkens and
    the furrows run on into it as fine fissures, then it becomes bark; shaded where a vine or the belt presses on it; last,
    the veins and glyphs painted in vivid yellow-green so they read by day too (the game's night glow then lights the same
    lines up). Nothing is painted under the skirt: its leaves move, so the skin shows between them."""
    skin = face_paint(n, skin_tone(n, src), rest)
    skin = n.mix(skin, (0.46, 0.28, 0.38, 1), n.math("MULTIPLY", f["freckle"], 0.6))
    skin = n.mix(skin, (0.22, 0.13, 0.07, 1), f["crack"])
    skin = n.mix(skin, (0.13, 0.09, 0.09, 1), n.math("MULTIPLY", f["turning"], 0.75))  # skin ~(0.3, 0.2, 0.35): duller, darker
    skin = n.mix(skin, (0.08, 0.05, 0.04, 1), n.math("MULTIPLY", f["fissure"], 0.85))
    skin = n.mix(skin, f["bark_colour"], f["bark"])
    skin = n.mix(skin, (0.07, 0.05, 0.05, 1), n.math("MULTIPLY", f["contact"], 0.45))
    return n.mix(skin, VEIN_DAY, n.math("MULTIPLY", glow, VEIN_DAY_STRENGTH))


def glow_mask(n, rest, f, width=0.024):
    """Where the inner light shows: thin organic veins in the glow zones, cheek cracks, diamond glyphs (forehead, sternum)."""
    veins = n.math("MULTIPLY", n.remap(n.voronoi(n.warped(rest, 25, 0.012), 45), width, 0.0), n.attr("ElfeLueur"))
    cheek = n.math("MULTIPLY", f["crack"], 0.5)
    glyphs = n.math("MAXIMUM", n.diamond(rest, 1.715, 0.006, 0.014), n.diamond(rest, 1.43, 0.010, 0.022))
    return n.math("MINIMUM", n.math("MAXIMUM", n.math("MAXIMUM", veins, cheek), glyphs), 1.0)


def relief_height(n, rest, f):
    """Height field for the normal map (the bark's big relief is real geometry): skin grain, fine furrows and fibres of
    the bark (in the bark image), the fissures in the turning skin, cheek cracks, lip lines."""
    grain = n.math("MULTIPLY", n.noise(rest, 350, detail=2), 0.06)
    lip_lines = n.math("MULTIPLY", f["lips"], n.math("MULTIPLY", n.noise(n.vscale(rest, (60, 1, 6)), 8), 0.25))
    bark = n.math("MULTIPLY_ADD", f["bark"], n.math("MULTIPLY", f["furrow"], -1.0), n.math("MULTIPLY", f["fissure"], -0.5))
    crack = n.math("MULTIPLY", f["crack"], -0.15)
    return n.math("ADD", n.math("ADD", grain, lip_lines), n.math("ADD", bark, crack))


def roughness_value(n, f, glow):
    """Skin satin, lips a bit glossy, bark rough and its cracks rougher still, glowing veins glossy."""
    r = n.math("ADD", 0.55, 0.0)
    r = n.mix_value(r, 0.38, f["lips"])
    r = n.mix_value(r, 0.88, f["bark"])
    r = n.mix_value(r, 0.97, n.math("MULTIPLY", f["bark"], f["furrow"]))
    r = n.mix_value(r, 0.80, n.math("MULTIPLY", f["turning"], 0.6))
    return n.mix_value(r, 0.40, glow)


def body_material(body, bark_images):
    nt = body.data.materials[0].node_tree
    n = Nodes(nt)
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_socket
    rest = n.attr("ElfeRepos", "Vector")
    f = body_factors(n, rest, bark_images)
    glow = glow_mask(n, rest, f)
    day_lines = glow_mask(n, rest, f, width=VEIN_DAY_WIDTH)  # a bit wider than the light: still readable from the game camera
    n.link(skin_colour(n, src, rest, f, day_lines), bsdf.inputs["Base Color"])
    n.link(roughness_value(n, f, glow), bsdf.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.0025
    n.link(relief_height(n, rest, f), bump.inputs["Height"])
    n.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    n.link(n.mix((0, 0, 0, 1), GLOW, glow), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = DAY_GLOW
    return bsdf


# --- Bake: the procedural body becomes images the game can read (colour, roughness, relief, where it glows at night)
def _select_only(body):
    bpy.context.view_layer.objects.active = body
    for o in bpy.context.view_layer.objects:
        o.select_set(o == body)


def _bake_target(nt, image_name, size, colour):
    img = bpy.data.images.new(image_name, size, size, alpha=False)
    if not colour:
        img.colorspace_settings.name = "Non-Color"
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    nt.nodes.active = tex
    return img, tex


def _save(img):
    img.filepath_raw, img.file_format = os.path.join(OUT_DIR, img.name + ".png"), "PNG"
    img.save()


def bake_socket(body, socket, image_name, size, colour=True):
    """Bakes whatever feeds `socket` into a PNG through a temporary emission shader (no lighting baked in)."""
    nt = body.data.materials[0].node_tree
    out = next(x for x in nt.nodes if x.type == "OUTPUT_MATERIAL")
    previous = out.inputs["Surface"].links[0].from_socket
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(socket.links[0].from_socket, emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    img, tex = _bake_target(nt, image_name, size, colour)
    _select_only(body)
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)
    _save(img)
    nt.links.new(previous, out.inputs["Surface"])
    nt.nodes.remove(emit); nt.nodes.remove(tex)
    return img


def bake_normal(body, image_name, size):
    """Bakes the material's bump into a tangent-space normal map (what the game's shader reads)."""
    nt = body.data.materials[0].node_tree
    img, tex = _bake_target(nt, image_name, size, colour=False)
    _select_only(body)
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=8, use_clear=True)
    _save(img)
    nt.nodes.remove(tex)
    return img


def bake_body(body, bsdf, size=2048):
    sc = bpy.context.scene
    engine = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples, sc.cycles.device = 1, "CPU"
    maps = dict(
        colour=bake_socket(body, bsdf.inputs["Base Color"], "T_Elfe_Corps_BaseColor", size),
        emission=bake_socket(body, bsdf.inputs["Emission Color"], "T_Elfe_Corps_Emission", size),
        roughness=bake_socket(body, bsdf.inputs["Roughness"], "T_Elfe_Corps_Roughness", size, colour=False),
        normal=bake_normal(body, "T_Elfe_Corps_Normal", size),
    )
    sc.render.engine = engine
    return maps


def use_baked_body(body, maps):
    """Swaps the procedural network for the baked images: previews and the glTF export then match what the game gets."""
    nt = body.data.materials[0].node_tree
    for x in [x for x in nt.nodes if x.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nt.nodes.remove(x)
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")

    def image(img):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        return t.outputs["Color"]

    nt.links.new(image(maps["colour"]), bsdf.inputs["Base Color"])
    nt.links.new(image(maps["roughness"]), bsdf.inputs["Roughness"])
    nt.links.new(image(maps["emission"]), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = DAY_GLOW
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(image(maps["normal"]), nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


# --- Eyes: painted iris (fibres, limbal ring, pupil, highlight) on the base model's eye layout (iris centred)
def paint_eye_images(size=1024):
    import numpy as np
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = x / size - 0.5, y / size - 0.5
    r = np.sqrt(u * u + v * v)
    ang = np.arctan2(v, u)
    iris_r, pupil_r = 0.105, 0.036
    rng = np.random.default_rng(3)
    fibres = 0.5 + 0.5 * np.sin(ang * 70 + rng.uniform(0, 6.28)) * np.sin(ang * 23 + 1.3)
    t = np.clip((r - pupil_r) / (iris_r - pupil_r), 0, 1)
    inner = np.array([0.80, 0.95, 0.30]); outer = np.array([0.18, 0.42, 0.10])
    iris = inner[None, None] * (1 - t[..., None]) + outer[None, None] * t[..., None]
    iris *= (0.75 + 0.5 * fibres)[..., None]
    limbal = np.clip((r - iris_r * 0.82) / (iris_r * 0.18), 0, 1)[..., None]
    iris = iris * (1 - 0.8 * limbal) + np.array([0.06, 0.12, 0.04])[None, None] * 0.8 * limbal
    sclera = np.array([0.96, 0.93, 0.95])[None, None] * (1 - 0.25 * np.clip((r - 0.25) / 0.25, 0, 1))[..., None]
    veins = np.clip(np.sin(ang * 9 + r * 60) * np.sin(ang * 4 - r * 30), 0, 1) * np.clip((r - 0.16) / 0.2, 0, 1)
    sclera = sclera * (1 - 0.18 * veins[..., None]) + np.array([0.75, 0.35, 0.45])[None, None] * 0.18 * veins[..., None]
    img = np.where((r < iris_r)[..., None], iris, sclera)
    img = np.where((r < pupil_r)[..., None], np.array([0.02, 0.02, 0.03])[None, None], img)
    hl = np.exp(-(((u + 0.035) / 0.018) ** 2 + ((v - 0.035) / 0.018) ** 2))
    img = img * (1 - hl[..., None]) + hl[..., None]
    glow = np.where((r < iris_r) & (r > pupil_r), 1.0, 0.0) * (0.35 + 0.65 * fibres)
    rgba = np.concatenate([np.clip(img, 0, 1), np.ones((size, size, 1))], axis=2).astype(np.float32)
    base = bpy.data.images.new("T_Elfe_Yeux", size, size); base.pixels.foreach_set(rgba.ravel()); _save(base)
    e = np.concatenate([np.array(GLOW[:3])[None, None] * glow[..., None], np.ones((size, size, 1))], axis=2).astype(np.float32)
    emis = bpy.data.images.new("T_Elfe_Yeux_Emission", size, size); emis.pixels.foreach_set(e.ravel()); _save(emis)
    return base, emis


def eye_material():
    m = bpy.data.objects["Eyes"].data.materials[0]
    m.name = "MI_Elfe_Yeux"
    nt = m.node_tree
    base, emis = paint_eye_images()
    tex = next(x for x in nt.nodes if x.type == "TEX_IMAGE")
    tex.image = base
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.18
    et = nt.nodes.new("ShaderNodeTexImage"); et.image = emis
    nt.links.new(et.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = DAY_GLOW


def tint_hair_and_eyes():
    hair = bpy.data.objects["Hair_Long"].data.materials[0]
    bsdf = next(n for n in hair.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_socket
    bw = hair.node_tree.nodes.new("ShaderNodeRGBToBW")  # keep the strand shading, replace the colour
    hair.node_tree.links.new(src, bw.inputs[0])
    mul = hair.node_tree.nodes.new("ShaderNodeMix"); mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
    mul.inputs["Factor"].default_value, mul.inputs[7].default_value = 1.0, HAIR_GREY_GREEN
    hair.node_tree.links.new(bw.outputs[0], mul.inputs[6])
    hair.node_tree.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    hair.name = "MI_Elfe_Cheveux"
    eye_material()


# ====================================================================================================================
# Chantiers C and D: painted textures (leaf, hair, seed), leaf cards, outfit, long hair, LODs and the glTF export.
# ====================================================================================================================
import numpy as np
from mathutils import kdtree






def _new_image(name, w, h, rgba):
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    _save(img)
    return img


def paint_leaf_texture(size=256):
    """One leaf on a transparent card: serrated oval, midrib and side veins, young green at the tip."""
    v, u = np.mgrid[0:size, 0:size].astype(np.float32) / size
    half = 0.40 * np.sin(np.pi * v) ** 0.75 * (1 + 0.07 * np.sin(v * 45))
    inside = np.abs(u - 0.5) < np.maximum(half, 0.012 * (v < 0.15))
    g0, g1 = np.array(LEAF_GREEN[:3]), np.array(LEAF_YOUNG[:3])
    col = g0[None, None] * (1 - v[..., None]) + g1[None, None] * v[..., None]
    rng = np.random.default_rng(5)
    col *= (0.9 + 0.2 * rng.random((size, size)))[..., None]
    midrib = np.abs(u - 0.5) < 0.012
    veins = (np.sin((v - 0.35 * np.abs(u - 0.5)) * 48) > 0.92) & (np.abs(u - 0.5) > 0.03)
    col = np.where((midrib | veins)[..., None], col * 0.62, col)
    rgba = np.concatenate([np.clip(col, 0, 1), inside[..., None].astype(np.float32)], axis=2)
    return _new_image("T_Elfe_Feuille", size, size, rgba)


def paint_hair_texture(w=256, h=512):
    """Hair card: vertical strands, darker roots (top), jagged transparent tips (bottom)."""
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = u / w, v / h
    rng = np.random.default_rng(9)
    strands = 0.55 + 0.45 * np.sin(u * np.pi * 90 + rng.uniform(0, 6)) * np.sin(u * np.pi * 23 + 2.0)
    strands *= 0.85 + 0.3 * np.sin(u * np.pi * 7 + v * 3)
    tip = 0.05 + 0.25 * (0.5 + 0.5 * np.sin(u * np.pi * 37) * np.sin(u * np.pi * 11))
    alpha = (v > tip).astype(np.float32)
    base = np.array(HAIR_GREY_GREEN[:3])[None, None]
    col = base * (0.6 + 0.6 * strands)[..., None]
    col *= (1 - 0.3 * np.clip((v - 0.85) / 0.15, 0, 1))[..., None]  # darker roots
    col *= (1 + 0.25 * np.exp(-((v - 0.55) / 0.08) ** 2))[..., None]  # a soft highlight band
    return _new_image("T_Elfe_Cheveux", w, h, np.concatenate([np.clip(col, 0, 1), alpha[..., None]], axis=2))


def solid_image(name, colour, size=16):
    rgba = np.ones((size, size, 4), dtype=np.float32) * np.array(colour, dtype=np.float32)[None, None]
    return _new_image(name, size, size, rgba)


def card_material(name, image, tint=1.0, roughness=0.7):
    """Textured card with alpha cutout (the glTF exporter turns the Round node into alphaMode MASK) and double-sided."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    n = Nodes(nt)
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
    colour = tex.outputs["Color"] if tint == 1.0 else n.mix(tex.outputs["Color"], (tint, tint, tint, 1), 1.0, blend="MULTIPLY")
    n.link(colour, bsdf.inputs["Base Color"])
    n.link(n.math("ROUND", tex.outputs["Alpha"]), bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = roughness
    m.use_backface_culling = False
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "DITHERED"
    return m


# --- Leaf cards: 2 quads per leaf with a gentle curl, textured with the painted leaf
def leaf_card(bm, uv, base, direction, size, roll, width_ratio=0.45):
    d = direction.normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = (side if side.length > 1e-3 else Vector((1, 0, 0))).normalized()
    side = Matrix.Rotation(roll, 3, d) @ side
    normal = side.cross(d)
    w = size * width_ratio
    rows = []
    for t in (0.0, 0.5, 1.0):
        p = base + d * (size * t) + normal * (size * 0.12 * math.sin(math.pi * t))
        rows.append((bm.verts.new(p - side * w / 2), bm.verts.new(p + side * w / 2), t))
    for (a0, b0, t0), (a1, b1, t1) in zip(rows, rows[1:]):
        f = bm.faces.new((a0, b0, b1, a1))
        for loop, (uu, vv) in zip(f.loops, ((0, t0), (1, t0), (1, t1), (0, t1))):
            loop[uv].uv = (uu, vv)


def cards_object(name, material, builder):
    """Builds a card mesh: `builder(bm, uv)` adds the cards."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    builder(bm, uv)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def leaves_mesh(name, tips, material, per_tip=3, size=(0.035, 0.055)):
    def build(bm, uv):
        for p, d in tips:
            for _ in range(per_tip):
                jitter = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 1))) * 0.8
                leaf_card(bm, uv, p, d + jitter, random.uniform(*size), random.uniform(0, math.pi))
    return cards_object(name, material, build)


# --- Skinning: a new piece takes the weights of the nearest body vertex (it then follows the body in every animation);
# `head_share(co)` optionally gives part of the weight to the Head bone (hair roots).
def skin_like_body(o, body, arm, head_share=None):
    kd = kdtree.KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = [g.name for g in body.vertex_groups]
    groups = {}
    for v in o.data.vertices:
        _, idx, _ = kd.find(v.co)
        t = head_share(v.co) if head_share else 0.0
        weights = {names[g.group]: g.weight * (1 - t) for g in body.data.vertices[idx].groups}
        if t > 0:
            weights["Head"] = weights.get("Head", 0.0) + t
        for name, w in weights.items():
            if w < 1e-4:
                continue
            if name not in groups:
                groups[name] = o.vertex_groups.new(name=name)
            groups[name].add([v.index], w, "REPLACE")
    o.parent = arm
    o.modifiers.new("Armature", "ARMATURE").object = arm


# --- Outfit, fitted on the skin by tenue.py. Before the bake: what presses on the skin (belt, vine choker and its strands,
# seeds, calf vines), so the skin can be shaded where they touch. After it: the leaves (skirt, shoulders), which the game
# moves with Unity Cloth.
def make_vines(arm, anatomy, weights):
    """Returns the pieces and the lines that touch the skin."""
    leather = flat_material("MI_Elfe_Tenue_Cuir", LEATHER); leather.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.75
    vine = flat_material("MI_Elfe_Lianes", VINE)
    belt = tenue.belt_line(anatomy)
    choker, strands, seeds = tenue.necklace(anatomy)
    calves = [tenue.calf_vine(anatomy, s, phase=0.0 if s > 0 else 0.5) for s in (1, -1)]
    pieces = [tube_mesh("Elfe_Ceinture", [belt], bevel_res=2), tube_mesh("Elfe_Collier", [choker] + strands),
              tube_mesh("Elfe_Lianes_Jambes", calves)]
    for o, m in zip(pieces, (leather, vine, vine)):
        o.data.materials.append(m)

    bm = bmesh.new()
    for s in seeds:
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.011)
        bmesh.ops.scale(bm, vec=(1, 1, 1.4), verts=r["verts"])
        bmesh.ops.translate(bm, vec=s, verts=r["verts"])
    me = bpy.data.meshes.new("Elfe_Graines"); bm.to_mesh(me); bm.free()
    seeds_o = bpy.data.objects.new("Elfe_Graines", me); bpy.context.scene.collection.objects.link(seeds_o)
    seed_mat = flat_material("MI_Elfe_Graines", SEED)
    sb = seed_mat.node_tree.nodes["Principled BSDF"]
    et = seed_mat.node_tree.nodes.new("ShaderNodeTexImage"); et.image = solid_image("T_Elfe_Graine_Emission", GLOW)
    seed_mat.node_tree.links.new(et.outputs["Color"], sb.inputs["Emission Color"]); sb.inputs["Emission Strength"].default_value = DAY_GLOW
    sb.inputs["Roughness"].default_value = 0.3
    me.materials.append(seed_mat); pieces.append(seeds_o)

    tenue.skin_rigid(pieces[0], arm)  # the belt rides on the pelvis
    for o in pieces[1:]:
        tenue.skin_on_surface(o, arm, weights)
    return pieces, [belt, choker] + strands + calves


def make_outfit(arm, anatomy, weights, leaf_img):
    """The leaves of the outfit: two rows tucked under the belt (the skirt), riding on the pelvis at their top and following
    the thigh under them towards their tip; a fan over each shoulder, skinned like the skin under it."""
    skirt_mat = card_material("MI_Elfe_Tenue_Feuilles", leaf_img, tint=0.72)
    skirt = tenue.strips_object("Elfe_Jupe", skirt_mat, tenue.skirt_leaves(anatomy, random))
    tenue.skin_skirt(skirt, arm, weights)
    pads = tenue.strips_object("Elfe_Epaulettes", skirt_mat, tenue.shoulder_leaves(anatomy, random))
    tenue.skin_on_surface(pads, arm, weights)
    return [skirt, pads]


# --- Long hair: ribbons from the scalp down the back, plus a few vines with leaves running through them
def make_long_hair(arm, body, hair_img, leaf_img):
    c = Vector((0, 0.025, 1.665))
    vines, vine_tips = [], []

    def hair(bm, uv):
        for i in range(72):
            th = math.radians(random.uniform(8, 172))  # 90° = straight back; 0/180° = the sides
            root_z, L = 1.735 + random.uniform(-0.035, 0.01), random.uniform(0.36, 0.50)
            phase, w0 = random.uniform(0, 6.28), random.uniform(0.028, 0.042)
            back = max(0.0, math.sin(th))
            pts = []
            for k in range(8):
                t = k / 7
                r = 0.094 + 0.03 * math.sin(math.pi * t) - 0.02 * t
                p = Vector((math.cos(th) * r * (1 - 0.15 * t), c.y + math.sin(th) * r + 0.045 * t * back, root_z - L * t))
                p.x += 0.008 * math.sin(t * 7 + phase)
                pts.append(p)
            if i % 18 == 0:
                vines.append([(p + Vector((0, 0.012 * back, 0)), 0.0035 * (1 - 0.5 * k / 7)) for k, p in enumerate(pts)])
                vine_tips.extend((pts[k], pts[k + 1] - pts[k]) for k in (2, 5))
            rows = []
            for k, p in enumerate(pts):
                t = k / 7
                tangent = (pts[min(k + 1, 7)] - pts[max(k - 1, 0)]).normalized()
                radial = Vector((p.x - c.x, p.y - c.y, 0)).normalized()
                side = tangent.cross(radial).normalized()
                w = w0 * (1 - 0.35 * t)
                rows.append((bm.verts.new(p - side * w / 2), bm.verts.new(p + side * w / 2), 1 - t))
            for (a0, b0, v0), (a1, b1, v1) in zip(rows, rows[1:]):
                f = bm.faces.new((a0, b0, b1, a1))
                for loop, (uu, vv) in zip(f.loops, ((0, v0), (1, v0), (1, v1), (0, v1))):
                    loop[uv].uv = (uu, vv)

    cards = cards_object("Elfe_Cheveux_Longs", card_material("MI_Elfe_Cheveux", hair_img, roughness=0.5), hair)
    share = lambda co: smooth(1.42, 1.60, co.z)
    skin_like_body(cards, body, arm, head_share=share)
    vine_o = tube_mesh("Elfe_Cheveux_Lianes", vines)
    vine_o.data.materials.append(bpy.data.materials["MI_Elfe_Lianes"])
    skin_like_body(vine_o, body, arm, head_share=share)
    leaves = leaves_mesh("Elfe_Cheveux_Feuilles", vine_tips, bpy.data.materials["MI_Elfe_Feuilles"], per_tip=1, size=(0.03, 0.045))
    skin_like_body(leaves, body, arm, head_share=share)
    return cards


# --- Crown and eyebrows (leaf cards instead of solid leaves; thinner brows)
def make_crown(arm, leaf_img):
    strands, tips = [], []
    for s in (1, -1):  # antler-like: wide main beams sweeping out and back, a short brow tine in front
        branch(Vector((0.042 * s, 0.015, 1.735)), Vector((0.85 * s, 0.35, 0.55)), 0.30, 0.016, 2, strands, tips)
        branch(Vector((0.032 * s, -0.025, 1.745)), Vector((0.45 * s, -0.15, 0.85)), 0.13, 0.010, 1, strands, tips)
    crown = tube_mesh("Elfe_Couronne", strands)
    crown.data.materials.append(bark_material("MI_Elfe_Bois"))
    skin_to_head(crown, arm)
    along = [(pts[i][0], pts[i + 1][0] - pts[i][0]) for pts in strands for i in (3, 5) if len(pts) > 6]
    leaves = leaves_mesh("Elfe_Couronne_Feuilles", tips + along, card_material("MI_Elfe_Feuilles", leaf_img))
    skin_to_head(leaves, arm)
    return crown, leaves


def make_eyebrows(arm):
    strands, curl_tips = [], []
    base = [(0.010, -0.0955, 1.669), (0.030, -0.0960, 1.678), (0.052, -0.0910, 1.690), (0.072, -0.0860, 1.706),
            (0.088, -0.0840, 1.722), (0.100, -0.0810, 1.737)]
    last = len(base) - 1
    for s in (1, -1):
        for k, (dz, dy) in enumerate(((0, 0), (-0.004, 0.002), (0.003, 0.004), (-0.002, 0.005), (0.005, 0.001))):
            pts = [Vector((x * s, y + dy * (i / last), z + dz * (i / last))) for i, (x, y, z) in enumerate(base)]
            c, r0 = pts[-1] + Vector((0.003 * s, 0.009, 0.0)), 0.009 - k * 0.001
            for j in range(1, 13):  # spiral curl = the vine tendril, rolling down and back
                a = j / 12 * math.pi * 2.0
                r = r0 * (1 - j / 16)
                pts.append(c + Vector((0.004 * s * j / 12, -math.cos(a) * r, math.sin(a) * r)))
            n = len(pts)
            strands.append([(p, 0.0017 * (1 - 0.7 * i / (n - 1)) * (1 - 0.12 * k)) for i, p in enumerate(pts)])
        curl_tips.append((Vector(base[-1]) * Vector((s, 1, 1)) + Vector((0.006 * s, 0.012, 0.006)), Vector((0.5 * s, 0.4, 0.6))))
    brows = tube_mesh("Elfe_Sourcils", strands)
    brows.data.materials.append(flat_material("MI_Elfe_Sourcils", BROW_GREY_GREEN))
    skin_to_head(brows, arm)
    brow_leaves = leaves_mesh("Elfe_Sourcils_Feuilles", curl_tips, bpy.data.materials["MI_Elfe_Feuilles"], per_tip=1, size=(0.016, 0.020))
    skin_to_head(brow_leaves, arm)
    keep_only_eyelashes(bpy.data.objects["Eyebrows"])


# --- Bakes for the pieces whose look is procedural (the glTF export only carries images and plain colours)
def uv_bark_material(name, scale=55):
    """Bark pattern read through the UVs of the tube (u along the branch): identical on every strand, so it bakes cleanly."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    n = Nodes(nt)
    uv = nt.nodes.new("ShaderNodeTexCoord").outputs["UV"]
    colour, furrow, fibre = bark_nodes(nt, n.vscale(uv, (0.08, 1.0, 1.0)), scale=scale)
    bsdf = nt.nodes["Principled BSDF"]
    n.link(colour, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.6; bump.inputs["Distance"].default_value = 0.003
    n.link(n.math("MULTIPLY_ADD", furrow, -1.0, n.math("MULTIPLY", fibre, 0.25)), bump.inputs["Height"])
    n.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def bake_simple(obj, prefix, size, with_normal):
    """Bakes an object's single procedural material to colour (+ normal) images and rewires it on them."""
    sc = bpy.context.scene
    engine = sc.render.engine
    sc.render.engine = "CYCLES"; sc.cycles.samples, sc.cycles.device = 1, "CPU"
    nt = obj.data.materials[0].node_tree
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    rough = bsdf.inputs["Roughness"].default_value
    colour = bake_socket(obj, bsdf.inputs["Base Color"], prefix + "_BaseColor", size)
    normal = bake_normal(obj, prefix + "_Normal", size) if with_normal else None
    sc.render.engine = engine
    for x in [x for x in nt.nodes if x.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nt.nodes.remove(x)
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = colour
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap"); t2 = nt.nodes.new("ShaderNodeTexImage"); t2.image = normal
        nt.links.new(t2.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


def strip_extra_uvs(objects):
    """The base model carries 4 unused UV sets: the export keeps only the one its textures use."""
    for o in objects:
        layers = o.data.uv_layers
        keep = layers.active_render.name if layers.active_render else (layers[0].name if layers else None)
        for l in [l for l in layers if l.name != keep]:
            layers.remove(l)


# --- LODs: lighter copies of the heavy pieces; the game shows them further away (names end in _LOD1 / _LOD2)
def make_lods(objects, levels=((1, 0.45), (2, 0.18))):
    copies = []
    for o in objects:
        for level, ratio in levels:
            c = o.copy(); c.data = o.data.copy()
            c.name = c.data.name = f"{o.name}_LOD{level}"
            bpy.context.scene.collection.objects.link(c)
            dec = c.modifiers.new("LOD", "DECIMATE"); dec.ratio = ratio; dec.use_collapse_triangulate = True
            c.modifiers.move(len(c.modifiers) - 1, 0)  # decimate first, skin afterwards
            c.hide_render = True  # previews show LOD0 only
            copies.append(c)
    return copies


def export_gltf(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", export_texture_dir="", export_apply=True,
                              export_animations=False, export_skins=True, export_yup=True, export_image_format="AUTO",
                              export_cameras=False, export_lights=False, export_tangents=False, export_morph=False,
                              export_extras=False)
    print("ELFE exported", path)


def report(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objects:
        me = o.evaluated_get(dg).data
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        total += tris
        print(f"ELFE TRIS {o.name}: {tris}")
    print("ELFE TRIS total LOD0:", total)


def main():
    arm, body = import_heroine()
    make_pointed_ears(body)
    densify_head(body)
    lashes = bpy.data.objects["Eyebrows"]  # also holds the eyelashes: reshaped with the face so they stay on the lids
    for part in (body, lashes):
        refine_face(part)
        sculpt_face(part)
        recompute_shading(part)
    bark_colour, bark_height, height = ecorce.paint_bark(OUT_DIR)
    ecorce.grow_bark(body, arm, height)
    recompute_shading(body)
    anatomy, weights = ecorce.Anatomy(body, arm), tenue.SurfaceWeights(body)  # the final skin, for the outfit
    _, touching = make_vines(arm, anatomy, weights)
    paint_body_masks(body)
    tenue.paint_contact(body, touching)
    bsdf = body_material(body, (bark_colour, bark_height))
    use_baked_body(body, bake_body(body, bsdf))
    body.data.materials[0].name = "MI_Elfe_Corps"
    tint_hair_and_eyes()
    hair_cap = bpy.data.objects["Hair_Long"]
    hair_cap.data.materials[0].name = "MI_Elfe_Cheveux_Base"
    bake_simple(hair_cap, "T_Elfe_Cheveux_Base", 1024, with_normal=False)
    leaf_img, hair_img = paint_leaf_texture(), paint_hair_texture()
    crown, _ = make_crown(arm, leaf_img)
    crown.data.materials[0] = uv_bark_material("MI_Elfe_Bois")
    bake_simple(crown, "T_Elfe_Bois", 1024, with_normal=True)
    make_eyebrows(arm)
    make_outfit(arm, anatomy, weights, leaf_img)
    weights.free()
    make_long_hair(arm, body, hair_img, leaf_img)
    strip_extra_uvs([body, lashes, bpy.data.objects["Eyes"]])
    lod0 = [o for o in bpy.data.objects if o.type == "MESH"]
    report(lod0)
    make_lods([body, hair_cap, crown])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "elfe.blend"))
    export_gltf(os.path.join(OUT_DIR, "export", "heroine.gltf"))
    cam = previews.setup_scene()
    previews.lower_arms(arm)
    previews.render_previews(cam)
    previews.render_belly()
    previews.render_flex(arm)
    previews.render_outfit(arm)
    previews.go_night()
    previews.render_night(cam)


main()
