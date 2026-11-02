# Prints the heroine's structure (meshes, bones, bounds) to plan the elf modelling.
import bpy, sys
from mathutils import Vector
src = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        print("MESH", o.name, len(o.data.vertices), "mats", [m.name for m in o.data.materials], "uvs", [u.name for u in o.data.uv_layers], "min", tuple(round(x,3) for x in mn), "max", tuple(round(x,3) for x in mx), "parent", o.parent.name if o.parent else None, "groups", len(o.vertex_groups))
    elif o.type == "ARMATURE":
        print("ARM", o.name, "scale", tuple(o.matrix_world.to_scale()))
        for b in o.data.bones:
            h = o.matrix_world @ b.head_local; t = o.matrix_world @ b.tail_local
            print("  BONE", b.name, "parent", b.parent.name if b.parent else None, "head", tuple(round(x,3) for x in h), "tail", tuple(round(x,3) for x in t))
for img in bpy.data.images:
    print("IMG", img.name, tuple(img.size))
