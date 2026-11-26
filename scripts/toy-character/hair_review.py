"""Fixed-camera color/semantic renders, majority selection and preservation checks."""
import hashlib
import json
import math
import subprocess
from pathlib import Path
import bpy
import numpy as np
from lowpoly import WORK, coords, triangles, subset, write
from lowpoly_verify import visible,topology
from lowpoly2 import reset_pose,evaluated
import lowpoly9 as p9
import bake
from hair import log,save,external,preserved_fields,hashes

ANGLES=[0,35,90,180]


def setup():
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.eevee.taa_render_samples=48;scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
    for node in scene.world.node_tree.nodes:
        if node.type=='BACKGROUND' and node.name!='Background':node.inputs[0].default_value=(1,1,1,1);node.inputs[1].default_value=1
    rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    return scene,scene.camera,rig


def variants():
    body=bpy.data.objects['low6_body'];preserved=bpy.data.objects['hair_preserved_head']
    return {'high':[bpy.data.objects[n] for n in ['bake_high_body','bake_high_head','bake_high_cap']],
            'stage7':[body,bpy.data.objects['low10_head']],
            **{t:[body,preserved,bpy.data.objects['hair_'+t]] for t in ['A','B']}}


def semantic_material(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();em=n.new('ShaderNodeEmission');em.inputs[0].default_value=(*color,1);out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(em.outputs[0],out.inputs[0]);return m


def make_semantic_sets(sets):
    mats=[semantic_material('mask skin',(1,0,0)),semantic_material('mask hair',(0,1,0)),semantic_material('mask other',(0,0,1))];mapping={};result={}
    for tag,objs in sets.items():
        result[tag]=[]
        for o in objs:
            if o not in mapping:
                q=o.copy();q.data=o.data.copy();q.name='semantic_'+o.name;bpy.context.collection.objects.link(q);mapping[o]=q
                if o.name=='bake_high_head':labels=np.array([a.value for a in o.data.attributes['part2'].data]);idx=np.where(labels==1,1,0)
                elif o.name in ['low10_head','hair_preserved_head']:labels=np.array([a.value for a in o.data.attributes['head_region'].data]);idx=np.where(labels==0,0,1)
                elif o.name.startswith('hair_') or o.name=='bake_high_cap':idx=np.ones(len(o.data.polygons),int)
                else:idx=np.full(len(o.data.polygons),2,int)
                q.data.materials.clear()
                for m in mats:q.data.materials.append(m)
                for p,i in zip(q.data.polygons,idx):p.material_index=int(i)
            result[tag].append(mapping[o])
    return result


def render_all(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'baked-checkpoint.blend'));scene,cam,rig=setup();sets=variants()
    for tag,objs in sets.items():
        for a in ANGLES:p9.shot(out,cam,f'face-{tag}-{a}.png',objs,a,target=(0,-.03,.84),height=.38)
        p9.shot(out,cam,f'demo-{tag}-rest.png',objs,target=(0,0,.5),height=1.25,demo=True)
    masks=make_semantic_sets(sets);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=16
    for tag,objs in masks.items():
        for a in ANGLES:p9.shot(out,cam,f'mask-face-{tag}-{a}.png',objs,a,target=(0,-.03,.84),height=.38)
        p9.shot(out,cam,f'mask-demo-{tag}-rest.png',objs,target=(0,0,.5),height=1.25,demo=True)
    # The masks are separate diagnostic copies; no materials in the saved scene
    # are changed. The fixed light rig and camera are identical for all colors.
    log(out,'高密度・工程7・A・Bの顔4方向とデモ正面、同カメラの部位マスクを保存。')


def final_render(out):
    metric=json.loads((out/'metrics.json').read_text());selected=metric['selected'];bpy.ops.wm.open_mainfile(filepath=str(out/'baked-checkpoint.blend'));scene,cam,rig=setup();objs=variants()[selected]
    for pose in ['rest','combo_left','neck_up10']:
        p9.pose(rig,pose);p9.shot(out,cam,f'demo-selected-{pose}.png',objs,target=(0,0,.5),height=1.25,demo=True)
    p9.pose(rig,'neck_up10')
    for a in [0,55,-55]:p9.shot(out,cam,f'under-selected-{a}.png',objs,a,target=(0,-.005,.718),height=.22)
    reset_pose(rig);visible(objs);p9.shot_camera_only(cam)
    # Retain source and rejected candidate only in checkpoints. Final file has
    # the body, unchanged nonhair head subset and selected rigid hair mesh.
    original=bpy.data.objects['low10_head'];lab=np.array([x.value for x in original.data.attributes['head_region'].data]);before=preserved_fields(original,lab!=1)['normal'].reshape(-1,3);after=preserved_fields(bpy.data.objects['hair_preserved_head'])['normal'].reshape(-1,3);dot=np.sum(before*after,axis=1)/(np.linalg.norm(before,axis=1)*np.linalg.norm(after,axis=1));angle=float(np.degrees(np.arccos(np.clip(dot,-1,1))).max());errors=json.loads((out/'subset-errors.json').read_text());errors['normal_angle_max_degrees']=angle;write(out/'subset-errors.json',errors)
    preserved=bpy.data.objects['hair_preserved_head']
    def face_weights(o,keep=None):
        values=[tuple(sorted((o.vertex_groups[g.group].name,round(g.weight,8)) for g in v.groups)) for v in o.data.vertices];f=triangles(o)
        if keep is not None:f=f[keep]
        return [[values[int(v)] for v in tri] for tri in f]
    facecheck={'weights_unchanged':face_weights(original,lab!=1)==face_weights(preserved),'materials_unchanged':[original.data.materials[p.material_index].name for p,k in zip(original.data.polygons,lab) if k!=1]==[preserved.data.materials[p.material_index].name for p in preserved.data.polygons]}
    assert all(facecheck.values());write(out/'head-subset-check.json',facecheck)
    keep=set(objs)|{rig,cam}
    for o in list(bpy.data.objects):
        if o.type=='MESH' and o not in keep:bpy.data.objects.remove(o,do_unlink=True)
    rig.animation_data_create()
    for pose in ['rest','combo_left','neck_up10']:
        p9.pose(rig,pose);action=bpy.data.actions.new('hair_'+pose);action.use_fake_user=True;rig.animation_data.action=action
        for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=1,group=bone.name)
        rig.animation_data.action=None
    reset_pose(rig);save(out,'character-hair.blend');log(out,selected+'を採用した最終Blendとデモ3姿勢・髪裏3方向を保存。')


def verify(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair.blend'));base=json.loads((out/'baseline.json').read_text());metric=json.loads((out/'metrics.json').read_text());selected=metric['selected'];body=bpy.data.objects['low6_body'];head=bpy.data.objects['hair_preserved_head'];hair=bpy.data.objects['hair_'+selected];rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    report={'source_blend_unchanged':hashlib.sha256((WORK/'bake/character-bake.blend').read_bytes()).hexdigest()==base['source_sha256'],
            'body_signature_unchanged':bake.signature(body)==base['body_signature'],'body_fields_unchanged':hashes(preserved_fields(body))==base['body_fields'],
            'head_subset_fields':{k:v==base['head_without_hair_fields'][k] for k,v in hashes(preserved_fields(head)).items()},
            'head_normal_subset_error':json.loads((out/'subset-errors.json').read_text())['normal'],'head_normal_angle_error_degrees':json.loads((out/'subset-errors.json').read_text())['normal_angle_max_degrees'],
            'stage7_images_unchanged':all(hashlib.sha256((WORK/'bake'/n).read_bytes()).hexdigest()==h for n,h in base['stage7_images'].items()),
            'rig_unchanged':bake.rig_signature(rig)==base['rig'],'head_weights_and_materials':json.loads((out/'head-subset-check.json').read_text()),'hair_armature_attached':any(m.type=='ARMATURE' and m.object==rig for m in hair.modifiers),'hair_head_weight_one':all(len(v.groups)==1 and hair.vertex_groups[v.groups[0].group].name=='head' and abs(v.groups[0].weight-1)<1e-7 for v in hair.data.vertices),
            'actual_triangles':sum(len(triangles(o)) for o in [body,head,hair]),'reserved_eyes_lids_glasses':5000,
            'packed_hair_images':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images if any((str(out/t)+'/') in bpy.path.abspath(i.filepath) for t in ['A','B'])]}
    report['total_with_reserve']=report['actual_triangles']+5000
    report['hair_rigid_motion_max_error_mm']={}
    for pose in ['combo_left','neck_up10']:
        p9.pose(rig,pose);transform=rig.pose.bones['head'].matrix @ rig.data.bones['head'].matrix_local.inverted();p=coords(hair);expected=p@np.array(transform)[:3,:3].T+np.array(transform)[:3,3];error=float(np.linalg.norm(evaluated(hair)-expected,axis=1).max()*1000);report['hair_rigid_motion_max_error_mm'][pose]=error;assert error<.002
    reset_pose(rig)
    for tag,row in metric['candidates'].items():row['total_triangles_with_5000_reserve']=len(triangles(body))+len(triangles(head))+row['triangles']+5000
    assert all(report[k] for k in ['source_blend_unchanged','body_signature_unchanged','body_fields_unchanged','stage7_images_unchanged','rig_unchanged','hair_armature_attached','hair_head_weight_one'])
    assert all(report['head_subset_fields'][k] for k in ['position','uv','smooth']) and report['total_with_reserve']<=65000
    metric['verification']=report;write(out/'metrics.json',metric);write(out/'saved-verification.json',report);log(out,'保存後の検査 '+json.dumps(report,ensure_ascii=False))


def run_review(out,phase):
    if phase in ['all','render']:render_all(out)
    if phase in ['all','render','measure']:
        external(out,'metrics');final_render(out);external(out,'sheet')
    if phase in ['all','render','measure','verify']:verify(out)
