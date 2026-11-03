# Loading the animation sources (Mixamo FBX, Quaternius glb) and the heroine they are retargeted onto.
import bpy


def _new_objects(before):
    return [o for o in bpy.data.objects if o not in before]


def _armature(objs, path):
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    if arm is None:
        raise ValueError(f"aucun squelette dans {path}")
    return arm


def use_action(arm, action):
    """Plays `action` on `arm` (Blender 5 actions have slots: take the first one)."""
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    if action is not None and hasattr(arm.animation_data, "action_slot") and action.slots:
        arm.animation_data.action_slot = action.slots[0]


def import_fbx(path):
    """A Mixamo FBX: its armature (meshes dropped) and its single action."""
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = _new_objects(before)
    arm = _armature(new, path)
    for o in new:
        if o is not arm:
            bpy.data.objects.remove(o)
    action = next((a for a in bpy.data.actions if a not in actions_before), None)
    use_action(arm, action)
    return arm, action


def import_glb(path):
    """A Quaternius library: its armature (meshes dropped) and its actions by name."""
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = _new_objects(before)
    arm = _armature(new, path)
    for o in new:
        if o is not arm and o.type == "MESH":
            bpy.data.objects.remove(o)
    return arm, {a.name: a for a in bpy.data.actions if a not in actions_before}


def load_target(path):
    """The heroine (armature + her meshes, kept for the preview pictures)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = _armature(_new_objects(before), path)
    use_action(arm, None)
    return arm


def remove(arm):
    """Drops a source armature and its children."""
    for o in [arm] + list(arm.children_recursive):
        bpy.data.objects.remove(o)


def frames(action, loop=False, first=None, last=None):
    """Integer frames of `action` (a loop drops its last frame, the copy of the first)."""
    f0, f1 = (int(round(v)) for v in action.frame_range)
    f0 = f0 if first is None else first
    f1 = f1 if last is None else last
    return list(range(f0, f1 if loop else f1 + 1))
