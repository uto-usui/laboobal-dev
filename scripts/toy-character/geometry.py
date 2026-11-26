"""Reusable, deterministic mesh and Principled material helpers."""
import math
import bpy
from mathutils import Vector


def material(name, color, roughness=.42, metallic=0, coat=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = .3
    return mat


def mesh(name, vertices, faces, mat, sub=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if mat:
        data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    if sub:
        modifier = obj.modifiers.new('Surface smoothing', 'SUBSURF')
        modifier.levels = sub
        modifier.render_levels = sub
    return obj


def patch(name, nu, nv, fn, mat, sub=0, wrap=False):
    vertices = [fn(i / nu, j / nv) for j in range(nv + 1)
                for i in range(nu if wrap else nu + 1)]
    stride = nu if wrap else nu + 1
    faces = []
    for j in range(nv):
        for i in range(nu):
            k = j * stride + i
            nxt = j * stride + (i + 1) % stride
            faces.append((k, nxt, nxt + stride, k + stride))
    return mesh(name, vertices, faces, mat, sub)


def sphere(name, center, scale, mat, subdivisions=1):
    # Blender's UV-sphere operator can reorder faces between background runs.
    # Explicit rings keep topology order, subdivision and rasterization stable.
    segments, rings = 48, 32
    vertices = [(0, 0, scale[2]), (0, 0, -scale[2])]
    for j in range(1, rings):
        phi = math.pi * j / rings
        for i in range(segments):
            theta = 2 * math.pi * i / segments
            vertices.append((scale[0] * math.sin(phi) * math.cos(theta),
                             scale[1] * math.sin(phi) * math.sin(theta),
                             scale[2] * math.cos(phi)))
    faces = []
    for i in range(segments):
        faces.append((0, 2 + i, 2 + (i + 1) % segments))
    for j in range(rings - 2):
        for i in range(segments):
            a, b = 2 + j * segments + i, 2 + j * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    last = 2 + (rings - 2) * segments
    for i in range(segments):
        faces.append((1, last + (i + 1) % segments, last + i))
    obj = mesh(name, vertices, faces, mat, subdivisions)
    obj.location = center
    return obj


def tube(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 24
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    line = curve.splines.new('BEZIER')
    line.bezier_points.add(len(points) - 1)
    for p, co in zip(line.bezier_points, points):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    line.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def gauss(x, width):
    return math.exp(-(x / width) ** 2)
