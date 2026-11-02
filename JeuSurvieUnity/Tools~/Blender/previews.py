# Preview renders of the nature elf, for review (build_elfe.py calls them after the export): body, face, belly close-ups,
# before/after sheets, the spine and elbows bent, night. The arms are lowered for the pictures only; the exported model
# stays in T-pose.
import math, os
import bpy
from mathutils import Matrix, Vector

OUT_DIR = None  # set by build_elfe.py before the first render


def lower_arms(arm, angle_deg=72):
    bpy.context.view_layer.update()
    for name, s in (("upperarm_l", 1), ("upperarm_r", -1)):
        pb, b = arm.pose.bones[name], arm.data.bones[name]
        rest = b.matrix_local.to_3x3()
        world_rot = Matrix.Rotation(math.radians(angle_deg) * s, 3, "Y")
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (rest.inverted() @ world_rot @ rest).to_quaternion()
    bpy.context.view_layer.update()


def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 700, 1000
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("Ciel"); sc.world = w
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.84, 0.76, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    for name, energy, rot in (("Soleil", 3.2, (50, 0, -35)), ("Contre", 2.0, (60, 0, 160))):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        l.data.energy, l.rotation_euler = energy, [math.radians(a) for a in rot]
        l.data.angle = math.radians(8)  # soft shadows: no jagged hair shadows on the face in the previews
        sc.collection.objects.link(l)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    sc.collection.objects.link(cam); sc.camera = cam
    return cam


def aim(cam, eye, target, lens):
    cam.location, cam.data.lens = eye, lens
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def compose(paths, out):
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in paths]
    w, h = imgs[0].size
    canvas = np.zeros((h, w * len(imgs), 4), dtype=np.float32)
    for i, im in enumerate(imgs):
        px = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(px)
        canvas[:, i * w:(i + 1) * w] = px.reshape(h, w, 4)
    res = bpy.data.images.new("planche", w * len(imgs), h, alpha=True)
    res.pixels.foreach_set(canvas.ravel()); res.filepath_raw, res.file_format = out, "PNG"; res.save()


def before_after(shot, before_name):
    """Puts a render next to the same shot of the previous version, when one was kept by hand (same framing and light)."""
    before = os.path.join(OUT_DIR, before_name)
    if os.path.exists(before):
        compose([before, shot], os.path.join(OUT_DIR, "planche-avant-apres-" + before_name[len("avant-"):]))


def render_previews(cam):
    views = (("face", (0, -3.2, 1.15)), ("profil", (3.2, 0.0, 1.15)), ("trois-quarts", (2.2, -2.3, 1.2)), ("dos", (0.2, 3.2, 1.2)))
    paths = []
    for name, eye in views:
        aim(cam, eye, (0, 0, 0.98), 50)
        paths.append(os.path.join(OUT_DIR, f"vue-{name}.png")); render(paths[-1])
        before_after(paths[-1], f"avant-corps-{name}.png")
    compose(paths, os.path.join(OUT_DIR, "planche-corps.png"))
    heads = []
    for name, eye, target, lens in (("tete-face", (0.15, -0.95, 1.72), (0, 0, 1.70), 60),
                                    ("tete-profil", (0.85, -0.55, 1.74), (0, 0, 1.70), 60),
                                    ("visage-poitrine", (0.05, -0.80, 1.58), (0, 0, 1.56), 70),
                                    ("portrait", (0.0, -0.50, 1.640), (0, 0, 1.628), 85),
                                    ("portrait-34", (0.30, -0.42, 1.645), (0, 0, 1.628), 85)):
        aim(cam, eye, target, lens)
        heads.append(os.path.join(OUT_DIR, f"vue-{name}.png")); render(heads[-1])
    compose(heads[:3], os.path.join(OUT_DIR, "planche-tete.png"))
    compose(heads[3:], os.path.join(OUT_DIR, "planche-portrait.png"))
    before_after(heads[0], "avant-visage.png")


def square_shots(shots):
    """Renders [(file name, eye, target)] at 900 x 900 with a 50 mm lens; returns the image paths."""
    sc = bpy.context.scene
    size = sc.render.resolution_x, sc.render.resolution_y
    sc.render.resolution_x = sc.render.resolution_y = 900
    paths = []
    for name, eye, target in shots:
        aim(cam=sc.camera, eye=eye, target=target, lens=50)
        paths.append(os.path.join(OUT_DIR, f"vue-{name}.png")); render(paths[-1])
    sc.render.resolution_x, sc.render.resolution_y = size
    return paths


def render_belly():
    """Close-ups of the torso's bark, each next to the same shot of the previous version (avant-<name>.png)."""
    views = (("ventre-face", (0.0, -0.95, 1.12)), ("ventre-34", (0.62, -0.72, 1.14)), ("ventre-dos", (-0.45, 0.85, 1.14)))
    for (name, _), shot in zip(views, square_shots([(name, eye, (0, 0, 1.12)) for name, eye in views])):
        before_after(shot, f"avant-{name}.png")
    square_shots([("ecorce-detail", (0.30, -0.42, 1.30), (0.08, -0.08, 1.27))])  # where the skin turns into bark


def turn_bones(arm, names, world):
    """Poses each bone by the same world rotation, applied in its rest frame (a chain of three turns three times as far)."""
    for name in names:
        pb, rest = arm.pose.bones[name], arm.data.bones[name].matrix_local.to_3x3()
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (rest.inverted() @ world @ rest).to_quaternion()
    bpy.context.view_layer.update()


def render_flex(arm):
    """The bark while she bends forward and turns her shoulders (3 spine bones x 15 = 45 degrees each), then with both
    elbows bent at 90 degrees: grown in the skin, it must stretch and fold with it, never float or cut through it."""
    spine, shots = ("spine_01", "spine_02", "spine_03"), []
    for name, world, eye in (("flexion", Matrix.Rotation(math.radians(15), 3, "X"), (1.0, -0.30, 1.10)),
                             ("rotation", Matrix.Rotation(math.radians(15), 3, "Z"), (0.55, -0.85, 1.15))):
        turn_bones(arm, spine, world)
        shots += square_shots([(name, eye, (0, -0.05, 1.10))])
    turn_bones(arm, spine, Matrix.Identity(3))
    for name, side in (("lowerarm_l", -1), ("lowerarm_r", 1)):  # forearms forward
        turn_bones(arm, [name], Matrix.Rotation(math.radians(90 * side), 3, "Z"))
    shots += square_shots([("coudes", (0.9, -0.9, 1.25), (0.1, -0.1, 1.15))])
    turn_bones(arm, ["lowerarm_l", "lowerarm_r"], Matrix.Identity(3))
    compose(shots, os.path.join(OUT_DIR, "planche-flexion.png"))


def stride(arm, amount=1.0):
    """A walking stride (left thigh forward 35 degrees, knee bent 45, right thigh back 20); amount 0 is the rest pose."""
    rot = lambda deg: Matrix.Rotation(math.radians(deg * amount), 3, "X")  # about X: negative = forward
    turn_bones(arm, ["thigh_l"], rot(-35)); turn_bones(arm, ["calf_l"], rot(45)); turn_bones(arm, ["thigh_r"], rot(20))


def knee_up(arm, amount=1.0):
    """A running stride at its peak: left knee raised high (thigh forward 70 degrees, knee bent 100), right thigh back 25."""
    rot = lambda deg: Matrix.Rotation(math.radians(deg * amount), 3, "X")
    turn_bones(arm, ["thigh_l"], rot(-70)); turn_bones(arm, ["calf_l"], rot(100)); turn_bones(arm, ["thigh_r"], rot(25))


def render_outfit(arm):
    """The outfit at rest, in a stride and with a knee raised high as she runs (without the game's cloth: the skinned shape
    the cloth starts from), and close-ups of where the vines, the choker and the belt hold to the skin, at rest and with the
    knee bent."""
    shots = square_shots([("ceinture", (0.55, -0.60, 0.98), (0, 0, 0.94))])
    stride(arm)
    shots += square_shots([("foulee-profil", (1.4, -0.1, 0.80), (0, 0, 0.75)), ("foulee-34", (0.9, -1.0, 0.85), (0, 0, 0.75))])
    stride(arm, 0)
    knee_up(arm)
    shots += square_shots([("course-face", (0.3, -1.4, 0.95), (0, 0, 0.8)), ("course-profil", (1.4, -0.2, 0.9), (0, 0, 0.8))])
    knee_up(arm, 0)
    compose(shots, os.path.join(OUT_DIR, "planche-tenue.png"))
    holds = square_shots([("collier", (0.12, -0.42, 1.46), (0, -0.04, 1.45)), ("liane-mollet", (0.40, -0.45, 0.30), (0.11, 0.03, 0.29))])
    stride(arm)
    holds += square_shots([("liane-mollet-plie", (0.45, -0.55, 0.38), (0.11, 0.05, 0.36))])
    stride(arm, 0)
    compose(holds, os.path.join(OUT_DIR, "planche-lianes.png"))


def go_night(glow_boost=5.0):
    """Moonlight scene; the glow mask is pushed up like the game's night glow (strong at night, soft by day)."""
    sc = bpy.context.scene
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.03, 0.06, 1)
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    for name, energy in (("Soleil", 0.25), ("Contre", 0.35)):
        light = bpy.data.objects[name].data
        light.energy, light.color = energy, (0.55, 0.65, 1.0)
    for o, mat_index in ((bpy.data.objects["Superhero_Female"], 0), (bpy.data.objects["Eyes"], 0)):
        nt = o.data.materials[mat_index].node_tree
        bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
        sock = bsdf.inputs["Emission Strength"]
        if sock.links:
            boost = nt.nodes.new("ShaderNodeMath"); boost.operation = "MULTIPLY"; boost.inputs[1].default_value = glow_boost
            nt.links.new(sock.links[0].from_socket, boost.inputs[0]); nt.links.new(boost.outputs[0], sock)
        else:
            sock.default_value *= glow_boost


def render_night(cam):
    shots = []
    for name, eye, target, lens in (("nuit-face", (0, -3.2, 1.15), (0, 0, 0.98), 50),
                                    ("nuit-dos", (0.2, 3.2, 1.2), (0, 0, 0.98), 50),
                                    ("nuit-visage", (0.05, -0.80, 1.58), (0, 0, 1.56), 70)):
        aim(cam, eye, target, lens)
        shots.append(os.path.join(OUT_DIR, f"vue-{name}.png")); render(shots[-1])
    compose(shots, os.path.join(OUT_DIR, "planche-nuit.png"))

