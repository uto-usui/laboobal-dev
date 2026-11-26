"""Stages 10–11. Export a copy of the accepted eyes stage; resumable by EXPORT_PHASE."""
import os,json,time,hashlib,subprocess,math,shutil
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from lowpoly import WORK,activate,coords,triangles,subset,append,write
from lowpoly2 import reset_pose
from hair import preserved_fields,hashes,save
from geometry import aim
import lowpoly9 as p9
HERE=Path(__file__).resolve().parent
SOURCE=WORK/'eyes/character-eyes.blend'
PYTHON=WORK/'venv-geo/bin/python'

def log(out,s):
    print('EXPORT',s,flush=True)
    with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')
def external(out,phase):subprocess.run([str(PYTHON),str(HERE/'export_images.py'),str(out),phase],check=True)
def bones(rig):return [{'name':b.name,'parent':b.parent.name if b.parent else None,'head_m':list(b.head_local),'tail_m':list(b.tail_local),'matrix':list(map(list,b.matrix_local))} for b in rig.data.bones]
def img_pixels(im):
    a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);return a.reshape(im.size[1],im.size[0],4)
def image(out,im,name,size=None):
    if size:im.scale(*size)
    im.filepath_raw=str(out/name);im.file_format='PNG';im.save();im.pack();return im

def bake_emit(out,obj,socket,path,size=512,uv='EyeProjection'):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
    for q in scene.objects:
        if q.type=='MESH':q.hide_render=q!=obj;q.hide_set(q!=obj)
    activate(obj);obj.data.uv_layers.active_index=obj.data.uv_layers.find(uv);obj.data.uv_layers[uv].active_render=True
    m=obj.data.materials[0];n=m.node_tree.nodes;ln=m.node_tree.links
    output=next(q for q in n if q.type=='OUTPUT_MATERIAL');old=output.inputs[0].links[0].from_socket
    em=n.new('ShaderNodeEmission');ln.new(socket,em.inputs[0]);ln.new(em.outputs[0],output.inputs[0])
    im=bpy.data.images.new(path,width=size,height=size,alpha=False);im.colorspace_settings.name='Non-Color' if 'normal' in path else 'sRGB'
    target=n.new('ShaderNodeTexImage');target.image=im;n.active=target
    bpy.ops.object.bake(type='EMIT',use_selected_to_active=False,margin=8,use_clear=True)
    image(out,im,path);ln.new(old,output.inputs[0]);n.remove(em);n.remove(target)
    return im

def prepare(out):
    external(out,'measure');bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    before=bones(rig)
    # Read the tenth-pass skeleton itself, not a summary of an earlier rig.
    with bpy.data.libraries.load(str(WORK/'lowpoly10/character-lowpoly10.blend'),link=False) as (a,d):d.objects=['temporary_rig']
    old=d.objects[0];ref=bones(old);assert before==ref,'stage-6 pass-10 skeleton drift';bpy.data.objects.remove(old,do_unlink=True)
    chain=['root','spine.lower','spine.upper','spine.chest','neck','head']
    assert all(rig.data.bones[c].parent.name==p for p,c in zip(chain,chain[1:]))
    baseline={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bones':before,'stage6_pass10_exact':True,'fields':{n:hashes(preserved_fields(bpy.data.objects[n])) for n in ['low6_body','hair_preserved_head','hair_B']}}
    write(out/'baseline.json',baseline);rig.name='character_rig';rig.data.name='character_skeleton';rig['production_rig']=True
    rig['rotation_convention']='Blender world Z yaw / X pitch; glTF world Y yaw / X pitch. Conjugate through parent and rest axes, as lowpoly9.turn_world. Upper body 8 degrees = spine.upper 4 + spine.chest 4.'
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    log(out,'工程10: 全20骨の名前・親子・中心・軸が工程6の10回目と完全一致。配置とウェイトを保ち、character_rigへ改名。アニメーションは除外。')
    # Save accepted texture copies. Original image files and original blend stay read-only.
    used={n.image for m in bpy.data.materials if m.use_nodes and m.users for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
    names={'basecolor-body.png':'basecolor-body.png','normal.png':'normal.png','roughness.png':'roughness.png','metallic-roughness.png':'metallic-roughness.png','basecolor-hair.png':'basecolor-hair.png','normal.png.001':'hair-normal.png','roughness.png.001':'hair-roughness.png','metallic.png':'hair-metallic.png','iris-layer.png':'eye-iris.png','eye-patch-mask.png':'eye-patch-mask.png'}
    for im in used:
        if im.name in names:image(out,im,names[im.name],(2048,2048) if max(im.size)>2048 else None)
    # Keep the full compound eye material for EMIT conversion before glTF simplification.
    head=bpy.data.objects['hair_preserved_head'];keep=np.array([p.material_index==2 for p in head.data.polygons]);lids=subset(head,keep,'eye_lids')
    normals=preserved_fields(head,keep)['normal'].reshape(-1,3);lids.data.normals_split_custom_set(normals.tolist())
    mat=bpy.data.materials['Eyes / projected eyelid atlas'];lids.data.materials.clear();lids.data.materials.append(mat)
    for p in lids.data.polygons:p.material_index=0
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');normal=next(n for n in mat.node_tree.nodes if n.type=='NORMAL_MAP')
    for f in range(3):
        rig['eye_frame']=f;rig.update_tag();bpy.context.scene.frame_set(bpy.context.scene.frame_current);bpy.context.view_layer.update()
        bake_emit(out,lids,bs.inputs['Base Color'].links[0].from_socket,f'lids-{f}.png')
    bake_emit(out,lids,normal.inputs['Color'].links[0].from_socket,'lids-normal.png',2048,'BakeUV')
    # Split by removing faces only. Positions, original UVs, normals and weights
    # of the retained head surface are unchanged; lids retain those same faces.
    cn=preserved_fields(head,~keep)['normal'].reshape(-1,3)
    bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[p for i,p in enumerate(bm.faces) if keep[i]],context='FACES_ONLY');bm.to_mesh(head.data);bm.free();head.data.update();head.data.normals_split_custom_set(cn.tolist())
    rig['eye_frame']=0;rig.update_tag();bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    for name,new in [('low6_body','body'),('hair_preserved_head','head_face'),('hair_B','hair'),('eye_iris_layer','eye_iris')]:bpy.data.objects[name].name=new
    for o in [head,lids,bpy.data.objects['eye_iris']]:o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
    measurement=json.loads((out/'glasses-measurement.json').read_text());ratio=measurement['diameter_mm']/1.56
    for curve in json.loads((WORK/'eyes/glasses-curves.json').read_text()):
        ob=bpy.data.objects[curve['name']];points=curve['centerline'];tree=KDTree(len(points))
        for i,p in enumerate(points):tree.insert(p,i)
        tree.balance()
        for v in ob.data.vertices:
            c,idx,dist=tree.find(v.co);v.co=c+(v.co-c)*ratio
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render=False;o.hide_set(False)
    # Join frames and lenses only within their existing head-bone parenting.
    for kind,nameset in [('glasses_frame',['glasses_rim_L','glasses_rim_R','glasses_bridge','glasses_temple_L','glasses_temple_R']),('glasses_lens',['glasses_lens_L','glasses_lens_R'])]:
        ob=bpy.data.objects[nameset[0]];activate(ob)
        for n in nameset[1:]:bpy.data.objects[n].select_set(True)
        bpy.ops.object.join();ob.name=kind;assert ob.parent==rig and ob.parent_bone=='head'
    write(out/'rig.json',{'bones':bones(rig),'stage6_pass10_exact':True,'animated_bones':{b['name']:b for b in before if b['name'] in ['head','neck','spine.upper','spine.chest']},'axes':rig['rotation_convention']})
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render=False;o.hide_set(False)
    reset_pose(rig);save(out,'prepared.blend');log(out,f'工程10: v4の12断面の中央値から眼鏡直径 {measurement["diameter_mm"]:.3f}mmへ。中心線・位置・レンズを保持。目の同じ1751面をeye_lidsへ分離。')

def ao(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'prepared.blend'));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.bake_type='EMIT'
    highs=append(WORK/'bake/uv-checkpoint.blend',['bake_high_body','bake_high_head','bake_high_cap'])
    # Every high surface participates in occlusion, but only the matching source
    # is selected for projection. A short ray avoids projecting the opposite shell.
    for o in highs:o.hide_set(False);o.hide_render=False;o.modifiers.clear();o.parent=None
    m=bpy.data.materials.new('High-density AO source');m.use_nodes=True;n=m.node_tree.nodes;ln=m.node_tree.links;n.clear()
    a=n.new('ShaderNodeAmbientOcclusion');a.inputs['Distance'].default_value=.08;a.samples=32;a.inside=False;a.only_local=False
    em=n.new('ShaderNodeEmission');ln.new(a.outputs['AO'],em.inputs[0]);op=n.new('ShaderNodeOutputMaterial');ln.new(em.outputs[0],op.inputs[0])
    for o in highs:o.data.materials.clear();o.data.materials.append(m)
    report=[]
    for name,source,extrusion,distance in [('body',highs[0],.003,.005),('head',highs[1],.003,.005),('hair',highs[1],.006,.012)]:
        target=bpy.data.objects[{'body':'body','head':'head_face','hair':'hair'}[name]]
        if name=='head':
            # Head + eyelids share the accepted BakeUV atlas without overlap.
            target=target.copy();target.data=target.data.copy();bpy.context.collection.objects.link(target);target.name='AO head target';activate(target);bpy.data.objects['eye_lids'].select_set(True)
            # Joining a copy must not consume the production eyelids.
            bpy.data.objects['eye_lids'].select_set(False);lid=bpy.data.objects['eye_lids'].copy();lid.data=lid.data.copy();bpy.context.collection.objects.link(lid);lid.select_set(True);bpy.ops.object.join()
        else:
            original=target;target=target.copy();target.data=target.data.copy();bpy.context.collection.objects.link(target);target.name='AO '+name+' target'
        target.modifiers.clear();target.parent=None
        for o in scene.objects:
            if o.type=='MESH':o.hide_render=o not in highs+[target];o.hide_set(o not in highs+[target])
        target.visible_shadow=False;target.visible_diffuse=False;target.visible_glossy=False;target.visible_transmission=False
        im=bpy.data.images.new('ao-'+name,width=2048,height=2048,alpha=False);im.colorspace_settings.name='Non-Color';im.generated_color=(1,1,1,1)
        mt=bpy.data.materials.new('AO bake target '+name);mt.use_nodes=True;node=mt.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;mt.node_tree.nodes.active=node;target.data.materials.clear();target.data.materials.append(mt)
        target.data.uv_layers.active_index=0;target.data.uv_layers[0].active_render=True;activate(target);source.select_set(True)
        bpy.ops.object.bake(type='EMIT',use_selected_to_active=True,use_cage=False,cage_extrusion=extrusion,max_ray_distance=distance,margin=16,use_clear=False)
        image(out,im,'ao-'+name+'.png');report.append({'part':name,'source':source.name,'high_triangles':len(triangles(source)),'projection_extrusion_m':extrusion,'max_ray_distance_m':distance,'ao_distance_m':.08,'samples':32})
        bpy.data.objects.remove(target,do_unlink=True);log(out,'工程11: 高密度'+name+'のAOを2048pxへ焼き込み。')
    write(out/'ao-bake.json',report)
    external(out,'pack')

def tex(mat,out,name,uv='BakeUV',noncolor=False):
    n=mat.node_tree.nodes;ln=mat.node_tree.links;im=bpy.data.images.load(str(out/name),check_existing=False);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pack();q=n.new('ShaderNodeTexImage');q.image=im;q.name=name
    u=n.new('ShaderNodeUVMap');u.uv_map=uv;ln.new(u.outputs[0],q.inputs[0]);return q

def material(name):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;bs=n.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=.1;return m,bs

def orm(mat,bs,out,path):
    n=mat.node_tree.nodes;ln=mat.node_tree.links;t=tex(mat,out,path,noncolor=True);s=n.new('ShaderNodeSeparateColor');ln.new(t.outputs[0],s.inputs[0]);ln.new(s.outputs['Green'],bs.inputs['Roughness']);ln.new(s.outputs['Blue'],bs.inputs['Metallic'])
    # Blender's exporter recognizes this exact group as glTF's occlusion slot.
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    g=n.new('ShaderNodeGroup');g.node_tree=group;ln.new(s.outputs['Red'],g.inputs['Occlusion'])
    return s.outputs['Red']

def normal(mat,bs,out,path):
    t=tex(mat,out,path,noncolor=True);n=mat.node_tree.nodes.new('ShaderNodeNormalMap');n.uv_map='BakeUV';mat.node_tree.links.new(t.outputs[0],n.inputs['Color']);mat.node_tree.links.new(n.outputs[0],bs.inputs['Normal'])

def install(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'prepared.blend'));rig=bpy.data.objects['character_rig'];reset_pose(rig)
    for name,base,ormpath,norm in [('body','basecolor-body.png','character-orm.png','normal.png'),('head_face','basecolor-body.png','character-orm.png','normal.png'),('hair','basecolor-hair.png','hair-orm.png','hair-normal.png'),('eye_lids','eye-lids-atlas.png','character-orm.png','lids-normal.png')]:
        ob=bpy.data.objects[name];m,bs=material(name);t=tex(m,out,base,'EyeAtlas' if name=='eye_lids' else 'BakeUV');m.node_tree.links.new(t.outputs[0],bs.inputs['Base Color']);orm(m,bs,out,ormpath);normal(m,bs,out,norm);ob.data.materials.clear();ob.data.materials.append(m)
        for p in ob.data.polygons:p.material_index=0
        if name=='eye_lids':
            u=ob.data.uv_layers.new(name='EyeAtlas');src=ob.data.uv_layers['EyeProjection']
            for a,b in zip(u.data,src.data):a.uv=(b.uv.x/3,b.uv.y)
            ob['atlas_frames']='open,half,closed';ob['atlas_uv_layer']='EyeAtlas';ob['atlas_repeat_x']=1/3;ob['frame_uv_offset_step']=1/3
    ob=bpy.data.objects['eye_iris'];m,bs=material('eye_iris');t=tex(m,out,'eye-iris.png','EyeProjection');m.node_tree.links.new(t.outputs[0],bs.inputs['Base Color']);m.node_tree.links.new(t.outputs['Alpha'],bs.inputs['Alpha']);bs.inputs['Roughness'].default_value=.4;m.surface_render_method='DITHERED';m.alpha_threshold=.5;ob.data.materials.clear();ob.data.materials.append(m)
    ob['fixed_aperture_texture']='eye-aperture-orm.png';ob['fixed_aperture_channel']='R';ob['web_shader']='Multiply moving iris alpha by fixed aperture atlas R; round frame 0..2; closed aperture is zero. Keep these UV transforms independent.';ob['gaze_ranges']=json.dumps(json.loads((WORK/'eyes/gaze-ranges.json').read_text()))
    # Store the auxiliary aperture as a standard, fully neutral ORM texture.
    # Occlusion strength is patched to zero; R is available to the Web eye shader.
    t=tex(m,out,'eye-aperture-orm.png','EyeAperture',True);s=m.node_tree.nodes.new('ShaderNodeSeparateColor');m.node_tree.links.new(t.outputs[0],s.inputs[0]);m.node_tree.links.new(s.outputs['Green'],bs.inputs['Roughness']);m.node_tree.links.new(s.outputs['Blue'],bs.inputs['Metallic'])
    g=m.node_tree.nodes.new('ShaderNodeGroup');g.node_tree=bpy.data.node_groups['glTF Material Output'];m.node_tree.links.new(s.outputs['Red'],g.inputs['Occlusion'])
    uv=ob.data.uv_layers.new(name='EyeAperture')
    for a,b in zip(uv.data,ob.data.uv_layers['EyeProjection'].data):a.uv=(b.uv.x/3,b.uv.y)
    ob=bpy.data.objects['glasses_frame'];m=ob.data.materials[0];m.name='glasses_frame'
    ob=bpy.data.objects['glasses_lens'];m,bs=material('glasses_lens');bs.inputs['Base Color'].default_value=(.98,.99,1,1);bs.inputs['Transmission Weight'].default_value=1;bs.inputs['Roughness'].default_value=.035;bs.inputs['IOR'].default_value=1.45;bs.inputs['Specular IOR Level'].default_value=.1;ob.data.materials.clear();ob.data.materials.append(m);ob['thin_lens_thickness_m']=0.
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render=False;o.hide_set(False)
    for m in bpy.data.materials:
        if m.node_tree:m.node_tree.animation_data_clear()
    rig.animation_data_clear();reset_pose(rig)
    # Discard unreferenced diagnostic images, including the old >2048 atlases.
    referenced={n.image for o in bpy.data.objects if o.type=='MESH' for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
    for im in list(bpy.data.images):
        if im not in referenced:bpy.data.images.remove(im,do_unlink=True)
    assert all(max(i.size)<=2048 for i in referenced)
    for o in bpy.data.objects:
        if o.type=='MESH':o.data.name=o.name
    serialize(out)

def serialize(out):
    # Reuse the accepted geometry when replacing color textures only.
    rig=bpy.data.objects['character_rig']
    referenced={n.image for o in bpy.data.objects if o.type=='MESH' for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
    save(out,'character-export.blend')
    activate(rig)
    for o in bpy.data.objects:
        if o.type=='MESH':o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/'character-raw.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=True,export_morph=False,export_extras=True,export_cameras=False,export_lights=False,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=False,export_image_format='AUTO')
    # Auxiliary masks and metadata have an explicit runtime contract, without
    # depending on unsupported Blender shader graphs inside glTF.
    patch_glb(out)
    write(out/'blender-export.json',{'parts':{o.name:{'triangles':len(triangles(o)),'materials':[m.name for m in o.data.materials],'parent_bone':o.parent_bone,'uv_layers':[u.name for u in o.data.uv_layers]} for o in bpy.data.objects if o.type=='MESH'},'images':[{'name':i.name,'size':list(i.size)} for i in referenced],'rig':bones(rig)})
    log(out,'工程11: 7部品・20骨・アニメーションなしのGLBを書き出し。ORMのR=AO/G=粗さ/B=金属、目は独立したコマUVと黒目UV。')

def patch_glb(out):
    import struct
    path=out/'character-raw.glb';b=path.read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=b[20+jl:]
    for m in g['materials']:
        if m['name'] in ['body','head_face','hair','eye_lids']:m['occlusionTexture']['strength']=.35
        if m['name']=='eye_iris':
            m['alphaMode']='MASK';m['alphaCutoff']=.5;m['occlusionTexture']['strength']=0
            m['extras']={'fixedAperture':'occlusionTexture R; same atlas frame offset as eye_lids; do not offset with gaze','requiresWebEyeShader':True}
    # Ensure unused UV layers are retained for Web manipulations by requesting
    # each used mapping in the materials; no vertex UV is edited here.
    s=json.dumps(g,separators=(',',':')).encode();s+=b' '*((-len(s))%4);path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(s)+len(binary))+struct.pack('<I4s',len(s),b'JSON')+s+binary)

def compress(out):
    log(out,'工程11: 圧縮開始。標準meshoptコマンドの量子化はウェイトを変えるため、同じSDKの非量子化meshoptエンコーダーを使用する。')
    env=os.environ.copy();env['TOY_EXPORT_OUT']=str(out);env['TOY_EXPORT_SCRIPT']=str(HERE/'export_glb.mjs')
    subprocess.run(['pnpm','dlx','@gltf-transform/cli@4.5.1','webp',str(out/'character-raw.glb'),str(out/'character-webp.glb'),'--lossless','true','--effort','80'],check=True,env=env)
    subprocess.run(['pnpm','dlx','--package=@gltf-transform/cli@4.5.1','--package=gltf-validator','-c','node "$TOY_EXPORT_SCRIPT"'],check=True,env=env)
    log(out,'工程11: 圧縮・アクセサ値の完全一致検査・Validator APIの検査が完了。詳細はcompression.jsonとvalidator-*.json。')

def render_all(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-export.blend'));scene=bpy.context.scene
    # Retain the exact accepted lighting and camera, then import the decoded
    # final delivery file. The decoder changes storage only and was value-checked.
    for o in list(bpy.data.objects):
        if o.type in ['MESH','ARMATURE']:bpy.data.objects.remove(o,do_unlink=True)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m,do_unlink=True)
    for g in list(bpy.data.node_groups):bpy.data.node_groups.remove(g,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(out/'character-decoded.glb'))
    rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];assert len(rigs)==1;rig=rigs[0];rig.name='character_rig';objs=[o for o in bpy.data.objects if o.type=='MESH'];cam=scene.camera
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.transparent_max_bounces=16;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.film_transparent=True
    # Blender has no glTF occlusion input in its BSDF. For the review only,
    # multiply basecolor by the exported AO channel at exported strength 0.35.
    toggles=[]
    for name in ['body','head_face','hair','eye_lids']:
        ob=bpy.data.objects[name];m=ob.data.materials[0];bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');ormn=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and 'orm' in n.image.name.lower());sep=m.node_tree.nodes.new('ShaderNodeSeparateColor');m.node_tree.links.new(ormn.outputs[0],sep.inputs[0]);old=bs.inputs['Base Color'].links[0].from_socket;mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';m.node_tree.links.new(old,mix.inputs[1]);m.node_tree.links.new(sep.outputs['Red'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color']);toggles.append(mix)
    # Rebuild the documented independent aperture operation for Blender preview.
    iris=bpy.data.objects['eye_iris'];mi=iris.data.materials[0];ni=mi.node_tree.nodes;li=mi.node_tree.links;bi=next(n for n in ni if n.type=='BSDF_PRINCIPLED');ap=next(n for n in ni if n.type=='TEX_IMAGE' and 'aperture' in n.image.name);sep=ni.new('ShaderNodeSeparateColor');li.new(ap.outputs[0],sep.inputs[0]);mul=ni.new('ShaderNodeMath');mul.operation='MULTIPLY';li.new(bi.inputs['Alpha'].links[0].from_socket,mul.inputs[0]);li.new(sep.outputs['Red'],mul.inputs[1]);clip=ni.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.5;li.new(mul.outputs[0],clip.inputs[0]);li.new(clip.outputs[0],bi.inputs['Alpha'])
    # Blender's refraction on a single polygon bends the ray only once. The
    # source and Web zero-thickness limit instead use a transparent coated sheet.
    lens=bpy.data.objects['glasses_lens'].data.materials[0];n=lens.node_tree.nodes;ln=lens.node_tree.links;n.clear();tr=n.new('ShaderNodeBsdfTransparent');gl=n.new('ShaderNodeBsdfGlossy');gl.inputs['Roughness'].default_value=.06;fr=n.new('ShaderNodeFresnel');fr.inputs['IOR'].default_value=1.45;coat=n.new('ShaderNodeMath');coat.operation='MULTIPLY';coat.inputs[1].default_value=.2;ln.new(fr.outputs[0],coat.inputs[0]);mx=n.new('ShaderNodeMixShader');ln.new(coat.outputs[0],mx.inputs[0]);ln.new(tr.outputs[0],mx.inputs[1]);ln.new(gl.outputs[0],mx.inputs[2]);op=n.new('ShaderNodeOutputMaterial');ln.new(mx.outputs[0],op.inputs[0])
    def eyes(frame):
        lid=bpy.data.objects['eye_lids'];uv=lid.data.uv_layers[-1]
        if not hasattr(eyes,'uv'):eyes.uv=[q.uv.copy() for q in uv.data]
        for q,orig in zip(uv.data,eyes.uv):q.uv=(orig.x+frame/3,orig.y)
        iris=bpy.data.objects['eye_iris'];apuv=iris.data.uv_layers[-1]
        if not hasattr(eyes,'apuv'):eyes.apuv=[q.uv.copy() for q in apuv.data]
        for q,orig in zip(apuv.data,eyes.apuv):q.uv=(orig.x+frame/3,orig.y)
    def shot(name,face=False):
        if face:
            scene.render.resolution_x=scene.render.resolution_y=1024
            target=Vector(((427+200-627)/1177,0,(1213-100-200)/1177));cam.data.type='ORTHO';cam.data.ortho_scale=400/1177;cam.location=target+Vector((0,-3,0));aim(cam,target)
        else:
            scene.render.resolution_x=1280;scene.render.resolution_y=800;p9.shot_camera_only(cam)
        scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
    for on in [False,True]:
        for mix in toggles:mix.inputs[0].default_value=.35 if on else 0
        reset_pose(rig);eyes(0)
        for face,view in [(True,'face'),(False,'body')]:shot(f'ao-{"on" if on else "off"}-{view}.png',face)
    for p in ['rest','combo_left','closed']:
        p9.pose(rig,'combo_left' if p=='combo_left' else 'rest');eyes(2 if p=='closed' else 0);shot('roundtrip-'+p+'.png')
    reset_pose(rig);eyes(0);shot('glasses-face.png',True)
    eyes(0);reset_pose(rig);save(out,'character-roundtrip.blend')
    for o in [bpy.data.objects['glasses_frame'],bpy.data.objects['glasses_lens']]:o.hide_render=True
    for mx in toggles:mx.inputs[0].default_value=0
    for name in ['body','head_face','hair','eye_lids','eye_iris']:
        m=bpy.data.objects[name].data.materials[0];bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');sock=bs.inputs['Base Color'].links[0].from_socket;m.node_tree.links.new(sock,bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=1;m.node_tree.links.remove(bs.inputs['Base Color'].links[0]);bs.inputs['Base Color'].default_value=(0,0,0,1);bs.inputs['Specular IOR Level'].default_value=0
    scene.view_settings.view_transform='Standard'
    for f,name in enumerate(['open','half','closed']):eyes(f);shot('eye-512-'+name+'.png',True)
    external(out,'sheet');log(out,'検査: 圧縮後を復号したGLBをBlenderへ読み戻し、立ち姿・首左25度+上半身左8度・閉眼、AO比較と眼鏡比較をレンダ。')

def run(out,studio,render):
    phase=os.environ.get('EXPORT_PHASE','all');log(out,'開始 '+phase)
    for name,fn in [('prepare',prepare),('ao',ao),('install',install),('compress',compress),('render',render_all),('verify',lambda p:__import__('export_verify').run(p))]:
        if phase in ['all',name]:fn(out)
