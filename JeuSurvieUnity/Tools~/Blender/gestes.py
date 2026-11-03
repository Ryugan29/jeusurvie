# Builds the harvest gestures on the hero skeleton (Blender 5.2, headless) and exports them alone: the skeleton and its
# clips, no mesh (the game adds the clips to the hero it already animates, so Idle/Walk/Run stay untouched).
# Usage: blender -b --factory-startup --python-exit-code 1 -P gestes.py -- <hero.gltf> <UAL1_Standard.glb> <out gestes.gltf> <previews dir>
# The game drives the clips' time itself (Runtime/Characters/HarvestGestures.cs): the impact key must sit at the moment
# Core/Config/HarvestData.cs gives each gesture (duration × impact fraction).
# Axes (Blender, armature space): the hero faces −Y, his right hand is on −X, up is +Z. Poses are written as rotations
# about world axes through each bone's head, applied on the hero's Idle pose, parents first.
import bpy, math, os, sys
from mathutils import Matrix, Vector

HERO, UAL, OUT, PREVIEWS = [os.path.abspath(p) for p in sys.argv[sys.argv.index("--") + 1:][:4]]
FPS = 30
X, Z = "X", "Z"

# Gesture timings, from Core/Config/HarvestData.cs (duration s, impact fraction).
TIMING = {"Geste_Hache": (0.95, 0.52), "Geste_Frappe": (1.05, 0.58), "Geste_Fauche": (0.8, 0.5), "Geste_Cueillir": (0.9, 0.62)}


def crouch(depth):
    """Knees bent by `depth` (0–1), feet kept flat, pelvis lowered."""
    return [("pelvis", "drop", 0.36 * depth), ("thigh_l", X, -72 * depth), ("thigh_r", X, -72 * depth),
            ("calf_l", X, 110 * depth), ("calf_r", X, 110 * depth), ("foot_l", X, -38 * depth), ("foot_r", X, -38 * depth)]


def lean(forward, twist=0.0):
    """Spine bent forward (degrees, negative = back) and twisted (negative = toward the right hand)."""
    return [("spine_01", X, forward * 0.45), ("spine_02", X, forward * 0.35), ("spine_03", X, forward * 0.2),
            ("spine_01", Z, twist * 0.4), ("spine_02", Z, twist * 0.35), ("spine_03", Z, twist * 0.25)]


def wrist(deg):
    """The right wrist turned about the side axis (positive: the tool's head goes forward, then down) — applied last."""
    return [("hand_r", X, deg)]


def arms(right, left, elbow_r=0.0, elbow_l=0.0):
    """Each arm: (raise about X, swing about Z) — raise −90 = forward horizontal, −170 = above the head."""
    out = [("upperarm_r", X, right[0]), ("upperarm_r", Z, right[1]), ("upperarm_l", X, left[0]), ("upperarm_l", Z, left[1])]
    out += [("lowerarm_r", X, elbow_r), ("lowerarm_l", X, elbow_l)]
    return out


# Key poses: time (fraction of the gesture, the impact one equal to TIMING) → list of moves.
POSES = {
    "Geste_Frappe": [  # pickaxe and hoe: raised above the head, struck down in front of the feet
        (0.0, []),
        (0.40, lean(-8) + arms((-168, 4), (-160, -8), -60, -55) + [("Head", X, -8)] + wrist(135)),
        (0.58, lean(26) + arms((-62, 0), (-70, -10), -8, -10) + crouch(0.18) + wrist(100)),
        (0.72, lean(30) + arms((-52, 0), (-58, -10), -4, -6) + crouch(0.22) + wrist(105)),
        (1.0, []),
    ],
    "Geste_Hache": [  # axe: wound up over the right shoulder, swung level across the trunk
        (0.0, []),
        (0.38, lean(4, -40) + arms((-100, -70), (-92, -55), -40, -70) + crouch(0.08) + wrist(40)),
        (0.52, lean(10, 12) + arms((-92, 4), (-88, 18), -6, -20) + crouch(0.12) + wrist(90)),
        (0.68, lean(12, 34) + arms((-86, 42), (-84, 55), -10, -30) + crouch(0.1) + wrist(90)),
        (1.0, []),
    ],
    "Geste_Fauche": [  # sickle: crouched, a low sweep from right to left
        (0.0, []),
        (0.3, crouch(0.55) + lean(30, -25) + arms((-35, -55), (-30, 10), -20, -45) + wrist(60)),
        (0.5, crouch(0.6) + lean(34, 5) + arms((-42, 0), (-30, 10), -6, -45) + wrist(60)),
        (0.68, crouch(0.55) + lean(30, 25) + arms((-40, 45), (-30, 10), -12, -45) + wrist(60)),
        (1.0, []),
    ],
    "Geste_Cueillir": [  # hands: crouch, reach down to the plant or the object, rise
        (0.0, []),
        (0.35, crouch(0.6) + lean(28) + arms((-30, 0), (-12, 0), -15, -10)),
        (0.62, crouch(0.95) + lean(42) + arms((-48, 8), (-15, 0), -10, -10) + [("Head", X, 12)]),
        (0.78, crouch(0.85) + lean(36) + arms((-30, 0), (-12, 0), -40, -10)),
        (1.0, []),
    ],
}


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=HERO)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    idle = bpy.data.actions.get("Idle")
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = idle
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    base = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones}
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    arm.animation_data.action = None
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    hand = arm.matrix_world @ arm.pose.bones["hand_r"].head
    print(f"GESTES right hand at x={hand.x:.2f} (expected < 0), facing −Y")
    return arm, base


def reset(arm, base):
    for pb in arm.pose.bones:
        pb.rotation_quaternion, pb.location = base[pb.name][0].copy(), base[pb.name][1].copy()
    bpy.context.view_layer.update()


def apply(arm, moves):
    for bone, axis, amount in moves:
        pb = arm.pose.bones.get(bone)
        if pb is None:
            continue
        m = pb.matrix.copy()
        if axis == "drop":
            pb.matrix = Matrix.Translation((0, 0, -amount)) @ m
        else:
            head = m.translation.copy()
            pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(math.radians(amount), 4, axis) @ Matrix.Translation(-head) @ m
        bpy.context.view_layer.update()


def grip_from_library(arm, base):
    """The closed right hand of the library's « Sword_Idle » (same skeleton): a one-pose clip, played on the hand only."""
    if not os.path.exists(UAL):
        print("GESTES no library: no grip clip")
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=UAL)
    lib = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
    if lib.animation_data is None:
        lib.animation_data_create()
    lib.animation_data.action = bpy.data.actions.get("Sword_Idle")
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    hand_bones = [b.name for b in arm.data.bones["hand_r"].children_recursive] + ["hand_r"]
    pose = {name: lib.pose.bones[name].rotation_quaternion.copy() for name in hand_bones if name in lib.pose.bones}
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o)
    act = bpy.data.actions.new("Geste_Prise")
    arm.animation_data.action = act
    for frame in (0, FPS):
        reset(arm, base)
        for name, q in pose.items():
            arm.pose.bones[name].rotation_quaternion = q
        for name in pose:
            arm.pose.bones[name].keyframe_insert("rotation_quaternion", frame=frame)
    return act


def build(arm, base, name):
    duration, impact = TIMING[name]
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for t, moves in POSES[name]:
        reset(arm, base)
        apply(arm, moves)
        frame = round(t * duration * FPS, 3)
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if pb.name == "pelvis":
                pb.keyframe_insert("location", frame=frame)
    assert any(abs(t - impact) < 1e-6 for t, _ in POSES[name]), f"{name}: no key at the impact"
    return act


def export(arm, actions):
    arm.animation_data.action = None
    for act in actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 0, act)
    for a in [a for a in bpy.data.actions if a not in actions]:
        bpy.data.actions.remove(a)
    for o in bpy.context.scene.objects:
        o.select_set(o == arm)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", use_selection=True, export_animations=True,
                              export_animation_mode="ACTIONS", export_skins=False, export_morph=False, export_cameras=False,
                              export_lights=False, export_extras=False, export_yup=True)
    print("GESTES exported", OUT, [a.name for a in actions])


def grip_matrix(arm):
    """The tool's place in the right hand, computed like the game (Runtime/Characters/HarvestGestures.cs, ToolInHand):
    handle across the knuckles (head on the index side), edge along the hand; in the hand bone's rest space."""
    b = arm.data.bones
    h0, idx, pky, mid = (b[n].head_local for n in ("hand_r", "index_01_r", "pinky_01_r", "middle_01_r"))
    handle = (idx - pky).normalized()
    fwd = mid - h0
    fwd = (fwd - fwd.dot(handle) * handle).normalized()
    rot = Matrix((fwd, handle.cross(fwd), handle)).transposed().to_4x4()  # tool X → edge, tool Z → handle (Blender axes)
    return b["hand_r"].matrix_local.inverted() @ Matrix.Translation(h0 + (mid - h0) * 0.5) @ rot


def tool_object(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        w = o.matrix_world.copy(); o.parent = None; o.matrix_world = w
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return meshes[0]


TOOLS = {"Geste_Frappe": "Outil_Pioche_Fer", "Geste_Hache": "Outil_Hache_Fer", "Geste_Fauche": "Outil_Faucille_Fer"}


def previews(arm, base, actions):
    os.makedirs(PREVIEWS, exist_ok=True)
    objets = os.path.join(os.path.dirname(os.path.dirname(HERO)), "objets")
    grip = grip_matrix(arm)
    held = {name: tool_object(os.path.join(objets, model + ".gltf")) for name, model in TOOLS.items() if os.path.exists(os.path.join(objets, model + ".gltf"))}
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 300, 380
    w = bpy.data.worlds.new("w"); sc.world = w
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.82, 0.8, 1)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    paths = []
    for act in actions:
        if act.name not in TIMING:
            continue
        arm.animation_data.action = act
        f1 = act.frame_range[1]
        for name, o in held.items():
            o.hide_render = name != act.name
        for i, t in enumerate((0.0, 0.25, 0.42, 0.55, 0.7, 0.9)):
            sc.frame_set(int(round(t * f1)))
            bpy.context.view_layer.update()
            if act.name in held:
                held[act.name].matrix_world = arm.matrix_world @ arm.pose.bones["hand_r"].matrix @ grip
            for view, eye in (("cote", (3.4, 0.0, 1.0)), ("face", (1.6, -3.0, 1.1))):
                cam.location = Vector(eye)
                cam.rotation_euler = (Vector((0, 0, 0.85)) - cam.location).to_track_quat("-Z", "Y").to_euler()
                path = os.path.join(PREVIEWS, f"{act.name}_{view}_{i}.png")
                sc.render.filepath = path
                bpy.ops.render.render(write_still=True)
                paths.append(path)
    print("GESTES previews", len(paths))


def main():
    arm, base = setup()
    actions = [build(arm, base, name) for name in POSES]
    grip = grip_from_library(arm, base)
    if grip is not None:
        actions.append(grip)
    previews(arm, base, actions)
    export(arm, actions)


main()
