"""Render generated GLBs with the existing head lookdev studio, without mesh edits."""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import studio, render

WORK = HERE.parents[1] / '.work/toy-character/img3d'


def main():
    records = {}
    for name in ['v4', 'v4-noglasses']:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(WORK / 'out' / f'{name}.glb'))
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        # Bake only the import transforms, then use one whole-body normalization.
        for obj in meshes:
            obj.data.transform(obj.matrix_world)
            obj.parent = None
            obj.matrix_world.identity()
        for obj in list(bpy.context.scene.objects):
            if obj.type != 'MESH':
                bpy.data.objects.remove(obj, do_unlink=True)
        points = [v.co.copy() for obj in meshes for v in obj.data.vertices]
        low = Vector([min(p[i] for p in points) for i in range(3)])
        high = Vector([max(p[i] for p in points) for i in range(3)])
        height = high.z - low.z
        center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
        for obj in meshes:
            for v in obj.data.vertices:
                v.co = (v.co - center) / height
            obj.data.update()
        triangles = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
        records[name] = {
            'triangles': triangles,
            'vertices': sum(len(o.data.vertices) for o in meshes),
            'mesh_objects': len(meshes),
            'raw_bounds_blender': [list(low), list(high)],
            'normalization': {'height': 1, 'origin': 'whole-body bbox XY center, bottom Z'},
            'images': [{'name': im.name, 'size': list(im.size), 'channels': im.channels}
                       for im in bpy.data.images if im.type == 'IMAGE'],
            'materials': [m.name for m in bpy.data.materials],
        }
        bpy.context.scene.world = bpy.data.worlds.new('World')
        camera = studio()
        out = WORK / 'renders' / name
        out.mkdir(parents=True, exist_ok=True)
        render(out, camera, 'head-front.png', (0, -2, .852), (0, 0, .852), .405)
        render(out, camera, 'head-45.png', (1.2, -1.2, .96), (0, 0, .842), .405)
        for label, angle in [('front', 0), ('45', 45), ('side', 90), ('back', 180)]:
            a = math.radians(angle)
            render(out, camera, f'body-{label}.png',
                   (2 * math.sin(a), -2 * math.cos(a), .5), (0, 0, .5), 1.12)
        # Save the generated materials before replacing them for the clay renders.
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(out / 'review.blend'))
        clay = bpy.data.materials.new('White clay, no textures')
        clay.use_nodes = True
        bsdf = clay.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (.8, .8, .8, 1)
        bsdf.inputs['Roughness'].default_value = .65
        # Assign explicitly because EEVEE does not honor Cycles' material_override.
        for obj in meshes:
            obj.data.materials.clear()
            obj.data.materials.append(clay)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
        render(out, camera, 'clay-head-front.png', (0, -2, .852), (0, 0, .852), .405)
        render(out, camera, 'clay-head-45.png', (1.2, -1.2, .96), (0, 0, .842), .405)
        render(out, camera, 'clay-body-front.png', (0, -2, .5), (0, 0, .5), 1.12)
        a = math.sqrt(2)
        render(out, camera, 'clay-body-45.png', (a, -a, .5), (0, 0, .5), 1.12)
        (WORK / 'mesh-metrics.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    main()
