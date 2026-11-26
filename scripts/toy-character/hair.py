"""Hair-only A/B reconstruction. Resume with HAIR_PHASE; stage 7 stays read-only."""
import hashlib
import itertools
import json
import os
from pathlib import Path
import subprocess
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import WORK, activate, coords, triangles, subset, mesh_obj, recalc, write
from lowpoly2 import reset_pose
from lowpoly_verify import topology, visible
import lowpoly3 as p3
import lowpoly9 as p9
import bake

HERE=Path(__file__).resolve().parent
PYTHON=WORK/'venv-geo/bin/python'
SOURCE=WORK/'bake/character-bake.blend'


def log(out,message):
    print('HAIR',message,flush=True)
    with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def external(out,phase):
    subprocess.run([str(PYTHON),str(HERE/'hair_images.py'),str(out),phase],check=True)


def save(out,name):
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/name))


def preserved_fields(o,keep=None):
    f=triangles(o);uv=np.array([u.uv[:] for u in o.data.uv_layers.active.data]).reshape(-1,3,2)
    cn=np.array([tuple(n.vector) for n in o.data.corner_normals]).reshape(-1,3,3)
    if keep is None:keep=np.ones(len(f),bool)
    # Coordinates by corner make a subset independent of vertex renumbering.
    return {'position':coords(o)[f[keep]],'normal':cn[keep],'uv':uv[keep],
            'smooth':np.array([p.use_smooth for p in o.data.polygons])[keep]}


def hashes(fields):return {k:hashlib.sha256(v.tobytes()).hexdigest() for k,v in fields.items()}


def prepare(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    head=bpy.data.objects['low10_head'];lab=bake.labels(head);keep=lab!=1
    baseline={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'body_signature':bake.signature(bpy.data.objects['low6_body']),
              'body_fields':hashes(preserved_fields(bpy.data.objects['low6_body'])),'head_without_hair_fields':hashes(preserved_fields(head,keep)),
              'rig':bake.rig_signature(rig),'stage7_images':{n:hashlib.sha256((WORK/'bake'/n).read_bytes()).hexdigest() for n in ['basecolor.png','normal.png','roughness.png','metallic-roughness.png']}}
    write(out/'baseline.json',baseline)
    preserved=subset(head,keep,'hair_preserved_head');cn=preserved_fields(head,keep)['normal'];preserved.data.normals_split_custom_set(cn.reshape(-1,3).tolist())
    after=preserved_fields(preserved);before=preserved_fields(head,keep);delta={k:float(np.max(np.abs(after[k].astype(float)-before[k].astype(float)))) for k in before};write(out/'subset-errors.json',delta)
    assert all(delta[k]==0 for k in ['position','uv','smooth']) and delta['normal']<.002
    high=bpy.data.objects['bake_high_head'];hl=np.array([a.value for a in high.data.attributes['part2'].data]);v=coords(high);f=triangles(high)
    np.savez(out/'source.npz',V=v,F=f,labels=hl)
    log(out,f'入力: 高密度頭 {len(f)} 三角形、髪 {int((hl==1).sum())}。体・顔・キャップ・元画像を保持し、髪だけ別2048px画像にする。')
    external(out,'solid')
    full=np.load(out/'B-full.npz');outer=mesh_obj('diagnostic_closed_head',full['V'],full['F']);recalc(outer,True);outertree=BVHTree.FromPolygons(coords(outer).tolist(),triangles(outer).tolist(),all_triangles=True)
    a=subset(high,hl==1,'hair_A');a.modifiers.clear();a.parent=None
    before=topology(a);bm=bmesh.new();bm.from_mesh(a.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bm.to_mesh(a.data);bm.free();a.data.update();welded=topology(a)
    # Test the intact head, without the artificial inner cap. A ray arriving
    # from outside must reach this face, rather than escape through its back.
    tree=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True);p=coords(a);af=triangles(a);c=p[af].mean(1);normal=np.cross(p[af[:,1]]-p[af[:,0]],p[af[:,2]]-p[af[:,0]]);normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-20)
    directions=[Vector(d).normalized() for d in itertools.product([-1,0,1],repeat=3) if any(d)];exposed=np.zeros(len(af),bool)
    for i,point in enumerate(c):
        q=Vector(point);_,outward,_,_=outertree.find_nearest(q)
        if Vector(normal[i]).dot(outward)>=0:exposed[i]=True;continue
        for d in [Vector(normal[i]),-Vector(normal[i])]+directions:
            hit,_,_,_=tree.ray_cast(q+d*2,-d,2.000002)
            if hit is not None and (hit-q).length<2e-6:exposed[i]=True;break
        if i%50000==0:log(out,f'A 外からの可視判定 {i}/{len(af)}')
    bm=bmesh.new();bm.from_mesh(a.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.flatnonzero(~exposed)],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(a.data);bm.free();a.data.update();exterior=topology(a);save(out,'A-before-collapse.blend');reduce(a)
    report={'before':before,'welded':welded,'exterior':exterior,'hidden_faces_removed':int((~exposed).sum()),'after':topology(a),'visibility':'outer-facing source faces kept; only inward-facing relative to nearest filled-head normal can be removed; centroid first hit from infinity: 26 grid directions + both face normals, 2um tolerance; intact original head excludes cap','weld_tolerance_m':1e-7}
    write(out/'A-geometry.json',report);log(out,'A 減面 '+json.dumps(report,ensure_ascii=False))
    bpy.data.objects.remove(outer,do_unlink=True)
    d=np.load(out/'B-filled.npz');b=mesh_obj('hair_B',d['V'],d['F']);recalc(b,True);reduce(b)
    # The added transition strip follows nearest existing skin, 1mm beneath it.
    # Only a measured 3mm boundary band is blended, never the face itself.
    skin=subset(high,hl==0,'hair_diagnostic_skin');sv=coords(skin);sf=triangles(skin);st=BVHTree.FromPolygons(sv.tolist(),sf.tolist(),all_triangles=True)
    bm=bmesh.new();bm.from_mesh(b.data);rim={v for e in bm.edges if e.is_boundary for v in e.verts};distance={v:0. for v in rim};queue=list(rim)
    import heapq
    heap=[(0.,v.index,v) for v in rim];heapq.heapify(heap);moved=0
    while heap:
        dist,_,vert=heapq.heappop(heap)
        if dist!=distance[vert]:continue
        for e in vert.link_edges:
            w=e.other_vert(vert);nd=dist+e.calc_length()
            if nd<.003 and nd<distance.get(w,1e9):distance[w]=nd;heapq.heappush(heap,(nd,w.index,w))
    for vert,dist in distance.items():
        point,n,_,dd=st.find_nearest(vert.co)
        if dd is not None and dd<.012:
            vert.co=vert.co.lerp(point-n*.001,1-dist/.003);moved+=1
    bm.to_mesh(b.data);bm.free();reduce(b);bpy.data.objects.remove(skin,do_unlink=True)
    write(out/'B-geometry.json',{'after':topology(b),'boundary_band_m':.003,'skin_inset_m':.001,'boundary_band_vertices_adjusted':moved,'solid':json.loads((out/'solid.json').read_text())});log(out,'B 減面・生え際の重ね '+json.dumps(topology(b)))
    for o in [a,b]:
        p3.rigid(o,'head');p3.attach_armature(o,rig)
        np.savez(out/(o.name+'-geometry.npz'),V=coords(o),F=triangles(o))
    save(out,'geometry-checkpoint.blend')


def reduce(o):
    o.modifiers.clear();o.parent=None
    for attempt in range(8):
        count=len(triangles(o))
        if count<=15000:break
        activate(o);m=o.modifiers.new('Hair 15000 Collapse','DECIMATE');m.decimate_type='COLLAPSE';m.ratio=min(1.,(15000-attempt)/count);m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name);recalc(o,True)
        print(o.name,'Collapse',count,'->',len(triangles(o)),flush=True)
        if len(triangles(o))==count:
            from lowpoly2 import split_surface_fans
            split_surface_fans(o,remove_small=False)
    # Collapse can leave coincident/zero-area triangles on thin generated sheets.
    bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.verts.index_update();seen=set();drop=[]
    for q in bm.faces:
        key=tuple(sorted(v.index for v in q.verts))
        if key in seen or q.calc_area()<1e-14:drop.append(q)
        else:seen.add(key)
    if drop:bmesh.ops.delete(bm,geom=drop,context='FACES_ONLY')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(o.data);bm.free();recalc(o,True)
    assert len(triangles(o))<=15000


def uv_prepare(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'geometry-checkpoint.blend'))
    for tag in ['A','B']:
        folder=out/tag;folder.mkdir(exist_ok=True);o=bpy.data.objects['hair_'+tag];old=o.name
        # Reuse the exact semantic/back-path seam and angle-based method of 7.
        o.name='low10_head_uv_hair';attr=o.data.attributes.get('head_region') or o.data.attributes.new('head_region','INT','FACE');attr.data.foreach_set('value',np.ones(len(o.data.polygons),np.int32));bake.uv_seams(o);o.name=old
        history=[]
        for attempt in range(25):
            activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=8/4096,shape_method='CONCAVE');bpy.ops.object.mode_set(mode='OBJECT')
            np.savez(folder/'uv-fields.npz',uv=np.array([u.uv[:] for u in o.data.uv_layers.active.data]).reshape(-1,3,2),V=coords(o),F=triangles(o));external(folder,'uv');metric=json.loads((folder/'uv-metrics.json').read_text());history.append(metric)
            bad=np.load(folder/'uv-bad-faces.npy')
            if not len(bad):break
            chart=np.load(folder/'chart.npy');p=coords(o);f=triangles(o);cent=p[f].mean(1);cuts=np.zeros(len(f),int)
            for cid in np.unique(chart[bad]):
                ids=np.flatnonzero(chart==cid)
                if len(ids)<12:cuts[ids]=np.arange(1,len(ids)+1)
                else:
                    axis=int(np.ptp(cent[ids],axis=0).argmax());cuts[ids]=1+(cent[ids,axis]>np.median(cent[ids,axis]))
            bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
            for e in bm.edges:
                if len(e.link_faces)==2 and cuts[e.link_faces[0].index]!=cuts[e.link_faces[1].index]:e.seam=True
            bm.to_mesh(o.data);bm.free();activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=0);bpy.ops.object.mode_set(mode='OBJECT')
        else:raise RuntimeError('Hair UV remains overlapping')
        write(folder/'uv-history.json',history);log(out,tag+' UV '+json.dumps(metric));assert metric['min_gap_px_2048']>=7.5
    save(out,'uv-checkpoint.blend')


def transfer(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'));scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;high=bpy.data.objects['bake_high_head'];hl=np.array([a.value for a in high.data.attributes['part2'].data])
    for tag in ['A','B']:
        folder=out/tag;low=bpy.data.objects['hair_'+tag];target=subset(low,np.ones(len(low.data.polygons),bool),'hair_transfer_target');target.modifiers.clear();target.parent=None;highpart=subset(high,hl==1,'hair_transfer_source');target.data.materials.clear();mat=bpy.data.materials.new('Hair target '+tag);mat.use_nodes=True;target.data.materials.append(mat)
        for q in target.data.polygons:q.material_index=0
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');mat.node_tree.nodes.active=node;mats=list(highpart.data.materials);indices=[q.material_index for q in highpart.data.polygons]
        for kind in os.environ.get('HAIR_BAKE_KINDS','mask,color,normal,roughness,metallic').split(','):
            highpart.data.materials.clear()
            for m in mats:highpart.data.materials.append(m)
            for q,k in zip(highpart.data.polygons,indices):q.material_index=k
            if kind!='normal':bake.emission(highpart,kind)
            image=bpy.data.images.new('Hair transfer '+kind,width=4096,height=4096,alpha=True);image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color';image.generated_color=(0,0,0,0);node.image=image
            visible([target,highpart]);activate(target);highpart.select_set(True)
            bpy.ops.object.bake(type='NORMAL' if kind=='normal' else 'EMIT',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z',use_selected_to_active=True,use_cage=False,cage_extrusion=.003,max_ray_distance=.005,margin=0,use_clear=True)
            image.filepath_raw=str(folder/(kind+'-raw.png'));image.file_format='PNG';image.save();node.image=None;bpy.data.images.remove(image);log(out,tag+' '+kind+' 4096px転写、3mm extrusion / 5mm max ray')
        bpy.data.objects.remove(target,do_unlink=True);bpy.data.objects.remove(highpart,do_unlink=True)
        external(folder,'finish')
    save(out,'transfer-checkpoint.blend')


def finish(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'))
    for tag in ['A','B']:
        o=bpy.data.objects['hair_'+tag];p3.rigid(o,'head');p3.attach_armature(o,bpy.data.objects['temporary_rig']);mat=bpy.data.materials.new('Hair '+tag+' baked 2048');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=0
        for kind,socket in [('basecolor','Base Color'),('roughness','Roughness'),('metallic','Metallic'),('normal',None)]:
            image=bpy.data.images.load(str(out/tag/(kind+'.png')),check_existing=False);image.colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color';image.pack();n=nodes.new('ShaderNodeTexImage');n.image=image;n.label=kind
            if socket:links.new(n.outputs['Color'],bs.inputs[socket])
            else:
                normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='BakeUV';links.new(n.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        o.data.materials.clear();o.data.materials.append(mat)
        for q in o.data.polygons:q.material_index=0
    save(out,'baked-checkpoint.blend');log(out,'A/B の髪専用2048px画像を同梱。体・顔・キャップには工程7の材質を保持。')


def run(out,studio,render):
    phase=os.environ.get('HAIR_PHASE','all');log(out,'開始 '+phase)
    for name,fn in [('prepare',prepare),('uv',uv_prepare),('transfer',transfer),('finish',finish)]:
        if phase in ['all',name]:fn(out)
    if phase in ['all','render','measure','verify']:
        from hair_review import run_review
        run_review(out,phase)
