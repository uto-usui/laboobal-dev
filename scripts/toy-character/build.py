"""Rebuild from factory startup; fidelity repair .blend is a regenerated intermediate."""
import argparse
import subprocess
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from geometry import aim
from head import build_head
from validate import run_validation


def studio():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGBA'
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.55, .57, .62, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    nodes = scene.world.node_tree.nodes
    links = scene.world.node_tree.links
    camera_background = nodes.new('ShaderNodeBackground')
    camera_background.inputs[0].default_value = (.85, .83, .88, 1)
    camera_ray = nodes.new('ShaderNodeLightPath')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(camera_ray.outputs['Is Camera Ray'], mix.inputs[0])
    links.new(nodes['Background'].outputs[0], mix.inputs[1])
    links.new(camera_background.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes['World Output'].inputs['Surface'])
    scene.view_settings.view_transform = 'AgX'
    for name, position, power, size, color in [
        ('Key softbox', (-.45, -.65, 1.35), 24, .5, (1, .88, .77)),
        ('Fill softbox', (.50, -.38, .96), 10, .55, (.80, .87, 1)),
        ('Rim softbox', (.15, .48, 1.28), 8, .5, (1, .91, .79)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        aim(obj, (0, 0, .84))
    camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
    bpy.context.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    scene.camera = camera
    return camera


def render(out, camera, filename, position, target, scale):
    camera.location = position
    aim(camera, target)
    camera.data.ortho_scale = scale
    bpy.context.scene.render.filepath = str(out / filename)
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=['head', 'prepare', 'face', 'audit', 'fidelity-base', 'fidelity-seeds', 'fidelity-inspect', 'fidelity-rank', 'fidelity-fit', 'fidelity-repair', 'lowpoly', 'lowpoly-review', 'lowpoly2', 'lowpoly3', 'lowpoly4', 'lowpoly5', 'lowpoly6', 'lowpoly7', 'lowpoly8', 'lowpoly9', 'lowpoly10', 'bake', 'hair', 'hair2', 'hair3', 'hair4', 'color', 'recolor', 'eyes', 'export', 'display', 'display2', 'texture', 'edges'], default='head')
    from fidelity_options import add_seed_argument, unique_seeds
    add_seed_argument(parser)
    parser.add_argument('--out', type=Path, default=None)
    parser.add_argument('--face-pass', type=int, choices=[1,2,3], default=3)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    out = (args.out or Path('.work/toy-character') / ('lowpoly' if args.stage == 'lowpoly-review' else args.stage)).resolve()
    allowed = (HERE.parents[1] / '.work/toy-character').resolve()
    if not out.is_relative_to(allowed):
        parser.error('--out must be inside .work/toy-character')
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    if args.stage == 'edges':
        from edges import run
        run(out, studio, render)
        return
    if args.stage == 'texture':
        from texture import run
        run(out, studio, render)
        return
    if args.stage == 'display2':
        from display2 import run
        run(out, studio, render)
        return
    if args.stage == 'display':
        from display import run
        run(out, studio, render)
        return
    if args.stage == 'recolor':
        from recolor import run
        run(out, studio, render)
        return
    if args.stage == 'export':
        from export_stage import run
        run(out, studio, render)
        return
    if args.stage == 'eyes':
        from eyes import run
        run(out, studio, render)
        return
    if args.stage == 'color':
        from color import run
        run(out, studio, render)
        return
    if args.stage == 'hair4':
        from hair4 import run
        run(out, studio, render)
        return
    if args.stage == 'hair3':
        from hair3 import run
        run(out, studio, render)
        return
    if args.stage == 'hair2':
        from hair2 import run
        run(out, studio, render)
        return
    if args.stage == 'hair':
        from hair import run
        run(out, studio, render)
        return
    if args.stage == 'bake':
        from bake import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly10':
        from lowpoly10 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly9':
        from lowpoly9 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly8':
        from lowpoly8 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly7':
        from lowpoly7 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly6':
        from lowpoly6 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly5':
        from lowpoly5 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly4':
        from lowpoly4 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly3':
        from lowpoly3 import run
        run(out, studio, render)
        return
    if args.stage == 'lowpoly2':
        from lowpoly2 import run
        run(out, studio, render)
        review_python = HERE.parents[1] / '.work/toy-character/img3d/venv/bin/python'
        subprocess.run([str(review_python), str(HERE / 'lowpoly2_review.py'), str(out)], check=True)
        return
    if args.stage == 'lowpoly-review':
        from lowpoly import run_review
        run_review(out, studio, render)
        review_python = HERE.parents[1] / '.work/toy-character/img3d/venv/bin/python'
        subprocess.run([str(review_python), str(HERE / 'lowpoly_review.py'), str(out)], check=True)
        return
    if args.stage == 'lowpoly':
        from lowpoly import run
        run(out, studio, render)
        review_python = HERE.parents[1] / '.work/toy-character/img3d/venv/bin/python'
        subprocess.run([str(review_python), str(HERE / 'lowpoly_review.py'), str(out)], check=True)
        return
    if args.stage.startswith('fidelity-'):
        from fidelity_blender import run
        run(args.stage, out, studio, render, unique_seeds(args.seeds))
        return
    if args.stage == 'audit':
        from audit import run_audit
        run_audit(out)
        return
    if args.stage == 'prepare':
        from prepare import run_prepare
        run_prepare(out, studio, render)
        subprocess.run(['python3', str(HERE / 'review_images.py'), 'prepare', str(out)], check=True)
        return
    if args.stage == 'face':
        from face import run_face
        run_face(out, studio, render, args.face_pass)
        subprocess.run(['python3', str(HERE / 'review_images.py'), 'face', str(out)], check=True)
        return
    build_head()
    bpy.context.view_layer.update()
    camera = studio()
    # The 460 x 420 reference crop is padded to a square, with no silhouette fitting.
    scale = 460 / 1177
    front_target = (0, 0, (1213 - 220) / 1177)
    side_target = (0, (640 - 600) / 1177, (1213 - 220) / 1177)
    render(out, camera, 'front.png', (0, -2, front_target[2]), front_target, scale)
    render(out, camera, 'side.png', (-2, side_target[1], side_target[2]), side_target, scale)
    render(out, camera, 'lookdev-front.png', (0, -2, .852), (0, 0, .852), .405)
    render(out, camera, 'lookdev-3q.png', (1.2, -1.2, .96), (0, 0, .842), .405)
    for amount in [0, .5, 1]:
        for side in ['L', 'R']:
            bpy.data.objects['eyelid_' + side].data.shape_keys.key_blocks['blink_' + side].value = amount
        bpy.context.view_layer.update()
        render(out, camera, f'blink-{amount:g}.png', (0, -2, .852), (0, 0, .852), .405)
    for side in ['L', 'R']:
        bpy.data.objects['eyelid_' + side].data.shape_keys.key_blocks['blink_' + side].value = 0
    camera.location = (1.2, -1.2, .96)
    aim(camera, (0, 0, .842))
    bpy.context.scene.render.filepath = '//lookdev-3q.png'
    bpy.context.preferences.filepaths.save_version = 0
    run_validation(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'head.blend'))
    subprocess.run(['python3', str(HERE / 'compare.py'), str(out)], check=True)


if __name__ == '__main__':
    main()
