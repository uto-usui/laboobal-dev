"""Import the immutable generated surface, preserving UV loops while welding seams."""
import hashlib
import json
from pathlib import Path

import bmesh
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.work/toy-character'
SOURCE = WORK / 'img3d/out/v4-noglasses.glb'
PARTS = ['head_face', 'hair', 'neck', 'torso', 'sleeve_L', 'sleeve_R',
         'hand_L', 'hand_R', 'backpack', 'shoulder_straps', 'legs_shoes']
COLORS = [(.92,.53,.30), (.15,.08,.24), (.9,.83,.37), (.15,.48,.82),
          (.15,.75,.43), (.04,.56,.63), (.91,.21,.46), (.64,.22,.74),
          (.87,.31,.08), (.74,.73,.12), (.30,.38,.50)]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def arrays(mesh):
    p = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', p)
    f = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', f)
    assert all(poly.loop_total == 3 for poly in mesh.polygons)
    return p.reshape(-1, 3), f.reshape(-1, 3)


def texture_colors(mesh):
    """Sample each face in UV space; Blender exposes image pixels in scene-linear RGB."""
    material = mesh.materials[0]
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    node = bsdf.inputs['Base Color'].links[0].from_node
    image = node.image
    pix = np.empty(len(image.pixels), np.float32)
    image.pixels.foreach_get(pix)
    pix = pix.reshape(image.size[1], image.size[0], 4)
    uv = np.empty(len(mesh.loops) * 2, np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 3, 2).mean(axis=1)
    x = np.floor(uv[:, 0] * image.size[0]).astype(int).clip(0, image.size[0]-1)
    y = np.floor(uv[:, 1] * image.size[1]).astype(int).clip(0, image.size[1]-1)
    return pix[y, x, :3]


def import_source():
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert len(objects) == 1
    obj = objects[0]
    obj.name = 'generated_high_density_source'
    obj.data.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()
    p, f = arrays(obj.data)
    low, high = p.min(axis=0), p.max(axis=0)
    # glTF's importer already maps Y-up to Z-up. Rendered texture features confirm -Y front.
    offset = np.array([(low[0]+high[0])/2, (low[1]+high[1])/2, low[2]])
    obj.data.vertices.foreach_set('co', (p-offset).ravel())
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before_vertices, before_faces = len(bm.verts), len(bm.faces)
    # Measure collapsed/duplicate faces before the weld operator removes them.
    from mathutils.kdtree import KDTree
    kd = KDTree(len(bm.verts))
    for i, v in enumerate(bm.verts):
        kd.insert(v.co, i)
    kd.balance()
    canonical = np.arange(len(bm.verts), dtype=np.int32)
    for i, v in enumerate(bm.verts):
        if canonical[i] != i:
            continue
        for _, j, _ in kd.find_range(v.co, 1e-6):
            canonical[j] = i
    remapped = canonical[f]
    collapsed = np.any(np.diff(np.sort(remapped, axis=1), axis=1) == 0, axis=1)
    _, multiplicity = np.unique(np.sort(remapped[~collapsed], axis=1), axis=0, return_counts=True)
    duplicate_excess = int(np.maximum(multiplicity-1, 0).sum())
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    p, f = arrays(obj.data)
    assert len(f) == 968114, 'Unexpected source/weld result; do not silently use another mesh.'
    for poly in obj.data.polygons:
        poly.use_smooth = True
    info = {
        'source': 'img3d/out/v4-noglasses.glb',
        'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'coordinates': {'up': '+Z', 'front': '-Y', 'character_left': '+X',
                        'units': 'metres', 'height': float(np.ptp(p[:,2])),
                        'translation_applied': (-offset).tolist(), 'scale_applied': [1,1,1],
                        'bounds': [p.min(axis=0).tolist(), p.max(axis=0).tolist()]},
        'weld': {'distance': 1e-6, 'vertices_before': before_vertices,
                 'vertices_after': len(p), 'triangles_before': before_faces,
                 'triangles_after': len(f), 'collapsed_faces_before_weld': int(collapsed.sum()),
                 'duplicate_excess_before_weld': duplicate_excess,
                 'note': 'UVs stay on face corners. Only coincident geometry is welded; no remesh/repair.'}}
    return obj, info
