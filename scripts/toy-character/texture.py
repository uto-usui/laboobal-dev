"""Re-atlas without changing surface/rig; bake emission from the original UVs."""
import os,json,math,subprocess,hashlib,shutil
from pathlib import Path
import bpy,numpy as np
from lowpoly import WORK,activate,coords,triangles,write
HERE=Path(__file__).resolve().parent

def digest(o):
    m=o.data
    m.calc_loop_triangles();li=np.array([t.loops[:] for t in m.loop_triangles],np.int32)
    normal=np.array([n.vector[:] for n in m.corner_normals],dtype=np.float32)[li]
    weights=[[(g.group,g.weight) for g in v.groups] for v in m.vertices]
    return {'positions':hashlib.sha256(coords(o).tobytes()).hexdigest(),'triangles':hashlib.sha256(triangles(o).tobytes()).hexdigest(),'normals':hashlib.sha256(normal.tobytes()).hexdigest(),'weights':hashlib.sha256(json.dumps(weights).encode()).hexdigest()}

def bake(out):
    bpy.ops.wm.open_mainfile(filepath=str(WORK/'display2/character-display2.blend'))
    bodymat=bpy.data.materials['body'];base=next(n for n in bodymat.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].links[0].from_node
    base.image=bpy.data.images.load(str(WORK/'img3d/out/v4-noglasses_base.png'),check_existing=False)
    before={o.name:digest(o) for o in bpy.data.objects if o.type=='MESH'}
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
    scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=32;scene.render.bake.margin_type='EXTEND';scene.render.bake.use_clear=True
    # Same-mesh emission baking avoids rays hitting the inner skin or hair cap.
    for name in ['body','head_face']:
        o=bpy.data.objects[name];m=o.data;activate(o)
        m.calc_loop_triangles(); loops=np.array([t.loops[:] for t in m.loop_triangles],np.int32)
        old=m.uv_layers[0];old.name='OriginalUV'
        olduv=np.array([v.uv[:] for v in old.data],np.float32)[loops]
        new=m.uv_layers.new(name='TextureUV');m.uv_layers.active=new;new.active_render=True
        source=out/(name+'-uv.npz')
        np.savez_compressed(source,p=coords(o),f=triangles(o),old=olduv)
        if not os.environ.get('TEXTURE_REUSE_ATLAS'):
            subprocess.run([str(WORK/'venv-geo/bin/python'),str(HERE/'texture_atlas.py'),str(source)],check=True)
        uv=np.load(out/(name+'-uv-atlas.npy'))
        loopids=loops.reshape(-1)
        ngons=[p for p in m.polygons if len(p.vertices)>3]
        if ngons:uv[:,:,1]*=.92
        flat=uv.reshape(-1,2);values=np.zeros((len(m.loops),2),np.float32);values[loopids]=flat
        # Keep the original collar n-gons and their exact custom normals.
        # Reserve a strip for planar per-polygon UVs, avoiding new seams
        # across their internal tessellation without editing the real mesh.
        columns=16;rows=math.ceil(len(ngons)/columns) if ngons else 0
        for i,poly in enumerate(ngons):
            ids=list(poly.loop_indices);points=np.array([m.vertices[m.loops[k].vertex_index].co[:] for k in ids]);center=points.mean(0)
            _,_,axes=np.linalg.svd(points-center,full_matrices=False);xy=(points-center)@axes[:2].T
            xy=(xy-xy.min(0))/np.maximum(np.ptp(xy,axis=0),1e-12)
            lo=np.array([(i%columns)/columns+.003,.92+(i//columns)*.08/rows+.002])
            span=np.array([1/columns-.006,.08/rows-.004]);values[ids]=lo+xy*span
        uv=values[loops]
        new.data.foreach_set('uv',values.reshape(-1))
        np.savez_compressed(source,p=coords(o),f=triangles(o),old=olduv,new=uv)
        image=bpy.data.images.new('texture-'+name,width=4096,height=4096,alpha=False);image.colorspace_settings.name='sRGB'
        restore=[]
        for mat in m.materials:
            # Do not edit a material shared by the separate inner hair cap.
            nodes=mat.node_tree.nodes;links=mat.node_tree.links
            oldmap=nodes.new('ShaderNodeUVMap');oldmap.uv_map='OriginalUV'
            for n in list(nodes):
                if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:links.new(oldmap.outputs['UV'],n.inputs['Vector'])
            output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');original=list(output.inputs['Surface'].links)
            original_socket=original[0].from_socket;shader=original_socket.node
            emission=nodes.new('ShaderNodeEmission')
            if shader.type=='BSDF_PRINCIPLED':
                base=shader.inputs['Base Color'];connection=list(base.links)
                if connection:links.new(connection[0].from_socket,emission.inputs['Color'])
                else:emission.inputs['Color'].default_value=base.default_value
            else:raise RuntimeError('Unexpected material '+mat.name)
            links.new(emission.outputs[0],output.inputs['Surface'])
            target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target;target.select=True
            restore.append((mat,original_socket,output,emission,target,shader))
        print('BAKE START',name,flush=True);bpy.ops.object.bake(type='EMIT')
        image.filepath_raw=str(out/(name+'-bake4096.png'));image.file_format='PNG';image.save()
        for mat,socket,output,emission,target,shader in restore:
            nodes=mat.node_tree.nodes;links=mat.node_tree.links;links.new(socket,output.inputs['Surface']);nodes.remove(emission)
            if mat.name in ['body','head_face']:
                uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='TextureUV';links.new(uvnode.outputs['UV'],target.inputs['Vector']);links.new(target.outputs['Color'],shader.inputs['Base Color'])
            else:nodes.remove(target)
        orm=bpy.data.images.new('texture-orm-'+name,width=4096,height=4096,alpha=False);orm.colorspace_settings.name='Non-Color'
        restore=[]
        for mat in m.materials:
            nodes=mat.node_tree.nodes;links=mat.node_tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');socket=output.inputs['Surface'].links[0].from_socket;shader=socket.node
            emission=nodes.new('ShaderNodeEmission')
            original_orm=next((n for n in nodes if n.type=='TEX_IMAGE' and n.image and Path(n.image.filepath).name in ['source-body-1.png','source-head-3.png']),None)
            if original_orm:links.new(original_orm.outputs['Color'],emission.inputs['Color'])
            else:emission.inputs['Color'].default_value=(0,shader.inputs['Roughness'].default_value,shader.inputs['Metallic'].default_value,1)
            links.new(emission.outputs[0],output.inputs['Surface']);target=nodes.new('ShaderNodeTexImage');target.image=orm;nodes.active=target
            restore.append((mat,socket,output,emission,target,original_orm))
        bpy.ops.object.bake(type='EMIT');orm.filepath_raw=str(out/(name+'-orm4096.png'));orm.file_format='PNG';orm.save()
        for mat,socket,output,emission,target,original_orm in restore:
            nodes=mat.node_tree.nodes;links=mat.node_tree.links;links.new(socket,output.inputs['Surface']);nodes.remove(emission);nodes.remove(target)
            if original_orm:
                original_orm.image=orm;uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='TextureUV';links.new(uvnode.outputs['UV'],original_orm.inputs['Vector'])
        print('BAKE END',name,flush=True)
    after={o.name:digest(o) for o in bpy.data.objects if o.type=='MESH'}
    write(out/'preservation-debug.json',{'before':before,'after':after})
    assert before==after,'Surface, corner normals or weights changed'
    write(out/'blender-preservation.json',{'before':before,'after':after,'exact_match':True,'triangles':sum(len(triangles(o)) for o in bpy.data.objects if o.type=='MESH'),'bones':len(bpy.data.objects['character_rig'].data.bones)})
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-texture.blend'))

def export(out,variant):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-texture.blend'))
    for name in ['body','head_face']:
        mat=bpy.data.materials[name];shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        tex=shader.inputs['Base Color'].links[0].from_node
        tex.image=bpy.data.images.load(str(out/(name+f'-{variant}.png')),check_existing=False);tex.image.name='texture-'+name
        orm=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('texture-orm-'))
        orm.image=bpy.data.images.load(str(out/(name+'-orm2048.png')),check_existing=False);orm.image.colorspace_settings.name='Non-Color'
        mesh=bpy.data.objects[name].data
        for layer in list(mesh.uv_layers):
            if layer.name!='TextureUV':mesh.uv_layers.remove(layer)
    activate(bpy.data.objects['character_rig'])
    for o in bpy.data.objects:
        if o.type=='MESH':o.select_set(True)
    dest=out/str(variant);dest.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(dest/'character-raw.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_influence_nb=4,export_morph=False,export_extras=True,export_cameras=False,export_lights=False,export_yup=True,export_texcoords=True,export_normals=True,export_image_format='AUTO',export_unused_textures=False)
    # Match display2's explicit eye alpha semantics.
    import struct
    path=dest/'character-raw.glb';b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[20+n:]
    for m in g['materials']:
        if m['name']=='eye_iris':m['alphaMode']='MASK';m['alphaCutoff']=.5;m['occlusionTexture']['strength']=0
        if m['name']=='eye_lids':m['alphaMode']='OPAQUE'
    s=json.dumps(g,separators=(',',':')).encode();s+=b' '*((-len(s))%4);path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(s)+len(binary))+struct.pack('<I4s',len(s),b'JSON')+s+binary)

def run(out,studio,render):
    phase=os.environ.get('TEXTURE_PHASE','all');env=os.environ.copy();env['TOY_TEXTURE_OUT']=str(out)
    python=str(WORK/'venv-geo/bin/python')
    if phase in ['all','bake']:bake(out)
    if phase in ['all','process']:subprocess.run([python,str(HERE/'texture_process.py')],check=True,env=env)
    if phase in ['all','export']:
        for v in [2,3]:export(out,v)
    if phase in ['all','compress']:
        env['TOY_TEXTURE_SCRIPT']=str(HERE/'texture_compress.mjs')
        subprocess.run(['pnpm','dlx','--package=@gltf-transform/cli@4.5.1','--package=gltf-validator','-c','node "$TOY_TEXTURE_SCRIPT"'],check=True,env=env)
    if phase in ['all','web']:subprocess.run([python,str(HERE/'texture_web.py')],check=True,env=env)
    if phase in ['all','measure']:subprocess.run([python,str(HERE/'texture_process.py'),'measure'],check=True,env=env)
    if phase in ['all','finish']:subprocess.run([python,str(HERE/'texture_finish.py')],check=True,env=env)
