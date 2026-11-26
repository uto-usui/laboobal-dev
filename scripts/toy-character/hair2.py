"""Rebake selected B without backing faces; never rebuild its surface or UVs."""
import collections
import hashlib
import json
import math
import os
import shutil
import subprocess
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from lowpoly import WORK, coords, triangles, subset, activate, write
from lowpoly_verify import visible
from lowpoly2 import reset_pose
from geometry import aim
from hair import log, save, preserved_fields, hashes, PYTHON
import bake
import hair_review as review
import lowpoly9 as p9

PREVIOUS=WORK/'hair'
BACKING='Hair backing neutral black'
HERE=Path(__file__).resolve().parent


def external(out, phase):
    subprocess.run([str(PYTHON),str(HERE/'hair2_images.py'),str(out),phase],check=True)


def camera(cam, angle=0, demo=False):
    target=Vector((0,0,.5) if demo else (0,-.03,.84));height=1.25 if demo else .38
    cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(25)
    distance=height/(2*math.tan(math.radians(12.5)))
    cam.location=(0,-distance,.64) if demo else target+Vector((distance*math.sin(math.radians(angle)),-distance*math.cos(math.radians(angle)),0))
    aim(cam,target);bpy.context.view_layer.update()


def bake_image(out, target, source, kind, material_id=False):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
    mat=target.data.materials[0];node=mat.node_tree.nodes.new('ShaderNodeTexImage');mat.node_tree.nodes.active=node
    image=bpy.data.images.new('hair2 '+kind,width=4096,height=4096,alpha=True)
    image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color';image.generated_color=(0,0,0,0);node.image=image
    if material_id:
        originals=list(source.data.materials);indices=[p.material_index for p in source.data.polygons]
        source.data.materials.clear()
        for old in originals:
            m=review.semantic_material('hit '+old.name,(1,0,0) if old.name==BACKING else (0,1,0));source.data.materials.append(m)
        for p,i in zip(source.data.polygons,indices):p.material_index=i
    elif kind!='normal':bake.emission(source,kind)
    visible([target,source]);activate(target);source.select_set(True)
    bpy.ops.object.bake(type='NORMAL' if kind=='normal' else 'EMIT',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z',use_selected_to_active=True,use_cage=False,cage_extrusion=.003,max_ray_distance=.005,margin=0,use_clear=True)
    image.filepath_raw=str(out/(kind+'-raw.png'));image.file_format='PNG';image.save()
    node.image=None;mat.node_tree.nodes.remove(node)
    return image


def target_copy(low):
    target=subset(low,np.ones(len(low.data.polygons),bool),'hair2_target');target.modifiers.clear();target.parent=None
    target.data.materials.clear();mat=bpy.data.materials.new('hair2 bake target');mat.use_nodes=True;target.data.materials.append(mat)
    for p in target.data.polygons:p.material_index=0
    return target


def diagnose(out):
    files=[PREVIOUS/'baked-checkpoint.blend',PREVIOUS/'character-hair.blend',WORK/'bake/character-bake.blend']+[p for folder in [WORK/'bake',PREVIOUS] for p in folder.rglob('*.png')]
    write(out/'input-hashes.json',{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
    external(out,'prepare')
    bpy.ops.wm.open_mainfile(filepath=str(PREVIOUS/'baked-checkpoint.blend'));scene,cam,rig=review.setup()
    high=bpy.data.objects['bake_high_head'];labels=np.array([a.value for a in high.data.attributes['part2'].data]);low=bpy.data.objects['hair_B']
    source=subset(high,labels==1,'hair2_original_source');target=target_copy(low)
    facecounts=collections.Counter(source.data.materials[p.material_index].name for p in source.data.polygons)
    image=bake_image(out,target,source,'material-id',True)
    pixels=np.empty(4096*4096*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(4096,4096,4)
    v=coords(low);f=triangles(low);tree=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True)
    uv=np.array([u.uv[:] for u in low.data.uv_layers.active.data]).reshape(-1,3,2)
    probes=np.load(out/'dark-pixels-before.npz');rows={};surface_rows={};projection_rows={}
    objects=[bpy.data.objects[n] for n in ['low6_body','hair_preserved_head','hair_B']]
    trees={o.name:BVHTree.FromPolygons(coords(o).tolist(),triangles(o).tolist(),all_triangles=True) for o in objects}
    for view in probes.files:
        demo=view=='demo-rest';angle=0 if demo else int(view.split('-')[1]);camera(cam,angle,demo)
        frame=np.array([tuple(p) for p in cam.data.view_frame(scene=scene)]);xmin,xmax=frame[:,0].min(),frame[:,0].max();ymin,ymax=frame[:,1].min(),frame[:,1].max();z=frame[0,2]
        counts=collections.Counter();surfaces=collections.Counter();projection=collections.Counter()
        for y,x in probes[view]:
            local=Vector((xmin+(x+.5)/1280*(xmax-xmin),ymax-(y+.5)/800*(ymax-ymin),z))
            direction=cam.matrix_world.to_3x3()@local;direction.normalize();hit,_,idx,dist=tree.ray_cast(cam.location,direction)
            visible_hits=[]
            for obj in objects:
                h,_,fi,dd=trees[obj.name].ray_cast(cam.location,direction)
                if h is not None:visible_hits.append((dd,obj,fi))
            if visible_hits:
                _,obj,fi=min(visible_hits,key=lambda r:r[0]);material=obj.data.materials[obj.data.polygons[fi].material_index].name;surfaces[obj.name+' / '+material]+=1
                if obj!=low:
                    projection[obj.name+' / '+material+' / '+('no_B_target' if hit is None else 'B_behind')]+=1
                    counts['occluded_by_'+obj.name+' / '+material]+=1;continue
            if hit is None:counts['no_B_hair_surface']+=1;continue
            a,b,c=[Vector(q) for q in v[f[idx]]]
            t=barycentric_transform(hit,a,b,c,*[Vector((q[0],q[1],0)) for q in uv[idx]])
            tx=int(np.clip(t.x*4096,0,4095));ty=int(np.clip(t.y*4096,0,4095));p=pixels[ty,tx]
            name=BACKING if p[0]>.5 else ('Material_0.002' if p[1]>.5 else 'no_source_hit_at_texel')
            counts[name]+=1
        rows[view]=dict(counts);surface_rows[view]=dict(surfaces);projection_rows[view]=dict(projection)
    total=collections.Counter()
    for name in ['demo-rest','face-0','face-35']:total.update(rows[name])
    report={'method':'Cycles material-ID EMIT bake at original B UV; same 4096px, cage extrusion3mm, max ray5mm, margin0; screen pixel centers raycast B and sample ID atlas nearest; no-source and absent B surface counted separately','occluded_B_target_projection':projection_rows,'visible_surface_materials':surface_rows,'source_faces_by_material':dict(facecounts),'views':rows,'three_view_total':dict(total),'black_patch_definition':'eroded high hair mask with enclosed mask holes filled; sRGB Rec709 brightness high minus B >=25 byte levels'}
    write(out/'diagnosis.json',report);log(out,'焼き直し前の材質集計 '+json.dumps(report,ensure_ascii=False))
    # This record is persisted before any backing-free color/normal/roughness bake.
    assert sum(total.values())>0


def transfer(out):
    assert (out/'diagnosis.json').exists()
    bpy.ops.wm.open_mainfile(filepath=str(PREVIOUS/'baked-checkpoint.blend'));review.setup()
    high=bpy.data.objects['bake_high_head'];labels=np.array([a.value for a in high.data.attributes['part2'].data]);keep=(labels==1)&np.array([high.data.materials[p.material_index].name!=BACKING for p in high.data.polygons])
    low=bpy.data.objects['hair_B'];target=target_copy(low);folder=out/'B';folder.mkdir(exist_ok=True)
    for n in ['uv-fields.npz','face-raster.npy','chart-raster.npy','uv-metrics.json','metallic-raw.png']:shutil.copyfile(PREVIOUS/'B'/n,folder/n)
    for kind in ['mask','color','normal','roughness']:
        source=subset(high,keep,'hair2_filtered_source');image=bake_image(folder,target,source,kind);bpy.data.images.remove(image);bpy.data.objects.remove(source,do_unlink=True);log(out,kind+' 裏打ちを除外して転写')
    subprocess.run([str(PYTHON),str(HERE/'hair_images.py'),str(folder),'finish'],check=True)
    shutil.copyfile(PREVIOUS/'B/metallic.png',folder/'metallic.png')
    log(out,'工程7と同じ3D最近傍・島内法線補間・6px拡張・2048px縮小。metallicは前回画像をそのまま保持。')


def install(out):
    bpy.ops.wm.open_mainfile(filepath=str(PREVIOUS/'baked-checkpoint.blend'));review.setup()
    low=bpy.data.objects['hair_B'];mat=low.data.materials[0].copy();mat.name='Hair B backing-free baked 2048'
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.label in ['basecolor','normal','roughness']:
            image=bpy.data.images.load(str(out/'B'/(node.label+'.png')),check_existing=False);image.colorspace_settings.name='sRGB' if node.label=='basecolor' else 'Non-Color';image.pack();node.image=image
    low.data.materials[0]=mat;save(out,'baked-checkpoint.blend')


def render(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'baked-checkpoint.blend'));scene,cam,rig=review.setup();objs=review.variants()['B']
    for angle in review.ANGLES:p9.shot(out,cam,f'face-new-{angle}.png',objs,angle,target=(0,-.03,.84),height=.38)
    for pose in ['rest','combo_left','neck_up10']:
        p9.pose(rig,pose);p9.shot(out,cam,f'demo-selected-{pose}.png',objs,target=(0,0,.5),height=1.25,demo=True)
    reset_pose(rig);masks=review.make_semantic_sets({'new':objs})['new'];scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=16
    for angle in review.ANGLES:p9.shot(out,cam,f'mask-face-new-{angle}.png',masks,angle,target=(0,-.03,.84),height=.38)
    p9.shot(out,cam,'mask-demo-new-rest.png',masks,target=(0,0,.5),height=1.25,demo=True)
    bpy.ops.wm.open_mainfile(filepath=str(out/'baked-checkpoint.blend'));scene,cam,rig=review.setup();objs=review.variants()['B'];visible(objs);p9.shot_camera_only(cam)
    for o in list(bpy.data.objects):
        if o.type=='MESH' and o not in objs:bpy.data.objects.remove(o,do_unlink=True)
    save(out,'character-hair2.blend')


def material_state(o):
    result=[]
    for mat in o.data.materials:
        nodes=[]
        for n in mat.node_tree.nodes:
            inputs=[]
            for socket in n.inputs:
                if not hasattr(socket,'default_value'):continue
                value=socket.default_value
                if not isinstance(value,(str,int,float,bool)):
                    try:value=list(value)
                    except TypeError:value=str(value)
                inputs.append((socket.identifier,value))
            image=getattr(n,'image',None)
            packed=hashlib.sha256(image.packed_file.data).hexdigest() if image and image.packed_file else None
            nodes.append((n.name,n.type,inputs,image.name if image else None,packed))
        result.append((mat.name,nodes,[(l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier) for l in mat.node_tree.links]))
    return result


def state():
    return {'objects':{n:{'fields':hashes(preserved_fields(bpy.data.objects[n])),'signature':bake.signature(bpy.data.objects[n]),'world_matrix':[list(row) for row in bpy.data.objects[n].matrix_world],'materials':material_state(bpy.data.objects[n]) if n!='hair_B' else None} for n in ['low6_body','hair_preserved_head','hair_B']},'rig':bake.rig_signature(bpy.data.objects['temporary_rig'])}


def verify(out):
    bpy.ops.wm.open_mainfile(filepath=str(PREVIOUS/'baked-checkpoint.blend'));review.setup();before=state()
    images=json.loads((out/'input-hashes.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair2.blend'));review.setup();after=state();report={'shape_normals_uv_weights_modifiers_and_rig_unchanged':before==after,'metallic_unchanged':(out/'B/metallic.png').read_bytes()==(PREVIOUS/'B/metallic.png').read_bytes(),'original_blends_and_images_unchanged':all(hashlib.sha256((WORK/n).read_bytes()).hexdigest()==h for n,h in images.items()),'hair_triangles':len(triangles(bpy.data.objects['hair_B']))}
    assert all(report[k] for k in report if k!='hair_triangles');assert report['hair_triangles']==14866
    write(out/'verification.json',report);log(out,'保存後の確認 '+json.dumps(report,ensure_ascii=False))


def run(out, studio, unused_render):
    phase=os.environ.get('HAIR2_PHASE','all');log(out,'開始 '+phase)
    for name,fn in [('diagnose',diagnose),('transfer',transfer),('install',install),('render',render),('verify',verify)]:
        if phase in ['all',name]:fn(out)
    if phase in ['all','measure']:external(out,'measure')
