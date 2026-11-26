"""Geometry checks for the head stage, independent of lighting and screenshots."""
import hashlib
import json
import struct
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def geometry_digest():
    digest = hashlib.sha256()
    for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if obj.type not in {'MESH', 'CURVE'}:
            continue
        digest.update(obj.name.encode())
        digest.update(str(tuple(tuple(row) for row in obj.matrix_world)).encode())
        if obj.type == 'MESH':
            for v in obj.data.vertices:
                digest.update(struct.pack('<3f', *v.co))
            for p in obj.data.polygons:
                digest.update(struct.pack('<' + 'I' * len(p.vertices), *p.vertices))
            if obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks:
                    digest.update(key.name.encode())
                    for v in key.data:
                        digest.update(struct.pack('<3f', *v.co))
            for attr in obj.data.color_attributes:
                for color in attr.data:
                    digest.update(struct.pack('<4f', *color.color))
        else:
            digest.update(struct.pack('<f', obj.data.bevel_depth))
            for spline in obj.data.splines:
                for point in spline.bezier_points:
                    digest.update(struct.pack('<3f', *point.co))
    return digest.hexdigest()


def run_validation(out):
    skin = bpy.data.objects['head_skin']
    report = {
        'blender': bpy.app.version_string,
        'head_skin_faces': len(skin.data.polygons),
        'head_skin_all_quads': all(len(p.vertices) == 4 for p in skin.data.polygons),
        'unit': 'metres', 'full_height_m': 1.0,
        'reference_height_px': 1177, 'reference_head_height_px': 354,
        'head_height_ratio': 354 / 1177,
        'geometry_sha256': geometry_digest(),
        'objects': [], 'blink_checks': [],
    }
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    border = [e for e in bm.edges if e.is_boundary]
    report['head_skin_boundary_edges'] = len(border)
    report['head_skin_interior_nonmanifold_edges'] = sum(not e.is_manifold and not e.is_boundary for e in bm.edges)
    tree = KDTree(len(skin.data.vertices))
    for v in skin.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    for side in ['L', 'R']:
        lid = bpy.data.objects['eyelid_' + side]
        # The final annulus row is the boundary shared with the face.
        count = len(lid.data.vertices) // 21
        report['eyelid_' + side + '_boundary_error_m'] = max(tree.find(lid.matrix_world @ v.co)[2] for v in list(lid.data.vertices)[-count:])
        eye = bpy.data.objects['eye_' + side]
        bb_center = sum((Vector(c) for c in eye.bound_box), Vector()) / 8
        report['eye_' + side + '_origin_error_m'] = bb_center.length
    bm.free()
    for amount in [i / 20 for i in range(21)]:
        result = {'blink': amount}
        for side in ['L', 'R']:
            lid = bpy.data.objects['eyelid_' + side]
            lid.data.shape_keys.key_blocks['blink_' + side].value = amount
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for side in ['L', 'R']:
            lid = bpy.data.objects['eyelid_' + side].evaluated_get(depsgraph)
            data = lid.to_mesh()
            bvh = BVHTree.FromPolygons([v.co for v in data.vertices], [list(p.vertices) for p in data.polygons])
            _, _, _, distance = bvh.find_nearest(Vector((0, 0, 0)))
            result[side + '_min_clearance_m'] = distance - .024
            lid.to_mesh_clear()
        report['blink_checks'].append(result)
        if amount == 1:
            report['closed_catchlight_first_hit'] = {}
            for obj in bpy.context.scene.objects:
                if not obj.name.startswith('catchlight_'):
                    continue
                position = obj.matrix_world.translation
                hit = bpy.context.scene.ray_cast(depsgraph, Vector((position.x, -2, position.z)), Vector((0, 1, 0)))
                first = hit[4].name if hit[0] else None
                report['closed_catchlight_first_hit'][obj.name] = first
                assert first and first.startswith('eyelid_'), 'Catchlight must be hidden by the closed eyelid'
    for side in ['L', 'R']:
        bpy.data.objects['eyelid_' + side].data.shape_keys.key_blocks['blink_' + side].value = 0
    bpy.context.view_layer.update()
    report['blink_clearance_min_m'] = min(row[side + '_min_clearance_m'] for row in report['blink_checks'] for side in ['L', 'R'])
    for obj in bpy.context.scene.objects:
        if obj.type not in {'MESH', 'CURVE'}:
            continue
        entry = {'name': obj.name, 'type': obj.type}
        if obj.type == 'MESH' and obj.data.shape_keys:
            entry['shape_keys'] = list(obj.data.shape_keys.key_blocks.keys())
        report['objects'].append(entry)
    report['materials'] = [
        {'name': m.name,
         'subsurface_weight': m.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value,
         'nodes': sorted(n.bl_idname for n in m.node_tree.nodes)}
        for m in bpy.data.materials if m.use_nodes and m.node_tree.nodes.get('Principled BSDF')
    ]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    report['evaluated_geometry'] = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {'MESH', 'CURVE'}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        data = evaluated.to_mesh()
        report['evaluated_geometry'].append({'name': obj.name, 'vertices': len(data.vertices), 'triangles': sum(len(p.vertices) - 2 for p in data.polygons)})
        evaluated.to_mesh_clear()
    path = Path(out) / 'validation.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    assert report['head_skin_all_quads'], 'Head skin must contain only quads'
    assert report['head_skin_interior_nonmanifold_edges'] == 0
    assert report['blink_clearance_min_m'] > 0, 'Blink intersects the analytic eyeball sphere'
    for side in ['L', 'R']:
        assert report['eye_' + side + '_origin_error_m'] < 1e-6
        assert report['eyelid_' + side + '_boundary_error_m'] < 1e-6
    return report


if __name__ == '__main__':
    run_validation(Path(bpy.data.filepath).parent)
