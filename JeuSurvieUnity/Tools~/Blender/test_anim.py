# Headless checks of the clip retargeting onto the heroine (Blender 5.2). Exit code 1 when a check fails.
# Usage: blender -b --factory-startup --python-exit-code 1 -P test_anim.py -- <heroine.gltf> <Tools~/Sources dir>
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from anim import bone_map, retarget, sources, two_hands

HEROINE, SOURCES = [os.path.abspath(a) for a in sys.argv[sys.argv.index("--") + 1:][:2]]
MIXAMO = os.path.join(SOURCES, "mixamo")
FAILS = []


def check(ok, message):
    print(("PASS " if ok else "FAIL ") + message, flush=True)
    if not ok:
        FAILS.append(message)


def test_bone_map():
    check(bone_map.mixamo_to_game("mixamorig:LeftForeArm") == "lowerarm_l", "Mixamo LeftForeArm → lowerarm_l")
    check(bone_map.mixamo_to_game("mixamorig1:RightHandIndex2") == "index_02_r", "Mixamo prefix variant and fingers")
    check(bone_map.mixamo_to_game("mixamorig:Spine2") == "spine_03", "Mixamo Spine2 → spine_03")
    check(bone_map.mixamo_to_game("mixamorig:HeadTop_End") is None, "end bones drive nothing")


def travel(values):
    """Steady change over the whole series (least-squares slope × its length): what a loop drifts by each time."""
    n = len(values)
    tm, vm = (n - 1) / 2, sum(values) / n
    slope = sum((t - tm) * (v - vm) for t, v in enumerate(values)) / sum((t - tm) ** 2 for t in range(n))
    return slope * n


def degrees_from_down(pose, bone):
    """Angle between a posed bone's direction (its Y axis) and straight down."""
    direction = pose[bone].to_quaternion() @ Vector((0, 1, 0))
    return math.degrees(direction.angle(Vector((0, 0, -1))))


def test_rest_gives_rest(tgt):
    src, action = sources.import_fbx(os.path.join(MIXAMO, "Female Basic Locomotion Pack", "idle.fbx"))
    clip = retarget.retarget(src, None, tgt, frames=[0], align=False, arm_weight=0.0)
    worst = max(q.angle for q, _ in clip.bases[0].values())
    check(math.degrees(worst) < 0.5, f"source rest pose gives her rest pose (worst bone {math.degrees(worst):.2f}°)")
    sources.remove(src)


def test_idle_arms_and_feet(tgt):
    src, action = sources.import_fbx(os.path.join(MIXAMO, "Female Basic Locomotion Pack", "idle.fbx"))
    clip = retarget.retarget(src, action, tgt, frames=sources.frames(action, loop=True))
    worst = max(max(degrees_from_down(p, "upperarm_l"), degrees_from_down(p, "upperarm_r")) for p in clip.poses)
    check(worst < 25, f"idle: upper arms within 25° of vertical (worst {worst:.1f}°)")
    lowest = min(min(p["ball_l"].translation.z, p["ball_r"].translation.z, p["foot_l"].translation.z) for p in clip.poses)
    check(lowest > -0.02, f"idle: feet stay above the ground (lowest {lowest * 100:.1f} cm)")
    hands = min(min(abs(p["hand_l"].translation.x), abs(p["hand_r"].translation.x)) for p in clip.poses)
    check(hands > 0.17, f"idle: hands clear of her hips (closest {hands * 100:.1f} cm from the middle)")
    sources.remove(src)


def test_run_in_place(tgt):
    src, action = sources.import_fbx(os.path.join(MIXAMO, "Female Basic Locomotion Pack", "running.fbx"))
    clip = retarget.retarget(src, action, tgt, frames=sources.frames(action, loop=True), in_place=True)
    hips = [p["pelvis"].translation for p in clip.poses]
    drift = math.hypot(*(travel([h[axis] for h in hips]) for axis in (0, 1)))
    check(drift < 0.01, f"run: no steady travel left once in place ({drift * 100:.1f} cm per loop)")
    check(2.5 < clip.speed_mps < 4.5, f"run: measured speed {clip.speed_mps:.2f} m/s")
    sources.remove(src)


# The three two-handed swings as animations.py makes them (FINAL): (name, source, segments, loop, left fist up the handle).
SWINGS = (
    ("pickaxe", ("fbx", "Pro Melee Axe Pack", "standing melee attack downward"), [(3, 48)], False, 0.10),
    ("axe", ("ual2", "TreeChopping_Loop"), [(21, 28), (0, 20)], True, 0.10),
    ("hoe", ("fbx", "singles", "Digging"), [(0, 33), (31, 1, -2)], False, 0.50),
)
# Her forearm rolled at most this far from the source's and from its rest on her upper arm (a forearm turns about ±90°
# from its middle), her wrist bent at most this far, her left upper arm, forearm and hand turning from one frame to the
# next (a loop's last to its first too) at most this much more than her right ones (degrees): a flip or a wrung forearm
# fails. Measured 2026-11-03: axe 28° / 27° / 13°, hoe 11° / 29° / 1°, pickaxe 83° / 81° / 39° — its source is a
# one-handed blow: at the strike her left wrist bends hard for a third of a second, then her shoulder turns quickly to
# straighten it (no other place on the handle nor balance does better).
ROLL_MAX, ROLL_ABS_MAX, BEND_MAX, STEP_MORE = 90, 110, 85, 45


def _swing_clip(tgt, source, segments, loop):
    """Her clip of `source` joined from `segments` as animations.py joins them (before her hands are put on the handle)."""
    if source[0] == "fbx":
        src, action = sources.import_fbx(os.path.join(MIXAMO, source[1], source[2] + ".fbx"))
    else:
        lib = sources.import_glb(os.path.join(SOURCES, "quaternius-ual2", "Universal Animation Library 2[Standard]",
                                              "Unreal-Godot", "UAL2_Standard.glb"))
        src, action = lib[0], lib[1][source[1]]
    frames, joints = sources.joined_frames(action, segments, loop)
    bases = sources.blend_joints(retarget.retarget(src, action, tgt, frames=frames).bases, joints)
    sources.remove(src)
    return bases


def test_both_hands_on_the_handle(tgt):
    """Each two-handed swing: her left fist on the handle at every frame, her right hand turned as the source had it, her
    left arm never locked straight, her forearm and wrist within what an arm does, her left hand never turning on its own."""
    arm, grip = tgt.arm, two_hands.grip_matrix(tgt.arm)
    left = two_hands.Arm(arm, "_l")
    middle = two_hands.fist(arm, "_l").middle
    arm_len = left.upper + left.lower
    for name, source, segments, loop, along in SWINGS:
        bases = _swing_clip(tgt, source, segments, loop)
        before = [two_hands.fk(arm, tgt.order, b) for b in bases]
        after = [two_hands.fk(arm, tgt.order, b) for b in two_hands.hands_on_handle(arm, tgt.order, bases, grip, along, loop)]
        off = turned = stretched = roll = roll_abs = bend = pulled = steps = 0.0
        for p0, p in zip(before, after):
            o, u = two_hands.handle(p, grip)
            off = max(off, (p["hand_l"] @ middle - (o + u * along)).length)
            turned = max(turned, math.degrees(two_hands.turn_between(p0["hand_r"].to_quaternion(), p["hand_r"].to_quaternion())))
            stretched = max(stretched, (p["hand_l"].translation - p["upperarm_l"].translation).length / arm_len)
            q = {n: p[n].to_quaternion() for n in ("upperarm_l", "lowerarm_l", "hand_l")}
            now = left.roll(q["upperarm_l"], q["lowerarm_l"])
            roll = max(roll, abs(two_hands.wrap(now - left.roll(p0["upperarm_l"].to_quaternion(), p0["lowerarm_l"].to_quaternion()))))
            roll_abs = max(roll_abs, abs(now))
            bend = max(bend, math.degrees(two_hands.turn_between(q["lowerarm_l"] @ left.hand_rest, q["hand_l"])))
            pulled = max(pulled, (p["hand_r"].translation - p0["hand_r"].translation).length)
        for a, b in zip(after, after[1:] + (after[:1] if loop else [])):
            turn = lambda bone: math.degrees(two_hands.turn_between(a[bone].to_quaternion(), b[bone].to_quaternion()))
            steps = max(steps, *(turn(s + "_l") - turn(s + "_r") for s in ("upperarm", "lowerarm", "hand")))
        check(off < 0.005, f"{name}: left fist on the handle at every frame (worst {off * 100:.1f} cm)")
        check(turned < 0.5, f"{name}: right hand keeps its turn (worst {turned:.2f}°)")
        check(stretched <= 0.975, f"{name}: left arm never locked straight (at most {stretched * 100:.0f} % of its length)")
        check(roll <= ROLL_MAX, f"{name}: forearm rolled at most {roll:.0f}° from the source's (limit {ROLL_MAX}°)")
        check(roll_abs <= ROLL_ABS_MAX, f"{name}: forearm rolled at most {roll_abs:.0f}° from its rest (limit {ROLL_ABS_MAX}°)")
        check(bend <= BEND_MAX, f"{name}: wrist bent at most {bend:.0f}° (limit {BEND_MAX}°)")
        check(steps <= STEP_MORE, f"{name}: left upper arm, forearm and hand turn at most {steps:.0f}° more per frame than the right ones")
        print(f"INFO {name}: right hand brought at most {pulled * 100:.0f} cm toward her left shoulder", flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    test_bone_map()
    tgt = retarget.Rig(sources.load_target(HEROINE))
    test_rest_gives_rest(tgt)
    test_idle_arms_and_feet(tgt)
    test_run_in_place(tgt)
    test_both_hands_on_the_handle(tgt)
    print(f"TEST_ANIM {'OK' if not FAILS else 'FAILED: ' + '; '.join(FAILS)}", flush=True)
    if FAILS:
        sys.exit(1)


main()
