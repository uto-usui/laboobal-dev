"""Original textured display surface; geometry work is separate from skinning.

DISPLAY_PHASE=prepare/simplify/build/render/poses/all, DISPLAY_LEVEL=100000 etc.
External geometry and image work always uses venv-geo. No authored vertex shape.
"""
import os, json, time, hashlib, subprocess, math
from pathlib import Path
import bpy, bmesh, numpy as np
from mathutils import Vector
from lowpoly import WORK, append, activate, coords, triangles, subset, write, source_inputs
from lowpoly2 import reset_pose
from hair import save
from geometry import aim
HERE=Path(__file__).resolve().parent
PYTHON=WORK/'venv-geo/bin/python'
LEVELS=(100000,200000,400000)

def log(out,s):
    print('DISPLAY',s,flush=True)
    with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def external(out,phase):
    subprocess.run([str(PYTHON),str(HERE/'display_process.py'),str(out),phase],check=True)

def dump(o,path):
    uv=np.zeros(len(o.data.loops)*2)
    if o.data.uv_layers:o.data.uv_layers[0].data.foreach_get('uv',uv)
    np.savez_compressed(path,p=coords(o),f=triangles(o),uv=uv.reshape(-1,3,2),mat=np.array([p.material_index for p in o.data.polygons]))

def prepare(out):
    body,labels,head,cap,_,_,raw=source_inputs(out)
    # The source label copy retains per-corner UVs through the earlier weld.
    body.data.materials.clear();body.data.materials.append(raw.data.materials[0])
    for p in body.data.polygons:p.material_index=0
    body=subset(body,~np.isin(labels,[0,1]),'display_high_body')
    head.name='display_high_head';cap.name='display_high_cap'
    bm=bmesh.new();bm.from_mesh(cap.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(cap.data);bm.free()
    visible=[body,head,cap]
    for o in list(bpy.data.objects):
        if o not in visible:bpy.data.objects.remove(o,do_unlink=True)
    for o in visible:o.hide_render=False;o.hide_set(False);o.modifiers.clear();o.parent=None
    textures=[]
    for o in visible:
        for m in o.data.materials:
            if not m or not m.use_nodes:continue
            for n in m.node_tree.nodes:
                if n.type=='TEX_IMAGE' and n.image:
                    im=n.image;name='source-'+o.name.replace('display_high_','')+'-'+str(len(textures))+'.png'
                    # Copy the original encoded image. Image.save() would re-encode a
                    # lossy source WebP even when the filename ends in .png.
                    import struct
                    glb=WORK/('img3d/out/v4-noglasses.glb' if o==body else 'img3d/fidelity/head-s42.glb')
                    binary=glb.read_bytes();length=struct.unpack_from('<I',binary,12)[0];g=json.loads(binary[20:20+length]);blob=binary[28+length:]
                    number=sum(t['part']==o.name for t in textures);view=g['bufferViews'][g['images'][number]['bufferView']];start=view.get('byteOffset',0)
                    (out/name).write_bytes(blob[start:start+view['byteLength']]);im.filepath_raw=str(out/name);im.pack()
                    textures.append({'part':o.name,'image':name,'size':list(im.size),'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()})
    for o in visible:dump(o,out/(o.name.replace('display_high_','')+'-source.npz'))
    write(out/'source.json',{'textures':textures,'triangles':{o.name:len(triangles(o)) for o in visible},'head_transform':'seed 42 repaired head and cap, similarity only; no fitted cage deformation','body':'original normalized to 1m, labels 0 and 1 removed; original corner UV retained','sha256':{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [WORK/'img3d/out/v4-noglasses.glb',WORK/'fidelity/repaired-head.blend',WORK/'export/character-export.blend']}})
    save(out,'source.blend')
    log(out,'1 入力: 元GLBを全高1mへ正規化した面のラベル0・1を除去。seed42の頭とキャップは相似変換だけ。元UVと画像を保存。頭と髪は同じ部品。')

def eye_reference(out,studio):
    from eyes import projection_camera
    from fidelity_blender import emission_materials
    bpy.ops.wm.open_mainfile(filepath=str(out/'source.blend'))
    head=bpy.data.objects['display_high_head']
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render=o!=head
    base=head.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
    write(out/'eye-source-texture.json',{'path':Path(base.filepath_raw).name,'size':list(base.size)})
    emission_materials(head);cam=studio();projection_camera(cam)
    scene=bpy.context.scene;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.resolution_x=scene.render.resolution_y=1024
    scene.render.filepath=str(out/'eye-source.png');bpy.ops.render.render(write_still=True)
    log(out,'5 新しい元頭の色を同じ投影カメラで確認。目の周囲以外のカラーは変更しない。')

def load_reduced(out,level):
    bpy.ops.wm.open_mainfile(filepath=str(out/'source.blend'))
    for key in ['body','head','cap']:
        o=bpy.data.objects['display_high_'+key];old=o.data;d=np.load(out/str(level)/(key+'.npz'))
        m=bpy.data.meshes.new(key+' display');m.from_pydata(d['p'].tolist(),[],d['f'].tolist());m.update()
        for mat in old.materials:m.materials.append(mat)
        m.polygons.foreach_set('material_index',d['mat'].astype(np.int32));uv=m.uv_layers.new(name='UVMap');uv.data.foreach_set('uv',d['uv'].ravel())
        high=o.copy();high.data=old;bpy.context.collection.objects.link(high);high.name='normal_source_'+key
        m.validate(verbose=True,clean_customdata=False);m.update()
        o.data=m;o.name={'body':'body','head':'head_face','cap':'hair'}[key]
        for p in m.polygons:p.use_smooth=True
        activate(o);norm=o.modifiers.new('Original surface normals','DATA_TRANSFER');norm.object=high;norm.use_loop_data=True;norm.data_types_loops={'CUSTOM_NORMAL'};norm.loop_mapping='POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier=norm.name);bpy.data.objects.remove(high,do_unlink=True)
    return [bpy.data.objects[n] for n in ['body','head_face','hair']]

def transfer(body,source,rig):
    for g in source.vertex_groups:body.vertex_groups.new(name=g.name)
    activate(body);mod=body.modifiers.new('Nearest Face Interpolated weights','DATA_TRANSFER');mod.object=source;mod.use_vert_data=True;mod.data_types_verts={'VGROUP_WEIGHTS'};mod.vert_mapping='POLYINTERP_NEAREST';mod.layers_vgroup_select_src='ALL';mod.layers_vgroup_select_dst='NAME';mod.mix_mode='REPLACE';mod.mix_factor=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    valid={b.name for b in rig.data.bones};names={g.index:g.name for g in body.vertex_groups}
    weights=[sorted([(names[g.group],g.weight) for g in v.groups if names[g.group] in valid and g.weight>0],key=lambda item:-item[1])[:4] for v in body.data.vertices]
    body.vertex_groups.clear();groups={n:body.vertex_groups.new(name=n) for n in sorted(valid)}
    for i,values in enumerate(weights):
        total=sum(v for _,v in values)
        for name,value in values:groups[name].add([i],value/total,'REPLACE')
    gaps=[v.index for v in body.data.vertices if not v.groups]
    assert not gaps, ('Unweighted vertices',len(gaps))
    assert max(abs(sum(g.weight for g in v.groups)-1) for v in body.data.vertices)<1e-6
    return {'method':'Blender DATA_TRANSFER / POLYINTERP_NEAREST / REPLACE / all vertex groups by name','source':'export/character-export.blend:body','max_influences':max(len(v.groups) for v in body.data.vertices),'max_sum_error':max(abs(sum(g.weight for g in v.groups)-1) for v in body.data.vertices),'unweighted':len(gaps)}

def skin(o,rig):
    o.parent=rig;mod=o.modifiers.new('20 bone display rig','ARMATURE');mod.object=rig

def fixed(o,rig):
    o.vertex_groups.clear();o.vertex_groups.new(name='head').add(list(range(len(o.data.vertices))),1,'REPLACE');skin(o,rig)

def eye_layers(out,head,rig):
    from eyes import eye_uv
    from export_stage import material,tex
    camera=json.loads((WORK/'eyes/projection-camera.json').read_text());eye_uv(head)
    p=coords(head);f=triangles(head);q=p[f]
    cx=(627+1177*q[:,:,0]-427)/400*1024;cy=(1213-1177*q[:,:,2]-100)/400*1024
    keep=(((cx.max(1)>240)&(cx.min(1)<478))|((cx.max(1)>538)&(cx.min(1)<778)))&(cy.max(1)>310)&(cy.min(1)<510)&(q[:,:,1].mean(1)<-.08)
    # Copy the actual surface, not a plane: all triangles follow the new cheek/eye curvature.
    lids=subset(head,keep,'eye_lids');iris=subset(head,keep,'eye_iris')
    for o in [lids,iris]:
        o.modifiers.clear();o.parent=None;o.data.materials.clear();o.data.uv_layers.active_index=0
        for p in o.data.polygons:p.material_index=0
    iris.location.y-=.0006
    # The eyelid material replaces these original faces, so the original pupils
    # are absent from the rendered face, rather than hidden by a second shell.
    bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for i,f in enumerate(bm.faces) if keep[i]],context='FACES_ONLY');bm.to_mesh(head.data);bm.free();head.data.update()
    mat,bs=material('eye_lids');t=tex(mat,out,'eye-lids-display.png','EyeAtlas');mat.node_tree.links.new(t.outputs[0],bs.inputs['Base Color']);lids.data.materials.append(mat)
    for o,name in [(lids,'EyeAtlas'),(iris,'EyeAperture')]:
        u=o.data.uv_layers.new(name=name);src=o.data.uv_layers['EyeProjection'];uv=np.array([v.uv[:] for v in src.data]);uv[:,0]/=3;u.data.foreach_set('uv',uv.ravel())
    mat,bs=material('eye_iris');t=tex(mat,WORK/'export','eye-iris.png','EyeProjection');mat.node_tree.links.new(t.outputs[0],bs.inputs['Base Color']);mat.node_tree.links.new(t.outputs['Alpha'],bs.inputs['Alpha']);mat.surface_render_method='DITHERED';iris.data.materials.append(mat)
    t=tex(mat,WORK/'export','eye-aperture-orm.png','EyeAperture',True);s=mat.node_tree.nodes.new('ShaderNodeSeparateColor');mat.node_tree.links.new(t.outputs[0],s.inputs[0]);mat.node_tree.links.new(s.outputs['Green'],bs.inputs['Roughness']);mat.node_tree.links.new(s.outputs['Blue'],bs.inputs['Metallic'])
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    g=mat.node_tree.nodes.new('ShaderNodeGroup');g.node_tree=group;mat.node_tree.links.new(s.outputs['Red'],g.inputs['Occlusion'])
    for o in [lids,iris]:fixed(o,rig);o.data.name=o.name
    write(out/'eye-surface.json',{'triangles':int(keep.sum()),'projection_camera':camera,'method':'replace original eye-region faces with same faces using projected atlas, old pupils replaced only within stage9 patch; original source textures stay unchanged','offset_m':{'lids':0,'iris':.0006}})
    return lids,iris

def build(out,level):
    target=out/str(level);target.mkdir(exist_ok=True)
    body,head,cap=load_reduced(out,level)
    rig,source,frame,lens=append(WORK/'export/character-export.blend',['character_rig','body','glasses_frame','glasses_lens'])
    source.name='weight_source';source.data.materials[0].name='weight_source_material';source.hide_render=True;source.hide_set(True);reset_pose(rig);rig.animation_data_clear()
    report=transfer(body,source,rig);skin(body,rig);fixed(head,rig);fixed(cap,rig)
    # The hair cap is retained as the hair node. Visible hair is part of head_face.
    for o in [body,head,cap]:
        o.data.name=o.name
    body.data.materials[0].name='body';head.data.materials[0].name='head_face';cap.data.materials[0].name='hair'
    lids,iris=eye_layers(out,head,rig)
    for o in [frame,lens]:
        assert o.parent==rig and o.parent_bone=='head'
    bpy.data.objects.remove(source,do_unlink=True)
    from export_stage import bones
    assert bones(rig)==json.loads((WORK/'export/rig.json').read_text())['bones'], '20 bone skeleton drift'
    report['rig_bones']=len(rig.data.bones);report['head_hair']='visible head+hair in head_face; inner cap in hair, both 100% head'
    write(target/'weights.json',report)
    save(target,'character-display.blend')
    # No additional AO: original generated textures already contain their shading.
    activate(rig)
    for o in bpy.data.objects:
        if o.type=='MESH':o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(target/'character-raw.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_influence_nb=4,export_morph=False,export_extras=True,export_cameras=False,export_lights=False,export_yup=True,export_texcoords=True,export_normals=True,export_image_format='AUTO')
    import struct
    path=target/'character-raw.glb';b=path.read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=b[20+jl:]
    for m in g['materials']:
        if m['name']=='eye_iris':m['alphaMode']='MASK';m['alphaCutoff']=.5;m['occlusionTexture']['strength']=0
        if m['name']=='eye_lids':m['alphaMode']='OPAQUE'
    s=json.dumps(g,separators=(',',':')).encode();s+=b' '*((-len(s))%4);path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(s)+len(binary))+struct.pack('<I4s',len(s),b'JSON')+s+binary)
    write(target/'parts.json',{o.name:{'triangles':len(triangles(o)),'materials':[m.name for m in o.data.materials]} for o in bpy.data.objects if o.type=='MESH'})
    log(out,f'3–6 {level}: Nearest Face Interpolatedで転送、4本以内へ正規化。頭・髪・目はhead 1.0、眼鏡は工程11のhead子を保持。元UVのカラー、AO追加なし。GLB書き出し。')

def review(out,level,studio,render,poses=False):
    if level=='source':bpy.ops.wm.open_mainfile(filepath=str(out/'source.blend'))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(out/str(level)/'character-display.blend'))
        # Measure geometry fidelity without the deliberately replaced eye pixels.
        head=bpy.data.objects['head_face'];meta=json.loads((out/'eye-source-texture.json').read_text())
        head.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image=bpy.data.images.load(str(out/meta['path']),check_existing=False)
        lid=bpy.data.objects['eye_lids'];lid.data.materials.clear()
        for mat in head.data.materials:lid.data.materials.append(mat)
        for uv in lid.data.uv_layers:uv.active_render=uv.name=='UVMap'
        lid.data.uv_layers.active_index=0
        for n in ['eye_iris','glasses_frame','glasses_lens']:bpy.data.objects[n].hide_render=True
    cam=studio();scene=bpy.context.scene;scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.render.resolution_x=1024;scene.render.resolution_y=1024
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    dest=out/str(level);dest.mkdir(exist_ok=True)
    shots=[('full',(0,-3,.762),(0,0,.5),1.25),('face',(0,-3,.87),(0,0,.855),.43),('body',(0,-3,.52),(0,0,.45),.68)]
    for name,pos,tar,scale in shots:render(dest,cam,name+'.png',pos,tar,scale)
    log(out,f'2 {level}: 同一カメラ・照明で全身、顔、胴をレンダ。')

def run(out,studio,render):
    phase=os.environ.get('DISPLAY_PHASE','all');level=os.environ.get('DISPLAY_LEVEL','all')
    if phase in ['all','prepare']:prepare(out)
    if phase in ['all','simplify']:external(out,'simplify')
    if phase in ['all','eye-reference']:eye_reference(out,studio)
    if phase in ['all','assets']:external(out,'assets')
    if phase in ['all','build']:
        for n in LEVELS if level=='all' else [int(level)]:build(out,n)
    if phase=='verify':verify(out,int(level))
    if phase=='poses':pose_review(out,int(level),studio,render)
    if phase in ['all','render']:
        for n in ['source',*LEVELS] if level=='all' else [level]:review(out,n,studio,render)


def pose_review(out,level,studio,render):
    from lowpoly2 import turn_world
    from mathutils.bvhtree import BVHTree
    bpy.ops.wm.open_mainfile(filepath=str(out/str(level)/'character-display.blend'))
    rig=bpy.data.objects['character_rig'];head=bpy.data.objects['head_face'];body=bpy.data.objects['body'];cam=studio();scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=1024
    # Geometry inspection keeps the native head texture, without eye overlays.
    for n in ['eye_lids','eye_iris','glasses_frame','glasses_lens']:bpy.data.objects[n].hide_render=True
    points=coords(head);low=points[:,2]<.725
    faces=triangles(head);edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1);e,c=np.unique(edges,axis=0,return_counts=True);ids=np.unique(e[c==1]);ids=ids[low[ids]]
    # Keep only the neck stub, excluding the bottom of hanging hair strands.
    ids=ids[(abs(points[ids,0])<.06)&(points[ids,1]<.025)&(points[ids,1]>-.12)]
    report={};deps=bpy.context.evaluated_depsgraph_get()
    for name,yaw,pitch,torso in [('rest',0,0,0),('left',-25,0,0),('right',25,0,0),('up',0,10,0),('down',0,-10,0),('left-up',-25,10,-8),('right-up',25,10,8),('left-down',-25,-10,-8),('right-down',25,-10,8)]:
        reset_pose(rig)
        for bone,amount in [('spine.upper',torso/2),('spine.chest',torso/2),('neck',yaw*.35),('head',yaw*.65)]:turn_world(rig,bone,(0,0,1),amount)
        # Match the Web's pitch split after yaw, using rest axes.
        from mathutils import Quaternion
        for bone,part in [('neck',.35),('head',.65)]:
            b=rig.pose.bones[bone];axis=b.bone.matrix_local.to_3x3().inverted()@Vector((1,0,0));b.rotation_quaternion=b.rotation_quaternion@Quaternion(axis,math.radians(pitch*part))
        bpy.context.view_layer.update();deps.update()
        ho=head.evaluated_get(deps);bo=body.evaluated_get(deps);hp=coords(ho);bp=coords(bo);tree=BVHTree.FromPolygons(bp.tolist(),triangles(bo).tolist(),all_triangles=True)
        distances=[tree.find_nearest(Vector(v))[3]*1000 for v in hp[ids]]
        report[name]={'yaw_deg':yaw,'pitch_deg':pitch,'torso_deg':torso,'neck_stub_boundary_vertices':len(ids),'nearest_body_surface_distance_mm':dict(zip(['p50','p95','max'],map(float,np.percentile(distances,[50,95,100])))) if distances else None,'note':'distance is geometric overlap/offset diagnostic, not an exposed gap measurement'}
        for angle in [0,45]:
            a=math.radians(angle);target=(0,-.01,.705);pos=(2*math.sin(a),-2*math.cos(a),.8)
            render(out,cam,f'neck-{name}-{angle}.png',pos,target,.22)
    write(out/'neck-geometry.json',report);log(out,'4 首の左右25°・上下10°、上半身8°と四隅の組合せをレンダ。首の元の重なりは変えていない。距離はneck-geometry.json。')


def verify(out,level):
    from export_stage import bones
    bpy.ops.wm.open_mainfile(filepath=str(out/str(level)/'character-display.blend'))
    rig=bpy.data.objects['character_rig'];expected=json.loads((WORK/'export/rig.json').read_text())['bones']
    assert bones(rig)==expected
    checks={'bones_exactly_equal_to_export':True,'bones':len(rig.data.bones),'rigid_parts':{}}
    for name in ['head_face','hair','eye_lids','eye_iris']:
        o=bpy.data.objects[name];indices={g.index:g.name for g in o.vertex_groups}
        assert all(len(v.groups)==1 and indices[v.groups[0].group]=='head' and v.groups[0].weight==1 for v in o.data.vertices)
        checks['rigid_parts'][name]='head 1.0 at every vertex'
    for name in ['glasses_frame','glasses_lens']:
        o=bpy.data.objects[name];assert o.parent==rig and o.parent_type=='BONE' and o.parent_bone=='head'
    body=bpy.data.objects['body'];groups=list(body.vertex_groups);weights=np.zeros((len(body.data.vertices),len(groups)))
    for v in body.data.vertices:
        assert len(v.groups)<=4
        for g in v.groups:weights[v.index,g.group]=g.weight
    assert np.max(abs(weights.sum(1)-1))<1e-6
    positions,inv,count=np.unique(np.round(coords(body),9),axis=0,return_inverse=True,return_counts=True)
    lo=np.full((len(positions),len(groups)),np.inf);hi=np.full_like(lo,-np.inf);np.minimum.at(lo,inv,weights);np.maximum.at(hi,inv,weights)
    checks['coincident_vertices']={'sets':int((count>1).sum()),'max_weight_difference':float(np.max(hi-lo))}
    assert checks['coincident_vertices']['max_weight_difference']<1e-6
    checks['max_weight_sum_error']=float(np.max(abs(weights.sum(1)-1)));checks['glasses_both_parented_to_head']=True
    write(out/'verification.json',checks);log(out,'C 最終の.blendを読み直し: 20骨は工程11と完全一致。頭・髪・目は全頂点head 1.0、眼鏡はhead子。体は4本以内・正規化済み、同じ位置の頂点の重み差0。')
