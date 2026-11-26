"""Close internal B hair rims, unwrap and rebake without an inner cap."""
import collections
import hashlib
import itertools
import json
import os
import subprocess
from pathlib import Path
import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import WORK, coords, triangles, activate, subset, write
from lowpoly_verify import topology, visible
from hair import log, save, PYTHON, preserved_fields, hashes
from hair2 import bake_image, target_copy, BACKING
from hair3 import NAMES, views, cap_mask
import hair_review as review
import lowpoly9 as p9
import bake

HERE=Path(__file__).resolve().parent
OLD=WORK/'hair3'


def external(out,phase):
    subprocess.run([str(PYTHON),str(HERE/'hair4_images.py'),str(out),phase],check=True)


def boundary_paths(bm):
    # Walk a face fan at pinched vertices instead of merging touching holes.
    remaining={e.link_loops[0] for e in bm.edges if e.is_boundary};paths=[]
    while remaining:
        start=min(remaining,key=lambda l:l.edge.index);l=start;path=[]
        while l in remaining:
            path.append(l);remaining.remove(l);n=l.link_loop_next;guard=set()
            while not n.edge.is_boundary and n not in guard:
                guard.add(n)
                if len(n.edge.link_faces)!=2:break
                n=n.link_loop_radial_next.link_loop_next
            if not n.edge.is_boundary:break
            l=n
        closed=l==start and path[-1].link_loop_next.vert==start.vert
        # Repeated vertices describe several simple cycles joined at a pinch.
        seq=[q.vert for q in path]+([path[0].vert] if closed else [path[-1].link_loop_next.vert]);stack=[];seen={}
        for v in seq:
            if v in seen:
                k=seen[v];cycle=stack[k:]
                if len(cycle)>=3:paths.append((cycle,True))
                stack=stack[:k];seen={q:i for i,q in enumerate(stack)}
            seen[v]=len(stack);stack.append(v)
        if len(stack)>1:paths.append((stack,False))
    return paths


def rim_triangles(vs, occupied, existing):
    # A projected ngon can choose a diagonal already inside the hair mesh.
    # Dynamic programming forbids these chords and minimizes patch area in 3D.
    n=len(vs);p=np.array([q.co[:] for q in vs]);vid=[q.index for q in vs]
    cost=np.full((n,n),np.inf);split=np.full((n,n),-1,int)
    for i in range(n-1):cost[i,i+1]=0
    for span in range(2,n):
        for i in range(n-span):
            j=i+span
            if not (i==0 and j==n-1) and tuple(sorted((vid[i],vid[j]))) in occupied:continue
            k=np.arange(i+1,j);area=np.linalg.norm(np.cross(p[k]-p[i],p[j]-p[i]),axis=1)*.5
            candidate=cost[i,k]+cost[k,j]+area
            # Nonzero area is required even on a collapsed rim.
            candidate[area<1e-14]=np.inf
            for t,kk in enumerate(k):
                if tuple(sorted((vid[i],vid[int(kk)],vid[j]))) in existing:candidate[t]=np.inf
            best=int(np.argmin(candidate))
            if np.isfinite(candidate[best]):cost[i,j]=candidate[best];split[i,j]=k[best]
    if split[0,n-1]<0:return []
    result=[];todo=[(0,n-1)]
    while todo:
        i,j=todo.pop()
        if j-i<2:continue
        k=int(split[i,j]);result.append([vid[j],vid[k],vid[i]]);todo.extend([(i,k),(k,j)])
    return result


def geometry(out):
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'character-hair3.blend'));review.setup()
    inputs=[OLD/'character-hair3.blend',WORK/'hair2/character-hair2.blend',WORK/'hair/baked-checkpoint.blend',WORK/'hair/source.npz',WORK/'hair/B-full.npz']
    write(out/'input-hashes.json',{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs})
    baseline={n:hashes(preserved_fields(bpy.data.objects[n])) for n in NAMES if n!='hair_B'}
    o=bpy.data.objects['hair_B'];v=coords(o).copy();f=triangles(o).copy();weights=[[(g.group,g.weight) for g in q.groups] for q in o.data.vertices]
    bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.verts.index_update();bm.edges.index_update();paths=boundary_paths(bm)
    paths.sort(key=lambda q:-sum((a.co-b.co).length for a,b in zip(q[0],q[0][1:]+q[0][:1])))
    rows=[];existing={tuple(sorted(q.vertices)) for q in o.data.polygons};added=[]
    for i,(vs,closed) in enumerate(paths):
        p=np.array([q.co[:] for q in vs]);length=sum((a.co-b.co).length for a,b in zip(vs,vs[1:]+vs[:1]));center=p.mean(0)
        reason=('生え際・もみあげ・えり足を結ぶ主境界' if i==0 else '首元・もみあげ・えり足の下端' if p[:,2].max()<.82 else '前側の生え際の小境界' if center[2]<.86 and center[1]<-.11 else '非多様体辺で終わる開いた鎖' if not closed else None)
        row={'id':i,'vertices':[q.index for q in vs],'closed':closed,'perimeter_mm':length*1000,'bounds_m':[p.min(0).tolist(),p.max(0).tolist()],'center_m':center.tolist(),'reason':reason,'action':'retain' if reason else 'fill','added_triangles':0}
        if reason is None:
            occupied={tuple(sorted((e.verts[0].index,e.verts[1].index))) for e in bm.edges}
            for ids in rim_triangles(vs,occupied,existing):
                key=tuple(sorted(ids))
                if key in existing:raise RuntimeError('Duplicate patch triangle')
                face=bm.faces.new([bm.verts[j] for j in ids]);face.smooth=True;face.material_index=0;existing.add(key);added.append(ids);row['added_triangles']+=1
            if row['added_triangles']==0:row['action']='retain';row['reason']='既存の面・辺を囲む輪（重複面・非多様体辺は足さない）'
        rows.append(row)
    bm.to_mesh(o.data);bm.free();o.data.update()
    # Original vertices, triangles and weights are unchanged; only faces append.
    assert np.array_equal(coords(o),v)
    assert np.array_equal(triangles(o)[:len(f)],f)
    assert weights==[[(g.group,g.weight) for g in q.groups] for q in o.data.vertices]
    assert not cap_mask(bpy.data.objects['hair_preserved_head']).any()
    np.savez(out/'boundary-input.npz',V=v,F=f,boundary_vertices=np.unique([j for r in rows for j in r['vertices']]),patch_faces=np.array(added,int))
    assert sum(len(r['vertices']) if r['closed'] else len(r['vertices'])-1 for r in rows)==1816
    assert topology(o)['boundary_edges']==sum(len(r['vertices']) if r['closed'] else len(r['vertices'])-1 for r in rows if r['action']=='retain')
    assert topology(o)['edges_shared_by_3_or_more_faces']==22
    report={'before':{'triangles':len(f),'boundary_edges':1816},'after':topology(o),'filled_loops':sum(r['action']=='fill' for r in rows),'retained_paths':sum(r['action']=='retain' for r in rows),'added_triangles':len(added),'new_vertices':0,'original_positions_faces_weights_exact':True,'loops':rows,'classification':'Longest rim is the intentional hairline/sideburn/nape boundary. Detached lower rims with max Z <0.82m and front hairline rims with mean Z <0.86m and mean Y <-0.11m are retained. Other closed rims are internal holes. Open nonmanifold chains and existing-face rims are retained explicitly. Length is reported, never used alone as a hole threshold.','preserved_body_head':baseline}
    write(out/'geometry.json',report);save(out,'geometry-checkpoint.blend');log(out,f"輪を塞いだ数 {report['filled_loops']}、追加 {len(added)} 三角形、境界辺 {report['after']['boundary_edges']}")


def diagnose(out):
    external(out,'diagnose')
    d=np.load(out/'diagnosis-samples.npz');src=np.load(WORK/'hair/source.npz');v=src['V'];f=src['F'];tree=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True)
    dirs=[Vector(q).normalized() for q in itertools.product([-1,0,1],repeat=3) if any(q)]
    ids=d['source_face'];unique=np.unique(ids);vis={};direction_counts=np.zeros(26,int)
    for fi in unique:
        p=Vector(v[f[fi]].mean(0));hits=[]
        for k,direction in enumerate(dirs):
            hit,_,_,_=tree.ray_cast(p+direction*2,-direction,2.000002)
            hits.append(hit is not None and (hit-p).length<=2e-6)
        vis[int(fi)]=hits;direction_counts+=np.array(hits,int)
    counts=collections.Counter();uvcounts=collections.Counter()
    for fi,lab in zip(ids,d['labels']):counts[f'label_{lab}_'+('visible' if any(vis[int(fi)]) else 'hidden')]+=1
    for fi in unique:uvcounts[f'label_{src["labels"][fi]}_'+('visible' if any(vis[int(fi)]) else 'hidden')]+=1
    full=np.load(WORK/'hair/B-full.npz');fv=full['V'];ff=full['F'];ftree=BVHTree.FromPolygons(fv.tolist(),ff.tolist(),all_triangles=True)
    removed_vis=collections.Counter();full_direction_counts=np.zeros(26,int)
    for idx,lab in zip(d['full_face'],d['labels']):
        point=Vector(fv[ff[idx]].mean(0));hits=[]
        for direction in dirs:
            hit,_,_,_=ftree.ray_cast(point+direction*2,-direction,2.000002)
            hits.append(hit is not None and (hit-point).length<=2e-6)
        full_direction_counts+=np.array(hits,int);removed_vis[f'label_{lab}_'+('visible' if any(hits) else 'hidden')]+=1
    result=json.loads((out/'diagnosis.json').read_text());result.update(removed_filled_head_faces_visibility=dict(removed_vis),visible_removed_faces_by_direction=full_direction_counts.tolist(),removed_face_nearest_source_label_and_visibility=dict(counts),unique_source_faces=dict(uvcounts),visible_unique_faces_by_direction=direction_counts.tolist(),directions=[list(q) for q in dirs],visibility_method='Original source triangle centroid; first hit from 2m in each of 26 normalized grid directions, within 2 micrometers; full original head occludes rays, no separate cap. Counts are faces, not area.');write(out/'diagnosis.json',result);log(out,'見立ての検証 '+json.dumps(result,ensure_ascii=False))


def uv(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'geometry-checkpoint.blend'));o=bpy.data.objects['hair_B'];folder=out/'B';folder.mkdir(exist_ok=True)
    old=o.name;o.name='low10_head_uv_hair';a=o.data.attributes.get('head_region') or o.data.attributes.new('head_region','INT','FACE');a.data.foreach_set('value',np.ones(len(o.data.polygons),np.int32));bake.uv_seams(o);o.name=old
    history=[]
    for attempt in range(30):
        activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.select_all(action='SELECT');bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=8/4096,shape_method='CONCAVE');bpy.ops.object.mode_set(mode='OBJECT')
        np.savez(folder/'uv-fields.npz',uv=np.array([q.uv[:] for q in o.data.uv_layers.active.data]).reshape(-1,3,2),V=coords(o),F=triangles(o))
        subprocess.run([str(PYTHON),str(HERE/'hair_images.py'),str(folder),'uv'],check=True);metric=json.loads((folder/'uv-metrics.json').read_text());history.append(metric);write(folder/'uv-history.json',history)
        bad=np.load(folder/'uv-bad-faces.npy')
        if not len(bad):break
        chart=np.load(folder/'chart.npy');cent=coords(o)[triangles(o)].mean(1);cuts=np.zeros(len(cent),int)
        for cid in np.unique(chart[bad]):
            ids=np.flatnonzero(chart==cid)
            if len(ids)<12:cuts[ids]=np.arange(1,len(ids)+1)
            else:
                axis=np.ptp(cent[ids],axis=0).argmax();cuts[ids]=1+(cent[ids,axis]>np.median(cent[ids,axis]))
        bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
        for e in bm.edges:
            if len(e.link_faces)==2 and cuts[e.link_faces[0].index]!=cuts[e.link_faces[1].index]:e.seam=True
        bm.to_mesh(o.data);bm.free();activate(o);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=0);bpy.ops.object.mode_set(mode='OBJECT')
    else:raise RuntimeError('UV overlaps remain')
    assert metric['min_gap_px_2048']>=7.5
    save(out,'uv-checkpoint.blend')


def transfer(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'));review.setup();low=bpy.data.objects['hair_B'];target=target_copy(low)
    with bpy.data.libraries.load(str(WORK/'hair/baked-checkpoint.blend'),link=False) as (_,data):data.objects=['bake_high_head']
    high=data.objects[0];bpy.context.collection.objects.link(high);labels=np.array([q.value for q in high.data.attributes['part2'].data]);keep=(labels==1)&np.array([high.data.materials[p.material_index].name!=BACKING for p in high.data.polygons])
    for kind in ['mask','color','normal','roughness','metallic']:
        source=subset(high,keep,'hair4_source');image=bake_image(out/'B',target,source,kind);bpy.data.images.remove(image);bpy.data.objects.remove(source,do_unlink=True);log(out,kind+' 4096px転写（キャップ・裏打ちなし）')
    subprocess.run([str(PYTHON),str(HERE/'hair_images.py'),str(out/'B'),'finish'],check=True)
    bpy.ops.wm.open_mainfile(filepath=str(out/'uv-checkpoint.blend'));review.setup();low=bpy.data.objects['hair_B'];mat=low.data.materials[0].copy();mat.name='Hair B closed holes baked 2048'
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.label in ['basecolor','normal','roughness','metallic']:
            image=bpy.data.images.load(str(out/'B'/(node.label+'.png')),check_existing=False);image.colorspace_settings.name='sRGB' if node.label=='basecolor' else 'Non-Color';image.pack();node.image=image
    low.data.materials[0]=mat;visible([bpy.data.objects[n] for n in NAMES]);save(out,'character-hair4.blend')


def render(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair4.blend'));scene,cam,rig=review.setup();objs=[bpy.data.objects[n] for n in NAMES]
    for name,pose,angle,target,height,demo in views():p9.pose(rig,pose);p9.shot(out,cam,f'{name}-hair4.png',objs,angle,target,height,demo)
    from lowpoly2 import reset_pose
    reset_pose(rig);masks=review.make_semantic_sets({'hair4':objs})['hair4'];scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=16
    for a in review.ANGLES:p9.shot(out,cam,f'mask-face-{a}-hair4.png',masks,a,target=(0,-.03,.84),height=.38)
    p9.shot(out,cam,'mask-demo-rest-hair4.png',masks,target=(0,0,.5),height=1.25,demo=True)
    from hair3_visibility import sided
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair4.blend'));scene,cam,rig=review.setup();objs=[bpy.data.objects[n] for n in NAMES]
    for o in objs:
        for i in range(len(o.data.materials)):
            front,back=((0,1,0),(1,0,1)) if o.name=='hair_B' else (((1,1,0),(1,0,0)) if o.name=='hair_preserved_head' else ((0,0,1),(0,0,1)))
            o.data.materials[i]=sided('hair4 sides '+o.name+str(i),front,back)
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.eevee.taa_render_samples=16
    for name,pose,angle,target,height,demo in views():p9.pose(rig,pose);p9.shot(out,cam,f'sides-{name}-hair4.png',objs,angle,target,height,demo)


def verify(out):
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair4.blend'));review.setup();d=np.load(out/'boundary-input.npz');o=bpy.data.objects['hair_B'];g=json.loads((out/'geometry.json').read_text());assert np.array_equal(coords(o),d['V']);assert np.array_equal(triangles(o)[:len(d['F'])],d['F'])
    assert {n:hashes(preserved_fields(bpy.data.objects[n])) for n in NAMES if n!='hair_B'}==g['preserved_body_head']
    assert not cap_mask(bpy.data.objects['hair_preserved_head']).any()
    inputs=json.loads((out/'input-hashes.json').read_text())
    assert all(hashlib.sha256((WORK/n).read_bytes()).hexdigest()==h for n,h in inputs.items())
    top=topology(o);write(out/'verification.json',{'original_hair_positions_faces_exact':True,'body_head_fields_exact':True,'no_cap':True,'input_hashes_unchanged':True,'topology':top,'total_triangles':sum(len(triangles(bpy.data.objects[n])) for n in NAMES),'uv':json.loads((out/'B/uv-metrics.json').read_text())})


def run(out,studio,unused_render):
    phase=os.environ.get('HAIR4_PHASE','all');log(out,'開始 '+phase)
    for name,fn in [('geometry',geometry),('diagnose',diagnose),('uv',uv),('transfer',transfer),('render',render),('verify',verify)]:
        if phase in ['all',name]:fn(out)
    if phase in ['all','measure']:external(out,'measure')
