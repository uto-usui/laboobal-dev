"""Render defect witnesses without changing the source geometry or texture."""
import math
import bmesh
import bpy
import numpy as np
from fidelity_blender import GEN, coords, import_mesh, setup, setcoords, write


def inspect(out, studio, render, seed_list):
    import json
    transforms = json.loads((out / 'seed-transforms.json').read_text())
    cam = setup(studio)
    z = (1213 - 240) / 1177
    positions = [('front', (0, -2, z)),
                 ('45', (math.sqrt(2), -math.sqrt(2), z)),
                 ('left45', (-math.sqrt(2), -math.sqrt(2), z)),
                 ('side', (2, 0, z)), ('leftside', (-2, 0, z)),
                 ('back', (0, 2, z))]
    for seed in seed_list:
        obj = import_mesh(GEN / f'head-s{seed}.glb', f'inspect_seed_{seed}')
        tr = transforms[str(seed)]
        p = (coords(obj) - np.array(tr['initial_offset'])) * tr['initial_scale']
        p[:, 2] += 1
        setcoords(obj, p)
        render(out, cam, f'seed-{seed}-leftside.png', (-2, 0, z), (0, 0, z), 460 / 1177)
        # Welding only the diagnostic BMesh avoids counting split UV seams as holes.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        boundary = [e for e in bm.edges if e.is_boundary]
        vertex_edges = {}
        for edge in boundary:
            for vertex in edge.verts:
                vertex_edges.setdefault(vertex, []).append(edge)
        remaining = set(boundary)
        components = []
        while remaining:
            pending = [remaining.pop()]
            edges = []
            while pending:
                edge = pending.pop()
                edges.append(edge)
                for vertex in edge.verts:
                    for neighbor in vertex_edges[vertex]:
                        if neighbor in remaining:
                            remaining.remove(neighbor)
                            pending.append(neighbor)
            points = np.array([tuple(v.co) for e in edges for v in e.verts])
            components.append({'edges': len(edges),
                               'length_m': sum(e.calc_length() for e in edges),
                               'bounds_m': [points.min(0).tolist(), points.max(0).tolist()]})
        write(out / f'seed-{seed}-topology.json', {
            'source': f'img3d/fidelity/head-s{seed}.glb',
            'diagnostic_weld_distance_m': 1e-6,
            'vertices_after_diagnostic_weld': len(bm.verts),
            'boundary_edges': len(boundary),
            'boundary_components': sorted(components, key=lambda c: -c['length_m']),
            'note': 'Boundary counts alone do not distinguish the intended neck cut from hair defects; inspect the renders.'})
        bm.free()
        mat = bpy.data.materials.new(f'Neutral clay {seed}')
        mat.use_nodes = True
        bs = mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = (.45, .45, .45, 1)
        bs.inputs['Roughness'].default_value = .8
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for poly in obj.data.polygons:
            poly.material_index = 0
        for label, position in positions:
            render(out, cam, f'seed-{seed}-clay-{label}.png', position, (0, 0, z), 460 / 1177)
        obj.hide_render = True
        obj.hide_set(True)
