"""Stage 8: immutable geometry, masked delit projection into the existing UVs.

COLOR_PHASE can resume export/raster/visibility/project/install/render/report/verify.
Run color_intrinsics.py once in venv-color before this stage.
"""
import os,json,hashlib,subprocess,time,math
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import WORK,coords,triangles,write
from lowpoly2 import reset_pose
from hair import hashes,preserved_fields,save
from hair3 import NAMES
import bake,hair_review,lowpoly9 as p9
from geometry import aim
HERE=Path(__file__).resolve().parent
SOURCE=WORK/'hair4/character-hair4.blend'
PYTHON=WORK/'venv-color/bin/python'

def log(out,s):
    print('COLOR',s,flush=True)
    with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def external(out,phase):subprocess.run([str(PYTHON),str(HERE/'color_process.py'),str(out),phase],check=True)

def state():
    return {'meshes':{n:{'signature':bake.signature(bpy.data.objects[n]),'fields':hashes(preserved_fields(bpy.data.objects[n])),'matrix':list(map(list,bpy.data.objects[n].matrix_world)),'material_indices':[p.material_index for p in bpy.data.objects[n].data.polygons]} for n in NAMES},'rig':bake.rig_signature(bpy.data.objects['temporary_rig']), 'noncolor_images':{i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file and ('normal' in i.name or 'roughness' in i.name)}}

def export(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));reset_pose(bpy.data.objects['temporary_rig'])
    baseline=state();baseline['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest();write(out/'baseline.json',baseline)
    inputs=[SOURCE,WORK/'fidelity/design-landmarks.json',WORK/'img3d/input/v4-noglasses.png']+[HERE.parents[1]/'docs/toy-character/design'/n for n in ['v4.png','turnaround-back.png','turnaround-side.png']]
    write(out/'input-hashes.json',{str(p.relative_to(HERE.parents[1])):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs})
    fields={}
    for i,name in enumerate(NAMES):
        o=bpy.data.objects[name];fields[f'p{i}']=coords(o);fields[f'f{i}']=triangles(o);fields[f'uv{i}']=np.array([q.uv[:] for q in o.data.uv_layers.active.data]).reshape(-1,3,2);fields[f'n{i}']=np.array([q.vector[:] for q in o.data.corner_normals]).reshape(-1,3,3)
        fields[f'part{i}']=bake.labels(o) if i<2 else np.ones(len(o.data.polygons),int)
        m=o.data.materials[0];bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');im=bs.inputs['Base Color'].links[0].from_node.image
        (out/('baked-hair.png' if i==2 else 'baked-body.png')).write_bytes(im.packed_file.data)
    np.savez_compressed(out/'mesh.npz',**fields)
    log(out,'入力の形・UV・法線・ウェイト・骨・非色画像のハッシュを固定。投影座標は原画の対応点と同じ x=627+1177X、y=1213−1177Z。原画の自動位置補正は使わない。')

def visibility(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    mesh=np.load(out/'mesh.npz');vs=[];fs=[];offset=0
    for i in range(3):
        v=mesh[f'p{i}'];vs.extend(v.tolist());fs.extend((mesh[f'f{i}']+offset).tolist());offset+=len(v)
    tree=BVHTree.FromPolygons(vs,fs,all_triangles=True);results={}
    # Rays start outside the complete model, so hair always occludes skin.
    for atlas in ['body','hair']:
        d=np.load(out/f'{atlas}-samples.npz');p=d['p'];normal=d['n'];result=[]
        for direction in [(0,-1,0),(0,1,0),(-1,0,0)]:
            dr=np.array(direction,float);ids=np.flatnonzero(normal@dr>.35);vis=np.zeros(len(p),bool);D=Vector(direction)
            for k in ids:
                P=Vector(p[k]);hit,_,fi,dist=tree.ray_cast(P+D*2,-D,2.00001)
                vis[k]=hit is not None and (hit-P).length<.00002
            result.append(vis)
        results[atlas]=np.array(result);log(out,atlas+' 最初の面だけを採用 '+str([int(x.sum()) for x in result]))
    np.savez_compressed(out/'visibility.npz',**results)

def install(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    for atlas,names in [('body',NAMES[:2]),('hair',NAMES[2:])]:
        im=bpy.data.images.load(str(out/f'basecolor-{atlas}.png'),check_existing=False);im.colorspace_settings.name='sRGB';im.pack()
        done=set()
        for name in names:
            for mat in bpy.data.objects[name].data.materials:
                if mat in done:continue
                done.add(mat);bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if bs:bs.inputs['Base Color'].links[0].from_node.image=im
    # Blender drops unused legacy images on save. Keep their packed bytes too.
    for image in bpy.data.images:
        if image.packed_file and image.users==0:image.use_fake_user=True
    expected=json.loads((out/'baseline.json').read_text());assert state()=={k:v for k,v in expected.items() if k!='source_sha256'}
    save(out,'character-color.blend');log(out,'ベースカラー2枚のみ差し替えて同梱。形・UV・ウェイト・法線・粗さ・骨は入力と完全一致。眼球・まぶた・眼鏡は作業していない。')

def emission(on):
    for name in NAMES:
        for m in bpy.data.objects[name].data.materials:
            nodes=m.node_tree.nodes;links=m.node_tree.links;bs=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
            if not bs:continue
            outnode=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
            if on:
                em=nodes.get('color diagnostic emission') or nodes.new('ShaderNodeEmission');em.name='color diagnostic emission';links.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs[0]);links.new(em.outputs[0],outnode.inputs['Surface'])
            else:links.new(bs.outputs[0],outnode.inputs['Surface'])

def render_all(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-color.blend'));scene,cam,rig=hair_review.setup();objs=[bpy.data.objects[n] for n in NAMES]
    for unlit in [True,False]:
        emission(unlit);scene.view_settings.view_transform='Standard' if unlit else 'AgX';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=48
        scene.render.resolution_x=scene.render.resolution_y=1254
        cam.data.type='ORTHO';cam.data.ortho_scale=1254/1177
        for view,sign in [('front',-1),('back',1)]:
            target=(0,0,(1213-627)/1177);cam.location=(0,sign*3,target[2]);aim(cam,target);scene.render.filepath=str(out/(f'{view}-'+('unlit.png' if unlit else 'lit.png')));bpy.ops.render.render(write_still=True)
    swaps={}
    for atlas,names in [('body',NAMES[:2]),('hair',NAMES[2:])]:
        diagnostic=bpy.data.images.load(str(out/f'parts-{atlas}.png'),check_existing=False)
        for name in names:
            for mat in bpy.data.objects[name].data.materials:
                bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if bs:
                    node=bs.inputs['Base Color'].links[0].from_node
                    if node not in swaps:swaps[node]=node.image;node.image=diagnostic
    emission(True);scene.view_settings.view_transform='Standard'
    for view,sign in [('front',-1),('back',1)]:
        target=(0,0,(1213-627)/1177);cam.location=(0,sign*3,target[2]);aim(cam,target);scene.render.filepath=str(out/f'{view}-parts.png');bpy.ops.render.render(write_still=True)
    for node,im in swaps.items():node.image=im
    emission(False);scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=1280;scene.render.resolution_y=800
    for name in ['rest','combo_left','neck_up10']:
        p9.pose(rig,name);p9.shot(out,cam,f'demo-{name}.png',objs,demo=True)
    reset_pose(rig)
    for name,angle,target,height in [('neck',0,(0,-.04,.695),.19),('ear-left',-65,(-.11,-.02,.79),.19),('ear-right',65,(.11,-.02,.79),.19),('hairline',0,(0,-.08,.88),.3),('cuff-left',-25,(-.21,-.03,.45),.21),('cuff-right',25,(.21,-.03,.45),.21),('strap-left',-25,(-.085,-.04,.585),.29),('strap-right',25,(.085,-.04,.585),.29),('backpack',180,(0,.13,.53),.42),('backpack-side',-90,(0,.13,.53),.4)]:
        for unlit in [True,False]:
            emission(unlit);scene.view_settings.view_transform='Standard' if unlit else 'AgX';p9.shot(out,cam,f'seam-{name}-'+('unlit.png' if unlit else 'lit.png'),objs,angle,target,height)
    # Reillumination makes any remaining painted shadow visible independently.
    reset_pose(rig);emission(False);scene.view_settings.view_transform='AgX'
    lights=[o for o in bpy.data.objects if o.type=='LIGHT'];orig=[(o.location.copy(),o.data.energy) for o in lights]
    for side in [-1,1]:
        for o in lights:o.data.energy=0
        lights[0].location=(side*.6,-.5,1.2);lights[0].data.energy=30;aim(lights[0],(0,0,.83));p9.shot(out,cam,f'relight-{side}.png',objs,target=(0,-.03,.84),height=.4)
    for o,(loc,energy) in zip(lights,orig):o.location=loc;o.data.energy=energy
    reset_pose(rig);p9.shot_camera_only(cam)
    # Diagnostic render settings and nodes are deliberately not saved over the asset.
    log(out,'正背面の照明なし／照明付き、工程6のデモ3姿勢、継ぎ目10か所2表示、左右の再照明をレンダー。')

def verify(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-color.blend'));expected=json.loads((out/'baseline.json').read_text());actual=state()
    result={'source_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==expected['source_sha256'],'preserved':{k:actual[k]==expected[k] for k in actual},'packed_basecolors':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images if 'basecolor-body' in i.name or 'basecolor-hair' in i.name],'blender':bpy.app.version_string}
    inputs=json.loads((out/'input-hashes.json').read_text());result['input_files_unchanged']={p:hashlib.sha256((HERE.parents[1]/p).read_bytes()).hexdigest()==h for p,h in inputs.items()}
    result['packed_basecolors_match_files']=all(hashlib.sha256(i.packed_file.data).hexdigest()==hashlib.sha256((out/i.name).read_bytes()).hexdigest() for i in bpy.data.images if i.name in ['basecolor-body.png','basecolor-hair.png'])
    write(out/'verification.json',result)
    if not all(result['preserved'].values()):write(out/'verification-differences.json',{'expected':expected,'actual':actual})
    assert result['source_unchanged'] and all(result['preserved'].values());assert len(result['packed_basecolors'])==2;assert all(result['input_files_unchanged'].values()) and result['packed_basecolors_match_files']
    write(out/'verification.json',result);metrics=json.loads((out/'metrics.json').read_text());metrics['verification']=result;write(out/'metrics.json',metrics);log(out,'保存し直して検証: '+json.dumps(result,ensure_ascii=False))

def run(out,studio,unused_render):
    phase=os.environ.get('COLOR_PHASE','all')
    for name,fn in [('export',export),('raster',lambda p:external(p,'raster')),('albedo',lambda p:external(p,'albedo')),('visibility',visibility),('project',lambda p:external(p,'project')),('install',install),('render',render_all),('report',lambda p:external(p,'report')),('measure',lambda p:subprocess.run([str(PYTHON),str(HERE/'color_validate.py'),str(p)],check=True)),('verify',verify)]:
        if phase in ['all',name]:fn(out)
