"""Finish the accepted 400k surface by subtraction only; retain its rig and UVs."""
import os,json,math,struct,subprocess
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import WORK,coords,triangles,activate,write
from hair import save
from display import log
HERE=Path(__file__).resolve().parent

def remove_faces(o,mask):
    bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[f for i,f in enumerate(bm.faces) if mask[i]],context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(o.data);bm.free();o.data.update()

def finish(out):
    bpy.ops.wm.open_mainfile(filepath=str(WORK/'display/400000/character-display.blend'))
    for name in ['body','head_face','hair']:
        data=np.load(out/(name+'-inspect.npz'))
        assert np.array_equal(coords(bpy.data.objects[name]),data['p']) and np.array_equal(triangles(bpy.data.objects[name]),data['f']), 'inspection input drift'
    body=bpy.data.objects['body'];p=coords(body);f=triangles(body);q=p[f];c=q.mean(1)
    # This box contains the old skin rim, inside the two sides of the collar.
    # Delete the part above a plane; no new cap or replacement surface is made.
    region=(abs(c[:,0])<.050)&(c[:,1]>-.095)&(c[:,1]<.035)
    from fidelity_repair import texture_colors
    rgb=texture_colors(body).reshape(-1,3,3).mean(1)
    skin=(rgb[:,1]>rgb[:,0]*.32)&(rgb[:,1]>rgb[:,2]*.85)
    selected=region&skin&(q[:,:,2].max(1)>.675)
    bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table()
    tag=bm.faces.layers.int.new('trim_skin')
    chosen=[face for i,face in enumerate(bm.faces) if selected[i]]
    for face in chosen:face[tag]=1
    edges={e for face in chosen for e in face.edges};verts={v for face in chosen for v in face.verts}
    bmesh.ops.bisect_plane(bm,geom=[*verts,*edges,*chosen],dist=1e-8,plane_co=(0,0,.675),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    remove=[face for face in bm.faces if face[tag] and face.calc_center_median().z>.6750001]
    removed=len(remove);bmesh.ops.delete(bm,geom=remove,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(body.data);bm.free();body.data.update()
    # BMesh carries the original corner-normal layer; the cut stays hidden.
    write(out/'neck-edit.json',{'identity':'body: original neck skin upper rim and folded inward-facing triangles; not head_face and not a new cap','method':'bisect only original body skin at z=.675m; delete above plane, leave open inside head/collar; UV and weights interpolated by BMesh','cut_z_m':.675,'selected_original_triangles':int(selected.sum()),'removed_cut_faces':removed,'before_triangles':len(f),'after_triangles':len(triangles(body))})
    head=bpy.data.objects['head_face'];p=coords(head);f=triangles(head);fl=np.load(out/'head_face-face-components.npy');rows=json.loads((out/'components.json').read_text())['head_face']
    tree=BVHTree.FromPolygons(p.tolist(),f[fl==0].tolist(),all_triangles=True)
    visibility_p=[p];visibility_f=[f];offset=len(p)
    for occluder in [body,bpy.data.objects['hair']]:
        points=coords(occluder);visibility_p.append(points);visibility_f.append(triangles(occluder)+offset);offset+=len(points)
    full=BVHTree.FromPolygons(np.concatenate(visibility_p).tolist(),np.concatenate(visibility_f).tolist(),all_triangles=True)
    selected=[]
    for r in rows:
        if r['id']==0 or r['hi'][2]>.743 or r['lo'][2]<.69 or r['faces']>60:continue
        ids=np.where(fl==r['id'])[0];pts=p[np.unique(f[ids])];extent=np.ptp(pts,axis=0)
        # Exclude the neck and skin, and retain substantial hair strands.
        if max(extent)>.025 or abs(r['center'][0])<.052:continue
        dist=[tree.find_nearest(Vector(v))[3] for v in pts]
        if min(dist)<.00012:continue
        visible=False
        for yaw,pitch in [(0,0),(0,10),(-25,10),(25,10),(-25,-10),(25,-10)]:
            y=math.radians(yaw);a=math.radians(pitch);direction=Vector((math.sin(y)*math.cos(a),math.cos(y)*math.cos(a),-math.sin(a)))
            for fi in ids:
                center=Vector(p[f[fi]].mean(0));hit=full.ray_cast(center-direction*2,direction)
                if hit[2] is not None and hit[2]<len(f) and fl[hit[2]]==r['id']:visible=True;break
            if visible:break
        if visible:selected.append({**r,'nearest_shell_mm':min(dist)*1000})
    mask=np.isin(fl,[r['id'] for r in selected]);np.save(out/'hair-removed-face-ids.npy',np.where(mask)[0]);write(out/'hair-edit.json',{'removed_components':len(selected),'removed_triangles':int(mask.sum()),'components':selected,'preserved':'principal head/hair component and inner cap untouched; no contour clipping; only separate lower fragments visible from front/up10 and demo corner directions'})
    remove_faces(head,mask)
    log(out,f'首の体側上端をz=.675mで切除、髪の浮いた独立成分 {len(selected)} 個/{int(mask.sum())} 面を除去。40万段を再減面せず保持。')
    save(out,'character-display2.blend')
    rig=bpy.data.objects['character_rig'];activate(rig)
    for o in bpy.data.objects:
        if o.type=='MESH':o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/'character-raw.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_influence_nb=4,export_morph=False,export_extras=True,export_cameras=False,export_lights=False,export_yup=True,export_texcoords=True,export_normals=True,export_image_format='AUTO')
    path=out/'character-raw.glb';b=path.read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=b[20+jl:]
    for m in g['materials']:
        if m['name']=='eye_iris':m['alphaMode']='MASK';m['alphaCutoff']=.5;m['occlusionTexture']['strength']=0
        if m['name']=='eye_lids':m['alphaMode']='OPAQUE'
    s=json.dumps(g,separators=(',',':')).encode();s+=b' '*((-len(s))%4);path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(s)+len(binary))+struct.pack('<I4s',len(s),b'JSON')+s+binary)
    write(out/'parts.json',{o.name:len(triangles(o)) for o in bpy.data.objects if o.type=='MESH'})

def run(out,studio,render):
    phase=os.environ.get('DISPLAY2_PHASE','all')
    os.environ['TOY_DISPLAY2_OUT']=str(out)
    if phase in ['all','inspect']:
        exec(compile((HERE/'display2_inspect.py').read_text(),str(HERE/'display2_inspect.py'),'exec'),{'__file__':str(HERE/'display2_inspect.py')})
        subprocess.run([str(WORK/'venv-geo/bin/python'),str(HERE/'display2_components.py')],check=True)
    if phase in ['all','build']:finish(out)
    if phase in ['all','compress']:
        for name,size,mixed in [('2048-q75',2048,False),('3072-q75',3072,False),('final',2048,True)]:
            dest=out/name;dest.mkdir(exist_ok=True)
            env=os.environ.copy();env.update(TOY_EXPORT_OUT=str(dest),TOY_TEXTURE_SIZE=str(size),TOY_TEXTURE_QUALITY='75',TOY_MIXED='1' if mixed else '0',TOY_DISPLAY_SCRIPT=str(HERE/'display2_compress.mjs'))
            with (out/('compress-'+name+'.log')).open('w') as stdout:
                subprocess.run(['pnpm','dlx','--package=@gltf-transform/cli@4.5.1','--package=gltf-validator','-c','node "$TOY_DISPLAY_SCRIPT"'],check=True,env=env,stdout=stdout,stderr=subprocess.STDOUT)
        import shutil
        shutil.copy2(out/'final/character.glb',out/'character.glb')
