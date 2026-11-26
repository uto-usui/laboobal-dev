"""Render face-side IDs so cap removal cannot silently reveal skin backs."""
import bpy
from lowpoly import write
from lowpoly2 import reset_pose
import hair_review as review
import lowpoly9 as p9
from hair import log
from hair3 import OLD,NAMES,CAP,views


def sided(name,front,back):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear()
    g=n.new('ShaderNodeNewGeometry');mix=n.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(*front,1);mix.inputs[2].default_value=(*back,1)
    em=n.new('ShaderNodeEmission');o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(g.outputs['Backfacing'],mix.inputs[0]);m.node_tree.links.new(mix.outputs[0],em.inputs[0]);m.node_tree.links.new(em.outputs[0],o.inputs[0]);return m


def run(out):
    for tag,path in [('hair2',OLD/'character-hair2.blend'),('hair3',out/'character-hair3.blend')]:
        bpy.ops.wm.open_mainfile(filepath=str(path));scene,cam,rig=review.setup();objs=[bpy.data.objects[n] for n in NAMES]
        for obj in objs:
            for i,mat in enumerate(list(obj.data.materials)):
                front,back=((0,1,1),(0,1,1)) if mat.name==CAP else (((0,1,0),(1,0,1)) if obj.name=='hair_B' else (((1,1,0),(1,0,0)) if obj.name=='hair_preserved_head' else ((0,0,1),(0,0,1))))
                obj.data.materials[i]=sided('visibility '+obj.name+' '+str(i),front,back)
        scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=16
        for name,pose,angle,target,height,demo in views():
            p9.pose(rig,pose);p9.shot(out,cam,f'sides-{name}-{tag}.png',objs,angle,target,height,demo)
    log(out,'面の表裏の診断画像を前後で保存。肌裏=赤、髪裏=紫、旧キャップ=シアン。')
