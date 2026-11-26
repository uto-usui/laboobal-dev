"""Stage 7: new shared UV atlas and part-restricted Cycles texture transfer.

BAKE_PHASE allows resuming prepare, transfer, finish, render, or verify. Input
surfaces and rig are read-only; only UVs, seams and materials change on the lows.
"""
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import subprocess
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from lowpoly import WORK, activate, append, coords, triangles, write, subset
from lowpoly2 import reset_pose
from lowpoly_verify import visible
from fidelity_blender import apply_similarity, setcoords
from geometry import aim
import lowpoly9 as p9
from bake_settings import DISTANCES

HERE = Path(__file__).resolve().parent
PYTHON = WORK / 'venv-geo/bin/python'
LOW_NAMES = ['low6_body', 'low10_head']
PARTS = {2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes'}
# Total ray segment and outward start offset are both limited. No explicit cage:
# Blender ignores max_ray_distance with a user cage, which is unsafe for shells.


def log(out, message):
    print('BAKE', message, flush=True)
    with (out/'log.md').open('a') as f:
        f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def signature(o):
    h = hashlib.sha256()
    for a in [coords(o), triangles(o), np.array([p.use_smooth for p in o.data.polygons]), np.array([tuple(n.vector) for n in o.data.corner_normals])]:
        h.update(a.tobytes())
    for v in o.data.vertices:
        h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
    h.update(repr([(g.name,g.index) for g in o.vertex_groups]).encode())
    h.update(repr([(m.name,m.type, m.object.name if m.type=='ARMATURE' else '') for m in o.modifiers]).encode())
    return h.hexdigest()


def rig_signature(rig):
    return hashlib.sha256(repr([(b.name,b.parent.name if b.parent else None,list(b.head_local),list(b.tail_local),b.roll if hasattr(b,'roll') else list(b.matrix_local)) for b in rig.data.bones]).encode()).hexdigest()


def labels(o):
    key='part_id' if o.name==LOW_NAMES[0] else 'head_region'
    return np.array([v.value for v in o.data.attributes[key].data],np.int32)


def material_restore(out):
    # Source GLB is imported anew, rather than trusting clay inspection copies.
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(WORK/'img3d/out/v4-noglasses.glb'))
    imported=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
    assert len(imported)==1
    body=imported[0];body.data.transform(body.matrix_world);body.parent=None;body.matrix_world.identity()
    p=coords(body);lo=p.min(0);hi=p.max(0);p=(p-np.array([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]]))/(hi[2]-lo[2]);setcoords(body,p)
    # The labeled, welded high surface retains the GLB UV coordinates. Restore
    # the original material on it, preserving the exact stage-6 part labels.
    highbody=bpy.data.objects['high3_body_original'];highbody.data.materials.clear();highbody.data.materials.append(body.data.materials[0])
    for q in highbody.data.polygons:q.material_index=0
    head,cap=append(WORK/'fidelity/repaired-head.blend',['repaired_head_seed_42','hair_inner_cap_seed_42'])
    fit=json.loads((WORK/'fidelity/fit-landmarks.json').read_text())
    for obj in [head,cap]:
        p=apply_similarity(coords(obj),fit['isotropic_scale'],np.array(fit['image_translation_px']));p[:,1]+=fit['geometry']['neck_depth_translation_m'];setcoords(obj,p)
    old=bpy.data.objects['high3_head_original'];assert np.max(abs(coords(old)-coords(head)))<1e-6
    # Use exact label ordering from the geometrically identical reference.
    a=head.data.attributes.new('part2','INT','FACE');a.data.foreach_set('value',np.array([v.value for v in old.data.attributes['part2'].data]))
    head.name='bake_high_head';cap.name='bake_high_cap';body.name='bake_imported_body'
    highbody.name='bake_high_body'
    for obj in [head,cap,highbody]:obj.hide_set(False);obj.hide_render=True
    # Material metadata describes whether roughness is really an image or a
    # constant. The cap has no source image: its original black material is used.
    write(out/'source-materials.json',{o.name:[{'name':m.name,'images':[{'name':n.image.name,'size':list(n.image.size),'colorspace':n.image.colorspace_settings.name} for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image],'roughness_linked':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].is_linked} for m in o.data.materials] for o in [head,cap,highbody]})
    bpy.data.objects.remove(body,do_unlink=True)
    return highbody,head,cap


def uv_seams(o):
    """Semantic boundaries and back/inner paths, then angle-based unwrap."""
    lab=labels(o).copy();cent=coords(o)[triangles(o)].mean(1)
    if o.name==LOW_NAMES[0]:
        legs=lab==10
        # Each leg needs its own inner/back cut. An ankle/sole seam prevents a
        # closed shoe from collapsing to a subpixel UV tip under the trousers.
        lab[legs]=100+(cent[legs,0]>0)*3+(cent[legs,2]<.115)+(cent[legs,2]<.012)
    else:
        skin=lab==0;lab[skin&(cent[:,2]<.725)]=30;lab[skin&(cent[:,2]>=.725)&(cent[:,1]>.015)]=31
    bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.edges.ensure_lookup_table()
    for edge in bm.edges:
        edge.seam=len(edge.link_faces)!=2 or len({int(lab[f.index]) for f in edge.link_faces})>1
    # Each region gets a connected path up its back. It opens closed cylindrical
    # surfaces without cutting the front face or the visible outside of elbows.
    for pid in np.unique(lab):
        fs=[f for f in bm.faces if lab[f.index]==pid];vs={v for f in fs for v in f.verts};remaining=set(vs)
        while remaining:
            root=remaining.pop();component={root};stack=[root]
            while stack:
                v=stack.pop()
                for e in v.link_edges:
                    w=e.other_vert(v)
                    if w in remaining and any(lab[f.index]==pid for f in e.link_faces):remaining.remove(w);component.add(w);stack.append(w)
            if len(component)<8:continue
            start=min(component,key=lambda v:v.co.z);end=max(component,key=lambda v:v.co.z)
            if end.co.z-start.co.z<1e-5:continue
            # Rearward Y is preferred; X-center preference places head and trunk
            # cuts behind the crown/neck rather than on the front of the face.
            xs=[v.co.x for v in component];center=(min(xs)+max(xs))/2
            dist={start:0.};parent={};queue=[(0.,start.index,start)]
            while queue:
                d,_,v=heapq.heappop(queue)
                if d!=dist[v]:continue
                if v==end:break
                for e in v.link_edges:
                    w=e.other_vert(v)
                    if w not in component or not any(lab[f.index]==pid for f in e.link_faces):continue
                    mid=(v.co+w.co)*.5;penalty=1+max(0.,-mid.y)*120+abs(mid.x-center)*25;nd=d+e.calc_length()*penalty
                    if nd<dist.get(w,1e100):dist[w]=nd;parent[w]=(v,e);heapq.heappush(queue,(nd,w.index,w))
            while end in parent:
                prev,e=parent[end];e.seam=True;end=prev
    bm.to_mesh(o.data);bm.free();o.data.update()
    while o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='BakeUV')
    activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=0);bpy.ops.object.mode_set(mode='OBJECT')


def uv_prepare(out,lows):
    for o in lows:uv_seams(o)
    history=[]
    for attempt in range(20):
        activate(lows[0]);lows[1].select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.average_islands_scale();bpy.ops.object.mode_set(mode='OBJECT')
        o=lows[1];uv=np.array([x.uv[:] for x in o.data.uv_layers.active.data]);mask=np.repeat(labels(o)==0,3);uv[mask]*=1.5;o.data.uv_layers.active.data.foreach_set('uv',uv.ravel())
        activate(lows[0]);lows[1].select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=40/4096,shape_method='CONCAVE');bpy.ops.object.mode_set(mode='OBJECT')
        fields={}
        for i,o in enumerate(lows):
            fields[f'uv{i}']=np.array([x.uv[:] for x in o.data.uv_layers.active.data]).reshape(-1,3,2);fields[f'f{i}']=triangles(o);fields[f'p{i}']=coords(o);fields[f'part{i}']=labels(o)
        np.savez(out/'uv-fields.npz',**fields)
        subprocess.run([str(PYTHON),str(HERE/'bake_images.py'),str(out),'uv'],check=True)
        metric=json.loads((out/'uv-metrics.json').read_text());history.append({k:metric[k] for k in ['islands','unintended_triangle_overlap_pairs','zero_area_triangles','minimum_island_gap_px_2048']});write(out/'uv-seam-history.json',history)
        bad=np.load(out/'uv-bad-faces.npy')
        if not len(bad):break
        # Recursively open only charts with proven foldovers. A spatial bisect
        # adds connected seam chains; geometry, winding and weights stay intact.
        chart=np.load(out/'atlas-fields.npz')['chart'];offset=0
        for o in lows:
            n=len(o.data.polygons);localbad=bad[(bad>=offset)&(bad<offset+n)]-offset;ch=chart[offset:offset+n];p=coords(o);f=triangles(o);cent=p[f].mean(1);cutlabels=np.zeros(n,int)
            for cid in np.unique(ch[localbad]):
                ids=np.flatnonzero(ch==cid)
                if len(ids)<12:
                    cutlabels[ids]=np.arange(1,len(ids)+1)
                else:
                    axis=int(np.ptp(cent[ids],axis=0).argmax());middle=float(np.median(cent[ids,axis]));cutlabels[ids]=1+(cent[ids,axis]>middle)
            bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
            for e in bm.edges:
                if len(e.link_faces)==2 and cutlabels[e.link_faces[0].index]!=cutlabels[e.link_faces[1].index]:e.seam=True
            bm.to_mesh(o.data);bm.free();activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=0);bpy.ops.object.mode_set(mode='OBJECT');offset+=n
        log(out,f'UV島内の重なりを測定し、該当島だけ縫い目を追加: {attempt+1}回目')
    else:raise RuntimeError('UV foldovers remain after seam repair')
    assert metric['out_of_range_corners']==0 and metric['zero_area_islands']==0 and metric['minimum_island_gap_px_2048']>=39.9
    log(out,'UV の全面作り直し・顔の線形密度1.5倍・実測で2048px相当の島間40pxを確認。packの片側余白40/4096。')


def save(out,name):
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/name))


def prepare(out):
    source=WORK/'lowpoly10/character-lowpoly10.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig);lows=[bpy.data.objects[n] for n in LOW_NAMES]
    baseline={'input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'meshes':{o.name:signature(o) for o in lows},'rig':rig_signature(rig),'source_sha256':{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [WORK/'img3d/out/v4-noglasses.glb',WORK/'fidelity/repaired-head.blend']}}
    write(out/'baseline.json',baseline);material_restore(out);log(out,'入力を読み込み、元の画像材質を復元。高密度の体は元GLBと同じUVを持つラベル付き面、頭は等方スケール・並進のみ。')
    uv_prepare(out,lows)
    assert all(signature(o)==baseline['meshes'][o.name] for o in lows)
    save(out,'uv-checkpoint.blend')


def groups():
    body,head=[bpy.data.objects[n] for n in LOW_NAMES];hb=bpy.data.objects['bake_high_body'];hh=bpy.data.objects['bake_high_head'];cap=bpy.data.objects['bake_high_cap']
    bl=labels(body);hl=labels(head);hbl=np.array([a.value for a in hb.data.attributes['part_id'].data]);hhl=np.array([a.value for a in hh.data.attributes['part2'].data])
    return [(n,body,bl==pid,hb,hbl==pid) for pid,n in PARTS.items()]+[('face',head,hl==0,hh,hhl==0),('hair',head,hl==1,hh,hhl==1),('cap',head,hl==2,cap,np.ones(len(cap.data.polygons),bool))]


def emission(o,kind):
    originals=list(o.data.materials);slots=[p.material_index for p in o.data.polygons];o.data.materials.clear()
    for old in originals:
        mat=old.copy();o.data.materials.append(mat);nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');em=nodes.new('ShaderNodeEmission')
        if kind=='mask':em.inputs[0].default_value=(1,1,1,1)
        else:
            inp=bs.inputs['Base Color' if kind=='color' else ('Metallic' if kind=='metallic' else 'Roughness')]
            if inp.is_linked:links.new(inp.links[0].from_socket,em.inputs[0])
            else:
                value=inp.default_value;em.inputs[0].default_value=value if kind=='color' else (value,value,value,1)
        links.new(em.outputs[0],out.inputs['Surface'])
    for p,idx in zip(o.data.polygons,slots):p.material_index=idx


def transfer(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
    # Reduce per-part intermediate memory. Four float atlases are not held at once.
    manifest={'uv_sha256':hashlib.sha256((out/'uv-fields.npz').read_bytes()).hexdigest(),'baseline':json.loads((out/'baseline.json').read_text()),'distances':{n:list(v) for n,v in DISTANCES.items()},'resolution':4096,'blender':bpy.app.version_string}
    previous=json.loads((out/'transfer-inputs.json').read_text()) if (out/'transfer-inputs.json').exists() else None
    reuse=previous==manifest
    for name,low,keep,source,skeep in groups():
        folder=out/'parts'/name;folder.mkdir(parents=True,exist_ok=True)
        if reuse and all((folder/(kind+'.png')).exists() for kind in ['mask','color','normal','roughness','metallic']):log(out,name+' は入力が一致する保存済み5画像を再使用');continue
        high=subset(source,skeep,'transfer_source_'+name);target=subset(low,keep,'transfer_target_'+name)
        # Subsetting must not change the smooth tangent frame used by the final
        # mesh. Copy frozen corner normals from the intact mesh by face order.
        cn=np.array([tuple(n.vector) for n in low.data.corner_normals]).reshape(-1,3,3)[keep].reshape(-1,3)
        target.data.normals_split_custom_set(cn.tolist());target.modifiers.clear();target.parent=None
        for o in [target,high]:o.hide_set(False);o.hide_render=False
        mats=list(high.data.materials);indices=[p.material_index for p in high.data.polygons]
        target.data.materials.clear();mat=bpy.data.materials.new('Bake target '+name);mat.use_nodes=True;target.data.materials.append(mat)
        for p in target.data.polygons:p.material_index=0
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');mat.node_tree.nodes.active=node
        extrusion,distance=DISTANCES[name]
        for kind in ['mask','color','normal','roughness','metallic']:
            path=folder/(kind+'.png')
            if reuse and path.exists():continue
            high.data.materials.clear()
            for m in mats:high.data.materials.append(m)
            for p,idx in zip(high.data.polygons,indices):p.material_index=idx
            if kind!='normal':emission(high,kind)
            image=bpy.data.images.new('Transfer '+kind,width=4096,height=4096,alpha=True,float_buffer=False);image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color';image.generated_color=(0,0,0,0);node.image=image
            # Only this label's high surface participates, including at the
            # armpit and between sleeves/legs. Misses are measured before fill.
            activate(target);high.select_set(True)
            for o in scene.objects:
                if o.type=='MESH':o.hide_render=o not in [target,high]
            bpy.ops.object.bake(type='NORMAL' if kind=='normal' else 'EMIT',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z',use_selected_to_active=True,use_cage=False,cage_extrusion=extrusion,max_ray_distance=distance,margin=0,use_clear=True)
            image.filepath_raw=str(path);image.file_format='PNG';image.save();node.image=None;bpy.data.images.remove(image)
            log(out,f'{name}: {kind} を4096pxで転写。extrusion={extrusion*1000:g}mm、max ray distance={distance*1000:g}mm。')
        bpy.data.objects.remove(target,do_unlink=True);bpy.data.objects.remove(high,do_unlink=True)
    write(out/'transfer-inputs.json',manifest)
    log(out,'全12部位の色・接線法線・粗さ・metallic・対応マスクを保存。余白と未対応画素は別工程で同部位内から拡張する。')


def finish(out):
    subprocess.run([str(PYTHON),str(HERE/'bake_images.py'),str(out),'finish'],check=True)
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'));lows=[bpy.data.objects[n] for n in LOW_NAMES]
    mat=bpy.data.materials.new('Baked character color normal roughness');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=0
    images={}
    for kind in ['basecolor','normal','roughness','metallic-roughness']:
        image=bpy.data.images.load(str(out/(kind+'.png')),check_existing=False);image.colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color';image.pack();n=nodes.new('ShaderNodeTexImage');n.image=image;n.label=kind;images[kind]=n
    channels=nodes.new('ShaderNodeSeparateColor');links.new(images['metallic-roughness'].outputs['Color'],channels.inputs['Color']);links.new(channels.outputs['Blue'],bs.inputs['Metallic'])
    links.new(images['basecolor'].outputs['Color'],bs.inputs['Base Color']);links.new(images['roughness'].outputs['Color'],bs.inputs['Roughness']);normal=nodes.new('ShaderNodeNormalMap');normal.space='TANGENT';normal.uv_map='BakeUV';links.new(images['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    for o in lows:
        o.data.materials.clear();o.data.materials.append(mat)
        for p in o.data.polygons:p.material_index=0
    capmat=mat.copy();capmat.name='Baked inner hair cap';capmat.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=0
    lows[1].data.materials.append(capmat)
    for p,k in zip(lows[1].data.polygons,labels(lows[1])):
        if k==2:p.material_index=1
    baseline=json.loads((out/'baseline.json').read_text());assert all(signature(o)==baseline['meshes'][o.name] for o in lows);visible(lows);reset_pose(bpy.data.objects['temporary_rig']);save(out,'character-bake.blend');log(out,'2048pxの色と再正規化した法線、粗さを付与し、画像をBlendに同梱。形・三角形・スムーズ法線・ウェイト・仮骨のハッシュは入力と一致。')


def render_all(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-bake.blend'));scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.eevee.taa_render_samples=48;scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';cam=scene.camera;rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    for node in scene.world.node_tree.nodes:
        if node.type=='BACKGROUND' and node.name!='Background':node.inputs[0].default_value=(1,1,1,1);node.inputs[1].default_value=1
    lows=[bpy.data.objects[n] for n in LOW_NAMES];highs=[bpy.data.objects[n] for n in ['bake_high_body','bake_high_head','bake_high_cap']]
    for angle in [0,90,180,270]:
        for tag,objs in [('high',highs),('low',lows)]:p9.shot(out,cam,f'compare-{tag}-{angle}.png',objs,angle,target=(0,0,.5),height=1.25)
    for angle in [0,35]:
        for tag,objs in [('high',highs[1:]),('low',[lows[1]])]:p9.shot(out,cam,f'face-{tag}-{angle}.png',objs,angle,target=(0,-.03,.81),height=.30)
    for pose in ['rest','combo_left','neck_up10']:
        p9.pose(rig,pose);p9.shot(out,cam,f'demo-{pose}.png',lows,target=(0,0,.5),height=1.25,demo=True)
    for pose in ['rest','neck_left25','neck_right25']:
        p9.pose(rig,pose);p9.shot(out,cam,f'neck-{pose}.png',lows,target=(0,-.005,.695),height=.18)
    p9.pose(rig,'neck_up10')
    for angle in [0,55,-55]:p9.shot(out,cam,f'under-{angle}.png',lows,angle,target=(0,-.005,.718),height=.22)
    reset_pose(rig);visible(lows);p9.shot_camera_only(cam);save(out,'character-bake.blend')
    subprocess.run([str(PYTHON),str(HERE/'bake_images.py'),str(out),'review'],check=True);log(out,'同じ照明・カメラの4方向比較、デモ3姿勢、顔・首・髪裏の拡大を保存。')


def verify(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-bake.blend'));base=json.loads((out/'baseline.json').read_text());lows=[bpy.data.objects[n] for n in LOW_NAMES];report={'source_unchanged':hashlib.sha256((WORK/'lowpoly10/character-lowpoly10.blend').read_bytes()).hexdigest()==base['input_sha256'],'mesh_geometry_normals_weights_modifiers_unchanged':{o.name:signature(o)==base['meshes'][o.name] for o in lows},'rig_unchanged':rig_signature(bpy.data.objects['temporary_rig'])==base['rig'],'packed_images':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images if i.name in ['basecolor.png','normal.png','roughness.png','metallic-roughness.png']]};assert report['source_unchanged'] and all(report['mesh_geometry_normals_weights_modifiers_unchanged'].values()) and report['rig_unchanged'];write(out/'saved-verification.json',report)
    normal=bpy.data.images.get('normal.png');pixels=np.empty(len(normal.pixels),np.float32);normal.pixels.foreach_get(pixels);vectors=pixels.reshape(-1,4)[:,:3]*2-1
    report['normal_map_negative_z_texels']=int((vectors[:,2]<0).sum());report['normal_unit_length_max_quantization_error']=float(abs(np.linalg.norm(vectors,axis=1)-1).max())
    assert report['normal_map_negative_z_texels']==0 and report['normal_unit_length_max_quantization_error']<.008
    scene=bpy.context.scene;frame=np.array([list(v) for v in scene.camera.data.view_frame(scene=scene)]);report['camera_vertical_fov_degrees']=2*math.degrees(math.atan(abs(frame[0,1]/frame[0,2])));report['render_resolution']=[scene.render.resolution_x,scene.render.resolution_y]
    assert abs(report['camera_vertical_fov_degrees']-25)<.001 and report['render_resolution']==[1280,800]
    write(out/'saved-verification.json',report)
    m=json.loads((out/'metrics.json').read_text());m['preservation']=report;write(out/'metrics.json',m);log(out,'Blendを開き直して入力保持と同梱画像を再検査: '+json.dumps(report,ensure_ascii=False))


def run(out,studio,render):
    phase=os.environ.get('BAKE_PHASE','all');log(out,'工程7 開始 '+phase)
    for name,fn in [('prepare',prepare),('transfer',transfer),('finish',finish),('render',render_all),('verify',verify)]:
        if phase in ['all',name]:fn(out)
