"""Render the actual low surface and posed armature; never alter source geometry."""
import math
import bpy,numpy as np
from mathutils import Vector
from lowpoly import coords,triangles,write
from lowpoly_verify import visible
from lowpoly2 import clone,POSES,set_pose,reset_pose
from geometry import material


def render_all(out,lows,highs,rig,j,cam,render):
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=720
    scene.eevee.taa_render_samples=24
    scene.render.engine='BLENDER_EEVEE'
    scene.render.film_transparent=True
    for low,high in zip(lows,highs):
        if low.data.uv_layers and high.data.uv_layers:
            low.data.uv_layers.active.name=high.data.uv_layers.active.name
            low.data.uv_layers.active.active_render=True
    mats={o.name:list(o.data.materials) for o in lows}
    def view(filename,objs,angle=0,target=(0,0,.505),scale=1.09):
        visible(objs)
        a=math.radians(angle);target=Vector(target)
        render(out,cam,filename,target+Vector((2*math.sin(a),-2*math.cos(a),0)),target,scale)
    for a in [0,90,180,270]:
        for label,objects in [('high',highs),('low',lows)]:view(f'view-{label}-{a}.png',objects,a)
    clay=material('Lowpoly2 white inspection',(.70,.70,.70),.82)
    for o in lows:
        for i in range(len(o.data.materials)):o.data.materials[i]=clay
    for a in [0,90,180,270]:view(f'clay-{a}.png',lows,a)
    wiremat=material('Exact lowpoly edges',(.008,.012,.018),.8)
    wires=[]
    for o in lows:
        w=clone(o,'diagnostic_wire_'+o.name);w.data.materials.clear();w.data.materials.append(wiremat)
        for slot in w.material_slots:slot.link='DATA';slot.material=wiremat
        for p in w.data.polygons:p.material_index=0
        m=w.modifiers.new('Triangulation overlay','WIREFRAME');m.thickness=.00014;m.offset=0.;m.use_even_offset=False
        wires.append(w)
    for name,a,target,scale in [('front',0,(0,0,.505),1.09),('side',90,(0,0,.505),1.09),
          ('face',0,(0,-.04,.84),.36),('shoulder',25,j['shoulder_R'],.19),('elbow',25,j['elbow_R'],.17)]:
        for w in wires:w.modifiers[-1].thickness=scale*.85/720
        view('wire-'+name+'.png',lows+wires,a,target,scale)
    for w in wires:bpy.data.objects.remove(w,do_unlink=True)
    for pose in POSES:
        set_pose(rig,pose)
        for a in [0,35]:view(f'pose-{pose}-{a}.png',lows,a,scale=1.28)
        # The control locations move with the skeleton, so each crop follows the
        # tested joint even when the arm rises well beyond its rest position.
        side='L' if pose.startswith('arm_L') else 'R'
        for name,bone,scale in [('shoulder','upper_arm.'+side,.22),('elbow','forearm.'+side,.18),
               ('armpit','shoulder.'+side,.24),('neck','neck',.18)]:
            target=rig.pose.bones[bone].head.copy()
            if name=='armpit':target=rig.pose.bones['upper_arm.'+side].head.copy()
            view(f'close-{pose}-{name}.png',lows,25,target,scale)
        if pose=='rest' or pose.startswith('neck_'):
            for a in [0,90,180]:view(f'neck-{pose}-{a}.png',lows,a,(0,0,.689),.18)
    reset_pose(rig)
    for o in lows:
        for i,m in enumerate(mats[o.name]):o.data.materials[i]=m
    # Workbench alpha masks are fully opaque and independent of source UV alpha.
    scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='FLAT'
    scene.display.shading.color_type='SINGLE';scene.render.resolution_x=scene.render.resolution_y=1024
    for a in range(0,360,45):
        for label,objects in [('high',highs),('low',lows)]:view(f'mask-{label}-{a}.png',objects,a)
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=720
    heat=bpy.data.materials.new('Distance mm emission');heat.use_nodes=True
    nodes=heat.node_tree.nodes;nodes.clear();attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='distance_error'
    emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial')
    heat.node_tree.links.new(attr.outputs['Color'],emission.inputs[0]);heat.node_tree.links.new(emission.outputs[0],output.inputs[0])
    maps=[o for o in scene.objects if o.type=='MESH' and o.data.color_attributes.get('distance_error')]
    for mode in ['current','legacy']:
        objects=[o for o in maps if o.name.startswith('legacy_error_')==(mode=='legacy')]
        saved={o.name:list(o.data.materials) for o in objects}
        for o in objects:
            if not o.data.materials:o.data.materials.append(heat)
            for i in range(len(o.data.materials)):o.data.materials[i]=heat
        for a in [0,90,180,270]:view(f'outlier-{mode}-{a}.png',objects,a)
        view(f'outlier-{mode}-face.png',objects,0,(0,-.04,.84),.36)
        for o in objects:
            for i,m in enumerate(saved[o.name]):o.data.materials[i]=m
    # Retain every tested pose as an action, so the saved blend can be audited
    # without reconstructing rotations from the screenshots.
    rig.animation_data_create()
    for action in list(bpy.data.actions):
        if action.name.startswith('lowpoly2_'):bpy.data.actions.remove(action)
    for pose in POSES:
        set_pose(rig,pose)
        action=bpy.data.actions.new('lowpoly2_'+pose);action.use_fake_user=True
        rig.animation_data.action=action
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path='rotation_quaternion',frame=1,group=bone.name)
        rig.animation_data.action=None
    reset_pose(rig)
    visible(lows)
