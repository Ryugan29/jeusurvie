# Retargeting a source clip onto the heroine's skeleton, frame by frame (plain mathutils, no constraints):
#   1. rotations: each target bone takes the world-space turn its source bone made away from its reference pose
#      (W_t = W_s · W_s,ref⁻¹ · W_t,ref; references are the rest poses — both T-poses facing −Y — with the target's bones
#      first swung onto the source's directions, a safety net of a few degrees);
#   2. arms by position: the source wrist, seen from its shoulders in its chest's frame, is narrowed to her shoulders and
#      scaled to her arm length, then reached by a two-bone solve (the elbow keeps its side) — the source bodies are broad
#      men, their arm angles would hold her slim arms away from her body;
#   3. pelvis: the source's hips movement scaled by the leg-length ratio; "in place" removes a steady travel (kept as speed).
# Design: Second cerveau/1 - Projets/jeu-survie/decision-2026-11-03-animations-filmees-et-outils-hd.md
import math
import bpy
from mathutils import Matrix, Quaternion, Vector
from . import bone_map

FPS = 30
Y = Vector((0, 1, 0))


def _rot(m):
    return m.to_3x3().normalized().to_quaternion()


class Rig:
    """World-space rest data of an armature; bones listed parents first."""

    def __init__(self, arm):
        self.arm, self.world = arm, arm.matrix_world.copy()
        self.world_rot = _rot(self.world)
        self.order = []

        def visit(b):
            self.order.append(b.name)
            for c in b.children:
                visit(c)

        for b in arm.data.bones:
            if b.parent is None:
                visit(b)
        bones = arm.data.bones
        self.rest_rot = {b.name: _rot(self.world @ b.matrix_local) for b in bones}
        self.rest_head = {b.name: self.world @ b.head_local for b in bones}
        self.length = {b.name: (self.world @ b.tail_local - self.world @ b.head_local).length for b in bones}

    def posed(self, name):
        """(head, rotation) of a bone in the current pose, world space."""
        m = self.world @ self.arm.pose.bones[name].matrix
        return m.translation.copy(), _rot(m)


def two_bone(shoulder, elbow, target, upper, lower):
    """Elbow and (reachable) wrist for a two-bone limb reaching `target`; the elbow stays on the side it was on."""
    to = target - shoulder
    d = min(max(to.length, abs(upper - lower) + 1e-4), (upper + lower) * 0.99)
    n = to.normalized() if to.length > 1e-9 else Vector((0, 0, -1))
    a = (upper * upper - lower * lower + d * d) / (2 * d)
    h = math.sqrt(max(0.0, upper * upper - a * a))
    pole = elbow - shoulder
    pole -= n * pole.dot(n)
    if pole.length < 1e-6:
        pole = n.orthogonal()
    return shoulder + n * a + pole.normalized() * h, shoulder + n * d


class Clip:
    def __init__(self):
        self.poses, self.bases, self.speed_mps = [], [], 0.0


class _Source:
    """What the solve needs from the source at one frame."""

    def __init__(self, src, mapping, chest, shoulders, hands, hips):
        self.rot = {t: src.posed(s)[1] for t, s in mapping.items()}
        head = {n: src.posed(n)[0] for n in shoulders + hands + [hips]}
        chest_rot = src.posed(chest)[1]
        self.chest_turn = chest_rot @ src.rest_rot[chest].inverted()
        anchor = (head[shoulders[0]] + head[shoulders[1]]) / 2
        back = self.chest_turn.inverted()
        self.hand_offset = [back @ (head[h] - anchor) for h in hands]  # in the rest axes: x side, −y forward, z up
        self.hips = head[hips]


def _solve(tgt, want, pelvis):
    """Pose (armature space) and basis (rotation, location) of every target bone from wanted armature-space rotations."""
    poses, bases = {}, {}
    bones = tgt.arm.data.bones
    for name in tgt.order:
        b = bones[name]
        rest_rel = b.parent.matrix_local.inverted() @ b.matrix_local if b.parent else b.matrix_local.copy()
        frame = (poses[b.parent.name] if b.parent else Matrix.Identity(4)) @ rest_rel
        q = frame.to_quaternion().inverted() @ want[name] if name in want else Quaternion()
        loc = frame.inverted() @ pelvis if (name == "pelvis" and pelvis is not None) else Vector()
        poses[name] = frame @ Matrix.Translation(loc) @ q.to_matrix().to_4x4()
        bases[name] = (q, loc)
    return poses, bases


def _arm_pass(tgt, poses, want, s, chest_turn, width, reach, weight, clearance):
    """Moves each wrist to the narrowed source wrist (see the module comment); `want` is updated in place."""
    anchor = (poses["upperarm_l"].translation + poses["upperarm_r"].translation) / 2
    for i, side in enumerate(("_l", "_r")):
        up, low, hand = "upperarm" + side, "lowerarm" + side, "hand" + side
        o = s.hand_offset[i]
        aim = Vector((o.x * width, o.y * reach, o.z * reach))
        beside = abs(aim.y) < 0.12 and aim.z < -0.25  # hanging by her side: never inside her hips
        if beside and abs(aim.x) < clearance:
            aim.x = math.copysign(clearance, aim.x if abs(aim.x) > 1e-6 else (1 if side == "_l" else -1))
        shoulder, elbow0, wrist0 = (poses[n].translation for n in (up, low, hand))
        target = wrist0.lerp(anchor + chest_turn @ aim, weight)
        elbow, wrist = two_bone(shoulder, elbow0, target, tgt.length[up], tgt.length[low])
        turn_up = (elbow0 - shoulder).rotation_difference(elbow - shoulder)
        turn_low = (turn_up @ (wrist0 - elbow0)).rotation_difference(wrist - elbow)
        want[up] = turn_up @ want[up]
        want[low] = turn_low @ turn_up @ want[low]


def retarget(src_arm, action, tgt, frames, mixamo=None, align=True, arm_weight=1.0, in_place=False, clearance=0.19,
             grounded=True):
    """Clip of `tgt` (a Rig) from `action` on `src_arm` over `frames` (action None: the source's rest pose).
    grounded: the whole clip is raised or lowered so her lowest toe touches the ground as at rest (other proportions)."""
    from .sources import use_action
    mixamo = any(n.startswith("mixamorig") for n in src_arm.data.bones.keys()) if mixamo is None else mixamo
    src = Rig(src_arm)
    mapping = bone_map.mapping_for(src_arm.data.bones.keys(), set(tgt.order), mixamo)  # target bone → source bone
    inv = mapping
    # Reference: her bones swung onto the source's rest directions (a few degrees at most for T-poses facing −Y).
    ref = {}
    for t, s in mapping.items():
        swing = (tgt.rest_rot[t] @ Y).rotation_difference(src.rest_rot[s] @ Y) if align else Quaternion()
        ref[t] = swing @ tgt.rest_rot[t]
    width = (tgt.rest_head["upperarm_l"] - tgt.rest_head["upperarm_r"]).length / \
        (src.rest_head[inv["upperarm_l"]] - src.rest_head[inv["upperarm_r"]]).length
    reach = (tgt.length["upperarm_l"] + tgt.length["lowerarm_l"]) / (src.length[inv["upperarm_l"]] + src.length[inv["lowerarm_l"]])
    legs = (tgt.length["thigh_l"] + tgt.length["calf_l"]) / (src.length[inv["thigh_l"]] + src.length[inv["calf_l"]])
    use_action(src_arm, action)
    if action is None:
        for pb in src_arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
    samples = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        samples.append(_Source(src, mapping, inv["spine_03"], [inv["upperarm_l"], inv["upperarm_r"]],
                               [inv["hand_l"], inv["hand_r"]], inv["pelvis"]))
    hips_ref = src.rest_head[inv["pelvis"]]
    pelvis = [tgt.rest_head["pelvis"] + (s.hips - hips_ref) * legs for s in samples]
    clip = Clip()
    if in_place and len(pelvis) > 1:
        pelvis, clip.speed_mps = _remove_travel(pelvis, tgt.rest_head["pelvis"])
    to_arm = tgt.world_rot.inverted()
    wants = [{t: to_arm @ (s.rot[t] @ src.rest_rot[mapping[t]].inverted() @ ref[t]) for t in mapping} for s in samples]
    if grounded and action is not None:
        pelvis = _on_the_ground(tgt, wants, pelvis)
    previous = {}
    for s, want, p in zip(samples, wants, pelvis):
        p_arm = tgt.world.inverted() @ p
        poses, bases = _solve(tgt, want, p_arm)
        if arm_weight > 0:
            turn = to_arm @ s.chest_turn @ to_arm.inverted()
            _arm_pass(tgt, poses, want, s, turn, width, reach, arm_weight, clearance)
            poses, bases = _solve(tgt, want, p_arm)
        for name, (q, loc) in bases.items():  # no flips between frames when the clip is interpolated
            if name in previous:
                q.make_compatible(previous[name])
            previous[name] = q
        clip.poses.append(poses)
        clip.bases.append(bases)
    return clip


def _on_the_ground(tgt, wants, pelvis):
    """Pelvis heights shifted by one amount so the lowest toe of the clip is at its rest height (the ground)."""
    feet = ("ball_l", "ball_r", "foot_l", "foot_r")
    ground = min(tgt.rest_head[f].z for f in feet)
    to_local = tgt.world.inverted()
    lowest = min(min((tgt.world @ poses[f].translation).z for f in feet)
                 for poses in (_solve(tgt, want, to_local @ p)[0] for want, p in zip(wants, pelvis)))
    lift = ground - lowest
    return [p + Vector((0, 0, lift)) for p in pelvis]


def _remove_travel(points, rest):
    """Removes a steady horizontal travel (least-squares line) when it exceeds 5 cm; returns (points, speed m/s)."""
    n = len(points)
    ts = list(range(n))
    tm = sum(ts) / n
    var = sum((t - tm) ** 2 for t in ts) or 1.0
    out_speed = 0.0
    slope = []
    for axis in (0, 1):
        vm = sum(p[axis] for p in points) / n
        b = sum((t - tm) * (p[axis] - vm) for t, p in zip(ts, points)) / var
        slope.append((vm, b))
    travel = math.hypot(slope[0][1], slope[1][1]) * (n - 1)
    if travel < 0.05:
        return points, 0.0
    out_speed = math.hypot(slope[0][1], slope[1][1]) * FPS
    fixed = []
    for t, p in zip(ts, points):
        q = p.copy()
        for axis, (vm, b) in enumerate(slope):
            q[axis] = p[axis] - (vm + b * (t - tm)) + rest[axis]
        fixed.append(q)
    return fixed, out_speed


def write_action(tgt, clip, name):
    """The clip as a Blender action on the heroine's armature (rotation keys on every driven bone, pelvis location)."""
    from .sources import use_action
    act = bpy.data.actions.new(name)
    use_action(tgt.arm, act)
    for pb in tgt.arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    driven = [n for n in clip.bases[0] if n != "root" and (n == "pelvis" or any(b[n][0].angle > 1e-5 for b in clip.bases))]
    for i, bases in enumerate(clip.bases):
        for n in driven:
            pb = tgt.arm.pose.bones[n]
            q, loc = bases[n]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=i)
            if n == "pelvis":
                pb.location = loc
                pb.keyframe_insert("location", frame=i)
    return act
