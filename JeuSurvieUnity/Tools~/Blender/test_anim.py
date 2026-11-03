# Headless checks of the clip retargeting onto the heroine (Blender 5.2). Exit code 1 when a check fails.
# Usage: blender -b --factory-startup --python-exit-code 1 -P test_anim.py -- <heroine.gltf> <Tools~/Sources dir>
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from anim import bone_map, retarget, sources

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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    test_bone_map()
    tgt = retarget.Rig(sources.load_target(HEROINE))
    test_rest_gives_rest(tgt)
    test_idle_arms_and_feet(tgt)
    test_run_in_place(tgt)
    print(f"TEST_ANIM {'OK' if not FAILS else 'FAILED: ' + '; '.join(FAILS)}", flush=True)
    if FAILS:
        sys.exit(1)


main()
