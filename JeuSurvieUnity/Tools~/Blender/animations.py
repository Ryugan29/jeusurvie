# The heroine's animations, retargeted onto her own skeleton from filmed (Mixamo) and hand-animated (Quaternius UAL2) clips
# (Blender 5.2, headless). Replaces gestes.py and the hidden hero's Idle/Walk/Run.
# Usage: blender -b --factory-startup --python-exit-code 1 -P animations.py -- <heroine.gltf> <Tools~/Sources dir>
#        <objets dir (tool models)> <out dir> candidats | export <heroine dir>
#   candidats: every candidate clip baked on her, with the right tool in her hand, as picture sheets <out dir>/planches/
#   (José picks the gestures from them).
#   export: the clips José chose → <heroine dir>/animations.gltf (her skeleton and the clips only) + animations.json
#   (per clip: length, loop, moment of the blow, playback speed, two-handed, ground speed), and picture sheets.
#   Design: Second cerveau/1 - Projets/jeu-survie/decision-2026-11-03-animations-filmees-et-outils-hd.md ;
#   retarget method: anim/retarget.py.
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
from anim import retarget, sources

ARGS = sys.argv[sys.argv.index("--") + 1:]
HEROINE, SOURCES, OBJETS, OUT = [os.path.abspath(a) for a in ARGS[:4]]
MODE = ARGS[4] if len(ARGS) > 4 else "candidats"
HEROINE_DIR = os.path.abspath(ARGS[5]) if len(ARGS) > 5 else None
FPS = 30
MIXAMO = os.path.join(SOURCES, "mixamo")
UAL2 = os.path.join(SOURCES, "quaternius-ual2", "Universal Animation Library 2[Standard]", "Unreal-Godot", "UAL2_Standard.glb")
SHEETS = os.path.join(OUT, "planches")
os.makedirs(SHEETS, exist_ok=True)


def mixamo(pack, clip):
    return ("fbx", os.path.join(MIXAMO, pack, clip + ".fbx"), None)


def ual2(action):
    return ("ual2", UAL2, action)


# name: (source, loop, in place, tool in her hand). Candidates per gesture carry a letter (A, B…).
CANDIDATES = {
    "Repos": (mixamo("Female Basic Locomotion Pack", "idle"), True, False, None),
    "Marche": (mixamo("Female Basic Locomotion Pack", "walking"), True, True, None),
    "Course": (mixamo("Female Basic Locomotion Pack", "running"), True, True, None),
    "Repos_Outil": (mixamo("Pro Melee Axe Pack", "standing idle"), True, False, "Outil_Hache_Pierre"),
    "Marche_Outil": (mixamo("Pro Melee Axe Pack", "standing walk forward"), True, True, "Outil_Hache_Pierre"),
    "Course_Outil": (mixamo("Pro Melee Axe Pack", "standing run forward"), True, True, "Outil_Hache_Pierre"),
    "Hache_A": (ual2("TreeChopping_Loop"), True, False, "Outil_Hache_Pierre"),
    "Hache_B": (mixamo("Pro Melee Axe Pack", "standing melee attack horizontal"), False, False, "Outil_Hache_Pierre"),
    "Frappe_A": (mixamo("Pro Melee Axe Pack", "standing melee attack downward"), False, False, "Outil_Pioche_Fer"),
    "Frappe_B": (ual2("Sword_Heavy_Combo"), False, False, "Outil_Pioche_Fer"),
    "Houe_A": (mixamo("singles", "Digging"), False, False, "Outil_Houe_Cuivre"),
    "Fauche_A": (ual2("Farm_Harvest"), False, False, "Outil_Faucille_Fer"),
    "Fauche_B": (mixamo("Farming Pack", "pull plant (2)"), False, False, "Outil_Faucille_Fer"),
    "Cueillir_A": (mixamo("Farming Pack", "pick fruit"), False, False, None),
    "Cueillir_B": (mixamo("Farming Pack", "pick fruit (2)"), False, False, None),
    "Cueillir_C": (mixamo("Farming Pack", "pick fruit (3)"), False, False, None),
    "Cueillir_D": (mixamo("Farming Pack", "pull plant"), False, False, None),
    "Ramasser_A": (mixamo("singles", "Gathering Objects"), False, False, None),
    # Runs (José, 2026-11-03: the first one is not natural enough)
    "Course_A": (mixamo("Female Basic Locomotion Pack", "running"), True, True, None),
    "Course_B": (mixamo("Female Locomotion Pack", "running"), True, True, None),
    "Course_C": (mixamo("courses", "Run Forward"), True, True, None),
    "Course_D": (mixamo("courses", "Jogging"), True, True, None),
    "Course_E": (mixamo("courses", "Running"), True, True, None),
}
# candidats <prefix>: only the candidates whose name starts with it (e.g. "Course_")
PREFIX = ARGS[5] if MODE == "candidats" and len(ARGS) > 5 else ""


AXE, FARM, FEMALE = "Pro Melee Axe Pack", "Farming Pack", "Female Basic Locomotion Pack"
# The clips José chose (2026-11-03). segments: source clip indices (0 = the source's first frame), (first, last[, step]),
# joined in order (a short blend at each joint); contact: index in the joined clip of the blow / of the hand at the plant;
# speed: the game's playback speed; two_hands: the left hand goes on the handle in the game.
FINAL = {
    "Repos": dict(src=mixamo(FEMALE, "idle"), loop=True),
    "Marche": dict(src=mixamo(FEMALE, "walking"), loop=True, in_place=True),
    "Course": dict(src=mixamo("courses", "Run Forward"), loop=True, in_place=True),  # José's choice (C), 2026-11-03
    "Geste_Hache": dict(src=ual2("TreeChopping_Loop"), segments=[(21, 28), (0, 20)], loop=True, contact=14, speed=1.0,
                        two_hands=True, tool="Outil_Hache_Pierre"),
    "Geste_Frappe": dict(src=mixamo(AXE, "standing melee attack downward"), segments=[(3, 48)], contact=24, speed=1.2,
                         two_hands=True, tool="Outil_Pioche_Fer"),
    "Geste_Houe": dict(src=mixamo("singles", "Digging"), segments=[(0, 33), (31, 1, -2)], contact=27, speed=1.2,
                       two_hands=True, tool="Outil_Houe_Cuivre"),
    "Geste_Fauche": dict(src=ual2("Farm_Harvest"), segments=[(6, 66)], contact=27, speed=1.25, tool="Outil_Faucille_Fer"),
    "Geste_Cueillir": dict(src=mixamo(FARM, "pick fruit (3)"), segments=[(21, 75), (153, 198)], contact=33, speed=1.3),
    "Geste_Arracher": dict(src=mixamo(FARM, "pull plant"), segments=[(15, 117)], contact=42, speed=1.5),
    "Geste_Ramasser": dict(src=mixamo("singles", "Gathering Objects"), segments=[(12, 48), (99, 140)], contact=27, speed=1.3),
}
CARRY = mixamo(AXE, "standing idle")         # her right arm and fist holding a tool, laid over her own steps
LEFT_GRIP = (mixamo("singles", "Digging"), 27)  # the left fist closed on a handle
RIGHT_ARM = ("clavicle_r", "upperarm_r", "lowerarm_r", "hand_r")
CARRY_SHARE = 0.85  # how much of the carrying arm replaces her own swinging arm
BLEND = 6           # frames blended at each joint between two segments


# ---------------------------------------------------------------------------------------------------------- tool in hand

def grip_matrix(arm):
    """The tool's place in the right hand, computed like the game (Runtime/Characters/HarvestGestures.cs, ToolInHand):
    handle across the knuckles (head on the index side), edge along the hand; in the hand bone's rest space."""
    b = arm.data.bones
    h0, idx, pky, mid, thb = (b[n].head_local for n in ("hand_r", "index_01_r", "pinky_01_r", "middle_01_r", "thumb_01_r"))
    handle = (idx - pky).normalized()
    fwd = mid - h0
    fwd = (fwd - fwd.dot(handle) * handle).normalized()
    rot = Matrix((fwd, handle.cross(fwd), handle)).transposed().to_4x4()  # tool X → edge, tool Z → handle (Blender axes)
    palm = thb - h0  # inside the fist: under the knuckles, toward the palm (the thumb's side)
    palm = palm - palm.dot(handle) * handle
    palm = (palm - palm.dot(fwd) * fwd).normalized()
    return b["hand_r"].matrix_local.inverted() @ Matrix.Translation(h0 + (mid - h0) * 0.85 + palm * ((mid - h0).length * 0.3)) @ rot


def load_tool(name):
    path = os.path.join(OBJETS, name + ".gltf")
    if not os.path.exists(path):
        print(f"ANIMATIONS no tool model {path}", flush=True)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        w = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = w
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    root = bpy.data.objects.new("outil " + name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in meshes:
        o.parent = root
    return root


# ---------------------------------------------------------------------------------------------------------- pictures

def setup_render():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.view_settings.view_transform = "AgX"
    sc.render.resolution_x, sc.render.resolution_y = 320, 420
    w = bpy.data.worlds.new("Ciel"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.66, 0.62, 1)
    for name, energy, rot in (("Soleil", 3.2, (45, 10, -35)), ("Contre", 1.5, (65, 0, 150))):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        l.data.energy, l.rotation_euler = energy, [math.radians(a) for a in rot]
        sc.collection.objects.link(l)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.lens = 45
    sc.collection.objects.link(cam); sc.camera = cam
    return cam


def shoot_clip(tgt, act, n_frames, name, tool, cam, grip):
    """N pictures of `act` on her, from three-quarters front-right, the tool following her right hand."""
    sources.use_action(tgt.arm, act)
    f0, f1 = (int(round(v)) for v in act.frame_range)
    sc = bpy.context.scene
    for o in sc.objects:
        if o.name.startswith("outil "):
            o.hide_render = o is not tool
            for c in o.children:
                c.hide_render = o is not tool
    for i in range(n_frames):
        f = f0 + round((f1 - f0) * i / max(1, n_frames - 1))
        sc.frame_set(f)
        if tool is not None:
            tool.matrix_world = tgt.arm.matrix_world @ tgt.arm.pose.bones["hand_r"].matrix @ grip
        hips = tgt.arm.matrix_world @ tgt.arm.pose.bones["pelvis"].head
        look = Vector((hips.x, hips.y, 0.85))
        cam.location = look + Vector((-1.6, -2.4, 0.55))
        cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(SHEETS, f"{name}_{i:02d}.png")
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------------------------------------- main

def bake_candidates(tgt):
    """Every candidate on her: {name: action}. The Quaternius library is imported once for all its clips."""
    out = {}
    lib = None
    for name, ((kind, path, action_name), loop, in_place, _tool) in CANDIDATES.items():
        if not name.startswith(PREFIX):
            continue
        if kind == "ual2":
            if lib is None:
                lib = sources.import_glb(path)
            src, action = lib[0], lib[1].get(action_name)
        else:
            src, action = sources.import_fbx(path)
        if action is None:
            print(f"ANIMATIONS missing {name} ({path} {action_name})", flush=True)
            continue
        clip = retarget.retarget(src, action, tgt, sources.frames(action, loop=loop), in_place=in_place)
        out[name] = retarget.write_action(tgt, clip, name)
        print(f"ANIMATIONS baked {name}: {len(clip.bases)} frames, {clip.speed_mps:.2f} m/s", flush=True)
        if kind == "fbx":
            sources.remove(src)
    if lib is not None:
        sources.remove(lib[0])
    return out


class Library:
    """Opens each source once (the Quaternius library holds several clips)."""

    def __init__(self):
        self.ual2 = None

    def open(self, src):
        kind, path, action_name = src
        if kind == "ual2":
            self.ual2 = self.ual2 or sources.import_glb(path)
            return self.ual2[0], self.ual2[1][action_name], False
        arm, action = sources.import_fbx(path)
        return arm, action, True

    def close(self):
        if self.ual2:
            sources.remove(self.ual2[0])


def joined_frames(action, segments, loop):
    """Source frames of the joined clip, and the indices where a new segment starts."""
    if not segments:
        return sources.frames(action, loop=loop), []
    f0 = int(round(action.frame_range[0]))
    frames, joints = [], []
    for seg in segments:
        first, last = seg[0], seg[1]
        step = seg[2] if len(seg) > 2 else 1
        if frames:
            joints.append(len(frames))
        frames += [f0 + i for i in range(first, last + (1 if step > 0 else -1), step)]
    return frames, joints


def blend_joints(bases, joints, width=BLEND):
    """The last frames before each joint drift toward the first pose after it (no pop between segments)."""
    out = [dict(b) for b in bases]
    for j in joints:
        target = bases[j]
        for k in range(width):
            i = j - width + k
            if i < 0:
                continue
            t = (k + 1) / (width + 1)
            out[i] = {n: (q.slerp(target[n][0], t), loc.lerp(target[n][1], t)) for n, (q, loc) in bases[i].items()}
    return out


def with_carry(bases, carry):
    """Her own steps with the right arm (mostly) holding a tool and the right fist closed."""
    out = []
    for b in bases:
        frame = dict(b)
        for n, (q, loc) in carry.items():
            share = CARRY_SHARE if n in RIGHT_ARM else 1.0
            mine = frame.get(n, (q, loc))
            frame[n] = (mine[0].slerp(q, share), mine[1])
        out.append(frame)
    return out


FINGERS = ("thumb", "index", "middle", "ring", "pinky")


def right_arm_and_fist(bases):
    """The right arm chain and right fingers of one pose."""
    return {n: v for n, v in bases.items() if n in RIGHT_ARM or (n.endswith("_r") and n.split("_")[0] in FINGERS)}


def fist(bases, side):
    return {n: v for n, v in bases.items() if n.endswith(side) and n.split("_")[0] in FINGERS}


def write_keys(tgt, name, frames_bases):
    """An action keying exactly the bones present in each frame's dict (rotation; pelvis location too)."""
    act = bpy.data.actions.new(name)
    sources.use_action(tgt.arm, act)
    for i, bases in enumerate(frames_bases):
        for n, (q, loc) in bases.items():
            pb = tgt.arm.pose.bones[n]
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=i)
            if n == "pelvis":
                pb.location = loc
                pb.keyframe_insert("location", frame=i)
    return act


def driven(bases_list):
    """Only the bones the clip moves (and the pelvis): unkeyed bones stay to the other clips."""
    keep = {n for n in bases_list[0] if n != "root" and (n == "pelvis" or any(b[n][0].angle > 1e-5 for b in bases_list))}
    return [{n: v for n, v in b.items() if n in keep} for b in bases_list]


def export_final(tgt):
    lib = Library()
    clips, info = {}, {}
    for name, r in FINAL.items():
        arm, action, own = lib.open(r["src"])
        frames, joints = joined_frames(action, r.get("segments"), r.get("loop", False))
        clip = retarget.retarget(arm, action, tgt, frames, in_place=r.get("in_place", False))
        bases = blend_joints(clip.bases, joints)
        if r.get("loop"):
            bases = bases + [bases[0]]  # the loop closes on its first pose
        clips[name] = bases
        n = len(bases)
        info[name] = dict(frames=n, seconds=round((n - 1) / FPS, 4), loop=bool(r.get("loop")),
                          contact=round(r["contact"] / (n - 1), 4) if "contact" in r else None,
                          speed=r.get("speed", 1.0), two_hands=bool(r.get("two_hands")), speed_mps=round(clip.speed_mps, 3),
                          tool=r.get("tool"))
        print(f"ANIMATIONS final {name}: {n} frames, {info[name]}", flush=True)
        if own:
            sources.remove(arm)
    arm, action, own = lib.open(CARRY)
    carry = right_arm_and_fist(retarget.retarget(arm, action, tgt, sources.frames(action)[:1]).bases[0])
    sources.remove(arm)
    for walk in ("Repos", "Marche", "Course"):
        clips[walk + "_Outil"] = with_carry(clips[walk], carry)
        info[walk + "_Outil"] = dict(info[walk], tool="Outil_Hache_Pierre")
    (src, contact_index) = LEFT_GRIP
    arm, action, own = lib.open(src)
    left = fist(retarget.retarget(arm, action, tgt, [sources.frames(action)[contact_index]]).bases[0], "_l")
    sources.remove(arm)
    lib.close()
    right = fist(carry, "_r")
    clips["Geste_Prise"] = [right, right]
    clips["Prise_Gauche"] = [left, left]
    for grip in ("Geste_Prise", "Prise_Gauche"):
        info[grip] = dict(frames=2, seconds=round(1 / FPS, 4), loop=True, contact=None, speed=1.0, two_hands=False,
                          speed_mps=0.0, tool=None)
    actions = {name: write_keys(tgt, name, driven(b) if not name.startswith(("Geste_Prise", "Prise_")) else b)
               for name, b in clips.items()}
    export_gltf(tgt.arm, list(actions.values()))
    with open(os.path.join(HEROINE_DIR, "animations.json"), "w", encoding="utf-8") as f:  # a list: Unity's JsonUtility reads it
        clips_out = [dict(name=n, **{k: (-1 if (k == "contact" and v is None) else v) for k, v in i.items()}) for n, i in info.items()]
        json.dump({"fps": FPS, "clips": clips_out}, f, indent=1, ensure_ascii=False)
    return actions, info


def export_gltf(arm, actions):
    """Her skeleton and the clips only (no mesh): the game adds the clips to the heroine it has loaded. The sources'
    actions are dropped first: the exporter would write every action whose bones match hers (the Quaternius library's)."""
    sources.use_action(arm, None)
    for a in [a for a in bpy.data.actions if a not in actions]:
        bpy.data.actions.remove(a)
    for act in actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, 0, act)
        strip.name = act.name
    for o in bpy.context.scene.objects:
        o.select_set(o == arm)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(HEROINE_DIR, "animations.gltf")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", use_selection=True, export_animations=True,
                              export_animation_mode="ACTIONS", export_skins=False, export_morph=False, export_cameras=False,
                              export_lights=False, export_extras=False, export_yup=True)
    print("ANIMATIONS exported", path, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    tgt = retarget.Rig(sources.load_target(HEROINE))
    if MODE == "export":
        actions, info = export_final(tgt)
        shots = {n: (i["tool"], i["loop"]) for n, i in info.items() if n not in ("Geste_Prise", "Prise_Gauche")}
    elif MODE == "candidats":
        actions = bake_candidates(tgt)
        shots = {n: (c[3], c[1]) for n, c in CANDIDATES.items() if n in actions}
    else:
        raise SystemExit(f"mode inconnu : {MODE}")
    tools = {t: load_tool(t) for t in {tool for tool, _ in shots.values() if tool}}
    cam = setup_render()
    grip = grip_matrix(tgt.arm)
    for name, (tool, loop) in shots.items():
        sources.use_action(tgt.arm, actions[name])
        if tgt.arm.animation_data:
            for track in tgt.arm.animation_data.nla_tracks:
                track.mute = True
        shoot_clip(tgt, actions[name], 6 if loop else 8, ("final_" if MODE == "export" else "") + name, tools.get(tool), cam, grip)
    print("ANIMATIONS done", flush=True)


main()
